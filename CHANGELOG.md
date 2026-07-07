# CHANGELOG

출판도우미 변경 이력. 최신순 정렬.

---

## 2026-07-07 — v2.6.7 (CI 자동 검증 파이프라인 TEST-1~3 + 규칙 버그 FIX-38~39)

### scripts/run_tests.js + .github/workflows/ci.yml + panels/panel8 (TEST-1~3, FIX-38~39)

- **[M] TEST-1 p8_runTests 순수 계산부 분리:** 픽스처 채점 로직을 DOM 비의존 `p8_computeTestResults(fixtures)`로 분리 + window 노출. 브라우저 동작 동일.
- **[H] TEST-2 픽스처 20자 스킵 버그(FEAT-1 후속):** checkSurface가 `text.length < 20` 페이지를 스킵해 픽스처 대부분이 검사를 건너뛰던 버그 — 40건 전부 20자 이상 문장으로 재작성. `그는은` 기대값 은는→는은 정정. 결과: 탐지 30/30, 오탐 0/10.
- **[M] TEST-3 CI 파이프라인:** `scripts/run_tests.js` — DOM 스텁 샌드박스(vm)에서 shared/app.js·panel8 실제 로드(top-level 런타임 오류 검증) + parseAiJson 단위 11케이스 + 픽스처 40건 채점(기준선 탐지≥30, 오탐 0). `.github/workflows/ci.yml` — push/PR마다 `node --check` 전 JS 문법 검사(libs/·data/ 제외) + 스모크 테스트. FIX-19→FIX-31 유형의 반환 타입 회귀를 커밋 시점 자동 차단.
- **[M] FIX-38 올바른 표기 노이즈 규칙 정리:** CI 테스트가 정상 문장 '오랫동안' 오탐으로 발견 — "이 표기가 맞음"이라며 올바른 표기(횟수/세계관/요새/왠지/어이없 등)를 맞춤법 이슈로 생성하던 규칙 16건 삭제, 의도 명확한 3건은 오표기 패턴 전환(윗부분→위부분, 아랫부분→아래부분, 오랫동안→오랜동안).
- **[H] FIX-39 한글 뒤 \b 죽은 규칙 11건:** JS 정규식 `\b`는 ASCII 단어 경계라 한글 뒤에서 절대 매칭 안 됨 — 결론적으로/요약하자면/종합하면/더욱이/나아가/그리고는/함으로써/통해서/것이다/중에 있다 규칙이 도입 후 한 번도 발동하지 않았음. `(?![가-힣])`로 교체. `되요\b`는 기존 규칙과 중복이라 삭제.
- **index.html ?v=234→235 일괄 상향.**
- **대상:** scripts/run_tests.js (신설), .github/workflows/ci.yml (신설), panels/panel8/panel8.js, panels/panel8/test-fixtures.js, index.html

---

## 2026-07-07 — v2.6.6 (전수 감사 버그 수정 7건 FIX-31~37)

### panels/panel8·18·23 + shared/app.js·youtube.js (FIX-31~37)

- **[H] FIX-31 p8_rerunAI checkLinguistic 구조체 회귀:** FIX-19에서 `checkLinguistic`이 `{issues, failedBatches, failedPages}` 구조체를 반환하도록 변경됐으나 `p8_rerunAI`는 반환값을 배열 변수에 직접 대입 → `.length` undefined + `for...of` TypeError로 "AI 재검사" 버튼 완전 고장. `_lResult.issues` 추출 + `_lastFailedPages` 갱신으로 수정.
- **[H] FIX-32 p8_retryFailedBatches 표면 이슈 소실:** 이슈 객체에 `source` 필드가 존재하지 않아 `i.source === 'surface'`가 항상 false → 재검사 페이지의 표면·구조 이슈까지 전부 삭제. 캐시된 `linguisticIssues`의 `page|found` 키 집합으로 AI 이슈만 선별 제거하도록 교체.
- **[M] FIX-33 panel23 _isoDate KST 하루 밀림:** 비ISO 날짜 입력 시 `toISOString()`이 UTC 기준으로 잘라 KST에서 하루 전으로 표기. 로컬 날짜 컴포넌트(`getFullYear/getMonth/getDate`)로 조립.
- **[M] FIX-34 panel18 _fixJsonStrings 죽은 코드 삭제:** FIX-30 parseAiJson 통합으로 호출부가 사라진 33줄 함수 제거.
- **[M] FIX-35 youtube.js _ytParallelLimit silent catch:** 병렬 태스크 실패 시 무경고 null 채움 → 실패 인덱스+메시지 console.warn 로깅 추가(null 폴백 유지).
- **[M] FIX-36 parseAiJson 배열 루트 지원:** `{ }` 루트만 추출해 배열 루트 `[...]` 응답 시 null 반환하던 문제. 먼저 나타나는 괄호로 루트 판단, 잘린 JSON 복구는 객체 루트 한정 가드, `lastClose > start` 인덱스 기준 오류도 `> 0`으로 정정.
- **[L] FIX-37 전역 에러 배너 불완전 이스케이프:** `<`만 치환하던 것을 `escHtml()` 전면 적용.
- **대상:** panels/panel8/panel8.js, panels/panel18/panel18.js, panels/panel23/panel23.js, shared/app.js, shared/youtube.js
- **감사 결과:** 4개 병렬 에이전트 전수 감사 — FIX-23~30 회귀 무결 확인, 나머지 12개 패널 유의미한 오류 없음.

---

## 2026-07-07 — v2.6.6 (버그 수정 8건 FIX-23~30)

### panels/panel23/panel23.js + panels/panel25/panel25.js + shared/app.js + panels/panel8·18 (FIX-23~30)

