// callClaudeApi 스트리밍(SSE) 조립 — 가짜 스트림으로 검증(유료 호출 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, ROOT } = require('./run_tests.js');

module.exports = async function () {
  const sb = makeSandbox();
  const enc = new TextEncoder();
  const sse = events => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  const stream = text => { // 글자 수 7개씩 잘라 보내 이벤트 경계가 청크 중간에 걸리게 한다
    const bytes = enc.encode(text); let pos = 0;
    return { getReader() { return { read: async () => pos >= bytes.length ? { done: true } : { done: false, value: bytes.slice(pos, pos += 7) } }; } };
  };
  const turn1 = sse([
    ['message_start', { type: 'message_start', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 500, output_tokens: 1 } } }],
    ['content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } }],
    ['content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: '생각…' } }],
    ['content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'SIG' } }],
    ['content_block_stop', { index: 0 }],
    ['content_block_start', { index: 1, content_block: { type: 'server_tool_use', id: 'st1', name: 'web_search', input: {} } }],
    ['content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":' } }],
    ['content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '"llama"}' } }],
    ['content_block_stop', { index: 1 }],
    ['content_block_start', { index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 'st1', content: [{ type: 'web_search_result', url: 'https://a.example', title: 'A' }] } }],
    ['content_block_stop', { index: 2 }],
    ['message_delta', { delta: { stop_reason: 'pause_turn' }, usage: { output_tokens: 150 } }],
    ['message_stop', {}],
  ]);
  const turn2 = sse([
    ['message_start', { type: 'message_start', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1300, cache_creation_input_tokens: 0, cache_read_input_tokens: 700, output_tokens: 1 } } }],
    ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{"results"' } }],
    ['content_block_delta', { index: 0, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://a.example', title: 'A', cited_text: 'LLaMA' } } }],
    ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: ':[]}' } }],
    ['content_block_stop', { index: 0 }],
    ['ping', {}],
    ['message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40, output_tokens_details: { thinking_tokens: 0 }, server_tool_use: { web_search_requests: 1 } } }],
    ['message_stop', {}],
  ]);
  const bodies = [];
  sb.fetch = async (url, init) => { const b = JSON.parse(init.body); bodies.push(b); assert.equal(b.stream, true); return { ok: true, status: 200, body: stream(bodies.length === 1 ? turn1 : turn2) }; };
  loadScript(sb, 'shared/config.js'); loadScript(sb, 'shared/usage-log.js'); loadScript(sb, 'shared/app.js');
  sb.UsageLog.clearAll();
  const r = await sb.callClaudeApi({ apiKey: 'sk-ant-x', prompt: 'q', model: 'claude-sonnet-4-6', maxTokens: 32000, thinking: { type: 'adaptive' }, tools: [{ type: 'web_search_20260209', name: 'web_search' }], full: true, usage: { task: '스트림' } });
  assert.equal(r.text, '{"results":[]}');
  assert.equal(r.searches, 1); assert.equal(r.stopReason, 'end_turn');
  assert.deepEqual(r.sources, [{ url: 'https://a.example', title: 'A', cited: 'LLaMA' }]);
  // 턴 합산: 입력 1000+1300, 캐시 읽기 500+700, 출력 150+40 (중간 이벤트 중복 합산 없음)
  assert.deepEqual(r.usage, { input_tokens: 2300, cache_creation_input_tokens: 200, cache_read_input_tokens: 1200, output_tokens: 190 });
  // pause_turn 이어 받기: 1턴의 블록(thinking signature·도구 입력 파싱 포함)이 assistant로 붙어 2번째 요청에 들어감
  assert.equal(bodies.length, 2);
  const carried = bodies[1].messages[1];
  assert.equal(carried.role, 'assistant');
  assert.deepEqual(carried.content.map(b => b.type), ['thinking', 'server_tool_use', 'web_search_tool_result']);
  assert.equal(carried.content[0].signature, 'SIG'); assert.deepEqual(carried.content[1].input, { query: 'llama' }); assert(!('_json' in carried.content[1]));
  // 사용량 기록: 요청마다 한 건, 출력은 마지막 message_delta 값
  const calls = sb.UsageLog.callsOf(sb.UsageLog.activeRunId());
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(c => [c.part, c.usage.input, c.usage.cacheRead, c.usage.output, c.usage.webSearches, c.stopReason]), [[0, 1000, 500, 150, 0, 'pause_turn'], [1, 1300, 700, 40, 1, 'end_turn']]);
  // 비스트리밍 기본값 유지: thinking·tools 없고 maxTokens 작으면 stream 없음
  sb.fetch = async (url, init) => { const b = JSON.parse(init.body); assert(!('stream' in b)); return { ok: true, status: 200, json: async () => ({ model: b.model, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'ok' }] }) }; };
  assert.equal(await sb.callClaudeApi({ apiKey: 'sk-ant-x', prompt: 'q', model: 'claude-haiku-4-5-20251001' }), 'ok');
  // 스트림 오류 이벤트 → 예외 + 사용량 미확인 기록
  sb.fetch = async () => ({ ok: true, status: 200, body: stream(sse([['message_start', { message: { model: 'm', usage: { input_tokens: 5 } } }], ['error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]])) });
  await assert.rejects(sb.callClaudeApi({ apiKey: 'sk-ant-x', prompt: 'q', stream: true }), /Overloaded/);
  const last = sb.UsageLog.callsOf(sb.UsageLog.activeRunId()).pop();
  assert(!last.ok && last.usage === null && /스트림 중단/.test(last.error));
  console.log('PASS: streaming — SSE assembly, usage merged once per turn, pause_turn carries thinking signature + parsed tool input, citations, non-stream default, stream error');
};
