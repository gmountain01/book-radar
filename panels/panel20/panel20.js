(function(){
'use strict';
var ROOT = document.getElementById('panel20');
if (!ROOT) return;

function render() {
  ROOT.innerHTML =
    '<div class="p20-wrap">' +
      '<div class="p20-header"><h2>📰 카드뉴스</h2></div>' +
      '<div class="p20-empty">' +
        '<span class="ico">📰</span>' +
        '카드뉴스 제작 기능이 준비 중입니다.' +
      '</div>' +
    '</div>';
}

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(20, { onActivate: render });
}
render();
})();
