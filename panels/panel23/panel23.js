(function(){
/* ══════════════════════════════════════════════════════
   panel23 — 시장 분석
   Tab A: 피드 (RSS 최신)
   Tab B: 트렌드 (누적 키워드 분석 → 출판 기회)
   Tab C: 리포트 뷰어 (.md)
   ══════════════════════════════════════════════════════ */
var ROOT = document.getElementById('panel23');
if (!ROOT) return;

var _tab = 'feed';
var _feedData = null;   // window._RSS_FEEDS
var _archive = null;    // window._RSS_ARCHIVE
var _filteredItems = [];
var _activeSource = 'all';
var _searchQuery = '';
var _dateRange = 'all';
var currentMd = '', tocItems = [];

// ══════════════════════════════════════════════════════
// HTML 골격
// ══════════════════════════════════════════════════════
ROOT.innerHTML =
  '<div class="p23-tab-bar">' +
    '<button class="p23-tab active" data-tab="feed" onclick="p23_switchTab(\'feed\',this)">🌐 피드</button>' +
    '<button class="p23-tab" data-tab="trend" onclick="p23_switchTab(\'trend\',this)">📈 트렌드</button>' +
    '<button class="p23-tab" data-tab="report" onclick="p23_switchTab(\'report\',this)">📊 리포트</button>' +
    '<span class="p23-tab-spacer"></span>' +
    '<span class="p23-fetched-at" id="p23_fetchedAt"></span>' +
  '</div>' +

  /* ── 피드 ── */
  '<div class="p23-view" id="p23_vFeed">' +
    '<div class="p23-trend-layout">' +
      '<div class="p23-sources" id="p23_sources"></div>' +
      '<div class="p23-feed-area">' +
        '<div class="p23-search-bar">' +
          '<input type="text" class="p23-search" id="p23_search" placeholder="키워드 검색 (예: agent, LLM, Claude)">' +
          '<div class="p23-date-filter">' +
            '<button class="p23-date-btn active" onclick="p23_setDateRange(\'all\',this)">전체</button>' +
            '<button class="p23-date-btn" onclick="p23_setDateRange(\'1w\',this)">1주</button>' +
            '<button class="p23-date-btn" onclick="p23_setDateRange(\'1m\',this)">1개월</button>' +
            '<button class="p23-date-btn" onclick="p23_setDateRange(\'3m\',this)">3개월</button>' +
          '</div>' +
          '<span class="p23-result-count" id="p23_resultCount"></span>' +
        '</div>' +
        '<div class="p23-feed-list" id="p23_feedList"></div>' +
      '</div>' +
    '</div>' +
  '</div>' +

  /* ── 트렌드 ── */
  '<div class="p23-view" id="p23_vTrend" style="display:none">' +
    '<div class="p23-trend-wrap" id="p23_trendWrap"></div>' +
  '</div>' +

  /* ── 리포트 ── */
  '<div class="p23-view" id="p23_vReport" style="display:none">' +
    '<div class="p23-rpt-toolbar">' +
      '<span class="p23-rpt-title" id="p23_rptTitle">리포트를 선택하세요</span>' +
      '<label class="p23-file-btn" for="p23_fileInput">📂 직접 업로드</label>' +
      '<input type="file" id="p23_fileInput" accept=".md,.markdown,.txt" style="display:none">' +
      '<button class="p23-pdf-btn" id="p23_pdfBtn" disabled onclick="p23_printPdf()">🖨️ PDF</button>' +
    '</div>' +
    '<div class="p23-rpt-layout" id="p23_rptLayout">' +
      '<div class="p23-toc" id="p23_toc">' +
        '<div class="p23-toc-tabs">' +
          '<button class="p23-toc-tab active" data-pane="list" onclick="p23_switchTocTab(\'list\',this)">📋 리포트</button>' +
          '<button class="p23-toc-tab" data-pane="nav" onclick="p23_switchTocTab(\'nav\',this)">📑 목차</button>' +
        '</div>' +
        '<div class="p23-toc-pane active" id="p23_tocPaneList">' +
          '<div id="p23_rptList"></div>' +
        '</div>' +
        '<div class="p23-toc-pane" id="p23_tocPaneNav">' +
          '<div id="p23_tocNav"></div>' +
        '</div>' +
      '</div>' +
      '<div class="p23-main" id="p23_main">' +
        '<select class="p23-mobile-rpt-select" id="p23_mobileRptSelect" onchange="p23_mobileSelectReport(this)"><option value="">리포트 선택...</option></select>' +
        '<div class="p23-empty" id="p23_empty"><div class="p23-empty-icon">📊</div>' +
          '<div class="p23-empty-text">시장 분석 리포트</div>' +
          '<div class="p23-empty-hint">리포트를 선택하거나 "직접 업로드"로 .md 파일을 열 수 있습니다</div></div>' +
        '<div class="p23-content" id="p23_content" style="display:none"></div>' +
      '</div>' +
      '<div class="p23-drop-overlay" id="p23_dropOverlay">📂 여기에 .md 파일을 놓으세요</div>' +
    '</div>' +
  '</div>';

// DOM refs
var $vFeed = document.getElementById('p23_vFeed');
var $vTrend = document.getElementById('p23_vTrend');
var $vReport = document.getElementById('p23_vReport');
var $sources = document.getElementById('p23_sources');
var $feedList = document.getElementById('p23_feedList');
var $search = document.getElementById('p23_search');
var $resultCnt = document.getElementById('p23_resultCount');
var $fetchedAt = document.getElementById('p23_fetchedAt');
var $trendWrap = document.getElementById('p23_trendWrap');
var $fileInput = document.getElementById('p23_fileInput');
var $rptTitle = document.getElementById('p23_rptTitle');
var $pdfBtn = document.getElementById('p23_pdfBtn');
var $rptList = document.getElementById('p23_rptList');
var $tocNav = document.getElementById('p23_tocNav');
var $main = document.getElementById('p23_main');
var $empty = document.getElementById('p23_empty');
var $content = document.getElementById('p23_content');
var $drop = document.getElementById('p23_dropOverlay');
var $rptLayout = document.getElementById('p23_rptLayout');

// ══════════════════════════════════════════════════════
// 탭 전환
// ══════════════════════════════════════════════════════
var views = { feed: $vFeed, trend: $vTrend, report: $vReport };
window.p23_switchTab = function(tab, btn) {
  _tab = tab;
  ROOT.querySelectorAll('.p23-tab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  for (var k in views) views[k].style.display = k === tab ? '' : 'none';
  if (tab === 'trend' && _archive) renderTrend();
  if (tab === 'report') renderReportList();
};

// ══════════════════════════════════════════════════════
// A. 피드 (최신 RSS)
// ══════════════════════════════════════════════════════
var _REMOTE_BASE = 'https://gmountain01.github.io/book-radar/data/';

function _applyFeedData() {
  if (_feedData || _archive) {
    renderSources();
    filterAndRender();
    var info = '';
    if (_feedData && _feedData.fetched_at) {
      var d = new Date(_feedData.fetched_at);
      info = '수집: ' + d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    }
    if (_archive) {
      info = '누적 ' + (_archive.total_articles || 0) + '건' + (info ? ' | ' + info : '');
    }
    $fetchedAt.textContent = info;
  } else {
    $feedList.innerHTML = '<div class="p23-empty"><div class="p23-empty-icon">📡</div>' +
      '<div class="p23-empty-text">RSS 데이터 없음</div>' +
      '<div class="p23-empty-hint">네트워크 연결을 확인하세요.</div></div>';
  }
}

function _fetchRemoteJson(url) {
  return fetch(url + '?t=' + Date.now()).then(function(r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
}

function loadData() {
  /* 1) 로컬 <script> 로드 데이터가 있으면 바로 사용 */
  if (window._RSS_FEEDS) _feedData = window._RSS_FEEDS;
  if (window._RSS_ARCHIVE) _archive = window._RSS_ARCHIVE;

  if (_feedData || _archive) { _applyFeedData(); return; }

  /* 2) 로컬 데이터 없으면 GitHub Pages에서 fetch */
  Promise.all([
    _fetchRemoteJson(_REMOTE_BASE + 'rss/feeds.json').then(function(d) { _feedData = d; }).catch(function(){}),
    _fetchRemoteJson(_REMOTE_BASE + 'rss/archive.json').then(function(d) { _archive = d; }).catch(function(){})
  ]).then(_applyFeedData);
}

/* ── 아카이브 기사를 소스별로 병합한 통합 피드 구성 ── */
var _mergedFeeds = [];  // [{id, name, icon, tags, items:[{title,link,date,summary}]}]

function _buildMergedFeeds() {
  var feedMap = {};  // id → {id, name, icon, tags, itemMap:{link→item}}

  /* 1) feedData(오늘 스냅샷)로 소스 목록 초기화 */
  if (_feedData && _feedData.feeds) {
    _feedData.feeds.forEach(function(f) {
      feedMap[f.id] = {id:f.id, name:f.name, icon:f.icon, tags:f.tags||[], itemMap:{}};
      (f.items||[]).forEach(function(it) {
        if (it.link) feedMap[f.id].itemMap[it.link] = {title:it.title, link:it.link, date:it.date, summary:it.summary};
      });
    });
  }

  /* 2) 아카이브 누적 기사 병합 (URL 중복 제거) */
  if (_archive && _archive.articles) {
    _archive.articles.forEach(function(a) {
      var sid = a.source;
      if (!feedMap[sid]) {
        feedMap[sid] = {id:sid, name:a.source_name||sid, icon:a.icon||'📰', tags:a.keywords?a.keywords.slice(0,3):[], itemMap:{}};
      }
      if (a.link && !feedMap[sid].itemMap[a.link]) {
        feedMap[sid].itemMap[a.link] = {title:a.title, link:a.link, date:a.date, summary:a.summary, keywords:a.keywords};
      }
    });
  }

  /* 3) itemMap → items 배열 변환, 날짜순 정렬 */
  _mergedFeeds = [];
  Object.keys(feedMap).forEach(function(sid) {
    var f = feedMap[sid];
    var items = [];
    Object.keys(f.itemMap).forEach(function(k) { items.push(f.itemMap[k]); });
    items.sort(function(a,b) { return (b.date||'').localeCompare(a.date||''); });
    _mergedFeeds.push({id:f.id, name:f.name, icon:f.icon, tags:f.tags, items:items});
  });
  /* 기사 많은 소스 순 */
  _mergedFeeds.sort(function(a,b) { return b.items.length - a.items.length; });
}

function renderSources() {
  _buildMergedFeeds();
  var total = 0;
  _mergedFeeds.forEach(function(f) { total += f.items.length; });
  var h = '<button class="p23-src-btn active" data-src="all" onclick="p23_filterSrc(\'all\',this)">📡 전체 <span class="p23-src-cnt">' + total + '</span></button>';
  _mergedFeeds.forEach(function(f) {
    h += '<button class="p23-src-btn" data-src="' + f.id + '" onclick="p23_filterSrc(\'' + f.id + '\',this)">' +
      f.icon + ' ' + esc(f.name) + ' <span class="p23-src-cnt">' + f.items.length + '</span></button>';
  });
  $sources.innerHTML = h;
}

window.p23_filterSrc = function(src, btn) {
  _activeSource = src;
  $sources.querySelectorAll('.p23-src-btn').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  filterAndRender();
};

$search.addEventListener('input', function() { _searchQuery = this.value.trim().toLowerCase(); filterAndRender(); });

window.p23_setDateRange = function(range, btn) {
  _dateRange = range;
  ROOT.querySelectorAll('.p23-date-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  filterAndRender();
};

// 비ISO 날짜 문자열 방어 파싱 → 'YYYY-MM-DD' 또는 '' 반환
function _isoDate(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  var d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
}

function _getDateCutoff() {
  if (_dateRange === 'all') return null;
  var now = new Date();
  if (_dateRange === '1w') now.setDate(now.getDate() - 7);
  else if (_dateRange === '1m') now.setMonth(now.getMonth() - 1);
  else if (_dateRange === '3m') now.setMonth(now.getMonth() - 3);
  return now.toISOString().substring(0, 10);
}

function filterAndRender() {
  if (!_mergedFeeds.length) return;
  var cutoff = _getDateCutoff();
  _filteredItems = [];
  _mergedFeeds.forEach(function(feed) {
    if (_activeSource !== 'all' && feed.id !== _activeSource) return;
    feed.items.forEach(function(item) {
      var itemDs = _isoDate(item.date);
      if (cutoff && (!itemDs || itemDs < cutoff)) return;
      if (_searchQuery && (item.title + ' ' + (item.summary||'')).toLowerCase().indexOf(_searchQuery) === -1) return;
      _filteredItems.push({ source: feed.name, icon: feed.icon, tags: feed.tags, title: item.title, link: item.link, date: item.date, summary: item.summary });
    });
  });
  _filteredItems.sort(function(a,b) { return (b.date||'').localeCompare(a.date||''); });
  renderFeedList();
}

function renderFeedList() {
  $resultCnt.textContent = _filteredItems.length + '건';
  if (!_filteredItems.length) { $feedList.innerHTML = '<div class="p23-empty"><div class="p23-empty-text">검색 결과 없음</div></div>'; return; }
  var h = '', prevDate = '';
  _filteredItems.forEach(function(item) {
    var ds = _isoDate(item.date);
    if (ds !== prevDate) {
      prevDate = ds;
      var label = ds ? new Date(ds + 'T00:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}) : '날짜 미상';
      h += '<div class="p23-date-divider">' + label + '</div>';
    }
    var hasPub = hasPubSignal(item.title + ' ' + item.summary);
    h += '<div class="p23-feed-card">' +
      '<div class="p23-card-head"><span class="p23-card-src">' + item.icon + ' ' + esc(item.source) + '</span>' +
      (hasPub ? '<span class="p23-pub-signal">📚 출판 기회</span>' : '') +
      '<span class="p23-card-tags">' + item.tags.map(function(t){return '<span class="p23-tag">'+esc(t)+'</span>';}).join('') + '</span></div>' +
      '<a class="p23-card-title" href="' + esc(item.link) + '" target="_blank">' + esc(item.title) + '</a>' +
      '<p class="p23-card-summary">' + esc(item.summary) + '</p></div>';
  });
  $feedList.innerHTML = h;
}

function hasPubSignal(t) {
  t = ' ' + t.toLowerCase() + ' '; // 공백 패딩 — 단어 경계 매칭 (storage/dragon 등 오탐 방지)
  // 강한 신호: 단독으로 출판 기회를 시사하는 키워드
  var strong = ['new model','open source','framework','sdk','llm','fine-tun',' rag ','mcp','출시','오픈소스','프레임워크'];
  for (var i=0;i<strong.length;i++) if (t.indexOf(strong[i])!==-1) return true;
  // 약한 신호: IT 맥락 키워드와 함께 있어야 출판 기회로 판정
  var weak = ['launch','release','announce','introduce','agent','coding','benchmark'];
  var context = ['ai','ml','dev','cloud','data','python','javascript','rust','kubernetes','docker','api'];
  for (var w=0;w<weak.length;w++) {
    if (t.indexOf(weak[w])===-1) continue;
    for (var c=0;c<context.length;c++) if (t.indexOf(context[c])!==-1) return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════
// B. 트렌드 (누적 분석 → 출판 기회)
// ══════════════════════════════════════════════════════
var _trendChart = null;
var _trendChartKws = {}; // {kw: boolean} 토글 상태

function renderTrend() {
  if (!_archive) { $trendWrap.innerHTML = '<div class="p23-empty"><div class="p23-empty-text">아카이브 데이터 없음</div></div>'; return; }

  var articles = _archive.articles || [];
  var trends = _archive.weekly_trends || [];

  // ── 0. 요약 카드 ──
  var h = '<div class="p23-trend-summary">' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + articles.length + '</div><div class="p23-stat-label">누적 아티클</div></div>' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + (trends.length) + '</div><div class="p23-stat-label">수집 주차</div></div>' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + countSources(articles) + '</div><div class="p23-stat-label">소스</div></div>' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + countUniqueKw(articles) + '</div><div class="p23-stat-label">추출 키워드</div></div>' +
  '</div>';

  // ── 1. 급상승 / 하락 키워드 카드 ──
  h += renderSurgeCards(trends);

  // ── 2. 출판 기회 신호 (알림 카드) ──
  h += '<h3 class="p23-section-title">📗 출판 기회 신호</h3>';
  h += renderSignals(articles, trends);

  // ── 3. 키워드 트렌드 차트 (Chart.js) ──
  h += '<h3 class="p23-section-title">📈 키워드 트렌드 차트</h3>';
  h += '<div class="p23-chart-wrap"><canvas id="p23_trendChart" height="280"></canvas></div>';

  // ── 4. 키워드 칩 (클릭→기사 모아보기) ──
  h += '<div class="p23-kw-chips" id="p23_kwChips"></div>';
  h += '<div class="p23-kw-articles" id="p23_kwArticles" style="display:none"></div>';

  // ── 5. 주간 키워드 트렌드 테이블 ──
  var allKw = getAllKeywords(trends);
  h += '<h3 class="p23-section-title">주간 키워드 빈도 테이블</h3>';
  h += '<div class="p23-trend-table-wrap"><table class="p23-trend-table"><thead><tr><th>키워드</th>';
  trends.forEach(function(w) { h += '<th>' + w.week.replace('2026-','') + '</th>'; });
  h += '<th>추세</th></tr></thead><tbody>';
  allKw.forEach(function(kw) {
    var vals = trends.map(function(w) { return w.keywords[kw] || 0; });
    var trend = calcTrend(vals);
    h += '<tr><td class="p23-kw-name">' + esc(kw) + '</td>';
    vals.forEach(function(v) {
      var cls = v === 0 ? 'p23-cell-zero' : v >= 6 ? 'p23-cell-fire' : v >= 4 ? 'p23-cell-hot' : v >= 2 ? 'p23-cell-warm' : 'p23-cell-low';
      h += '<td class="' + cls + '">' + (v || '') + '</td>';
    });
    h += '<td class="p23-trend-arrow">' + trend + '</td></tr>';
  });
  h += '</tbody></table></div>';

  // ── 6. 소스 활동 히트맵 ──
  h += '<h3 class="p23-section-title">🗓️ 소스 활동 히트맵</h3>';
  h += renderSourceHeatmap(articles, trends);

  $trendWrap.innerHTML = h;

  // 차트 & 칩 렌더 (DOM 삽입 후)
  _renderTrendChart(trends, allKw);
  _renderKwChips(articles, allKw);
}

// ── 1. 급상승 / 하락 카드 ──
function renderSurgeCards(trends) {
  if (trends.length < 2) return '';
  var len = trends.length;

  // 진행 중 주 감지 — 최신 week가 오늘이 속한 ISO 주와 같으면 아직 집계 미완
  var isInProgress = (trends[len - 1].week === isoWeek(new Date()));

  var curr = trends[len - 1].keywords;
  var prev = trends[len - 2].keywords;

  // 하락 카드: 진행 중 주는 집계 미완이므로 직전 완결 주 기준 (len-2 vs len-3)
  var fallCurr = (isInProgress && len >= 3) ? trends[len - 2].keywords : curr;
  var fallPrev = (isInProgress && len >= 3) ? trends[len - 3].keywords : prev;

  var surging = [], falling = [];

  // 급상승: 진행 중 주 기준 유지 (신규 감지가 목적)
  for (var kw in curr) {
    var c = curr[kw] || 0, p = prev[kw] || 0;
    if (p === 0 && c >= 2) surging.push({ kw: kw, c: c, p: p, tag: '신규' });
    else if (p > 0 && c >= p * 2) surging.push({ kw: kw, c: c, p: p, tag: '+' + Math.round((c/p-1)*100) + '%' });
  }
  // 하락: 완결된 주 기준
  for (var kw2 in fallPrev) {
    var c2 = fallCurr[kw2] || 0, p2 = fallPrev[kw2] || 0;
    if (p2 >= 2 && c2 < p2 * 0.5) falling.push({ kw: kw2, c: c2, p: p2, tag: Math.round((c2/p2-1)*100) + '%' });
  }
  surging.sort(function(a,b){ return b.c - a.c; });
  falling.sort(function(a,b){ return a.c/a.p - b.c/b.p; });

  var progressBadge = isInProgress
    ? '<span style="font-size:.7rem;font-weight:400;background:#f59e0b;color:#fff;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle;">이번 주 진행 중 — 집계 미완</span>'
    : '';

  var h = '<div class="p23-surge-row">';
  // 급상승
  h += '<div class="p23-surge-card p23-surge-up">';
  h += '<div class="p23-surge-title">🔥 급상승 키워드' + progressBadge + '</div>';
  if (!surging.length) { h += '<div class="p23-surge-empty">이번 주 급상승 키워드 없음</div>'; }
  else { surging.slice(0,6).forEach(function(s) {
    h += '<div class="p23-surge-item"><span class="p23-surge-kw">' + esc(s.kw) + '</span><span class="p23-surge-badge p23-badge-up">' + s.tag + '</span><span class="p23-surge-cnt">' + s.c + '건</span></div>';
  }); }
  h += '</div>';
  // 하락
  h += '<div class="p23-surge-card p23-surge-down">';
  h += '<div class="p23-surge-title">📉 하락 키워드' + (isInProgress && len >= 3 ? '<span style="font-size:.7rem;font-weight:400;color:var(--muted);margin-left:6px;">직전 완결 주 기준</span>' : '') + '</div>';
  if (!falling.length) { h += '<div class="p23-surge-empty">급하락 키워드 없음</div>'; }
  else { falling.slice(0,6).forEach(function(s) {
    h += '<div class="p23-surge-item"><span class="p23-surge-kw">' + esc(s.kw) + '</span><span class="p23-surge-badge p23-badge-down">' + s.tag + '</span><span class="p23-surge-cnt">' + s.c + '건</span></div>';
  }); }
  h += '</div>';
  h += '</div>';
  return h;
}

// ── 2. 출판 기회 신호 (3가지 패턴 감지) ──
function renderSignals(articles, trends) {
  var signals = [];

  // 패턴 A: 3주 연속 증가
  if (trends.length >= 3) {
    var allKw = {};
    trends.forEach(function(w) { for (var k in w.keywords) allKw[k] = true; });
    for (var kw in allKw) {
      var last3 = trends.slice(-3).map(function(w){ return w.keywords[kw] || 0; });
      if (last3[0] > 0 && last3[1] > last3[0] && last3[2] > last3[1]) {
        var relA = articles.filter(function(a){ return (a.keywords||[]).indexOf(kw) !== -1; }).slice(0,3);
        signals.push({ type: 'growth', icon: '📗', kw: kw, desc: '3주 연속 증가 — 도서 수요 상승 신호', vals: last3, articles: relA });
      }
    }
  }

  // 패턴 B: 신규 등장 + 높은 빈도 (최근 2주 내 첫 등장, 빈도 3 이상)
  if (trends.length >= 2) {
    var recent = trends[trends.length - 1].keywords;
    var older = {};
    trends.slice(0, -2).forEach(function(w) { for (var k in w.keywords) older[k] = true; });
    for (var kw2 in recent) {
      if (!older[kw2] && recent[kw2] >= 3) {
        var relB = articles.filter(function(a){ return (a.keywords||[]).indexOf(kw2) !== -1; }).slice(0,3);
        signals.push({ type: 'new', icon: '🆕', kw: kw2, desc: '신규 트렌드 감지 — 선점 기회', vals: [recent[kw2]], articles: relB });
      }
    }
  }

  // 패턴 C: 여러 소스에서 동시 언급 (최근 1주, 3개 이상 소스)
  var lastWeek = trends.length ? trends[trends.length - 1] : null;
  if (lastWeek) {
    var kwSources = {};
    articles.forEach(function(a) {
      if (!a.date) return;
      // 최근 1주 기사만
      var d = new Date(a.date), now = new Date(_archive.last_updated || Date.now());
      if ((now - d) > 8 * 86400000) return;
      (a.keywords || []).forEach(function(k) {
        if (!kwSources[k]) kwSources[k] = new Set();
        kwSources[k].add(a.source);
      });
    });
    for (var kw3 in kwSources) {
      if (kwSources[kw3].size >= 3) {
        var relC = articles.filter(function(a){ return (a.keywords||[]).indexOf(kw3) !== -1; }).slice(0,3);
        // 이미 다른 패턴으로 잡힌 키워드는 건너뛰기
        var dup = signals.some(function(s){ return s.kw === kw3; });
        if (!dup) signals.push({ type: 'cross', icon: '🌐', kw: kw3, desc: kwSources[kw3].size + '개 소스에서 동시 언급 — 크로스소스 관심 집중', articles: relC });
      }
    }
  }

  if (!signals.length) return '<p class="p23-muted">아직 충분한 데이터가 쌓이지 않았습니다. 매일 수집하면 트렌드가 보입니다.</p>';

  var h = '<div class="p23-signal-list">';
  signals.forEach(function(sig) {
    var cls = sig.type === 'growth' ? 'p23-sig-growth' : sig.type === 'new' ? 'p23-sig-new' : 'p23-sig-cross';
    h += '<div class="p23-signal-card ' + cls + '">';
    h += '<div class="p23-signal-head"><span class="p23-signal-icon">' + sig.icon + '</span><span class="p23-signal-kw">' + esc(sig.kw) + '</span></div>';
    h += '<div class="p23-signal-desc">' + esc(sig.desc) + '</div>';
    if (sig.articles.length) {
      h += '<div class="p23-signal-refs">';
      sig.articles.forEach(function(a) {
        h += '<div class="p23-signal-ref">' + (a.icon||'') + ' <a href="' + esc(a.link) + '" target="_blank">' + esc(a.title) + '</a></div>';
      });
      h += '</div>';
    }
    var hint = getPubHint(sig.kw);
    h += '<div class="p23-signal-hint">→ ' + esc(hint) + '</div>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

// ── 3. 키워드 트렌드 Chart.js 라인 차트 ──
var CHART_COLORS = ['#4F46B8','#c23d2f','#b85a00','#1e4a8a','#0f766e','#7c3aed','#db2777','#059669'];

function _renderTrendChart(trends, allKw) {
  var canvas = document.getElementById('p23_trendChart');
  if (!canvas || !window.Chart) return;
  if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

  var labels = trends.map(function(w){ return w.week.replace('2026-',''); });
  var top8 = allKw.slice(0, 8);

  // 초기 토글 상태
  if (!Object.keys(_trendChartKws).length) {
    top8.forEach(function(kw){ _trendChartKws[kw] = true; });
  }

  var datasets = top8.map(function(kw, i) {
    var color = CHART_COLORS[i % CHART_COLORS.length];
    return {
      label: kw,
      data: trends.map(function(w){ return w.keywords[kw] || 0; }),
      borderColor: color,
      backgroundColor: color + '18',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
      hidden: !_trendChartKws[kw]
    };
  });

  _trendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 14, font: { size: 11, family: 'Pretendard' } },
          onClick: function(e, item, legend) {
            var ci = legend.chart;
            var idx = item.datasetIndex;
            var meta = ci.getDatasetMeta(idx);
            meta.hidden = meta.hidden === null ? !ci.data.datasets[idx].hidden : null;
            _trendChartKws[ci.data.datasets[idx].label] = !meta.hidden;
            ci.update();
          }
        },
        tooltip: { titleFont: { family: 'Pretendard' }, bodyFont: { family: 'Pretendard', size: 12 } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10, family: 'JetBrains Mono' } } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { stepSize: 2, font: { size: 10, family: 'JetBrains Mono' } } }
      }
    }
  });
}

// ── 4. 키워드 칩 + 기사 모아보기 ──
function _renderKwChips(articles, allKw) {
  var $chips = document.getElementById('p23_kwChips');
  if (!$chips) return;
  // 키워드별 기사 수
  var kwCnt = {};
  articles.forEach(function(a) { (a.keywords||[]).forEach(function(k){ kwCnt[k]=(kwCnt[k]||0)+1; }); });
  var h = '';
  allKw.forEach(function(kw) {
    h += '<button class="p23-kw-chip" data-kw="' + esc(kw) + '" onclick="p23_showKwArticles(\'' + esc(kw).replace(/'/g,"\\'") + '\')">' + esc(kw) + ' <span class="p23-chip-cnt">' + (kwCnt[kw]||0) + '</span></button>';
  });
  $chips.innerHTML = h;
}

window.p23_showKwArticles = function(kw) {
  var $el = document.getElementById('p23_kwArticles');
  if (!$el || !_archive) return;

  // 토글: 같은 키워드 다시 클릭하면 닫기
  if ($el.style.display !== 'none' && $el.getAttribute('data-kw') === kw) {
    $el.style.display = 'none';
    _clearChipActive();
    return;
  }

  // 칩 활성화 표시
  _clearChipActive();
  var chips = document.getElementById('p23_kwChips');
  if (chips) chips.querySelectorAll('.p23-kw-chip').forEach(function(b){ if(b.getAttribute('data-kw')===kw) b.classList.add('active'); });

  var matched = (_archive.articles||[]).filter(function(a){ return (a.keywords||[]).indexOf(kw) !== -1; });
  matched.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });

  var h = '<div class="p23-kwa-head"><span class="p23-kwa-title">🔎 "' + esc(kw) + '" 관련 기사 (' + matched.length + '건)</span>' +
    '<button class="p23-kwa-close" onclick="p23_closeKwArticles()">✕</button></div>';
  h += '<div class="p23-kwa-list">';
  matched.slice(0,20).forEach(function(a) {
    h += '<div class="p23-feed-card"><div class="p23-card-head"><span class="p23-card-src">' + a.icon + ' ' + esc(a.source_name) + '</span>' +
      '<span class="p23-opp-date">' + esc(a.date||'') + '</span></div>' +
      '<a class="p23-card-title" href="' + esc(a.link) + '" target="_blank">' + esc(a.title) + '</a>' +
      '<p class="p23-card-summary">' + esc(a.summary) + '</p></div>';
  });
  if (matched.length > 20) h += '<div class="p23-kwa-more">외 ' + (matched.length-20) + '건</div>';
  h += '</div>';
  $el.setAttribute('data-kw', kw);
  $el.innerHTML = h;
  $el.style.display = '';
  $el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.p23_closeKwArticles = function() {
  var $el = document.getElementById('p23_kwArticles');
  if ($el) $el.style.display = 'none';
  _clearChipActive();
};

function _clearChipActive() {
  var chips = document.getElementById('p23_kwChips');
  if (chips) chips.querySelectorAll('.p23-kw-chip').forEach(function(b){ b.classList.remove('active'); });
}

// ── ISO 8601 주차 헬퍼 — 파이프라인 trends[].week 라벨과 동일 형식 생성
function isoWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = d.getUTCDay() || 7; // 일요일=0 → 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // 해당 주 목요일로 이동
  var y = d.getUTCFullYear();
  var jan1 = new Date(Date.UTC(y, 0, 1));
  var wn = Math.ceil((((d - jan1) / 86400000) + 1) / 7);
  return y + '-W' + (wn < 10 ? '0' + wn : wn);
}

// ── 6. 소스 활동 히트맵 ──
function renderSourceHeatmap(articles, trends) {
  // 최근 4주 × 소스 그리드
  var last4 = trends.slice(-4);
  if (!last4.length) return '<p class="p23-muted">히트맵을 생성하려면 최소 1주 데이터가 필요합니다.</p>';

  // 소스별 주간 기사 수 계산 (articles에서 직접)
  var sourceNames = {};
  var sourceWeekly = {}; // source -> {week: count}
  articles.forEach(function(a) {
    if (!a.date || !a.source) return;
    sourceNames[a.source] = { name: a.source_name, icon: a.icon };
    var d = new Date(a.date);
    // ISO 8601 주차 — trends[].week 라벨과 동일 방식으로 계산
    var wk = isoWeek(d);
    if (!sourceWeekly[a.source]) sourceWeekly[a.source] = {};
    sourceWeekly[a.source][wk] = (sourceWeekly[a.source][wk] || 0) + 1;
  });

  var weeks = last4.map(function(w){ return w.week; });
  var sources = Object.keys(sourceNames).sort(function(a,b){
    var ta=0, tb=0;
    weeks.forEach(function(w){ ta += (sourceWeekly[a]||{})[w]||0; tb += (sourceWeekly[b]||{})[w]||0; });
    return tb - ta;
  });

  var h = '<div class="p23-heatmap-wrap"><table class="p23-heatmap"><thead><tr><th>소스</th>';
  weeks.forEach(function(w){ h += '<th>' + w.replace('2026-','') + '</th>'; });
  h += '</tr></thead><tbody>';
  sources.forEach(function(src) {
    var info = sourceNames[src];
    h += '<tr><td class="p23-hm-src">' + info.icon + ' ' + esc(info.name) + '</td>';
    weeks.forEach(function(w) {
      var cnt = (sourceWeekly[src]||{})[w] || 0;
      var lvl = cnt === 0 ? 0 : cnt <= 2 ? 1 : cnt <= 5 ? 2 : cnt <= 10 ? 3 : 4;
      h += '<td class="p23-hm-cell p23-hm-lv' + lvl + '">' + (cnt || '') + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

function countSources(arr) { var s = new Set(); arr.forEach(function(a){s.add(a.source);}); return s.size; }
function countUniqueKw(arr) { var s = new Set(); arr.forEach(function(a){(a.keywords||[]).forEach(function(k){s.add(k);});}); return s.size; }

function getAllKeywords(trends) {
  // 전체 등장 횟수로 정렬
  var cnt = {};
  trends.forEach(function(w) {
    for (var k in w.keywords) cnt[k] = (cnt[k]||0) + w.keywords[k];
  });
  return Object.keys(cnt).sort(function(a,b) { return cnt[b]-cnt[a]; });
}

function calcTrend(vals) {
  if (vals.length < 2) return '';
  var recent = vals.slice(-2);
  var prev = vals.slice(-4, -2);
  var rAvg = recent.reduce(function(a,b){return a+b;},0) / recent.length;
  var pAvg = prev.length ? prev.reduce(function(a,b){return a+b;},0) / prev.length : 0;
  if (rAvg > pAvg * 1.3) return '<span class="p23-up">↑ 급상승</span>';
  if (rAvg > pAvg) return '<span class="p23-up-mild">↗ 상승</span>';
  if (rAvg < pAvg * 0.7) return '<span class="p23-down">↓ 하락</span>';
  if (rAvg < pAvg) return '<span class="p23-down-mild">↘ 소폭 하락</span>';
  return '<span class="p23-flat">→ 유지</span>';
}

/* renderOpportunities — replaced by renderSignals */

function getPubHint(kw) {
  var hints = {
    'AI Agent': '에이전트 프레임워크 비교, MCP 연동 실전서 수요 높음',
    'Coding': '바이브코딩/AI 코딩 도구 업데이트 반영 개정판 기회',
    'Automation': 'n8n/Make AI 자동화 실전서 공백',
    'SDK/API': 'Claude/GPT API 활용 개발서, 멀티모델 연동 가이드',
    'LLM': 'LLM 파인튜닝/RAG 구축 실전 수요',
    'RAG': 'RAG 파이프라인 구축 전문서 수요 높음',
    'MCP': 'MCP 프로토콜 실전서 시장 공백',
    'Multimodal': '멀티모달 AI 활용서 (이미지+텍스트+음성)',
    'Open Source': '오픈소스 LLM 활용/파인튜닝 입문서',
    'Framework': '새 프레임워크 입문서 선점 기회',
    'Optimization': 'LLM 추론 최적화/배포 실전서',
    'Cloud/DevOps': '클라우드 AI 인프라 구축 가이드',
    'AI Safety': 'AI 안전/윤리 교양서 수요 증가',
    'Reasoning': 'AI 추론/사고 능력 해설서',
    'Vision': '컴퓨터 비전 + LLM 통합 활용서',
    'Image AI': 'AI 이미지/영상 생성 도구 가이드',
    'Robotics': 'AI 로봇/임베디드 AI 입문서',
    'Enterprise AI': '기업용 AI 도입 전략서',
    'Developer Tools': 'AI 개발 도구 비교/실전 가이드',
    'Fine-tuning': '파인튜닝 실전서 (LoRA, QLoRA 등)',
    'Deployment': 'AI 모델 배포/서빙 인프라 가이드',
    'Embeddings': '임베딩 + 벡터DB 검색 시스템 구축서',
    'Vector DB': '벡터 데이터베이스 실전 활용서',
    'Security': 'AI 보안/프롬프트 인젝션 방어 가이드',
    'AI Education': 'AI 교육/학습 도구 활용서',
  };
  return hints[kw] || '이 주제의 한국어 도서 공급 현황 확인 필요';
}

/* renderSourceActivity — replaced by renderSourceHeatmap */

// ══════════════════════════════════════════════════════
// C. 리포트 뷰어
// ══════════════════════════════════════════════════════

// ── 리포트 목록 (window._REPORTS에서 로드) ──
var _reportsList = [];
var _currentReportIdx = -1;
function renderReportList() {
  _reportsList = (window._REPORTS && window._REPORTS.reports) || [];
  if (!_reportsList.length) {
    /* 리모트 폴백 */
    _fetchRemoteJson(_REMOTE_BASE + 'reports/reports.json')
      .then(function(d) { _reportsList = (d && d.reports) || []; _renderReportListInner(); })
      .catch(function() { _renderReportListInner(); });
    return;
  }
  _renderReportListInner();
}
function _renderReportListInner() {
  if (!_reportsList.length) {
    $rptList.innerHTML = '<div style="padding:8px 16px;font-size:11px;color:var(--muted,#8b8880);">리포트 없음</div>';
    return;
  }
  var h = '';
  _reportsList.forEach(function(r, idx) {
    h += '<button class="p23-rpt-item" data-idx="' + idx + '" onclick="p23_openReport(' + idx + ',this)">' +
      '<div class="p23-rpt-item-date">' + esc(r.date || '') + '</div>' +
      '<div class="p23-rpt-item-title">' + esc(r.title) + '</div>' +
      (r.summary ? '<div class="p23-rpt-item-summary">' + esc(r.summary) + '</div>' : '') +
    '</button>';
  });
  $rptList.innerHTML = h;
  // 모바일 드롭다운도 업데이트
  var sel = document.getElementById('p23_mobileRptSelect');
  if (sel) {
    var opts = '<option value="">리포트 선택...</option>';
    _reportsList.forEach(function(r, idx) {
      opts += '<option value="' + idx + '">[' + esc(r.date||'') + '] ' + esc(r.title) + '</option>';
    });
    sel.innerHTML = opts;
  }
}

window.p23_mobileSelectReport = function(sel) {
  var idx = parseInt(sel.value);
  if (isNaN(idx)) return;
  p23_openReport(idx, null);
};

/* ── 사이드바 탭 전환 (리포트 목록 / 문서 목차) ── */
var $tocPaneList = document.getElementById('p23_tocPaneList');
var $tocPaneNav = document.getElementById('p23_tocPaneNav');

window.p23_switchTocTab = function(pane, btn) {
  var toc = document.getElementById('p23_toc');
  toc.querySelectorAll('.p23-toc-tab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  $tocPaneList.classList.toggle('active', pane === 'list');
  $tocPaneNav.classList.toggle('active', pane === 'nav');
};

window.p23_addReportToBoard = function(idx) {
  var r = _reportsList[idx];
  if (!r) return;
  addToPlanningBoard({
    type: 'report',
    source: 'panel23',
    title: r.title,
    data: { date: r.date, summary: r.summary || '', content: (r.content || '').substring(0, 500) }
  });
};

window.p23_openReport = function(idx, btn) {
  var r = _reportsList[idx];
  if (!r) return;
  _currentReportIdx = idx;
  $rptList.querySelectorAll('.p23-rpt-item').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  $rptTitle.textContent = r.title;
  $pdfBtn.disabled = false;
  currentMd = r.content;
  renderMd(currentMd);
  // 📌 버튼 삽입
  var titleBar = $rptTitle.parentElement;
  if (titleBar && !titleBar.querySelector('.p23-board-btn')) {
    var pbBtn = document.createElement('button');
    pbBtn.className = 'p23-board-btn';
    pbBtn.style.cssText = 'margin-left:8px;background:var(--accent-light,#e3e5f9);color:var(--accent,#4F46B8);border:none;border-radius:6px;padding:3px 10px;font-size:.75rem;cursor:pointer;';
    pbBtn.textContent = '📌 기획 보드';
    pbBtn.onclick = function() { p23_addReportToBoard(idx); };
    titleBar.appendChild(pbBtn);
  } else if (titleBar) {
    var existingBtn = titleBar.querySelector('.p23-board-btn');
    if (existingBtn) existingBtn.onclick = function() { p23_addReportToBoard(idx); };
  }
  // 리포트 선택 후 목차 탭으로 자동 전환
  var navBtn = document.querySelector('.p23-toc-tab[data-pane="nav"]');
  if (navBtn) p23_switchTocTab('nav', navBtn);
};

$fileInput.addEventListener('change', function(e) { if (e.target.files[0]) loadFile(e.target.files[0]); });
var dragCnt = 0;
$rptLayout.addEventListener('dragenter', function(e) { e.preventDefault(); dragCnt++; $drop.classList.add('visible'); });
$rptLayout.addEventListener('dragleave', function(e) { e.preventDefault(); if (--dragCnt <= 0) { dragCnt=0; $drop.classList.remove('visible'); } });
$rptLayout.addEventListener('dragover', function(e) { e.preventDefault(); });
$rptLayout.addEventListener('drop', function(e) { e.preventDefault(); dragCnt=0; $drop.classList.remove('visible'); if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]); });

function loadFile(file) {
  if (!file.name.match(/\.(md|markdown|txt)$/i)) { alert('.md 또는 .txt 파일만 지원합니다.'); return; }
  var reader = new FileReader();
  reader.onload = function(ev) { currentMd = ev.target.result; $rptTitle.textContent = file.name; $pdfBtn.disabled = false; renderMd(currentMd); };
  reader.readAsText(file, 'UTF-8');
}

function parseMd(md) {
  var lines = md.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  var html=[], inTbl=false, tblRows=[], inLst=false, lstType='', lstItems=[], inBq=false, bqLines=[], headings=[];
  var inFence=false, fenceLines=[];
  function flushTbl() { if(!inTbl) return; inTbl=false; if(!tblRows.length) return; var o='<table><thead><tr>'; tblRows[0].forEach(function(c){o+='<th>'+inl(c.trim())+'</th>';}); o+='</tr></thead><tbody>'; for(var r=2;r<tblRows.length;r++){o+='<tr>';tblRows[r].forEach(function(c){o+='<td>'+inl(c.trim())+'</td>';});o+='</tr>';} o+='</tbody></table>'; html.push(o); tblRows=[]; }
  function flushLst() { if(!inLst) return; inLst=false; var t=lstType==='ol'?'ol':'ul'; html.push('<'+t+'>'+lstItems.map(function(li){return '<li>'+inl(li)+'</li>';}).join('')+'</'+t+'>'); lstItems=[]; }
  function flushBq() { if(!inBq) return; inBq=false; html.push('<blockquote>'+bqLines.map(function(l){return inl(l);}).join('<br>')+'</blockquote>'); bqLines=[]; }
  function flushFence() { if(!inFence) return; inFence=false; html.push('<pre><code>'+fenceLines.join('\n')+'</code></pre>'); fenceLines=[]; }
  function mkId(t) { return 'p23_'+t.replace(/[^a-zA-Z0-9가-힣]/g,'_').replace(/_+/g,'_').substring(0,60); }
  // inl: esc() 먼저 적용 후 볼드/코드/링크 변환. 링크 href는 https?:// 또는 # 허용, 나머지는 텍스트만 출력.
  function inl(t) {
    t = esc(t);
    t = t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    t = t.replace(/`(.+?)`/g,'<code>$1</code>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_,txt,url) {
      return /^https?:\/\/|^#/.test(url) ? '<a href="'+url+'" target="_blank">'+txt+'</a>' : txt;
    });
    return t;
  }
  for(var i=0;i<lines.length;i++){
    var line=lines[i], tr=line.trim();
    // 펜스 코드블록 (```) — 내부는 esc()만 적용해 <pre><code>로 묶음
    if(tr.startsWith('```')){
      if(!inFence){flushTbl();flushLst();flushBq();inFence=true;fenceLines=[];}
      else{flushFence();}
      continue;
    }
    if(inFence){fenceLines.push(esc(line));continue;}
    if(tr.match(/^\|.+\|$/)){flushLst();flushBq();if(!inTbl){inTbl=true;tblRows=[];}tblRows.push(tr.split('|').slice(1,-1));continue;}else{flushTbl();}
    if(tr.match(/^>\s/)){flushLst();flushTbl();inBq=true;bqLines.push(tr.replace(/^>\s?/,''));continue;}else{flushBq();}
    var hm=tr.match(/^(#{1,4})\s+(.+)$/); if(hm){flushLst();var lv=hm[1].length,tx=hm[2],id=mkId(tx);headings.push({level:lv,text:tx,id:id});html.push('<h'+lv+' id="'+id+'">'+inl(tx)+'</h'+lv+'>');continue;}
    if(tr.match(/^(-{3,}|\*{3,}|_{3,})$/)){flushLst();html.push('<hr>');continue;}
    if(tr.match(/^[-*]\s+/)){if(!inLst||lstType!=='ul'){flushLst();inLst=true;lstType='ul';}lstItems.push(tr.replace(/^[-*]\s+/,''));continue;}
    if(tr.match(/^\d+\.\s+/)){if(!inLst||lstType!=='ol'){flushLst();inLst=true;lstType='ol';}lstItems.push(tr.replace(/^\d+\.\s+/,''));continue;}else{flushLst();}
    if(tr===''){flushLst();continue;}
    html.push('<p>'+inl(tr)+'</p>');
  }
  flushTbl();flushLst();flushBq();flushFence();
  return {html:html.join('\n'),headings:headings};
}

function renderMd(md) {
  var r=parseMd(md); $empty.style.display='none'; $content.style.display='block'; $content.innerHTML=r.html; tocItems=r.headings;
  // 핵심 인사이트 강조 박스
  $content.querySelectorAll('h2').forEach(function(h){
    if(!h.textContent.match(/핵심\s*인사이트/)) return;
    var box=document.createElement('div'); box.className='p23-insight-box';
    var sibs=[],nx=h.nextElementSibling;
    while(nx&&nx.tagName!=='H2'){sibs.push(nx);nx=nx.nextElementSibling;}
    h.parentNode.insertBefore(box,h); box.appendChild(h); sibs.forEach(function(s){box.appendChild(s);});
  });
  // 기획 카드 강조
  $content.querySelectorAll('h3').forEach(function(h){
    if(!h.textContent.match(/^기획\s*\d+/)) return;
    var card=document.createElement('div'); card.className='p23-plan-card';
    var sibs=[],nx=h.nextElementSibling; while(nx&&nx.tagName!=='H2'&&nx.tagName!=='H3'){sibs.push(nx);nx=nx.nextElementSibling;}
    var uc='p23-mid';
    sibs.forEach(function(s){var t=s.textContent;if(t.match(/긴급도/)){if(t.match(/즉시/))uc='p23-urgent';else if(t.match(/빠른|선점/))uc='p23-chase';}});
    card.classList.add(uc); h.parentNode.insertBefore(card,h); card.appendChild(h); sibs.forEach(function(s){card.appendChild(s);});
  });
  renderTocSidebar(); $main.scrollTop=0;
}

function renderTocSidebar() {
  var o='<div class="p23-toc-title">목차</div>';
  tocItems.forEach(function(it){if(it.level>3)return;var c='p23-toc-item'+(it.level===3?' p23-toc-h3':'');o+='<button class="'+c+'" data-target="'+it.id+'" onclick="p23_scrollTo(this)">'+esc(it.text)+'</button>';});
  $tocNav.innerHTML=o;
}
window.p23_scrollTo = function(btn) { var el=document.getElementById(btn.getAttribute('data-target')); if(!el) return; $tocNav.querySelectorAll('.p23-toc-item').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); el.scrollIntoView({behavior:'smooth',block:'start'}); };
$main.addEventListener('scroll', function(){if(!tocItems.length)return;var st=$main.scrollTop,aid='';tocItems.forEach(function(it){var el=document.getElementById(it.id);if(el&&el.offsetTop-80<=st)aid=it.id;});if(aid)$tocNav.querySelectorAll('.p23-toc-item').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-target')===aid);});});

window.p23_printPdf = function() {
  if(!currentMd) return;
  var base=typeof getBaseUrl==='function'?getBaseUrl():'';
  var lnk=[base+'shared/styles.css',base+'panels/panel23/panel23.css'].map(function(u){return '<link rel="stylesheet" href="'+u+'">';}).join('');
  var ph='<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'+lnk+'<style>body{font-family:"Pretendard","Noto Sans KR",sans-serif;padding:24px 32px;color:#1a1917;max-width:860px;margin:0 auto;}</style></head><body><div class="p23-content">'+$content.innerHTML+'</div></body></html>';
  if(typeof openPrintPopup==='function') openPrintPopup(ph);
};

function esc(s){return s?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';}

// ── init ──
loadData();

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(23, {
    onActivate: function() { if (!_feedData && !_archive) loadData(); },
    onDeactivate: function() { if (_trendChart) { _trendChart.destroy(); _trendChart = null; } }
  });
}
})();
