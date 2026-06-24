# CHANGELOG

출판도우미 변경 이력. 최신순 정렬.

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
