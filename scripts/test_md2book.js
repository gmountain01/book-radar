/* md2book 자체 점검 — 실행: node scripts/test_md2book.js (run_tests.js에서도 함께 돈다) */
const assert = require("assert");
const { mdToBook, inline, parseHead } = require("../panels/panel27/md2book.js");
const has = (html, s) => assert.ok(html.includes(s), `없음: ${s}\n--- 실제 ---\n${html}`);
const lv = r => r.outline.map(o => o.lv).join("");

// 1) 명시 태그(Word 스타일에서 온 원고): 마당 > 장 > 절 > 중 > 소 > 소소, 도비라의 장·절 목록 줄 처리
let r = mdToBook(`[파트] 첫째 마당. 인공지능과 딥러닝의 기초

이 책에서 배우는 내용입니다.

1장 인공지능과 머신러닝

2장 신경망과 딥러닝

[장] 1장 인공지능과 머신러닝

이번 장에서는 개념을 정리합니다.

1-1 인공지능과 머신러닝

1-2 지도 학습

[절] 1-1 인공지능은 어떻게 발전해 왔을까?

도입글입니다.

[중] 인공지능과 머신러닝이란?

**인공지능**<sup>Artificial Intelligence, AI</sup>은 분야입니다.

[소] 지도 학습

[소소] 분류와 회귀

[TIP] 강화 학습은 16장에서 자세히 알아봅니다.

[코너] [한 걸음 더!] 세 용어의 관계

코너 본문입니다.

[/코너]

![](img-1.png){width=78%}

[캡션] 전통적 소프트웨어와의 차이

[박스]
첫 줄
- 항목 하나
`);
assert.deepStrictEqual(r.stats, { 파트: 1, 장: 1, 절: 1, 중: 1, 소: 1, 소소: 1, 팁: 1, 주의: 0, 박스: 1, 코너: 1, 그림: 1, 표: 0, 코드: 0 });
assert.strictEqual(lv(r), "012");
has(r.html, 'class="part-src" data-oi="0" data-kind="마당" data-no="01" data-label="첫째 마당" data-title="인공지능과 딥러닝의 기초"');
has(r.html, "<p>이 책에서 배우는 내용입니다.</p></div>");            // 소개글만 남고 '1장 …' 목록 줄은 빠짐
assert.ok(!/part-src[^\n]*2장 신경망/.test(r.html));
has(r.html, 'data-ch="1" data-title="인공지능과 머신러닝"');
has(r.html, '<div class="ch-label">첫째 마당 · CHAPTER</div>');
has(r.html, '<p class="lead">이번 장에서는 개념을 정리합니다.</p>');
has(r.html, '<ul class="toc"><li>1-1 인공지능과 머신러닝</li><li>1-2 지도 학습</li></ul>');
has(r.html, 'data-n="1-1">인공지능은 어떻게 발전해 왔을까?</h2>');
has(r.html, "<h3>인공지능과 머신러닝이란?</h3>");
has(r.html, "<strong>인공지능</strong><sup>Artificial Intelligence, AI</sup>은");
has(r.html, "<h4>지도 학습</h4>"); has(r.html, "<h5>분류와 회귀</h5>");
has(r.html, '<div class="tip" data-lbl="TIP"><b></b><p>강화 학습은 16장에서 자세히 알아봅니다.</p></div>');
has(r.html, '<div class="corner-h in-corner"><em class="lbl">한 걸음 더!</em><span>세 용어의 관계</span></div>');
has(r.html, '<p class="in-corner corner-end">코너 본문입니다.</p>');
has(r.html, '<figure><img src="img-1.png" alt="" style="width:78%"><figcaption class="cap">전통적 소프트웨어와의 차이</figcaption></figure>');
has(r.html, '<div class="box"><p>첫 줄</p><ul><li>항목 하나</li></ul></div>');

// 2) # 만 쓴 일반 마크다운: 가장 얕은 깊이가 장, 깊이를 건너뛰어도 차례대로
r = mdToBook("# 제목\n\n본문\n\n### 건너뛴 절\n\n#### 중\n\n##### 소\n\n###### 소소\n");
assert.strictEqual(lv(r), "12"); assert.deepStrictEqual([r.stats.절, r.stats.중, r.stats.소, r.stats.소소], [1, 1, 1, 1]);

// 3) # 과 제목 문구가 섞인 경우: 문구로 잡힌 단계가 기준점이 된다
r = mdToBook("# 책 제목\n\n## 3장 시작하기\n\n### 준비물\n\n## 제4장 다음\n\n### 4.1 번호 있는 절\n");
assert.strictEqual(lv(r), "01212");
has(r.html, 'data-ch="3" data-title="시작하기"'); has(r.html, 'data-n="4.1">번호 있는 절</h2>');

