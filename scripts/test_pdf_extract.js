#!/usr/bin/env node
/**
 * PDF 추출 ①②③④ 회귀 테스트 — 합성 글자 조각(pdf.js getTextContent 모양)으로 검사. 실제 PDF·pdf.js 없이 돈다.
 *  ① 경계 기록: 기록을 켜도 본문이 같고, gap/sp/none/ws 위치가 정확하며, 원문에 사설 영역 문자·연속 공백이 있어도 본문이 바뀌지 않는다
 *  ②  분류: 같은 문구가 여러 곳이어도 위치로 판정, 위치 없는 지적은 전부 경계일 때만, 글자가 근거인 유형은 그대로
 *  ③  제목 수준 보호: 추정 수준(guess/number)의 heading 변경은 H, 번호가 있어도 예외 없음, mark/style은 그대로
 *  ④  태그: 같은 문단은 잇고 다른 문단은 나눔, 멀리 떨어진 줄은 태그만으로 잇지 않음, 태그 없으면 기존 판정
 */
'use strict';
const assert = require('assert');
module.exports = function run(sb, { pass, fail }) {
  const E = sb.__p8Eval, R = sb.P8Review;
  if (!sb.P26) require('./run_tests.js').loadScript(sb, 'panels/panel26/panel26.js'); // ③은 panel26 필요
  const flags = E._setPdfFlags({});
  E._setPdfFlags({ keepWs: false, useTags: false }); // ①은 기존 동작 기준으로 검사, 끝에 복원
  // 조각: 글자 폭은 글자당 fs*0.5
  const it = (str, x, y, fs = 10, extra = {}) => ({ str, transform: [fs, 0, 0, fs, x, y], width: str.length * fs * 0.5, fontName: 'F1', ...extra });
  const H = 700;
  // 한 쪽을 끝까지(반복 머리글 제거 → 압축 → 보이지 않는 문자 제거 → 경계 확정) 처리
  const finish = (pagesIn) => {
    const pages = pagesIn.map(p => ({ ...p }));
    E._stripPdfRepeatingRegions(pages);
    for (const p of pages) { p.text = E._compressForTokens(p.text); if (p._shadow != null) p._shadow = E._compressForTokens(p._shadow); }
    for (const p of pages) { p.text = sb.stripInvisibles(p.text); E._extractJoins(p); }
    return pages;
  };
  const build = (items, i = 1, tag = null) => E._buildPdfPage({ items, styles: {} }, 500, H, i, tag);
  const checkJoins = (p) => {
    assert(Array.isArray(p.joins), 'joins recorded');
    for (const j of p.joins) {
      if (j.kind === 'none') assert(j.pos > 0 && j.pos < p.text.length && p.text[j.pos - 1] !== ' ' && p.text[j.pos] !== ' ', 'none pos ' + j.pos);
      else assert(p.text[j.pos] === ' ', j.kind + ' pos must be a space: ' + j.pos);
    }
  };
  try {
    // ── ① 기본: 간격 공백(gap), 줄 연결 공백(sp), 공백 없는 연결(none) ──
    // 줄1: "모델은" + 간격 + "데이터를" → gap. 줄2는 한글로 시작하고 줄1 길이>15 → none. 줄3은 영문 시작 → sp
    const items1 = [it('모델은', 50, 600), it('데이터를 학습하고 결과를', 90, 600), it('분석합니다 그리고 다시', 50, 586), it('Transformer 구조를', 50, 572)];
    const p1 = finish([build(items1)])[0];
    const plain = E._joinLinesSmartly(E.groupTextIntoLines(items1), H);
    assert.strictEqual(p1.text, sb.stripInvisibles(E._compressForTokens(plain)), '본문은 기록 없이 만든 것과 같다');
    checkJoins(p1);
    assert.strictEqual(p1.joins.map(j => j.kind).join(','), 'gap,none,sp', 'kinds in order: ' + JSON.stringify(p1.joins)); // vm 배열이라 deepStrictEqual은 프로토타입이 달라 못 쓴다
    assert.strictEqual(p1.text.slice(p1.joins[0].pos - 1, p1.joins[0].pos + 2), '은 데', 'gap at 모델은|데이터를');
    assert.strictEqual(p1.text.slice(p1.joins[1].pos - 1, p1.joins[1].pos + 1), '를분', 'none at 결과를|분석합니다');
    assert.strictEqual(p1.text.slice(p1.joins[2].pos - 1, p1.joins[2].pos + 2), '시 T', 'sp at 다시|Transformer');
    assert(!/[-]/.test(p1.text) && !('_shadow' in p1) && !('_marks' in p1), '본문·페이지에 표식이 남지 않는다');
    pass('① gap/sp/none 위치 기록, 본문 불변');

    // ── ① 충돌: 원문에 표식 후보 문자가 있어도 본문 그대로, 다른 후보로 기록 ──
    const items2 = [it('모델은', 50, 600), it('데이터를 학습하고 결과를', 95, 600), it('분석합니다 그리고 다시', 50, 586)];
    const p2 = finish([build(items2)])[0];
    assert(p2.text.includes(''), '원문의 사설 영역 문자 보존');
    checkJoins(p2); assert.strictEqual(p2.joins.length, 2);
    const items3 = [it('모델은' + '', 50, 600), it('데이터를', 120, 600)];
    const p3 = finish([build(items3)])[0];
    assert.strictEqual(p3.joins, null, '후보가 모자라면 기록 포기');
    assert.strictEqual(p3.text, sb.stripInvisibles(E._compressForTokens(E._joinLinesSmartly(E.groupTextIntoLines(items3), H))), '포기해도 본문은 같다');
    pass('① 표식 문자 충돌 처리');

    // ── ① 연속 공백·보이지 않는 문자: 본문은 기존과 같고, 기록은 유효하거나 포기 ──
    const items4 = [it('값은   세   개', 50, 600), it('이다 그리고', 130, 600), it('다음 줄 영문 Start', 50, 586)];
    const p4 = finish([build(items4)])[0];
    assert.strictEqual(p4.text, sb.stripInvisibles(E._compressForTokens(E._joinLinesSmartly(E.groupTextIntoLines(items4), H))));
    assert(!/   /.test(p4.text) && !/ /.test(p4.text), '압축·정규화는 그대로');
    if (p4.joins) checkJoins(p4);
    pass('① 연속 공백·NBSP가 있어도 본문 동일(기록 ' + (p4.joins ? p4.joins.length + '건' : '포기') + ')');

    // ── ① 반복 머리글 제거 뒤에도 위치가 맞는다 ──
    const mk = (n) => build([it('러닝헤드 제목', 50, 690), it('본문은', 50, 600), it('여기부터 시작합니다 길게', 90, 600), it('이어지는 둘째 줄입니다', 50, 586), it('셋째 줄도 길게 이어집니다', 50, 572), it('넷째 줄도 길게 이어집니다', 50, 558), it('다섯째 줄도 길게 이어집니다', 50, 544), it(String(n), 480, 20)], n);
    const ps = finish([mk(1), mk(2), mk(3), mk(4)]);
    for (const p of ps) { assert(!p.text.includes('러닝헤드'), '머리글 제거'); checkJoins(p); assert(p.joins.length >= 2); }
    pass('① 머리글 제거 뒤 경계 위치 유지');

    // ── ①b 공백 조각 보존(플래그) — 중복 공백·단어 붙음 없음 ──
    E._setPdfFlags({ keepWs: true });
    const ws1 = [it('멀티', 50, 600, 20), it(' ', 70, 600, 20, { width: 0.4 }), it('에이전트', 70.5, 600, 20), it(' ', 150, 600, 20, { width: 0.4 }), it('이해하기', 151, 600, 20)];
    const lw = E.groupTextIntoLines(ws1);
    assert.strictEqual(lw[0].text, '멀티 에이전트 이해하기', 'ws 조각이 공백 하나로: ' + JSON.stringify(lw[0].text));
    const ws2 = [it('이미 ', 50, 600), it(' ', 80, 600, 10, { width: 0.3 }), it('공백', 81, 600), it(' ', 100, 600, 10, { width: 0.3 })];
    assert.strictEqual(E.groupTextIntoLines(ws2)[0].text, '이미 공백', '이미 공백으로 끝나면 더 넣지 않고, 줄 끝 공백 조각은 버린다');
    const ws3 = [it(' ', 40, 600, 10, { width: 0.3 }), it('첫', 50, 600)];
    assert.strictEqual(E.groupTextIntoLines(ws3)[0].text, '첫', '줄 시작 공백 조각은 버린다');
    E._setPdfFlags({ keepWs: false });
    assert.strictEqual(E.groupTextIntoLines(ws1)[0].text, '멀티에이전트 이해하기', '플래그 꺼지면 기존 동작(첫 간격 0.5pt < 25% → 공백 없음)');
    // 줄 끝 공백 조각 = 그 자리에 공백이 있었다는 근거 → 한글-한글 줄 연결에도 공백
    const ws4 = [it('계정 인증을 하려면 먼저 구글', 50, 600), it(' ', 190, 600, 10, { width: 0.3 }), it('계정에 로그인합니다', 50, 586)];
    E._setPdfFlags({ keepWs: true });
    const j4 = E._joinLinesSmartly(E.groupTextIntoLines(ws4), H);
    assert(j4.includes('구글 계정에'), '줄 끝 공백 조각 → 줄 연결에 공백: ' + JSON.stringify(j4));
    E._setPdfFlags({ keepWs: false });
    assert(E._joinLinesSmartly(E.groupTextIntoLines(ws4), H).includes('구글계정에'), '플래그 꺼지면 기존(한글-한글 붙임)');
    // 공백 조각이 있어도 조각 순서(위첨자 줄 포함)는 기존과 같아야 한다 — 공백만 빼면 같은 글자열
    const sup = [it('하나의 작업', 100, 600), it('Task', 160, 602.6, 6), it(' ', 172, 602.6, 6, { width: 0.1 }), it('이 수행되는 동안', 173, 600), it('AgentContext', 50, 600, 10)];
    E._setPdfFlags({ keepWs: false }); const offT = E.groupTextIntoLines(sup).map(l => l.text).join('|');
    E._setPdfFlags({ keepWs: true }); const onT = E.groupTextIntoLines(sup).map(l => l.text).join('|');
    assert.strictEqual(onT.replace(/ /g, ''), offT.replace(/ /g, ''), '공백 조각은 순서를 바꾸지 않는다: ' + JSON.stringify([offT, onT]));
    E._setPdfFlags({ keepWs: false });
    pass('①b 공백 조각 보존·줄 끝 공백·순서 불변');
    // ④ 태그 모드의 줄 묶기(stable): 입력 순서·조각 수와 무관하게 줄 안은 x 순서
    const sup2 = [it('이 수행되는', 200, 600), it('Task', 160, 602.6, 6), it('하나의 작업', 100, 600), it('AgentContext', 50, 600)];
    assert.strictEqual(E.groupTextIntoLines(sup2, 3, true).map(l => l.text).join('|').replace(/ /g, ''), 'AgentContext하나의작업Task이수행되는', 'stable 묶기: 줄 안 x 순서(공백은 간격 규칙대로)');
    assert.strictEqual(E.groupTextIntoLines(sup2, 3, true).length, 1);
    pass('④ stable 줄 묶기');

    // ── ② 분류 ──
    const page = { text: '이것을 할수 있다. 그래서 저것도 할수 있다. 반복 반복 끝.', joins: [] };
    const i2 = page.text.indexOf('할수', 10);
    page.joins = [{ pos: i2 + 1, kind: 'none' }];
    const base = R.classify({ type: '띄어쓰기', found: '할수', start: page.text.indexOf('할수') }, page.text, page.joins);
    assert.strictEqual(base.level, 'review', '첫 번째 할수는 경계가 아니라 그대로');
    assert.strictEqual(R.classify({ type: '띄어쓰기', found: '할수', start: i2 }, page.text, page.joins).level, 'layout', '경계에 걸친 두 번째는 조판·추출 확인');
    const amb = R.classify({ type: '띄어쓰기', found: '할수' }, page.text, page.joins);
    assert(amb.level === 'review' && amb.edge === 'ambiguous', '위치 없는 지적·여러 곳 중 일부만 경계 → 분류 유지, 불확실 표시');
    page.joins.push({ pos: page.text.indexOf('할수') + 1, kind: 'none' });
    assert.strictEqual(R.classify({ type: '띄어쓰기', found: '할수' }, page.text, page.joins).level, 'layout', '전부 경계면 확인 대상');
    assert.strictEqual(R.classify({ type: '오탈자', found: '할수', start: i2, source: 'surface', ruleId: '오탈자:x' }, page.text, page.joins).level, 'correction', '글자가 근거인 유형은 그대로');
    const t3 = '앞 줄 끝  다음 줄';
    const ex = R.classify({ type: '불필요한공백', found: '끝  다', start: t3.indexOf('끝') }, t3, [{ pos: t3.indexOf('끝') + 1, kind: 'sp' }]);
    assert.strictEqual(ex.level, 'extract', '줄 연결 공백이 겹침을 만들면 추출 영향');
    const ex2 = R.classify({ type: '불필요한공백', found: '끝  다', start: t3.indexOf('끝') }, t3, [{ pos: t3.indexOf('끝') + 1, kind: 'gap' }]);
    assert.strictEqual(ex2.level, 'layout', '간격 공백은 확정 근거가 아니라 확인 대상');
    assert.strictEqual(R.classify({ type: '띄어쓰기', found: '할수', start: 0 }, page.text, null).level, 'review', 'joins 없으면(DOCX·MD) 기존 분류');
    assert(R.isEdgeLevel('layout') && R.isEdgeLevel('extract') && !R.isEdgeLevel('review'));
    pass('② 경계 분류 — 위치·중복·유형·확정 근거');

    // ── ③ 제목 수준 보호 ──
    const P26 = sb.P26;
    const outline = P26.parseOutline('## 1.1 첫 절\n본문\n### 1.1.1 작은 제목\n본문', false, true); // PDF: 전부 guess
    const r3 = P26.cleanBookReview({ items: [
      { type: 'heading', id: 'n2', level: '[절]', where: '1.1.1', problem: '수준', fix: '절로', tier: 'A' },
      { type: 'move', id: 'n2', to: 'n1', where: 'x', problem: 'p', fix: 'f', tier: 'A' },
    ] }, outline);
    assert(r3.items[0].tier === 'H' && r3.items[0].levelUnsure && !P26.bookApplicable(r3.items[0]), '번호가 있어도 추정 수준의 heading은 H');
    assert(r3.items[1].tier === 'A' && !r3.items[1].levelUnsure, 'move는 이번 보호 대상 아님(미보호 범위로 보고)');
    const o2 = P26.parseOutline('# [장] 첫 장\n본문\n## [절] 첫 절\n본문', false, false);
    const r4 = P26.cleanBookReview({ items: [{ type: 'heading', id: 'n2', level: '[중]', where: 'x', problem: 'p', fix: 'f', tier: 'A' }] }, o2);
    assert(r4.items[0].tier === 'A' && P26.bookApplicable(r4.items[0]), '원고 표시 근거면 그대로');
    const o3 = P26.parseOutline('4장 시작\n본문\n4.1 첫 절\n본문', false, false); // 번호 줄 추정
    const r5 = P26.cleanBookReview({ items: [{ type: 'heading', id: 'n2', level: '[중]', where: 'x', problem: 'p', fix: 'f', tier: 'A' }] }, o3);
    assert(r5.items[0].tier === 'H', '번호 줄 추정(number)도 H');
    pass('③ 추정 수준 heading 보호');

    // ── ④ 태그 문단 경계 ──
    const tagA = [it('첫 문단 첫 줄입니다 길게 씁니다', 50, 600, 10, { para: 1 }), it('둘째 줄은 굵게', 50, 586, 10, { para: 1, fontName: 'F1-Bold' }), it('새 문단 시작', 50, 572, 10, { para: 2 })];
    const ta = E._joinLinesSmartly(E.groupTextIntoLines(tagA), H);
    assert(ta.startsWith('첫 문단 첫 줄입니다 길게 씁니다둘째 줄은 굵게\n'), '같은 문단은 굵기 변화와 무관하게 잇고(한글-한글은 기존대로 공백 없음) 다른 문단은 나눔: ' + JSON.stringify(ta));
    // 같은 P라도 앞 줄이 오른쪽 끝에 못 미치면(강제 개행·도비라 목록) 잇지 않는다
    const tagC = [it('1.1 첫째 항목', 50, 600, 10, { para: 1 }), it('1.2 둘째 항목은 더 긴 줄입니다', 50, 586, 10, { para: 1 })];
    assert(E._joinLinesSmartly(E.groupTextIntoLines(tagC), H).includes('\n'), '짧게 끝난 줄은 같은 P여도 새 줄');
    // 원어 라벨(작은 글자) 뒤의 제목은 같은 P여도 제목으로 남는다; 같은 크기의 두 줄 제목은 잇는다
    const tagD = [it('Memory', 50, 602, 7, { para: 1 }), it('메모리 - 상태를 유지하는 요소', 50, 590, 14, { para: 1 }), it('본문 첫 줄입니다 길게 길게 길게 길게', 50, 570, 10, { para: 2 }), it('본문 둘째 줄입니다 길게 길게 길게', 50, 556, 10, { para: 2 })];
    const td = E._joinLinesSmartly(E.groupTextIntoLines(tagD), H);
    assert(/\n#+ 메모리 - 상태를 유지하는 요소\n/.test(td), '라벨 뒤 제목 보존: ' + JSON.stringify(td));
    const tagE = [it('멀티 에이전트 시스템의', 50, 600, 20, { para: 1 }), it('기초', 50, 576, 20, { para: 1 }), it('본문 첫 줄입니다 길게 길게 길게 길게', 50, 556, 10, { para: 2 }), it('본문 둘째 줄입니다 길게 길게 길게', 50, 542, 10, { para: 2 }), it('본문 셋째 줄입니다 길게 길게 길게', 50, 528, 10, { para: 2 }), it('본문 넷째 줄입니다 길게 길게 길게', 50, 514, 10, { para: 2 }), it('본문 다섯째 줄입니다 길게 길게', 50, 500, 10, { para: 2 })]; // 본문 줄이 많아야 본문 크기 중앙값이 10
    assert(E._joinLinesSmartly(E.groupTextIntoLines(tagE), H).startsWith('## 멀티 에이전트 시스템의 기초\n'), '같은 크기 두 줄 제목은 한 제목으로');
    const tagB = [it('첫 문단 첫 줄입니다 길게 씁니다', 50, 600, 10, { para: 1 }), it('한참 아래 같은 문단', 50, 400, 10, { para: 1 })];
    assert(E._joinLinesSmartly(E.groupTextIntoLines(tagB), H).includes('\n'), '멀리 떨어진 줄은 태그만으로 잇지 않는다');
    const noTag = [it('첫 문단 첫 줄은 굵게 씁니다', 50, 600, 10, { fontName: 'F1-Bold' }), it('둘째 줄은 보통 굵기', 50, 586)];
    assert(E._joinLinesSmartly(E.groupTextIntoLines(noTag), H).includes('\n'), '태그 없으면 기존 판정(굵게→보통 전환 = 문단)');
    const tagF = [it('첫 문단 첫 줄은 굵게 씁니다', 50, 600, 10, { para: 1, fontName: 'F1-Bold' }), it('2nd 줄은 보통 굵기', 50, 586, 10, { para: 1 })]; // 다음 줄이 숫자로 시작 → 공백 연결
    assert(!E._joinLinesSmartly(E.groupTextIntoLines(tagF), H).includes('\n'), '같은 P면 굵기 전환이어도 잇는다(공백이 들어가는 연결)');
    // 기존 판정이 나누던 자리를 같은 P라고 공백 없이 붙이게 되면 기존대로 나눈다(어절 경계 공백은 확인 불가)
    const tagG = [it('상태 변경 결과가 유실 없이 갱신되어야 하며 이력도', 50, 600, 10, { para: 1, fontName: 'F1-Bold' }), it('관리되어야 합니다', 50, 586, 10, { para: 1 })];
    assert(E._joinLinesSmartly(E.groupTextIntoLines(tagG), H).includes('이력도\n관리'), '한글-한글 무공백 결합이 될 자리는 기존 판정 유지');
    const tagH = [it('상태 변경 결과가 유실 없이 갱신되어야 하며 이력도', 50, 600, 10, { para: 1, fontName: 'F1-Bold' }), it('Update 관리', 50, 586, 10, { para: 1 })];
    assert(E._joinLinesSmartly(E.groupTextIntoLines(tagH), H).includes('이력도 Update'), '공백이 들어가는 연결은 태그대로 잇는다');
    // _tagPdfItems: 시작/종료 항목 제거, Artifact 분리, 구조 트리 연결
    const content = { items: [
      { type: 'beginMarkedContentProps', tag: 'Artifact', id: null }, it('12', 480, 20), { type: 'endMarkedContent' },
      { type: 'beginMarkedContentProps', tag: 'P', id: 'p1R_mc1' }, it('본문 조각', 50, 600), { type: 'beginMarkedContent', tag: 'Span' }, it('안쪽', 100, 600), { type: 'endMarkedContent' }, { type: 'endMarkedContent' },
      { type: 'beginMarkedContentProps', tag: 'P', id: 'p1R_mc2' }, it('다음 문단', 50, 586), { type: 'endMarkedContent' },
    ] };
    const fakePg = { getStructTree: async () => ({ role: 'Root', children: [{ role: 'P', children: [{ type: 'content', id: 'p1R_mc1' }] }, { role: 'P', children: [{ type: 'content', id: 'p1R_mc2' }] }] }) };
    return E._tagPdfItems(fakePg, content).then(tag => {
      assert.strictEqual(tag.artifacts.length, 1); assert.strictEqual(content.items.length, 3, '시작/종료 항목은 조각이 아니다');
      assert.strictEqual(content.items[1].para, 1, '안쪽 Span은 바깥 P의 문단');
      assert(content.items[0].para === 1 && content.items[2].para === 2 && tag.matched === 3);
      const pg = build(content.items, 1, tag);
      assert(!pg.text.includes('12') && pg.bodyPageNum === 12 && pg.artifacts[0].text === '12', 'Artifact는 본문에서 빠지고 쪽번호·검증 기록에는 남는다');
      assert.strictEqual(pg.text, '본문 조각 안쪽\n다음 문단');
      const noTree = { getStructTree: async () => null };
      const c2 = { items: [{ type: 'beginMarkedContentProps', tag: 'P', id: 'x' }, it('글', 50, 600), { type: 'endMarkedContent' }] };
      return E._tagPdfItems(noTree, c2).then(t2 => { assert(t2.matched === 0 && c2.items.length === 1 && c2.items[0].para === undefined, '트리 없으면 para 없음'); pass('④ 태그 문단·Artifact·폴백'); E._setPdfFlags(flags); });
    }).catch(e => { fail('PDF 추출 테스트: ' + (e && e.message)); E._setPdfFlags(flags); });
  } catch (e) {
    fail('PDF 추출 테스트: ' + (e && e.stack || e)); E._setPdfFlags(flags);
    return Promise.resolve();
  }
};
