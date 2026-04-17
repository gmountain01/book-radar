(function(){
/* ══════════════════════════════════════════════════════
   panel14 — 목차 작성
   도서 목차를 계층적으로 구성 + 각 항목에 메모/예상 분량 기입
   ══════════════════════════════════════════════════════ */
var ROOT = document.getElementById('panel14');
if (!ROOT) return;

var LS_KEY = 'ms_toc_v1';
var items = []; // [{id, level, title, memo, pages}]
var activeIdx = 0;
var LV_NAMES = ['', '장', '절', '중절', '소절', '소소절'];
var LV_INDENT = [0, 0, 20, 40, 60, 80];

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch(e) {} }
function load() {
  try { var r = localStorage.getItem(LS_KEY); if (r) items = JSON.parse(r); } catch(e) {}
  if (!items.length) items = _defaults();
}

function _defaults() {
  return [
    { id: 1, level: 1, title: '시작하기', memo: '이 책의 목적과 대상 독자를 소개', pages: 15 },
    { id: 2, level: 2, title: '이 책의 구성', memo: '', pages: 3 },
    { id: 3, level: 2, title: '준비물', memo: '개발 환경 설정 가이드', pages: 5 },
    { id: 4, level: 1, title: '핵심 개념', memo: '본격적인 내용 진입', pages: 30 },
    { id: 5, level: 2, title: '기본 원리', memo: '', pages: 10 },
    { id: 6, level: 3, title: '동작 방식', memo: '내부 구조 설명', pages: 5 },
    { id: 7, level: 2, title: '실전 예제', memo: '핸즈온 실습 중심', pages: 15 },
    { id: 8, level: 1, title: '응용과 확장', memo: '실무 적용 시나리오', pages: 25 },
    { id: 9, level: 2, title: '프로젝트 A', memo: '처음부터 끝까지 따라하기', pages: 12 },
    { id: 10, level: 2, title: '프로젝트 B', memo: '심화 프로젝트', pages: 13 }
  ];
}

function _new(level) {
  return { id: Date.now() + Math.random(), level: level || 1, title: '', memo: '', pages: 0 };
}

function _calcNumbers() {
  var c = [0, 0, 0, 0, 0, 0];
  return items.map(function(it) {
    var lv = it.level || 1;
    c[lv]++;
    for (var r = lv + 1; r <= 5; r++) c[r] = 0;
    if (lv === 1) return c[1] + '장';
    var parts = [];
    for (var k = 1; k <= lv; k++) parts.push(c[k]);
    return parts.join('.');
  });
}

function render() {
  var nums = _calcNumbers();
  var totalPages = items.reduce(function(s, it) { return s + (parseInt(it.pages) || 0); }, 0);

  ROOT.innerHTML =
    '<div class="tc-wrap">' +
      '<div class="tc-header">' +
        '<div class="tc-title">📑 목차 작성</div>' +
        '<div class="tc-sub">도서의 뼈대를 잡는 단계 — 체계적인 목차를 구성합니다</div>' +
        '<div class="tc-meta">전체 ' + items.length + '개 항목 · 예상 ' + totalPages + '페이지 (약 ' + Math.ceil(totalPages / 2) + '매)</div>' +
      '</div>' +
      '<div class="tc-toolbar">' +
        '<button class="tc-btn" onclick="tcAdd(1)">+ 장</button>' +
        '<button class="tc-btn" onclick="tcAdd(2)">+ 절</button>' +
        '<button class="tc-btn" onclick="tcAdd(3)">+ 중절</button>' +
        '<button class="tc-btn" onclick="tcAdd(4)">+ 소절</button>' +
        '<button class="tc-btn" onclick="tcAdd(5)">+ 소소절</button>' +
        '<button class="tc-btn" onclick="tcAddSub()">+ 선택항목 하위</button>' +
        '<span style="flex:1;"></span>' +
        '<button class="tc-btn tc-btn-apply" onclick="tcApplyToManuscript()">📝 원고에 적용</button>' +
        '<button class="tc-btn tc-btn-dl" onclick="tcExportTxt()">📋 텍스트 복사</button>' +
      '</div>' +
      '<div class="tc-list">' +
        items.map(function(it, i) {
          var lv = it.level || 1;
          var indent = LV_INDENT[lv] || 0;
          var isActive = i === activeIdx ? ' active' : '';
          var num = nums[i];
          var lvCls = 'tc-lv' + lv;
          return '<div class="tc-row' + isActive + ' ' + lvCls + '" style="--indent:' + indent + 'px;" onclick="tcSelect(' + i + ')">' +
            '<span class="tc-num">' + num + '</span>' +
            '<input class="tc-title-input" value="' + escHtml(it.title) + '" placeholder="제목 입력" onclick="event.stopPropagation()" oninput="tcUpdateTitle(' + i + ',this.value)">' +
            '<input class="tc-pages-input" type="number" min="0" value="' + (it.pages || 0) + '" onclick="event.stopPropagation()" oninput="tcUpdatePages(' + i + ',this.value)" title="예상 페이지 수">' +
            '<span class="tc-pages-label">p</span>' +
            '<span class="tc-actions">' +
              '<span class="tc-act" onclick="event.stopPropagation();tcMove(' + i + ',-1)" title="위로">↑</span>' +
              '<span class="tc-act" onclick="event.stopPropagation();tcMove(' + i + ',1)" title="아래로">↓</span>' +
              '<span class="tc-act" onclick="event.stopPropagation();tcLvUp(' + i + ')" title="승격">◀</span>' +
              '<span class="tc-act" onclick="event.stopPropagation();tcLvDown(' + i + ')" title="강등">▶</span>' +
              '<span class="tc-act tc-del" onclick="event.stopPropagation();tcDel(' + i + ')" title="삭제">✕</span>' +
            '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="tc-memo-section">' +
        '<div class="tc-memo-label">선택 항목 메모</div>' +
        '<textarea class="tc-memo" placeholder="이 항목에 대한 메모, 다룰 내용 등" oninput="tcUpdateMemo(this.value)">' + escHtml((items[activeIdx] || {}).memo || '') + '</textarea>' +
      '</div>' +
    '</div>';
}

// ─── 공개 API ──────────────────────────────────────────
window.tcSelect = function(i) { activeIdx = Math.max(0, Math.min(i, items.length - 1)); render(); };
window.tcAdd = function(lv) { items.splice(activeIdx + 1, 0, _new(lv)); activeIdx++; save(); render(); };
window.tcAddSub = function() {
  var curLv = items[activeIdx] ? items[activeIdx].level : 1;
  items.splice(activeIdx + 1, 0, _new(Math.min(curLv + 1, 5)));
  activeIdx++; save(); render();
};
window.tcDel = function(i) {
  if (items.length <= 1) return;
  items.splice(i, 1);
  if (activeIdx >= items.length) activeIdx = items.length - 1;
  save(); render();
};
window.tcMove = function(i, dir) {
  var j = i + dir;
  if (j < 0 || j >= items.length) return;
  var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
  if (activeIdx === i) activeIdx = j;
  save(); render();
};
window.tcLvUp = function(i) { if (items[i] && items[i].level > 1) { items[i].level--; save(); render(); } };
window.tcLvDown = function(i) { if (items[i] && items[i].level < 5) { items[i].level++; save(); render(); } };
window.tcUpdateTitle = function(i, v) { if (items[i]) { items[i].title = v; save(); } };
window.tcUpdatePages = function(i, v) { if (items[i]) { items[i].pages = parseInt(v) || 0; save(); } };
window.tcUpdateMemo = function(v) { if (items[activeIdx]) { items[activeIdx].memo = v; save(); } };

window.tcApplyToManuscript = function() {
  if (!items.length) { alert('목차가 비어 있습니다.'); return; }
  if (!confirm('현재 목차를 원고 작성에 적용합니다.\n기존 원고 내용이 있으면 덮어쓰게 됩니다. 계속하시겠습니까?')) return;
  // 목차 항목 → panel12 sections 형식으로 변환
  var msSections = items.map(function(it) {
    return {
      id: Date.now() + Math.random(),
      level: it.level || 1,
      title: it.title || '',
      summary: it.memo || '',
      intro: '',
      body: ''
    };
  });
  // panel12의 localStorage에 직접 저장
  try {
    localStorage.setItem('ms_manuscript_v3', JSON.stringify(msSections));
  } catch(e) {}
  alert('목차가 원고 작성에 적용되었습니다.\n"원고 작성" 메뉴로 이동하면 목차 구조가 반영됩니다.');
  // 원고 작성 탭으로 이동
  var tab12El = document.getElementById('tab12');
  if (typeof switchTab === 'function' && tab12El) {
    switchTab(12, tab12El);
  }
};

window.tcExportTxt = function() {
  var nums = _calcNumbers();
  var txt = items.map(function(it, i) {
    var indent = '  '.repeat((it.level || 1) - 1);
    var pages = it.pages ? ' (' + it.pages + 'p)' : '';
    var memo = it.memo ? ' — ' + it.memo : '';
    return indent + nums[i] + ' ' + (it.title || '(제목 없음)') + pages + memo;
  }).join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(function() { alert('목차가 클립보드에 복사되었습니다.'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    alert('목차가 클립보드에 복사되었습니다.');
  }
};

var _init14 = false;
function initPanel14() {
  if (!_init14) { _init14 = true; }
  load();
  render();
}

if (typeof PanelRegistry !== 'undefined') PanelRegistry.register(14, { onActivate: initPanel14 });
window._initPanel14 = initPanel14;
})();
