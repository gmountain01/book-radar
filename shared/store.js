/**
 * shared/store.js — 전역 이벤트 버스
 *
 * 현재 상태: 인프라만 준비됨 (미사용)
 * 사용 방법:
 *   AppState.on('change:bestRows', data => { 패널 리렌더 로직 });
 *   AppState.emit('change:bestRows', bestRows);
 *
 * TODO: runAll() 완료 후 panel5 자동 갱신 등에 연결 예정
 *
 * 기존 전역 변수들은 그대로 유지 (하위 호환),
 * AppState 이벤트 버스를 통해 패널 간 통신 가능.
 */

// ── 전역 상태 (기존 코드 호환) ──────────────────────
// 이 변수들은 shared/app.js 및 각 패널 JS에서 직접 참조됩니다.
// app.js가 먼저 로드되어야 합니다.

// ── 이벤트 버스 (새 기능용) ──────────────────────────
const AppState = {
  listeners: {},
  /**
   * 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름 (예: 'change:bestRows')
   * @param {function} fn - 콜백 함수
   */
  on(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  },
  /**
   * 이벤트 발행
   * @param {string} event - 이벤트 이름
   * @param {*} data - 전달할 데이터
   */
  emit(event, data) {
    (this.listeners[event] || []).forEach(fn => fn(data));
  }
};
