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
        '<div class="p23-rpt-section">' +
          '<div class="p23-toc-title">리포트 목록</div>' +
          '<div id="p23_rptList"></div>' +
        '</div>' +
        '<div class="p23-toc-nav-section">' +
          '<div class="p23-toc-title">문서 목차</div>' +
          '<div id="p23_tocNav"></div>' +
        '</div>' +
      '</div>' +
      '<div class="p23-main" id="p23_main">' +
        '<div class="p23-empty" id="p23_empty"><div class="p23-empty-icon">📊</div>' +
          '<div class="p23-empty-text">시장 분석 리포트</div>' +
          '<div class="p23-empty-hint">왼쪽 목록에서 리포트를 선택하거나<br>"직접 업로드"로 .md 파일을 열 수 있습니다</div></div>' +
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
var _REMOTE_BASE = 'https://gmountain01.github.io/publishing-helper/data/';

function _applyFeedData() {
  if (_feedData) {
    renderSources();
    filterAndRender();
    if (_feedData.fetched_at) {
      var d = new Date(_feedData.fetched_at);
      $fetchedAt.textContent = '수집: ' + d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    }
  }
  if (_archive) {
    $fetchedAt.textContent = '누적 ' + (_archive.total_articles || 0) + '건 | ' + ($fetchedAt.textContent || '');
  }
  if (!_feedData && !_archive) {
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

function renderSources() {
  if (!_feedData) return;
  var total = 0;
  _feedData.feeds.forEach(function(f) { total += (f.items||[]).length; });
  var h = '<button class="p23-src-btn active" data-src="all" onclick="p23_filterSrc(\'all\',this)">📡 전체 <span class="p23-src-cnt">' + total + '</span></button>';
  _feedData.feeds.forEach(function(f) {
    h += '<button class="p23-src-btn" data-src="' + f.id + '" onclick="p23_filterSrc(\'' + f.id + '\',this)">' +
      f.icon + ' ' + f.name + ' <span class="p23-src-cnt">' + (f.items||[]).length + '</span></button>';
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

function filterAndRender() {
  if (!_feedData) return;
  _filteredItems = [];
  _feedData.feeds.forEach(function(feed) {
    if (_activeSource !== 'all' && feed.id !== _activeSource) return;
    (feed.items||[]).forEach(function(item) {
      if (_searchQuery && (item.title + ' ' + item.summary).toLowerCase().indexOf(_searchQuery) === -1) return;
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
    var ds = item.date ? item.date.substring(0,10) : '';
    if (ds !== prevDate) {
      prevDate = ds;
      var d = new Date(ds); var label = isNaN(d) ? ds : d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
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
  t = t.toLowerCase();
  var s = ['launch','release','announce','introduce','new model','open source','framework','sdk','agent','coding','developer','benchmark','llm','fine-tun','rag','mcp'];
  for (var i=0;i<s.length;i++) if (t.indexOf(s[i])!==-1) return true;
  return false;
}

// ══════════════════════════════════════════════════════
// B. 트렌드 (누적 분석 → 출판 기회)
// ══════════════════════════════════════════════════════
function renderTrend() {
  if (!_archive) { $trendWrap.innerHTML = '<div class="p23-empty"><div class="p23-empty-text">아카이브 데이터 없음</div></div>'; return; }

  var articles = _archive.articles || [];
  var trends = _archive.weekly_trends || [];

  // ── 1. 요약 카드 ──
  var h = '<div class="p23-trend-summary">' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + articles.length + '</div><div class="p23-stat-label">누적 아티클</div></div>' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + (trends.length) + '</div><div class="p23-stat-label">수집 주차</div></div>' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + countSources(articles) + '</div><div class="p23-stat-label">소스</div></div>' +
    '<div class="p23-stat-card"><div class="p23-stat-num">' + countUniqueKw(articles) + '</div><div class="p23-stat-label">추출 키워드</div></div>' +
  '</div>';

  // ── 2. 주간 키워드 트렌드 테이블 ──
  var allKw = getAllKeywords(trends);
  h += '<h3 class="p23-section-title">주간 키워드 트렌드</h3>';
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

  // ── 3. 출판 기회 도출 ──
  h += '<h3 class="p23-section-title">📚 출판 기회 신호</h3>';
  h += renderOpportunities(articles, trends);

  // ── 4. 소스별 최근 활동 ──
  h += '<h3 class="p23-section-title">소스별 활동</h3>';
  h += renderSourceActivity(articles);

  $trendWrap.innerHTML = h;
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

function renderOpportunities(articles, trends) {
  // 최근 2주 급증 키워드 + 기존 IT 도서 시장 공백 매칭
  var recent2 = trends.slice(-2);
  var prev2 = trends.slice(-4, -2);
  var recentCnt = {}, prevCnt = {};
  recent2.forEach(function(w) { for(var k in w.keywords) recentCnt[k] = (recentCnt[k]||0) + w.keywords[k]; });
  prev2.forEach(function(w) { for(var k in w.keywords) prevCnt[k] = (prevCnt[k]||0) + w.keywords[k]; });

  var opps = [];
  for (var kw in recentCnt) {
    var r = recentCnt[kw], p = prevCnt[kw] || 0;
    var growth = p > 0 ? ((r - p) / p * 100) : (r > 2 ? 999 : 0);
    if (r >= 3 || growth > 50) {
      // 관련 아티클 수집
      var relArticles = articles.filter(function(a) { return (a.keywords||[]).indexOf(kw) !== -1; }).slice(0, 3);
      opps.push({ keyword: kw, recent: r, prev: p, growth: growth, articles: relArticles });
    }
  }
  opps.sort(function(a,b) { return b.growth - a.growth || b.recent - a.recent; });

  if (!opps.length) return '<p class="p23-muted">아직 충분한 데이터가 쌓이지 않았습니다. 매일 수집하면 트렌드가 보입니다.</p>';

  var h = '<div class="p23-opp-list">';
  opps.slice(0, 8).forEach(function(op) {
    var cls = op.growth > 100 ? 'p23-opp-hot' : op.growth > 50 ? 'p23-opp-warm' : 'p23-opp-normal';
    h += '<div class="p23-opp-card ' + cls + '">' +
      '<div class="p23-opp-bar"></div>' +
      '<div class="p23-opp-body">' +
      '<div class="p23-opp-head">' +
        '<span class="p23-opp-kw">' + esc(op.keyword) + '</span>' +
        '<span class="p23-opp-growth">' + (op.growth >= 999 ? '🆕 신규' : (op.growth > 0 ? '+' + Math.round(op.growth) + '%' : Math.round(op.growth) + '%')) + '</span>' +
        '<span class="p23-opp-cnt">최근 ' + op.recent + '건</span>' +
      '</div>' +
      '<div class="p23-opp-articles">';
    op.articles.forEach(function(a) {
      h += '<div class="p23-opp-article">' + a.icon + ' <a href="' + esc(a.link) + '" target="_blank">' + esc(a.title) + '</a> <span class="p23-opp-date">' + (a.date||'') + '</span></div>';
    });
    h += '</div>';
    h += '<div class="p23-opp-hint">→ ' + getPubHint(op.keyword) + '</div>';
    h += '</div></div>';
  });
  h += '</div>';
  return h;
}

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

function renderSourceActivity(articles) {
  var bySource = {};
  articles.forEach(function(a) {
    if (!bySource[a.source]) bySource[a.source] = { name: a.source_name, icon: a.icon, total: 0, recent7: 0, kws: {} };
    bySource[a.source].total++;
    if (a.first_seen >= _archive.last_updated) bySource[a.source].recent7++;
    (a.keywords||[]).forEach(function(k) { bySource[a.source].kws[k] = (bySource[a.source].kws[k]||0) + 1; });
  });

  var h = '<div class="p23-source-grid">';
  Object.values(bySource).sort(function(a,b){return b.total-a.total;}).forEach(function(s) {
    var topKw = Object.entries(s.kws).sort(function(a,b){return b[1]-a[1];}).slice(0,3).map(function(e){return e[0];});
    h += '<div class="p23-source-card">' +
      '<div class="p23-source-icon">' + s.icon + '</div>' +
      '<div class="p23-source-head">' + esc(s.name) + '</div>' +
      '<div class="p23-source-stat">' + s.total + '건</div>' +
      '<div class="p23-source-kws">' + topKw.map(function(k){return '<span class="p23-tag">'+esc(k)+'</span>';}).join('') + '</div>' +
    '</div>';
  });
  h += '</div>';
  return h;
}

// ══════════════════════════════════════════════════════
// C. 리포트 뷰어
// ══════════════════════════════════════════════════════

// ── 리포트 목록 (window._REPORTS에서 로드) ──
var _reportsList = [];
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
}

window.p23_openReport = function(idx, btn) {
  var r = _reportsList[idx];
  if (!r) return;
  // 활성 표시
  $rptList.querySelectorAll('.p23-rpt-item').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  // 렌더링
  $rptTitle.textContent = r.title;
  $pdfBtn.disabled = false;
  currentMd = r.content;
  renderMd(currentMd);
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
  function flushTbl() { if(!inTbl) return; inTbl=false; if(!tblRows.length) return; var o='<table><thead><tr>'; tblRows[0].forEach(function(c){o+='<th>'+inl(c.trim())+'</th>';}); o+='</tr></thead><tbody>'; for(var r=2;r<tblRows.length;r++){o+='<tr>';tblRows[r].forEach(function(c){o+='<td>'+inl(c.trim())+'</td>';});o+='</tr>';} o+='</tbody></table>'; html.push(o); tblRows=[]; }
  function flushLst() { if(!inLst) return; inLst=false; var t=lstType==='ol'?'ol':'ul'; html.push('<'+t+'>'+lstItems.map(function(li){return '<li>'+inl(li)+'</li>';}).join('')+'</'+t+'>'); lstItems=[]; }
  function flushBq() { if(!inBq) return; inBq=false; html.push('<blockquote>'+bqLines.map(function(l){return inl(l);}).join('<br>')+'</blockquote>'); bqLines=[]; }
  function mkId(t) { return 'p23_'+t.replace(/[^a-zA-Z0-9가-힣]/g,'_').replace(/_+/g,'_').substring(0,60); }
  function inl(t) { t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'); t=t.replace(/`(.+?)`/g,'<code>$1</code>'); t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>'); return t; }
  for(var i=0;i<lines.length;i++){
    var tr=lines[i].trim();
    if(tr.match(/^\|.+\|$/)){flushLst();flushBq();if(!inTbl){inTbl=true;tblRows=[];}tblRows.push(tr.split('|').slice(1,-1));continue;}else{flushTbl();}
    if(tr.match(/^>\s/)){flushLst();flushTbl();inBq=true;bqLines.push(tr.replace(/^>\s?/,''));continue;}else{flushBq();}
    var hm=tr.match(/^(#{1,4})\s+(.+)$/); if(hm){flushLst();var lv=hm[1].length,tx=hm[2],id=mkId(tx);headings.push({level:lv,text:tx,id:id});html.push('<h'+lv+' id="'+id+'">'+inl(tx)+'</h'+lv+'>');continue;}
    if(tr.match(/^(-{3,}|\*{3,}|_{3,})$/)){flushLst();html.push('<hr>');continue;}
    if(tr.match(/^[-*]\s+/)){if(!inLst||lstType!=='ul'){flushLst();inLst=true;lstType='ul';}lstItems.push(tr.replace(/^[-*]\s+/,''));continue;}
    if(tr.match(/^\d+\.\s+/)){if(!inLst||lstType!=='ol'){flushLst();inLst=true;lstType='ol';}lstItems.push(tr.replace(/^\d+\.\s+/,''));continue;}else{flushLst();}
    if(tr===''){flushLst();continue;}
    html.push('<p>'+inl(tr)+'</p>');
  }
  flushTbl();flushLst();flushBq();
  return {html:html.join('\n'),headings:headings};
}

function renderMd(md) {
  var r=parseMd(md); $empty.style.display='none'; $content.style.display='block'; $content.innerHTML=r.html; tocItems=r.headings;
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
  PanelRegistry.register(23, { onActivate: function() { if (!_feedData && !_archive) loadData(); } });
}
})();
