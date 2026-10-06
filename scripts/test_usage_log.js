// API 사용량 기록(shared/usage-log.js + callClaudeApi) — 가짜 응답으로 검증(유료 호출 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS, ROOT } = require('./run_tests.js');

module.exports = async function () {
  const sb = makeSandbox();
  const KEY = 'sk-ant-test-SECRET-should-never-be-logged';
  const SECRET_TEXT = '원고고유문장_절대_기록되면_안됨';
  // 가짜 Messages API: 같은 system 접두부 → 첫 호출은 캐시 쓰기, 이후 읽기. 2번째 배치는 429 한 번 뒤 성공, 마지막 호출은 네트워크 오류
  let n = 0;
  const seenPrefix = new Set();
  sb.fetch = async (url, init) => {
    n++;
    const b = JSON.parse(init.body);
    assert(!JSON.stringify(b).includes('undefined'));
    if (n === 3) return { ok: false, status: 429, json: async () => ({ error: { message: 'rate_limit_error: too many requests' } }) };
    if (b.messages[0].content.includes('네트워크')) throw new Error('Failed to fetch');
    const sysFirst = b.system && b.system[0] && b.system[0].text || '';
    const hit = seenPrefix.has(sysFirst); seenPrefix.add(sysFirst);
    const usage = { input_tokens: 900, cache_creation_input_tokens: hit ? 400 : 3400, cache_read_input_tokens: hit ? 3000 : 0, output_tokens: 500,
      cache_creation: { ephemeral_5m_input_tokens: hit ? 400 : 3400, ephemeral_1h_input_tokens: 0 } };
    return { ok: true, status: 200, json: async () => ({ model: b.model, stop_reason: 'end_turn', usage, content: [{ type: 'text', text: '{"issues":[]}' }] }) };
  };
  for (const s of SCRIPTS) if (fs.existsSync(path.join(ROOT, s)) && !/api-keys/.test(s)) loadScript(sb, s);
  const U = sb.UsageLog, P8 = sb.__p8Eval;
  assert(U && P8, 'UsageLog·panel8 loaded');
  U.clearAll();

  // 교정 실행: 15쪽 → 5쪽씩 3배치 (배치마다 달라지는 규칙 참고 블록이 붙는 실제 구조)
  // 배치마다 다른 교정 주제어 → 배치마다 다른 규칙 참고(RAG)가 붙는 실제 상황
  const TOPIC = ['메뉴 버튼을 클릭하고 대화상자의 탭을 엽니다. ', '쌍점과 가운뎃점, 줄표와 빗금을 씁니다. ', '외래어 애플리케이션 콘텐츠 메시지 서비스를 씁니다. '];
  const pages = Array.from({ length: 15 }, (_, i) => ({ page: i + 1, text: (i === 0 ? SECRET_TEXT + ' ' : '') + '쪽 ' + (i + 1) + ' 본문입니다. ' + TOPIC[Math.floor(i / 5)].repeat(15), lines: [], headings: [] }));
  const run = U.begin('교정 도우미 — 교정 실행', { file: 'test.docx' });
  const r = await P8.checkLinguistic({ filename: 't', total_pages: 15, pages, toc: [] }, KEY, () => {}, () => {});
  assert.equal(r.failedBatches, 0);
  U.end(run);
  // 실행 밖 단독 호출 — 네트워크 오류(사용량 미확인)
  await sb.callClaudeApi({ apiKey: KEY, prompt: '네트워크 오류 시험', model: 'claude-sonnet-4-6', usage: { task: '단독 시험' } }).catch(() => {});

  const calls = U.callsOf(run);
  assert.equal(calls.length, 4, '3 batches + 1 retry = 4 HTTP requests');
  const retry = calls.find(c => c.attempt === 1);
  assert(retry && /429|rate/.test(retry.retryReason) && retry.ok, 'retry recorded with reason');
  const failed = calls.find(c => !c.ok);
  assert(failed && failed.status === 429 && failed.usage === null, 'failed request: usage unknown, not 0');
  assert(calls.every(c => c.task === 'AI 교정 검사' && /^\d+\/3$/.test(c.batch) && c.model === 'claude-sonnet-4-6'));

  const s = U.summarize(run);
  assert.equal(s.calls, 4); assert.equal(s.retries, 1); assert.equal(s.missing, 1); assert.equal(s.ok, 3);
  // 비용: Sonnet 4.6 — 입력 $3, 쓰기 5분 $3.75, 읽기 $0.30, 출력 $15 (100만 토큰당). 첫 호출 쓰기 3400, 이후 쓰기 400 + 읽기 3000
  const M = 1e6;
  const expect = 3 * 900 * 3 / M + (3400 + 400 + 400) * 3.75 / M + (3000 * 2) * 0.30 / M + 3 * 500 * 15 / M;
  assert(Math.abs(s.cost.total - expect) < 1e-9, `cost ${s.cost.total} vs ${expect}`);
  assert(Math.abs(s.cost.noCache - ((3 * 900 + 4200 + 6000) * 3 / M + 3 * 500 * 15 / M)) < 1e-9, 'counterfactual uses same tokens');
  assert.deepEqual([s.cacheReadCallRatio.num, s.cacheReadCallRatio.den], [2, 3], 'read-call ratio over successful calls with breakpoints');
  assert.deepEqual([s.cacheReadInputRatio.num, s.cacheReadInputRatio.den], [6000, 2700 + 4200 + 6000]);
  // 캐시 진단: 교정 SYS 지점은 같지만, 그 뒤 규칙 참고(배치마다 다름) 다음에 붙는 문체 위생 지점은 매번 다른 접두부 → 경고
  const warn = s.diag.filter(d => d.level === 'warn').map(d => d.msg).join('\n');
  if (process.env.DEBUG_USAGE) console.log(JSON.stringify(s.diag, null, 1), calls.map(c => c.ok && c.prompt.parts.map(p => p.part + (p.cache ? '*' : '') + ':' + p.hash).join(' ')));
  assert(/캐시 지점 2\(system#2\) 앞 내용이 호출마다 다름/.test(warn) && /system#1/.test(warn), warn);
  assert(!/캐시 지점 1\(system#0\) 앞 내용이 호출마다 다름/.test(warn), 'SYS breakpoint is stable');

  // 개인정보: 키·원고 본문은 기록에 없다
  const stored = sb.localStorage.getItem('api_usage_v1');
  assert(!stored.includes('sk-ant') && !stored.includes(SECRET_TEXT), 'no key or manuscript text in log');
  // 네트워크 오류는 단독 호출로, 사용량 미확인
  const adhoc = U.runs().find(x => /단독/.test(x.kind));
  assert(adhoc && U.callsOf(adhoc.id).some(c => c.status === 0 && c.usage === null && /네트워크/.test(c.error)));
  // 요금 모르는 모델은 비용을 비워 둔다(0으로 단정하지 않음)
  assert.equal(U.cost({ model: 'claude-unknown-9', usage: { input: 10, cacheWrite: 0, cacheRead: 0, output: 1 } }), null);
  console.log('PASS: usage log — run/batch/retry ids, unknown usage on failure, official-price cost split, cache ratios with denominators, breakpoint-prefix diagnosis, no key/manuscript in log');
};
