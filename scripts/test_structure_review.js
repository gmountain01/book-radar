// 원고 구조 검토(panel26) — 제목 트리·분량 진단·AI 응답 정리
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, ROOT } = require('./run_tests.js');

const sb = makeSandbox();
loadScript(sb, 'panels/panel26/panel26.js');
const { parseOutline, diagnose, cleanReview } = sb.P26;

// 1) 실제 원고: [장]·[절] 표시와 # 스타일이 함께 쓰인 경우 — 원고 파일은 gitignore(로컬에만 있음). CI에서는 건너뛴다
const REAL = path.join(ROOT, 'eval/proofread/source.md');
if (fs.existsSync(REAL)) {
  const real = parseOutline(fs.readFileSync(REAL, 'utf8'));
  const ch = real.nodes.find(n => n.level === 1);
  assert(ch && ch.label === '[장]' && /Chapter13/.test(ch.title), 'chapter from [장] marker');
  assert(real.nodes[0].label === '[파트]');
  assert(ch.children.every(c => c.label === '[절]'), 'children of [장] are [절]');
  assert(real.nodes.some(n => n.label === '[소]'));
  assert.equal(ch.total, ch.chars + ch.children.reduce((s, c) => s + c.total, 0), 'total = own + children');
} else console.log('  (eval/proofread/source.md 없음 — 실제 원고 검사 건너뜀)');

// 2) 표시 없이 스타일(#)만: 가장 얕은 #이 [장]
const styled = parseOutline('# 1장 시작\n본문\n## 개요\n본문\n# 2장 다음\n본문');
assert.deepEqual(styled.nodes.map(n => n.label), ['[장]', '[절]', '[장]']);

// 3) 표시와 스타일 혼용: [중] 표시를 보고 같은 #### 깊이를 [중]으로
const mixed = parseOutline('## [장] A\n### [절] B\n#### [중] C\n본문\n#### 표시 없는 제목\n본문\n##### 더 깊은 제목\n본문');
assert.deepEqual(mixed.nodes.map(n => n.label), ['[장]', '[절]', '[중]', '[중]', '[소]']);

// 4) # 없이 표시만, [소소]
const marks = parseOutline('[장] 가\n[절] 나\n[중] 다\n[소] 라\n[소소] 마\n본문');
assert.deepEqual(marks.nodes.map(n => n.label), ['[장]', '[절]', '[중]', '[소]', '[소소]']);

// 4-1) 스타일만 쓴 원고: 원고 읽기가 스타일 이름으로 # 개수 = 수준+1 로 적음 → [파트]가 [장]으로 밀리지 않음
const byStyle = parseOutline('# Part 01\n## 첫 장\n### 절\n#### 중\n본문', true);
assert.deepEqual(byStyle.nodes.map(n => n.label), ['[파트]', '[장]', '[절]', '[중]']);
loadScript(sb, 'panels/panel8/hwp5.js');
const styleLevel = sb.P8Hwp5.styleLevel;
assert.deepEqual(['[파트]', '[장]', '장제목', '절 제목', '중제목', '소제목', '[소소]', 'Chapter Title'].map(styleLevel), [0, 1, 1, 2, 3, 4, 5, 1]);
assert.deepEqual(['Heading 1', '제목 1', '부제목', '본문', '바탕글'].map(styleLevel), [-1, -1, -1, -1, -1]);

// 5) 분량 진단: 1.5배 이상 많음, 1/1.5 이하 적음, 긴 본문·큰 [소] 표시
const body = n => '가'.repeat(n);
const md = [
  '## [장] 짧은 장', body(1000),
  '## [장] 보통 장', '### [절] 하나', '#### [중] 가', body(2000), '#### [중] 나', body(2000), '#### [중] 라', body(2000),
  '## [장] 긴 장', '### [절] 큰 절', body(12000), '### [절] 작은 절', '#### [중] 다', body(1000), '##### [소] 큰 소', body(2500), '##### [소] 작은 소', body(300),
].join('\n');
const o = parseOutline(md), d = diagnose(o, 1.5);
assert.deepEqual(d.chapters.map(c => c.state), ['short', 'ok', 'long']);
const kinds = id => d.flags.filter(f => f.id === id).map(f => f.kind);
const nid = t => o.nodes.find(n => n.title === t).id;
assert(kinds(nid('큰 절')).includes('split'), '[중] 없이 긴 본문 → 나누기');
assert(kinds(nid('큰 절')).includes('big'), '형제 [절]보다 큼');
assert(kinds(nid('큰 소')).includes('promote'), '보통 [중]만큼 큰 [소] → 올리기');
assert(!kinds(nid('작은 소')).includes('promote'));
// 하나뿐인 [소]는 사실상 [중] 전체 → 올리기 대상 아님
const only = parseOutline(['## [장] A', '### [절] B', '#### [중] C', body(500), '##### [소] D', body(3000)].join('\n'));
assert(!diagnose(only).flags.some(f => f.kind === 'promote'), 'only-child [소] must not be promoted');
assert.equal(diagnose(o, 3).chapters[2].state, 'ok', 'ratio is adjustable (2.1배 < 3배)');

