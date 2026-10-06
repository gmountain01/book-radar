# QA 작업 노트

출판도우미 QA 이력과 재QA 지침. **QA를 다시 할 때는 이 파일을 먼저 읽고** 아래 '다시 손대지 않을 것'과 '알려진 한계'를 건너뛴 뒤, 그 뒤의 변경분에 집중한다. 수정 내역 자체는 CHANGELOG.md에 있고, 여기에는 *무엇을 어떻게 검증했고 무엇이 확정됐는지*만 남긴다.

## 재QA 절차(요약)

1. `git log --oneline -1`로 마지막 QA 커밋 이후 변경 파일을 확인(`git diff --stat <마지막 QA 커밋>`).
2. 유료 호출 없는 검증부터: `node scripts/run_tests.js`(전체 테스트), `python scripts/check_version.py`, `node --check` 전체.
3. 브라우저 스모크(가짜 API, Playwright): 교정 도우미 전체 흐름·원고 구조 검토 흐름. 스크립트는 세션 scratchpad에 두었으므로 재작성 필요 — 아래 '스모크 시나리오'를 그대로 만들면 된다.
4. 코드 QA는 영역을 나눠 읽기 전용 에이전트 3개 병렬(패널 신규 로직 / 공용 함수·추출 / 시스템 정합성). 수정은 한 사람이 모아서 한다.
5. 수정 뒤 회귀 테스트를 `scripts/test_*.js`에 추가하고, 이 노트의 이력 표와 '다시 손대지 않을 것'을 갱신한다.

## 스모크 시나리오(재작성용)

- **교정 도우미:** `index.html`을 file://로 열고 `#p8_fileInput`에 DOCX를 넣은 뒤 `window.loadApiKey`를 `sk-ant-api03-` + 60자로, `window.fetch`를 api.anthropic.com만 가짜 응답(두 번째 호출 529)으로 바꾸고 `p8_startProofread()` 실행 → `#p8_loadingTitle`이 '교정 완료!'가 될 때까지 대기 → pageerror 0, `UsageLog.runs()`에 실행 1건·재시도 1·미확인 1, 결과 칩에 '💰 API 사용량' 버튼, 같은 파일 재업로드 시 캐시 경로 완료.
- **원고 구조 검토:** `#p26_file`에 DOCX → `P26._state.outline` 생길 때까지 대기 → `window.callClaudeApi`를 가짜(검증 담당 지시문이면 results 배열, 아니면 items/proof)로 바꾸고 '📝 내용 완성도 AI 검토' 클릭 → 진행 띠 `#p26_stage`에 단계 표시 → 결과에 철회 1·재작성 1·출처 확인 1, `scopeNotes`에 그림·메모·웹 검색 수. 목차 비교 펼쳐 숫자 열 x좌표가 모든 줄에서 같은지, 캐시(`p26_v1_*`)에 evidence 본문이 없는지 확인.

## QA 이력

| 날짜 | 범위 | 방법 | 결과 |
|------|------|------|------|
| 2026-10-06 | 미커밋 v2.7.37~v2.14.0 전체(panel26 신규, panel8 추출·사용량 연동, hwp5 스타일, app.js callClaudeApi 확장, usage-log 신규, 테스트·평가 스크립트, index.html 메뉴·버전) | 읽기 전용 QA 에이전트 3개 병렬 + 전체 테스트 + Playwright 스모크 2종(가짜 API, 유료 호출 없음) + CI 흉내(gitignore 파일 제외 복사 후 테스트) | H 3·M 13·L 20여 건 발견. H·M 전부와 L 대부분 수정(아래 표). 수정 후 테스트 전체 통과, 스모크 오류 0, 회귀 테스트 10여 건 추가. 상세: CHANGELOG v2.14.1 |

### 2026-10-06 발견·조치 표

