// 교정 AI 검사: 응답 실패(형식 오류·스키마 오류·잘림)를 성공으로 처리하지 않기 + 부분 실패 상태의 캐시 저장·복원 — 가짜 API만 사용(유료 호출 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS, ROOT } = require('./run_tests.js');

const J = x => JSON.parse(JSON.stringify(x));
const KEY = 'sk-ant-fake-coverage-test';

module.exports = async function () {
  const sb = makeSandbox();
  const waits = [];
  sb.setTimeout = (fn, ms) => { waits.push(ms); return setTimeout(fn, (ms || 0) / 100); }; // 대기 시간은 기록만 하고 1/100로
  sb.console = Object.assign({}, console, { log() {}, warn() {}, info() {}, debug() {} });
  const els = {}, mkEl = sb.document.getElementById;
  sb.document.getElementById = id => els[id] || (els[id] = mkEl(id)); // 같은 id는 같은 요소(화면 상태 확인용)
  const alerts = []; sb.alert = m => alerts.push(String(m));
  for (const s of SCRIPTS) if (fs.existsSync(path.join(ROOT, s)) && !/api-keys/.test(s)) loadScript(sb, s);
  const P8 = sb.__p8Eval, T = P8.AI_TUNE;
  let keyNow = KEY; sb.loadApiKey = async () => keyNow; sb.saveApiKey = () => {}; // 키 저장소는 시험 대상이 아님(저장하지 않는다)

  // ── 가짜 Messages API: 묶음마다 응답 종류를 정한다 ──
  const MARK = /표식(\d+)번문장입니다/;
  let plan = () => 'ok', reqs = [];
  const firstMark = body => { const m = body.messages[0].content.split('[분석 대상]').pop().match(MARK); return m ? +m[1] : 0; };
  sb.fetch = async (url, init) => {
    if (!/api\.anthropic\.com/.test(String(url))) throw new Error('offline'); // 네이버 맞춤법 등 다른 요청은 실패시킨다
    const body = JSON.parse(init.body), mark = firstMark(body), nth = reqs.filter(r => r.mark === mark).length + 1;
    reqs.push({ mark, nth });
    const kind = plan(mark, nth);
    const found = `표식${mark}번문장입니다`;
    const ok = (text, stop) => ({ ok: true, status: 200, json: async () => ({ model: body.model, stop_reason: stop || 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text }] }) });
    if (kind === 'http500') return { ok: false, status: 500, json: async () => ({ error: { message: 'server error' } }) };
    if (kind === 'nonjson') return ok('죄송합니다. 요청하신 형식으로 답할 수 없습니다.');
    if (kind === 'schema') return ok('{"result":"검토 완료","count":0}');
    if (kind === 'array') return ok('[{"type":"오탈자","found":"' + found + '","suggestion":"x"}]');
    if (kind === 'trunc') return ok('{"issues":[{"type":"오탈자","severity":"high","found":"' + found + '","suggestion":"표식 ' + mark + '번 문장입니다","description":"잘리기 전 지적"},{"type":"띄어쓰', 'max_tokens');
    if (kind === 'empty') return ok('{"issues":[]}');
    if (typeof kind === 'function') return ok(kind(found, mark)); // 본문을 직접 만드는 경우(종료 사유는 정상)
    return ok(JSON.stringify({ issues: [{ type: '오탈자', severity: 'high', found, suggestion: `표식 ${mark}번 문장입니다`, description: 'ok' }] }));
  };

  // ── ①~⑤ ⑨: checkLinguistic 단위 — 20쪽(4묶음), 동시성 1과 2 ──
  const pages = Array.from({ length: 20 }, (_, i) => ({ page: i + 1, text: `표식${i + 1}번문장입니다. 이 쪽의 본문은 검사 대상이며 길이가 충분합니다. `.repeat(3), lines: [], headings: [] }));
  const ex = () => ({ filename: 't', total_pages: 20, pages: pages.map(p => ({ ...p })), toc: [] });
  const batchOfMark = m => Math.ceil(m / 5);
  const runCL = async (conc, byBatch) => {
    T.concurrency = conc; reqs = []; waits.length = 0;
    plan = mark => byBatch[batchOfMark(mark)] || 'ok';
    const errs = [];
    const r = J(await P8.checkLinguistic(ex(), KEY, () => {}, e => errs.push(e)));
    T.concurrency = 1;
    return { r, errs, n: [1, 2, 3, 4].map(b => reqs.filter(q => batchOfMark(q.mark) === b).length), waits: waits.slice() };
  };
  const results = {};
  for (const conc of [1, 2]) {
    // ① 비JSON → 형식 오류 ③ max_tokens → 잘림(부분 지적 미반영) ④ 빈 배열 → 성공
    const a = await runCL(conc, { 2: 'nonjson', 3: 'trunc', 4: 'empty' });
    assert.deepEqual(a.r.failedPages, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], `동시성 ${conc}: 형식 오류·잘림 묶음의 쪽은 미검사`);
    assert.deepEqual(a.r.failures.map(f => [f.reason, f.pages[0], f.pages.length]), [['format', 6, 5], ['truncated', 11, 5]], '실패 사유 구분(묶음 순서)');
    assert(/형식 오류/.test(a.r.failures[0].message) && /응답 잘림/.test(a.r.failures[1].message));
    assert.deepEqual(a.r.checkedPages, [1, 2, 3, 4, 5, 16, 17, 18, 19, 20], '검사를 마친 쪽: 정상 묶음 + 빈 배열 묶음');
    assert.equal(a.r.failedBatches, 2); assert.equal(a.r.totalBatches, 4);
    assert.deepEqual(a.r.issues.map(i => i.page), [1], '잘린 응답에서 살린 지적은 반영하지 않음(6쪽 지적 없음), 빈 배열 묶음은 0건');
    assert.equal(a.errs.length, 0, '일부 실패는 전체 오류 콜백을 부르지 않음');
    // ⑤ 형식 오류·잘림에는 자동 재시도 없음
    assert.deepEqual(a.n, [1, 1, 1, 1], '묶음마다 요청 1회'); assert(!a.waits.includes(2000) && !a.waits.includes(8000), '재시도 대기 없음');
    // ② issues 없는 JSON·배열 루트 → 스키마 오류
    const b = await runCL(conc, { 1: 'schema', 3: 'array' });
    assert.deepEqual(b.r.failures.map(f => [f.reason, f.pages[0]]), [['schema', 1], ['schema', 11]]);
    assert.deepEqual(b.r.checkedPages, [6, 7, 8, 9, 10, 16, 17, 18, 19, 20]); assert.deepEqual(b.r.issues.map(i => i.page), [6, 16]); assert.deepEqual(b.n, [1, 1, 1, 1]);
    // ④ 모두 빈 배열 → 전부 성공(미검사 없음)
    const c = await runCL(conc, { 1: 'empty', 2: 'empty', 3: 'empty', 4: 'empty' });
    assert(c.r.failedBatches === 0 && c.r.failedPages.length === 0 && c.r.failures.length === 0 && c.r.issues.length === 0 && c.r.checkedPages.length === 20 && c.errs.length === 0, '{"issues":[]}은 정상 성공');
    // 전부 형식 오류 → 전체 실패 콜백(사유 포함), API 오류와 사유 구분
    const d = await runCL(conc, { 1: 'nonjson', 2: 'nonjson', 3: 'http500', 4: 'trunc' });
    assert(d.errs.length === 1 && /형식 오류/.test(d.errs[0]) && d.r.checkedPages.length === 0);
    assert.deepEqual(d.r.failures.map(f => f.reason), ['format', 'format', 'api', 'truncated']);
    results[conc] = [a.r, b.r, c.r, d.r];
  }
  assert.deepEqual(results[2], results[1], '⑨ 동시성 2에서도 ①~④ 결과 동일');

  // 종료 사유는 정상인데 JSON 뒤쪽이 끊긴 응답 — parseAiJson이 일부를 복구해도 성공으로 치지 않는다(미검사·지적 미반영·요청 1회)
  const iss = (f, extra) => `{"type":"오탈자","severity":"high","found":"${f}","suggestion":"고친 ${f}","description":"${extra || '설명'}"}`;
  const full = f => `{"issues":[${iss(f)},${iss(f.replace('표식', '표식'))}]}`;
  const cutA = f => '```json\n{"issues":[' + iss(f) + ',' + iss(f) + ',{"type":"띄어쓰기","severity":"low","found":"' + f + '","sugg'; // ⓐ 60% 지점에서 끊김(펜스 열린 채)
  const cutB = f => full(f).slice(0, -1);                                                                                               // ⓑ 끝 중괄호만 빠짐
  const okForms = { // 예전에 성공이던 형태는 그대로 성공
    '코드 펜스': f => '```json\n' + full(f) + '\n```',
    '앞에 설명': f => '검토 결과는 다음과 같습니다:\n' + full(f),
    '뒤에 설명': f => full(f) + '\n이상입니다. 추가로 볼 곳이 있으면 알려 주세요.',
    '빈 배열': () => '{"issues":[]}',
    '빈 배열(펜스)': () => '```json\n{"issues": []}\n```',
    '문자열 안 중괄호·따옴표 이스케이프': f => `{"issues":[${iss(f, '코드 {a: 1} 와 \\"인용\\" 그리고 } 닫는 괄호, 역슬래시 \\\\')}]}`,
    '문자열 안 줄바꿈': f => `{"issues":[${iss(f, '첫 줄\n둘째 줄')}]}`,
    '후행 쉼표': f => `{"issues":[${iss(f)},]}`,
    '다른 필드가 뒤에': f => `{"issues":[${iss(f)}],"summary":"요약 {메모}"}`,
  };
  for (const [name, body] of Object.entries(okForms)) assert.equal(P8._jsonObjectClosed(body('표식1번문장입니다')), true, '닫힌 객체: ' + name);
  assert.equal(P8._jsonObjectClosed(cutA('x')), false); assert.equal(P8._jsonObjectClosed(cutB('x')), false);
  assert.equal(P8._jsonObjectClosed('{"issues":[{"description":"끝나지 않은 문자열 }'), false, '문자열 안의 }는 닫는 괄호가 아님');
  assert.equal(P8._jsonObjectClosed('JSON 없음'), false);
  const cutRes = {};
  for (const conc of [1, 2]) {
    const a = await runCL(conc, { 2: cutA, 3: cutB });
    assert.deepEqual(a.r.failures.map(f => [f.reason, f.pages[0], f.pages.length]), [['cut', 6, 5], ['cut', 11, 5]], `동시성 ${conc}: ⓐⓑ 끊긴 응답은 미검사`);
    assert(/응답 끊김\(JSON 미완\)/.test(a.r.failures[0].message));
    assert.deepEqual(a.r.checkedPages, [1, 2, 3, 4, 5, 16, 17, 18, 19, 20]);
    assert.deepEqual(a.r.issues.map(i => i.page), [1, 16], '복구된 일부 지적은 반영하지 않음');
    assert.deepEqual(a.n, [1, 1, 1, 1], '자동 재시도 없음'); assert(!a.waits.includes(2000));
    const forms = {};
    for (const [name, body] of Object.entries(okForms)) {
      const g = await runCL(conc, { 1: body, 2: body, 3: body, 4: body });
      assert(g.r.failedBatches === 0 && g.r.failures.length === 0 && g.r.checkedPages.length === 20, `동시성 ${conc}: '${name}' 형태는 그대로 성공 — ` + JSON.stringify(g.r.failures));
      assert.equal(g.r.issues.length > 0, !/빈 배열/.test(name), `'${name}' 지적 반영`);
      forms[name] = g.r;
    }
    cutRes[conc] = [a.r, forms];
  }
  assert.deepEqual(cutRes[2], cutRes[1], '동시성 2에서도 동일');
  // 실패 사유 문구에 같은 낱말이 연달아 나오지 않는다(예전: "AI 응답 응답 잘림")
  { const m = await runCL(1, { 1: 'nonjson', 2: 'schema', 3: 'trunc', 4: cutA });
    assert.deepEqual(m.r.failures.map(f => f.reason), ['format', 'schema', 'truncated', 'cut']);
    assert.deepEqual(m.r.failures.map(f => f.message), ['AI 응답 형식 오류(JSON이 아님)', 'AI 결과 형식 오류(issues 배열 없음)', 'AI 응답 잘림(max_tokens — 이 묶음은 미검사로 둡니다)', 'AI 응답 끊김(JSON 미완) — 이 묶음은 미검사로 둡니다']);
    m.r.failures.forEach(f => assert(!/(\S+) \1(?!\S)/.test(f.message), '같은 낱말 반복: ' + f.message)); }
  assert.equal(P8._failSummary([{ reason: 'cut' }, { reason: 'truncated' }]), '응답 잘림 1묶음 · 응답 끊김(JSON 미완) 1묶음');
  assert.equal(P8._failSummary([{ reason: 'truncated' }, { reason: 'format' }, { reason: 'format' }, { reason: 'api' }]), '응답 잘림 1묶음 · 형식 오류 2묶음 · API 오류 1묶음');
  // 문자열을 돌려주는 호출(옛 스텁·full 없는 경로)도 그대로 처리된다
  { const real = sb.callClaudeApi; sb.callClaudeApi = async () => '{"issues":[]}'; const r = await P8.checkLinguistic(ex(), KEY, () => {}, () => {}); sb.callClaudeApi = real; assert(r.failedBatches === 0 && r.checkedPages.length === 20); }
  assert.equal(typeof (await P8.callClaude(KEY, '교정:\n[분석 대상]\n표식1번문장입니다', '')), 'string', 'callClaude 기본 반환은 문자열 그대로');

  // ── ⑥~⑧: 교정 실행(p8_startProofread) → 캐시 저장 → 다시 열기 → 실패 묶음 재검사 ──
  const md = Array.from({ length: 240 }, (_, i) => `표식${i + 1}번문장입니다. 이 문단은 캐시 복원 시험용 본문이며 쪽을 나누기에 충분한 길이로 반복합니다. `.repeat(4)).join('\n\n');
  const file = name => ({ name, size: md.length, lastModified: 1, text: async () => md });
  const open = async (f, key) => { keyNow = key; els.p8_apiKey = undefined; sb.document.getElementById('p8_apiKey').value = key; P8._setFile(f); reqs = []; await sb.p8_startProofread(); };
  const fkey = f => `${f.name}__${f.size}__${f.lastModified}`;
  const notice = () => els.p8_aiNotice, chips = () => els.p8_summaryBar.innerHTML;
  const dupes = list => { const seen = new Set(), d = []; list.forEach(i => { const k = i.page + '|' + i.found + '|' + i.type; if (seen.has(k)) d.push(k); seen.add(k); }); return d; };
  const aiOn = (list, pageSet) => list.filter(i => i.source === 'ai' && pageSet.has(i.page));

  // 묶음 구성 파악(쪽 나눔은 앱이 정한다): 2번째 묶음을 실패시킨다
  const probe = P8.textToExtracted('probe.md', md).pages.filter(p => p.text.trim().length >= 20);
  assert(probe.length >= 11, 'MD 원고가 3묶음 이상이어야 함: ' + probe.length + '쪽');
  const b2pages = probe.slice(5, 10).map(p => p.page), b2set = new Set(b2pages);
  const markOf = p => +p.text.match(MARK)[1];
  const b2mark = markOf(probe[5]); // 2번째 묶음의 [분석 대상] 첫 표식
  const totalB = Math.ceil(probe.length / 5);

  // ⑥ 부분 실패(응답 잘림) → 캐시·세션 저장
  const f1 = file('cov.md');
  plan = mark => (mark === b2mark ? 'trunc' : 'ok');
  await open(f1, KEY);
  assert.equal(reqs.length, totalB, '묶음마다 1회(잘림 재시도 없음)');
  let c1 = P8.getCache(fkey(f1));
  assert(c1 && c1.aiWasRun === true && c1.version === 2, '캐시 저장');
  assert.equal(c1.aiCoverage.status, 'partial', '일부 미검사는 완료 캐시와 구분');
  assert.deepEqual(J(c1.aiCoverage.failed), [{ pages: b2pages, reason: 'truncated' }], '실패 쪽·사유 저장');
  assert.equal(c1.aiCoverage.checked.length, probe.length - 5); assert(!c1.aiCoverage.checked.some(p => b2set.has(p)), '검사를 마친 쪽에 실패 쪽 없음');
  assert.equal(aiOn(c1.linguisticIssues, b2set).length, 0, '잘린 묶음의 부분 지적은 저장하지 않음');
  assert.equal(notice().style.display, 'block'); assert(/AI 검사 부분 실패/.test(notice().innerHTML) && /응답 잘림 1묶음/.test(notice().innerHTML) && /p8_retryFailedBatches\(\)/.test(notice().innerHTML), notice().innerHTML);
  assert(new RegExp(`AI 일부 미검사 ${b2pages.length}쪽`).test(chips()) && !/AI 검사 완료/.test(chips()));
  assert.equal(JSON.parse(sb.sessionStorage.getItem('pf_session')).aiCoverage.status, 'partial', '세션에도 범위 상태 저장');
  const nIssues1 = P8._issues().length;

  // ⑥ 다시 열기(캐시 복원, 키 없음): 안내·버튼·사유 유지, API 호출 없음
  P8._setCoverage(null); els.p8_aiNotice = undefined; els.p8_summaryBar = undefined;
  await open(f1, '');
  assert.equal(reqs.length, 0, '캐시 복원은 API를 부르지 않음(자동 재검사 없음)');
  assert.equal(P8._coverage().status, 'partial'); assert.deepEqual(J(P8._coverage().failed), [{ pages: b2pages, reason: 'truncated' }]);
  assert(/AI 검사 부분 실패/.test(notice().innerHTML) && /응답 잘림 1묶음/.test(notice().innerHTML) && /실패 배치 재검사/.test(notice().innerHTML), '복원 뒤에도 안내·재검사 버튼');
  assert(/AI 일부 미검사/.test(chips()) && !/AI 검사 완료/.test(chips()));
  assert.equal(P8._issues().length, nIssues1, '기존 지적 그대로');
  assert.equal(P8.getCache(fkey(f1)).aiCoverage.status, 'partial', '복원 실행이 캐시를 완료로 바꾸지 않음');

  // ⑦-a 재검사가 다시 실패(형식 오류) → 지적은 그대로, 사유만 갱신
  keyNow = KEY; reqs = []; plan = () => 'nonjson'; alerts.length = 0;
  await sb.p8_retryFailedBatches();
  assert.equal(reqs.length, 1, '실패한 묶음만 다시 요청');
  assert(alerts.some(a => /재검사 중 오류/.test(a)));
  assert.deepEqual(J(P8.getCache(fkey(f1)).aiCoverage.failed), [{ pages: b2pages, reason: 'format' }], '캐시의 사유 갱신');
  assert(/형식 오류 1묶음/.test(notice().innerHTML) && P8._issues().length === nIssues1);

  // ⑦-b 재검사 성공 → 상태 '완료', 지적 중복 없음, 캐시·세션 갱신
  reqs = []; plan = () => 'ok';
  await sb.p8_retryFailedBatches();
  assert.equal(reqs.length, 1);
  c1 = P8.getCache(fkey(f1));
  assert.equal(c1.aiCoverage.status, 'complete'); assert.deepEqual(J(c1.aiCoverage.failed), []); assert.equal(c1.aiCoverage.checked.length, probe.length);
  assert.equal(aiOn(c1.linguisticIssues, b2set).length, 1, '재검사한 묶음의 지적이 캐시에 추가');
  assert.deepEqual(dupes(c1.linguisticIssues), []); assert.deepEqual(dupes(P8._issues()), [], '지적 중복 없음');
  assert.equal(aiOn(P8._issues(), b2set).length, 1);
  assert.equal(notice().style.display, 'none'); assert(/AI 검사 완료/.test(chips()) && !/미검사/.test(chips()));
  assert.equal(JSON.parse(sb.sessionStorage.getItem('pf_session')).aiCoverage.status, 'complete');
  alerts.length = 0; reqs = []; await sb.p8_retryFailedBatches();
  assert(reqs.length === 0 && alerts.some(a => /재검사할 실패 페이지가 없습니다/.test(a)), '완료 뒤에는 재검사할 것이 없음');
  // 완료 캐시를 다시 열면 완료
  await open(f1, '');
  assert(P8._coverage().status === 'complete' && notice().style.display === 'none' && /AI 검사 완료/.test(chips()));

  // ⑧ 실패 정보 필드가 없는 이전 형식 캐시 → '검사 범위 확인 불가', 기존 결과 보존, 삭제·자동 재검사 없음
  const old = P8.getCache(fkey(f1)); delete old.aiCoverage; old.version = 1;
  const oldLing = JSON.stringify(old.linguisticIssues);
  P8.setCache(fkey(f1), old);
  const nIssues2 = P8._issues().length;
  await open(f1, KEY); // 키가 있어도 캐시에 AI 결과가 있으면 다시 부르지 않는다(기존 동작)
  assert.equal(reqs.length, 0, '이전 캐시를 자동으로 다시 검사하지 않음');
  assert.equal(P8._coverage().status, 'unknown');
  assert.equal(notice().style.display, 'block'); assert(/검사 범위 확인 불가 \(이전 형식 캐시\)/.test(notice().innerHTML) && /p8_rerunAI\(\)/.test(notice().innerHTML) && !/실패 배치 재검사/.test(notice().innerHTML), notice().innerHTML);
  assert(/AI 검사 범위 확인 불가/.test(chips()) && !/AI 검사 완료/.test(chips()) && !/미검사 \d+쪽/.test(chips()));
  assert.equal(P8._issues().length, nIssues2, '기존 결과 그대로 표시');
  const kept = P8.getCache(fkey(f1));
  assert(kept && JSON.stringify(kept.linguisticIssues) === oldLing && kept.aiWasRun === true && kept.aiCoverage.status === 'unknown', '캐시를 지우거나 완료로 바꾸지 않음');
  // 깨진 범위 기록도 예외 없이 '확인 불가'
  for (const bad of [undefined, null, 'x', 7, {}, { status: 'complete' }, { status: 'partial', failed: 'no', checked: [] }, { status: 'partial', failed: [null], checked: [] }, { status: 'done', failed: [], checked: [] }])
    assert.equal(P8._coverageFromCache({ aiWasRun: true, aiCoverage: bad }).status, 'unknown', JSON.stringify(bad));
  assert.equal(P8._coverageFromCache({ aiWasRun: false, aiCoverage: { status: 'complete', failed: [], checked: [] } }), null, 'AI를 돌리지 않은 캐시는 범위 상태 없음');
  assert.equal(P8._coverageFromCache(null), null);
  // 사용자가 AI 재검사를 고르면 전체를 다시 검사해 완료로
  reqs = []; plan = () => 'ok';
  await sb.p8_rerunAI();
  assert.equal(reqs.length, totalB); assert.equal(P8.getCache(fkey(f1)).aiCoverage.status, 'complete'); assert(/AI 검사 완료/.test(chips()));
  assert.deepEqual(dupes(P8._issues()), []);
  // AI 재검사가 전부 실패하면 이전 결과·범위 상태를 그대로 둔다
  reqs = []; plan = () => 'http500'; alerts.length = 0;
  await sb.p8_rerunAI();
  assert(alerts.some(a => /AI 교정 중 오류/.test(a)) && P8._coverage().status === 'complete' && P8.getCache(fkey(f1)).aiCoverage.status === 'complete', '전부 실패한 재검사는 상태를 바꾸지 않음');
  // AI 재검사가 일부 실패하면 '일부 미검사'로 저장
  reqs = []; plan = mark => (mark === b2mark ? 'schema' : 'ok');
  await sb.p8_rerunAI();
  assert.deepEqual(J(P8.getCache(fkey(f1)).aiCoverage.failed), [{ pages: b2pages, reason: 'schema' }]); assert(/결과 형식 오류 1묶음/.test(notice().innerHTML));

  // AI 미실행(키 없음)과 AI 전부 실패의 표시 구분 — 서로, 그리고 완료·일부 미검사·확인 불가와 다르다
  const f2 = file('nokey.md');
  await open(f2, '');
  assert.equal(reqs.length, 0); assert.equal(P8._coverage(), null);
  let c2 = P8.getCache(fkey(f2));
  assert(c2.aiWasRun === false && c2.aiCoverage === null, 'AI 미실행 캐시');
  assert(/AI 미실행/.test(chips()) && !/AI 검사 실패|AI 검사 완료|미검사|확인 불가/.test(chips()));
  assert(/AI 의미 검사 미실행/.test(notice().innerHTML) && !/모든 묶음 실패/.test(notice().innerHTML));
  const f3 = file('allfail.md');
  plan = () => 'nonjson'; alerts.length = 0;
  await open(f3, KEY);
  assert.equal(reqs.length, totalB, '전부 형식 오류여도 재시도 없음');
  assert(alerts.some(a => /형식 오류/.test(a)), '전부 실패 알림에 사유');
  const c3 = P8.getCache(fkey(f3));
  assert(c3.aiWasRun === false && c3.aiCoverage === null && !(c3.linguisticIssues || []).length, '전부 실패는 AI 결과 없음으로 저장(완료 캐시 아님)');
  assert(/AI 검사 실패/.test(chips()) && !/AI 미실행|AI 검사 완료|미검사|확인 불가/.test(chips()));
  assert(/AI 검사 실패 \(모든 묶음 실패/.test(notice().innerHTML));

  keyNow = ''; P8._setFile(null); P8._setCoverage(null);
  console.log('PASS: ai coverage — 형식 오류·스키마 오류·잘림은 미검사(부분 지적 미반영·자동 재시도 없음), 빈 배열은 성공, 동시성 2 동일, 부분 실패 캐시·세션 저장·복원, 재검사 뒤 완료·중복 없음, 이전 형식 캐시 확인 불가, 미실행·전부 실패 구분');
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exit(1); });