// 6) AI 응답 정리: 없는 ID·원문에 없는 나눌 지점·[중]보다 높은 올리기 제거
const r = cleanReview({
  summary: 's',
  placement: [{ id: nid('다'), to: nid('하나'), reason: 'ok' }, { id: 'n999', to: nid('하나'), reason: 'bad' }],
  split: [{ id: nid('큰 절'), at: '가가가', title: 't' }, { id: nid('큰 절'), at: '원문에 없음', title: 't2' }],
  promote: [{ id: nid('큰 소') }, { id: nid('큰 절') }],
  concepts: [{ term: 'x', usedAt: nid('다'), explainedAt: 'nope' }, { term: '', usedAt: nid('다') }],
  reorder: [{ id: nid('다'), before: 'nope' }],
}, o);
assert.equal(r.placement.length, 1);
assert.deepEqual(r.split.map(x => x.at), ['가가가', '']);
assert.equal(r.promote.length, 1);
assert(r.concepts.length === 1 && r.concepts[0].explainedAt === '');
assert.equal(r.reorder.length, 0);
// 문장 속 ID는 제목으로 바꿈
const named = cleanReview({ summary: `${nid('다')}([중] 다)는 짧고 ${nid('큰 절')}은 길다`, promote: [{ id: nid('큰 소'), reason: `${nid('큰 소')}가 큼` }] }, o);
assert.equal(named.summary, '[중] 다는 짧고 [절] 큰 절은 길다');
assert.equal(named.promote[0].reason, '[소] 큰 소가 큼');
// 기획 대비 빠진 내용: 위치 ID가 없으면 비움
const miss = cleanReview({ missing: [{ item: '보안 설정', where: nid('하나'), reason: 'r' }, { item: '배포', where: 'nope' }, { item: '' }] }, o);
assert.deepEqual(miss.missing.map(x => [x.item, x.where]), [['보안 설정', nid('하나')], ['배포', '']]);

// 판단 기준 글: 고른 것만 넣는다
sb.localStorage.setItem('ms_concept_v2', JSON.stringify({ title: '책', reader: '입문자', scope: 'A\nB' }));
sb.localStorage.setItem('ms_toc_v1', JSON.stringify([{ level: 1, title: '기획 1장', memo: '실습' }, { level: 2, title: '기획 절' }]));
const { criteriaText } = sb.P26;
assert.equal(criteriaText({ useConcept: false, useToc: false, memo: '' }), '');
const ct = criteriaText({ useConcept: true, useToc: true, memo: '보안은 부록' });
assert(ct.includes('대상 독자: 입문자') && ct.includes('다루는 범위: A / B'), ct);
assert(ct.includes('- 기획 1장 (실습)') && ct.includes('  - 기획 절'), ct);
assert(ct.includes('### 편집자 메모\n보안은 부록'));

// 제안 목차: 수락한 제안·직접 옮기기를 순서대로 적용, 충돌 표시
const { applyOps } = sb.P26;
const t = parseOutline(['## [장] A', '### [절] B', '#### [중] C', '가나다라마바사', '##### [소] D', body(100), '##### [소] E', body(50),
  '### [절] F', '본문 앞. 여기서 나눔 뒤쪽', '## [장] G', '### [절] H', body(10)].join('\n'));
