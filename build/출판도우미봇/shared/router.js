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
