(function(){
'use strict';

var allAuthors = [];
var filtered = [];
var sortKey = 'count';
var sortAsc = false;
var searchQ = '';
var pubFilter = '';
var topicFilter = '';
var pendingTopic = null;   // 초기화 전 예약된 주제 필터 (p24_applyTopicFilter)
var page = 0;
var PAGE_SIZE = 30;
var loaded = false;

// 19개 주제 (build_authors.py TOPIC_KW와 동일 순서)
var TOPIC_LIST = [
  "AI/LLM 일반","바이브코딩/노코드","AI 에이전트/RAG","프롬프트/활용","이미지/영상 AI",
  "데이터분석/사이언스","딥러닝/머신러닝","파이썬","웹개발","앱개발/모바일",
  "컴퓨터과학/기초","클라우드/DevOps","보안/해킹","엑셀/오피스","게임개발",
  "비전공자/교양","자격증/취업","로봇/IoT/하드웨어","블록체인/Web3"
];

function initPanel24() {
  var el = document.getElementById('p24Content');
  if (!el) return;

  if (window._AUTHORS_DATA && window._AUTHORS_DATA.authors) {
    allAuthors = window._AUTHORS_DATA.authors;
    loaded = true;
    if (pendingTopic !== null) { topicFilter = pendingTopic; pendingTopic = null; }
    applyFilterSort();
    render();
  } else {
    el.innerHTML = '<div style="padding:2rem;text-align:center;color:#888;">' +
      '<div style="font-size:2rem;margin-bottom:1rem;">📚</div>' +
      '<p>저자 데이터를 불러올 수 없습니다.</p>' +
      '<p style="font-size:.8rem;">scripts/build_authors.py 를 실행해주세요.</p></div>';
  }
}

var newOnly = false;              // 🆕 이번 주 신규 저자만 보기 토글
var NEW_DAYS = 7;                  // 최근 N일 내 첫 등장 = 신규

// 저자 목록 갱신 기준일(YES24 마지막 수집일)
function _authGenerated() {
  return (window._AUTHORS_DATA && window._AUTHORS_DATA.generated) || '';
}
// 신규 판정 기준일(갱신일 − NEW_DAYS). firstSeen이 이보다 크면 신규.
function _newCutoff() {
  var g = _authGenerated();
  if (!g) return '';
  var d = new Date(g + 'T00:00:00');
  d.setDate(d.getDate() - NEW_DAYS);
  // 로컬 날짜 컴포넌트로 조립 — toISOString의 UTC 변환에 따른 하루 밀림 방지
  var m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + dd;
}
function _isNewAuthor(a) {
  var cut = _newCutoff();
  return !!(cut && a.firstSeen && a.firstSeen > cut);
}

function applyFilterSort() {
  var q = searchQ.toLowerCase();
  filtered = allAuthors.filter(function(a) {
    if (newOnly && !_isNewAuthor(a)) return false;
    if (pubFilter && a.pubs.indexOf(pubFilter) < 0) return false;
    if (topicFilter && (!a.topics || a.topics.indexOf(topicFilter) < 0)) return false;
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

// 주제 칩 HTML (최대 max개 + 잔여 +N). topics 없으면 빈 문자열.
function _topicChips(topics, max) {
  if (!topics || !topics.length) return '';
  var shown = topics.slice(0, max);
  var extra = topics.length - shown.length;
  var html = shown.map(function(t) { return '<span class="p24-topic-chip">' + escHtml(t) + '</span>'; }).join('');
  if (extra > 0) html += '<span class="p24-topic-chip p24-topic-more">+' + extra + '</span>';
  return '<div class="p24-topic-chips">' + html + '</div>';
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
  var _gen = _authGenerated();
  if (_gen) {
    var _newCnt = allAuthors.filter(_isNewAuthor).length;
    html += ' · <span class="p24-updated" title="YES24 베스트셀러 기준 매일 자동 갱신">갱신 ' + escHtml(_gen) + '</span>';
    if (_newCnt) html += ' · <button class="p24-new-chip' + (newOnly ? ' active' : '') + '" onclick="p24_toggleNew()" title="최근 ' + NEW_DAYS + '일 내 처음 베스트셀러에 든 저자">🆕 이번 주 신규 ' + _newCnt + '명' + (newOnly ? ' ✕' : '') + '</button>';
  }
  html += '</span></div>';

  // 도서 순위 추적 — YES24 일별 아카이브 기반 (v2.7.17)
  html += '<div class="p24-track">';
  html += '<input class="p24-search p24-track-q" type="text" placeholder="📈 도서 순위 추적 — 도서명·저자명 입력 후 Enter" value="' + escHtml(_trackQ) + '" onkeydown="if(event.key===\'Enter\')p24_trackSearch(this.value)">';
  html += '<button class="p24-sort-btn" onclick="p24_trackSearch(this.previousElementSibling.value)">추적</button>';
  if (_trackResults) html += '<button class="p24-sort-btn" onclick="p24_trackClear()">✕ 닫기</button>';
  html += '</div>';
  html += '<div id="p24-track-results"></div>';

  html += '<div class="p24-toolbar">';
  html += '<input class="p24-search" type="text" placeholder="저자명, 도서명, 출판사 검색…" value="' + escHtml(searchQ) + '" oninput="p24_onSearch(this.value)">';
  html += '<select class="p24-select" onchange="p24_onPubFilter(this.value)"><option value="">전체 출판사</option>';
  allPubs.forEach(function(p) { html += '<option value="' + escHtml(p) + '"' + (p === pubFilter ? ' selected' : '') + '>' + escHtml(p) + '</option>'; });
  html += '</select>';
  html += '<select class="p24-select" onchange="p24_onTopicFilter(this.value)"><option value="">전체 주제</option>';
  TOPIC_LIST.forEach(function(t) { html += '<option value="' + escHtml(t) + '"' + (t === topicFilter ? ' selected' : '') + '>' + escHtml(t) + '</option>'; });
  html += '</select>';
  html += '<div class="p24-sort-wrap">';
  sortBtns.forEach(function(b) {
    var active = sortKey === b.key;
    html += '<button class="p24-sort-btn' + (active ? ' active' : '') + '" onclick="p24_setSort(\'' + b.key + '\')">' + b.label + (active ? (sortAsc ? ' ↑' : ' ↓') : '') + '</button>';
  });
  html += '</div>';
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
    var newBadge = _isNewAuthor(a) ? ' <span class="p24-new-badge" title="최근 ' + NEW_DAYS + '일 내 첫 진입 (' + escHtml(a.firstSeen || '') + ')">NEW</span>' : '';
    html += '<td><span class="p24-author-name" style="cursor:pointer;" onclick="p24_showProfile(' + (start+i) + ')">' + escHtml(a.name) + '</span>' + newBadge + _topicChips(a.topics, 2) + '</td>';
    html += '<td><span class="p24-book-count">' + a.count + '</span></td>';
    html += '<td>' + pubBadges + '</td>';
    html += '<td style="font-weight:600;color:var(--accent);">' + (a.bestRank < 999 ? a.bestRank + '위' : '-') + '</td>';
    html += '<td style="font-size:.78rem;color:var(--muted);">' + a.totalDays + '일</td>';
    html += '<td class="p24-book-list">' + bookHtml + '</td>';
    html += '<td>' + (isInBoard('author', a.name)
      ? '<button class="pin-btn added" onclick="p24_removeBoard(' + (start+i) + ')" title="기획 보드에서 제거">✅</button>'
      : '<button class="pin-btn" onclick="p24_addBoard(' + (start+i) + ')" title="기획 보드에 추가">📌</button>')
    + '</td>';
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
  _renderTrackResults();  // 리렌더 시 추적 결과·차트 복원
}

// ━━━ 도서 순위 추적 (YES24 일별 아카이브) ━━━
var _trackQ = '';
var _trackResults = null;   // [{title, author, publisher, series:[{date,rank}]}]
var _trackCharts = [];
var _bookIndex = null;      // "title||author" → 엔트리 (아카이브 1회 스캔)

// panel25 ensureArchiveLoaded와 동일 전역(window._YES24_ARCHIVE)·스크립트 태그 공유 — 이중 로드 방지
function _ensureArchive(cb) {
  if (window._YES24_ARCHIVE && window._YES24_ARCHIVE.snapshots) { cb(); return; }
  var existing = document.querySelector('script[data-yes24-archive]');
  if (existing) {  // panel25가 이미 로딩 중 — 폴링으로 대기
    var n = 0;
    var t = setInterval(function() {
      if (window._YES24_ARCHIVE || ++n > 100) { clearInterval(t); cb(); }
    }, 100);
    return;
  }
  var script = document.createElement('script');
  script.src = 'data/yes24/archive.js?d=' + new Date().toISOString().slice(0, 10);
  script.setAttribute('data-yes24-archive', '1');
  script.onload = cb;
  script.onerror = function() { console.warn('[panel24] archive.js 로드 실패'); cb(); };
  document.head.appendChild(script);
}

function _buildBookIndex() {
  if (_bookIndex) return _bookIndex;
  _bookIndex = {};
  var snaps = (window._YES24_ARCHIVE || {}).snapshots || {};
  Object.keys(snaps).sort().forEach(function(d) {
    snaps[d].forEach(function(it) {
      if (!it.title) return;
      var key = it.title + '||' + (it.author || '');
      var e = _bookIndex[key];
      if (!e) e = _bookIndex[key] = { title: it.title, author: it.author || '', publisher: it.publisher || '', series: [] };
      e.series.push({ date: d, rank: it.rank || 0 });
    });
  });
  return _bookIndex;
}

window.p24_trackSearch = function(q) {
  q = (q || '').trim();
  if (q.length < 2) { showToast('2글자 이상 입력하세요.', 'yellow'); return; }
  _trackQ = q;
  _ensureArchive(function() {
    var idx = _buildBookIndex();
    var ql = q.toLowerCase();
    var matches = [];
    Object.keys(idx).forEach(function(k) {
      var e = idx[k];
      if (e.title.toLowerCase().indexOf(ql) !== -1 || e.author.toLowerCase().indexOf(ql) !== -1) matches.push(e);
    });
    matches.sort(function(a, b) { return b.series.length - a.series.length; });  // 등장일수 많은 순
    _trackResults = matches.slice(0, 8);
    _renderTrackResults();
    if (!matches.length) showToast('아카이브 200위 내 기록이 없는 도서입니다.', 'yellow');
  });
};

window.p24_trackClear = function() { _trackQ = ''; _trackResults = null; render(); };

function _renderTrackResults() {
  var box = document.getElementById('p24-track-results');
  if (!box) return;
  _trackCharts.forEach(function(c) { try { c.destroy(); } catch(e){} });
  _trackCharts = [];
  if (!_trackResults) { box.innerHTML = ''; return; }
  if (!_trackResults.length) { box.innerHTML = '<div class="p24-track-empty">"' + escHtml(_trackQ) + '" — 아카이브 기록 없음</div>'; return; }

  box.innerHTML = _trackResults.map(function(e, i) {
    var best = Math.min.apply(null, e.series.map(function(s){ return s.rank || 999; }));
    var last = e.series[e.series.length - 1];
    return '<div class="p24-track-card">' +
      '<div class="p24-track-meta"><b>' + escHtml(e.title) + '</b>' +
        '<span>' + escHtml(e.author) + ' · ' + escHtml(e.publisher) + '</span>' +
        '<span>최고 ' + best + '위 · 등장 ' + e.series.length + '일 · 최근 ' + escHtml(last.date.slice(5)) + ' ' + last.rank + '위</span></div>' +
      '<div class="p24-track-chart"><canvas id="p24-tc-' + i + '"></canvas></div>' +
    '</div>';
  }).join('');

  if (typeof Chart === 'undefined') return;
  _trackResults.forEach(function(e, i) {
    var cv = document.getElementById('p24-tc-' + i);
    if (!cv) return;
    _trackCharts.push(new Chart(cv, {
      type: 'line',
      data: { labels: e.series.map(function(s){ return s.date.slice(5); }),
              datasets: [{ data: e.series.map(function(s){ return s.rank; }),
                           borderColor: '#4F46B8', backgroundColor: 'rgba(79,70,184,.08)',
                           borderWidth: 1.5, pointRadius: e.series.length > 60 ? 0 : 2, fill: true, tension: .2 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        // ponytail: 미등장일(200위 밖)은 x축에서 생략됨 — 갭 시각화가 필요해지면 시간축+null 데이터로 업그레이드
        scales: { y: { reverse: true, min: 1, ticks: { font: { size: 9 } }, title: { display: true, text: '순위', font: { size: 9 } } },
                  x: { ticks: { font: { size: 9 }, maxTicksLimit: 8 } } } }
    }));
  });
}

window.p24_toggleNew = function() { newOnly = !newOnly; applyFilterSort(); render(); };
window.p24_onSearch = function(v) { searchQ = v; applyFilterSort(); render(); };
window.p24_onPubFilter = function(v) { pubFilter = v; applyFilterSort(); render(); };
window.p24_onTopicFilter = function(v) { topicFilter = v; applyFilterSort(); render(); };

// 외부 연동 계약: panel25 "저자 후보 보기" 등에서 호출.
// 패널 미초기화(데이터 미로드) 상태면 값을 예약했다가 onActivate 시 적용.
window.p24_applyTopicFilter = function(topic) {
  topic = topic || '';
  if (!loaded || !allAuthors.length) { pendingTopic = topic; return; }
  topicFilter = topic;
  applyFilterSort();
  render();
};
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
  render();
};
window.p24_removeBoard = function(idx) {
  var a = filtered[idx];
  if (!a) return;
  removeFromBoard('author', a.name);
  render();
};

window.p24_toggle = function(btn) {
  var el = document.getElementById(btn.getAttribute('data-t'));
  if (!el) return;
  var show = el.style.display === 'none';
  el.style.display = show ? 'block' : 'none';
  btn.textContent = show ? '접기' : '+ ' + btn.getAttribute('data-n') + '권 더 보기';
};

window.p24_showProfile = function(idx) {
  var a = filtered[idx];
  if (!a) return;

  var old = document.getElementById('p24Modal');
  if (old) old.remove();

  var pubBadges = a.pubs.map(function(p) {
    return '<span class="p24-pub-badge">' + escHtml(p) + '</span>';
  }).join(' ');

  var sortedBooks = a.books.slice().sort(function(x, y) {
    return x.bestRank - y.bestRank;
  });

  var bookRows = sortedBooks.map(function(b, bi) {
    return '<tr>' +
      '<td style="color:var(--muted);font-size:.78rem;">' + (bi + 1) + '</td>' +
      '<td>' + escHtml(b.title) + '</td>' +
      '<td style="text-align:center;font-weight:600;color:var(--accent);">' + (b.bestRank < 999 ? b.bestRank + '위' : '-') + '</td>' +
      '<td style="text-align:center;font-size:.82rem;color:var(--muted);">' + b.days + '일</td>' +
      '</tr>';
  }).join('');

  var html = '<div id="p24Modal" class="p24-modal-overlay" onclick="if(event.target===this)p24_closeProfile()">' +
    '<div class="p24-modal">' +
      '<div class="p24-modal-header">' +
        '<h3>' + escHtml(a.name) + '</h3>' +
        '<button class="p24-modal-close" onclick="p24_closeProfile()">&times;</button>' +
      '</div>' +
      '<div class="p24-modal-stats">' +
        '<div class="p24-modal-stat-card"><div class="p24-stat-value">' + a.count + '</div><div class="p24-stat-label">등장 도서</div></div>' +
        '<div class="p24-modal-stat-card"><div class="p24-stat-value">' + (a.bestRank < 999 ? a.bestRank + '위' : '-') + '</div><div class="p24-stat-label">최고 순위</div></div>' +
        '<div class="p24-modal-stat-card"><div class="p24-stat-value">' + a.totalDays + '일</div><div class="p24-stat-label">총 등장일수</div></div>' +
        '<div class="p24-modal-stat-card"><div class="p24-stat-value">' + a.pubs.length + '</div><div class="p24-stat-label">출판사 수</div></div>' +
      '</div>' +
      '<div class="p24-modal-section"><div class="p24-modal-section-title">출판사</div>' + pubBadges + '</div>' +
      (a.topics && a.topics.length
        ? '<div class="p24-modal-section"><div class="p24-modal-section-title">주제</div><div class="p24-topic-chips p24-topic-chips-modal">' +
            a.topics.map(function(t) { return '<span class="p24-topic-chip">' + escHtml(t) + '</span>'; }).join('') +
          '</div></div>'
        : '') +
      '<div class="p24-modal-section"><div class="p24-modal-section-title">전체 도서 (' + a.books.length + '권)</div>' +
        '<div class="p24-modal-books"><table class="p24-table"><thead><tr>' +
          '<th style="width:35px">#</th><th>도서명</th><th style="width:70px;text-align:center;">최고순위</th><th style="width:70px;text-align:center;">등장일수</th>' +
        '</tr></thead><tbody>' + bookRows + '</tbody></table></div>' +
      '</div>' +
      '<div class="p24-modal-footer">' +
        (isInBoard('author', a.name)
          ? '<button class="pin-btn added" onclick="p24_removeBoard(' + idx + ');p24_closeProfile();">✅ 보드에 추가됨 (클릭하여 해제)</button>'
          : '<button class="pin-btn" onclick="p24_addBoard(' + idx + ');p24_closeProfile();">📌 기획 보드에 추가</button>') +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.insertAdjacentHTML('beforeend', html);
};

window.p24_closeProfile = function() {
  var el = document.getElementById('p24Modal');
  if (el) el.remove();
};

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(24, {
    onActivate: function() { initPanel24(); },
    onDeactivate: function() {}
  });
}

})();