const id = s => t.nodes.find(n => n.title === s).id;
const chA = id('A');
const rv = { [chA]: {
  placement: [{ id: id('C'), to: id('F') }, { id: id('C'), to: id('H') }],
  promote: [{ id: id('D') }],
  reorder: [{ id: id('F'), before: id('B') }, { id: id('B'), before: id('D') }],
  split: [{ id: id('F'), at: '여기서 나눔', title: '새 중' }],
} };
const k = (g, i) => ({ k: `ai:${chA}|${g}|${i}` });
const titles = P => P.nodes.map(n => n.label + n.title).join(' ');
// [소]→[중] 올리기: 속한 [중] 바로 뒤로, 본문 함께
let P = applyOps(t, [k('promote', 0)], rv);
assert.equal(titles(P), '[장]A [절]B [중]C [소]E [중]D [절]F [장]G [절]H');
assert.equal(P.byId[id('D')].total, 100);
assert.equal(t.byId[id('D')].level, 4, 'original outline untouched');
// 편입: [중] C를 [절] F 아래로 (하위 [소]도 함께), 같은 제목 두 번 옮기면 충돌
P = applyOps(t, [k('placement', 0), k('placement', 1)], rv);
assert.equal(titles(P), '[장]A [절]B [절]F [중]C [소]D [소]E [장]G [절]H');
assert(P.conflicts[k('placement', 1).k] && !P.conflicts[k('placement', 0).k]);
// 순서 바꾸기, 자기 아래로는 충돌
P = applyOps(t, [k('reorder', 0), k('reorder', 1)], rv);
assert.equal(titles(P), '[장]A [절]F [절]B [중]C [소]D [소]E [장]G [절]H');
assert(P.conflicts[k('reorder', 1).k]);
// [절] 본문 나누기 → 첫 [중], 본문이 나뉨
P = applyOps(t, [k('split', 0)], rv);
const F = P.byId[id('F')];
assert(F.children[0].isNew && F.children[0].label === '[중]' && F.children[0].text === '여기서 나눔 뒤쪽' && F.text === '본문 앞.');
assert.equal(P.touched[F.children[0].id], 'new');
// 직접 옮기기: 위로·한 수준 위로·위 제목 아래로, 못 옮기면 충돌
P = applyOps(t, [{ type: 'up', id: id('F') }, { type: 'out', id: id('E') }, { type: 'in', id: id('G') }, { type: 'up', id: id('A') }], rv);
assert.equal(titles(P), '[장]A [절]F [절]B [중]C [소]D [중]E [절]G [중]H');
assert(P.conflicts['me:3'], 'first child cannot move up');
// 바뀐 제목 표시: 원래 목차와 비교 — 자리 바뀐 두 [절]은 순서, 따라간 하위는 함께, 수준 바뀐 제목은 수준
assert.deepEqual([id('F'), id('B'), id('C'), id('E'), id('G'), id('H'), id('A')].map(x => P.touched[x] || ''),
  ['order', 'order', 'carried', 'level', 'level', 'level', '']);
