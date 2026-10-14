# v2.17.0 1단계 — 실제 AI 품질 평가 계획(실행 전 승인용)

## 1. 비교 기준과 코드 버전

| 비교 | 앞 조건 | 뒤 조건 | 코드 |
|---|---|---|---|
| **A. 전체 개선 효과** | 1단계 변경 직전 코드 `before` | 최종 코드(후속 수정 포함) 프로필 미연결 `off` | before = 커밋 **252fd7f**(v2.16.0)를 저장소 밖 `..\_eval_snapshots\before-252fd7f\`로 추출(현재 작업 파일 불변). off/on = 현재 작업 트리 = 252fd7f + 미커밋 변경(1단계 v2.17.0 + 후속, panel26은 v2.16.1+후속 포함) |
| **B. 프로필 연결 효과** | 최종 코드 미연결 `off` | 최종 코드 연결 `on` | 같은 작업 트리, 차이는 책 프로필 연결뿐 |

- 변경 직전 코드 검증: 최종 panel8.js·review-policy.js·app.js에 1단계 패치를 역적용하면 252fd7f와 바이트 동일(panel8.js는 1단계가 추가한 식별자 `_activeCriteria` 줄 2개만 남음 — 1단계 이전엔 존재하지 않는 식별자). 즉 **교정(panel8)의 변경 직전 = 252fd7f**.
- panel26.js의 변경 직전(v2.16.1+후속 2, 미커밋)은 커밋도 검증 해시도 없음 → 재구성하지 않고 **내용 완성도 검토의 A(전체 개선)는 평가 불가**로 보고. 10월 5일 결과(`eval/proofread/results/run.json`)는 기준으로 쓰지 않는다.
- 실행 결과 JSON마다 코드 스냅샷(git HEAD·미커밋 파일 목록·로드한 파일별 SHA-256 앞 16자)을 기록한다.

## 2. 원고·조건·반복(둘 다 IT 분야 → 비IT 효과 미평가)

| 평가 | 원고 | 심은 것 | 조건 × 반복 | 실행당 호출 |
|---|---|---|---|---|
| 교정 `checkLinguistic` | 《현장학습 조 편성, 10초 만에 끝내기》 6쪽 6,501자 (`eval/proofread/source.json`) | 오류 38건(표기 11·번역체/용어 11·문법 7·사실 6 + 코드·병기 3) + 정상 문장 15건(정상 조사 반복 4·단어 내부 문자열 2·코드 2·병기 1·외래어/URL/규격/약어 5·정상 피동 1). 심은 뒤 38건 위치·정답 연결 자동 검증(oracle 38/38). 상세·기대 행동·채점 예시: `정답셋_검토.md` | before 2 · off 2 · on 2 = 6회 | 2(배치 2) |
| 내용 완성도 `reviewLogic` | 《파운데이션 모델과 에이전틱 AI》 둘째 마당 추출본 67,520자(세션 scratchpad `after.md`, 저장소 밖) | 오류 4건, 정답 사례 10건(good 5·bad 4·fact 1) | off 2 · on 2 = 4회 | 4(후보 1 + 검증 묶음 ~3) + 실패 시 반분 재시도 |

같은 모델 `claude-sonnet-4-6`, 같은 평가 기준·심은 오류·정상 문장. 조건 간 차이는 코드 트리(before)와 프로필 연결(on)뿐. 책 프로필(`profile_codex.json`, `profile_fm.json`)에는 심은 오류의 정답·표기 예시·사례 문장을 넣지 않았다. 책 전체 검토·2단계는 보류.

## 3. 예상 호출·비용·시간과 상한

| 평가 | 실행 | 호출(예상) | 비용 근거 | 예상 비용 | 예상 시간 |
|---|---|---|---|---|---|
| 교정 | 6 | 12 (+429/529 재시도 최대 2회/호출) | 실행당 ≈ $0.23(입력 ≈8k·캐시쓰기 ≈37k·캐시읽기 ≈10k·출력 ≈4.4k 토큰) | ≈ $1.4 | ≈ 6분 |
| 내용 완성도 | 4 | 16 (+검증 실패 시 반분 재시도, 웹 검색 ≤5회/검증 호출) | 실행당 ≈ $1.2(입력 ≈116k·출력(사고 포함) ≈59k 토큰) + 웹 검색 ≤ $0.2 | ≈ $5.5 | ≈ 40분 |
| 합계 | 10 | ≈ 28~40 | | **≈ $7** | ≈ 45~50분(순차) |

**비용 상한 제안**: 교정 묶음 $4, 내용 완성도 묶음 $10 → 총 **$14**(예상의 2배, 재시도·검증 반분 재시도 포함). 하네스 `--max-usd`가 응답 사용량으로 누적 추정 비용을 세고 상한에 닿으면 **다음 요청을 보내기 전에 차단**한다(진행 중인 요청 1건은 넘을 수 있음). 비용은 공식 요금표 추정이며 실제 청구액은 콘솔에서 확인.

## 4. 키 처리

- 노출 이력이 있는 기존 키는 쓰지 않는다. 사용자가 **새로 발급한 키**를 저장소 밖 파일(예: `C:\dev\리리가 도와줌\eval_key.txt`, 한 줄)에 넣으면 하네스가 `--key-file`로 읽는다. 키 값은 채팅·명령문·결과 JSON·usage-log(길이·해시만)·보고서 어디에도 쓰지 않는다. 평가가 끝나면 파일을 지운다.
- Windows 사용자 환경 변수 `ANTHROPIC_API_KEY`는 설정하지 않는다(설정하면 Claude Code 자체가 API 과금으로 바뀜 — 2026-10-05 이력).

## 5. 실행 순서(승인 뒤)

```
cd 출판도우미
# 교정: before → off → on (각 2회)
node eval/proofread/run_eval.js --normal eval/profile/normal.json --runs 2 --out eval/profile/results/proof --label before --root ../_eval_snapshots/before-252fd7f --key-file ../eval_key.txt --max-usd 4
node eval/proofread/run_eval.js --normal eval/profile/normal.json --runs 2 --out eval/profile/results/proof --label off --key-file ../eval_key.txt --max-usd 4
node eval/proofread/run_eval.js --normal eval/profile/normal.json --runs 2 --out eval/profile/results/proof --label on --profile eval/profile/profile_codex.json --key-file ../eval_key.txt --max-usd 4
# 내용 완성도: off → on (각 2회)
node eval/content/run_eval.js --cases <scratchpad>/eval_content/cases.json --mode after --runs 2 --out eval/profile/results/logic --label off --key-file ../eval_key.txt --max-usd 10
node eval/content/run_eval.js --cases <scratchpad>/eval_content/cases.json --mode after --runs 2 --out eval/profile/results/logic --label on --profile eval/profile/profile_fm.json --key-file ../eval_key.txt --max-usd 10
node eval/profile/compare.js   → eval/profile/results/report.md
```

API 없는 점검(완료): `--fake`로 before/off/on·logic off/on 전 조건 배선, 요청 증빙(off=프로필 없음, on=분야 문자열), 코드 스냅샷 기록, 채점·보고서 생성 확인. `--oracle --normal`로 정상 문장 심은 뒤 35건 위치·정답 100% 확인.

## 6. 평가 항목과 판정

- 교정: 탐지율·정확 수정률(35건), 정상 문장 오지적률(6건, 종류별 별도 집계), 의미 훼손 후보(AI 수정안의 숫자·영문 용어 변경 → 사람 검토). 모든 지적은 교정 단계로 구분: 오류 교정(correction) / 문맥 검토(review) / 선택적 윤문(style). 심지 않은 곳의 추가 지적은 단계별로 집계하고 사람 검토.
- 내용 완성도: 정답 사례 10건(타당한 지적 유지·오지적 남음·기술 오류 바로잡음), 근거 부족(검증 보류·검증 못 함), 부적절한 수정안(수정안 보류·다시 씀), 그 밖의 지적은 목록으로 사람 검토. 자동 반영 가능 건수는 품질 지표가 아님.
- 사례 판정: 개선 / 악화 / 동일 / 판단 불가(반복 간 차이). 반복 2회 → 초기 평가. 비용·시간·반복 간 차이를 실행별로 기록.
- 결과 보고는 A(전체 개선)와 B(프로필 연결)를 별도 절로, 기능 테스트 통과와 AI 품질 결과를 구분. 발견한 문제는 수정하지 않고 보고.

## 7. 산출물

`eval/profile/results/`(gitignore): 실행별 JSON(코드 스냅샷·요청 증빙·검사 기준·사용량·비용·상한·사례별 결과·정상 문장·사람 검토 목록) + `report.md`.
