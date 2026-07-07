/**
 * panel8 교정 규칙 셀프 테스트 픽스처
 * window.P8_TEST_FIXTURES = [{ text, expectType, expectFound }, ...]
 *
 * expectType : 기대하는 이슈 type (null = 정상 문장, 이슈 없어야 함)
 * expectFound: 이슈 found 필드에 포함돼야 하는 문자열 (expectType != null 일 때만 사용)
 *
 * 커버 범위 — 오류 픽스처 30건
 *   PARTICLE_PATTERNS  5건 (조사 인접 오타)
 *   DOUBLE_PASSIVE_PATS 7건 (이중 수동)
 *   LOANWORD_PATS      4건 (외래어 표기 오류)
 *   REDUNDANT_PATS     4건 (중복 군더더기)
 *   JSTYLE_PATS        4건 (번역체·일본식 + AI투)
 *   UNITY_PATS         6건 (맞춤법·띄어쓰기)
 * 정상 문장 픽스처 10건 (위 패턴 어느 것도 탐지 안 해야 함)
 */
window.P8_TEST_FIXTURES = [

  // ── PARTICLE_PATTERNS — 조사 인접 오타 (5건) ──────────────────────────────
  { text: '이 책을를 읽어보세요.',              expectType: '오탈자',         expectFound: '을를' },
  { text: '학생이가 교실로 들어왔다.',           expectType: '오탈자',         expectFound: '이가' },
  { text: '그는은 이미 알고 있었다.',            expectType: '오탈자',         expectFound: '은는' },
  { text: '사과와과 배를 함께 먹었다.',          expectType: '오탈자',         expectFound: '와과' },
  { text: '학교에서서 새로운 것을 배웠다.',       expectType: '오탈자',         expectFound: '에서서' },

  // ── DOUBLE_PASSIVE_PATS — 이중 수동 (7건) ────────────────────────────────
  { text: '보고서가 오늘 완성되어지다.',          expectType: '이중수동',        expectFound: '되어지' },
  { text: '규칙이 바뀌어 적용되어지고 있다.',     expectType: '이중수동',        expectFound: '되어지고' },
  { text: '이 글은 많이 쓰여지고 있다.',          expectType: '이중수동',        expectFound: '쓰여지' },
  { text: '그 제안이 잘 받아지다.',              expectType: '이중수동',        expectFound: '받아지' },
  { text: '진실이 서서히 보여지다.',             expectType: '이중수동',        expectFound: '보여지' },
  { text: '그 사건은 쉽게 잊혀지지 않는다.',      expectType: '이중수동',        expectFound: '잊혀지' },
  { text: '팀이 두 그룹으로 나뉘어지다.',         expectType: '이중수동',        expectFound: '나뉘어지' },

  // ── LOANWORD_PATS — 외래어 표기 오류 (4건) ────────────────────────────────
  { text: '좋은 컨텐츠를 꾸준히 만들어야 한다.',   expectType: '외래어표기오류',   expectFound: '컨텐츠' },
  { text: '메세지를 바로 확인하세요.',            expectType: '외래어표기오류',   expectFound: '메세지' },
  { text: '리더쉽이 중요한 시대다.',              expectType: '외래어표기오류',   expectFound: '리더쉽' },
  { text: '워크플로우를 체계적으로 관리하라.',      expectType: '외래어표기오류',   expectFound: '워크플로우' },

  // ── REDUNDANT_PATS — 중복 군더더기 (4건) ──────────────────────────────────
  { text: '이 문제는 해결할 수가 있다.',           expectType: '중복군더더기',    expectFound: '할 수가 있' },
  { text: '이것은 매우 매우 중요한 사안이다.',      expectType: '중복군더더기',    expectFound: '매우 매우' },
  { text: '친구와 함께 같이 공원에 갔다.',          expectType: '중복군더더기',    expectFound: '함께 같이' },
  { text: '이것이라고 하는 것은 사실이 아니다.',    expectType: '중복군더더기',    expectFound: '라고 하는 것은' },

  // ── JSTYLE_PATS + AI_CLICHE_PATS — 번역체·일본식·AI투 (4건) ──────────────
  { text: '교육에 있어서 가장 중요한 것은 실천이다.',   expectType: '일본식표현',  expectFound: '교육에 있어서' },
  { text: '시스템에서의 처리 속도를 높여야 한다.',      expectType: '번역체',      expectFound: '시스템에서의 ' },
  { text: '사용자로부터의 피드백이 반드시 필요하다.',    expectType: '번역체',      expectFound: '사용자로부터의 ' },
  { text: '결론적으로 이 방법이 가장 최선이다.',        expectType: 'AI투',        expectFound: '결론적으로' },

  // ── UNITY_PATS — 맞춤법·띄어쓰기 (6건) ──────────────────────────────────
  { text: '예제를 직접 따라하기 바랍니다.',        expectType: '맞춤법',         expectFound: '따라하기' },
  { text: '그럴려고 했지만 결국 실패했다.',        expectType: '맞춤법',         expectFound: '그럴려고' },
  { text: '파일을 내려 받아서 실행하세요.',        expectType: '띄어쓰기',       expectFound: '내려 받' },
  { text: '그게 어떻게 됬어요?',                 expectType: '맞춤법',         expectFound: '됬' },
  { text: '나의 바램은 좋은 책을 쓰는 것이다.',    expectType: '맞춤법',         expectFound: '바램' },
  { text: '그것이 바로 그의 만듬이었다.',          expectType: '맞춤법',         expectFound: '만듬' },

  // ── 정상 문장 (10건) — 어떤 패턴도 탐지하면 안 됨 ───────────────────────
  { text: '이 책을 읽어보세요.',                  expectType: null },
  { text: '학생이 교실로 들어왔다.',              expectType: null },
  { text: '좋은 콘텐츠를 꾸준히 만들어야 한다.',   expectType: null },
  { text: '메시지를 바로 확인하세요.',             expectType: null },
  { text: '이 문제는 해결할 수 있다.',             expectType: null },
  { text: '교육에서 가장 중요한 것은 실천이다.',   expectType: null },
  { text: '예제를 직접 따라 하기 바랍니다.',       expectType: null },
  { text: '그러려고 했지만 결국 실패했다.',        expectType: null },
  { text: '그게 어떻게 됐어요?',                  expectType: null },
  { text: '나의 바람은 좋은 책을 쓰는 것이다.',   expectType: null },

];
