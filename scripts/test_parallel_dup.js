/* 병기 중복 찾기 자체 점검 — 실행: node scripts/test_parallel_dup.js (run_tests.js에서도 함께 돈다) */
const assert = require("assert");
const { findParallel } = require("../panels/panel28/panel28.js");
const term = (r, ko) => r.terms.find(t => t.ko === ko) || assert.fail(`용어 없음: ${ko} — 실제: ${r.terms.map(t => t.ko).join(", ")}`);

const r = findParallel([
  { page: 1, text: `# 1장 언어 모델(Language Model)

거대 언어 모델(Large Language Model, LLM)은 방대한 글로 학습한 신경망입니다. 우리는 **미세 조정**<sup>fine-tuning</sup>도 다룹니다.

검색한 문서를 근거로 답하게 하는 기술을 검색 증강 생성(RAG)이라고 합니다.

\`\`\`python
print("토큰(token)")  # 코드 속 괄호는 병기가 아니다
\`\`\`

그림은 다음 쪽(p. 12)과 \`함수(func)\`를 보세요. 이를 위한 에이전트(AI Agent)가 필요합니다.` },
  { page: 2, bodyPageNum: 15, text: `## 1-1 다시 보기

앞에서 본 거대 언어 모델(LLM)을 떠올려 봅시다. 미세 조정(Fine Tuning)은 비용이 듭니다. 대형 언어 모델(Large Language Model)과 RAG(검색 증강 생성)도 다시 나옵니다. 언어 모델(language model)은 다음 낱말을 맞힙니다.` },
]);

// 찾은 용어: 코드 블록·인라인 코드·(p. 12)는 빠진다
assert.deepStrictEqual(r.terms.map(t => t.ko), ["언어 모델", "거대 언어 모델", "미세 조정", "검색 증강 생성", "에이전트"]);

// 첫 병기 + 개념 설명
const llm = term(r, "거대 언어 모델");
assert.strictEqual(llm.first.page, 1);
assert.ok(llm.defined, "「~은 …입니다」 꼴은 설명 있음");
assert.ok(term(r, "검색 증강 생성").defined, "「~이라고 합니다」 꼴은 설명 있음");
assert.ok(!term(r, "미세 조정").defined, "「~도 다룹니다」는 설명 없음");
assert.ok(!term(r, "에이전트").defined);

// 중복: 약어만 다시 적은 것(LLM)·원어를 다시 적은 것·한글 표기가 달라진 것을 같은 용어로 묶는다
assert.strictEqual(llm.dups.length, 2);
assert.deepStrictEqual(llm.dups.map(o => [o.page, o.bodyPage, o.path, o.variant]), [[2, 15, "1장 언어 모델(Language Model) › 1-1 다시 보기", false], [2, 15, "1장 언어 모델(Language Model) › 1-1 다시 보기", true]]);
assert.strictEqual(term(r, "미세 조정").dups.length, 1, "위첨자 병기와 괄호 병기, fine-tuning과 Fine Tuning은 같은 용어");
assert.strictEqual(term(r, "검색 증강 생성").dups.length, 1, "English(한글) 순서도 같은 용어");

// 제목 속 병기는 첫 병기·중복으로 세지 않는다
const lm = term(r, "언어 모델");
assert.ok(!lm.first.inHeading && lm.first.page === 2 && lm.dups.length === 0 && lm.heads.length === 1);

// 문장 속 위치: 강조할 범위가 병기 전체를 가리킨다
assert.strictEqual(llm.first.sent.slice(llm.first.a, llm.first.b), "거대 언어 모델(Large Language Model, LLM)");
assert.deepStrictEqual(r.stats, { terms: 5, dupTerms: 3, dups: 4, undefinedFirst: 3 });

// 용어 범위: 따옴표·낫표 안, 두 글자 앞 어절(지도 학습), 조사 붙은 앞 어절은 제외
const kos = t => findParallel([{ page: 1, text: t }]).terms.map(x => x.ko);
assert.deepStrictEqual(kos("유럽의 'AI 액트(AI Act)'와 《월 스트리트 저널(The Wall Street Journal)》을 봅니다."), ["AI 액트", "월 스트리트 저널"]);
assert.deepStrictEqual(kos("최근에는 딥러닝(deep learning)과 지도 학습(supervised learning), 사고 사슬(chain of thought)을 씁니다."), ["딥러닝", "지도 학습", "사고 사슬"]);
// 병기가 아닌 괄호 / 풀이가 딸린 병기 / 전각 괄호
assert.deepStrictEqual(kos("속도(ms)와 저자(Kim et al., 2020), Plato(영어)는 아니고 에이즈(AIDS, 선천성면역결핍증)와 토큰（token）은 병기다."), ["에이즈", "토큰"]);
// 개념 설명 꼴 보강
const cue = t => findParallel([{ page: 1, text: t }]).terms[0].defined;
assert.ok(cue('이런 현상을 "환각(hallucination)"이라고도 한다.') && cue("글을 숫자 벡터로 바꾼 것이 임베딩(embedding)이다.") && cue("토큰(token)은 모델이 글을 다루는 단위다."));
assert.ok(!cue("이 장에서는 토큰(token)을 셉니다."));

// 위첨자가 괄호 없이 붙어 나온 꼴(PDF·HWP) — glued 옵션일 때만, '다만LLM'은 제외
const g = findParallel([{ page: 3, text: "이런 오류를 환각Hallucination이라고 합니다. 다만LLM은 접근 제어 리스트ACL을 모릅니다. 환각(Hallucination)은 줄일 수 있습니다." }], { glued: true });
assert.deepStrictEqual(g.terms.map(t => [t.ko, t.en, t.dups.length, t.first.glued]), [["환각", "Hallucination", 1, true], ["접근 제어 리스트", "ACL", 0, true]]);
assert.ok(g.terms[0].defined);
// 이미 병기한 영어가 다른 낱말에 붙어 나온 것(띄어쓰기가 사라진 추출)·나열은 중복으로 세지 않는다
const g2 = findParallel([{ page: 6, text: "대규모 언어 모델LLM, Large Language Model이 등장했습니다. 프롬프트에 포함해LLM에 전달합니다. 핵심 요소는 목표Goal, LLM, 도구Tool입니다." }], { glued: true });
assert.deepStrictEqual(g2.terms.map(t => [t.ko, t.en, t.dups.length]), [["대규모 언어 모델", "LLM, Large Language Model", 0], ["목표", "Goal", 0], ["도구", "Tool", 0]]);
assert.strictEqual(findParallel([{ page: 3, text: "환각Hallucination이라고 합니다." }]).terms.length, 0);

// 닫히지 않은 코드 블록: 뒤 본문을 버리지 않고 알린다
const fb = findParallel([{ page: 1, text: "```\n코드\n\n# 2장\n\n토큰(token)을 셉니다." }]);
assert.ok(fb.fenceBroken && fb.terms.length === 1 && fb.terms[0].first.path === "2장");

console.log("  ✓ 병기 중복 찾기(panel28) 점검 통과");