P = applyOps(t, [k('placement', 0)], rv);
assert.deepEqual([id('C'), id('D'), id('B'), id('F')].map(x => P.touched[x] || ''), ['moved', 'carried', '', '']);
P = applyOps(t, [k('promote', 0)], rv);
assert.deepEqual([id('D'), id('E'), id('C')].map(x => P.touched[x] || ''), ['level', '', ''], 'promote: only D, siblings unmarked');
// 책 전체 검토: 삭제(전체·일부)·추가, 삭제된 제목을 쓰는 뒤 제안은 충돌
const rb = cleanReview({
  delete: [{ id: id('E'), at: '' }, { id: id('F'), at: '여기서 나눔', dupOf: id('C') }, { id: id('F'), at: '원문에 없는 문장' }],
  add: [{ item: '설치하기', where: id('B'), points: '요점' }, { item: '위치 없음', where: 'nope' }],
}, t);
assert.equal(rb.delete.length, 2, 'partial delete must quote the manuscript exactly');
assert.equal(rb.add.length, 1);
const rvB = { book: { ...rb, placement: [{ id: id('E'), to: id('H') }] } };
const kb = (g, i) => ({ k: `ai:book|${g}|${i}` });
P = applyOps(t, [kb('delete', 0), kb('delete', 1), kb('add', 0), kb('placement', 0)], rvB);
assert.equal(titles(P), '[장]A [절]B [중]C [소]D [중]설치하기 [절]F [장]G [절]H');
assert.equal(P.byId[id('F')].text, '본문 앞.  뒤쪽', 'only the quoted passage removed');
assert.deepEqual([id('E'), id('F'), 'add1'].map(x => P.touched[x]), ['deleted', 'trim', 'add']);
assert(P.conflicts[kb('placement', 0).k], 'moving a deleted heading conflicts');
// 편집자 기준 책 전체 검토(A·B·C): 원문 대조, 적용 가능 여부, 유형별 반영
const { cleanBookReview, bookApplicable, bookText } = sb.P26;
const cb = cleanBookReview({ scope: '원고 전체', summary: 's', items: [
  { tier: 'A', type: 'heading', where: 'D', quote: '가나다라', problem: 'p', fix: 'f', id: id('D'), level: '[중]' },
  { tier: 'A', type: 'edit', where: 'C', quote: '가나다라마바사', id: id('C'), at: '가나다', text: 'ABC' },
  { tier: 'B', type: 'add', where: 'F 앞', title: '새 절', before: id('F'), text: '초안', compare: '현행도 성립' },
  { tier: 'A', type: 'add', where: 'F 문단', id: id('F'), at: '본문 앞.', text: '덧붙인 문단' },
  { tier: 'A', type: 'move', where: 'G 앞', id: id('F'), before: id('G') },
  { tier: 'A', type: 'delete', where: 'F', id: id('F'), at: '원고에 없는 문장' },
  { tier: 'A', type: 'edit', where: 'x', quote: '원고에 없는 인용', problem: 'p' },
  { tier: 'A', type: 'nonsense', where: 'x' },
], notNeeded: [{ feedback: '설명 없음', reason: '이미 있음', quote: '가나다' }, { reason: '피드백 없음' }] }, t);
assert.equal(cb.items.length, 7, 'unknown type dropped');
assert(!cb.items[0].quoteMissing && cb.items[6].quoteMissing, 'quotes checked against manuscript');
assert(cb.items[5].atMissing && !bookApplicable(cb.items[5]), 'delete with unquoted text must not delete the whole heading');
assert(!bookApplicable(cb.items[6]), 'no target → report only');
assert.equal(cb.items[0].level, 3);
assert.equal(cb.notNeeded.length, 1);
const rvN = { book: cb };
const kn = i => ({ k: `ai:book|items|${i}` });
P = applyOps(t, [0, 1, 2, 3, 4].map(kn), rvN);
// D [소]→[중]: 순서 그대로, 뒤따르는 E가 D 아래로 / 새 절은 F 앞 / F는 G 앞으로 (이미 [장] A 안이므로 [장] 수준)
assert.equal(titles(P), '[장]A [절]B [중]C [중]D [소]E [절]새 절 [장]F [장]G [절]H');
assert.equal(P.byId[id('C')].text, 'ABC라마바사');
assert.equal(P.byId[id('F')].text, '본문 앞.\n\n덧붙인 문단 여기서 나눔 뒤쪽');
assert.deepEqual([id('D'), id('E'), id('C'), 'add1'].map(x => P.touched[x]), ['level', 'carried', 'edit', 'add']);

// 추가 검증 기준: 확인 보류·단순 교정 구분, 포괄적 보증 감지
const cv = cleanBookReview({ summary: '구조는 대체로 자연스럽고 나머지 부분은 문제가 없다.', items: [
  { tier: 'H', area: 'structure', type: 'edit', where: 'x', problem: '공식 문서 대조 필요' },
  { tier: '확인 보류', type: 'edit', where: 'y', problem: 'p' },
  { tier: 'A', area: 'proofread', type: 'edit', where: 'z', problem: '오탈자' },
] }, t);
assert.deepEqual(cv.items.map(x => x.tier + '/' + x.area), ['H/structure', 'H/structure', 'A/proofread']);
assert(cv.blanket, 'blanket assurance flagged');
assert(!cleanBookReview({ summary: '확인한 문제는 두 가지다. 3장 이후는 검토하지 못했다.' }, t).blanket);
// 제목 줄에 수준 근거: 원고 표시 / 스타일 이름 / 서식 추정 / 추출 추정(PDF)
assert(bookText(t).text.includes(`⟦${id('A')}⟧ ## [장] A 〔근거: 원고 표시〕`));
assert(bookText(parseOutline('# 1장\n본문', false)).text.includes('〔근거: 제목 서식·수준 추정〕'));
assert(bookText(parseOutline('# 1장\n본문', true)).text.includes('〔근거: 스타일 이름〕'));
assert(bookText(parseOutline('# 1장\n본문', false, true)).text.includes('〔근거: 추출 추정〕'));

