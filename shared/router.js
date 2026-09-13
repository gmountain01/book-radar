/**
 * shared/router.js — 패널 라우팅 및 레지스트리
 *
 * 새 패널 추가 방법:
 *   1. panels/panelN/ 디렉토리 생성
 *   2. panels/panelN/panelN.js 작성 후 PanelRegistry.register(N, {...}) 호출
 *   3. panels/panelN/panelN.css 필요시 생성
 *   4. index.html <head>에 <link rel="stylesheet" href="panels/panelN/panelN.css"> 추가
 *   5. index.html </body> 직전에 <script src="panels/panelN/panelN.js"> 추가
 *   6. index.html 사이드바에 nav-item 추가 (onclick="switchTab(N)")
 *   7. index.html body에 <div id="panelN" class="panel"> ... </div> 추가
 *
 * switchTab은 shared/app.js에 정의되어 있으며,
 * 패널 전환 시 PanelRegistry.onActivate()가 호출됩니다.
 *
 * 새 패널 등록 예시:
 *   PanelRegistry.register(5, {
 *     onActivate: () => { initPropTab(); }
 *   });
 *
 * switchTab(i)가 호출되면 PanelRegistry.onActivate(i)가 자동 실행됨.
 */

const PanelRegistry = {
  panels: {},
  /**
   * 패널 등록
   * @param {number} id - 패널 번호
   * @param {{onActivate?: function, onDeactivate?: function}} hooks
   */
  register(id, hooks) {
    this.panels[id] = hooks || {};
  },
  /**
   * 패널 활성화 훅 실행
   * @param {number} id - 패널 번호
   */
  onActivate(id) {
    if (this.panels[id] && typeof this.panels[id].onActivate === 'function') {
      this.panels[id].onActivate();
    }
  },
  /**
   * 패널 비활성화 훅 실행
   * @param {number} id - 패널 번호
   */
  onDeactivate(id) {
    if (this.panels[id] && typeof this.panels[id].onDeactivate === 'function') {
      this.panels[id].onDeactivate();
    }
  }
};


// Share one in-flight request across the author list and planning board.
window.loadYes24Archive = (function() {
  var callbacks = null;
  return function(cb) {
    if (window._YES24_ARCHIVE && window._YES24_ARCHIVE.snapshots) {
      if (cb) cb(null);
      return;
    }
    if (callbacks) { if (cb) callbacks.push(cb); return; }
    callbacks = cb ? [cb] : [];
    var script = document.createElement('script');
    var done = false;
    var timer = setTimeout(function() { finish(new Error('YES24 데이터 로딩 시간 초과')); }, 30000);
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) script.remove();
      var pending = callbacks;
      callbacks = null;
      pending.forEach(function(fn) {
        try { fn(error || null); } catch (e) { console.error('[YES24] callback failed', e); }
      });
    }
    script.src = 'data/yes24/archive.js?d=' + new Date().toISOString().slice(0, 10);
    script.setAttribute('data-yes24-archive', '1');
    script.onload = function() {
      finish(window._YES24_ARCHIVE && window._YES24_ARCHIVE.snapshots ? null : new Error('YES24 데이터 없음'));
    };
    script.onerror = function() { finish(new Error('YES24 데이터 로드 실패')); };
    document.head.appendChild(script);
  };
})();