| 심각도 | 위치 | 증상 | 조치 |
|---|---|---|---|
| H | scripts/test_structure_review.js | gitignore된 원고(eval/proofread/source.md)를 읽어 CI 실패 | 파일 없으면 그 검사만 건너뜀. 로컬·CI 흉내 양쪽 통과 확인 |
| H | panel26 parseOutline | ``` 코드 블록 안 `# 주석`이 제목으로 잡혀 분량·목차 오염 | 펜스 안 줄 제외(번호 줄 추정 모드 포함). 회귀 테스트 |
| H | panel26 p26_load | AI 검토 중 다른 파일을 열면 검토 결과가 새 원고 캐시에 붙음 | busy면 열기 차단+알림 |
| M | panel26 bookApplicable | 확인 보류(C·H)·사실 미확인 강등 항목이 수락 시 원고에 자동 반영 | tier C/H·downgraded는 의견서에만 |
| M | panel26 applyCheck | 검증이 replace:false로 다시 쓴 수정안을 그대로 교체 적용 | 내용 항목은 replace 값대로 add/edit, 교정 항목은 유형 유지 |
| M | panel26 verifyBatch/verifyCandidates | 검증 호출 실패·형식 오류가 조용히 전부 '보류' 처리, 웹 검색 불가 판정이 너무 넓음(429도 불가로 오판) | 실패 묶음을 검토 범위에 표시, 배열 루트 응답 허용, 불가 판정 정규식 축소 |
| M | panel26 candidatesByChunk | 구간 하나 실패 시 앞서 비용 낸 구간 결과까지 소실 | 실패 구간만 빈 결과+범위 메모, 전부 실패일 때만 오류 |
| M | panel26 saveCache | 근거 자료(evidence)까지 캐시에 저장해 용량 초과·조용한 실패 | 저장 시 evidence 본문 제거, safeLSSet 경유, 실패 시 1회 알림 |
| M | panel26 logicCard/_review | 옛 형식 캐시로 render 예외 → busy가 안 풀림 | 가드 추가, render를 try로 |
| M | panel26 docx 내보내기 | XML에 못 쓰는 제어 문자로 Word '손상' | 제어 문자 제거 |
| M | panel26 p26_decide | AI 수락 취소 뒤 직접 옮기기가 다른 제목에 적용 | 그 뒤의 직접 옮기기 취소+알림(되돌리기 가능) |
| M | panel26.css 목차 비교 | 꼬리표 유무에 따라 열이 어긋남 | 꼬리표 자리를 항상 출력 |
| M | shared/usage-log.js | 기록 3,000건(~2.6MB)이 GC 대상이 아니어서 다른 캐시를 먼저 지움, 호출마다 전체 직렬화 | 600건·실행 단위 정리, safeLSSet 경유, GC 접두사·세션 내보내기 제외에 추가, cachedAt |
| M | shared/app.js _gcLocalStorage | 나이 판단이 ts/savedAt만 봐서 pf_v3_·p26_v1_가 항상 '가장 오래됨' | cachedAt 포함 |
| M | panel8 p8_startProofread | 파일 읽기 실패로 돌아갈 때 사용량 실행이 열린 채 남음 | 그 분기에서 end(); 15분 조용하면 자동 종료 |
| L | app.js callClaudeApi | HTTP 200인데 JSON 아니면 기록 없이 예외, pause_turn 4회 뒤 경고 없음, full 반환 usage가 마지막 턴만 | 각각 기록·경고·턴 합산 |
| L | usage-log | esc에 작은따옴표 없음, CSV 수식·날짜 셀, 새로고침 뒤 callId 중복, 오래된 run 행만 빠져 고아 호출 | 모두 수정 |
| L | hwp5.js STYLE | DocInfo 일부만 풀리면 RangeError로 읽기 전체 실패 | try로 격리 |
| L | panel8 HWPX 검토 읽기 | 그림 치환 시 캡션 글까지 소실 | 캡션 80자 보존 |
| L | panel8 _rewriteParticleBatch | 재요청 예외 시 _miss 표시가 캐시에 남음 | 정리 후 재던짐 |
| L | panel26 | [소소] 아래 편입·추가로 수준 5 초과, 숫자 수준 6~9 통과, 많음 기준 1.0 이하 입력, 수락 칩이 반영 불가 항목도 셈, 의견서 묶음 제목 수준, 진행 문구 잔상, 비용 안내 문구 '호출 1회' 오류 | 모두 수정 |
| L | scripts/run_tests.js | 구조 검토 테스트의 비동기 부분을 기다리지 않음 | await |
| L | 저장소 | index.html·styles.css 줄 끝 LF/CRLF 섞임(커밋 시 전체 파일 변경으로 보임), eval/content 결과 파일 gitignore 없음, CLAUDE.md 이력 표 순서 | CRLF 통일, .gitignore 추가, 행 순서 정정 |