// 내용 완성도 검토: 절별 목적, A/B/C, 교정·교열 따로, 수락 시 문장 뒤 삽입·교체, 재검토 추적
const { cleanLogicReview } = sb.P26;
const lr = cleanLogicReview({ reader: '입문자(추정)', scope: 's', summary: 'm',
  sections: [{ id: id('B'), goal: '핵심', verdict: '보강 필요' }, { id: 'nope', goal: 'x' }, { id: id('F'), goal: '핵심2', verdict: '충분' }],
  items: [
    { tier: 'A', action: '추가', question: '왜?', basis: '이유 없음', fix: '보강', id: id('C'), at: '가나다', text: '이유 문장.' },
    { tier: 'B', question: 'q', fix: 'f', id: id('F'), at: '본문 앞.', text: '바꾼 문장.', replace: true },
    { tier: 'C', question: '공식 문서와 같은가?', needs: '공식 문서' },
    { tier: 'A', question: 'q' },
  ],
  proof: [{ kind: '조사', where: 'C', quote: '라마', fix: '라를', reason: '조사 누락', id: id('C'), at: '라마', text: '라를' },
          { kind: '제목 체계', where: 'E', fix: '[중]으로', id: id('E'), level: '[중]' },
          { kind: '오탈자', where: 'x', quote: '같음', fix: '같음' }],
  tracking: [{ prev: 'p1', status: '해결됨', reason: '보강됨' }] }, t);
assert.deepEqual(lr.sections.map(x => x.verdict), ['보강 필요', '충분']);
assert.deepEqual(lr.items.map(x => x.tier + '/' + x.type), ['A/add', 'B/edit', 'C/add'], 'A/B item without fix dropped, C kept');
assert(bookApplicable(lr.items[0]) && bookApplicable(lr.items[1]) && !bookApplicable(lr.items[2]));
assert.deepEqual(lr.proof.map(x => x.type), ['edit', 'heading']);
assert.equal(lr.tracking[0].status, '해결');
P = applyOps(t, [{ k: 'ai:logic|items|0' }, { k: 'ai:logic|items|1' }, { k: 'ai:logic|proof|0' }, { k: 'ai:logic|proof|1' }], { logic: lr });
assert.equal(P.byId[id('C')].text, '가나다\n\n이유 문장.라를바사');
assert.equal(P.byId[id('F')].text, '바꾼 문장. 여기서 나눔 뒤쪽');
assert.equal(P.byId[id('E')].label, '[중]');
assert.equal(P.touched[id('C')], 'edit');

// 원고 전체 MD: 제목마다 ⟦ID⟧, 길면 본문을 줄임
const bt = bookText(t);
assert(bt.chunks === 1 && bt.text.includes(`⟦${id('C')}⟧ #### [중] C`) && bt.text.includes('가나다라마바사'));
// 길면 자르지 않고 [장]·제목 단위 구간으로 — 모든 본문이 어느 구간에든 그대로 들어간다
const parts = sb.P26.bookChunks(o, 3000);
assert(parts.length > 1, 'split into chunks');
const joined = parts.map(c => c.text).join('');
assert(o.nodes.every(n => !n.text || joined.includes(n.text)), 'no body text lost');
assert(!joined.includes('생략'), 'never truncated');

// 개념 제안 수락은 목차 그대로
const rvC = { [chA]: { concepts: [{ term: 'x', usedAt: id('C') }] } };
assert.equal(titles(applyOps(t, [{ k: `ai:${chA}|concepts|0` }], rvC)), titles(applyOps(t, [], rvC)));

// 번호 줄 제목(서식이 사라진 MD): 앞쪽 차례는 빼고, '4장 요약'은 [절]
const numMd = ['둘째 마당. 트랜스포머', '머리말', '4장. 입력', '', '5장. 어텐션', '', '4장. 입력', '도입 문단', '4.1 큰 그림', '본문', '4장 요약', '- 정리', '5장. 어텐션', '5.1 개념', '1장에서 다룬 바와 같이 ReLU는 단순합니다.'].join('\n');
const no = parseOutline(numMd);
assert.deepEqual(no.nodes.map(n => n.label + n.title), ['[파트]둘째 마당. 트랜스포머', '[장]4장. 입력', '[절]4.1 큰 그림', '[절]4장 요약', '[장]5장. 어텐션', '[절]5.1 개념']);
assert(no.nodes.every(n => n.src === 'number') && no.levelSource === 'guess');

