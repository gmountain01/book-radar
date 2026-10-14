// 1단계(v2.17.0): 책 프로필 연결 · 검사 기준 고정 · 항목별 유효성(critSig/suggSig) · 캐시 처리 — 실제 API 없음(가짜 호출)
const assert = require('assert');
const { makeSandbox, loadScript } = require('./run_tests.js');
const fs = require('fs'), path = require('path');

module.exports = async function run() {
  const sb = makeSandbox();
  ['shared/config.js', 'shared/usage-log.js', 'shared/app.js', 'panels/panel8/loanword-data.js', 'panels/panel8/교정규칙.js', 'panels/panel8/test-fixtures.js',
   'libs/es-hangul/browser.js', 'panels/panel8/hwp5.js', 'panels/panel8/review-policy.js', 'panels/panel8/korean-style.js', 'panels/panel8/panel8.js',
   'panels/panel13/panel13.js', 'panels/panel26/panel26.js'].forEach(f => { if (fs.existsSync(path.join(__dirname, '..', f))) loadScript(sb, f); });
  const BP = sb.BookProfile, E = sb.__p8Eval, R = sb.P8Review, P26 = sb.P26, P13 = sb.P13;
  const LS = sb.localStorage;
  const setConcept = c => LS.setItem('ms_concept_v2', JSON.stringify(c));

  // ── 1. BookProfile 문장: 추정 허용 항목과 기본 정책 항목을 구분, 프로필 없음 문구 ──
  assert(BP.text(null).includes('프로필 없음') && BP.text(null).includes('IT로 가정하지 말고'));
  const t1 = BP.text({ title: '책', field: '인문/역사' });
  assert(t1.includes('- 분야·세부 분야: 인문/역사') && t1.includes('- 대상 독자: 미정 — 원고에서 추정') && t1.includes('- 편집 방침(출판사 표기·저자 문체·용어집·허용어): 미지정 — 기본 정책'), t1);
  assert(!/편집 방침.*추정/.test(t1.split('\n').find(l => l.includes('편집 방침'))), '편집 방침은 추정 대상이 아니다');
  assert(BP.sig({ conceptId: 'a', field: 'IT' }) !== BP.sig({ conceptId: 'a', field: '인문' }) && BP.sig({ conceptId: 'a', field: 'IT' }) === BP.sig({ conceptId: 'a', field: 'IT', memo: '무관' }), '지문은 전달 필드만 반영');
  console.log('  ✓ BookProfile 문장·지문');

  // ── 2. panel13 컨셉 ID 규칙 ──
  LS.removeItem('ms_concept_v2');
  P13.load(); const id1 = P13.data().conceptId; assert(id1, '샘플 컨셉에 ID 부여');
  P13.load(); assert.strictEqual(P13.data().conceptId, id1, '다시 열어도 ID 유지');
  sb.cpUpdate('title', '제목 바꿈'); P13.load(); assert.strictEqual(P13.data().conceptId, id1, '편집해도 ID 유지');
  setConcept({ title: '옛 저장값', reader: 'x' }); P13.load(); const id2 = P13.data().conceptId;
  assert(id2 && id2 !== id1 && JSON.parse(LS.getItem('ms_concept_v2')).conceptId === id2 && P13.data().field === '', 'ID 없는 옛 데이터: 1회 생성·저장, 프로필 칸은 미지정');
  P13.load(); assert.strictEqual(P13.data().conceptId, id2);
  P13.resetNoConfirm(); const id3 = P13.data().conceptId; assert(id3 && id3 !== id2 && P13.data().title === '', '초기화 = 새 책 = 새 ID');
  console.log('  ✓ 컨셉 ID 생성·유지·초기화');

  // ── 3. review-policy: documentProfile은 허용 목록과 분리, 옛 설정도 보정 ──
  const parsed = R.parse(JSON.stringify({ common: ['["a","b"]'], documents: { '원고.docx': ['["t","f"]'] }, documentProfile: { '원고.docx': { on: true, conceptId: 'c1', conceptSig: 's', title: 'T', extra: 1 }, bad: 'x' } }));
  assert.deepEqual(Object.keys(parsed.documentProfile), ['원고.docx']);
  assert(parsed.documentProfile['원고.docx'].on === true && parsed.documentProfile['원고.docx'].conceptId === 'c1' && parsed.documentProfile['원고.docx'].extra === undefined);
  assert.deepEqual(parsed.documents['원고.docx'], ['["t","f"]'], '허용 목록 배열은 그대로');
  assert.deepEqual(R.parse('{}').documentProfile, {}, '없으면 빈 객체');
  assert(R.allowed({ type: '오탈자', ruleId: 't', found: 'f' }, parsed, '원고.docx', new Set()), '허용 판정은 영향 없음');
  console.log('  ✓ 설정 저장 형식');

  // ── 4. panel8: 원고 연결(명시적)·컨셉 교체 감지·기준 지문 ──
  setConcept({ conceptId: 'cA', title: '책 A', field: 'IT/프로그래밍' });
  E._setDocKey('원고.docx');
  sb.p8_setProfileLink(false);
  const off = E.buildCriteria(); assert(!off.profileOn && off.profileText.includes('프로필 없음'), '연결 안 하면 프로필 없음 전달');
  sb.p8_setProfileLink(true);
  const on = E.buildCriteria(); assert(on.profileOn && on.conceptId === 'cA' && on.profileText.includes('IT/프로그래밍') && on.aiSig !== off.aiSig && on.ruleSig === off.ruleSig, '프로필은 AI 지문만 바꾼다');
  setConcept({ conceptId: 'cB', title: '책 B', field: '인문' }); // 공용 컨셉이 다른 책으로 바뀜
  E.renderProfileLink();
  assert(!E._settings().documentProfile['원고.docx'].on && !E.buildCriteria().profileOn, '컨셉 ID가 다르면 연결 해제');
  sb.p8_setProfileLink(true); const sigB = E.buildCriteria().aiSig;
  setConcept({ conceptId: 'cB', title: '책 B', field: '인문', editPolicy: '한글 표기 우선' }); // 같은 컨셉의 내용만 바뀜
  assert(E.buildCriteria().profileOn && E.buildCriteria().aiSig !== sigB, '같은 ID는 연결 유지, 내용이 바뀌면 AI 지문 변경');
  console.log('  ✓ 원고↔프로필 연결·교체 감지');

  // ── 5. 검사 기준 고정: 실행별 지역 객체(crit) — 실행 중 프로필·사용자 규칙을 바꿔도 호출 내용·지문 불변, 겹친 실행은 서로 독립 ──
  const fixed = E.buildCriteria(); // 실행 A 시작(프로필 인문, 사용자 규칙 없음)
  setConcept({ conceptId: 'cB', title: '책 B', field: '경영', editPolicy: '한글 표기 우선' }); // 검사 도중 프로필 변경
  E._setUserRules('## 사용자 규칙 A\n- 외래어는 한글로', true);                             // 검사 도중 사용자 규칙 업로드
  const later = E.buildCriteria(); // 실행 B 시작(바뀐 값)
  assert(fixed.profileText.includes('인문') && !fixed.rules.has && later.profileText.includes('경영') && later.rules.has && later.rules.text.includes('규칙 A'), '스냅샷은 실행마다 따로');
  assert(E._profileBlock(fixed).includes('인문') && E._profileBlock(later).includes('경영'));
  const calls = [];
  sb.callClaudeApi = async o => { calls.push(o); return JSON.stringify({ issues: [{ type: '문법', severity: 'low', found: '핵심 문장', suggestion: '핵심 문장이다', description: 'd', page: 1 }] }); };
  await E.callClaude('sk-ant-test', '본문', '규칙 참고', { task: 't' }, fixed);
  await E.callClaude('sk-ant-test', '본문', '규칙 참고', { task: 't' }, later);
  const tA = calls[0].systemBlocks.map(b => b.text), tB = calls[1].systemBlocks.map(b => b.text);
  assert(tA[0].startsWith('You are a professional Korean book editor') && !/IT\/tech publishing/.test(tA[0]) && tA[1].startsWith('## 책 프로필') && tA[1].includes('인문') && tA[2].startsWith('## 📋 교정 규칙 참고') && tA.length === 3, '실행 A: SYS → 프로필(인문) → RAG, 사용자 규칙 블록 없음(실행 중 올린 규칙은 안 보냄)');
  assert(tB[0].startsWith('## 📋 사용자 교정 규칙') && tB[0].includes('규칙 A') && tB[2].includes('경영') && tB.length === 4, '실행 B: 규칙(우선) → SYS → 프로필(경영) → RAG');
  assert(calls[0].noPersona === true && calls[0].humanize === true, '페르소나 끔·위생 규칙 현재 값 유지');
  // AI 검사·다시 쓰기 사슬도 crit을 쓴다: 지적 critSig = 그 실행의 aiSig, 전송 블록도 그 실행 값
  calls.length = 0;
  const lingA = await E.checkLinguistic({ pages: [{ page: 1, text: '핵심 문장. 본문입니다. 이 쪽은 검사 대상이 되도록 스무 글자를 넘긴다.' }] }, 'sk-ant-test', null, null, null, fixed);
  assert(lingA.issues.length === 1 && lingA.issues[0].critSig === fixed.aiSig && lingA.issues[0].critSig !== later.aiSig && calls[0].systemBlocks.some(b => b.text.includes('인문')) && !calls[0].systemBlocks.some(b => b.text.includes('규칙 A')), 'AI 검사: 실행 A 기준으로 호출·지문');
  calls.length = 0;
  sb.callClaudeApi = async o => { calls.push(o); return JSON.stringify([{ i: 0, text: '책과 배를 곁들여 먹었다.' }]); };
  const rw = { type: '조사중복', found: '책을 읽고 배를 먹고 밥을 먹었다.', sentence: '책을 읽고 배를 먹고 밥을 먹었다.', needsRewrite: true, description: 'd', page: 1, source: 'surface', critSig: fixed.ruleSig };
  const nRw = await E._rewriteParticleRepeats([rw], 'sk-ant-test', fixed);
  assert(nRw === 1 && rw.source === 'surface+ai' && rw.suggSig === fixed.aiSig && calls[0].system.includes('인문') && !calls[0].system.includes('규칙 A'), '다시 쓰기: 실행 A의 프로필·규칙 스냅샷, suggSig = 실행 A의 AI 지문');
  // 캐시 기준 사전: 지문 → 전문(프로필 문장·사용자 규칙 본문·우선 적용·버전·모델)
  const dict = E._criteriaDict(E._criteriaDict({ old: { kind: 'rule' } }, fixed), later);
  assert(dict.old && dict[fixed.ruleSig].kind === 'rule' && dict[fixed.ruleSig].userRules === null && dict[fixed.aiSig].profileText === fixed.profileText && dict[fixed.aiSig].promptVer === 1 && dict[fixed.aiSig].model === 'claude-sonnet-4-6', '실행 A 기준 전문');
  assert(dict[later.aiSig].profileText.includes('경영') && dict[later.aiSig].userRules.text.includes('규칙 A') && dict[later.aiSig].userRules.priority === true && dict[later.ruleSig].userRules.text.includes('규칙 A'), '실행 B 기준 전문(사용자 규칙 본문 포함)');
  assert(JSON.parse(JSON.stringify(dict))[fixed.aiSig].profileText.includes('인문'), '캐시 왕복 뒤에도 전문 유지');
  E._setUserRules('', true); // 사용자 규칙 제거(기본값 복원)
  setConcept({ conceptId: 'cB', title: '책 B', field: '인문', editPolicy: '한글 표기 우선' });
  console.log('  ✓ 검사 기준 고정(실행별 객체)·프롬프트 블록·캐시 기준 전문');

  // ── 6. 항목별 유효성: 규칙/AI 종류별 비교, 규칙 수정안 vs AI 수정안 ──
  const now = E.buildCriteria();
  const v = x => E.validForApply(x, now);
  assert(v({ source: 'surface', critSig: now.ruleSig }).ok, '규칙 항목: 규칙 지문 일치');
  assert(!v({ source: 'surface' }).ok && /미기록/.test(v({ source: 'surface' }).why), '지문 없는 옛 항목은 유효로 추정하지 않음');
  assert(!v({ source: 'ai', critSig: now.ruleSig }).ok, 'AI 항목은 AI 지문으로 비교(규칙 지문과 섞지 않음)');
  assert(v({ source: 'ai', critSig: now.aiSig }).ok);
  assert(v({ source: 'surface', critSig: now.ruleSig, suggestion: '을' }).ok, '규칙이 만든 수정안은 suggSig 없이도 유효');
  assert(v({ source: 'surface+ai', critSig: now.ruleSig, suggSig: now.aiSig }).ok, 'AI 수정안이 현재 AI 기준이면 유효');
  const sv = v({ source: 'surface+ai', critSig: now.ruleSig, suggSig: 'old' });
  assert(!sv.ok && sv.suggOnly, 'AI 수정안만 옛 기준이면 수정안만 무효');
  const sn = v({ source: 'surface+ai', critSig: now.ruleSig, suggestion: '옛 캐시의 AI 수정안' });
  assert(!sn.ok && sn.suggOnly && /미기록/.test(sn.why), 'suggSig 없는 AI 수정안(옛 캐시 승계)은 지적이 유효해도 수정안은 무효');
  // 프로필만 바뀌면: 규칙 항목·규칙 수정안은 유효, AI 지적·AI 수정안은 무효
  setConcept({ conceptId: 'cB', title: '책 B', field: '문학' });
  const now2 = E.buildCriteria();
  assert(now2.ruleSig === now.ruleSig && now2.aiSig !== now.aiSig);
  assert(E.validForApply({ source: 'surface', critSig: now.ruleSig }, now2).ok && !E.validForApply({ source: 'ai', critSig: now.aiSig }, now2).ok && !E.validForApply({ source: 'surface+ai', critSig: now.ruleSig, suggSig: now.aiSig }, now2).ok);
  // 사용자 규칙이 바뀌면 규칙 항목도 무효
  const before = E.buildCriteria().ruleSig; sb.p8_toggleRulesPriority(false); assert(E.buildCriteria().ruleSig !== before, '사용자 규칙 우선 적용을 바꾸면 규칙 지문도 바뀐다'); sb.p8_toggleRulesPriority(true); assert(E.buildCriteria().ruleSig === before); // 기본값 true
  console.log('  ✓ 항목별 유효성(규칙/AI/수정안)');

  // ── 7. panel26: 기준 문자열 고정·후보/검증 동일·결과에 기록·캐시 복원 판정 ──
  setConcept({ conceptId: 'cB', title: '책 B', field: '인문/역사', reader: '교양 독자' });
  const md = ['## [장] 1장', '### [절] 1.1', '본문입니다. 핵심 문장.', '### [절] 1.2', '응용 본문입니다.', '## [장] 2장', '### [절] 2.1', '정리 본문입니다.'].join('\n');
  const o = P26.parseOutline(md), id = t => o.nodes.find(n => n.title === t).id;
  const crit = P26.criteriaText({ useConcept: true, useToc: false, memo: '메모' });
  assert(crit.includes('### 책 컨셉') && crit.includes('대상 독자: 교양 독자') && crit.includes('### 책 프로필') && crit.includes('인문/역사') && crit.includes('### 편집자 메모'), crit);
  assert(P26.criteriaText({ useConcept: false, useToc: false, memo: '' }).includes('프로필 없음'));
  const prompts = [];
  sb.callClaudeApi = async opt => {
    prompts.push(opt.prompt);
    setConcept({ conceptId: 'cB', title: '책 B', field: '경영/실무', reader: '교양 독자' }); // 첫 호출 중 컨셉 변경
    return /검증할 후보/.test(opt.prompt) ? { text: JSON.stringify({ results: [{ i: 0, claim: { verdict: '유지' }, fix: { verdict: '적합' } }] }), searches: 0, searchErrors: [], sources: [], stopReason: 'end_turn' }
      : JSON.stringify({ scope: 's', summary: 'm', items: [{ tier: 'A', type: 'edit', where: '1.2', quote: '응용 본문입니다.', problem: 'p', fix: 'f', id: id('1.2'), at: '응용 본문입니다.', text: '바꾼 문장.' }] });
  };
  const used = P26.criteriaUsedOf({ useConcept: true, useToc: false, memo: '메모' }, crit); // _review와 같이 호출 전에 기록
  const out = await P26.reviewBook(o, 'k', { useConcept: true, useToc: false, memo: '메모', feedback: '' }, { crit });
  assert(prompts.length === 2 && prompts.every(p => p.includes('인문/역사') && !p.includes('경영/실무')), '후보·검증 모두 시작 당시 기준 문자열');
  assert(out.items.length === 1 && P26.bookApplicable(out.items[0]));
  assert(used.sig === P26.criteriaSig(crit) && /컨셉 “책 B”\(분야 인문\/역사\)/.test(used.summary) && used.conceptId === 'cB');
  const reviews = { book: { ...out, criteriaUsed: used } };
  assert(P26.markStale(reviews, P26.criteriaSig(crit)) === 0 && P26.bookApplicable(reviews.book.items[0]), '같은 기준이면 적용 가능');
  const nowSig = P26.criteriaSig(P26.criteriaText({ useConcept: true, useToc: false, memo: '메모' })); // 컨셉이 경영으로 바뀐 현재
  assert(nowSig !== used.sig && P26.markStale(reviews, nowSig) === 1 && !P26.bookApplicable(reviews.book.items[0]) && /현재와 다름/.test(reviews.book.staleVerify), '프로필 변경 뒤 복원 결과는 차단');
  const back = JSON.parse(JSON.stringify(reviews)); // 캐시 왕복
  assert(P26.markStale(back, nowSig) === 1 && !P26.bookApplicable(back.book.items[0]) && back.book.criteriaUsed.summary === used.summary, '캐시 복원 뒤 같은 판정, 검사에 쓴 기준 보존');
  // [장] 검토 결과가 stale이면 트리 반영도 차단
  const chRv = { [id('1장')]: { placement: [{ id: id('1.2'), to: id('2.1') }], criteriaUsed: { sig: 'old' } } };
  P26.markStale(chRv, nowSig);
  const pr = P26.applyOps(o, [{ k: `ai:${id('1장')}|placement|0` }], chRv);
  assert(pr.conflicts[`ai:${id('1장')}|placement|0`] && pr.nodes.map(n => n.title).join(' ') === '1장 1.1 1.2 2장 2.1', '[장] 검토: 이전 기준이면 이동 안 됨');
  console.log('  ✓ panel26 기준 고정·기록·캐시 판정');
  console.log('PASS: profile link — 책 프로필 문장·컨셉 ID·설정 형식·원고 연결·검사 기준 고정·항목별 유효성·panel26 기준 기록/재검토 판정');
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exit(1); });