## 다시 손대지 않을 것(검증 완료, 재QA 때 건너뜀)

- **callClaudeApi 호출부 22곳**(panel5·6·10·12·13·15·16·17·18·21·25·26, app.js, panel8): `full` 옵션 없는 호출은 모두 문자열 반환 그대로. 예외 메시지 형식 불변. thinking 블록이 먼저 오는 응답도 텍스트 블록만 이어 붙여 처리.
- **교정 도우미 기본 추출(extractFile 옵션 없음)**: 바뀐 것은 의도된 세 가지뿐 — DOCX·HWPX·HWP 스타일 이름 제목 수준(v2.8.2), TXT·MD base64 그림 자리표시(v2.13.1), depthIsLevel 플래그. 같은 DOCX 추출 결과를 바이트 단위 비교해 동일 확인(v2.13.0).
- **index.html**: tab26 위치(Proofreading 2번째), 패널 div, 스크립트 순서(usage-log→app, panel26은 panel8 뒤 defer), ?v 통일, div 균형, 중복 id 없음. `scripts/check_version.py`가 커밋 시 ?v 미상향을 잡는다.
- **라우팅·저장소**: switchTab/PanelRegistry에 패널 번호 하드코딩 없음. GC 접두사: pf_v3_·p26_v1_·api_usage_v1은 캐시(지워도 됨), ub_*는 사용자 데이터(안 지움). 세션 내보내기는 API 키·api_usage_v1 제외.
- **usage-log 개인정보**: API 키·원고·프롬프트 본문은 저장하지 않음(구간 길이·해시만) — `scripts/test_usage_log.js`가 매번 확인.
- **panel26 전역 노출·이스케이프·applyOps·되돌리기 스냅샷·정리 함수·캐시 sig 비교**: 2026-10-06 에이전트 전수 확인. applyOps 규칙(편입=대상 끝, 올리기=속한 [중] 뒤, 순서=기준 앞, 나누기=[절]은 첫 [중]/[중]은 뒤 새 [중], 삭제=제목·하위 제거, heading=순서 유지 수준만)은 테스트로 고정되어 있으니 바꾸지 말 것.
- **hwp5.js 오프셋**: PARA_HEADER +8 문단 모양 ID(UINT16), +10 스타일 ID(UINT8), STYLE 레코드 한글·영문 이름 순서 — HWP 5.0 규격과 일치.
- **요금표**: Sonnet 4.6 $3/3.75/6/0.30/15, Haiku 4.5 $1/1.25/2/0.10/5(100만 토큰당), 최소 캐시 길이 1,024/4,096 — 공식 문서 2026-10-06 확인.

## 알려진 한계(수정하지 않기로 한 것·보류)

- panel8 교정본 저장(p8_downloadCorrected)은 원본 TXT/MD 텍스트에 치환하므로, 지적 문장에 `[그림 n]` 자리표시가 끼어 있으면 그 수정은 적용되지 않는다(드묾).
- panel8 두 번째 캐시 지점(문체 위생)은 배치마다 바뀌는 RAG 뒤에 있어 매번 쓰기 할증만 붙는다 — 비용 최적화는 측정 뒤 별도 작업.
- parseAiJson(app.js)은 JSON 문자열 안의 ``` 펜스도 지운다 — 인용에 코드 펜스가 있으면 원문 대조 실패(quoteMissing). 공용 함수라 보류.
- 제목 없는 긴 본문 하나가 12만 자를 넘으면 구간 예산을 넘겨 그대로 보낸다(컨텍스트 초과 가능) — 설계상 '자르지 않음'.
- gatherEvidence는 후보×용어마다 원고 문장을 다시 나눈다(성능) — 실측 지연 없어 보류.
- names()가 AI 문장 속 `n12` 같은 토큰을 제목으로 바꿀 수 있다(변수명과 충돌) — 드묾.
- 번호 줄 제목 추정은 휴리스틱("3.5 GHz…" 같은 짧은 줄 오탐 가능).
- 관측하지 못하는 API 호출: panel11 직접 fetch, scripts/generate_report.py(서버), 평가 스크립트(node), 다른 기기.
- 실제 API 회귀 평가(eval/content/run_eval.js)·웹 검색 사용 가능 여부는 사용자 허락 뒤에만.
- data/yes24/2026_books.csv는 커밋 보류(처리 결정 대기).