// 근거 수집: 정의 문장·참조 절의 실제 위치·중복 상대의 역할·위첨자 용어
const evMd = ['## [장] 5장', '### [절] 5.1 개념', '셀프 어텐션이란 토큰끼리 관계를 계산하는 방법입니다. 자세한 내용은 6.3절에서 배웁니다.',
  '### [절] 5장 요약', '- 셀프 어텐션: 관계를 계산', '  - 스케일링: 나눈다', '## [장] 6장', '### [절] 6.3 잔차 연결', '잔차 연결은 입력을 더합니다. MoE<sup>Mixture of Experts</sup>는 18장에서 다룹니다.'].join('\n');
const eo = parseOutline(evMd);
const eid = t => eo.nodes.find(n => n.title === t).id;
const e1 = sb.P26.gatherEvidence(eo, { id: eid('5.1 개념'), quote: '자세한 내용은 6.3절에서 배웁니다', terms: ['셀프 어텐션'], kind: '순서·참조' });
assert(e1.ev.some(e => /정의·설명 문장/.test(e.tag) && e.text.includes('셀프 어텐션이란')), 'definition sentence found');
assert(e1.ev.some(e => /참조 '6\.3' — 원고에 있음, 지적 위치보다 뒤/.test(e.tag)), 'forward reference located after');
const e2 = sb.P26.gatherEvidence(eo, { id: eid('5장 요약'), quote: '셀프 어텐션: 관계를 계산', kind: '중복', dupWith: { id: eid('5.1 개념'), quote: '셀프 어텐션이란 토큰끼리 관계를 계산하는 방법입니다.' } });
assert(e2.ev.some(e => /이쪽 역할: 장 요약·정리/.test(e.tag)) && e2.ev.some(e => /상대 역할: 본문/.test(e.tag)));
assert(e2.ev[0].text.includes('  - 스케일링'), 'list indentation kept in evidence');
const e3 = sb.P26.gatherEvidence(eo, { id: eid('6.3 잔차 연결'), quote: 'MoE<sup>Mixture of Experts</sup>는 18장에서', kind: '기타' });
assert(e3.searched.some(t => t.startsWith("'Mixture of Experts'")), 'superscript gloss searched');
assert(e3.ev.some(e => /참조 '18장'/.test(e.tag) && /찾지 못함/.test(e.text)), 'out-of-range reference reported, not guessed');
const e5 = sb.P26.gatherEvidence(eo, { id: eid('5.1 개념'), quote: '자세한 내용은', terms: ['잔차 연결'] });
assert(e5.ev.some(e => /제목으로 다루는 곳 — 지적 위치보다 뒤/.test(e.tag) && /6\.3 잔차 연결/.test(e.path)), 'forward mention without number located by title');
const e4 = sb.P26.gatherEvidence(eo, { id: eid('5.1 개념'), quote: '셀프 어텐션이란', terms: ['없는용어'] });
assert(/검색 결과 없음\(다른 표현·그림·다른 구간일 수 있음\)/.test(e4.text), 'no-hit is not proof of absence');

// 검증 반영: 철회 / 보류→확인 보류 / 수정안 재작성 / 출처 없는 기술 지적은 반영 권고에서 내림 / 수정안 보류는 자동 반영 안 함
const ac = (x, res, proof) => { sb.P26.applyCheck(x, res, proof); return x; };
assert(ac({ tier: 'A' }, { claim: { verdict: '철회', reason: 'E2에 정의 있음' } }).withdrawn);
assert.equal(ac({ tier: 'A' }, { claim: { verdict: '보류' }, fix: { verdict: '적합' } }).tier, 'C');
const rw = ac({ tier: 'A', type: 'add', fix: 'old', text: '틀린 문장', id: 'n1', at: 'x' }, { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: 'new', text: '고친 문장', replace: true } });
assert(rw.fixRewritten && rw.text === '고친 문장' && rw.type === 'edit' && rw.origFix.text === '틀린 문장');
const tu = ac({ tier: 'A' }, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech: { needed: true, status: '확인 못 함', sources: [] } });
assert(tu.tier === 'C' && tu.downgraded && tu.check.techStatus === '확인 못 함');
const ts = ac({ tier: 'A' }, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech: { needed: true, status: '출처 확인', sources: ['https://arxiv.org/abs/1706.03762'] } });
assert(ts.tier === 'A' && ts.check.techStatus === '출처 확인');
const fh = ac({ tier: 'A', type: 'edit', id: 'n1', at: 'a', text: 'b' }, { claim: { verdict: '유지' }, fix: { verdict: '보류', reason: '원고 표기와 다름' } });
assert(fh.fixHeld && !bookApplicable(fh), 'held fix is not auto-applied');
assert.equal(ac({ tier: 'A' }, null).check.claim, '보류', 'missing verification never counts as verified');

