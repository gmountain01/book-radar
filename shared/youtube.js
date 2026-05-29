/* ═══════════════════════════════════════════════════════════════
   shared/youtube.js — YouTube Data API v3 통합 레이어
   ───────────────────────────────────────────────────────────────
   panel7(유튜버 분석)·panel10(키워드 분석) 공통 사용.
   - 키 라우팅: 사용량 적은 키 우선, 소진 시 자동 전환+재시도
   - 캐시: 엔드포인트별 TTL, localStorage 기반
   - 유닛 추적: 키별 사용량 기록 (sessionStorage)
   - 병렬 제한: _ytParallelLimit (세마포어)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── 상수 ──────────────────────────────────────────────────────
const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const YT_UNIT_COST = { '/search': 100, '/channels': 1, '/playlistItems': 1, '/videos': 1 };
const YT_CACHE_PREFIX = 'yt_apicache_';
const YT_CACHE_TTL = {
  '/search':        60 * 60 * 1000,
  '/channels':      60 * 60 * 1000,
  '/playlistItems': 60 * 60 * 1000,
  '/videos':        60 * 60 * 1000,
};
const YT_PARALLEL_LIMIT = 4; // 동시 최대 API 호출 수

// ── 키 관리 ───────────────────────────────────────────────────
let _ytKeys = typeof getAllYtKeys === 'function' ? getAllYtKeys() :
              typeof YT_API_KEYS_SHARED !== 'undefined' ? YT_API_KEYS_SHARED.slice() : [];

let _ytUnitsPerKey = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('yt_units_pk') || 'null');
    if (Array.isArray(saved)) {
      while (saved.length < _ytKeys.length) saved.push(0);
      return saved.slice(0, _ytKeys.length);
    }
    return _ytKeys.map(() => 0);
  } catch { return _ytKeys.map(() => 0); }
})();

let _ytExhaustedKeys = (() => {
  try { return new Set(JSON.parse(sessionStorage.getItem('yt_exhausted_pk') || '[]')); }
  catch { return new Set(); }
})();

function _ytSaveKeyState() {
  sessionStorage.setItem('yt_units_pk', JSON.stringify(_ytUnitsPerKey));
  sessionStorage.setItem('yt_exhausted_pk', JSON.stringify([..._ytExhaustedKeys]));
}

function _ytTrackUnit(endpoint, keyIdx) {
  const cost = YT_UNIT_COST[endpoint] || 1;
  _ytUnitsPerKey[keyIdx] = (_ytUnitsPerKey[keyIdx] || 0) + cost;
  _ytSaveKeyState();
  // UI 갱신 콜백 (panel7이 등록)
  if (typeof window._ytOnQuotaChange === 'function') window._ytOnQuotaChange();
}

function _ytGetActiveKeyIndices() {
  return _ytKeys.map((_, i) => i)
    .filter(i => !_ytExhaustedKeys.has(i))
    .sort((a, b) => _ytUnitsPerKey[a] - _ytUnitsPerKey[b]);
}

// ── 캐시 ──────────────────────────────────────────────────────
function _ytCacheKey(endpoint, params) {
  const p = { ...params };
  delete p.key;
  return YT_CACHE_PREFIX + endpoint + '|' + JSON.stringify(p);
}

function _ytCacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function _ytCacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    _ytCachePurge();
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }
}

function _ytCachePurge() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(YT_CACHE_PREFIX)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

// ── 핵심 fetch ────────────────────────────────────────────────
async function ytApiFetch(endpoint, params) {
  // 1) 캐시 확인
  const ttl = YT_CACHE_TTL[endpoint];
  if (ttl) {
    const ckey = _ytCacheKey(endpoint, params);
    const hit = _ytCacheGet(ckey, ttl);
    if (hit) return hit;
  }

  // 2) 사용 가능한 키 목록
  const tryKeys = _ytGetActiveKeyIndices();
  if (tryKeys.length === 0) {
    throw new Error('모든 API 키의 일일 할당량이 소진되었습니다.');
  }

  // 3) 키 순회하며 시도
  for (const keyIdx of tryKeys) {
    const url = new URL(YT_BASE + endpoint);
    Object.entries({ ...params, key: _ytKeys[keyIdx] }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error) {
      const reason = data.error.errors?.[0]?.reason || '';
      if (data.error.code === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) {
        _ytExhaustedKeys.add(keyIdx);
        _ytSaveKeyState();
        if (typeof window._ytOnQuotaChange === 'function') window._ytOnQuotaChange();
        continue; // 다음 키 시도
      }
      throw new Error('YouTube API 오류: ' + (data.error.message || ''));
    }

    // 4) 성공
    _ytTrackUnit(endpoint, keyIdx);
    if (ttl) _ytCacheSet(_ytCacheKey(endpoint, params), data);
    return data;
  }

  throw new Error('모든 API 키의 일일 할당량이 소진되었습니다.');
}

// ── 병렬 제한 헬퍼 (세마포어) ─────────────────────────────────
function _ytParallelLimit(tasks, limit) {
  var results = new Array(tasks.length);
  var idx = 0;
  var active = 0;
  return new Promise(function(resolve) {
    if (!tasks.length) return resolve(results);
    function next() {
      while (active < limit && idx < tasks.length) {
        (function(i) {
          active++;
          tasks[i]().then(function(val) { results[i] = val; }).catch(function() { results[i] = null; }).then(function() {
            active--;
            if (idx >= tasks.length && active === 0) resolve(results);
            else next();
          });
        })(idx++);
      }
    }
    next();
  });
}

// ── 고수준 헬퍼: 영상 검색 + 통계 조합 ──────────────────────
// panel10 fetchYT 대체용. query로 검색 → 통계 병합 → 정리된 배열 반환
async function ytSearchWithStats(query, opts) {
  opts = opts || {};
  var order = opts.order || 'relevance';
  var months = opts.months || 12;
  var maxResults = opts.maxResults || 50;
  var pages = opts.pages || 2;

  var publishedAfter = new Date();
  publishedAfter.setMonth(publishedAfter.getMonth() - months);

  // 멀티페이지 검색 — 더 많은 결과 수집
  var allItems = [];
  var pageToken = null;
  for (var pg = 0; pg < pages; pg++) {
    var params = {
      part: 'snippet', q: query, type: 'video', order: order,
      publishedAfter: publishedAfter.toISOString(),
      maxResults: String(maxResults), relevanceLanguage: 'ko',
      regionCode: 'KR'
    };
    if (pageToken) params.pageToken = pageToken;
    var data = await ytApiFetch('/search', params);
    var pageItems = (data && data.items) || [];
    if (pageItems.length) allItems.push.apply(allItems, pageItems);
    if (!data || !data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  var items = allItems;
  if (!items.length) return [];

  // 중복 제거
  var seen = new Set(); var unique = [];
  items.forEach(function(item) {
    var vid = item.id && item.id.videoId;
    if (vid && !seen.has(vid)) { seen.add(vid); unique.push(item); }
  });

  // 통계 조회 (50개씩 배치)
  var ids = unique.map(function(i) { return i.id.videoId; });
  var statsMap = {};
  for (var i = 0; i < ids.length; i += 50) {
    try {
      var batch = ids.slice(i, i + 50);
      var sData = await ytApiFetch('/videos', { part: 'statistics', id: batch.join(',') });
      ((sData && sData.items) || []).forEach(function(v) { statsMap[v.id] = v.statistics; });
    } catch (e) { break; }
  }

  // 결과 조합
  var now = Date.now();
  return unique.map(function(item) {
    var vid = item.id.videoId;
    var stats = statsMap[vid] || {};
    var views = parseInt(stats.viewCount || 0);
    var pub = item.snippet.publishedAt.slice(0, 10);
    var days = Math.max(1, Math.round((now - new Date(pub).getTime()) / 86400000));
    return {
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      published: pub,
      views: views,
      viewsPerDay: Math.round(views / days),
      videoId: vid
    };
  }).sort(function(a, b) { return b.viewsPerDay - a.viewsPerDay; });
}

// ── 공개 API (window 노출) ────────────────────────────────────
window.ytApiFetch = ytApiFetch;
window.ytSearchWithStats = ytSearchWithStats;
window._ytParallelLimit = _ytParallelLimit;
window.YT_PARALLEL_LIMIT = YT_PARALLEL_LIMIT;

// 키/상태 접근자 (panel7·panel11 UI용)
window.ytApiState = {
  getKeys: function() { return _ytKeys; },
  getUnitsPerKey: function() { return _ytUnitsPerKey; },
  getExhaustedKeys: function() { return _ytExhaustedKeys; },
  getBuiltinCount: function() { return typeof YT_API_KEYS_SHARED !== 'undefined' ? YT_API_KEYS_SHARED.length : 0; },
  refreshKeys: function() {
    var prev = _ytKeys.length;
    _ytKeys = typeof getAllYtKeys === 'function' ? getAllYtKeys() :
              typeof YT_API_KEYS_SHARED !== 'undefined' ? YT_API_KEYS_SHARED.slice() : [];
    if (_ytKeys.length !== prev) {
      while (_ytUnitsPerKey.length < _ytKeys.length) _ytUnitsPerKey.push(0);
      _ytUnitsPerKey = _ytUnitsPerKey.slice(0, _ytKeys.length);
      _ytSaveKeyState();
    }
    if (typeof window._ytOnQuotaChange === 'function') window._ytOnQuotaChange();
    return _ytKeys;
  },
  resetExhausted: function() {
    _ytExhaustedKeys.clear();
    _ytUnitsPerKey = _ytKeys.map(function() { return 0; });
    _ytSaveKeyState();
    if (typeof window._ytOnQuotaChange === 'function') window._ytOnQuotaChange();
  },
  clearCache: function() { _ytCachePurge(); },
  isAllExhausted: function() { return _ytGetActiveKeyIndices().length === 0; }
};
