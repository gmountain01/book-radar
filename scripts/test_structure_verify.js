// 원고 구조 검토(panel26) — 이동 검증 근거·적용 명령 일치·판정값 엄격 검사·캐시 재검증 (실제 API 없음, 가짜 응답)
// 잘못된 원고 변경이 실제로 막히는지(applyOps 결과)를 확인한다.
const assert = require('assert');
const { makeSandbox, loadScript } = require('./run_tests.js');

const sb = makeSandbox();
loadScript(sb, 'panels/panel26/panel26.js');
sb.parseAiJson = s => JSON.parse(s);
const P = sb.P26;
const { parseOutline, cleanBookReview, bookApplicable, applyOps, applyCheck, gatherEvidence, markStale } = P;

const LONG = ('긴 앞 문단입니다. ').repeat(80); // 약 900자 — 예전 700자 앞 절단이면 지적 구절이 사라지던 길이
const md = [
  '## [장] 1장', '### [절] 1.1 기초', LONG, '', '지적 구절 핵심 문장입니다. 이어지는 뒤 문맥 문장입니다.', '', '다음 문단 시작입니다. 여기까지 봐야 합니다.',
  '### [절] 1.2 응용', '응용 본문입니다. 1.1에서 배운 것을 씁니다.',
  '## [장] 2장', '### [절] 2.1 심화', '#### [중] 2.1.1 세부', '세부 본문입니다. 끝.',
  '### [절] 2.2 정리', '정리 본문입니다.',
].join('\n');
const o = parseOutline(md);
const id = t => o.nodes.find(n => n.title === t).id;
const titles = p => p.nodes.map(n => n.label + n.title).join(' ');
const base = titles(applyOps(o, [], {}));

