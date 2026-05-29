(function(){
'use strict';
var ROOT = document.getElementById('panel19');
if (!ROOT) return;

function render() {
  ROOT.innerHTML =
    '<div class="p19-wrap">' +
      '<div class="p19-header"><h2>🖼️ 상세이미지 제작</h2></div>' +
      '<div class="p19-empty">' +
        '<span class="ico">🖼️</span>' +
        '상세이미지 제작 기능이 준비 중입니다.' +
      '</div>' +
    '</div>';
}

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(19, { onActivate: render });
}
render();
})();
