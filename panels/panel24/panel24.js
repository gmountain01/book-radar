(function(){
'use strict';

var allAuthors = [];
var filtered = [];
var sortKey = 'count';
var sortAsc = false;
var searchQ = '';
var pubFilter = '';
var page = 0;
var PAGE_SIZE = 30;
var loaded = false;

function initPanel24() {
  var el = document.getElementById('p24Content');
  if (!el) return;

  if (window._AUTHORS_DATA && window._AUTHORS_DATA.authors) {
    allAuthors = window._AUTHORS_DATA.authors;
    loaded = true;
    applyFilterSort();
    render();
  } else {
    el.innerHTML = '<div style="padding:2rem;text-align:center;color:#888;">' +
      '<div style="font-size:2rem;margin-bottom:1rem;">📚</div>' +
      '<p>저자 데이터를 불러올 수 없습니다.</p>' +
      '<p style="font-size:.8rem;">scripts/build_authors.py 를 실행해주세요.</p></div>';
  }
}

function applyFilterSort() {
  var q = searchQ.toLowerCase();
  filtered = allAuthors.filter(function(a) {
    if (pubFilter && a.pubs.indexOf(pubFilter) < 0) return false;
    if (q) {
      var nameMatch = a.name.toLowerCase().indexOf(q) >= 0;
      var bookMatch = a.books.some(function(b){ return b.title.toLowerCase().indexOf(q) >= 0; });
      var pubMatch = a.pubs.some(function(p){ return p.toLowerCase().indexOf(q) >= 0; });
      if (!nameMatch && !bookMatch && !pubMatch) return false;
    }
    return true;
  });

  filtered.sort(function(a, b) {
    var va, vb;
    if (sortKey === 'count') { va = a.count; vb = b.count; }
    else if (sortKey === 'bestRank') { va = a.bestRank; vb = b.bestRank; }
    else if (sortKey === 'totalDays') { va = a.totalDays; vb = b.totalDays; }
    else if (sortKey === 'name') { va = a.name; vb = b.name; }
    else if (sortKey === 'pubs') { va = a.pubs.length; vb = b.pubs.length; }
    else { va = a.count; vb = b.count; }

    if (sortKey === 'name') {
      return sortAsc ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko');
    }
    if (sortKey === 'bestRank') {
      return sortAsc ? vb - va : va - vb;
    }
    return sortAsc ? va - vb : vb - va;
  });

  page = 0;
}

function render() {
  var el = document.getElementById('p24Content');
  if (!el) return;

  if (!allAuthors.length) {
    el.innerHTML = '<div style="padding:2rem;text-align:center;color:#888;">데이터 없음</div>';
    return;
  }
  if (!filtered.length) {
    el.innerHTML = '<div style="padding:2rem;text-align:center;color:#888;">검색 결과 없음</div>';
    return;
  }

  var allPubs = [];
  var pubSet = {};
  allAuthors.forEach(function(a) { a.pubs.forEach(function(p) { if (!pubSet[p]) { pubSet[p] = true; allPubs.push(p); } }); });
  allPubs.sort();

  var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  var start = page * PAGE_SIZE;
  var pageItems = filtered.slice(start, start + PAGE_SIZE);

  var sortBtns = [
    { key: 'count', label: '권수' },
    { key: 'totalDays', label: '등장일수' },
    { key: 'bestRank', label: '최고순위' },
    { key: 'name', label: '이름' },
    { key: 'pubs', label: '출판사수' }
  ];

  var html = '<div class="p24-wrap">';
  html += '<div class="p24-header"><h2>저자 목록</h2>';
  html += '<span class="p24-stats">' + allAuthors.length + '명 저자 · ' + (window._AUTHORS_DATA ? window._AUTHORS_DATA.totalBooks : allAuthors.length) + '권 도서';
  if (filtered.length !== allAuthors.length) html += ' · 필터 ' + filtered.length + '명';
  html += '</span></div>';

  html += '<div class="p24-toolbar">';
  html += '<input class="p24-search" type="text" placeholder="저자명, 도서명, 출판사 검색…" value="' + escHtml(searchQ) + '" oninput="p24_onSearch(this.value)">';
  html += '<select class="p24-select" onchange="p24_onPubFilter(this.value)"><option value="">전체 출판사</option>';
  allPubs.forEach(function(p) { html += '<option value="' + escHtml(p) + '"' + (p === pubFilter ? ' selected' : '') + '>' + escHtml(p) + '</option>'; });
  html += '</select>';
  sortBtns.forEach(function(b) {
    var active = sortKey === b.key;
    html += '<button class="p24-sort-btn' + (active ? ' active' : '') + '" onclick="p24_setSort(\'' + b.key + '\')">' + b.label + (active ? (sortAsc ? ' ↑' : ' ↓') : '') + '</button>';
  });
  html += '</div>';

  html += '<div class="p24-table-wrap"><table class="p24-table"><thead><tr>';
  html += '<th style="width:40px">#</th><th>저자</th><th style="width:55px">권수</th><th>출판사</th><th style="width:70px">최고순위</th><th style="width:70px">등장일수</th><th>도서 목록</th><th style="width:40px"></th>';
  html += '</tr></thead><tbody>';

  pageItems.forEach(function(a, i) {
    var pubBadges = a.pubs.map(function(p) { return '<span class="p24-pub-badge">' + escHtml(p) + '</span>'; }).join('');
    var maxShow = 3;
    var bookHtml = a.books.slice(0, maxShow).map(function(b) {
      var r = b.bestRank < 999 ? '<span class="p24-rank">' + b.bestRank + '위</span>' : '';
      var d = b.days > 1 ? ' <span style="color:var(--muted);font-size:.7rem;">(' + b.days + '일)</span>' : '';
      return '<div class="p24-book-item">' + r + escHtml(b.title) + d + '</div>';
    }).join('');

    if (a.books.length > maxShow) {
      var moreId = 'p24m_' + start + '_' + i;
      bookHtml += '<div id="' + moreId + '" style="display:none;">';
      a.books.slice(maxShow).forEach(function(b) {
        var r = b.bestRank < 999 ? '<span class="p24-rank">' + b.bestRank + '위</span>' : '';
        var d = b.days > 1 ? ' <span style="color:var(--muted);font-size:.7rem;">(' + b.days + '일)</span>' : '';
        bookHtml += '<div class="p24-book-item">' + r + escHtml(b.title) + d + '</div>';
      });
      bookHtml += '</div><button class="p24-expand-btn" data-t="' + moreId + '" data-n="' + (a.books.length - maxShow) + '" onclick="p24_toggle(this)">+ ' + (a.books.length - maxShow) + '권 더 보기</button>';
    }

    html += '<tr>';
    html += '<td style="color:var(--muted);font-size:.78rem;">' + (start + i + 1) + '</td>';
    html += '<td><span class="p24-author-name">' + escHtml(a.name) + '</span></td>';
    html += '<td><span class="p24-book-count">' + a.count + '</span></td>';
    html += '<td>' + pubBadges + '</td>';
    html += '<td style="font-weight:600;color:var(--accent);">' + (a.bestRank < 999 ? a.bestRank + '위' : '-') + '</td>';
    html += '<td style="font-size:.78rem;color:var(--muted);">' + a.totalDays + '일</td>';
    html += '<td class="p24-book-list">' + bookHtml + '</td>';
    html += '<td><button class="p24-expand-btn" style="white-space:nowrap;" onclick="p24_addBoard(' + (start+i) + ')" title="기획 보드에 추가">📌</button></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  if (totalPages > 1) {
    html += '<div class="p24-pagination">';
    if (page > 0) html += '<button class="p24-page-btn" onclick="p24_goPage(' + (page-1) + ')">‹</button>';
    var sp = Math.max(0, page - 3), ep = Math.min(totalPages, sp + 7);
    for (var pi = sp; pi < ep; pi++) {
      html += '<button class="p24-page-btn' + (pi === page ? ' active' : '') + '" onclick="p24_goPage(' + pi + ')">' + (pi + 1) + '</button>';
    }
    if (page < totalPages - 1) html += '<button class="p24-page-btn" onclick="p24_goPage(' + (page+1) + ')">›</button>';
    html += '</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

window.p24_onSearch = function(v) { searchQ = v; applyFilterSort(); render(); };
window.p24_onPubFilter = function(v) { pubFilter = v; applyFilterSort(); render(); };
window.p24_setSort = function(k) {
  if (sortKey === k) sortAsc = !sortAsc;
  else { sortKey = k; sortAsc = k === 'name'; }
  applyFilterSort(); render();
};
window.p24_goPage = function(p) {
  page = p; render();
  var panel = document.getElementById('panel24');
  if (panel) panel.scrollTop = 0;
};
window.p24_addBoard = function(idx) {
  var a = filtered[idx];
  if (!a) return;
  addToPlanningBoard({
    type: 'author',
    source: 'panel24',
    title: a.name,
    data: { count: a.count, pubs: a.pubs, bestRank: a.bestRank, totalDays: a.totalDays, books: a.books.slice(0, 5) }
  });
};

window.p24_toggle = function(btn) {
  var el = document.getElementById(btn.getAttribute('data-t'));
  if (!el) return;
  var show = el.style.display === 'none';
  el.style.display = show ? 'block' : 'none';
  btn.textContent = show ? '접기' : '+ ' + btn.getAttribute('data-n') + '권 더 보기';
};

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(24, {
    onActivate: function() { initPanel24(); },
    onDeactivate: function() {}
  });
}

})();
