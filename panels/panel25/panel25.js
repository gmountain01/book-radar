(function(){
'use strict';

/* ═══════════════════════════════════════════
   panel25 — 기획 보드
   명세: 기획보드_명세서.md 기반
   종합 판단 패널 — 수집된 모든 데이터 → AI 종합 의견 + 아이템 + 저자 매칭
   ═══════════════════════════════════════════ */

var _result = null;  // AI 종합 결과
var _running = false;
var _justGenerated = false;  // 방금 생성 vs 캐시 구분

function getBoard() { return getPlanningBoard(); }
function saveBoard(b) { savePlanningBoard(b); _updateBadge(b); }
function _updateBadge(board) {
  var badge = document.getElementById('p25Badge');
  if (badge) {
    badge.textContent = board.items.length;
    badge.style.display = board.items.length > 0 ? 'inline-flex' : 'none';
  }
}

// ── 리스크 플래그 자동 태깅 (명세 3-3) ──
// ── YES24 아카이브 동적 로드 (5.1MB — 패널 진입 시 1회만) ──
var _archiveLoaded = false;
var _archiveLoading = false;
var _archiveCallbacks = [];
function ensureArchiveLoaded(cb) {
  if (_archiveLoaded || (window._YES24_ARCHIVE && window._YES24_ARCHIVE.snapshots)) {
    _archiveLoaded = true;
    if (cb) cb();
    return;
  }
  if (cb) _archiveCallbacks.push(cb);
  if (_archiveLoading) return; // 이미 로딩 중 — 콜백만 큐에 추가
  _archiveLoading = true;
  var script = document.createElement('script');
  // 일 단위 캐시 버스팅 — 매일 재생성되는 데이터가 stale 캐시로 남지 않게 (QA L-1/정합성)
  script.src = 'data/yes24/archive.js?d=' + new Date().toISOString().slice(0, 10);
  script.setAttribute('data-yes24-archive', '1');
  function _flush() { var cbs = _archiveCallbacks.splice(0); cbs.forEach(function(fn){ fn(); }); }
  script.onload = function() { _archiveLoaded = true; _archiveLoading = false; _flush(); };
  script.onerror = function() { _archiveLoading = false; console.warn('YES24 archive.js 로드 실패 — 추세 기능이 제한됩니다.'); _flush(); };
  document.head.appendChild(script);
}

var RISK_PATTERNS = [
  { flag: '🔴 저서 보유', patterns: ['저자','저서','출간','지음','집필','저작'], meaning: '타사 계약 가능성' },
  { flag: '🟡 캐시카우', patterns: ['강의 문의','클래스101','패스트캠퍼스','전자책','VIP','마스터클래스','인프런','유데미','코딩 테스트','멘토링'], meaning: '출판 동기 약함' },
  { flag: '🔴 집필 고사', patterns: ['외부 강연 고사','집필 집중','정중히 고사','고사합니다'], meaning: '섭외 난망' }
];

function detectRiskFlags(description) {
  if (!description) return [];
  var desc = description.toLowerCase();
  var flags = [];
  RISK_PATTERNS.forEach(function(r) {
    r.patterns.forEach(function(p) {
      if (desc.indexOf(p.toLowerCase()) >= 0 && !flags.some(function(f){ return f.flag === r.flag; })) {
        flags.push({ flag: r.flag, meaning: r.meaning });
      }
    });
  });
  return flags;
}

// ── 집필 적합 자동 코멘트 (명세 3-4) ──
function writingComment(descScore) {
  if (descScore >= 18) return '글쓰기 검증됨 — 매뉴얼/입문서 집필 적합';
  if (descScore >= 14) return '집필력 미검증 — 샘플 원고 선확인 필요';
  return '장문 집필 습관 약함 — 공저/구성 보강 검토';
}

// ── [개선1] 사내 진행작 목록 (중복 회피) ──
var INPROGRESS_KEY = 'p25_inprogress';
function getInProgress() {
  try { return JSON.parse(localStorage.getItem(INPROGRESS_KEY) || '[]'); } catch(e) { return []; }
}
function saveInProgress(list) { try { localStorage.setItem(INPROGRESS_KEY, JSON.stringify(list)); } catch(e) { console.warn('[panel25] saveInProgress: localStorage 저장 실패', e); } }

// ── [개선2] 집필 능력 시그널 추출 ──
var WRITING_URL_RE = /(?:github\.com|velog\.io|tistory\.com|brunch\.co\.kr|medium\.com|notion\.so|blog\.naver\.com|substack\.com)[\/\w\-.]*/gi;
function extractWritingSignals(desc) {
  if (!desc) return { urls: [], descLen: 0, score: 0 };
  var urls = (desc.match(WRITING_URL_RE) || []).map(function(u) { return u.replace(/\/+$/, ''); });
  var descLen = desc.length;
  // 점수: 설명 길이 + URL 보너스
  var score = Math.min(descLen / 50, 10) + urls.length * 3;
  return { urls: urls, descLen: descLen, score: Math.round(score) };
}

// ── [개선3] 시차 예측 — YES24 아카이브 트렌드 래그 분석 ──
function computeTrendLag() {
  // YES24 아카이브에서 최근 등장 도서 vs 3~6개월 전 RSS 키워드 매핑
  var result = { newTitles: [], lagPatterns: [] };
  if (!window._YES24_ARCHIVE || !window._YES24_ARCHIVE.snapshots) return result;
  var snapshots = window._YES24_ARCHIVE.snapshots;
  var dates = Object.keys(snapshots).sort();
  if (dates.length < 60) return result;

  // 최근 30일 신규 진입 도서 (이전에 없던 것)
  var allPrev = new Set();
  var cutoff = dates[dates.length - 30] || dates[0];
  dates.forEach(function(d) {
    if (d < cutoff) snapshots[d].forEach(function(it) { allPrev.add(it.title); });
  });
  var recentNew = [];
  dates.slice(-30).forEach(function(d) {
    snapshots[d].forEach(function(it) {
      if (!allPrev.has(it.title) && !recentNew.some(function(r){ return r.title === it.title; })) {
        recentNew.push({ title: it.title, rank: it.rank, date: d, publisher: it.publisher || '' });
      }
    });
  });
  recentNew.sort(function(a, b) { return a.rank - b.rank; });
  result.newTitles = recentNew.slice(0, 10);

  // RSS 아카이브에서 3~6개월 전 키워드 추출 → 현재 베스트셀러 제목과 매칭
  if (window._RSS_ARCHIVE && window._RSS_ARCHIVE.articles) {
    var now = Date.now();
    var m3 = now - 90 * 86400000, m6 = now - 180 * 86400000;
    var oldKeywords = {};
    window._RSS_ARCHIVE.articles.forEach(function(a) {
      var t = new Date(a.date).getTime();
      if (t >= m6 && t <= m3 && a.keywords) {
        a.keywords.forEach(function(k) { oldKeywords[k.toLowerCase()] = (oldKeywords[k.toLowerCase()] || 0) + 1; });
      }
    });
    // 빈도 2회 이상 키워드만
    var topOldKw = Object.keys(oldKeywords).filter(function(k) { return oldKeywords[k] >= 2; })
      .sort(function(a, b) { return oldKeywords[b] - oldKeywords[a]; }).slice(0, 20);

    // 현재 신규 베스트셀러 제목과 매칭
    recentNew.forEach(function(book) {
      var tl = book.title.toLowerCase();
      topOldKw.forEach(function(kw) {
        if (tl.indexOf(kw) >= 0) {
          result.lagPatterns.push({ keyword: kw, rssCount: oldKeywords[kw], book: book.title, rank: book.rank });
        }
      });
    });
  }
  return result;
}

// ── [개선4] 아이템 전환 추적 ──
var TRACKING_KEY = 'p25_item_tracking';
var TRACK_STAGES = ['검토','섭외중','계약','집필중','출간','보류'];
// 안정 id — 아이템 concept+fitType 기반 해시 (concept 문자열 그대로를 키로 쓰지 않음)
function _hashStr(s) {
  s = String(s || '');
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return 'it' + (h >>> 0).toString(36);
}
function _itemTrackId(item) { return _hashStr((item.concept || '') + '|' + (item.fitType || '')); }
function _legacyTrackKey(item) { return (item.concept || '').substring(0, 50); }
function _localDateStr() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
// 로드 시 구 데이터(문자열 값) → {stage, updatedAt, memo} 객체로 마이그레이션
function getTracking() {
  var t;
  try { t = JSON.parse(localStorage.getItem(TRACKING_KEY) || '{}'); } catch(e) { t = {}; }
  if (!t || typeof t !== 'object') t = {};
  var changed = false;
  Object.keys(t).forEach(function(k) {
    var v = t[k];
    if (typeof v === 'string') {
      t[k] = { stage: v, updatedAt: null, memo: '' };  // 구 데이터 보존
      changed = true;
    } else if (v && typeof v === 'object') {
      if (typeof v.stage === 'undefined') { v.stage = ''; changed = true; }
      if (typeof v.updatedAt === 'undefined') { v.updatedAt = null; changed = true; }
      if (typeof v.memo === 'undefined') { v.memo = ''; changed = true; }
    } else {
      delete t[k]; changed = true;
    }
  });
  if (changed) saveTracking(t);
  return t;
}
function saveTracking(t) { try { localStorage.setItem(TRACKING_KEY, JSON.stringify(t)); } catch(e) { console.warn('[panel25] saveTracking: localStorage 저장 실패', e); } }

// ── 19개 주제 분류 (generate_report.py TOPIC_KW 동기화) ──
var TOPIC_KW = {
  "AI/LLM 일반": ["ai", "인공지능", "llm", "gpt", "클로드", "제미나이", "생성형", "챗gpt", "오픈ai", "openai", "claude", "gemini"],
  "바이브코딩/노코드": ["바이브 코딩", "바이브코딩", "vibe coding", "노코드", "로우코드"],
  "AI 에이전트/RAG": ["에이전트", "agent", "rag", "랭체인", "langchain", "langgraph", "mcp", "에이전틱"],
  "프롬프트/활용": ["프롬프트", "prompt", "ai 활용", "업무 자동화", "활용법", "활용 가이드"],
  "이미지/영상 AI": ["이미지 생성", "stable diffusion", "미드저니", "comfyui", "영상 ai", "sora", "캡컷", "영상 편집", "ai 영상", "ai 쇼츠"],
  "데이터분석/사이언스": ["데이터 분석", "데이터분석", "판다스", "pandas", "데이터 사이언스", "통계", "r 프로그래밍"],
  "딥러닝/머신러닝": ["딥러닝", "머신러닝", "deep learning", "machine learning", "텐서플로", "파이토치", "트랜스포머"],
  "파이썬": ["파이썬", "python", "점프 투 파이썬"],
  "웹개발": ["웹", "리액트", "react", "next.js", "스프링", "spring", "html", "css", "자바스크립트", "타입스크립트"],
  "앱개발/모바일": ["앱 개발", "flutter", "swift", "코틀린", "안드로이드", "ios"],
  "컴퓨터과학/기초": ["컴퓨터 개론", "자료구조", "알고리즘", "운영체제", "컴퓨팅", "이산수학", "c언어", "c++", "자바 프로그래밍"],
  "클라우드/DevOps": ["클라우드", "aws", "azure", "도커", "쿠버네티스", "kubernetes", "devops", "terraform"],
  "보안/해킹": ["보안", "해킹", "정보보안", "사이버", "모의침투"],
  "엑셀/오피스": ["엑셀", "excel", "파워포인트", "한글", "오피스", "워드"],
  "게임개발": ["게임 개발", "유니티", "unity", "언리얼", "unreal", "게임 프로그래밍"],
  "비전공자/교양": ["비전공자", "교양", "코딩 입문", "처음 배우는", "쉽게 배우는", "혼자 공부"],
  "자격증/취업": ["자격증", "정보처리", "취업", "코딩 테스트", "코딩테스트"],
  "로봇/IoT/하드웨어": ["로봇", "아두이노", "라즈베리", "iot", "반도체", "하드웨어", "임베디드"],
  "블록체인/Web3": ["블록체인", "web3", "nft", "솔리디티", "이더리움"]
};
// 아이템 텍스트 → 19개 주제명 매핑 (첫 매칭). 실패 시 ''
function _mapItemToTopic(item) {
  if (!item) return '';
  var text = ((item.concept || '') + ' ' + (item.targetLevel || '') + ' ' + (item.rationale || '')).toLowerCase();
  var names = Object.keys(TOPIC_KW);
  for (var i = 0; i < names.length; i++) {
    var kws = TOPIC_KW[names[i]];
    for (var j = 0; j < kws.length; j++) {
      if (text.indexOf(kws[j].toLowerCase()) >= 0) return names[i];
    }
  }
  return '';
}

// ── [작업1] 리포트 핵심 섹션 추출 (통계 테이블 제외, 인사이트·기획 아이템·액션만) ──
function _extractReportContext(fullContent) {
  if (!fullContent) return '';
  var wanted = ['핵심 인사이트', '추가 인사이트', '출판 기획 아이템', '추천 다음 액션'];
  var re = /^##[ \t]+(.+?)[ \t]*$/gm;  // 레벨2 헤더만 (### 은 매칭 안 됨)
  var heads = [];
  var m;
  while ((m = re.exec(fullContent)) !== null) {
    heads.push({ title: m[1], start: m.index });
  }
  if (!heads.length) return '';
  var out = [];
  for (var i = 0; i < heads.length; i++) {
    var title = heads[i].title;
    var isWanted = wanted.some(function(w) { return title.indexOf(w) >= 0; });
    if (!isWanted) continue;
    var end = (i + 1 < heads.length) ? heads[i + 1].start : fullContent.length;
    out.push(fullContent.substring(heads[i].start, end).trim());
  }
  return out.join('\n\n');
}

// 섭외 메일 초안 캐시 (idx -> {status, text})
var _outreachDrafts = {};

// ── 데이터 자동 수집 ──
function collectAllData() {
  var data = {};

  // 1. 리포트 — 최신 1개
  data.reports = [];
  if (window._REPORTS && window._REPORTS.reports && window._REPORTS.reports.length) {
    var latest = window._REPORTS.reports[0];
    data.reports = [{ title: latest.title, date: latest.date, summary: latest.summary || '', content: (latest.content || '').substring(0, 1500) }];
  }

  // 2. RSS 피드
  data.feed = [];
  data.feedTotal = 0;
  if (window._RSS_ARCHIVE && window._RSS_ARCHIVE.articles) {
    data.feedTotal = window._RSS_ARCHIVE.articles.length;
    data.feed = window._RSS_ARCHIVE.articles.slice(0, 30).map(function(a) {
      return { title: a.title, date: a.date, source: a.source_name, keywords: a.keywords || [], summary: a.summary || '' };
    });
  }

  // 3. 트렌드 키워드
  data.trends = [];
  if (window._RSS_ARCHIVE && window._RSS_ARCHIVE.weekly_trends) {
    var wt = window._RSS_ARCHIVE.weekly_trends;
    if (wt.length) data.trends = wt.slice(-3);
  }

  // 4. 키워드 분석 — 현재 세션만
  data.keywords = [];
  if (window._kwDisplayedCards && window._kwDisplayedCards.length) {
    data.keywords = window._kwDisplayedCards.slice(0, 20).map(function(c) {
      return { keyword: c.keyword, pick_type: c.pick_type, reason: c.reason, views: c.views, category: c.category };
    });
  }

  // 5. 유튜버 분석 — 현재 세션 + 리스크 플래그
  data.youtubers = [];
  if (window.YT_S && window.YT_S.searchResults && window.YT_S.searchResults.length) {
    data.youtubers = window.YT_S.searchResults.slice(0, 15).map(function(ch) {
      var sn = ch.snippet || {};
      var desc = sn.description || '';
      var flags = detectRiskFlags(desc);
      var writing = extractWritingSignals(desc);
      return {
        name: sn.title || '', subs: ch._subs || 0,
        videoCount: ch._videoCount || 0, titleMatch: ch._titleMatch || 0,
        description: desc.substring(0, 300),
        riskFlags: flags,
        writingSignals: writing
      };
    });
  }

  // 6. 대시보드 분석 결과 (panel1 통합 분석)
  data.dashboard = { total: 0, myPub: '', gaps: [], behind: [], leading: [], summary: '' };
  var analysis = typeof getAnalysisData === 'function' ? getAnalysisData() : [];
  var bestRows = typeof getKwBestRows === 'function' ? getKwBestRows() : [];
  data.dashboard.total = bestRows.length;
  data.dashboard.myPub = typeof getMyPub === 'function' ? getMyPub() : '';
  if (analysis && analysis.length) {
    // 카테고리별 분석 결과
    analysis.forEach(function(d) {
      var item = {
        cat: d.cat,
        compCount: d.comp ? d.comp.length : 0,
        mineCount: d.mine ? d.mine.length : 0,
        plannedCount: d.planned ? d.planned.length : 0,
        lectureCnt: d.lectureCnt || 0,
        compBest: d.compBest,
        mineBest: d.mineBest
      };
      if (d.status === 'gap') data.dashboard.gaps.push(item);
      else if (d.status === 'behind') data.dashboard.behind.push(item);
      else if (d.status === 'leading') data.dashboard.leading.push(item);
    });
    data.dashboard.summary = '총 ' + analysis.length + '개 카테고리 분석 — 공백 ' + data.dashboard.gaps.length + '개, 열세 ' + data.dashboard.behind.length + '개, 우위 ' + data.dashboard.leading.length + '개';
  }

  // 7. 저자 목록 — 주제 관련 저자 우선 정렬 후 50명 구성
  data.authors = [];
  data.authorsTotal = 0;
  if (window._AUTHORS_DATA && window._AUTHORS_DATA.authors) {
    var allAuthors = window._AUTHORS_DATA.authors;
    data.authorsTotal = allAuthors.length;

    // 주제 힌트 수집: 키워드/카테고리 + 대시보드 카테고리 + 보드 아이템
    var topicHints = [];
    data.keywords.forEach(function(c) { if (c.keyword) topicHints.push(c.keyword); if (c.category) topicHints.push(c.category); });
    data.dashboard.gaps.concat(data.dashboard.behind, data.dashboard.leading).forEach(function(g) { if (g.cat) topicHints.push(g.cat); });
    try {
      var _bd = getBoard();
      (_bd.items || []).forEach(function(it) {
        if (it.title) topicHints.push(it.title);
        if (it.data && it.data.category) topicHints.push(it.data.category);
        if (it.data && it.data.reason) topicHints.push(it.data.reason);
      });
    } catch(e) { /* 보드 없음 무시 */ }
    var hintText = topicHints.join(' ').toLowerCase();

    function _authorRelevance(a) {
      var topics = a.topics || [];  // 구버전 데이터 방어
      if (!topics.length || !hintText) return 0;
      var score = 0;
      topics.forEach(function(t) {
        if (!t) return;
        var tl = String(t).toLowerCase();
        if (hintText.indexOf(tl) >= 0) { score += 2; return; }
        var parts = tl.split(/[\/\s]+/).filter(function(p) { return p.length >= 2; });
        if (parts.some(function(p) { return hintText.indexOf(p) >= 0; })) score += 1;
      });
      return score;
    }

    // 관련도 내림차순 → 동점은 원래 순서 유지(상위 저자). 힌트 없으면 전원 0 → 원래 순서
    var ranked = allAuthors.map(function(a, idx) { return { a: a, idx: idx, rel: _authorRelevance(a) }; });
    ranked.sort(function(x, y) { return y.rel !== x.rel ? y.rel - x.rel : x.idx - y.idx; });

    data.authors = ranked.slice(0, 50).map(function(o) {
      var a = o.a;
      return { name: a.name, count: a.count, pubs: a.pubs, bestRank: a.bestRank, totalDays: a.totalDays,
               topics: (a.topics || []).slice(0, 5),
               books: (a.books || []).slice(0, 3).map(function(b){ return typeof b === 'string' ? b : b.title; }) };
    });
  }

  return data;
}

// ── 📌 수집함 (board.items 목록 렌더) ──
var COLLECT_COLLAPSE_KEY = 'p25_collect_collapsed';
var COLLECT_TYPE_META = {
  insight:  { icon:'💡', label:'인사이트' },
  signal:   { icon:'🚨', label:'기회 신호' },
  article:  { icon:'📰', label:'기사' },
  report:   { icon:'📄', label:'리포트' },
  keyword:  { icon:'🔑', label:'키워드' },
  youtuber: { icon:'📺', label:'유튜버' },
  author:   { icon:'📚', label:'저자' },
  trend:    { icon:'📈', label:'트렌드' },
  dashboard:{ icon:'📉', label:'대시보드' }
};
var COLLECT_TYPE_ORDER = ['insight','signal','article','report','keyword','youtuber','author','trend','dashboard'];

function _collectCollapsed() {
  try { return localStorage.getItem(COLLECT_COLLAPSE_KEY) === '1'; } catch(e) { return false; }
}

// 아이템 부가정보 1줄 (type별)
function _collectSubInfo(item) {
  var d = item.data || {};
  switch (item.type) {
    case 'keyword': {
      var parts = [];
      if (d.pick_type) parts.push(String(d.pick_type).toUpperCase());
      if (d.category) parts.push(d.category);
      else if (d.reason) parts.push(String(d.reason).substring(0, 40));
      return parts.join(' · ');
    }
    case 'youtuber':
      return d.subs ? ('구독 ' + Number(d.subs).toLocaleString() + '명') : '';
    case 'author': {
      var ap = [];
      if (d.pubs && d.pubs.length) ap.push([].concat(d.pubs).slice(0, 2).join('/'));
      if (d.bestRank) ap.push('최고 ' + d.bestRank + '위');
      return ap.join(' · ');
    }
    case 'insight': {
      var ip = [];
      if (d.reportTitle) ip.push(d.reportTitle);
      if (d.reportDate) ip.push(d.reportDate);
      return ip.join(' · ');
    }
    case 'signal': {
      var sp = [];
      if (d.signalType) sp.push(d.signalType);
      if (d.keyword) sp.push(d.keyword);
      return sp.join(' · ');
    }
    case 'article': {
      var rp = [];
      if (d.source) rp.push(d.source);
      if (d.date) rp.push(d.date);
      return rp.join(' · ');
    }
    case 'report':
      return d.date || '';
    default:
      return d.date || d.category || '';
  }
}

function _renderCollectionBox(board) {
  var items = board.items || [];
  var collapsed = _collectCollapsed();
  var h = '<div class="p25-collect">';
  h += '<div class="p25-collect-header" onclick="p25_toggleCollection()">';
  h += '<span class="p25-collect-title">📌 수집함</span>';
  h += '<span class="p25-collect-count">' + items.length + '건</span>';
  h += '<span class="p25-collect-toggle" id="p25CollectToggle">' + (collapsed ? '▸' : '▾') + '</span>';
  h += '</div>';
  h += '<div class="p25-collect-body" id="p25CollectBody" style="display:' + (collapsed ? 'none' : 'block') + ';">';
  if (!items.length) {
    h += '<p class="p25-collect-empty">각 패널의 📌 버튼으로 근거를 모으세요.</p>';
  } else {
    // 타입별 그룹핑 — 원래 인덱스 유지(삭제 시 XSS 안전한 인덱스 방식)
    var groups = {};
    items.forEach(function(it, idx) {
      var t = it.type || 'etc';
      (groups[t] = groups[t] || []).push({ it: it, idx: idx });
    });
    var order = COLLECT_TYPE_ORDER.slice();
    Object.keys(groups).forEach(function(t) { if (order.indexOf(t) < 0) order.push(t); });
    order.forEach(function(t) {
      var g = groups[t];
      if (!g || !g.length) return;
      var meta = COLLECT_TYPE_META[t] || { icon:'📌', label:t };
      h += '<div class="p25-collect-group">';
      h += '<div class="p25-collect-group-title">' + meta.icon + ' ' + escHtml(meta.label) + ' <span class="p25-collect-group-n">' + g.length + '</span></div>';
      g.forEach(function(o) {
        var sub = _collectSubInfo(o.it);
        h += '<div class="p25-collect-item">';
        h += '<div class="p25-collect-item-main">';
        h += '<span class="p25-collect-item-title">' + escHtml(o.it.title || '(제목 없음)') + '</span>';
        if (sub) h += '<span class="p25-collect-item-sub">' + escHtml(sub) + '</span>';
        h += '</div>';
        h += '<button class="p25-collect-del" title="제거" onclick="p25_removeItem(' + o.idx + ')">✕</button>';
        h += '</div>';
      });
      h += '</div>';
    });
  }
  h += '</div></div>';
  return h;
}

window.p25_toggleCollection = function() {
  var body = document.getElementById('p25CollectBody');
  var tgl = document.getElementById('p25CollectToggle');
  if (!body) return;
  var willShow = body.style.display === 'none';
  body.style.display = willShow ? 'block' : 'none';
  if (tgl) tgl.textContent = willShow ? '▾' : '▸';
  try { localStorage.setItem(COLLECT_COLLAPSE_KEY, willShow ? '0' : '1'); } catch(e) { console.warn('[panel25] 수집함 접힘 상태 저장 실패', e); }
};

window.p25_removeItem = function(idx) {
  var board = getPlanningBoard();
  if (idx < 0 || idx >= board.items.length) return;
  board.items.splice(idx, 1);
  savePlanningBoard(board);
  _updateBadge(board);
  render();
};

// ── 렌더 ──
function render() {
  var el = document.getElementById('p25Content');
  if (!el) return;

  var data = collectAllData();
  var board = getBoard();
  var boardCounts = {};
  board.items.forEach(function(it) { boardCounts[it.type] = (boardCounts[it.type] || 0) + 1; });
  var hasData = data.reports.length || data.feed.length || data.keywords.length || data.authors.length || data.dashboard.total;

  var html = '<div class="p25-wrap">';

  // 헤더
  html += '<div class="p25-header">';
  html += '<div class="p25-header-left"><h2>기획 보드</h2>';
  html += '<p class="p25-subtitle">흩어진 분석 결과를 모아 종합 판단을 내립니다.</p></div>';
  html += '<div class="p25-header-right">';
  if (board.items.length) html += '<button class="p25-clear-result-btn" onclick="if(clearBoard())p25_clearResult();">📌 전체 해제 (' + board.items.length + ')</button>';
  if (_result) html += '<button class="p25-clear-result-btn" onclick="p25_clearResult()">결과 초기화</button>';
  html += '<button class="p25-run-btn" id="p25RunBtn" onclick="p25_run()"' + (hasData ? '' : ' disabled') + '>';
  html += '<span class="p25-run-icon">▶</span> 종합 의견 생성</button>';
  html += '</div></div>';

  // 데이터 현황
  var pinKw = boardCounts.keyword || 0;
  var pinYt = boardCounts.youtuber || 0;
  var pinAuthor = boardCounts.author || 0;
  var sessionKw = data.keywords.length;
  var sessionYt = data.youtubers.length;
  var dashCats = data.dashboard.gaps.length + data.dashboard.behind.length + data.dashboard.leading.length;

  html += '<div class="p25-status-grid">';
  [
    { icon:'📊', label:'리포트', count:data.reports.length },
    { icon:'📡', label:'RSS', count:data.feedTotal || data.feed.length },
    { icon:'📈', label:'트렌드', count:data.trends.length, unit:'주' },
    { icon:'🔑', label:'키워드', pin:pinKw, session:sessionKw },
    { icon:'📺', label:'유튜버', pin:pinYt, session:sessionYt, unit:'명' },
    { icon:'📉', label:'대시보드', count: dashCats || (data.dashboard.total ? 1 : 0), unit: dashCats ? '개 카테고리' : (data.dashboard.total ? ' (미분석)' : '') },
    { icon:'📚', label:'저자', pin:pinAuthor, count:data.authorsTotal || data.authors.length, unit:'명' }
  ].forEach(function(s) {
    var hasPin = typeof s.pin === 'number';
    var ok = hasPin ? (s.pin > 0 || s.session > 0) : s.count > 0;
    html += '<div class="p25-status-card' + (ok ? '' : ' empty') + '">';
    html += '<span class="p25-status-icon">' + s.icon + '</span>';
    html += '<div class="p25-status-info"><div class="p25-status-label">' + s.label + '</div>';
    if (hasPin) {
      var total = s.pin + (s.session || 0);
      html += '<div class="p25-status-count">' + total + (s.unit || '개');
      if (s.pin > 0) html += ' <span class="p25-status-session">(📌 ' + s.pin + ')</span>';
      html += '</div>';
    } else {
      html += '<div class="p25-status-count">' + (ok ? (s.count || 0) + (s.unit || '개') : '없음') + '</div>';
    }
    html += '</div></div>';
  });
  html += '</div>';

  // 📌 수집함 — board.items 목록
  html += _renderCollectionBox(board);

  // 사내 진행작 입력 (중복 회피)
  var inProgress = getInProgress();
  html += '<div class="p25-inprogress">';
  html += '<div class="p25-inp-header" onclick="p25_toggleInProgress()">';
  html += '<span class="p25-inp-title">🏗️ 사내 진행작</span>';
  html += '<span class="p25-inp-count">' + inProgress.length + '건</span>';
  html += '<span class="p25-inp-toggle">▾</span></div>';
  html += '<div class="p25-inp-body" id="p25InpBody" style="display:none;">';
  html += '<p class="p25-inp-hint">현재 기획 중인 도서를 입력하면 AI가 중복을 회피합니다.</p>';
  html += '<div class="p25-inp-list">';
  inProgress.forEach(function(item, i) {
    html += '<div class="p25-inp-item"><span>' + escHtml(item) + '</span>';
    html += '<button class="p25-inp-del" onclick="p25_delInProgress(' + i + ')">×</button></div>';
  });
  html += '</div>';
  html += '<div class="p25-inp-add"><input type="text" id="p25InpInput" placeholder="예: AI 에이전트 입문서 (가제)" onkeydown="if(event.key===\'Enter\')p25_addInProgress()">';
  html += '<button onclick="p25_addInProgress()">추가</button></div>';
  html += '</div></div>';

  // 진행 상태
  html += '<div class="p25-progress" id="p25Progress" style="display:none;"></div>';

  // 결과
  html += '<div class="p25-results" id="p25Results">';
  if (_result) {
    // 생성 날짜 + 캐시 여부 표시
    var isFromCache = !_justGenerated;
    var lastRun = board.lastRun;
    if (lastRun) {
      var d = new Date(lastRun);
      var dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      html += '<div class="p25-result-meta">';
      html += '<span>📅 생성: ' + dateStr + '</span>';
      if (isFromCache) html += '<span class="p25-cache-badge">💾 저장된 결과</span>';
      else html += '<span class="p25-fresh-badge">✨ 방금 생성</span>';
      html += '</div>';
    }
    html += _renderResult(_result);
  } else if (!hasData) {
    html += '<div class="p25-no-data"><div class="icon">📭</div><p>분석할 데이터가 없습니다.</p>';
    html += '<p class="hint">시장 분석, 키워드 분석, 유튜버 분석 등을 먼저 진행하세요.</p></div>';
  }
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
}

// ── 결과 렌더 (명세 4-5) ──
function _renderResult(r) {
  var h = '';

  // summary — 상단 강조 박스
  if (r.summary) {
    h += '<div class="p25-summary-box"><div class="p25-summary-title">종합 의견</div>';
    h += '<p>' + escHtml(r.summary) + '</p></div>';
  }

  // recommendedItems — 아이템 카드 (fitType별 색상)
  if (r.recommendedItems && r.recommendedItems.length) {
    var tracking = getTracking();
    var trackingDirty = false;
    h += '<div class="p25-section-title">추천 기획 아이템</div>';
    h += '<div class="p25-items-grid">';
    r.recommendedItems.forEach(function(item, i) {
      var fitClass = item.fitType === '안전' ? 'fit-safe' : item.fitType === '데이터' ? 'fit-data' : 'fit-risk';
      var trackId = _itemTrackId(item);
      // 구 concept-substring 키 엔트리는 신규 해시 키로 승계 후 삭제 (QA L-1: 이중 저장 방지)
      var legacyKey = _legacyTrackKey(item);
      if (!tracking[trackId] && tracking[legacyKey]) {
        tracking[trackId] = tracking[legacyKey];
        delete tracking[legacyKey];
        trackingDirty = true;
      }
      var entry = tracking[trackId] || null;
      var curStage = entry ? (entry.stage || '') : '';
      var updatedAt = entry ? entry.updatedAt : null;
      var memo = entry ? (entry.memo || '') : '';
      h += '<div class="p25-item-card ' + fitClass + '">';
      h += '<div class="p25-item-head"><div class="p25-item-fit">' + escHtml(item.fitType || '') + '</div>';
      // 전환 추적 드롭다운 + 메모 버튼
      h += '<div class="p25-track-wrap">';
      h += '<select class="p25-track-select" data-key="' + escHtml(trackId) + '" onchange="p25_setStage(this)">';
      h += '<option value="">상태 선택</option>';
      TRACK_STAGES.forEach(function(s) { h += '<option value="' + s + '"' + (curStage === s ? ' selected' : '') + '>' + s + '</option>'; });
      h += '</select>';
      h += '<button class="p25-memo-btn" title="메모" onclick="p25_editMemo(\'' + trackId + '\')">📝</button>';
      h += '</div></div>';
      if (updatedAt) h += '<div class="p25-track-date">최근 변경 ' + escHtml(updatedAt) + '</div>';
      if (memo) h += '<div class="p25-track-memo">📝 ' + escHtml(memo) + '</div>';
      h += '<div class="p25-item-concept">' + escHtml(item.concept) + '</div>';
      if (item.targetLevel) h += '<div class="p25-item-target">🎯 ' + escHtml(item.targetLevel) + '</div>';
      h += '<div class="p25-item-rationale">' + escHtml(item.rationale || '') + '</div>';
      h += '<div class="p25-item-actions">';
      h += '<button class="p25-item-send" onclick="p25_toProposal(' + i + ')">→ 저자 제안서</button>';
      h += '<button class="p25-item-send" onclick="p25_toPlan(' + i + ')">→ 출판 기획서</button>';
      h += '<button class="p25-item-send" onclick="p25_viewAuthors(' + i + ')">→ 저자 후보 보기</button>';
      h += '<button class="p25-item-send" onclick="p25_draftOutreach(' + i + ')">→ 섭외 메일 초안</button>';
      h += '</div>';
      // 섭외 메일 초안 표시 영역
      var draft = _outreachDrafts[i];
      if (draft) {
        h += '<div class="p25-outreach">';
        if (draft.status === 'loading') {
          h += '<div class="p25-outreach-loading"><span class="p25-spinner"></span> 섭외 메일 초안 생성 중…</div>';
        } else {
          h += '<div class="p25-outreach-head"><span class="p25-outreach-title">섭외 메일 초안</span>';
          h += '<button class="p25-outreach-copy" onclick="p25_copyOutreach(' + i + ')">복사</button></div>';
          h += '<pre class="p25-outreach-body">' + escHtml(draft.text || '') + '</pre>';
        }
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
    if (trackingDirty) saveTracking(tracking);  // 레거시 키 승계분 1회 저장 (QA L-1)
  }

  // authorMatching — 비교 표
  if (r.authorMatching && r.authorMatching.length) {
    h += '<div class="p25-section-title">저자 매칭</div>';
    h += '<div class="p25-author-table"><table><thead><tr>';
    h += '<th>저자/채널</th><th>추천 아이템</th><th>강점</th><th>리스크</th><th>판정</th>';
    h += '</tr></thead><tbody>';
    r.authorMatching.forEach(function(am) {
      var vClass = (am.verdict || '').indexOf('안전') >= 0 ? 'verdict-safe' :
                   (am.verdict || '').indexOf('베팅') >= 0 ? 'verdict-bet' : 'verdict-hold';
      h += '<tr>';
      h += '<td class="p25-am-author">' + escHtml(am.author) + '</td>';
      h += '<td>' + escHtml(am.bestFitItem || '') + '</td>';
      h += '<td>' + escHtml(am.strength || '') + '</td>';
      h += '<td>' + escHtml(am.risk || '') + '</td>';
      h += '<td><span class="p25-verdict ' + vClass + '">' + escHtml(am.verdict || '') + '</span></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  }

  // cautions — 주의사항 박스
  if (r.cautions && r.cautions.length) {
    h += '<div class="p25-cautions"><div class="p25-cautions-title">⚠️ 주의사항</div><ul>';
    r.cautions.forEach(function(c) { h += '<li>' + escHtml(c) + '</li>'; });
    h += '</ul></div>';
  }


  return h;
}

// ── 종합 의견 생성 (명세 4장) ──
window.p25_run = async function() {
  if (_running) return;
  _running = true;

  var btn = document.getElementById('p25RunBtn');
  var progress = document.getElementById('p25Progress');
  btn.disabled = true;
  btn.innerHTML = '<span class="p25-spinner"></span> 분석 중…';
  progress.style.display = 'block';

  var data = collectAllData();
  var board = getBoard();

  try {
    var apiKey = await loadApiKey();
    if (!apiKey) { showToast('통합현황에서 Claude API 키를 설정해주세요.', 'orange'); return; }

    // Step 1: RSS 피드 분석
    _setProgress(progress, 1, 3, 'RSS 피드 종합 의견 생성 중…');
    var feedAnalysis = '';
    if (data.feed.length) {
      var feedPrompt = '아래 IT 업계 최근 뉴스를 출판 기획 관점에서 3~5줄로 종합하라. 어떤 주제가 뜨고, 어떤 기술이 주목받는지.\n\n';
      data.feed.forEach(function(f) {
        feedPrompt += '- [' + f.date + '] ' + f.title + (f.source ? ' (' + f.source + ')' : '') + '\n';
      });
      try {
        feedAnalysis = await callClaudeApi({ apiKey:apiKey, model:'claude-haiku-4-5-20251001', system:'IT 출판 편집자. 한국어. 간결체.', prompt:feedPrompt, maxTokens:500 }) || '';
      } catch(eFeed) {
        console.warn('[panel25] Step 1 피드 요약 실패 (건너뜀):', eFeed.message);
        feedAnalysis = '';
      }
    }

    // Step 2: 종합 의견 생성
    _setProgress(progress, 2, 3, feedAnalysis ? '전체 데이터 종합 판단 중…' : '전체 데이터 종합 판단 중… (피드 요약 건너뜀)');

    // 시스템 프롬프트 (명세 4-2)
    var sysPrompt = '너는 한국 IT 출판사(한빛미디어)의 베테랑 기획 편집자다.\n';
    sysPrompt += '아래 시장/키워드/유튜버 데이터를 종합해 출판 기획 판단을 내려라.\n\n';
    sysPrompt += '[반드시 적용할 5가지 판단 필터]\n';
    sysPrompt += '1. 한국 시장·한국 독자 우선\n';
    sysPrompt += '2. 주제 중복 회피 (외부 경쟁서 + 사내 타 팀 진행작 모두)\n';
    sysPrompt += '3. 무명 저자로도 가능해야 함 (유명 강사는 강의·전자책이 더 돈이 되어 집필 기피, 실력자는 경쟁사에 묶임)\n';
    sysPrompt += '4. 즉시 활용 가능해야 함 (따라 하면 결과 나오는 핸즈온 + 업무를 끝내주는 실무형). 경험담·에세이형 지양\n';
    sysPrompt += '5. 버전 추적 함정 회피 (도구·방법론이 6주마다 바뀜 + 한빛 신간 3~4주 지연). 원리·워크플로우 중심 선호\n\n';
    sysPrompt += '[판단 시 유의]\n';
    sysPrompt += '- 출판 적합도 점수만 높다고 추천하지 마라. "이 아이템에 이 채널이 맞는가"(주제 정합성)를 먼저 본다.\n';
    sysPrompt += '- 리스크 플래그(저서 보유/캐시카우/집필 고사)를 반드시 반영.\n';
    sysPrompt += '- 단정 짓지 말고, 안전 카드와 모험 카드를 구분해 제시.\n';
    sysPrompt += '- [사내 진행작]이 있으면 해당 주제와 겹치는 아이템은 절대 추천하지 마라.\n';
    sysPrompt += '- [시차 예측] 데이터가 있으면 "3~6개월 전 뉴스 키워드 → 현재 베스트셀러" 패턴을 참고해 6개월 후 유망 주제를 예측하라.\n';
    sysPrompt += '- [집필 능력] 블로그/GitHub/기술문서 URL이 있는 저자는 집필력 검증 가능성이 높다. writingScore가 15 이상이면 긍정 평가.\n';
    sysPrompt += '- JSON만 출력. 마크다운 코드블록 금지.';

    // 유저 메시지 구성 (명세 4-3)
    var userMsg = '';

    if (data.reports.length) {
      userMsg += '[시장 리포트]\n';
      data.reports.forEach(function(r) {
        // 전체 리포트 원본에서 핵심 섹션 추출 (data.reports.content는 1500자로 절단돼 후반부 유실)
        var fullContent = '';
        if (window._REPORTS && window._REPORTS.reports) {
          var full = window._REPORTS.reports.filter(function(rr){ return rr.title === r.title; })[0];
          if (full) fullContent = full.content || '';
        }
        var extracted = _extractReportContext(fullContent);
        if (extracted) {
          userMsg += r.title + ' (' + r.date + '):\n' + extracted.substring(0, 6000) + '\n';
        } else {
          userMsg += r.title + ' (' + r.date + '): ' + (r.content || r.summary || '').substring(0, 500) + '\n';
        }
      });
      userMsg += '\n';
    }
    if (feedAnalysis) userMsg += '[RSS 피드 종합]\n' + feedAnalysis + '\n\n';

    // [사용자 선정 근거] — 편집자가 직접 📌한 insight/signal/article/report (판단에 우선 반영)
    var pinnedEvidence = board.items.filter(function(it) {
      return it.type === 'insight' || it.type === 'signal' || it.type === 'article' || it.type === 'report';
    });
    // 최신순 정렬 — 총량 상한 초과 시 최신 항목 우선 포함
    pinnedEvidence.sort(function(a, b) { return String(b.addedAt || '').localeCompare(String(a.addedAt || '')); });
    if (pinnedEvidence.length) {
      var evBudget = 3000;
      var evBlock = '[사용자 선정 근거 — 편집자가 직접 중요하다고 표시한 근거이므로 판단에 우선 반영하라]\n';
      for (var pi = 0; pi < pinnedEvidence.length; pi++) {
        var pit = pinnedEvidence[pi];
        var pd = pit.data || {};
        var line = '';
        if (pit.type === 'insight') {
          line = '💡 인사이트: ' + (pit.title || '') + (pd.reportTitle ? ' (' + pd.reportTitle + ')' : '') + '\n';
          if (pd.body) line += '  ' + String(pd.body).substring(0, 300) + '\n';
        } else if (pit.type === 'signal') {
          line = '🚨 기회 신호: ' + (pd.keyword || pit.title || '') + ' — ' + (pd.signalType || '') + (pd.desc ? ' / ' + pd.desc : '');
          if (pd.vals && pd.vals.length) line += ' [수치: ' + [].concat(pd.vals).join(', ') + ']';
          line += '\n';
        } else if (pit.type === 'article') {
          line = '📰 기사: ' + (pit.title || '') + (pd.source ? ' (' + pd.source + ')' : '') + (pd.date ? ' ' + pd.date : '');
          if (pd.keywords && pd.keywords.length) line += ' [키워드: ' + [].concat(pd.keywords).slice(0, 6).join(', ') + ']';
          line += '\n';
        } else if (pit.type === 'report') {
          line = '📄 리포트: ' + (pit.title || '') + (pd.date ? ' (' + pd.date + ')' : '') + '\n';
          var rbody = pd.content || pd.summary || '';
          if (rbody) line += '  ' + String(rbody).substring(0, 300) + '\n';
        }
        if (evBlock.length + line.length > evBudget) break;
        evBlock += line;
      }
      userMsg += evBlock + '\n';
    }

    if (data.trends.length) {
      userMsg += '[주간 트렌드]\n';
      data.trends.forEach(function(t) {
        userMsg += t.week + ': ' + Object.keys(t.keywords).slice(0, 10).map(function(k){ return k+'('+t.keywords[k]+')'; }).join(', ') + '\n';
      });
      userMsg += '\n';
    }

    // 키워드 병합
    var kwList = [];
    var kwSeen = {};
    data.keywords.forEach(function(c) { kwList.push(c); kwSeen[c.keyword] = true; });
    board.items.forEach(function(it) {
      if (it.type === 'keyword' && !kwSeen[it.title]) {
        kwList.push({ keyword: it.title, pick_type: (it.data && it.data.pick_type) || '', reason: (it.data && it.data.reason) || '' });
      }
    });
    if (kwList.length) {
      userMsg += '[키워드 데이터]\n';
      kwList.forEach(function(c) { userMsg += '[' + (c.pick_type||'').toUpperCase() + '] ' + c.keyword + (c.reason ? ': ' + c.reason.substring(0, 80) : '') + '\n'; });
      userMsg += '\n';
    }

    // 유튜버 병합 + 리스크 플래그
    var ytList = [];
    var ytSeen = {};
    data.youtubers.forEach(function(y) { ytList.push(y); ytSeen[y.name] = true; });
    board.items.forEach(function(it) {
      if (it.type === 'youtuber' && !ytSeen[it.title]) {
        ytList.push({ name: it.title, subs: (it.data && it.data.subs) || 0, videoCount: 0, riskFlags: [] });
      }
    });
    if (ytList.length) {
      userMsg += '[유튜버/저자 후보 — 리스크 플래그 + 집필 능력 포함]\n';
      ytList.forEach(function(y) {
        var line = y.name + ' (구독 ' + y.subs;
        if (y.videoCount) line += ', 관련영상 ' + y.videoCount + '개';
        line += ')';
        if (y.riskFlags && y.riskFlags.length) {
          line += ' ' + y.riskFlags.map(function(f){ return f.flag; }).join(' ');
        }
        // 집필 능력 시그널
        var ws = y.writingSignals;
        if (ws) {
          line += ' [집필력 ' + ws.score + '점';
          if (ws.urls && ws.urls.length) line += ', 링크: ' + ws.urls.slice(0, 2).join(' ');
          line += ']';
        }
        userMsg += line + '\n';
      });
      userMsg += '\n';
    }

    // [개선1] 사내 진행작 — AI에 중복 회피 지시
    var inProgress = getInProgress();
    if (inProgress.length) {
      userMsg += '[사내 진행작 — 이 주제와 겹치는 아이템 추천 금지]\n';
      inProgress.forEach(function(item) { userMsg += '- ' + item + '\n'; });
      userMsg += '\n';
    }

    // [개선3] 시차 예측 — 트렌드 래그 패턴
    var trendLag = computeTrendLag();
    if (trendLag.lagPatterns.length) {
      userMsg += '[시차 예측 — 3~6개월 전 뉴스 키워드 → 현재 베스트셀러 매핑]\n';
      userMsg += '이 패턴을 참고해 "6개월 후 베스트셀러가 될 주제"를 예측하라.\n';
      trendLag.lagPatterns.slice(0, 10).forEach(function(p) {
        userMsg += '- 키워드 "' + p.keyword + '" (뉴스 ' + p.rssCount + '회) → "' + p.book + '" (' + p.rank + '위)\n';
      });
      userMsg += '\n';
    }
    if (trendLag.newTitles.length) {
      userMsg += '[최근 30일 신규 베스트셀러]\n';
      trendLag.newTitles.forEach(function(b) {
        userMsg += '- ' + b.title + ' (' + b.rank + '위, ' + b.publisher + ', ' + b.date + ')\n';
      });
      userMsg += '\n';
    }

    if (data.dashboard.gaps.length || data.dashboard.behind.length || data.dashboard.leading.length) {
      userMsg += '[대시보드 통합 분석 — 자사: ' + (data.dashboard.myPub || '미설정') + ']\n';
      userMsg += data.dashboard.summary + '\n';
      if (data.dashboard.gaps.length) {
        userMsg += '공백 카테고리(경쟁사만 있음): ' + data.dashboard.gaps.map(function(g){ return g.cat + '(경쟁 ' + g.compCount + '종, 최고 ' + g.compBest + '위)'; }).join(', ') + '\n';
      }
      if (data.dashboard.behind.length) {
        userMsg += '열세 카테고리: ' + data.dashboard.behind.map(function(g){ return g.cat + '(자사 ' + g.mineBest + '위 vs 경쟁 ' + g.compBest + '위)'; }).join(', ') + '\n';
      }
      if (data.dashboard.leading.length) {
        userMsg += '우위 카테고리: ' + data.dashboard.leading.map(function(g){ return g.cat; }).join(', ') + '\n';
      }
      userMsg += '\n';
    } else if (data.dashboard.total) {
      userMsg += '[베스트셀러 데이터]\n총 ' + data.dashboard.total + '행 업로드됨 (통합 분석 미실행)\n\n';
    }

    if (data.authors.length) {
      userMsg += '[저자 DB — 위 시장/키워드 주제와 관련도 높은 저자 우선 정렬]\n';
      data.authors.slice(0, 50).forEach(function(a) {
        var line = a.name + ' (' + a.pubs.join('/') + ') 도서: ' + a.books.join(', ');
        if (a.topics && a.topics.length) line += ' [주제: ' + a.topics.join(', ') + ']';
        userMsg += line + '\n';
      });
      userMsg += '\n';
    }

    // 출력 스키마 (명세 4-4 확장)
    userMsg += '[다양성 규칙]\n';
    userMsg += '- recommendedItems는 정확히 3개. 각각 다른 주제 + 다른 대상 독자 수준이어야 한다.\n';
    userMsg += '- 대상 예시: "AI를 처음 접하는 비개발자", "AI 도구를 쓰기 시작한 실무자", "AI 에이전트를 직접 만드는 개발자" 등\n';
    userMsg += '- 컨셉 예시: AI 도구 활용서 / AI 코딩 실전 / AI 시스템 설계 / 비개발자 업무 자동화 / 특정 도구 입문 등 다양하게\n';
    userMsg += '- 같은 수준(입문-중급)으로만 몰리면 안 됨. 반드시 초보/중급/고급 또는 비개발자/실무자/개발자를 섞을 것\n\n';
    userMsg += '위 데이터를 종합해 아래 JSON 형식으로만 답하라. 다른 말 없이 JSON만.\n';
    userMsg += '{"summary":"한 단락 종합 의견 (시장 공백 + 키워드 + 저자를 한 흐름으로 연결)"';
    userMsg += ',"recommendedItems":[{"concept":"아이템 컨셉 한 줄","targetLevel":"대상 독자 수준 (초보/중급/고급 + 직군)","rationale":"왜 유망한지","fitType":"안전 | 데이터 | 모험"}]';
    userMsg += ',"authorMatching":[{"author":"이름","bestFitItem":"아이템 컨셉","strength":"강점","risk":"리스크","verdict":"안전한 정답 | 베팅 | 보류"}]';
    userMsg += ',"cautions":["주의사항1","주의사항2"]}';

    var text = await callClaudeApi({ apiKey:apiKey, model:'claude-sonnet-4-6', system:sysPrompt, prompt:userMsg, maxTokens:8000, noPersona:true });

    _setProgress(progress, 3, 3, '결과 정리 중…');

    // 빈 응답 검증
    if (!text || !text.trim()) {
      throw new Error('AI로부터 빈 응답을 받았습니다. API 키와 네트워크 상태를 확인해주세요.');
    }

    // JSON 파싱 — shared parseAiJson 사용 (FIX-30)
    _result = parseAiJson(text);
    if (!_result) {
      console.warn('[panel25] JSON 파싱 실패:', (text||'').substring(0, 300));
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    }
    // 새 결과 확정 — 이전 아이템 인덱스 기준 섭외 메일 캐시 무효화 (QA M-1)
    _outreachDrafts = {};

    // 결과 유효성 검증
    if (!_result.summary && !_result.recommendedItems) {
      throw new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
    }

    // localStorage 저장
    var boardSave = getPlanningBoard();
    boardSave.result = _result;
    boardSave.lastRun = new Date().toISOString();
    savePlanningBoard(boardSave);

    _justGenerated = true;
    showToast('종합 의견이 생성되었습니다.', 'green');
  } catch (e) {
    console.error('[panel25] 분석 실패:', e);
    showToast('분석 실패: ' + e.message, 'red');
  } finally {
    _running = false;
    btn.disabled = false;
    btn.innerHTML = '<span class="p25-run-icon">▶</span> 종합 의견 생성';
    progress.style.display = 'none';
    render();
  }
};

function _setProgress(el, step, total, msg) {
  var pct = Math.round(step / total * 100);
  el.innerHTML = '<div class="p25-progress-bar"><div class="p25-progress-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="p25-progress-text">' + step + '/' + total + ' ' + msg + '</div>';
}

// ── 이벤트 ──
window.p25_clearResult = function() {
  _result = null;
  _outreachDrafts = {};  // 섭외 메일 캐시 동반 초기화 (QA M-1)
  var board = getPlanningBoard();
  delete board.result;
  savePlanningBoard(board);
  render();
};

// ── 사내 진행작 이벤트 ──
window.p25_toggleInProgress = function() {
  var body = document.getElementById('p25InpBody');
  if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
};
window.p25_addInProgress = function() {
  var input = document.getElementById('p25InpInput');
  if (!input || !input.value.trim()) return;
  var list = getInProgress();
  list.push(input.value.trim());
  saveInProgress(list);
  render();
};
window.p25_delInProgress = function(i) {
  var list = getInProgress();
  list.splice(i, 1);
  saveInProgress(list);
  render();
};

// ── 전환 추적 이벤트 ──
window.p25_setStage = function(sel) {
  var key = sel.getAttribute('data-key');
  var val = sel.value;
  var t = getTracking();
  var entry = t[key] || { stage: '', updatedAt: null, memo: '' };
  if (val) { entry.stage = val; entry.updatedAt = _localDateStr(); }
  else { entry.stage = ''; }
  if (!entry.stage && !entry.memo) delete t[key];
  else t[key] = entry;
  saveTracking(t);
  render();
};
window.p25_editMemo = function(key) {
  var t = getTracking();
  var entry = t[key] || { stage: '', updatedAt: null, memo: '' };
  var next = window.prompt('전환 추적 메모 (짧게):', entry.memo || '');
  if (next === null) return;  // 취소
  entry.memo = next.trim();
  if (!entry.stage && !entry.memo) delete t[key];
  else t[key] = entry;
  saveTracking(t);
  render();
};

// ── [작업2] 저자 후보 보기 — panel24로 이동 + 주제 필터 ──
window.p25_viewAuthors = function(idx) {
  var item = (_result && _result.recommendedItems || [])[idx];
  var topic = item ? _mapItemToTopic(item) : '';
  switchTab(24, document.getElementById('tab24'));
  if (topic && typeof window.p24_applyTopicFilter === 'function') {
    try { window.p24_applyTopicFilter(topic); }
    catch(e) { console.warn('[panel25] p24_applyTopicFilter 실패:', e); }
  }
  showToast(topic ? ('저자 목록 — "' + topic + '" 필터') : '저자 목록으로 이동', 'green');
};

// ── [작업3a] 섭외 메일 초안 ──
window.p25_draftOutreach = async function(idx) {
  if (!_result) return;
  var item = (_result.recommendedItems || [])[idx];
  if (!item) return;
  if (_outreachDrafts[idx] && _outreachDrafts[idx].status === 'loading') return;
  _outreachDrafts[idx] = { status: 'loading', text: '' };
  render();

  var apiKey;
  try { apiKey = await loadApiKey(); } catch(e) { apiKey = null; }
  if (!apiKey) {
    delete _outreachDrafts[idx];
    showToast('통합현황에서 Claude API 키를 설정해주세요.', 'orange');
    render();
    return;
  }

  // 저자 후보 매칭
  var matching = (_result.authorMatching || []).filter(function(am) {
    return (am.bestFitItem || '').indexOf(item.concept) >= 0 || (item.concept || '').indexOf(am.bestFitItem || '___') >= 0;
  });
  var author = matching.length ? matching[0] : null;

  var context = '[기획 아이템 개요]\n';
  context += '- 컨셉: ' + (item.concept || '') + '\n';
  context += '- 대상 독자: ' + (item.targetLevel || '') + '\n';
  context += '- 기획 근거: ' + (item.rationale || '') + '\n';
  if (_result.summary) context += '\n[시장 근거 — 수치 포함]\n' + _result.summary + '\n';
  if (author) {
    context += '\n[저자 후보 — 왜 이 저자인가]\n- 이름: ' + author.author + '\n';
    if (author.strength) context += '- 강점/집필 시그널: ' + author.strength + '\n';
    if (author.risk) context += '- 유의점: ' + author.risk + '\n';
  }

  var SYS = '너는 한빛미디어 콘텐츠 기획 편집자다. 저자에게 보내는 정중한 한국어 출판 섭외 이메일을 쓴다.\n' +
    '- 정중하고 간결하게. 과장·상투어("혁신적", "획기적") 지양.\n' +
    '- 왜 지금 이 주제인지 시장 근거의 수치를 자연스럽게 녹여라.\n' +
    '- 저자 후보가 특정돼 있으면 "왜 당신인가"(저서 이력·전문성·집필 시그널)를 근거로 언급하라.\n' +
    '- 출력은 순수 텍스트. 첫 줄에 "제목: ..." 그다음 빈 줄, 이후 이메일 본문. 마크다운·JSON 금지.';
  var prompt = '아래 정보로 출판 섭외 이메일 초안을 작성하라.\n\n' + context +
    '\n[구성] 제목 한 줄 + 본문(인사 → 제안 배경·시장 근거 → 집필 제안 → 미팅 제안 → 맺음말).\n' +
    '발신: 한빛미디어 기획 편집자. 수신: 위 저자 후보(특정 안 됐으면 "선생님").';

  try {
    var text = await callClaudeApi({ apiKey: apiKey, model: 'claude-sonnet-4-6', system: SYS, prompt: prompt, maxTokens: 2000, noPersona: true });
    if (!text || !text.trim()) throw new Error('AI로부터 빈 응답을 받았습니다.');
    _outreachDrafts[idx] = { status: 'done', text: text.trim() };
    showToast('섭외 메일 초안이 생성되었습니다.', 'green');
  } catch(e) {
    console.warn('[panel25] 섭외 메일 초안 실패:', e);
    delete _outreachDrafts[idx];
    showToast('초안 생성 실패: ' + e.message, 'red');
  }
  render();
};
window.p25_copyOutreach = function(idx) {
  var d = _outreachDrafts[idx];
  if (!d || !d.text) return;
  var text = d.text;
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('클립보드에 복사됨', 'green');
    }).catch(function() { _p25FallbackCopy(text); });
  } else {
    _p25FallbackCopy(text);
  }
};
function _p25FallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(ok ? '클립보드에 복사됨' : '복사 실패 — 직접 선택해 복사하세요', ok ? 'green' : 'red');
  } catch(e) {
    showToast('복사 실패 — 직접 선택해 복사하세요', 'red');
  }
}

// ── AI 정제 후 전달 ──
async function _refineAndSend(idx, target) {
  if (!_result) return;
  var item = (_result.recommendedItems || [])[idx];
  if (!item) return;
  var matching = (_result.authorMatching || []).filter(function(am) {
    return (am.bestFitItem || '').indexOf(item.concept) >= 0 || (item.concept || '').indexOf(am.bestFitItem || '___') >= 0;
  });
  var author = matching.length ? matching[0] : (_result.authorMatching || [])[0] || {};

  var apiKey;
  try { apiKey = await loadApiKey(); } catch(e) { console.warn('[panel25] p25_openPlanDetail: API 키 로드 실패', e); }
  if (!apiKey) {
    // API 키 없으면 기존 방식 (정제 없이 전달)
    window._p25_exportData = { summary: _result.summary, recommendedItems: [item], authorMatching: _result.authorMatching, cautions: _result.cautions };
    _doSwitch(target, item.concept);
    return;
  }

  showToast('AI가 내용을 정제하고 있습니다…', 'blue');

  var context = '아이템: ' + (item.concept || '') + '\n대상: ' + (item.targetLevel || '') + '\n근거: ' + (item.rationale || '') + '\n유형: ' + (item.fitType || '');
  if (author.author) context += '\n추천 저자: ' + author.author + ' (강점: ' + (author.strength || '') + ', 리스크: ' + (author.risk || '') + ')';
  if (_result.summary) context += '\n시장 종합: ' + _result.summary;
  if (_result.cautions && _result.cautions.length) context += '\n주의: ' + _result.cautions.join(', ');

  var prompt;
  var SYS = '너는 한빛미디어 콘텐츠 1팀 15년차 편집자다.\n' +
    '[글쓰기 규칙]\n' +
    '- 한 문장 40자 이내. 군더더기 제거. 수식어 최소화.\n' +
    '- "~할 수 있습니다", "혁신적인", "획기적인", "다양한", "효과적인" 사용 금지.\n' +
    '- 숫자·고유명사·구체적 도구명을 넣어 신뢰감을 줘라.\n' +
    '- JSON만 출력. 마크다운 코드블록 금지.\n';

  if (target === 'proposal') {
    prompt = '[역할] 저자에게 보내는 출판 제안서를 작성한다.\n' +
      '[톤] 저자를 설득하되 과장 없이. 팩트와 시장 데이터로 "이 책을 왜 지금 내야 하는가"를 납득시켜라.\n\n' +
      '[아이템 정보]\n' + context + '\n\n' +
      '[출력 JSON 스키마 — 모든 필드 필수]\n' +
      '{\n' +
      '  "title1": "헤더 첫줄 — 저자 이름/전문성 언급, 15자 이내",\n' +
      '  "title2": "헤더 둘째줄 — 핵심 가치 한 문장, 20자 이내",\n' +
      '  "heroHead": "Why This Book — 핵심 메시지 1~2문장, 총 60자 이내",\n' +
      '  "heroDesc": "heroHead 보충 설명 3문장. 각 문장 40자 이내. 줄바꿈(\\n)으로 구분",\n' +
      '  "why": [\n' +
      '    {"num": "영문 키워드 1단어 (예: TIMING)", "title": "12자 이내 한줄 제목", "body": "근거 1~2문장, 총 60자 이내"}\n' +
      '  ] // 정확히 4개. num은 TIMING/READER/PROOF/OSMU 등 각각 다른 키워드,\n' +
      '  "toc": [\n' +
      '    {"num": "1장", "title": "장 제목 15자 이내", "sub": "소제목 키워드 나열 · 구분자로 연결"}\n' +
      '  ] // 정확히 5개 (1장~5장). 실제 도서 목차처럼 구체적으로,\n' +
      '  "discuss": [\n' +
      '    {"title": "논의 주제 15자 이내", "desc": "설명 1~2문장, 총 50자 이내"}\n' +
      '  ] // 정확히 3개. 저자와 실제로 상의해야 할 구체적 사안,\n' +
      '  "ctaHead": "미팅 제안 제목 15자 이내",\n' +
      '  "ctaDesc": "미팅 제안 본문 2문장. 줄바꿈(\\n)으로 구분"\n' +
      '}';
  } else {
    prompt = '[역할] 출판사 내부 기획 회의용 기획서를 작성한다.\n' +
      '[톤] 시장 근거, 경쟁서 분석, 구체적 수치로 기획 의도를 설득하라.\n\n' +
      '[아이템 정보]\n' + context + '\n\n' +
      '[출력 JSON 스키마 — 모든 필드 필수]\n' +
      '{\n' +
      '  "title": "도서명 (가제) — 20자 이내, 부제 포함 가능",\n' +
      '  "field": "분야 카테고리 (예: AI 활용/자동화)",\n' +
      '  "concept": "이 책이 무엇이고 왜 지금인지 3문장. 각 문장 40자 이내. 줄바꿈(\\n)으로 구분",\n' +
      '  "readerCore": "핵심 독자 — 직군+경력+수준 구체적으로 (예: AI 도구 경험 1년 미만 마케터/기획자)",\n' +
      '  "readerExt": "확장 독자 — 2차 타겟 직군",\n' +
      '  "readerBudget": "구매력 (하/중/중상/상 + 근거 한 줄)",\n' +
      '  "readerNeeds": "독자가 겪는 구체적 문제 2~3개, 줄바꿈(\\n)으로 구분",\n' +
      '  "diff": "경쟁서 대비 차별점 3줄. 각 줄 \'경쟁서A는 ~인 반면, 이 책은 ~\' 구조. 줄바꿈(\\n)으로 구분",\n' +
      '  "keypoints": [\n' +
      '    {"title": "포인트명 10자 이내", "desc": "설명 1문장 30자 이내"}\n' +
      '  ] // 정확히 3개\n' +
      '}';
  }

  try {
    var text = await callClaudeApi({ apiKey: apiKey, model: 'claude-sonnet-4-6', system: SYS, prompt: prompt, maxTokens: 4000, noPersona: true });
    var refined = parseAiJson(text);
    if (!refined) throw new Error('AI 응답을 파싱할 수 없습니다.');
    window._p25_exportData = {
      summary: _result.summary,
      recommendedItems: [item],
      authorMatching: _result.authorMatching,
      cautions: _result.cautions,
      refined: refined,
      target: target
    };
  } catch (e) {
    console.warn('[panel25] 정제 실패, 원본 전달:', e);
    window._p25_exportData = { summary: _result.summary, recommendedItems: [item], authorMatching: _result.authorMatching, cautions: _result.cautions };
  }
  _doSwitch(target, item.concept);
}

function _doSwitch(target, concept) {
  var label = (concept || '').length > 20 ? concept.substring(0, 20) + '…' : concept;
  if (target === 'proposal') {
    switchTab(3, document.getElementById('tab3'));
    showToast('"' + label + '" → 저자 제안서로 전달', 'green');
  } else {
    switchTab(5, document.getElementById('tab5'));
    showToast('"' + label + '" → 출판 기획서로 전달', 'green');
  }
}

window.p25_toProposal = function(idx) { _refineAndSend(idx, 'proposal'); };
window.p25_toPlan = function(idx) { _refineAndSend(idx, 'plan'); };

// ── 초기화 ──
function init() {
  var board = getPlanningBoard();
  if (board.result) { _result = board.result; _justGenerated = false; }
  render();
}

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(25, {
    onActivate: function() { ensureArchiveLoaded(); init(); },
    onDeactivate: function() {}
  });
}

})();