// 1) 앞 문단이 700자를 넘어도 지적 구절·뒤 문맥이 근거에 남는다(구절 중심 창)
{
  const e = gatherEvidence(o, { id: id('1.1 기초'), quote: '지적 구절 핵심 문장입니다', kind: '기타' });
  assert(e.ev[0].tag.startsWith('지적 구절') && e.ev[0].text.includes('지적 구절 핵심 문장입니다') && e.ev[0].text.includes('이어지는 뒤 문맥'), e.ev[0].text);
  const prev = e.ev.find(x => x.tag.startsWith('앞 문맥')), next = e.ev.find(x => x.tag.startsWith('뒤 문맥'));
  assert(prev && prev.text.includes('생략') && prev.text.length < 400, '앞 문단은 끝부분만 + 생략 표시');
  assert(next && next.text.includes('다음 문단 시작'), '뒤 문맥 확보');
  assert(!e.ctxMissing && e.chars === e.text.length);
}
// 2) refs·검색어 없이도 to/before 목적지 문맥이 확보된다 — applyOps 동작(to=안 맨 끝, before=바로 앞) 그대로
{
  const e = gatherEvidence(o, { type: 'move', id: id('1.2 응용'), to: id('2.2 정리') });
  assert(e.ev.some(x => /옮길 제목 — 범위/.test(x.tag) && x.text.includes('응용 본문')), '출발지 본문·범위');
  assert(e.ev.some(x => /목적지 — 적용: '\[절\] 2.2 정리' 안 맨 끝/.test(x.tag) && x.text.includes('정리 본문입니다')), '목적지(to) 본문');
  assert(e.ev.some(x => /출발지 바로 앞 제목/.test(x.tag)), '출발지 앞뒤 연결');
  const b = gatherEvidence(o, { type: 'move', id: id('1.2 응용'), before: id('2.2 정리') });
  assert(b.ev.some(x => /바로 앞으로/.test(x.tag) && x.text.includes('정리 본문')) && b.ev.some(x => /이동 뒤 바로 앞에 오는 제목의 끝/.test(x.tag) && x.text.includes('세부 본문')), 'before: 기준 제목과 그 앞 제목 끝');
  const m = gatherEvidence(o, { type: 'move', id: id('1.2 응용'), to: 'n999' });
  assert(m.ctxMissing && m.essential.some(t => /목적지 제목\(to\)/.test(t)) && /\[필수 근거 부족\]/.test(m.text) && !m.covered.to, '목적지를 못 찾으면 필수 근거 부족으로 표시');
  assert(gatherEvidence(o, { type: 'move', id: id('1.2 응용') }).ctxMissing, '목적지 없음도 한계');
}
// 3) 목적지 직접 본문이 비어도 하위 제목의 내용을 근거로 모은다
{
  const e = gatherEvidence(o, { type: 'move', id: id('1.2 응용'), to: id('2.1 심화') });
  const d = e.ev.find(x => /목적지 — 적용/.test(x.tag));
  assert(d && d.text.includes('직접 본문 없음 — 하위 제목: [중] 2.1.1 세부') && d.text.includes('편입 직전 내용') && d.text.includes('세부 본문입니다'), d && d.text);
  assert(!e.ctxMissing);
}
// 4) 이동 수정안이 '현행 유지'로 재작성되면 기존 이동이 실행되지 않는다
{
  const rv = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '2.2 아래로 이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  const x = rv.items[0];
  assert(bookApplicable(x), '검증 전 이동 후보는 적용 가능');
  applyCheck(x, { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '현재 위치를 유지하고 제목만 다듬는다', apply: { type: 'none' } } }, false, o);
  assert(x.noApply && !bookApplicable(x) && P.holdReason(x));
  assert.equal(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv })), base, '수락해도 목차가 바뀌지 않는다');
  // apply 없이 설명만 재작성된 구조 변경 — 이전 to가 실행되면 안 된다
  const rv2 = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  applyCheck(rv2.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '현재 위치 유지' } }, false, o);
  assert(rv2.items[0].applyMismatch && rv2.items[0].fixHeld && !bookApplicable(rv2.items[0]));
  assert.equal(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv2 })), base);
  // 새 명령이 원고에서 확인되면 그 명령으로 바뀐다(이전 to는 남지 않음)
  const rv3 = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  applyCheck(rv3.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '2.1 심화 앞으로', apply: { type: 'move', id: id('1.2 응용'), before: id('2.1 심화') } } }, false, o);
  const x3 = rv3.items[0];
  // 목적지가 2.2(to)에서 2.1 앞(before)으로 바뀌었는데 그 문맥은 이 검증에 없었다 → 명령은 바꾸되 '변경된 목적지 문맥 미검증'으로 보류
  assert(x3.applyRewritten && x3.before === id('2.1 심화') && x3.to === '' && x3.destUnverified && !bookApplicable(x3), P.holdReason(x3));
  assert.equal(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv3 })), base, '문맥 없는 새 목적지로는 이동하지 않는다');
  // 같은 목적지를 다시 쓴 경우(문맥이 이미 전달됨)는 적용 — verifyCandidates가 covered를 채운다
  const rv3b = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  const ev3 = gatherEvidence(o, rv3b.items[0]); rv3b.items[0].evidence = { covered: ev3.covered, essential: ev3.essential, items: ev3.ev, limits: ev3.limits };
  applyCheck(rv3b.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '같은 곳으로, 이유만 보강', apply: { type: 'move', id: id('1.2 응용'), to: id('2.2 정리') } } }, false, o);
  assert(rv3b.items[0].applyRewritten && !rv3b.items[0].destUnverified && bookApplicable(rv3b.items[0]));
  assert(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv3b })).endsWith('[절]2.2 정리 [중]1.2 응용'));
  // 같은 대상 ID라도 to→before로 바뀌면 삽입 위치·소속이 달라 미검증
  const rv3c = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  const ev3c = gatherEvidence(o, rv3c.items[0]); rv3c.items[0].evidence = { covered: ev3c.covered };
  applyCheck(rv3c.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '2.2 앞으로', apply: { type: 'move', id: id('1.2 응용'), before: id('2.2 정리') } } }, false, o);
  assert(rv3c.items[0].destUnverified && !bookApplicable(rv3c.items[0]) && /바로 앞/.test(rv3c.items[0].destUnverified));
  assert.equal(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv3c })), base);
  // 캐시 복원(JSON 왕복) 뒤에도 같은 사유로 차단
  const back = JSON.parse(JSON.stringify(rv3c));
  assert(!bookApplicable(back.items[0]) && P.holdReason(back.items[0]) === rv3c.items[0].destUnverified);
  // 새 명령이 원고에서 확인되지 않으면(없는 ID) 보류
  const rv4 = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  applyCheck(rv4.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: 'x', apply: { type: 'move', id: id('1.2 응용'), to: 'n404' } } }, false, o);
  assert(rv4.items[0].applyMismatch && !bookApplicable(rv4.items[0]));
  assert.equal(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv4 })), base);
}
// 5) 재작성 설명과 실제 적용 문장이 불일치하면(설명만 바뀜) 이전 문장을 적용하지 않는다
{
  const rv = cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: '1.2', problem: 'p', fix: '문장 교체', id: id('1.2 응용'), at: '응용 본문입니다.', text: '옛 문장입니다.' }] }, o);
  applyCheck(rv.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '더 정확한 표현으로 바꾼다' } }, false, o);
  assert(rv.items[0].applyMismatch && !bookApplicable(rv.items[0]));
  const p = applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv });
  assert(p.byId[id('1.2 응용')].text.includes('응용 본문입니다.') && !p.byId[id('1.2 응용')].text.includes('옛 문장'), '옛 문장이 적용되면 안 된다');
  // text가 함께 오면 새 문장으로 적용
  const rv2 = cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: '1.2', problem: 'p', fix: '교체', id: id('1.2 응용'), at: '응용 본문입니다.', text: '옛 문장입니다.' }] }, o);
  applyCheck(rv2.items[0], { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '교체', text: '새 문장입니다.', replace: true } }, false, o);
  assert(bookApplicable(rv2.items[0]) && applyOps(o, [{ k: 'ai:book|items|0' }], { book: rv2 }).byId[id('1.2 응용')].text.startsWith('새 문장입니다.'));
}
// 6) 빈 판정값·잘못된 판정값·후보 번호 연결 오류는 승인이 아니다
{
  const mk = () => cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: '1.2', problem: 'p', fix: 'f', id: id('1.2 응용'), at: '응용 본문입니다.', text: '바꾼 문장.' }] }, o).items[0];
  const a = mk(); applyCheck(a, { claim: {}, fix: {} }, false, o);
  assert(a.checkInvalid && a.held && !bookApplicable(a) && a.check.claim === '판정 없음');
  const b = mk(); applyCheck(b, { claim: { verdict: '유지' }, fix: { verdict: 'ok' } }, false, o);
  assert(b.fixHeld && b.checkInvalid && !bookApplicable(b));
  const c = mk(); applyCheck(c, { claim: { verdict: 'approved' }, fix: { verdict: '적합' } }, false, o);
  assert(c.held && !bookApplicable(c));
  const d = mk(); applyCheck(d, { invalid: '번호 중복' }, false, o);
  assert(d.unverified && !bookApplicable(d));
  // verifyCandidates: 가짜 검증 응답에서 번호 중복·누락·범위 밖 — 둘 다 '검증 못 함'
  const items = [mk(), mk(), mk()];
  sb.callClaudeApi = async () => ({ text: JSON.stringify({ results: [{ i: 0, claim: { verdict: '유지' }, fix: { verdict: '적합' } }, { i: 0, claim: { verdict: '유지' }, fix: { verdict: '적합' } }, { i: 7, claim: { verdict: '유지' }, fix: { verdict: '적합' } }] }), searches: 0, searchErrors: [], sources: [], stopReason: 'end_turn' });
  return P.verifyCandidates(o, [{ list: items }], 'k', null, null, '').then(st => {
    assert(items.every(x => x.unverified && !bookApplicable(x)), '중복(0)·누락(1,2)·범위 밖(7) 전부 검증 못 함');
    assert(st.calls === 1 && st.sentChars > 0 && st.n === 3, '전송량 기록');
    return step7();
  });
}
function step7() {
  // 7) 기술 사실 미확인 — A/B/교정 모두 자동 반영 차단
  const mk = tier => cleanBookReview({ items: [{ tier, type: 'edit', where: '1.2', problem: 'p', fix: 'f', id: id('1.2 응용'), at: '응용 본문입니다.', text: '바꾼 문장.' }] }, o).items[0];
  const tech = { needed: true, status: '확인 못 함', sources: [] };
  const A = mk('A'); applyCheck(A, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech }, false, o);
  assert(A.tier === 'C' && A.downgraded && A.techHold && !bookApplicable(A));
  const B = mk('B'); applyCheck(B, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech }, false, o);
  assert(B.tier === 'B' && B.techHold && !bookApplicable(B), 'B도 차단');
  const Pf = mk('A'); applyCheck(Pf, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech }, true, o);
  assert(Pf.techHold && !bookApplicable(Pf), '교정 묶음도 차단');
  const ok = mk('A'); applyCheck(ok, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech: { needed: true, status: '출처 확인', sources: ['https://example.org/doc'] } }, false, o);
  assert(!ok.techHold && bookApplicable(ok));
  const fake = mk('A'); applyCheck(fake, { claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech: { needed: true, status: '출처 확인', sources: [] } }, false, o);
  assert(fake.techHold && !bookApplicable(fake), 'URL 없는 출처 확인은 인정하지 않음');
  assert.equal(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: { items: [B] } })), base);
  // 8) 원고에 없는 인용을 근거로 한 이동·수정은 적용되지 않지만, 새 제목 추가는 인용이 필수가 아니다
  const rv = cleanBookReview({ items: [
    { tier: 'A', type: 'move', where: '1.2', quote: '원고에 없는 문장', problem: 'p', fix: 'f', id: id('1.2 응용'), to: id('2.2 정리') },
    { tier: 'A', type: 'add', where: '2.2 앞', quote: '원고에 없는 문장', problem: 'p', fix: 'f', title: '새 절', before: id('2.2 정리') },
    { tier: 'A', type: 'edit', where: '1.2', quote: '응용 본문입니다.', problem: 'p', fix: 'f', id: id('1.2 응용'), at: '응용 본문입니다.', text: '바꾼 문장.' },
  ] }, o);
  rv.items.forEach(x => applyCheck(x, { claim: { verdict: '유지' }, fix: { verdict: '적합' } }, false, o));
  assert(rv.items[0].quoteMissing && !bookApplicable(rv.items[0]), '인용 없는 이동 차단');
  assert(rv.items[1].quoteMissing && bookApplicable(rv.items[1]), '새 제목 추가는 허용');
  assert(bookApplicable(rv.items[2]));
  const p8 = applyOps(o, [0, 1, 2].map(i => ({ k: `ai:book|items|${i}` })), { book: rv });
  assert(titles(p8).includes('[절]새 절 [절]2.2 정리') && !titles(p8).includes('[장]2장 [절]1.2') && p8.byId[id('1.2 응용')].text.startsWith('바꾼 문장.'), titles(p8));
  // 알 수 없는 묶음은 H(자동 반영 안 함)
  assert.equal(cleanBookReview({ items: [{ tier: '중요', type: 'edit', where: 'x', problem: 'p', id: id('1.2 응용'), at: '응용 본문입니다.', text: 't' }] }, o).items[0].tier, 'H');
  assert.equal(P.cleanLogicReview({ items: [{ tier: 'high', question: 'q', fix: 'f', id: id('1.2 응용'), at: '응용 본문입니다.', text: 't' }] }, o).items[0].tier, 'C');
  // 9) 정상 이동·순서·수정·추가·수준 변경은 계속 작동
  const rv9 = cleanBookReview({ items: [
    { tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '2.2 안으로', id: id('1.2 응용'), to: id('2.2 정리') },
    { tier: 'A', type: 'move', where: '2.1', problem: 'p', fix: '1.1 앞으로', id: id('2.1 심화'), before: id('1.1 기초') },
    { tier: 'A', type: 'add', where: '1.1', problem: 'p', fix: '문단 추가', id: id('1.1 기초'), at: '다음 문단 시작입니다.', text: '추가한 문단.' },
    { tier: 'A', type: 'heading', where: '2.1.1', problem: 'p', fix: '[절]로', id: id('2.1.1 세부'), level: '[절]' },
  ] }, o);
  rv9.items.forEach(x => applyCheck(x, { claim: { verdict: '유지', reason: 'E1' }, fix: { verdict: '적합', reason: 'E2' }, tech: { needed: false } }, false, o));
  assert(rv9.items.every(bookApplicable), rv9.items.map(P.holdReason).join('|'));
  const p9 = applyOps(o, [0, 1, 2, 3].map(i => ({ k: `ai:book|items|${i}` })), { book: rv9 });
  assert(!Object.keys(p9.conflicts).length, JSON.stringify(p9.conflicts));
  assert(titles(p9).includes('[절]2.1 심화 [절]2.1.1 세부 [절]1.1 기초') && titles(p9).endsWith('[절]2.2 정리 [중]1.2 응용'), titles(p9));
  assert(p9.byId[id('1.1 기초')].text.includes('추가한 문단.'));
  // 검증 프롬프트에 적용 명령·판단 기준이 들어가는지
  const items = [cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o).items[0]];
  let sent = '';
  sb.callClaudeApi = async opt => { sent = opt.prompt; return { text: JSON.stringify({ results: [{ i: 0, claim: { verdict: '유지' }, fix: { verdict: '적합' } }] }), searches: 0, searchErrors: [], sources: [], stopReason: 'end_turn' }; };
  return P.verifyCandidates(o, [{ list: items }], 'k', null, null, '### 책 컨셉\n- 대상 독자: 입문자').then(() => {
    assert(sent.includes('판단 기준(후보 생성과 동일)') && sent.includes('대상 독자: 입문자'), '판단 기준 전달');
    assert(/적용 명령\(수락 시 실제로 실행됨\): 이동: \[절\] 1\.2 응용 → '\[절\] 2\.2 정리' 안 맨 끝으로 편입/.test(sent), sent.slice(0, 600));
    assert(sent.includes('목적지 — 적용') && !sent.includes(LONG) && sent.length < 6000, '목적지 근거 포함, 긴 앞 문단 전체(900자)는 보내지 않음: ' + sent.length);
    assert(bookApplicable(items[0]));
    return stepEssential();
  });
}
function stepEssential() {
  // 필수 근거 부족: AI가 '유지·적합'을 돌려줘도 적용되지 않는다(목적지 없음 / 대상 원문을 못 찾음)
  const mk = extra => cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), ...extra }] }, o).items[0];
  const okAll = async () => ({ text: JSON.stringify({ results: [0, 1, 2, 3].map(i => ({ i, claim: { verdict: '유지' }, fix: { verdict: '적합' }, tech: { needed: false } })) }), searches: 0, searchErrors: [], sources: [], stopReason: 'end_turn' });
  sb.callClaudeApi = okAll;
  const noDest = mk({});                       // to/before 없음
  const badDest = mk({ to: 'n404' });          // 목적지 없음
  const lost = cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: '1.2', quote: '응용 본문입니다.', problem: 'p', fix: 'f', id: id('1.2 응용'), at: '응용 본문입니다.', text: '바꾼 문장.' }] }, o).items[0];
  lost.quote = '원고 어디에도 없는 구절'; lost.at = ''; // 대상 원문(at·quote)을 본문에서 못 찾는 경우
  const fine = mk({ to: id('2.2 정리') });
  return P.verifyCandidates(o, [{ list: [noDest, badDest, lost, fine] }], 'k', null, null, '').then(st => {
    assert(noDest.ctxMissing && !bookApplicable(noDest) && /목적지/.test(noDest.ctxMissing), P.holdReason(noDest));
    assert(badDest.ctxMissing && !bookApplicable(badDest));
    assert(lost.ctxMissing && /대상 원문/.test(lost.ctxMissing) && !bookApplicable(lost), P.holdReason(lost));
    assert(!fine.ctxMissing && bookApplicable(fine), '필수 근거가 있는 정상 이동은 적용');
    assert.equal(st.essentialMissing, 3);
    assert.equal(titles(applyOps(o, [0, 1, 2].map(i => ({ k: `ai:book|items|${i}` })), { book: { items: [noDest, badDest, lost] } })), base);
    assert(titles(applyOps(o, [{ k: 'ai:book|items|0' }], { book: { items: [fine] } })).endsWith('[절]2.2 정리 [중]1.2 응용'));
    // 보조 근거만 생략(예산 초과)되고 필수 문맥은 충분한 경우 — 생략 사실만으로 차단하지 않는다
    const big = ['## [장] A', '### [절] a1', '가'.repeat(800) + ' 토큰 값 설명 구조 모델 데이터 학습 결과.', '### [절] a2', '나'.repeat(800) + ' 토큰 값 설명 구조 모델 데이터 학습 결과.',
      '### [절] a3', '다'.repeat(800) + ' 토큰 값 설명 구조 모델 데이터 학습 결과.', '### [절] a4', '라'.repeat(800) + ' 토큰 값 설명 구조 모델 데이터 학습 결과.', '## [장] B', '### [절] b1', '목적지 본문.'].join('\n');
    const ob = parseOutline(big), bid = tt => ob.nodes.find(n => n.title === tt).id;
    const aux = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: 'a1', quote: '토큰 값 설명', problem: 'p', fix: 'b1 안으로', id: bid('a1'), to: bid('b1'), terms: ['토큰', '값', '설명', '구조', '모델', '데이터', '학습', '결과'] }] }, ob).items[0];
    return P.verifyCandidates(ob, [{ list: [aux] }], 'k', null, null, '').then(st2 => {
      assert(aux.evidence.aux.dropped > 0 && !aux.ctxMissing && aux.evidence.essential.length === 0, JSON.stringify(aux.evidence.aux) + ' ' + aux.evidence.limits.join('|'));
      assert(aux.evidence.items.filter(e => e.must).every(e => !/^\(앞 \d+자 생략\)|\(뒤 \d+자 생략\)$/.test('') && e.text.length > 0), '필수 근거는 남아 있다');
      assert(aux.evidence.items.some(e => /목적지 — 적용/.test(e.tag) && e.text.includes('목적지 본문')), '목적지 필수 근거 유지');
      assert(bookApplicable(aux) && st2.auxDropped === 1 && st2.essentialMissing === 0, P.holdReason(aux));
      assert(aux.evidence.limits.some(l => /보조 근거 생략/.test(l)) && !aux.evidence.limits.some(l => /필수 근거 부족/.test(l)));
      return stepRange();
    });
  });
}
function stepRange() {
  // 전달 범위 추적: 긴 절의 앞부분(지적 구절 창)만 보냈는데 같은 절 뒷부분의 다른 at으로 재작성 → 차단
  const longMd = ['## [장] L', '### [절] 긴 절', ('첫 문단 설명이 이어집니다. ').repeat(20), '', '둘째 문단에 지적 구절이 있습니다. 바로 뒤 문장입니다.', '', ('셋째 문단 내용. ').repeat(60), '', '넷째 문단의 마지막 문장입니다. 끝 문장.', '### [절] 다른 절', '다른 절 본문. 같은 문장. 같은 문장.'].join('\n');
  const lo = parseOutline(longMd), lid = tt => lo.nodes.find(n => n.title === tt).id, L = lid('긴 절');
  const mk = () => cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: '긴 절', quote: '둘째 문단에 지적 구절이 있습니다.', problem: 'p', fix: 'f', id: L, at: '둘째 문단에 지적 구절이 있습니다.', text: '고친 문장.' }] }, lo).items[0];
  const withEv = x => { const e = gatherEvidence(lo, x); x.evidence = { covered: e.covered, sent: e.sent, essential: e.essential, items: e.ev, limits: e.limits }; return x; };
  const rw = (x, apply) => { applyCheck(x, { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: 'r', apply } }, false, lo); return x; };
  const far = rw(withEv(mk()), { type: 'edit', id: L, at: '넷째 문단의 마지막 문장입니다.', text: '바꾼 끝.' });
  assert(far.destUnverified === '재작성된 대상 원문 또는 주변 문맥이 검증에 전달되지 않아 적용 보류' && !bookApplicable(far), P.holdReason(far));
  assert(applyOps(lo, [{ k: 'ai:book|items|0' }], { book: { items: [far] } }).byId[L].text.includes('넷째 문단의 마지막 문장입니다.'), '뒷부분은 바뀌지 않는다');
  // 같은 제목의 새 at이 전달 범위(지적 구절 창·뒤 문맥 앞 300자) 안에 있으면 적용
  const near = rw(withEv(mk()), { type: 'edit', id: L, at: '바로 뒤 문장입니다.', text: '바꾼 뒤 문장.' });
  assert(!near.destUnverified && bookApplicable(near) && applyOps(lo, [{ k: 'ai:book|items|0' }], { book: { items: [near] } }).byId[L].text.includes('바꾼 뒤 문장.'), P.holdReason(near));
  // 같은 문장이 여러 곳 → 위치 모호 → 보류
  const D = lid('다른 절');
  const amb = rw(withEv(cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: 'd', quote: '다른 절 본문.', problem: 'p', fix: 'f', id: D, at: '다른 절 본문.', text: 't' }] }, lo).items[0]), { type: 'edit', id: D, at: '같은 문장.', text: '다른 문장.' });
  assert(/구분할 수 없음/.test(amb.destUnverified) && !bookApplicable(amb));
  // 생략된 구간을 가로지르는 범위 → 차단 (sent: [0,100]과 [300,400]만, at은 90~310)
  const gapMd = ['## [장] G', '### [절] g', 'x'.repeat(90) + 'ABCDEFGHIJ'.repeat(22) + 'y'.repeat(100)].join('\n');
  const go = parseOutline(gapMd), G = go.nodes.find(n => n.title === 'g').id, gtext = go.byId[G].text;
  const span = gtext.slice(90, 310);
  assert.equal(P.rangeCheck(go, { type: 'edit', id: G, at: span, text: 't' }, [{ id: G, start: 0, end: 100 }, { id: G, start: 300, end: 400 }]), '재작성된 대상 원문 또는 주변 문맥이 검증에 전달되지 않아 적용 보류');
  assert.equal(P.rangeCheck(go, { type: 'edit', id: G, at: span, text: 't' }, [{ id: G, start: 0, end: 100 }, { id: G, start: 100, end: 400 }]), '', '맞닿은 범위는 이어진 것');
  assert.equal(P.rangeCheck(go, { type: 'edit', id: G, at: span, text: 't' }, [{ id: G, start: 20, end: 400 }]), '', '앞뒤 60자 문맥까지 전달되면 통과');
  assert.equal(P.rangeCheck(go, { type: 'edit', id: G, at: span, text: 't' }, [{ id: G, start: 40, end: 400 }]), '재작성된 대상 원문 또는 주변 문맥이 검증에 전달되지 않아 적용 보류', '앞 문맥이 모자라면 차단');
  assert.equal(P.rangeCheck(go, { type: 'edit', id: G, at: span, text: 't' }, undefined), '재작성된 대상 원문 또는 주변 문맥이 검증에 전달되지 않아 적용 보류', '범위 정보 없음(이전 캐시)은 전달로 추정하지 않음');
  // 근거로 수집했지만 예산에서 제외된 구간으로 재작성 → 차단 (용어마다 다른 절에 있고 각 절이 1,100자라 뒤쪽 용어의 근거가 예산에서 빠진다)
  const words = ['구조', '모델', '데이터', '학습', '결과', '비교'];
  const bigMd = ['## [장] A', '### [절] a1', '가'.repeat(600) + ' 토큰 값 설명.', ...words.flatMap((w, k) => [`### [절] a${k + 2}`, String.fromCharCode(0xB098 + k).repeat(1100) + ` ${w} 문장입니다.`]), '## [장] B', '### [절] b1', '목적지 본문.'].join('\n');
  const bo = parseOutline(bigMd), bid = tt => bo.nodes.find(n => n.title === tt).id;
  const cand = cleanBookReview({ items: [{ tier: 'A', type: 'edit', where: 'a1', quote: '토큰 값 설명', problem: 'p', fix: 'f', id: bid('a1'), at: '토큰 값 설명', text: 't', terms: words }] }, bo).items[0];
  const ce = gatherEvidence(bo, cand); cand.evidence = { covered: ce.covered, sent: ce.sent, essential: ce.essential, items: ce.ev, limits: ce.limits };
  assert(ce.aux.dropped > 0 && !ce.ctxMissing, '예산 초과로 일부 생략: ' + JSON.stringify(ce.aux));
  const sentIds = new Set(ce.sent.map(r => r.id));
  const droppedIdx = words.findIndex((w, k) => !sentIds.has(bid(`a${k + 2}`)));
  assert(droppedIdx >= 0, '검색 근거가 빠진 절이 있어야 한다: ' + JSON.stringify([...sentIds]));
  applyCheck(cand, { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: 'r', apply: { type: 'edit', id: bid(`a${droppedIdx + 2}`), at: `${words[droppedIdx]} 문장입니다.`, text: 't2' } } }, false, bo); // 이 원고는 bo
  assert(cand.destUnverified && !bookApplicable(cand), '전송에서 빠진 구간은 전달 범위가 아니다');
  // 일부 삭제 → 제목 전체 삭제로 커짐, 전체 범위 근거 없음 → 차단
  const del = cleanBookReview({ items: [{ tier: 'A', type: 'delete', where: '긴 절', quote: '둘째 문단에 지적 구절이 있습니다.', problem: 'p', fix: '그 문장 삭제', id: L, at: '둘째 문단에 지적 구절이 있습니다.' }] }, lo).items[0];
  withEv(del); rw(del, { type: 'delete', id: L, at: '' });
  assert(del.destUnverified && !bookApplicable(del) && !applyOps(lo, [{ k: 'ai:book|items|0' }], { book: { items: [del] } }).touched[L], '제목 전체가 지워지면 안 된다');
  // 제목 전체 삭제 후보(본문 900자 이내)를 같은 명령으로 재작성 → 변경 없음이라 그대로 적용
  const sm = ['## [장] S', '### [절] 짧은 절', '짧은 본문.', '### [절] 남는 절', '남는 본문.'].join('\n'), so = parseOutline(sm), S1 = so.nodes.find(n => n.title === '짧은 절').id;
  const dw = cleanBookReview({ items: [{ tier: 'A', type: 'delete', where: '짧은 절', quote: '짧은 본문.', problem: 'p', fix: '절 삭제', id: S1 }] }, so).items[0];
  const de = gatherEvidence(so, dw); dw.evidence = { covered: de.covered, sent: de.sent, essential: de.essential };
  applyCheck(dw, { claim: { verdict: '유지' }, fix: { verdict: '재작성', fix: '절 삭제(이유 보강)', apply: { type: 'delete', id: S1, at: '' } } }, false, so);
  assert(!dw.destUnverified && bookApplicable(dw), P.holdReason(dw));
  // 캐시 복원(JSON 왕복) 뒤 같은 판단
  const back = JSON.parse(JSON.stringify(far));
  assert(!bookApplicable(back) && P.holdReason(back) === far.destUnverified);
  return step10();
}
function step10() {
  // 10) 캐시 복원: 이전 검증 기준(v1)·검증 전 결과는 재검증 전까지 자동 반영 안 함, 수락·거절·직접 옮긴 것은 그대로
  const rv = cleanBookReview({ items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] }, o);
  applyCheck(rv.items[0], { claim: { verdict: '유지' }, fix: { verdict: '적합' } }, false, o);
  rv.verified = true; rv.verifyVersion = 1;
  const restored = JSON.parse(JSON.stringify({ reviews: { book: rv }, ops: [{ k: 'ai:book|items|0' }, { type: 'up', id: id('2.2 정리') }], rejected: { 'ai:book|items|9': true } }));
  assert(bookApplicable(restored.reviews.book.items[0]), '표시 전에는(옛 캐시 그대로) 적용 가능으로 보이던 것');
  const n = markStale(restored.reviews);
  assert(n === 1 && restored.reviews.book.staleVerify && restored.reviews.book.items[0].stale && !bookApplicable(restored.reviews.book.items[0]));
  assert.equal(titles(applyOps(o, restored.ops.filter(x => x.k), restored.reviews)), base, '복원 뒤 수락 이력이 있어도 이동이 실행되지 않는다');
  assert(restored.ops.length === 2 && restored.rejected['ai:book|items|9'], '수락·거절·직접 이동 이력은 지우지 않는다');
  const v2 = { book: { ...JSON.parse(JSON.stringify(rv)), verifyVersion: 2 } };
  assert(markStale(v2) === 1 && !bookApplicable(v2.book.items[0]), 'v2(범위 추적 전) 결과도 재검증 필요');
  const cur = { book: { ...JSON.parse(JSON.stringify(rv)), verifyVersion: P.VERIFY_VERSION, criteriaUsed: { sig: 's1', summary: 'x' } } };
  assert(markStale(cur, 's1') === 0 && bookApplicable(cur.book.items[0]), '현재 기준으로 검증된 결과는 그대로');
  assert(markStale(cur, 's2') === 1 && !bookApplicable(cur.book.items[0]) && /현재와 다름/.test(cur.book.staleVerify), '검토 당시 기준이 현재와 다르면 차단');
  assert(markStale(cur, 's1') === 0 && bookApplicable(cur.book.items[0]) && !cur.book.staleVerify, '기준이 다시 같아지면 표시를 거둔다(멱등)');
  const noCrit = { book: { ...JSON.parse(JSON.stringify(rv)), verifyVersion: P.VERIFY_VERSION } };
  assert(markStale(noCrit, 's1') === 1 && /미기록/.test(noCrit.book.staleVerify) && !bookApplicable(noCrit.book.items[0]), '기준 미기록(옛 캐시)은 검증된 것으로 추정하지 않음');
  const old = { logic: { items: [{ tier: 'A', type: 'edit', id: id('1.2 응용'), at: '응용 본문입니다.', text: 't' }], proof: [], verified: false } };
  assert(markStale(old) === 1 && !bookApplicable(old.logic.items[0]), '검증 전 결과도 재검증 전까지 차단');
  // 가짜 전체 흐름: 새 검토는 verifyVersion이 현재 값
  sb.callClaudeApi = async opt => /검증할 후보/.test(opt.prompt)
    ? { text: JSON.stringify({ results: [{ i: 0, claim: { verdict: '유지' }, fix: { verdict: '적합' } }] }), searches: 0, searchErrors: [], sources: [], stopReason: 'end_turn' }
    : JSON.stringify({ scope: 's', summary: 'm', items: [{ tier: 'A', type: 'move', where: '1.2', problem: 'p', fix: '이동', id: id('1.2 응용'), to: id('2.2 정리') }] });
  return P.reviewBook(o, 'k', { useConcept: false, useToc: false, memo: '', feedback: '' }, {}).then(out => {
    assert(out.verifyVersion === P.VERIFY_VERSION && out.verified && bookApplicable(out.items[0]));
    assert(out.scopeNotes.some(t => /근거 검증 전송: 후보 1건, 호출 1회/.test(t)), out.scopeNotes.join(' | '));
    console.log('PASS: structure verify — 구절 중심 근거, 목적지 본문(to/before/빈 본문), 재작성-적용 명령 일치, 판정값 엄격, 번호 연결, 기술 사실 미확인 차단, 인용 없음 차단, 정상 적용, 캐시 재검증');
  });
}