// 4) 태그도 # 도 없는 txt: 짧은 한 줄 제목 문구만 제목으로, 문장은 본문으로
r = mdToBook("PART 2 학급 경영\n\n13장 현장학습 조 편성\n\n3장의 사진을 준비합니다.\n\n13.1 만들 도구 살펴보기\n\nSTEP 1 기본 조 편성 만들기\n\n1. 코덱스를 엽니다.\n2. 문장을 넣습니다.\n");
assert.strictEqual(lv(r), "012");
has(r.html, 'data-label="PART 02"'); has(r.html, "<p class=\"lead\">3장의 사진을 준비합니다.</p>");
has(r.html, '<span class="step-no"><small>STEP</small> <b>1</b></span></span><span class="step-title">기본 조 편성 만들기</span>');
has(r.html, '<p class="act" data-n="1">코덱스를 엽니다.</p>'); has(r.html, '<p class="act" data-n="2">문장을 넣습니다.</p>');

// 5) 장이 없는 글: 파일 이름으로 장을 세운다
r = mdToBook("그냥 글입니다.\n", { title: "메모" });
has(r.html, 'data-ch="" data-title="메모"'); assert.strictEqual(r.title, "메모");

// 6) 블록: 표·코드·요청·체크리스트·주의·인용·장 정보·새쪽
r = mdToBook(`[장] 13 현장학습 조 편성
[장정보] 사용 도구: 챗GPT 코덱스 | 난이도: ★★☆☆☆

[새쪽]
[절] 만들 도구

| 번호 | 하는 일 |
|:--:|---|
| 1 | 명단 \\| 붙여 넣기 |

\`\`\`python title=예제 코드
print("<b>")
\`\`\`

\`\`\`프롬프트
조 편성 페이지를 만들어 줘.
\`\`\`

- [ ] 버튼 이름이 한국어인가?
- [x] 글씨가 큰가?

> [!WARNING] 실명 명단 금지
> 가명으로 바꿔서 넣으세요.

> 그냥 인용

[확인] 버튼을 누릅니다.
`);
has(r.html, '<dl class="meta" style="grid-template-columns:repeat(2,1fr)">'); has(r.html, '<i class="on">★</i><i class="on">★</i><i>★</i>');
has(r.html, '<h2 class="newpage" data-oi="1">만들 도구</h2>');
has(r.html, '<th style="text-align:center">번호</th>'); has(r.html, "<td>명단 | 붙여 넣기</td>");
has(r.html, '<p class="code-t keep">예제 코드</p>'); has(r.html, '<pre class="code">print(&quot;&lt;b&gt;&quot;)</pre>');
has(r.html, '<div class="request">'); has(r.html, "<p>조 편성 페이지를 만들어 줘.</p></div>");
has(r.html, '<ul class="checklist"><li>버튼 이름이 한국어인가?</li><li>글씨가 큰가?</li></ul>');
has(r.html, '<div class="warn" data-lbl="주의"><b>실명 명단 금지</b><p>가명으로 바꿔서 넣으세요.</p></div>');
has(r.html, "<blockquote><p>그냥 인용</p></blockquote>");
has(r.html, "<p>[확인] 버튼을 누릅니다.</p>");                        // 화면 버튼 이름은 태그로 보지 않는다

// 7) 글줄 서식과 안전: HTML은 글자로, 허용 태그만 통과
assert.strictEqual(inline('<script>x</script> **굵게** *기울임* `a<b` \\*별\\* [링크](https://a.b/c_d_e) [나쁨](javascript:x)'),
  '&lt;script&gt;x&lt;/script&gt; <strong>굵게</strong> <em>기울임</em> <code>a&lt;b</code> *별* <a href="https://a.b/c_d_e">링크</a> 나쁨');
assert.strictEqual(inline("top_k와 top_p, 5 * 3 * 2"), "top_k와 top_p, 5 * 3 * 2");
assert.deepStrictEqual(parseHead(0, "셋째 마당. 트레이닝"), { kind: "마당", no: "03", label: "셋째 마당", title: "트레이닝" });
assert.deepStrictEqual(parseHead(1, "14장 RAG와 지식 그래프"), { no: "14", title: "RAG와 지식 그래프" });
assert.deepStrictEqual(parseHead(2, "12-3 KV 캐시"), { no: "12-3", title: "KV 캐시" });

console.log("md2book: 모든 점검 통과");
