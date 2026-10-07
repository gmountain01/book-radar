// 규칙 3(주어 과다 검토) — 판정·제외 목록·병합·AI 판정·수정안 재검증 (가짜 응답, 유료 호출 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS, ROOT } = require('./run_tests.js');

module.exports = async function () {
  const sb = makeSandbox();
  let fakeReply = null; // 고쳐 쓰기 응답을 테스트마다 바꾼다
  sb.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    const items = JSON.parse(b.messages[0].content.replace(/^[^\[]*/, ''));
    const text = typeof fakeReply === 'function' ? fakeReply(items, b) : fakeReply;
    return { ok: true, status: 200, json: async () => ({ model: b.model, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text }] }) };
  };
  for (const s of SCRIPTS) if (fs.existsSync(path.join(ROOT, s)) && !/api-keys/.test(s)) loadScript(sb, s);
  const P8 = sb.__p8Eval;
  const S = P8.SUBJECT_OVERLOAD;
  assert.deepEqual(S, { shortMaxWords: 12, shortMin: 3, longMin: 4 });
  const surface = text => P8.checkSurface({ pages: [{ page: 1, text }] });
  const subj = text => surface(text).filter(i => i.type === '주어과다');
  const dup = text => surface(text).filter(i => i.type === '조사중복');
  const C = text => P8._subjectCandidates(text);

  // ── 테스트 1: 17어절, 후보 4개, 규칙 1('이' 4회)과 병합 ──
  const T1 = '보상이 사람의 판단이나 보상 모델이 아니라 객관적인 검증에서 나오므로, 많은 문제를 오래 학습해도 보상이 왜곡될 위험이 적습니다.';
  const c1 = C(T1);
  assert.equal(c1.words, 17); assert.deepEqual(c1.cands, ['보상이', '모델이', '보상이', '위험이']); // '많은'은 관형사형이라 제외, '모델이 아니라'의 보어는 포함
  const r1 = surface(T1);
  assert.equal(r1.filter(i => i.type === '주어과다').length, 1, 'rule 3 flags T1');
  assert.equal(r1.filter(i => i.type === '조사중복').length, 0, 'rule 1 card merged into rule 3');
  const card1 = r1.find(i => i.type === '주어과다');
  assert.deepEqual(card1.repeats, [{ particle: '이', count: 4, words: ['보상이', '모델이', '보상이', '위험이'] }]);
  assert(card1.description.includes('조사 후보 4개(보상이, 모델이, 보상이, 위험이)') && card1.description.includes('긴 문장(17어절, 13어절 이상) 기준 4개 이상') && /반복 조사: '이' 4회/.test(card1.description), card1.description);
  assert(card1.noAutoReplace && card1.needsRewrite && Number.isInteger(card1.start));

  // ── 테스트 2: 5어절, 후보 3개 ──
  const T2 = '모델은 데이터가 많을수록 성능이 좋아집니다.';
  assert.deepEqual(C(T2).cands, ['모델은', '데이터가', '성능이']);
  assert.equal(subj(T2).length, 1); assert.equal(subj(T2)[0].repeats.length, 0);

  // ── 테스트 3: '전문가' 제외, '평가에서' 미검출, '차이가'만 1개 ──
  const T3 = '전문가 평가에서 두 모델의 차이가 컸습니다.';
  assert.deepEqual(C(T3).cands, ['차이가']); assert.equal(subj(T3).length, 0);

  // ── 제외 목록 vs 조사가 붙은 형태, 문장부호 ──
  assert.deepEqual(C('평가 전문가 작가 차이 높이 같이 많이 종이 고양이 어린이 나이 놀이 가까이 굳이 없이 모였다.').cands, []);
  assert.deepEqual(C('평가가 전문가가 작가가 차이가 높이가 종이가 고양이가 나이가 모였다.').cands, ['평가가', '전문가가', '작가가', '차이가', '높이가', '종이가', '고양이가', '나이가']);
  assert.deepEqual(C('(모델이) "데이터가" 성능이, 결과가.').cands, ['모델이', '데이터가', '성능이', '결과가'], 'punctuation stripped');
  assert.deepEqual(C('모델이 데이터가 성능이').cands, C('“모델이” (데이터가) [성능이].').cands);
  // 관형사형 '-은'·'-는' 제외, 명사+은은 유지
  assert.deepEqual(C('많은 학생은 좋은 책이 적은 비용에 나온다고 했다.').cands, ['학생은', '책이']);
  assert.deepEqual(C('처리하는 시간은 사용하는 모델이 정한다.').cands, ['시간은', '모델이']);
  // 알려진 한계: 어간과 같은 글자의 명사('적은'=敵은)는 제외된다
  assert.deepEqual(C('적은 강하다.').cands, []);
  // 15자 미만 문장도 규칙 3은 검사(규칙 1·2는 기존대로 건너뜀)
  // '나는'은 기존 '-는' 제외 목록의 어간 '나'(나다)에 걸려 빠지는 한계가 있어 예문은 '너는·그는·우리는'으로
  assert.deepEqual(C('나는 너는 그는 간다.').cands, ['너는', '그는'], 'known limitation: 나는 dropped by legacy -는 filter');
  const T4 = '너는 그는 우리는 간다.';
  const page4 = T4 + ' 이어지는 문장이 충분히 길어서 쪽 단위 20자 필터를 넘깁니다.'; // checkSurface는 쪽 텍스트 20자 미만이면 아예 건너뛴다(기존 동작)
  assert(T4.length < 15 && subj(page4).filter(i => i.found === T4).length === 1 && dup(page4).length === 0, '15-char sentence filter does not apply to rule 3');

  // ── 경계: 후보 3개가 12어절이면 표시, 13어절이면 미표시, 13어절에 4개면 표시 ──
  const pad = n => Array.from({ length: n }, (_, i) => '그리고' + (i % 2 ? '또' : '')).join(' ');
  const s12 = '모델은 데이터가 성능이 ' + pad(8) + ' 좋다.';   // 3 + 8 + 1 = 12어절
  const s13 = '모델은 데이터가 성능이 ' + pad(9) + ' 좋다.';   // 13어절
  const s13b = '모델은 데이터가 성능이 결과가 ' + pad(8) + ' 좋다.'; // 13어절·후보 4개
  assert.equal(C(s12).words, 12); assert(C(s12).over);
  assert.equal(C(s13).words, 13); assert(!C(s13).over);
  assert.equal(C(s13b).words, 13); assert(C(s13b).over);
  // 어절: 연속 공백·탭·줄바꿈은 하나
  assert.equal(C('모델은   데이터가\t성능이\n좋다.').words, 4);

  // ── 병합: 을/를 반복도 보존, 규칙 3에 안 걸린 문장의 규칙 1 카드 유지, 규칙 2는 별도 ──
  const T5 = '모델은 데이터를 수집하고 결과를 분석하고 보고서를 작성해 성능이 좋다고 팀장이 말했다.'; // 를 3회 + 이·가·은·는 3개(모델은, 성능이, 팀장이), 12어절
  const m5 = subj(T5);
  assert.equal(m5.length, 1); assert(m5[0].repeats.some(r => r.particle === '를' && r.count === 3), '을/를 repeat preserved in merged card');
  assert.equal(dup(T5).length, 0);
  const T6 = '아빠가 엄마가 오빠가 ' + pad(11) + ' 밥을 먹어요.'; // 14어절·후보 3개 → 규칙 3 아님, 규칙 1('가' 3회)은 유지
  assert(!C(T6).over); assert.equal(dup(T6).length, 1); assert(/'가' 조사가 한 문장에 3회/.test(dup(T6)[0].description));
  const T7 = '시스템에서의 처리와 사용자로부터의 피드백은 모델이 결과가 좋다고 본다.'; // 규칙 2(2회) + 규칙 3(피드백은, 모델이, 결과가)
  assert.equal(dup(T7).filter(i => /다중조사/.test(i.description)).length, 1, 'rule 2 kept separately');
  assert.equal(subj(T7).length, 1);
  // 같은 문장이 두 위치에 있으면 카드 둘, 위치가 다름
  const twice = subj(T2 + ' ' + T2);
  assert.equal(twice.length, 2); assert(twice[0].start !== twice[1].start);

  // ── 수정안 재검증: 문장마다 어절·후보·반복 ──
  assert.equal(P8._subjectRecheck('보상은 객관적인 검증에서 나옵니다. 그래서 많은 문제를 오래 학습해도 보상이 왜곡될 위험이 적습니다.'), null);
  assert(/후보 3개/.test(P8._subjectRecheck('모델은 데이터가 성능이 좋다.')), 'still over');
  assert(/'를' 3회/.test(P8._subjectRecheck('데이터를 결과를 보고서를 쓴다.')), 'rule-1 criterion in recheck');

  // ── 고쳐 쓰기: verdict 명시, 누락·형식 오류 구분, 검증 실패 재요청 ──
  const mk = text => surface(text).find(i => i.type === '주어과다');
  const good = '보상은 객관적인 검증에서 나옵니다. 그래서 많은 문제를 오래 학습해도 보상이 왜곡될 위험이 적습니다.';
  const [a, b, c, d, e] = [mk(T1), mk(T2), mk(T5), mk(T7), surface(page4).find(i => i.type === '주어과다' && i.found === T4)];
  let calls = 0;
  fakeReply = (items) => { calls++; return JSON.stringify([
    { i: 0, verdict: '수정 필요', reason: '학습 주체가 불분명', text: calls === 1 ? '모델은 데이터가 성능이 결과가 좋다.' : good }, // 1차: 기준에 걸림 → 2차: 통과
    { i: 1, verdict: '수정 불필요', reason: '서술 관계가 분명함' },
    { i: 2, verdict: '수정 불필요' },           // 이유 없음 → 판단 불가
    { i: 3, verdict: '판단 불가', reason: '앞 문장이 없음' },
    // i:4 누락
  ].filter(x => items.some(it => it.i === x.i))); };
  const n = await P8._rewriteParticleRepeats([a, b, c, d, e], 'sk-ant-x');
  assert.equal(n, 1); assert.equal(calls, 2, 'one retry for the failed rewrite');
  assert(a.aiVerdict === '수정 필요' && a.suggestion === good && !a.needsRewrite && !a.rewriteError);
  assert(b.aiVerdict === '수정 불필요' && b.aiReason === '서술 관계가 분명함' && !b.needsRewrite && !b.suggestion);
  assert(c.aiVerdict === '판단 불가' && /이유/.test(c.aiReason), 'no-reason 수정 불필요 is not accepted');
  assert(d.aiVerdict === '판단 불가' && d.aiReason === '앞 문장이 없음');
  assert(e.aiVerdict === '응답 누락' && /응답 누락/.test(e.rewriteError) && e.needsRewrite, 'missing entry is not an AI verdict');
  // 두 번 다 기준에 걸리면 예시 없이 수치 표시
  const f = mk(T2); calls = 0;
  fakeReply = () => JSON.stringify([{ i: 0, verdict: '수정 필요', reason: 'r', text: '모델은 데이터가 성능이 결과가 좋다.' }]);
  await P8._rewriteParticleRepeats([f], 'sk-ant-x');
  assert(!f.suggestion && /여전히 기준에 걸립니다\(.*후보 4개/.test(f.rewriteError) && f.aiVerdict === '수정 필요', f.rewriteError);
  // 형식 오류
  const g = mk(T2); fakeReply = () => '죄송합니다';
  await P8._rewriteParticleRepeats([g], 'sk-ant-x');
  assert(g.aiVerdict === '응답 형식 오류' && /형식 오류/.test(g.rewriteError));
  // 조사중복(규칙 1 단독·규칙 2) 카드는 기존 경로 그대로
  const h = dup(T6)[0]; fakeReply = () => JSON.stringify([{ i: 0, text: '아빠와 엄마, 오빠가 ' + pad(11) + ' 밥을 먹어요.' }]);
  await P8._rewriteParticleRepeats([h], 'sk-ant-x'); assert(h.suggestion && !h.aiVerdict);

  // ── AI 결과 병합: 설명 보존, 수정안은 검증, 규칙 카드 없는 주어누락은 그대로 ──
  const card = mk(T1);
  const ai = [
    { type: '주어과다', page: 1, found: T1, description: '"학습해도"의 주체가 보상인지 모델인지 혼동', suggestion: '모델은 데이터가 성능이 결과가 좋다.' }, // 검증 실패
    { type: '주어누락', page: 1, found: '다른 문장입니다.', description: '주체를 복원하기 어렵습니다', suggestion: '' },
    { type: '조사중복', page: 1, found: T1, description: '이 4회', suggestion: good },
  ];
  const rest = P8._mergeSubjectAi([card], ai);
  assert.equal(rest.length, 1); assert.equal(rest[0].type, '주어누락', 'standalone AI card preserved');
  assert.equal(card.aiNotes.length, 2); assert(card.aiNotes[0].includes('주어 과다') && card.aiNotes[0].includes('혼동'));
  assert.equal(card.suggestion, good, 'second AI suggestion passed verification');
  assert.deepEqual(card.repeats, card1.repeats, 'rule info kept after merge');
  const card2 = mk(T1);
  P8._mergeSubjectAi([card2], [{ type: '주어과다', page: 1, found: T1, description: 'x', suggestion: '모델은 데이터가 성능이 결과가 좋다.' }]);
  assert(!card2.suggestion && /규칙 검증에 걸립니다/.test(card2.rewriteError) && card2.needsRewrite, 'AI suggestion failing verification is not applied');
  // 허용·중복 제거: 주어과다는 ruleId 기반 허용이 그대로 동작
  const pol = sb.P8Review, settings = pol.empty();
  settings.documents['x.docx'] = [pol.signature(card)];
  assert(pol.allowed(card, settings, 'x.docx', new Set()) && !pol.allowed(card, settings, 'y.docx', new Set()));
  assert(!P8.CROSS_TYPES.includes('주어과다'), 'rule-3 cards are never dropped by cross dedupe');
  console.log('PASS: subject overload — tests 1~3, exclusion list vs particles, punctuation, -은/-는 modifiers, no 15-char filter, 12/13-word boundary, merge keeps 을/를 repeats, rule 1/2 kept, explicit verdicts, missing/format errors, per-sentence recheck + retry, AI merge verified, allow/dedupe');
};