- **[M] FIX-23 hasPubSignal 'rag' 오탐:** `t = ' ' + t.toLowerCase() + ' '` 패딩 추가, `'rag'` → `' rag '`로 변경. `storage`/`paragraph`/`dragon` 등 substring 오탐 차단. `sdk`/`llm`/`mcp`는 유지.
- **[M] FIX-24 renderSourceHeatmap ISO 주차 불일치:** `isoWeek(d)` 헬퍼 신설(Date.UTC 기반 ISO 8601 정확한 주차). 기존 `jan1.getDay()+1` 로컬 공식 교체 → `trends[].week` 라벨과 체계 일치, 히트맵 0 표시 수정.
- **[M] FIX-25 parseMd 이스케이프 + 코드블록:** `inl()`에 `esc(t)` 선적용(`<` 포함 텍스트 렌더 깨짐 수정). 링크 href `^https?://` 또는 `^#`만 허용(`javascript:` XSS 차단). ` ``` ` 펜스 코드블록 상태 추가(# 주석이 헤딩으로 오염 수정, `flushFence()` + `<pre><code>` 출력).
- **[M] FIX-26 renderSurgeCards 진행 중 주차 왜곡:** `isoWeek(new Date())`로 집계 미완 감지, 급상승 카드 제목에 "이번 주 진행 중 — 집계 미완" 주황 배지 표시. 하락 카드는 완결 주(len-2 vs len-3) 기준 재계산 + "직전 완결 주 기준" 부제 표시.
- **[M] FIX-27 날짜 방어 파싱:** `_isoDate(s)` 헬퍼 추가(비ISO 날짜 → `YYYY-MM-DD` 변환, 무효면 `''`). `filterAndRender`·`renderFeedList` 전부 헬퍼 사용, 빈 값은 "날짜 미상" 디바이더 그룹.
- **[L] FIX-28 detectRiskFlags 대소문자 버그:** `desc.indexOf(p)` → `desc.indexOf(p.toLowerCase())`. 소문자화된 `desc`에서 대문자 `'VIP'` 패턴이 항상 -1 반환하던 캐시카우 플래그 버그 수정.
- **[M] FIX-29 p25_run 피드 실패 전체 중단:** `callClaudeApi(피드 요약)`을 개별 try/catch로 감싸 실패 시 `feedAnalysis = ''` + console.warn 후 Step 2 계속 진행. 진행 표시에 "피드 요약 건너뜀" 문구.
- **[M] FIX-30 parseAiJson 공용 함수 통합:** `shared/app.js`에 `window.parseAiJson` 신설(panel8 로직: 마크다운 제거→{}추출→제어문자 제거→문자열 이스케이프→JSON.parse→후행쉼표 재시도→잘린 JSON 복구). panel8 `_parseClaudeJson`·panel18 `_safeParseJson`·panel25 `p25_run`/`_refineAndSend`·app.js `generateProposalWithAI` 모두 `parseAiJson`으로 교체. panel25 괄호 스택 방식(문자열 내 `{}` 계수 결함) 제거.
- **대상:** panels/panel23/panel23.js, panels/panel25/panel25.js, shared/app.js, panels/panel8/panel8.js, panels/panel18/panel18.js

---

## 2026-07-07 — v2.6.6 (신기능 2건 FEAT-1~2)

### panels/panel8/panel8.js + panels/panel8/test-fixtures.js + index.html (FEAT-1~2)

- **[M] FEAT-1 교정 셀프 테스트 하네스:** `panels/panel8/test-fixtures.js` 신설 — `window.P8_TEST_FIXTURES` 40건(오류 30건: 조사인접오타×5·이중수동×7·외래어×4·중복군더더기×4·번역체/AI투×4·맞춤법띄어쓰기×6, 정상 10건). `p8_runTests()` 추가 — 픽스처를 `textToExtracted`+`checkSurface`에 통과시켜 탐지성공/탐지누락/오탐 집계. `_p8_showTestResults()` 모달 — 총 픽스처·탐지율·누락·오탐 카드 + 행별 결과 표. 업로드 패널 하단에 "🧪 규칙 테스트" 버튼 추가. `index.html`에 `test-fixtures.js?v=233` 스크립트 태그 추가.
- **[M] FEAT-2 AI 검사 실패 배치 재검사:** `checkLinguistic`에 `pagesOverride` 파라미터 추가(재검사 시 특정 페이지 번호만 필터). `_lastFailedPages` 모듈 레벨 변수 — 검사 완료 시 실패 페이지 목록 보존. `p8_aiNotice` 부분 실패 배너에 "실패 배치 재검사" 버튼 추가(`p8_retryFailedBatches()` 호출). `p8_retryFailedBatches()` — `_lastFailedPages` 기준 해당 페이지만 AI 재검사, 결과를 `allIssues`에 병합(page+found 중복 제거), 캐시 갱신, 결과 패널 재렌더링. 재검사 후 잔여 실패가 없으면 배너 숨김, 있으면 버튼 유지.
- **대상:** panels/panel8/panel8.js, panels/panel8/test-fixtures.js (신설), index.html

---

## 2026-07-07 — v2.6.6 (기능 개선 6건 + 프롬프트 캐싱 3건)

### shared/app.js + index.html + panels/panel8·18/panel8·18.js (IMP-1~6)

- **[M] IMP-1 renderRows 데이터 이스케이프:** `b.title`·`b.pub`·`l.title`·`l.service`·`l.cat2`·`p.title`·`p.team`·`p.month`·`d.cat`을 `innerHTML`에 삽입 전 `escHtml()` 적용. onclick 속성 내 카테고리명은 `catEsc = escHtml(d.cat).replace(/'/g,'&#39;')`으로 HTML 속성 안전 이스케이프 통일(기존 `replace(/'/g,"\\'")` 교체).
- **[M] IMP-2 index.html 캐시 버스팅 통일:** 로컬 스크립트·CSS 중 `?v=` 누락 파일 전체 추가 및 기존 혼재 버전(230·231·232 등) → `?v=233`으로 일괄 통일. libs/ 서드파티 파일 제외. 상단에 "릴리스 시 ?v= 일괄 치환" 규칙 주석 추가. 타이틀 v2.6.6으로 갱신.
- **[M] IMP-3 panel8 네이버 맞춤법 커버리지 표시 + 키 만료 UI:** `_checkNaverSpeller` 반환값을 `{issues, checkedWords, totalWords, keyExpired}` 구조체로 변경. Step 2 detail에 "네이버 N건 (표본 검사: 전체의 X%)" 커버리지 표시. `keyExpired` 시 "네이버 검사기 키 만료 — data/naver-speller-key.js 갱신 필요" 주황색 경고 표시(기존: console.warn만).
- **[M] IMP-4 panel18 원고 스마트 샘플링:** `_buildManuscriptSample(combined)` 신설 — (1) 앞부분 8,000자, (2) 목차성 라인 추출(`제N장`·`CHAPTER N`·`N.N` 패턴), (3) 각 장 시작 위치에서 500자 샘플. `[--- 목차 ---]`·`[--- N장 도입부 ---]` 구분자 삽입, 총 20,000자 이내. 기존 단순 앞 절단 교체.
- **[L] IMP-5 index.html 콘솔 복귀 엣지 케이스:** 콘솔(tab11) 닫기 시 `_prevEl` null 폴백에서 `switchTab(_prevIdx, restoreEl)` 인덱스·버튼 불일치 → `restoreIdx = _getIdx(restoreEl)`으로 restoreEl에서 직접 파싱해 불일치 제거.
- **[M] IMP-6 API 키 XOR+base64 난독화 저장:** `_obfEncode`/`_obfDecode` 추가(XOR 고정 솔트 + base64, `obf:` 접두어로 인코딩 여부 구분). 저장 시 `_obfEncode(key)`, 로드 시 복호화. 기존 평문(`ub_claude_ak`) 1회 자동 마이그레이션. 완전한 보안이 아님(공용 PC 어깨너머 방지 수준) 주석 명시.
- **대상:** shared/app.js, index.html, panels/panel8/panel8.js, panels/panel18/panel18.js

---

## 2026-07-07 — v2.6.6 (프롬프트 캐싱 3건)

### shared/app.js + panels/panel8/panel8.js + panels/panel18/panel18.js (CACHE-1~3)

- **[M] CACHE-1 callClaudeApi systemBlocks 배열 지원 + usage 로깅 + beta 헤더 제거:** `opts.systemBlocks` 배열이 주어지면 `body.system`으로 그대로 사용(호출부가 `cache_control` 직접 지정). 기존 `system` 문자열 / `PUBLISHING_PERSONA` 경로 유지(회귀 없음). `data.usage` 있으면 `[callClaudeApi] tokens: N cache_read: N cache_write: N` 로깅 추가. `anthropic-beta: prompt-caching-2024-07-31` 헤더 제거(GA 기능).
- **[M] CACHE-2 panel8 callClaude SYS 프롬프트 캐싱:** `let _userRulesText = ''` 추가; `loadRulesFile`에서 원본 텍스트 저장. `callClaude`를 `systemBlocks` 방식으로 전환 — 사용자규칙 우선: `[사용자규칙(캐시), SYS(캐시), rulesCtx(비캐시)]`, 기본: `[SYS(캐시), rulesCtx(비캐시)]`, RAG 없음: `[SYS(캐시)]`. 300쪽 기준 60배치 × SYS 전체 과금 → 1회 write + 59회 read로 절감.
- **[M] CACHE-3 panel18 p18_autoCategories BOOKSTORE_TAXONOMIES 캐싱:** `BOOKSTORE_TAXONOMIES`(~5K 토큰)를 user 프롬프트에서 제거하고 `systemBlocks = [{text: sysBase + taxonomyRef, cache_control:{type:'ephemeral'}}]`으로 이동. user 프롬프트에는 도서 정보·규칙만 남김. Haiku 4.5 최소 2048토큰 조건 충족, 2회째 호출부터 `cache_read > 0` 확인 가능.
- **대상:** shared/app.js, panels/panel8/panel8.js, panels/panel18/panel18.js

---

## 2026-07-06 — v2.6.5 (버그 수정 22건)

### panels/panel8/panel8.js + 교정규칙.md·js (FIX-17~22)

- **[M] FIX-17 findRelevantChunks 섹션명 매칭 실패:** 교정규칙.md 헤딩에 `·`(가운뎃점)·공백이 혼재해 `heading.includes(section)` 직접 비교 실패 → `_norm = s => s.replace(/[·\s]/g,'')` 헬퍼 추가, 두 매칭 패스 모두 `_norm(p).includes(_norm(section))`으로 교체. `CHUNK_KEYWORDS` 키 `'통일안 핵심'` → `'통일안'`으로 단순화.
- **[M] FIX-18 교정 파일 업로드 TXT·MD 차단:** `ALLOWED_EXTS`에 `'txt'`, `'md'` 미포함 → 배열에 추가. 알림 메시지에 `.txt`, `.md` 안내 추가.
- **[M] FIX-19 AI 배치 일부 실패 시 무음 처리:** `checkLinguistic`이 단순 배열 반환 → `{ issues, failedBatches, totalBatches, failedPages }` 객체 반환으로 변경. 호출부에서 `failedBatches > 0`이면 Step 4 상태 표시를 경고색으로 변경 + `p8_aiNotice`에 "⚠️ N개 배치 실패" 경고 표시.
- **[M] FIX-20 Claude API 429/529 재시도 없음:** 일시적 과부하 오류 시 배치 전체 실패 → `_callWithRetry(fn, maxRetries=2)` 래퍼 추가(429/529/overloaded/rate.?limit/too.?many 감지, 2s→8s 지수 백오프). 배치 간 300ms 지연 추가.
- **[L] FIX-21 죽은 코드 정리:** `aiOnlyRun` 선언 주석 보강. `if (useCache && cached.aiWasRun && !(apiProvided && aiOnlyRun))` → `if (useCache && cached.aiWasRun)` 단순화(cached.aiWasRun=true이면 aiOnlyRun 항상 false). `stepRun(4, aiOnlyRun ? …)` → `stepRun(4, useCache ? …)`. `extracted.limitedExtraction` 블록 도달 불가 주석 처리(extractHWP는 항상 throw).
- **[M] FIX-22 교정규칙.md §19 신설·TOC 보완·부록 2행:** TOC에 §11~13·§18·§19 항목 추가(기존 누락). `### 10-4. 통일안 O/X 핵심 규칙`(§13 내부에 잘못 위치)을 `## 19. 통일안 O/X 핵심 규칙 (한빛미디어 편집 통일안)`으로 승격·이동(§18 다음). 소제목 `**굵게**` → `### 19-1/19-2/19-3` 으로 변환. 부록 충돌표에 '줄임표 표기'·'줄표 앞뒤 띄어쓰기' 2행 추가. `교정규칙.js` 재생성(43,207자).
- **대상:** panels/panel8/panel8.js, panels/panel8/교정규칙.md, panels/panel8/교정규칙.js, scripts/build_교정규칙.js

---

## 2026-07-06 — v2.6.5 (버그 수정 16건)

### panels/panel18/panel18.js (FIX-12~16)

- **[M] FIX-12 _parseDocxAndAdd 이중 디코딩:** `&amp;`를 가장 먼저 복원하면 `&amp;lt;` → `&lt;` → `<` 이중 디코딩 발생 → 복원 순서를 `&lt; → &gt; → &quot; → &apos; → &#N; → &amp;`(맨 마지막)으로 재배열.
- **[M] FIX-13 p18_genPromo 빈 응답 스피너 영구 잔류:** `if (raw && raw.trim())` 에 `else` 없어 AI 빈 응답 시 "홍보 카피 생성 중…" 스피너가 영구 잔류 → `else` 분기 추가, "응답이 비어 있습니다. 다시 시도해주세요." 안내 + `showToast('생성 실패: 빈 응답', 'red')`.
- **[M] FIX-14 p18_copyPromo 클립보드 실패 무처리:** `navigator.clipboard`가 `undefined`이거나 promise reject 시 아무 피드백 없이 실패 → `navigator.clipboard` 존재 확인 후 `.writeText().catch()` 로 `_fallbackCopy()` 호출. 폴백은 `textarea + execCommand('copy')`, 그것도 실패하면 "복사 실패 — 직접 선택해서 복사해주세요" 토스트. `file://` 환경 대응.
- **[M] FIX-15 p18_handleFiles 미지원 확장자/라이브러리 부재 무피드백:** 미지원 확장자(`.hwp` 등), `pdfjsLib` 부재, `JSZip` 부재, `document.xml` 부재 4개 경로에서 `pending--`만 하고 사용자 알림 없음 → 각 분기에 `showToast('❌ 처리할 수 없는 파일: fname (지원: docx/txt/pdf)', 'red')` 추가. 모두 `typeof showToast === 'function'` 가드 포함.
- **[L] FIX-16 PDF catch showToast 가드 누락 (FIX-8 후속):** FIX-8에서 추가된 PDF catch 블록이 `showToast`를 가드 없이 호출 → `showToast`가 `undefined`이면 `ReferenceError`로 `pending--`가 실행되지 않아 무한 대기 재발 → `pending--; if(!pending) render();`를 `showToast` 호출 앞으로 이동하고 `typeof showToast === 'function'` 가드 추가.
- **대상:** panels/panel18/panel18.js

---

## 2026-07-06 — v2.6.5 (버그 수정 11건)

### shared/app.js

- **[H] FIX-1 fileToB64 RangeError + onerror 누락:** 대용량 파일에서 `btoa(String.fromCharCode(...new Uint8Array()))` 스프레드 인자 한도 초과로 `RangeError` 발생 → 8192바이트 청크 루프로 교체. `fr.onerror` 핸들러 추가(기존: reject 경로 없어 실패 시 Promise 영구 pending). `handleBest / handleLecture / handlePlanned` 호출부에 `try/catch + showToast('❌ 파일 읽기 실패')` 추가.
- **[H] FIX-2 parseCsvText 멀티라인 셀 붕괴:** `split(/\r?\n/)` 선행 분리 방식은 따옴표 안 줄바꿈(멀티라인 셀)이 있으면 행이 붕괴됨 → 문자 단위 상태 머신(inQuotes 추적, `""` 이스케이프, 따옴표 안 `\n` 셀 내용 유지)으로 전면 교체. BOM 제거 유지.
- **[M] FIX-3 CATS '인공지능 입문' 중복 키워드 오분류:** `'컴퓨터 공학 지식'`, `'컴퓨터공학 복수전공'`이 `'인공지능 입문'`과 `'컴퓨터개론/SW공학'` 양쪽에 등록 → 순서 우선으로 항상 `'인공지능 입문'`으로 오분류됨. `'인공지능 입문'` 배열에서 두 키워드 삭제, `'컴퓨터개론/SW공학'`에만 유지.
- **[M] FIX-4 CATS 오탐 키워드 2건:** `'MCP/AI에이전트'`의 단독 `'rag'`는 paragraph/storage/dragon 등에 오탐 → `' rag '`(양쪽 공백)로 교체. `cat()` 함수 초입에 `s = ' ' + t.toLowerCase() + ' '` 패딩 추가(문두/문미 매칭 보장). `'AI 영상/이미지생성'`의 단독 `'stable'`은 stablecoin 등에 오탐 → 삭제(`'stable diffusion'`은 별도 유지).
- **[M] FIX-5 handleLectureData '전체 카테고리' 헤더 덮어쓰기:** `s.includes('카테고리')`는 `'전체 카테고리'`에도 참이라 헤더 순서에 따라 `cat2c`가 `cat1c`를 덮어씀 → `if(includes('전체 카테고리'))` 분기를 `else if`로 교체, `!s.includes('전체')` 조건 추가.
- **[L] FIX-6 handlePlannedData 팀 select 쉼표 오염 + XSS:** `teams.map(...)`에 `.join('')` 누락으로 옵션 사이에 쉼표 텍스트가 낌. `${t}` → `${escHtml(t)}`로 이스케이프 추가.
- **[M] FIX-7 generateProposalWithAI maxTokens 부족:** 제안서 JSON(목차 7개+why 4+hanbit 4+discuss 3) 생성에 `maxTokens: 2000`은 부족해 잘리면 JSON 파싱 실패 → `4000`으로 상향. `callClaudeApi`에 `stop_reason === 'max_tokens'` 감지 시 `console.warn` 추가. JSON 파싱 실패 오류 메시지에 `'(응답이 잘렸을 수 있음 — 재시도 권장)'` 힌트 추가.

### panels/panel18/panel18.js

- **[H] FIX-8 p18_handleFiles PDF — catch 미존재로 영구 pending:** `pdfjsLib.getDocument().promise` 체인에 `.catch` 없어 손상/암호화 PDF 업로드 시 pending이 안 줄고 파일 목록 영구 미갱신 → `getDocument` / `getPage` / `getTextContent` 각 체인에 `.catch` 추가(실패 시 `pending--; if(!pending) render();` + `showToast`). `reader.onerror` 추가. 페이지 단위 실패는 `texts[pn-1]=''`로 허용하고 계속 진행.
- **[M] FIX-9 p18_downloadDocx 추천사 빈 섹션 배포 문서 포함:** 미리보기는 `hasRec` 조건부인데 docx는 '7. 추천사' 헤딩 무조건 추가 → `data.recommendations.some(r=>r.text&&r.text.trim())` 조건으로 헤딩+내용 전체를 감쌈. 이후 섹션 번호(8. 홍보 카피, 9. 상세 이미지) 재조정 없음.
- **[M] FIX-10 _parseDocxAndAdd 엔티티 미복원 + 구조 태그 소실:** XML 태그만 제거해 `R&amp;D` 형태가 AI 입력에 남고, `<w:tab/>` · `<w:br/>`이 소실돼 표 셀이 붙음 → 처리 순서 재정렬: `<w:tab>→'\t'`, `<w:br>→'\n'`, `<w:p>→'\n'`, 나머지 태그 제거, 그 후 `&amp;` / `&lt;` / `&gt;` / `&quot;` / `&apos;` / `&#N;` 숫자 엔티티 복원, `\n{3,}→\n\n` 정리.
- **[L] FIX-11 _fillFields SELECT 옵션 없는 값 조용히 실패:** SELECT 요소에 옵션에 없는 값(예: AI 반환 `'초·중급'`) 대입 시 조용히 실패하고 다음 `_collectFields`에서 `'초급'`으로 리셋됨 → SELECT 태그 검사 후 옵션 존재 확인. 없으면 입문/초급/중급·중상/고급·심화 패턴으로 근접 매핑(기본 `'초급'`) + `console.warn` 후 대입.
- **대상:** shared/app.js, panels/panel18/panel18.js

---

## 2026-06-25 — v2.6.5 (초기)

### panel7 비슷한 채널 오류 수정 3건
- **[H] type:channel + regionCode 조합 제거:** `apiSearchChannels()` 및 doSearch 채널 직접 검색에서 `regionCode: 'KR'` 제거 — YouTube API 스펙상 `type=channel`에서 `regionCode` 사용 불가 → "invalid filter parameter" 400 오류 발생
- **[M] 키워드 sanitize 강화 (`_sanitizeKw`):** 한글·영문·숫자 외 전체 제거, 순수 숫자 토큰 제외, 50자 상한 — YouTube 검색 연산자(`|`, `-`, `_`, `+`, `"`) 잔류로 인한 간헐적 API 오류 방지
- **[M] 페이지네이션 제거:** 비슷한 채널 검색 2페이지 → 1페이지(50건)로 축소 — `pageToken` + `regionCode` 조합의 API 컨텍스트 충돌로 인한 간헐적 오류 제거
- **[M] 한국 채널 필터 fallback:** 한국 채널 0건 시 전체 채널 상위 표시 (기존: 빈 화면)
- **[L] 에러 catch 묵음 → 사용자 메시지:** 비슷한 채널 로드 실패 시 안내 문구 표시 (기존: 완전 빈 화면)
- **[L] 🇰🇷 한국 배지:** `_isKorean=false` 채널에 배지 미표시 (fallback 케이스 대응)
- **대상:** panels/panel7/panel7.js

---

## 2026-06-25 — v2.6.4

### QA 버그 수정 4건
- **[M] panel7 ytLoadLS:** `JSON.parse` try-catch 미보호 → localStorage 손상 시 panel7 전체 초기화 실패 방지
- **[M] shared/app.js getPlanningBoard / addToPlanningBoard:** `JSON.parse` try-catch 추가 → `p25_board` 손상 시 기획 보드(panel25) 전체 기능 중단 방지
- **[L] panel7 YT_S:** `searchViewMode: 'card'` 초기 속성 추가 (명시적 초기화)
- **[L] panel7 ytSaveSearchCache / ytLoadSearchCache:** `searchViewMode` 저장·복원 추가 → 패널 재진입 시 카드/평점 목록 뷰 유지
- **대상:** panels/panel7/panel7.js, shared/app.js

---

## 2026-06-25 — v2.6.3

### 캐시버스팅 버전 파라미터 일괄 정정
- **panel7.css/js:** v=230 → v=231 (v2.6.2 수정 후 index.html 미반영, 즉시 재수정)
- **panel11.js:** 버전 파라미터 없음 → ?v=231 추가 (d9a09df QA 수정 미반영)
- **panel13.js:** 버전 파라미터 없음 → ?v=231 추가 (d9a09df QA 수정 미반영)
- **panel16.js:** 버전 파라미터 없음 → ?v=231 추가 (d9a09df QA 수정 미반영)
- **panel21.js:** v=230 → v=231 (d9a09df QA 수정 미반영)
- **panel25.js:** v=17 → v=231 (비정상 낮은 버전, v2.6.0 이후 방치)
- **대상:** index.html

---

## 2026-06-25 — v2.6.2

### panel7 평점 목록 보기 복원
- 채널 검색 결과에 **카드 보기 / 📋 평점 목록 보기** 토글 버튼 추가
- 평점 목록: 번호(1~N) + 썸네일 + 채널명+구독자 + 구독자 정규화 바 + 출판적합도 태그
- relevanceScore 0~100 정규화 후 scoreTag 전달 (태그 변별력 보장)
- 0건 empty-state 메시지 추가
- `YT_S.searchViewMode` 상태 유지 (정렬 변경 시에도 뷰 모드 유지)
- **대상:** panels/panel7/panel7.js, panels/panel7/panel7.css

---

## 2026-06-25 — v2.6.1

### YouTube API 키 안정화
- **api-keys.js:** `const` → `var` 변경 (app.js var 선언과 충돌 방지)
- **youtube.js:** `_YT_BUILTIN_KEYS` 9개 직접 하드코딩 — api-keys.js 없어도 키 동작 보장. `refreshKeys()` 폴백도 `_YT_BUILTIN_KEYS.slice()`로 통일
- **app.js:** fallback 빈 배열 → 9개 키 하드코딩 (3중 안전장치 완성)
- **index.html:** Ctrl+Alt+Enter 시 panel11 열리면서 "API 키" 탭 자동 전환 (50ms setTimeout)
- **대상:** shared/api-keys.js, shared/youtube.js, shared/app.js, index.html

---

## 2026-06-25 — v2.6.0

### 버전 업데이트
- v2.5.1 → v2.6.0
- **대상:** index.html, shared/app.js

### dev-advisor 에이전트 신규 추가
- 코드·시장 데이터 종합 진단, severity별 문제점 분류([H]/[M]/[L])
- 즉시 액션 TOP3, 3개월 예측, 6개월 로드맵 생성
- `_workspace/advisory_YYYYMMDD.md`에 결과 저장
- **대상:** .claude/agents/dev-advisor.md, .claude/skills/dev-advisory/SKILL.md

### panel8 교정 도우미 품질 강화
- **모델 고정:** Haiku → Sonnet 전면 전환 (기술서 맥락 분석 깊이 향상)
- **배치 오버랩:** 이전 배치 마지막 페이지를 다음 배치 문맥으로 전달 (배치 경계 누락 방지)
- **SYS 프롬프트 개선:** 번역체·일본식표현·수동태과용 섹션에 before/after 예시 대폭 추가
- **UI:** 이슈 없는 카테고리 박스 숨김 (이슈 있는 항목만 표시)
- **버그 수정:** 배치 오버랩 hallucination 필터 오탐 수정 (컨텍스트 페이지 found 처리)
- **대상:** panels/panel8/panel8.js

### panel10 키워드 분석 고도화
- 속도비(velocity ratio) 도입: 최근 3개월 vs 이전 영상 조회수 증가율 비교
- 급상승 트렌드(🔥 3x이상 / 📈 1.5x이상) 우선 감지
- preempt 검증에 속도비 조건 추가 (isRising 기준)
- **대상:** panels/panel10/panel10.js

### panel23 핵심 인사이트 강조 렌더링
- `## 핵심 인사이트` 섹션을 `.p23-insight-box`로 자동 래핑
- 보라색 그라데이션 배경 + 강조 테두리 스타일 추가
- generate_report.py: Claude API 없을 때 통계 기반 폴백 인사이트 자동 생성
- **대상:** panels/panel23/panel23.js, panels/panel23/panel23.css, scripts/generate_report.py

### shared/app.js 안정성 개선
- **safeLSSet + _gcLocalStorage:** localStorage 5MB 한도 초과 시 오래된 캐시 자동 정리 후 재시도
- **전역 에러 핸들러:** window.onerror + unhandledrejection → 화면 하단 배너로 사용자 노출 (6초 자동 닫힘)
- **AES-GCM dead code 제거:** loadApiKey() 내 레거시 마이그레이션 블록 ~25줄 삭제
- **YouTube API 키 분리:** 하드코딩 제거 → shared/api-keys.js (gitignore), api-keys.example.js 템플릿 추가
- **대상:** shared/app.js, shared/api-keys.example.js, .gitignore, index.html

### shared/youtube.js race condition 수정
- 선점 트래킹(optimistic tracking) 도입: fetch 완료 후 → fetch 전으로 _ytTrackUnit 이동
- 병렬 태스크 3개가 동일 키를 선택하는 문제 해소
- **대상:** shared/youtube.js

### silent catch 전체 전환 (75곳)
- `catch(_){}` / `catch(e){}` → `console.warn('[파일명] 설명', e)` 전환
- 대상 파일: panel6~25, shared/app.js, shared/youtube.js

### 전체 패널 QA — 버그 수정 7건
- **[H] panel21:313** — zip.files['word/document.xml'] null guard 추가 (손상된 DOCX 대응)
- **[M] panel7** — ytSaveLS() localStorage.setItem try/catch 추가
- **[M] panel10** — saveCustomTax() localStorage.setItem try/catch 추가
- **[M] panel11** — OpenAI 키 저장 localStorage.setItem try/catch 추가
- **[M] panel13** — buildDocx() 호출 try/catch + 에러 alert 추가
- **[M] panel16** — clipboard.writeText() .catch() 핸들러 추가
- **[M] panel25** — saveInProgress() / saveTracking() localStorage.setItem try/catch 추가
- **대상:** panels/panel7·10·11·13·16·21·25

### GitHub Actions
- actions/checkout v4 → v5 (Node.js 20 deprecation 경고 해소)
- **대상:** .github/workflows/fetch-rss.yml

---

## 2026-06-12

### 전체 QA + 코드 정리
- sim() 미사용 함수 삭제, checkStructural 함수·Step 3 UI·캐시 복원 코드 완전 제거
- _esc() 중복 함수 제거 → esc()로 통일
- match()[0] null 가드 추가 (HWPX 파싱 안정성)
- panel25 CSS 버전 불일치 수정 (v=13→v=230)
- .badge-page CSS 중복 선언 병합
- fetch-rss.yml git add에 naver-speller-key.js 추가
- fetch_naver_key.py 예외 처리 추가 (실패 시 기존 키 유지)
- **대상:** panels/panel8/, index.html, .github/workflows/, scripts/

### 혼동어·자주 틀리는 표현 45종 추가
- 되/돼 혼동 4종, ㄹ탈락·불규칙 4종, 어미 혼동 3종
- 사이시옷 4종, ㅎ불규칙 3종, 기타 빈출 혼동어 27종
- **대상:** panels/panel8/panel8.js

### 네이버 맞춤법 검사기 연동 (나라 맞춤법 대체)
- speller.town/nara-speller.co.kr 폐기 확인 → 기존 `_checkSpellerApi` 삭제
- 네이버 SpellerProxy JSONP 방식으로 신규 구현(`_checkNaverSpeller`)
- `scripts/fetch_naver_key.py` — passportKey 추출 스크립트 신규
- `data/naver-speller-key.js` — 매일 GitHub Actions로 키 자동 갱신
- `.github/workflows/fetch-rss.yml`에 Fetch Naver speller passportKey 단계 추가
- **대상:** panels/panel8/panel8.js, scripts/, data/, .github/workflows/, index.html

### panel8 교정 도우미 오탐률 개선 6건
- **조사중복**: 은/는 threshold 2→3, 에서 threshold 2→3, 문장 최소 길이 10→30자
- **조사중복**: 동사 필터 `_VERB_NEUN_RE` 22개→150개+ (IT 기술서 빈출 동사 대폭 추가)
- **조사중복**: AI 프롬프트 톤 "가장 적극적으로"→"확실한 경우만", 기준 2회→3회 이상
- **외래어 오탐**: 올바른 표기(c)로 등재된 단어가 다른 항목의 오표기(w)에 있으면 색인 제외 (143건 충돌 해소)
- **목차불일치**: 원고·조판 교정에서 불필요 → `checkStructural` 비활성화, 카테고리 UI 제거
- **대상:** panels/panel8/panel8.js, panels/panel8/panel8.css

### PDF 제목/본문 분리 강화
- `_joinLinesSmartly`에 폰트 크기 변화 감지(15%+), Bold→Regular 전환, 짧은 제목형 행 감지 추가
- 기존에 제목과 본문이 이어 붙던 문제 해결
- **대상:** panels/panel8/panel8.js

### 편집 카테고리 UI 통일
- cat-box 높이 통일(min-height:68px + flex 수직 중앙 정렬)
- cat-count 폰트 크기 상태별 다름(1.3em/1em/.85em) → .95em 통일
- cat-grid 6열 고정(12개 카테고리 → 2줄), 모바일 3열/2열 반응형
- **대상:** panels/panel8/panel8.css

### 버전 업데이트 + CHANGELOG 신규 생성
- 타이틀+헤더 날짜 2026-06-07 → 2026-06-12 업데이트
- 버전 v2.5.0 → v2.5.1
- CHANGELOG.md 신규 생성 — CLAUDE.md 변경 이력 테이블 38건을 별도 파일로 분리
- **대상:** index.html, CHANGELOG.md

---

## 2026-06-11

### 전체 QA 점검 — 버그 수정
- **[H]** fetch_rss.py 월 초 7일 전 날짜 계산 오류 — 수동 산술→timedelta 교체, import 추가
- **[M]** shared/app.js switchTab btn null 가드+getElementById null 체크 추가
- **[M]** panel25 ensureArchiveLoaded 중복 콜백 누적→_archiveCallbacks 배열 기반 flush 패턴으로 개선
- **[L]** panel23 a.icon undefined 가드(a.icon→a.icon||'')
- **대상:** scripts/fetch_rss.py, shared/app.js, panels/panel23·25

### panel8 펼침(2쪽 스프레드) PDF 교정 지원
- _detectSpread(가로/세로 비율>1.2 + 거터 텍스트<2% 이중 조건)
- _splitItemsByCenter(중앙 X 기준 좌/우 분리)
- extractPDF 페이지 루프에서 스프레드 감지→좌/우 독립 groupTextIntoLines+_joinLinesSmartly→합산
- 펼침 페이지 번호 좌/우 각각 탐색(왼쪽 대표), pages 배열 PDF 페이지당 1항목 유지(TOC 호환)
- isSpread 플래그 추가, console.debug 디버그 로그
- **대상:** panels/panel8/

### 버그 4건 수정 + 기능 1건
- **[H]** index.html id="pf-author" 중복→panel5 영역을 id="pf-author-prop"으로 변경, panel5/6/10.js 참조 일괄 교체(panel3은 기존 유지)
- **[H]** index.html panel7 닫히지 않은 `</div>` 1개 보충(584/583→584/584)
- **[M]** panel25 YES24 archive.js(5.1MB) 동적 로드(ensureArchiveLoaded — 패널 진입 시 lazy load, 실패 시 빈 결과 가드 유지)
- **[L]** shared/app.js YouTube API 키 하드코딩 경고 주석 추가
- **대상:** index.html, panels/panel5·6·10·25, shared/app.js

---

## 2026-06-02

### QA 버그 2건 수정
- p8_exportDocx window 미노출→추가(DOCX 내보내기 버튼 클릭 시 ReferenceError)
- extractDOC UTF-16LE 폴백 for 루프 인덱스 이중 증가→조건부 i+=2 분리(한글 블록 뒤 2바이트 누락 방지)
- **대상:** panels/panel8/

### 시제·인칭·종결어미 일관성 검사 추가
- _checkStyleConsistency 함수 신규(종결어미 3체계 합니다/한다/해요 혼용 감지, 인칭 1/2인칭 혼용 감지, 시제 과거/현재 혼용 감지)
- 페이지별 집계→문서 전체 주 문체 판별→20%+ 혼용 시 이슈 보고
- EDIT_CATEGORIES에 '시제·인칭·문체' 전용 카테고리 분리, CROSS_TYPES에 문체불일치 추가
- AI SYS 프롬프트 문체불일치 3관점 강화, 교정규칙.md §18 추가, 교정규칙.js 리빌드(40,617자)
- **대상:** panels/panel8/

### panel8 교정 잔여 5점 해소 (95→100점)
- 사용자 규칙 우선순위 토글(_userRulesPriority)
- 교정 보고서 DOCX 내보내기(p8_exportDocx — severity별 그룹, 해결됨 표시, JSZip OOXML)
- silent catch 4곳 console.warn 로깅 추가
- HWP 변환 안내 강화(5가지 방법+뷰어/스페이스 URL)
- DOC 파싱 안정성(mammoth→UTF-16LE 바이너리 추출 폴백+에러 메시지 구체화)
- **대상:** panels/panel8/

### 나라 맞춤법 검사기 API(speller.town) 연동
- _checkSpellerApi 함수 추가(500자 청크×최대 10회, 300ms 딜레이, file:// 자동 스킵)
- Step 2.5에 삽입(표면 검사 후·구조 검사 전), 네트워크 오류 시 조용히 중단
- **대상:** panels/panel8/

### 국립국어원 외래어 표기법 용례 19,558건 적용
- 용례 xlsx(67,269건)에서 오표기 보유 항목 추출→loanword-data.js(오표기→올바른 표기 역색인)
- checkSurface에 _loanwordIndex 검사 루프 추가, index.html에 script 태그 추가
- **대상:** panels/panel8/, index.html

### QA 버그 3건 수정
- panel15 fmAiDraft localStorage 키 cp_concept_v1→ms_concept_v2
- panel18 p18_genPromo 필드명 4개(author→authors/intro→description/review→reviewIntro/reader→reviewTarget)
- panel10 TAXONOMY_VERSION v5→v6 통일
- **대상:** panels/panel10·15·18

### panel8 교정 도우미 6건 개선 (86→95점)
- AI 모델 자동 전환(3000자/코드→Sonnet, 그외 Haiku)
- 프롬프트 캐싱 활성화(anthropic-beta 헤더)
- RAG 관련성 점수 정렬(_relevanceScore)
- p8_rerunAI 크로스 중복 적용, 캐시 안전 폴백(전체→3개씩)
- 문장 분리 종결어미 4→15종
- **대상:** panels/panel8/, shared/app.js

### MARKETING 홍보 카피 생성
- panel18 SECTIONS에 '8. 홍보 카피' 추가, _renderPromo UI(4종 버튼)
- p18_genPromo(SNS 4플랫폼/서점 한줄평 10개/보도자료 A4/뉴스레터), 미리보기+DOCX 포함
- **대상:** panels/panel18/

### WRITING AI 연동 3건
- panel13 cpAiDraft(기획보드/키워드 데이터→12필드 빈칸 자동완성)
- panel12 msAiDraft(목차 맥락→도입부/본문 초안)
- panel15 fmAiDraft(7탭별 전용 프롬프트+panel13 컨셉 데이터 참조)
- **대상:** panels/panel12·13·15

### panel25 기획 보드 전환율 개선 4건
- 시차 예측(computeTrendLag — YES24 신규 베스트셀러+3~6개월 전 RSS 키워드 래그 패턴)
- 사내 진행작(getInProgress/saveInProgress — 접이식 UI+AI 프롬프트 중복 회피)
- 집필 능력 시그널(extractWritingSignals — github/velog/tistory 등 8도메인 URL+설명 길이 점수화)
- 아이템 전환 추적(TRACK_STAGES 6단계 드롭다운 — 검토/섭외중/계약/집필중/출간/보류)
- **대상:** panels/panel25/

### 자동 수집 인프라
- build_authors.py data/yes24/archive.json 기반 재작성(로컬 xlsx 폴백)
- fetch-rss.yml에 build_authors+authors-data.js 커밋 단계 추가
- generate_report.py 새 파일만 다운로드 유지
- **대상:** scripts/, .github/workflows/

### 분석 패널 정확도/성능 개선 14건
- **[높음]** panel10 pick_type 30% 강제 제거+preempt 코드 검증, panel8 _compressForTokens 실적용
- **[중간]** panel10 taxonomy TTL 백그라운드 갱신, 병렬 중첩 16→4, panel7 doSearch 병렬화, nameScore 상한 150, calcPublishTier 조건 강화, 슈퍼 루키 ageBonus 절반, panel8 AI투 오탐 완화+_isSameSuggestion 개선, panel22 짧은 블록 임계값 계층화+editDistance 최적화, panel23 hasPubSignal 2단계 매칭, panel25 잘린 JSON 복구
- **대상:** panels/panel7·8·10·22·23·25

### panel25 기획 보드 데이터 현황 직관화
- Math.max 뭉뚱그림 → 📌 추가 수(주) + 세션 데이터(보조) 분리 표시
- **대상:** panels/panel25/

### panel24 모바일 최적화
- 테이블 8열→4열(출판사·최고순위·등장일수·📌 숨김), 정렬 버튼 p24-sort-wrap 래퍼, 폰트/패딩 컴팩트화
- **대상:** panels/panel24/

---

## 2026-06-01

### 하네스 드리프트 수정 (panel24/25 반영)
- dashboard-developer 범위 0~25+패널 테이블 +2행
- qa-tester 파일 맵 +2행, dashboard-dev 함수 테이블 +2행
- qa-testing 파일 맵+PanelRegistry 5~25, bug-fix 파일 맵 +2행
- process-inspector 범위 0~25+탭 표 +2행
- **대상:** agents/, skills/

### QA 버그 3건 수정
- panel7 window.YT_S 미노출→추가
- panel10 window._kwDisplayedCards 미노출→renderCards에 추가
- panel7 📌 버튼 채널명 어포스트로피 XSS→data-title+dataset.title 방식 교체, st→subs 변수 수정
- **대상:** panels/panel7/, panels/panel10/

### panel25 기획 보드 구현+명세서 반영 전면 재작성
- 명세 4-2 시스템 프롬프트(5가지 판단 필터) 적용
- 출력 스키마 변경(summary+recommendedItems[fitType별]+authorMatching[verdict별]+cautions)
- 리스크 플래그 자동 태깅(저서보유/캐시카우/집필고사)
- fitType별 색상 카드+verdict별 배지, 대시보드 통합 분석 연동
- targetLevel 필드+다양성 규칙(초보/중급/고급 혼합 강제)
- **대상:** panels/panel25/, shared/app.js

### 기획 보드 하네스 확장
- planning-board 스킬 신규(panel25 구조·📌버튼 패턴·AI 종합·내보내기)
- publish-orchestrator 라우팅+트리거 추가, dashboard-developer panel24/25 파일 맵 추가
- **대상:** skills/planning-board/, skills/publish-orchestrator/, agents/dashboard-developer.md

---

## 2026-05-31

### panel7 채널 검색 품질 대폭 개선
- 채널 직접 검색 1→3페이지, order:date 최신 영상 검색 2페이지 추가
- 루키 하한 1000→500명, 나이 보너스 4→6단계(6개월 미만 5.0)
- relevanceScore 전면 재설계(영상제목매칭 최우선+영상등장+최근활동+채널명+설명깊이+규모보조)
- titleMatchMap/recentMatchMap 수집, 비슷한 채널 1→2페이지
- **대상:** panels/panel7/panel7.js

### Anthropic RSS 스크래핑 추가
- scrape_anthropic_news() HTML 파서(제목/설명/날짜 분리, 카테고리 제거, HTML 엔티티 변환)
- FEEDS에 type:scrape 분기
- **대상:** scripts/fetch_rss.py

---

## 2026-05-29

### panel23 리포트 사이드바 2탭 구조
- 📋 리포트/📑 목차 전환, 리포트 선택 시 목차 탭 자동 전환
- **대상:** panels/panel23/

### YES24 자동 리포트
- generate_report.py(Google Drive 폴더 스캔→엑셀 다운로드·파싱→archive.json 누적→Claude API 분석)
- 148일 29,250건 벌크 import, compute_stats 이전 리포트 형태 일치
- **대상:** scripts/generate_report.py, scripts/build_reports.py, data/yes24/, data/reports/

### panel23 트렌드 탭 아카이브 활용 강화
- 급상승/하락 키워드 카드, 출판 기회 신호(3주연속 증가·신규트렌드·크로스소스)
- Chart.js 주간 키워드 차트, 키워드→기사 모아보기, 소스 활동 히트맵
- **대상:** panels/panel23/

### GitHub Pages 배포
- git init→GitHub 저장소 생성(gmountain01/publishing-helper)→Pages 활성화
- RSS 자동 수집 워크플로우(매일 KST 09:00), panel23 원격 fetch 폴백
- **대상:** .github/workflows/, panels/panel23/

### 모바일 UX 전면 개선
- 헤더 40px+스크롤 자동숨김(WeakMap)
- panel5/6/17 우측 미리보기 숨김, panel7 사이드바→모바일 탭바 교체
- panel10/12 사이드바 숨김, panel23 소스필터 숨김+리포트 사이드바→드롭다운 교체+목차 탭 전환
- **대상:** shared/styles.css, shared/app.js, panels/panel5~23, index.html

### 모바일 최적화 하네스 확장
- mobile-optimizer 에이전트 + mobile-dev 스킬 신규 추가
- publish-orchestrator 라우팅 테이블에 모바일 최적화 행 추가
- **대상:** agents/mobile-optimizer.md, skills/mobile-dev/, skills/publish-orchestrator/

---

## 2026-05-28

### 전체 디자인 리뉴얼
- accent #3B3F8C→#4F46B8, 배경 베이지→#FAFAFA(zinc 뉴트럴)
- 사이드바 #1C1C2E→#18181B 다크, 헤더 84px→60px 컴팩트
- 폰트 Pretendard+Inter+JetBrains Mono(IBM Plex 전체 제거)
- **대상:** shared/styles.css, panels/panel7/, index.html

### 퍼포먼스 개선
- 패널 JS 20개에 defer 속성 추가
- switchTab에 PanelRegistry.onDeactivate 훅 추가(_activePanel 추적)
- **대상:** index.html, shared/router.js

### 버그 5건 수정
- **[H]** panel8 p8_rulesBadge ID 누락, panel5 addPropCompRow innerHTML+=→insertAdjacentHTML
- **[M]** panel21 p21_openPreview 이중 정의, panel12 setInterval 영구 실행, panel3 innerHTML+= forEach→map().join()
- **대상:** panels/panel3·5·8·12·21

### 미사용 코드 정리
- panel19(상세이미지 제작)·panel20(카드뉴스) 스켈레톤 삭제, shared/store.js 미사용 이벤트 버스 제거
- **대상:** index.html, panels/, shared/

### yes24 147일치 데이터 분석
- 기획 아이템 8건 도출, _workspace/yes24_analysis_20260527.md 생성
- **대상:** _workspace/, data/reports/

### GitHub Pages 배포 구조 구축
- .github/workflows/fetch-rss.yml(매일 KST 09:00 RSS+리포트 자동 수집/빌드)
- data/rss/ + data/reports/ 레이어(file:// + https:// 양쪽 동작)
- **대상:** .github/, data/, scripts/

### panel23 시장 분석 신규 추가
- 3탭 구조(피드/트렌드/리포트), RSS 수집 14개 소스(글로벌 8+한국 6)
- archive.json 누적 아카이브, 주간 키워드 트렌드, 출판 기회 신호
- **대상:** index.html, panels/panel23/, data/, scripts/

---

## 2026-05-27

### panel22 소스 코드 비교 오탐율 대폭 개선 (18건)
- SKIP_DIRS 의존성 경로 자동 제외, isFilename 토큰 추출
- nonCodeLines 갭 카운터+줄번호 1 리셋 감지, _looksIncomplete 조판 강제 개행 병합
- normPdf 사이드바/마지널 노트 자동 제거, 페이지 번호 오감지 방지
- matchAllBlocks 3-Pass(파일명·폴더+내용·품질검증), normAggressive 무공백 2차 매칭
- buildSourceIndex 진단(skipped/skippedFiles), renderReport 진단 박스
- dead code 제거, 하네스 3파일 동시 업데이트
- **대상:** panels/panel22/panel22.js, skills/dashboard-dev·qa-testing·bug-fix