// QA 2026-10-06 회귀: 코드 블록 안 '# 주석'은 제목이 아님(번호 줄 추정 모드도)
const fenced = parseOutline('## [장] A\n본문\n```python\n# 데이터 불러오기\nimport x\n```\n### [절] B\n본문');
assert.deepEqual(fenced.nodes.map(n => n.title), ['A', 'B'], 'fence comment must not become a heading');
const fencedNum = parseOutline('4장. 입력\n본문\n```\n# 4.9 가짜\n```\n4.1 진짜\n본문');
assert.deepEqual(fencedNum.nodes.map(n => n.title), ['4장. 입력', '4.1 진짜']);
// QA: 확인 보류·강등 항목은 자동 반영하지 않음
assert(!bookApplicable({ tier: 'C', type: 'edit', id: 'n1', at: 'a', text: 'b' }) && !bookApplicable({ tier: 'H', type: 'delete', id: 'n1' }) && !bookApplicable({ tier: 'A', downgraded: 'x', type: 'edit', id: 'n1', at: 'a', text: 'b' }));
// QA: 검증이 '뒤에 넣기'(replace:false)로 다시 쓰면 원문을 덮어쓰지 않음, 교정 항목은 유형 유지
const rf = ac({ tier: 'A', type: 'edit', fix: 'o', text: 'old', id: 'n1', at: 'x' }, { claim: { verdict: '유지' }, fix: { verdict: '재작성', text: '덧붙일 문장', replace: false } });
assert(rf.type === 'add' && rf.text === '덧붙일 문장');
const rp = ac({ type: 'edit', fix: 'o', text: 'old', id: 'n1', at: 'x' }, { claim: { verdict: '유지' }, fix: { verdict: '재작성', text: 'new', replace: false } }, true);
assert.equal(rp.type, 'edit', 'proof items keep edit type');
// QA: [소소] 아래로는 편입·추가 불가(수준 5 초과 방지)
const deep = parseOutline(['## [장] A', '### [절] B', '#### [중] C', '##### [소] D', '###### [소소] E', '본문', '### [절] F', '본문'].join('\n'));
const did = t => deep.nodes.find(n => n.title === t).id;
const rvD = { book: { placement: [{ id: did('F'), to: did('E') }], add: [{ item: '새', where: did('E') }] } };
const PD = applyOps(deep, [{ k: 'ai:book|placement|0' }, { k: 'ai:book|add|0' }], rvD);
assert(PD.conflicts['ai:book|placement|0'] && PD.conflicts['ai:book|add|0'], 'nothing goes below [소소]');
assert(PD.nodes.every(n => n.level <= 5 && n.label !== '[undefined]'));
// QA: 숫자 수준은 0~5만(6~9는 무시)
assert.equal(cleanBookReview({ items: [{ tier: 'A', type: 'heading', where: 'x', problem: 'p', id: id('D'), level: '7' }] }, t).items[0].level, -1);

// 재검토: 이전 지적을 p1…로 넘기고 추적 결과를 이전 항목과 짝지음 (가짜 호출 — 실제 API 없음)
module.exports = (async () => {
  let sent = '';
  sb.parseAiJson = s => JSON.parse(s); // app.js는 이 테스트에서 안 읽음
  sb.callClaudeApi = async o => { sent = o.prompt; return JSON.stringify({ items: [], tracking: [{ prev: 'p1', status: '유지', reason: 'r' }] }); };
  const again = await sb.P26.reviewLogic(t, 'k', { useConcept: false, useToc: false, memo: '' }, lr);
  assert(sent.includes('## 이전 지적') && sent.includes('p1. [A]') && sent.includes('대상 독자가 명시되지 않음'), sent.slice(0, 300));
  assert.equal(again.prevItems[0].no, 'p1');
  assert.equal(again.tracking[0].status, '유지');
  console.log('PASS: structure review — markers/styles/mixed outline, chapter balance, split/promote flags, AI response cleaning, proposed outline ops, re-review tracking');
})();
module.exports.catch(e => { console.error(e); process.exit(1); });
