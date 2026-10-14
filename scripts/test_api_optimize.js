// API 비용·시간 최적화(2026-10-13) — 가짜 API만 사용(유료 호출 없음)
//  A: 교정 AI 검사 제한적 병렬(AI_TUNE.concurrency 1|2)  B: RAG 꼬리 뒤 문체 위생 블록 캐시 표시(AI_TUNE.ragTailCache)  C: effort 선택 전달
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS, ROOT } = require('./run_tests.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x)); // 샌드박스 객체 → 비교용

module.exports = async function () {
  const sb = makeSandbox();
  // 대기 시간(묶음 간 300ms, 재시도 2초·8초)은 요청한 값만 기록하고 실제로는 1/100로 줄여 돈다
  const waits = [];
  sb.setTimeout = (fn, ms) => { waits.push(ms); return setTimeout(fn, (ms || 0) / 100); };
  const realLog = sb.console;
  sb.console = Object.assign({}, realLog, { log() {}, warn() {}, info() {} });
  for (const s of SCRIPTS) if (fs.existsSync(path.join(ROOT, s)) && !/api-keys/.test(s)) loadScript(sb, s);
  const P8 = sb.__p8Eval, T = P8.AI_TUNE;
  assert(T && T.concurrency === 1 && T.ragTailCache === true, '기본값: 동시성 1, RAG 꼬리 캐시 표시 켬(기존 동작)');

  // 30쪽 → 5쪽씩 6묶음. 묶음마다 다른 주제어 → 묶음마다 다른 규칙 참고(RAG)
  const TOPIC = ['메뉴 버튼을 클릭하고 대화상자의 탭을 엽니다. ', '쌍점과 가운뎃점, 줄표와 빗금을 씁니다. ', '외래어 애플리케이션 콘텐츠 메시지 서비스를 씁니다. '];
  const pages = Array.from({ length: 30 }, (_, i) => ({ page: i + 1, text: `고유문장 ${i + 1}번은 여기에 있습니다. ` + TOPIC[Math.floor(i / 5) % 3].repeat(6), lines: [], headings: [] }));
  const ex = () => ({ filename: 't', total_pages: 30, pages: pages.map(p => ({ ...p })), toc: [] });
  const batchOf = body => Math.ceil(+body.messages[0].content.split('[분석 대상]').pop().match(/\[p\.(\d+)\]/)[1] / 5);

  /** 가짜 Messages API. plan(batch, nth) → { delay, status } */
  async function run(conc, plan) {
    T.concurrency = conc;
    const log = { reqs: [], events: [], maxActive: 0, progress: [], errors: [] };
    let active = 0; const seen = {};
    waits.length = 0;
    sb.fetch = async (url, init) => {
      const body = JSON.parse(init.body), b = batchOf(body), nth = (seen[b] = (seen[b] || 0) + 1);
      const p = Object.assign({ delay: 40, status: 200 }, plan ? plan(b, nth) : null);
      active++; log.maxActive = Math.max(log.maxActive, active);
      log.reqs.push({ b, nth, body: init.body }); log.events.push({ t: 'start', b, nth, others: active - 1 });
      await sleep(p.delay);
      active--; log.events.push({ t: 'end', b, nth, status: p.status });
      if (p.status !== 200) return { ok: false, status: p.status, json: async () => ({ error: { message: p.status === 429 ? 'rate_limit_error: too many requests' : 'server error' } }) };
      const first = (b - 1) * 5 + 1; // 묶음의 첫 쪽·마지막 쪽에서 하나씩 '찾은' 척(원문에 있는 구절이어야 통과)
      return { ok: true, status: 200, json: async () => ({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: JSON.stringify({ issues: [
          { type: '오탈자', severity: 'high', found: `고유문장 ${first}번은`, suggestion: `고유 문장 ${first}번은`, description: 'b' + b },
          { type: '띄어쓰기', severity: 'low', found: `고유문장 ${first + 4}번은`, suggestion: `고유 문장 ${first + 4}번은`, description: 'b' + b }] }) }] }) };
    };
    const res = J(await P8.checkLinguistic(ex(), 'sk-ant-fake', (i, n) => log.progress.push([i, n]), e => log.errors.push(e)));
    log.waits = waits.slice();
    T.concurrency = 1;
    return { res, log };
  }
  const bodies = log => log.reqs.slice().sort((a, b) => a.b - b.b || a.nth - b.nth).map(r => r.body);
  const mono = log => log.progress.every(([i, n], k) => n === 6 && i === k + 1);

  // ①②⑥ 동시성 1 ↔ 2: 결과·요청 완전 일치, 첫 묶음 단독, 동시 진행 최대 2, 진행 표시 단조 증가
  const one = await run(1), two = await run(2);
  assert.equal(one.res.totalBatches, 6); assert.equal(one.res.issues.length, 12); assert.equal(one.res.failedBatches, 0);
  assert.deepEqual(one.res.issues.map(i => i.page), [1, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26, 30]);
  assert.deepEqual(two.res, one.res, '동시성 2 결과 = 동시성 1 결과');
  assert.deepEqual(bodies(two.log), bodies(one.log), '묶음별 요청 본문(시스템 블록·사용자 본문) 동일');
  assert.equal(one.log.maxActive, 1, '동시성 1은 한 번에 하나');
  assert.equal(two.log.maxActive, 2, '동시성 2는 최대 2');
  const ev = two.log.events;
  assert(ev[0].t === 'start' && ev[0].b === 1 && ev[1].t === 'end' && ev[1].b === 1, '첫 묶음이 끝난 뒤에야 다음 요청 시작');
  assert(mono(one.log) && mono(two.log), '진행 표시 1..6 순서');
  assert.deepEqual(two.log.reqs.map(r => r.b), [1, 2, 3, 4, 5, 6], '요청 시작은 묶음 순서');
  assert.equal(one.log.waits.filter(ms => ms === 300).length, 5); assert.equal(two.log.waits.filter(ms => ms === 300).length, 5, '시작 간격 300ms 유지(첫 묶음 제외 묶음마다)');
  for (const bad of [0, 3, 'x', null, -1, 2.9]) { T.concurrency = bad; const r = await run(bad); assert(r.log.maxActive <= 2 && r.log.maxActive === (bad === 3 || bad === 2.9 ? 2 : 1), '동시성 값은 1~2로 자름: ' + bad); assert.deepEqual(r.res, one.res); }

  // ③ 응답 지연을 뒤섞어도 결과 순서 동일
  const shuffled = await run(2, b => ({ delay: [0, 10, 120, 10, 80, 2, 40][b] }));
  assert.deepEqual(shuffled.res, one.res, '완료 순서와 무관하게 묶음 순서로 합침');
  assert(shuffled.log.events.filter(e => e.t === 'end').map(e => e.b).join() !== '1,2,3,4,5,6', '실제로 완료 순서가 뒤섞였는지');
  assert(mono(shuffled.log));

  // ④ 중간 묶음 실패(재시도 대상 아님): 그 묶음 쪽만 실패 목록에, 나머지 결과 유지 — 동시성 1과 동일
  const failPlan = b => (b === 3 || b === 5 ? { status: 500, delay: b === 5 ? 1 : 90 } : null);
  const f1 = await run(1, failPlan), f2 = await run(2, failPlan);
  assert.deepEqual(f2.res, f1.res);
  assert.deepEqual(f2.res.failedPages, [11, 12, 13, 14, 15, 21, 22, 23, 24, 25], '실패 쪽 목록은 쪽 순서(늦게 실패한 3묶음이 먼저)');
  assert.equal(f2.res.failedBatches, 2); assert.equal(f2.res.totalBatches, 6);
  assert.deepEqual(f2.res.issues, one.res.issues.filter(i => ![3, 5].includes(Math.ceil(i.page / 5))), '다른 묶음 결과는 그대로');
  assert.equal(f2.log.errors.length, 0, '일부 실패는 전체 오류 콜백을 부르지 않음');
  assert.equal(f2.log.maxActive, 2, '재시도 대상이 아닌 오류는 동시성을 내리지 않음');
  const allFail = await run(2, () => ({ status: 500 }));
  assert(allFail.res.failedBatches === 6 && allFail.res.issues.length === 0 && allFail.log.errors.length === 1 && /500/.test(allFail.log.errors[0]), '전부 실패하면 오류 콜백 1회');

  // ⑤ 429 → 재시도 성공, 이후 남은 묶음은 동시성 1
  const rl = await run(2, (b, nth) => (b === 2 && nth === 1 ? { status: 429, delay: 10 } : null));
  assert.deepEqual(rl.res, one.res, '재시도 성공 뒤 결과 동일');
  assert.equal(rl.log.reqs.filter(r => r.b === 2).length, 2, '2묶음은 두 번 요청');
  assert(rl.log.waits.includes(2000), '기존 재시도 대기(2초) 유지');
  const starts = rl.log.events.filter(e => e.t === 'start');
  assert(starts.filter(e => e.b >= 4).every(e => e.others === 0), '429 뒤 새로 시작하는 묶음은 혼자: ' + JSON.stringify(starts));
  assert(mono(rl.log));
  // 첫 묶음에서 429가 나면 처음부터 끝까지 하나씩
  const rl1 = await run(2, (b, nth) => (b === 1 && nth === 1 ? { status: 429 } : null));
  assert.deepEqual(rl1.res, one.res); assert.equal(rl1.log.maxActive, 1);
  // 재시도까지 모두 429로 실패한 묶음: 실패 목록에 남고 나머지는 하나씩
  const rlFail = await run(2, b => (b === 2 ? { status: 429, delay: 10 } : null));
  assert.deepEqual(rlFail.res.failedPages, [6, 7, 8, 9, 10]); assert.equal(rlFail.log.reqs.filter(r => r.b === 2).length, 3);
  assert(rlFail.log.events.filter(e => e.t === 'start' && e.b >= 4).every(e => e.others === 0));
  // 재시도 대상 오류가 한 번 난 뒤에는 재시도 요청을 포함해 요청이 한 번에 하나만 나간다(진행 중이던 요청은 끝까지 기다림)
  const serialAfter = (log, name) => {
    const k = log.events.findIndex(e => e.t === 'end' && e.status === 429);
    assert(k >= 0, name + ': 429가 실제로 났는지');
    const later = log.events.slice(k + 1).filter(e => e.t === 'start');
    assert(later.length && later.every(e => e.others === 0), name + ': 첫 429 뒤에 시작한 요청은 모두 혼자여야 함 — ' + JSON.stringify(log.events));
  };
  const counts = log => [1, 2, 3, 4, 5, 6].map(b => log.reqs.filter(r => r.b === b).length);
  serialAfter(rl.log, '한쪽 429'); assert.deepEqual(counts(rl.log), [1, 2, 1, 1, 1, 1]);
  assert(rl.log.events.some(e => e.t === 'start' && e.b === 2 && e.nth === 2), '2묶음 재시도 요청이 나감');
  serialAfter(rlFail.log, '재시도 소진'); assert.deepEqual(counts(rlFail.log), [1, 3, 1, 1, 1, 1], '묶음별 요청 = 1 + 재시도, 누락·중복 없음');
  assert.deepEqual(rlFail.res.issues, one.res.issues.filter(i => Math.ceil(i.page / 5) !== 2));
  // 2·3묶음이 동시에 429 → 두 재시도가 겹치지 않는다
  const rlBoth = await run(2, (b, nth) => ((b === 2 || b === 3) && nth === 1 ? { status: 429, delay: 30 } : null));
  assert.deepEqual(rlBoth.res, one.res, '동시 429 뒤에도 결과·순서 동일');
  serialAfter(rlBoth.log, '동시 429'); assert.deepEqual(counts(rlBoth.log), [1, 2, 2, 1, 1, 1]);
  assert(mono(rlBoth.log) && mono(rlFail.log));
  // 동시 429 + 한쪽은 재시도까지 소진
  const rlMix = await run(2, (b, nth) => (b === 2 ? { status: 429, delay: 30 } : b === 3 && nth === 1 ? { status: 429, delay: 30 } : null));
  serialAfter(rlMix.log, '동시 429·한쪽 소진'); assert.deepEqual(counts(rlMix.log), [1, 3, 2, 1, 1, 1]); assert.deepEqual(rlMix.res.failedPages, [6, 7, 8, 9, 10]);
  // 동시성 1의 타이밍은 예전과 같다: 묶음 간 300ms ×5, 재시도 2초 → 8초
  const c1Fail = await run(1, b => (b === 2 ? { status: 429, delay: 5 } : null));
  assert.deepEqual(c1Fail.log.waits.slice().sort((a, b) => a - b), [300, 300, 300, 300, 300, 2000, 8000], '동시성 1 대기 시간 불변: ' + c1Fail.log.waits);
  assert.equal(c1Fail.log.maxActive, 1); assert.deepEqual(c1Fail.res, rlFail.res, '동시성 1과 2의 실패 결과 동일');
  assert.deepEqual(rlFail.log.waits.slice().sort((a, b) => a - b), [300, 300, 300, 300, 300, 2000, 8000], '동시성 2에서도 재시도 대기는 2초 → 8초');
  // 진행 콜백이 던지면 예전처럼 호출자에게 전달(멈춰 서지 않음)
  T.concurrency = 2;
  let late = 0;
  sb.fetch = async (u, init) => { late++; await sleep(20); return { ok: true, status: 200, json: async () => ({ model: 'm', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: '{"issues":[]}' }] }) }; };
  await assert.rejects(P8.checkLinguistic(ex(), 'k', i => { if (i === 3) throw new Error('진행 콜백 오류'); }, () => {}), /진행 콜백 오류/);
  T.concurrency = 1;
  await sleep(150);
  assert.equal(late, 2, '던진 뒤에는 새 묶음을 시작하지 않음(1묶음 + 진행 중이던 2묶음뿐)');

  // ⑦ B: 켬/끔에서 시스템 블록 글자·순서 동일, 마지막 블록의 cache_control만 차이
  const sysOf = log => log.reqs.slice().sort((a, b) => a.b - b.b).map(r => JSON.parse(r.body).system);
  const strip = sys => sys.map(b => ({ type: b.type, text: b.text }));
  const marks = sys => sys.map(b => (b.cache_control ? 1 : 0)).join('');
  const HYG = sb.WRITING_HYGIENE, EPH = { type: 'ephemeral' };
  const on = sysOf(one.log); // 기본(켬) = 기존 동작
  T.ragTailCache = false; const offRun = await run(1); T.ragTailCache = true; // 끔 = 비교 실험 옵션
  const off = sysOf(offRun.log);
  assert.deepEqual(offRun.res, one.res);
  assert.deepEqual(on.map(strip), off.map(strip), '블록 글자·순서 동일');
  off.forEach((sys, k) => {
    assert.equal(sys.length, 4); assert(/^## 📋 교정 규칙 참고\n/.test(sys[2].text) && sys[3].text === HYG, 'SYS → 프로필 → RAG 꼬리 → 문체 위생');
    assert.equal(marks(sys), '1100', '끔(비교 실험): 고정 블록 2곳만 캐시 표시'); assert.equal(marks(on[k]), '1101', '켬(기본): 기존처럼 마지막 블록에도');
    assert.deepEqual(on[k].slice(0, 3), sys.slice(0, 3)); assert.deepEqual(on[k][3], { type: 'text', text: HYG, cache_control: EPH }); assert.deepEqual(sys[3], { type: 'text', text: HYG });
  });
  assert(new Set(off.map(s => s[2].text)).size > 1, '묶음마다 RAG 꼬리가 실제로 다름');
  // A와 B는 독립: 동시성 2 + 끔
  T.ragTailCache = false; const both = await run(2); T.ragTailCache = true;
  assert.deepEqual(bodies(both.log), bodies(offRun.log)); assert.deepEqual(both.res, one.res);
  // 사용자 규칙 우선 경로: 규칙 → SYS → 프로필 → RAG → 문체 위생, 캐시 지점 4(기본) ↔ 3(끔)
  const capture = async fn => { let body; sb.fetch = async (u, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{"issues":[]}' }] }) }; }; await fn(); return body; };
  P8._setUserRules('## 사용자 규칙 A\n- 외래어는 한글로', true);
  const prOn = await capture(() => P8.callClaude('k', '교정:\n본문', 'RAG 꼬리'));
  T.ragTailCache = false; const prOff = await capture(() => P8.callClaude('k', '교정:\n본문', 'RAG 꼬리')); T.ragTailCache = true;
  P8._setUserRules('', false);
  assert.equal(marks(prOff.system), '11100'); assert.equal(marks(prOn.system), '11101'); assert.deepEqual(strip(prOff.system), strip(prOn.system));
  assert(/사용자 교정 규칙 \(최우선 적용\)/.test(prOff.system[0].text) && prOff.system[3].text === '## 📋 교정 규칙 참고\nRAG 꼬리' && prOff.system[4].text === HYG);
  delete prOn.system; delete prOff.system; assert.deepEqual(prOn, prOff, '시스템 블록 밖 본문은 동일');
  // 기본 설정의 교정 요청 본문은 옵션(hygieneCache·effort) 추가 전과 바이트 동일: 같은 블록·같은 인자로 옵션 없이 부른 callClaudeApi 본문과 문자열이 같고, 필드 구성·순서도 그대로
  const d0 = JSON.parse(one.log.reqs[0].body);
  const plain = await capture(() => sb.callClaudeApi({ apiKey: 'k', prompt: d0.messages[0].content, systemBlocks: d0.system.slice(0, 3), model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0, noPersona: true, humanize: true }));
  assert.equal(JSON.stringify(plain), one.log.reqs[0].body, '기본 교정 요청 = 옵션 없는 호출과 바이트 동일');
  assert.deepEqual(Object.keys(d0), ['model', 'max_tokens', 'messages', 'system', 'temperature']);
  assert.deepEqual(d0.system[3], { type: 'text', text: HYG, cache_control: EPH }); assert.equal(d0.max_tokens, 8192); assert.equal(d0.temperature, 0);
  // RAG 꼬리가 없는 경로(전부 고정)는 설정과 무관하게 캐시 표시 유지
  const noRag = await capture(() => P8.callClaude('k', '교정:\n본문', ''));
  T.ragTailCache = false; const noRagOff = await capture(() => P8.callClaude('k', '교정:\n본문', '')); T.ragTailCache = true;
  assert.deepEqual(noRagOff, noRag);
  assert.equal(marks(noRag.system), '111'); assert.deepEqual(noRag.system[2], { type: 'text', text: HYG, cache_control: EPH });
  // 옵션을 주지 않은 다른 호출의 본문은 그대로: systemBlocks 호출·일반 system 호출
  const blocks = [{ type: 'text', text: '고정', cache_control: EPH }, { type: 'text', text: '가변' }];
  const b1 = await capture(() => sb.callClaudeApi({ apiKey: 'k', prompt: 'p', systemBlocks: blocks, model: 'm', maxTokens: 10, temperature: 0 }));
  assert.deepEqual(b1, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'p' }], system: blocks.concat([{ type: 'text', text: HYG, cache_control: EPH }]), temperature: 0 });
  const b2 = await capture(() => sb.callClaudeApi({ apiKey: 'k', prompt: 'p', system: 's', noPersona: true }));
  assert.deepEqual(b2, { model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: 'p' }], system: [{ type: 'text', text: 's\n---\n' + HYG, cache_control: EPH }] });
  const b3 = await capture(() => sb.callClaudeApi({ apiKey: 'k', prompt: 'p', system: 's', noPersona: true, hygieneCache: false }));
  assert.deepEqual(b3, b2, 'hygieneCache는 systemBlocks 호출에만 작용');
  const b4 = await capture(() => sb.callClaudeApi({ apiKey: 'k', prompt: 'p', systemBlocks: blocks, humanize: false, hygieneCache: false }));
  assert.deepEqual(b4.system, blocks, 'humanize:false면 블록을 덧붙이지 않음(기존과 같음)');

  // ⑧ C: 기본은 output_config 없음, 값 주면 전달, thinking·tools·temperature 처리 불변
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }];
  const base = { apiKey: 'k', prompt: 'p', system: 's', noPersona: true, humanize: false, model: 'claude-sonnet-4-6', maxTokens: 32000, thinking: { type: 'adaptive' }, tools, temperature: 0, stream: false };
  const c0 = await capture(() => sb.callClaudeApi(base));
  assert(!('output_config' in c0) && !('temperature' in c0) && c0.thinking.type === 'adaptive' && c0.tools.length === 1 && c0.max_tokens === 32000);
  for (const empty of [undefined, '', null]) assert.deepEqual(await capture(() => sb.callClaudeApi({ ...base, effort: empty })), c0, 'effort 없음 = 필드 없음');
  const c1 = await capture(() => sb.callClaudeApi({ ...base, effort: 'medium' }));
  assert.deepEqual(c1.output_config, { effort: 'medium' });
  delete c1.output_config; assert.deepEqual(c1, c0, 'effort 외 본문 불변');
  const c2 = await capture(() => sb.callClaudeApi({ apiKey: 'k', prompt: 'p', temperature: 0.3, effort: 'low' }));
  assert(c2.temperature === 0.3 && c2.output_config.effort === 'low' && !c2.thinking && !c2.stream);
  // 허용 값(low·medium·high·max) 밖의 문자열은 보내지 않고 경고만
  const warned = []; sb.console.warn = (...a) => warned.push(a.join(' '));
  assert.deepEqual(await capture(() => sb.callClaudeApi({ ...base, effort: 'bogus' })), c0, '알 수 없는 effort는 무시');
  assert(warned.some(w => /effort/.test(w) && /bogus/.test(w)), '무시할 때 경고');
  sb.console.warn = () => {};
  for (const v of ['low', 'medium', 'high', 'max']) assert.deepEqual((await capture(() => sb.callClaudeApi({ ...base, effort: v }))).output_config, { effort: v });
  assert.equal(sb.UsageLog.promptMeta(c0).effort, ''); assert.equal(sb.UsageLog.promptMeta({ ...c0, output_config: { effort: 'medium' } }).effort, 'medium');
  assert(b1.output_config === undefined && noRag.output_config === undefined && JSON.parse(one.log.reqs[0].body).output_config === undefined, '교정 호출에는 effort 없음');

  // panel26 근거 검증: 조정값(기본 없음)을 읽어 넘기기만 한다
  const s26 = makeSandbox();
  loadScript(s26, 'panels/panel26/panel26.js');
  s26.parseAiJson = s => JSON.parse(s);
  const P26 = s26.P26;
  assert(P26.VERIFY_TUNE && P26.VERIFY_TUNE.effort === '', '기본: effort 전달 안 함');
  const o = P26.parseOutline(['## [장] 1장', '### [절] 1.1 기초', '기초 본문입니다. 첫 문장.', '### [절] 1.2 응용', '응용 본문입니다. 1.1에서 배운 것을 씁니다.'].join('\n'));
  const mk = () => P26.cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: '1.2', problem: 'p', fix: 'f', id: o.nodes.find(n => n.title === '1.2 응용').id, at: '응용 본문입니다.', text: '바꾼 문장.' }] }, o).items[0];
  const seenOpts = [];
  s26.callClaudeApi = async opts => { seenOpts.push(opts); return { text: JSON.stringify({ results: [] }), searches: 0, searchErrors: [], sources: [], stopReason: 'end_turn' }; };
  await P26.verifyCandidates(o, [{ list: [mk()] }], 'k', null, null, '');
  P26.VERIFY_TUNE.effort = 'medium';
  await P26.verifyCandidates(o, [{ list: [mk()] }], 'k', null, null, '');
  P26.VERIFY_TUNE.effort = '';
  assert.equal(seenOpts.length, 2);
  assert.equal(seenOpts[0].effort, undefined); assert.equal(seenOpts[1].effort, 'medium');
  const rest = x => { const y = J(x); delete y.effort; return y; };
  assert.deepEqual(rest(seenOpts[1]), rest(seenOpts[0]), 'effort 외 검증 요청(프롬프트·thinking·도구·maxTokens) 불변');
  assert(seenOpts[0].thinking.type === 'adaptive' && seenOpts[0].maxTokens === 32000 && seenOpts[0].tools[0].name === 'web_search' && seenOpts[0].humanize === false);

  // 평가 하네스 비용 상한: SSE usage에 중첩 객체(cache_creation·server_tool_use)가 있어도 집계하고 웹 검색 요금을 더한다
  // (예전 정규식 "usage":(\{[^}]*\})는 첫 '}'에서 끊겨 JSON 파싱 실패 → 그 응답 전체가 0으로 집계됐다)
  const sseEv = d => 'event: ' + d.type + '\ndata: ' + JSON.stringify(d) + '\n\n';
  const sse = sseEv({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 0 }, output_tokens: 1 } } }) +
    sseEv({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '"usage":{' } }) +
    sseEv({ type: 'message_delta', delta: { stop_reason: 'pause_turn' }, usage: { output_tokens: 200 } }) +
    sseEv({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 500, server_tool_use: { web_search_requests: 3 } } });
  for (const mod of ['../eval/proofread/run_eval.js', '../eval/content/run_eval.js']) {
    const g = require(mod).makeCostGuard(1);
    g.noteStream(sse);
    assert.equal(g.calls, 1, mod + ': 응답 하나는 한 번만 집계');
    assert(Math.abs(g.usd - ((1000 * 3 + 2000 * 3.75 + 3000 * 0.30 + 500 * 15) / 1e6 + 3 * 0.01)) < 1e-9, mod + ': 입력·캐시·마지막 출력 누계·웹 검색 3회 = ' + g.usd);
    g.noteStream('event: ping\ndata: {"type":"ping"}\n\n'); assert.equal(g.calls, 1, 'usage 없는 스트림은 세지 않음');
    g.add({ input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 2 } }); // 비스트리밍 응답의 웹 검색
    assert(Math.abs(g.usd - ((1000 * 3 + 2000 * 3.75 + 3000 * 0.30 + 500 * 15) / 1e6 + 5 * 0.01)) < 1e-9);
    // pause_turn 뒤 후속 호출(별도 HTTP 요청·별도 스트림): 자기 message_start + 여러 message_delta 누계 → 한 번 더, 자기 몫만 더한다(앞 응답과 중복 합산 없음)
    g.noteStream(sseEv({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 4000, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, output_tokens: 2, server_tool_use: { web_search_requests: 0 } } } }) +
      sseEv({ type: 'message_delta', delta: {}, usage: { output_tokens: 100 } }) + sseEv({ type: 'message_delta', delta: {}, usage: { output_tokens: 250, server_tool_use: { web_search_requests: 1 } } }) +
      sseEv({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 300, server_tool_use: { web_search_requests: 1 } } }));
    assert.equal(g.calls, 3, mod + ': 스트림 2개 + 비스트리밍 1개');
    assert(Math.abs(g.usd - ((1000 * 3 + 2000 * 3.75 + 3000 * 0.30 + 500 * 15) / 1e6 + 5 * 0.01 + (4000 * 3 + 3000 * 0.30 + 300 * 15) / 1e6 + 1 * 0.01)) < 1e-9, mod + ': 후속 호출은 마지막 누계(출력 300·검색 1)만 = ' + g.usd);
    const est = g.estimate({ system: '', messages: [], max_tokens: 1000, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] }), est0 = g.estimate({ system: '', messages: [], max_tokens: 1000 });
    assert(est - est0 > 0.05 - 1e-9 && est - est0 < 0.051, '요청 전 예상 최대에 웹 검색 max_uses 포함');
    assert.equal(typeof require(mod).callRecords, 'function');

    // 상한 판단: 누적 + 진행 중 예상(pending) + 이 요청 예상 > 상한이면 차단(blocked 증가), 통과하면 예상치를 pending에
    const { makeCostGuard, guardedFetch } = require(mod);
    const body = { system: '', messages: [], max_tokens: 20000 }; // 예상 최대 = 출력 20,000 × $15/100만 + 본문 글자 몇 자
    const est1 = makeCostGuard(1).estimate(body);
    assert(est1 > 0.3 && est1 < 0.31);
    const c = makeCostGuard(est1 * 2.5);
    assert.equal(c.check(body), est1); assert(Math.abs(c.pending - est1) < 1e-12);
    assert.equal(c.check(body), est1, '동시 진행 2건까지는 상한 안');
    assert.throws(() => c.check(body), /비용 상한/, '진행 중 2건 + 이번 예상 > 상한 → 차단(예전에는 진행 중을 0으로 쳐 통과)');
    assert.equal(c.blocked, 1); assert(Math.abs(c.pending - est1 * 2) < 1e-12, '차단된 요청은 pending에 올리지 않음');
    c.add({ input_tokens: 0, output_tokens: 20000 }); c.release(est1); // 1건 집계(실제 $0.30) → 누적 0.30 + 진행 1건 + 이번 > 상한
    assert.throws(() => c.check(body), /비용 상한/); assert.equal(c.blocked, 2);
    c.release(est1); assert(c.pending < 1e-12);
    assert.equal(c.check(body), est1, '진행 중이 끝나면 누적 + 이번 ≤ 상한이라 통과');
    assert.equal(makeCostGuard(0).check(body), 0, '상한 없음(0)이면 막지 않고 pending도 없음');

    // fetch 래퍼 경로: event-stream → noteStream(CRLF 스트림, message_delta가 입력 누계를 덮어씀), JSON → add, 전송 실패·차단
    const tick = () => new Promise(r => setTimeout(r, 5));
    const crlfSse = (sseEv({ type: 'message_start', message: { usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0 }, output_tokens: 1 } } }) +
      sseEv({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 1000, output_tokens: 500, server_tool_use: { web_search_requests: 2 } } })).replace(/\n/g, '\r\n');
    const w = makeCostGuard(10); const seenBodies = [], seenJson = []; let sent = 0;
    let mode = 'sse';
    const wf = guardedFetch(w, async () => { sent++;
      if (mode === 'throw') throw new Error('network down');
      return mode === 'sse' ? new Response(crlfSse, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
        : new Response(JSON.stringify({ model: 'm', usage: { input_tokens: 2000, output_tokens: 100 } }), { headers: { 'content-type': 'application/json' } }); },
      b => seenBodies.push(b), j => seenJson.push(j));
    const init = { body: JSON.stringify(body) };
    const r1 = await wf('u', init);
    assert(w.pending > 0 || w.calls === 1, '집계 전에는 pending에 잡혀 있음');
    assert.equal((await r1.text()).length, crlfSse.length, '호출자는 응답 본문을 그대로 읽을 수 있음(clone)');
    await tick();
    assert.equal(w.calls, 1); assert(Math.abs(w.usd - ((1000 * 3 + 500 * 15) / 1e6 + 2 * 0.01)) < 1e-9, mod + ': CRLF 스트림·입력 누계 덮어쓰기 = ' + w.usd); assert(w.pending < 1e-12, '집계 뒤 pending 해제');
    mode = 'json'; await wf('u', init); await tick();
    assert.equal(w.calls, 2); assert(Math.abs(w.usd - ((1000 * 3 + 500 * 15) / 1e6 + 2 * 0.01 + (2000 * 3 + 100 * 15) / 1e6)) < 1e-9); assert.equal(seenJson.length, 1); assert.equal(seenBodies.length, 2); assert(w.pending < 1e-12);
    assert.equal(w.unknown, 0, '정상 스트림·JSON 뒤에는 비용 미확인 0');
    mode = 'throw'; // 연결 단계 실패(서버에 닿지 않음)는 미확인이 아니다 — 예약 반환
    {
      const refused = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      const wc = guardedFetch(w, async () => { throw refused; });
      await assert.rejects(wc('u', init), /fetch failed/); assert(w.pending < 1e-12 && w.unknown === 0, '연결 거부: 예약 반환·미확인 아님');
    }

    // 비용 미확인: 사용량을 받지 못한 호출은 0으로 치지 않는다 — 예약 유지, 이후 요청 차단
    const { connectFailed } = require(mod);
    assert(connectFailed({ cause: { code: 'ENOTFOUND' } }) && connectFailed({ code: 'UND_ERR_CONNECT_TIMEOUT' }) && !connectFailed(new Error('socket hang up')) && !connectFailed({ cause: { code: 'ECONNRESET' } }) && !connectFailed(null));
    const brokenStream = () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseEv({ type: 'message_start', message: { usage: { input_tokens: 900, output_tokens: 1 } } }))); c.error(new Error('stream aborted')); } }), { headers: { 'content-type': 'text/event-stream' } });
    const cases = { // 종류별: 응답을 만들거나 던진다
      '스트림 중단(읽기 오류)': brokenStream,
      '스트림이 message_delta 없이 끝남': () => new Response(sseEv({ type: 'message_start', message: { usage: { input_tokens: 900, output_tokens: 1 } } }), { headers: { 'content-type': 'text/event-stream' } }),
      '스트림 error 이벤트': () => new Response(sseEv({ type: 'message_start', message: { usage: { input_tokens: 900, output_tokens: 1 } } }) + sseEv({ type: 'message_delta', delta: {}, usage: { output_tokens: 5 } }) + sseEv({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }), { headers: { 'content-type': 'text/event-stream' } }),
      '응답 본문이 JSON이 아님': () => new Response('<html>gateway</html>', { headers: { 'content-type': 'text/html' } }),
      '성공 응답인데 usage 없음': () => new Response(JSON.stringify({ content: [] }), { headers: { 'content-type': 'application/json' } }),
      '연결 뒤 끊긴 전송 오류': () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); },
      '원인 불명 전송 오류': () => { throw new Error('network down'); },
    };
    for (const [name, make] of Object.entries(cases)) {
      const u = makeCostGuard(10); let n = 0;
      const uf = guardedFetch(u, async () => { n++; return make(); });
      await uf('u', init).then(r => r.text().catch(() => '')).catch(() => {}); await tick();
      assert.equal(u.unknown, 1, `${mod} ${name}: 비용 미확인 1건`);
      assert.equal(u.usd, 0, name + ': 누적에 0원으로 더하지 않음'); assert.equal(u.calls, 0);
      assert(Math.abs(u.pending - est1) < 0.01 && u.pending > 0 && Math.abs(u.unknownUsd - u.pending) < 1e-12, name + ': 예약(예상 최대)을 반환하지 않고 미확인 합계로 보관');
      await assert.rejects(uf('u', init), /비용 미확인 호출 1건 — 상한 준수를 보장할 수 없어 중단/, name + ': 다음 요청은 차단');
      assert.equal(n, 1, name + ': 차단된 요청은 전송하지 않음'); assert.equal(u.blocked, 1); assert.equal(u.unknown, 1);
    }
    // 미확인이 아닌 것: 전송 전 차단, HTTP 오류 응답(과금 없음)
    { const u = makeCostGuard(0.01); await assert.rejects(guardedFetch(u, async () => new Response('{}'))('u', init), /비용 상한/); assert(u.unknown === 0 && u.pending === 0, '전송 전 차단은 미확인이 아님'); }
    { const u = makeCostGuard(10); const r429 = await guardedFetch(u, async () => new Response(JSON.stringify({ error: { message: 'rate_limit_error' } }), { status: 429, headers: { 'content-type': 'application/json' } }))('u', init); await tick();
      assert(r429.status === 429 && u.unknown === 0 && u.pending < 1e-12 && u.calls === 0, 'HTTP 오류 응답은 과금 없음 — 예약 반환·미확인 아님'); await guardedFetch(u, async () => new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } }))('u', init); await tick(); assert.equal(u.calls, 1, '그 뒤 요청은 정상 진행'); }
    // 진행 중인 요청은 끊지 않는다: 미확인이 생겨도 먼저 보낸 요청은 끝까지 가고 집계된다
    { const u = makeCostGuard(10); let open; const hold = new Promise(r => { open = r; }); let k = 0;
      const uf = guardedFetch(u, async () => (++k === 1 ? (await hold, new Response(JSON.stringify({ usage: { input_tokens: 0, output_tokens: 100 } }), { headers: { 'content-type': 'application/json' } })) : brokenStream()));
      const firstReq = uf('u', init); await uf('u', init).then(r => r.text().catch(() => '')); await tick();
      assert.equal(u.unknown, 1); open(); await firstReq; await tick();
      assert(u.calls === 1 && Math.abs(u.usd - 100 * 15 / 1e6) < 1e-12 && Math.abs(u.pending - u.unknownUsd) < 1e-12, '진행 중이던 요청은 집계되고 미확인 예약만 남음'); }
    // 상한 없는 실행: 막지 않고 기록만(미확인 건수·예상 최대 합)
    { const u = makeCostGuard(0); const uf = guardedFetch(u, async () => brokenStream());
      await uf('u', init).then(r => r.text().catch(() => '')); await tick(); await uf('u', init).then(r => r.text().catch(() => '')); await tick();
      assert(u.unknown === 2 && u.blocked === 0 && u.unknownUsd > 0.5, '상한 없음: 차단 없이 기록만 — ' + JSON.stringify({ unknown: u.unknown, usd: u.unknownUsd })); }
    const tight = makeCostGuard(0.01); let sent2 = 0;
    await assert.rejects(guardedFetch(tight, async () => { sent2++; return new Response('{}'); })('u', init), /비용 상한/);
    assert.equal(sent2, 0, '차단되면 전송하지 않음'); assert.equal(tight.blocked, 1);
    // 동시 진행 2건: 첫 요청이 응답을 기다리는 동안 두 번째는 pending 때문에 차단된다
    const two2 = makeCostGuard(est1 * 1.5); let release1; const gate1 = new Promise(r => { release1 = r; });
    const slow = guardedFetch(two2, async () => { await gate1; return new Response(JSON.stringify({ usage: { input_tokens: 0, output_tokens: 10 } }), { headers: { 'content-type': 'application/json' } }); });
    const first = slow('u', init);
    await assert.rejects(slow('u', init), /진행 중 예상/); assert.equal(two2.blocked, 1);
    release1(); await first; await tick();
    await slow('u', init); await tick(); assert.equal(two2.calls, 2, '첫 요청이 집계된 뒤에는 통과');
  }
  // 호출별 기록(UsageLog 재사용): 꼬리표·소요·사용량·재시도·캐시 지점 접두부 해시, 키·본문 없음
  const recs = require('../eval/proofread/run_eval.js').callRecords(sb.UsageLog);
  const rec = recs.find(r => r.task === 'AI 교정 검사' && r.batch === '2/6' && r.retry);
  assert(rec && rec.attempt === 1 && /429|rate/.test(rec.retryReason) && typeof rec.ms === 'number' && rec.at && rec.usage && rec.cachePoints.length === 3 && rec.cachePoints[0].prefixHash && rec.effort === '', JSON.stringify(rec));
  assert(recs.some(r => r.status === 429 && r.usage === null), '실패 요청은 사용량 미확인');
  assert(!JSON.stringify(recs).includes('고유문장') && !JSON.stringify(recs).includes('sk-ant'), '호출 기록에 원고 본문·키 없음');

  // 부분 실패 안내·재검사 버튼(결과 화면): 실패 쪽이 남아 있으면 보이고, 없으면 숨김 — 예전에는 AI를 돌렸으면 무조건 숨겼다
  {
    const els = {}, mkEl = sb.document.getElementById;
    sb.document.getElementById = id => els[id] || (els[id] = mkEl(id));
    const exd = { filename: 't.docx', total_pages: 30, pages: [] };
    P8._setFailedPages([11, 12, 13, 14, 15]);
    P8.renderResults(exd, true, false);
    assert.equal(els.p8_aiNotice.style.display, 'block', '실패 쪽이 남아 있으면 안내가 보임');
    assert(/AI 검사 부분 실패/.test(els.p8_aiNotice.innerHTML) && /p8_retryFailedBatches\(\)/.test(els.p8_aiNotice.innerHTML) && /5페이지 미검사 \(p\.11~15\)/.test(els.p8_aiNotice.innerHTML), els.p8_aiNotice.innerHTML);
    assert(/AI 일부 미검사 5쪽/.test(els.p8_summaryBar.innerHTML) && !/AI 검사 완료/.test(els.p8_summaryBar.innerHTML), '요약에 미검사 쪽 수');
    P8._setFailedPages([]);
    P8.renderResults(exd, true, false);
    assert.equal(els.p8_aiNotice.style.display, 'none', '실패가 없으면 예전처럼 숨김');
    assert(/AI 검사 완료/.test(els.p8_summaryBar.innerHTML) && !/미검사/.test(els.p8_summaryBar.innerHTML));
    P8._setFailedPages([3]);
    P8.renderResults(exd, false, false); // AI 미실행 화면은 예전 그대로(키 입력 + AI 재검사)
    assert(/AI 의미 검사 미실행/.test(els.p8_aiNotice.innerHTML) && !/실패 배치 재검사/.test(els.p8_aiNotice.innerHTML) && /AI 미실행/.test(els.p8_summaryBar.innerHTML));
    P8._setFailedPages([]);
    sb.document.getElementById = mkEl;
  }

  console.log('PASS: api optimize —동시성 1↔2 결과·요청 일치, 첫 묶음 단독·최대 2, 지연 뒤섞임, 일부 실패, 429 뒤 동시성 1, 진행 표시 단조, RAG 꼬리 캐시 표시 켬/끔(다른 호출 본문 불변), effort 선택 전달');
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exit(1); });
