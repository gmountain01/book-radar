/* ═══════ 유튜버 분석 JS (scoped: YT_S, YT_LS, ytSwitchPanel) ═══════ */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 상수 & 상태
// ═══════════════════════════════════════════════════════════════
// 여섯 API 키 — 할당량 소진 시 자동 전환
const API_KEYS = typeof YT_API_KEYS_SHARED !== 'undefined' ? YT_API_KEYS_SHARED : [
  'AIzaSyDNjvfk8ZYRPumWeHCY9Axgswd80vHHSKo','AIzaSyChNq2hCvxPC6gN9oNi1gw5hTTJqGGaR6c',
  'AIzaSyB3scxbgQ5zR1-bhNfD6qWxuOky8uIRXgM','AIzaSyC-ynVQpZgd1b6-PLVrwqOteA6aXPruQAc',
  'AIzaSyDQYU8o3Oaa-anZ5PZqRzLvbFJifOU1bis','AIzaSyAVKzuZ2Wr9G6xQE687ZEypnPx6FadAvoc'
];
const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const YT_LS = { saved: 'yt_saved', compare: 'yt_compare' };

// ── API 결과 캐시 ──────────────────────────────────────────────
// YouTube API 할당량 절감: 동일 요청은 TTL 내에 로컬스토리지에서 반환
const API_CACHE_PREFIX = 'yt_apicache_';
const API_CACHE_TTL = {
  '/search':        60 * 60 * 1000,  // 검색 결과 60분 (기존 10분 → 할당량 절감)
  '/channels':      60 * 60 * 1000,  // 채널 통계 60분 (기존 30분)
  '/playlistItems': 60 * 60 * 1000,  // 영상 목록 60분 (기존 30분)
  '/videos':        60 * 60 * 1000,  // 영상 통계 60분 (기존 30분)
};

// ── API 유닛 사용량 트래킹 (키별) ──────────────────────────────
// /search = 100유닛, 나머지 = 1유닛. 캐시 히트 시 소모 안 함.
const YT_UNIT_COST = { '/search': 100, '/channels': 1, '/playlistItems': 1, '/videos': 1 };

// 키별 세션 사용량 [key0유닛, key1유닛, key2유닛, ...]
let ytUnitsPerKey = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('yt_units_pk') || 'null');
    if (Array.isArray(saved) && saved.length === API_KEYS.length) return saved;
    return API_KEYS.map(() => 0);
  } catch { return API_KEYS.map(() => 0); }
})();
// 할당량 소진 키 인덱스 집합 (오늘 소진된 키는 다음날까지 사용 불가)
let ytExhaustedKeys = (() => {
  try { return new Set(JSON.parse(sessionStorage.getItem('yt_exhausted_pk') || '[]')); }
  catch { return new Set(); }
})();
let ytUnitsUsed = ytUnitsPerKey.reduce((a, b) => a + b, 0); // 합계 (하위 호환)

function _trackUnit(endpoint, keyIdx) {
  const cost = YT_UNIT_COST[endpoint] || 1;
  ytUnitsPerKey[keyIdx] = (ytUnitsPerKey[keyIdx] || 0) + cost;
  ytUnitsUsed = ytUnitsPerKey.reduce((a, b) => a + b, 0);
  sessionStorage.setItem('yt_units_pk', JSON.stringify(ytUnitsPerKey));
  _updateQuotaDisplay();
}

function _saveKeyState() {
  sessionStorage.setItem('yt_units_pk', JSON.stringify(ytUnitsPerKey));
  sessionStorage.setItem('yt_exhausted_pk', JSON.stringify([...ytExhaustedKeys]));
}

function _getActiveKeyIndices() {
  // 소진되지 않은 키를 사용량 적은 순으로 반환
  return API_KEYS.map((_, i) => i)
    .filter(i => !ytExhaustedKeys.has(i))
    .sort((a, b) => ytUnitsPerKey[a] - ytUnitsPerKey[b]);
}

function _updateQuotaDisplay() {
  const el = document.getElementById('yt-quota-display');
  if (!el) return;
  const lines = API_KEYS.map((_, i) => {
    const used = ytUnitsPerKey[i] || 0;
    const remaining = Math.max(0, 10000 - used);
    const exhausted = ytExhaustedKeys.has(i);
    const statusIcon = exhausted ? '⛔' : remaining < 500 ? '⚠️' : '✓';
    const statusText = exhausted ? '소진' : '활성';
    const pctBar = Math.min(100, Math.round(used / 100));
    return `<div style="margin-bottom:5px;">
      <span style="opacity:.7;">키${i + 1}</span> ${statusIcon}<span style="opacity:.55;font-size:10px;">${statusText}</span>
      <div style="background:rgba(255,255,255,.15);border-radius:3px;height:4px;margin:2px 0;">
        <div style="background:${exhausted?'#C0392B':used>7000?'#F39C12':'#2ECC71'};height:100%;width:${pctBar}%;border-radius:3px;"></div>
      </div>
      <span style="font-size:10px;opacity:.5;">${used.toLocaleString()} / 10,000 유닛 (잔여 ${remaining.toLocaleString()})</span>
    </div>`;
  });
  el.innerHTML = lines.join('');
}

function _cacheKey(endpoint, params) {
  // API 키 제외한 파라미터로 캐시 키 생성
  const p = { ...params };
  delete p.key;
  return API_CACHE_PREFIX + endpoint + '|' + JSON.stringify(p);
}

function _cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function _cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // 스토리지 용량 초과 시 캐시 전체 비우고 재시도
    _cachePurge();
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }
}

function _cachePurge() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(API_CACHE_PREFIX)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

// 캐시 수동 초기화 (UI에서 호출 가능)
function clearApiCache() {
  _cachePurge();
  showToast('API 캐시가 초기화되었습니다.');
}

const YT_S = {
  channel: null,         // 현재 분석 채널 전체 데이터
  videos: [],            // 현재 채널 영상 목록
  compareList: [],       // 비교 목록 (직렬화된 채널 요약)
  savedChannels: [],     // 저장 목록 (직렬화된 채널 요약)
  enrichedChannels: {},  // 검색 결과 배치 조회 시 저장 (contentDetails 포함) — analyzeChannelById 재호출 방지
  charts: {},           // Chart.js 인스턴스
  searchResults: [],    // 통계 포함 검색 결과
  sortBy: 'relevance',   // 검색 결과 정렬 기준
  lastSearchQuery: '',   // relevanceScore 키워드 매칭에 사용
  rookieResults: [],     // 슈퍼 루키 검색 결과 보관
  rookieSortMode: 'score' // 루키 정렬 기준: score|subs|views|country
};

function getApiKey(keyIdx) { return API_KEYS[keyIdx] || API_KEYS[0]; }

// 국가 코드 → 한국어 국가명
const COUNTRY_NAMES = {
  KR:'대한민국', US:'미국', JP:'일본', CN:'중국', GB:'영국',
  DE:'독일', FR:'프랑스', CA:'캐나다', AU:'호주', IN:'인도',
  BR:'브라질', MX:'멕시코', TH:'태국', VN:'베트남', PH:'필리핀',
  ID:'인도네시아', MY:'말레이시아', SG:'싱가포르', TW:'대만', HK:'홍콩',
  ES:'스페인', IT:'이탈리아', NL:'네덜란드', RU:'러시아', TR:'터키',
  UA:'우크라이나', PL:'폴란드', SE:'스웨덴', NO:'노르웨이', FI:'핀란드',
  DK:'덴마크', PT:'포르투갈', CH:'스위스', AT:'오스트리아', BE:'벨기에',
  AR:'아르헨티나', CL:'칠레', CO:'콜롬비아', SA:'사우디아라비아', AE:'UAE',
  EG:'이집트', NG:'나이지리아', ZA:'남아프리카공화국', IL:'이스라엘', PK:'파키스탄',
  BD:'방글라데시', LK:'스리랑카', NP:'네팔', NZ:'뉴질랜드', RO:'루마니아',
};
function countryName(code) {
  if (!code) return '';
  return COUNTRY_NAMES[code] || code;
}

function ytLoadLS() {
  YT_S.savedChannels = JSON.parse(localStorage.getItem(YT_LS.saved) || '[]');
  YT_S.compareList   = JSON.parse(localStorage.getItem(YT_LS.compare) || '[]');
}
function ytSaveLS() {
  localStorage.setItem(YT_LS.saved,   JSON.stringify(YT_S.savedChannels));
  localStorage.setItem(YT_LS.compare, JSON.stringify(YT_S.compareList));
}

// ═══════════════════════════════════════════════════════════════
// UI 유틸
// ═══════════════════════════════════════════════════════════════
function ytSwitchPanel(n) {
  document.querySelectorAll('#yt-app .yt-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#sidebar .nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('yt-panel' + n).classList.add('active');
  const navItem = document.querySelector(`#sidebar .nav-item[data-panel="${n}"]`);
  if (navItem) navItem.classList.add('active');
  if (n === 3) renderCompare();
  if (n === 4) renderSaved();
}

let toastTimer;
function toast(msg, dur = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

function fmtNum(n) {
  if (!n && n !== 0) return '-';
  n = parseInt(n);
  if (isNaN(n)) return '-';
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억';
  if (n >= 10000)     return (n / 10000).toFixed(1) + '만';
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

function fmtDate(s) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeSince(s) {
  if (!s) return '-';
  const d = Math.floor((Date.now() - new Date(s)) / 86400000);
  if (d < 1)   return '오늘';
  if (d < 7)   return d + '일 전';
  if (d < 30)  return Math.floor(d / 7) + '주 전';
  if (d < 365) return Math.floor(d / 30) + '개월 전';
  return Math.floor(d / 365) + '년 전';
}

// escHtml — shared/app.js에 전역 정의됨

function destroyChart(key) {
  if (YT_S.charts[key]) { YT_S.charts[key].destroy(); delete YT_S.charts[key]; }
}

function scoreColor(n) {
  if (n >= 80) return '#10B981';
  if (n >= 60) return '#3B3F8C';
  if (n >= 40) return '#F59E0B';
  return '#EF4444';
}

function scoreTag(n) {
  if (n >= 80) return ['tag-green', '출판 최적'];
  if (n >= 60) return ['tag-blue',  '출판 적합'];
  if (n >= 40) return ['tag-yellow','가능성 있음'];
  return          ['tag-red',   '추가 검토 필요'];
}

// ═══════════════════════════════════════════════════════════════
// YouTube API
// ═══════════════════════════════════════════════════════════════
async function ytFetch(endpoint, params) {
  // 캐시 확인 — 히트 시 유닛 소모 없음
  const ttl = API_CACHE_TTL[endpoint];
  if (ttl) {
    const ckey = _cacheKey(endpoint, params);
    const hit = _cacheGet(ckey, ttl);
    if (hit) return hit;
  }

  // 사용 가능한 키 목록 (사용량 적은 순)
  const tryKeys = _getActiveKeyIndices();
  if (tryKeys.length === 0) {
    throw new Error('모든 API 키의 일일 할당량이 소진되었습니다. 내일 다시 시도하거나 Google Cloud Console에서 할당량을 확인하세요.');
  }

  for (const keyIdx of tryKeys) {
    const url = new URL(YT_BASE + endpoint);
    Object.entries({ ...params, key: API_KEYS[keyIdx] }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error) {
      const reason = data.error.errors?.[0]?.reason || '';
      // 할당량 초과 → 이 키를 소진으로 표시하고 다음 키 시도
      if (data.error.code === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) {
        ytExhaustedKeys.add(keyIdx);
        _saveKeyState();
        _updateQuotaDisplay();
        showToast(`키 ${keyIdx + 1} 할당량 소진 — 키 ${keyIdx === 0 ? 2 : 1}로 전환`, 'yellow');
        continue; // 다음 키 시도
      }
      throw new Error(`YouTube API 오류: ${data.error.message}`);
    }

    // 성공 — 유닛 차감 후 캐시 저장
    _trackUnit(endpoint, keyIdx);
    if (ttl) _cacheSet(_cacheKey(endpoint, params), data);
    return data;
  }

  throw new Error('모든 API 키의 일일 할당량이 소진되었습니다. 내일 다시 시도해주세요.');
}

// ── 한국 채널 최소 N개 보장 페이지네이션 검색 ──
// 최대 maxPages 페이지를 순차 조회하여 targetKR개 이상의 한국어 채널이
// 모이면 조기 종료한다. 한국 여부는 snippet의 한글 포함 여부로 판정.
async function searchChannelsPaged(baseParams, targetKR = 40, maxPages = 3) {
  const HANGUL = /[가-힣]/;
  let allItems = [];
  let pageToken = null;
  for (let p = 0; p < maxPages; p++) {
    const params = { ...baseParams, ...(pageToken ? { pageToken } : {}) };
    const data = await ytFetch('/search', params);
    if (!data.items?.length) break;
    allItems = allItems.concat(data.items);
    const krCount = allItems.filter(i =>
      HANGUL.test(i.snippet?.title || '') ||
      HANGUL.test(i.snippet?.description || '') ||
      HANGUL.test(i.snippet?.channelTitle || '')
    ).length;
    if (krCount >= targetKR || !data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return { items: allItems };
}

// ── 채널 통계 배치 조회 (50개 초과 시 분할 병렬 호출) ──
async function fetchChannelStatsBatch(cids, part = 'snippet,statistics,contentDetails') {
  const batches = [];
  for (let i = 0; i < cids.length; i += 50) batches.push(cids.slice(i, i + 50));
  const results = await Promise.all(
    batches.map(batch => ytFetch('/channels', { part, id: batch.join(',') }))
  );
  return { items: results.flatMap(r => r.items || []) };
}

async function apiSearchChannels(q) {
  return ytFetch('/search', {
    part: 'snippet', type: 'channel', q,
    maxResults: 50,
    regionCode: 'KR',          // 한국 지역 기반 검색 결과 편향
    relevanceLanguage: 'ko'    // 한국어 관련성 우선
  });
}

async function apiGetChannelById(id) {
  return ytFetch('/channels', {
    part: 'snippet,statistics,contentDetails', // brandingSettings 제거 — 미사용 part
    id
  });
}

async function apiGetChannelByHandle(handle) {
  return ytFetch('/channels', {
    part: 'snippet,statistics,contentDetails',
    forHandle: handle
  });
}

async function apiGetPlaylistItems(playlistId, maxResults = 20) {
  return ytFetch('/playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults
  });
}

async function apiGetVideoStats(videoIds) {
  return ytFetch('/videos', {
    part: 'statistics,snippet',
    id: videoIds.join(',')
  });
}

// URL/입력값 → 채널 ID 해석
async function resolveInput(input) {
  input = input.trim();

  // YouTube URL 파싱
  try {
    const url = new URL(input);
    const path = url.pathname;

    if (path.startsWith('/@')) {
      const handle = path.slice(2).split('/')[0];
      return await fetchByHandle(handle);
    }
    if (path.startsWith('/channel/')) {
      const cid = path.split('/channel/')[1].split('/')[0];
      return await fetchById(cid);
    }
    if (path.startsWith('/c/') || path.startsWith('/user/')) {
      const name = path.split('/').filter(Boolean).pop();
      return await fetchBySearch(name);
    }
  } catch (_) { /* not a URL */ }

  // @handle
  if (input.startsWith('@')) return await fetchByHandle(input.slice(1));

  // Channel ID pattern (UC + 22 chars)
  if (/^UC[\w-]{22}$/.test(input)) return await fetchById(input);

  // keyword → return null to show search results
  return null;
}

async function fetchById(id) {
  const data = await apiGetChannelById(id);
  return data.items?.[0] || null;
}

async function fetchByHandle(handle) {
  try {
    const data = await apiGetChannelByHandle(handle);
    if (data.items?.length) return data.items[0];
  } catch (_) {}
  // fallback to search
  return await fetchBySearch(handle);
}

async function fetchBySearch(q) {
  const data = await apiSearchChannels(q);
  if (!data.items?.length) return null;
  const cid = data.items[0].id.channelId;
  return await fetchById(cid);
}

// ═══════════════════════════════════════════════════════════════
// 출판 적합도 점수
// ═══════════════════════════════════════════════════════════════
// 콘텐츠 품질 신호 분석
// 조회수·구독자는 인기 지표일 뿐, 지식 깊이는 별도 신호로 측정한다.
function analyzeContentQuality(videos) {
  if (!videos.length) return null;

  const totView    = videos.reduce((a, v) => a + parseInt(v.statistics?.viewCount    || 0), 0);
  const totLike    = videos.reduce((a, v) => a + parseInt(v.statistics?.likeCount    || 0), 0);
  const totComment = videos.reduce((a, v) => a + parseInt(v.statistics?.commentCount || 0), 0);

  // 1. 댓글 참여율 — 교육·실용 콘텐츠 vs 오락 콘텐츠의 핵심 구분자
  //    댓글은 "배웠거나 질문이 생겼을 때" 달린다. 단순 시청 콘텐츠는 낮다.
  const commentRate = totView > 0 ? (totComment / totView) * 100 : 0;
  let cq1 = commentRate >= 0.5 ? 35 : commentRate >= 0.2 ? 28 : commentRate >= 0.05 ? 18 : commentRate >= 0.01 ? 8 : 3;
  let cr1;
  if (cq1 >= 35) cr1 = `댓글 비율 ${commentRate.toFixed(2)}% — 매우 높은 심화 참여. 시청자가 적극적으로 질문하고 토론합니다. 교육·실용 저자 유형.`;
  else if (cq1 >= 28) cr1 = `댓글 비율 ${commentRate.toFixed(2)}% — 높은 참여. 콘텐츠가 실질적인 반응을 유도합니다.`;
  else if (cq1 >= 18) cr1 = `댓글 비율 ${commentRate.toFixed(2)}% — 평균 수준. 학습·오락 혼합 채널로 추정됩니다.`;
  else if (cq1 >= 8)  cr1 = `댓글 비율 ${commentRate.toFixed(2)}% — 낮은 편. 시청 후 별도 반응을 유발하지 않는 콘텐츠.`;
  else               cr1 = `댓글 비율 ${commentRate.toFixed(2)}% — 매우 낮음. 수동적 시청 콘텐츠일 가능성이 높습니다.`;

  // 2. 좋아요 비율 — "유익했다"고 느낄 때 누른다
  const likeRate = totView > 0 ? (totLike / totView) * 100 : 0;
  let cq2 = likeRate >= 5 ? 25 : likeRate >= 2 ? 18 : likeRate >= 1 ? 12 : likeRate >= 0.3 ? 7 : 3;
  let cr2;
  if (cq2 >= 25) cr2 = `좋아요 비율 ${likeRate.toFixed(2)}% — 매우 높음. 시청자가 콘텐츠에 명확한 가치를 느낍니다.`;
  else if (cq2 >= 18) cr2 = `좋아요 비율 ${likeRate.toFixed(2)}% — 높은 만족도. 유익한 콘텐츠로 인식됩니다.`;
  else if (cq2 >= 12) cr2 = `좋아요 비율 ${likeRate.toFixed(2)}% — 보통 수준입니다.`;
  else if (cq2 >= 7)  cr2 = `좋아요 비율 ${likeRate.toFixed(2)}% — 다소 낮음. 알고리즘 도달 대비 만족도가 낮을 수 있습니다.`;
  else               cr2 = `좋아요 비율 ${likeRate.toFixed(2)}% — 낮음. 무작위 유입이 많은 채널일 수 있습니다.`;

  // 3. 설명문 충실도 — 글 쓰는 습관이 있는 저자인가
  //    설명문이 길고 구체적일수록 집필 능력이 있다고 볼 수 있다
  const descLengths = videos.map(v => (v.snippet?.description || '').length);
  const avgDesc = descLengths.reduce((a, b) => a + b, 0) / descLengths.length;
  const longDescRate = Math.round(descLengths.filter(l => l >= 200).length / descLengths.length * 100);
  let cq3 = avgDesc >= 500 ? 20 : avgDesc >= 200 ? 15 : avgDesc >= 80 ? 10 : avgDesc >= 30 ? 5 : 2;
  let cr3;
  if (cq3 >= 20) cr3 = `평균 설명문 ${Math.round(avgDesc)}자 (${longDescRate}% 충실 작성) — 글쓰기 습관이 매우 잘 갖춰진 저자입니다.`;
  else if (cq3 >= 15) cr3 = `평균 설명문 ${Math.round(avgDesc)}자 — 설명문 작성에 공을 들입니다. 집필 능력이 기대됩니다.`;
  else if (cq3 >= 10) cr3 = `평균 설명문 ${Math.round(avgDesc)}자 — 기본 수준의 설명문. 집필 역량은 직접 검토가 필요합니다.`;
  else if (cq3 >= 5)  cr3 = `평균 설명문 ${Math.round(avgDesc)}자 — 설명문이 짧습니다. 글로 표현하는 습관이 아직 약합니다.`;
  else               cr3 = `평균 설명문 ${Math.round(avgDesc)}자 — 설명문 거의 없음. 텍스트 집필 적응에 상당한 편집 지원이 필요합니다.`;

  // 4. 제목 전문성 — 구체적·긴 제목 = 주제 심화, 짧은 제목 = 클릭베이트
  const titles = videos.map(v => v.snippet?.title || v._sn?.title || '').filter(Boolean);
  const avgTitleLen = titles.length > 0 ? titles.reduce((a, t) => a + t.length, 0) / titles.length : 0;
  // 시리즈·강의 구조 감지
  const seriesRe = /(ep\.?\s*\d+|\d+편|\d+강|part\.?\s*\d+|#\d+|시리즈|강의|강좌|course)/i;
  const seriesRate = titles.length > 0 ? Math.round(titles.filter(t => seriesRe.test(t)).length / titles.length * 100) : 0;
  let cq4 = avgTitleLen >= 25 ? 20 : avgTitleLen >= 18 ? 15 : avgTitleLen >= 12 ? 10 : avgTitleLen >= 7 ? 5 : 2;
  let cr4;
  const seriesTxt = seriesRate >= 20 ? ` · 시리즈 구성 ${seriesRate}% (체계적 집필 역량 기대)` : '';
  if (cq4 >= 20) cr4 = `평균 제목 ${avgTitleLen.toFixed(0)}자 — 구체적이고 전문적인 제목${seriesTxt}. 주제 깊이가 있는 채널입니다.`;
  else if (cq4 >= 15) cr4 = `평균 제목 ${avgTitleLen.toFixed(0)}자 — 양호한 수준${seriesTxt}.`;
  else if (cq4 >= 10) cr4 = `평균 제목 ${avgTitleLen.toFixed(0)}자 — 보통 수준. 클릭베이트성 제목이 섞여 있을 수 있습니다.`;
  else               cr4 = `평균 제목 ${avgTitleLen.toFixed(0)}자 — 제목이 짧고 일반적. 콘텐츠 깊이 확인이 필요합니다.`;

  const qualityTotal = cq1 + cq2 + cq3 + cq4;  // max 100

  // 종합 편집자 코멘트
  let qualitySummary;
  if (qualityTotal >= 75) qualitySummary = '데이터 기반으로 양질의 콘텐츠 생산자로 판단됩니다. 시청자 반응(댓글·좋아요)과 글쓰기 습관(설명문)이 모두 높아 집필 저자로 강력 추천합니다.';
  else if (qualityTotal >= 55) qualitySummary = '콘텐츠 품질이 양호합니다. 일부 지표를 편집자가 직접 영상을 시청하며 검증하면 최종 판단에 도움이 됩니다.';
  else if (qualityTotal >= 35) qualitySummary = '인기 채널이더라도 콘텐츠 깊이 신호가 약합니다. 실제 영상 2~3개를 직접 시청하고 집필 역량을 검토한 후 진행을 권장합니다.';
  else qualitySummary = '오락·단편 콘텐츠 특성이 강합니다. 출판 저자보다는 브랜드 협업·에세이 방향으로 접근하거나, 집필 의지와 역량을 별도 확인해야 합니다.';

  return { cq1, cq2, cq3, cq4, qualityTotal, cr1, cr2, cr3, cr4, qualitySummary, commentRate, likeRate, avgDesc, avgTitleLen, seriesRate };
}

function calcScore(channel, videos) {
  const st = channel.statistics;
  const subs   = parseInt(st.subscriberCount || 0);
  const vCount = parseInt(st.videoCount || 0);
  const tViews = parseInt(st.viewCount || 0);

  // 1. 구독자 규모 (30점)
  let s1 = subs >= 1000000 ? 30
         : subs >= 100000  ? 25
         : subs >= 10000   ? 15
         : subs >= 1000    ? 8 : 3;

  const subsStr = st.hiddenSubscriberCount ? '비공개' : subs.toLocaleString() + '명';
  let r1;
  if (s1 === 30) r1 = `구독자 ${subsStr} — 광범위한 팬베이스. 초판 대량 판매 및 베스트셀러 가능성이 높습니다.`;
  else if (s1 === 25) r1 = `구독자 ${subsStr} — 출판 도서 초판 소화에 충분한 팬베이스입니다.`;
  else if (s1 === 15) r1 = `구독자 ${subsStr} — 특정 분야 독자층 형성. 타깃 출판에 적합합니다.`;
  else if (s1 === 8)  r1 = `구독자 ${subsStr} — 소규모 핵심 독자층. 틈새 시장 도서로 기획하면 가능성 있습니다.`;
  else               r1 = `구독자 ${subsStr} — 아직 독자층이 제한적입니다. 성장 추이를 확인하세요.`;

  // 2. 참여율 (30점) — 평균조회수/구독자
  let s2 = 0;
  let avgV = 0;
  if (videos.length > 0) {
    avgV = videos.reduce((a, v) => a + parseInt(v.statistics?.viewCount || 0), 0) / videos.length;
  } else if (vCount > 0) {
    avgV = tViews / vCount;
  }
  let r2;
  if (subs > 0 && avgV > 0) {
    const er = (avgV / subs) * 100;
    s2 = er >= 7 ? 30 : er >= 3 ? 25 : er >= 1 ? 15 : er >= 0.3 ? 8 : 3;
    const erStr = er.toFixed(2);
    if (s2 === 30) r2 = `참여율 ${erStr}% — 매우 높은 시청 유지율. 강한 팬덤이 형성되어 있습니다.`;
    else if (s2 === 25) r2 = `참여율 ${erStr}% — 높은 참여율. 독자 전환 가능성이 큽니다.`;
    else if (s2 === 15) r2 = `참여율 ${erStr}% — 평균 수준. 콘텐츠 주제와 도서의 연관성이 중요합니다.`;
    else if (s2 === 8)  r2 = `참여율 ${erStr}% — 낮은 편. 영상 홍보 의존도가 높을 수 있습니다.`;
    else               r2 = `참여율 ${erStr}% — 매우 낮음. 구독자 활성도 확인이 필요합니다.`;
  } else {
    r2 = '참여율 측정 불가 — 영상 데이터 또는 구독자 정보가 부족합니다.';
  }

  // 3. 업로드 일관성 (20점)
  let s3 = 0;
  const pub = channel.snippet.publishedAt;
  let r3;
  if (pub && vCount > 0) {
    const months = Math.max((Date.now() - new Date(pub)) / (1000 * 60 * 60 * 24 * 30), 1);
    const vpm = vCount / months;
    s3 = vpm >= 8 ? 20 : vpm >= 4 ? 16 : vpm >= 2 ? 12 : vpm >= 0.5 ? 8 : 3;
    const vpmStr = vpm.toFixed(1);
    if (s3 === 20) r3 = `월 ${vpmStr}회 업로드 — 매우 활발. 집필 병행 시 속도 조절 협의 필요합니다.`;
    else if (s3 === 16) r3 = `월 ${vpmStr}회 업로드 — 안정적인 주기. 집필 병행에 유리합니다.`;
    else if (s3 === 12) r3 = `월 ${vpmStr}회 업로드 — 꾸준한 업로드. 무난한 집필 병행이 예상됩니다.`;
    else if (s3 === 8)  r3 = `월 ${vpmStr}회 업로드 — 빈도가 낮습니다. 채널 활성도를 확인하세요.`;
    else               r3 = `월 ${vpmStr}회 업로드 — 거의 활동이 없습니다. 채널 상태를 점검하세요.`;
  } else {
    r3 = '업로드 이력 데이터가 부족합니다.';
  }

  // 4. 콘텐츠 반응 (20점) — 좋아요+댓글×5 / 조회수
  let s4 = 10; // 영상 없으면 중간값
  let r4;
  if (videos.length > 0) {
    const totV = videos.reduce((a, v) => a + parseInt(v.statistics?.viewCount   || 0), 0);
    const totL = videos.reduce((a, v) => a + parseInt(v.statistics?.likeCount   || 0), 0);
    const totC = videos.reduce((a, v) => a + parseInt(v.statistics?.commentCount || 0), 0);
    if (totV > 0) {
      const combined = ((totL + totC * 5) / totV) * 100;
      s4 = combined >= 15 ? 20 : combined >= 8 ? 16 : combined >= 4 ? 12 : combined >= 1 ? 8 : 3;
      const crStr = combined.toFixed(1);
      if (s4 === 20) r4 = `콘텐츠 반응률 ${crStr}% — 열정적인 커뮤니티. 독자 참여형 도서 기획에 적합합니다.`;
      else if (s4 === 16) r4 = `콘텐츠 반응률 ${crStr}% — 높은 반응. 팬과의 관계가 밀접합니다.`;
      else if (s4 === 12) r4 = `콘텐츠 반응률 ${crStr}% — 양호한 반응입니다.`;
      else if (s4 === 8)  r4 = `콘텐츠 반응률 ${crStr}% — 평균 수준입니다.`;
      else               r4 = `콘텐츠 반응률 ${crStr}% — 좋아요·댓글 문화가 약한 채널일 수 있습니다.`;
    } else {
      r4 = '영상 반응 데이터가 없습니다.';
    }
  } else {
    r4 = '최근 영상 데이터로 반응을 측정할 수 없습니다. (s4 기본값 적용)';
  }

  const total = s1 + s2 + s3 + s4;
  let summary;
  if (total >= 80) summary = '출판 계약을 적극 검토할 수 있는 채널입니다. 팬베이스와 참여율 모두 출판 성공 요소를 갖추고 있습니다.';
  else if (total >= 60) summary = '출판에 적합한 채널입니다. 콘텐츠 전문성과 독자층 전환 가능성을 추가로 확인하면 좋습니다.';
  else if (total >= 40) summary = '가능성은 있으나 보완이 필요합니다. 구독자 성장 추이 또는 참여율 개선 여부를 확인하세요.';
  else summary = '현 시점에서는 출판 리스크가 높습니다. 채널 성장 후 재검토를 권장합니다.';

  return { total, s1, s2, s3, s4, avgV: Math.round(avgV), r1, r2, r3, r4, summary };
}

// ═══════════════════════════════════════════════════════════════
// Panel 0 — 채널 검색
// ═══════════════════════════════════════════════════════════════
async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;

  const btn = document.getElementById('searchBtn');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  const resEl = document.getElementById('searchResults');
  resEl.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>검색 중…</p></div>';

  try {
    // URL/핸들/채널ID → 바로 분석
    const isSpecific = q.startsWith('http') || q.startsWith('@') || /^UC[\w-]{22}$/.test(q);
    if (isSpecific) {
      const ch = await resolveInput(q);
      if (ch) { resEl.innerHTML = ''; await analyzeChannel(ch); return; }
    }

    // 두 가지 검색을 병렬 실행:
    // (1) 영상 검색(type:video) → 해당 키워드 영상을 만든 채널 수집 (콘텐츠 관련성)
    // (2) 채널 직접 검색(type:channel) → 채널명/설명에 키워드 있는 채널 수집 (이름 정확도)
    resEl.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>관련 채널 탐색 중…</p></div>';

    YT_S.lastSearchQuery = q;  // relevanceScore()에서 키워드 매칭에 사용
    const HANGUL = /[가-힣]/;
    const videoCountMap  = {};        // 채널별 영상 검색 등장 횟수
    const directMatchIds = new Set(); // 채널 직접 검색에서 찾힌 채널 ID
    const krRegionCids   = new Set(); // 한국어 콘텐츠 채널

    // ── (1) 영상 검색 (최대 4페이지) ───────────────────────────────
    let pageToken = null;
    for (let p = 0; p < 4; p++) {
      const params = { part: 'snippet', type: 'video', q, maxResults: 50, regionCode: 'KR', relevanceLanguage: 'ko' };
      if (pageToken) params.pageToken = pageToken;
      const data = await ytFetch('/search', params);
      if (!data.items?.length) break;
      (data.items || []).forEach(v => {
        const cid = v.snippet?.channelId;
        if (!cid) return;
        videoCountMap[cid] = (videoCountMap[cid] || 0) + 1;
        if (HANGUL.test(v.snippet?.title || '') || HANGUL.test(v.snippet?.channelTitle || ''))
          krRegionCids.add(cid);
      });
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    // ── (2) 채널 직접 검색 (type:channel) — 병렬로 이미 실행 가능 ──
    // 채널명·설명에 키워드가 명확히 있는 채널 발굴 → 정확도 보너스 부여
    try {
      const chDirect = await ytFetch('/search', {
        part: 'snippet', type: 'channel', q,
        maxResults: 50, regionCode: 'KR', relevanceLanguage: 'ko'
      });
      (chDirect.items || []).forEach(item => {
        const cid = item.id?.channelId || item.snippet?.channelId;
        if (!cid) return;
        directMatchIds.add(cid);
        // 직접 검색에서 나온 채널도 videoCountMap에 등록 (없으면 0으로라도)
        if (!(cid in videoCountMap)) videoCountMap[cid] = 0;
        if (HANGUL.test(item.snippet?.title || '') || HANGUL.test(item.snippet?.description || ''))
          krRegionCids.add(cid);
      });
    } catch (_) { /* 직접 검색 실패해도 영상 검색 결과로 진행 */ }

    const cids = Object.keys(videoCountMap);
    if (!cids.length) {
      resEl.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>검색 결과가 없습니다</p></div>';
      return;
    }

    // 채널 통계 조회 (contentDetails 포함 → 분석 클릭 시 재조회 불필요)
    resEl.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>채널 정보 불러오는 중…</p></div>';
    const statsRes = await fetchChannelStatsBatch(cids, 'snippet,statistics,contentDetails');
    statsRes.items.forEach(ch => { YT_S.enrichedChannels[ch.id] = ch; });

    if (!statsRes.items?.length) {
      resEl.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>채널 정보를 가져올 수 없습니다</p></div>';
      return;
    }

    const qLow = q.toLowerCase();

    YT_S.searchResults = statsRes.items.map((ch, idx) => {
      const sn      = ch.snippet || {};
      const title   = (sn.title || '').toLowerCase();
      const desc    = (sn.description || '').toLowerCase();
      const country = sn.country || '';
      const isKorean = HANGUL.test(sn.title || '')
                    || HANGUL.test(sn.description || '')
                    || krRegionCids.has(ch.id)
                    || country === 'KR';
      const subs  = parseInt(ch.statistics?.subscriberCount || 0);
      const views = parseInt(ch.statistics?.viewCount || 0);
      return {
        id:            { channelId: ch.id },
        snippet:       sn,
        _cid:          ch.id,
        _stats:        ch.statistics || {},
        _country:      country || (isKorean ? 'KR' : ''),
        _origIdx:      idx,
        _nameMatch:    title.includes(qLow),
        _descMatch:    desc.includes(qLow),
        _directMatch:  directMatchIds.has(ch.id),  // 채널 직접 검색 매칭 여부
        _videoCount:   videoCountMap[ch.id] || 0,
        _subs:         subs,
        _views:        views,
        _isKorean:     isKorean,
        _contentMatch: true
      };
    });
    YT_S.searchResults = YT_S.searchResults.slice(0, 40);
    YT_S.sortBy = 'relevance';
    renderSortedResults();
  } catch (e) {
    resEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${escHtml(e.message)}</p></div>`;
  } finally {
    btn.innerHTML = '검색';
    btn.disabled = false;
  }
}

// 한국 채널 70% 보장: 정렬 결과를 KR/non-KR로 분리 후 7:3 비율로 인터리브
// ── 출판 적합도 분류 ──
// tier 1=출판 적합, 2=가능성 있음, 3=추가 검토 필요
function calcPublishTier(isKorean, subs, avgV, vidCount, contentMatch) {
  const hasAudience = subs >= 50000 || avgV >= 100000;
  const hasContent  = contentMatch || vidCount >= 3;
  if (hasAudience && hasContent) return 1;
  const minAudience = subs >= 10000 || avgV >= 20000;
  const minContent  = contentMatch || vidCount >= 1;
  if (minAudience && minContent) return 2;
  return 3;
}

function applyKoreanBias(items, ratio = 0.7) {
  const kr    = items.filter(i => i._isKorean);
  const other = items.filter(i => !i._isKorean);
  // 한쪽이 비어있으면 재배열 불필요
  if (!kr.length || !other.length) return items;

  const result = [];
  let ki = 0, oi = 0;
  for (let i = 0; i < items.length; i++) {
    const placed   = result.length;
    const krPlaced = result.filter(x => x._isKorean).length;
    // 현재 KR 비율이 목표보다 낮거나 해외 채널이 소진됐으면 KR 배치
    const curRatio = placed > 0 ? krPlaced / placed : 0;
    if (ki < kr.length && (curRatio < ratio || oi >= other.length)) {
      result.push(kr[ki++]);
    } else if (oi < other.length) {
      result.push(other[oi++]);
    } else {
      result.push(kr[ki++]);
    }
  }
  return result;
}

// 정확도 점수: 채널명/설명 키워드 매칭 + 직접 채널 검색 매칭 + 관련 영상 등장 + 규모 보너스
function relevanceScore(item) {
  const q = (YT_S.lastSearchQuery || '').toLowerCase();
  const keywords = q.split(/\s+/).filter(Boolean);
  const title = (item.snippet?.title || '').toLowerCase();
  const desc  = (item.snippet?.description || '').toLowerCase();

  // 채널명 키워드 매칭 — 가장 강한 신호 (검색어가 채널 정체성)
  let nameScore = 0;
  keywords.forEach(kw => { if (title.includes(kw)) nameScore += 80; });
  if (title.includes(q)) nameScore += 60;    // 완전 쿼리 포함 추가 보너스

  // 채널 설명 키워드 매칭
  let descScore = 0;
  keywords.forEach(kw => { if (desc.includes(kw)) descScore += 20; });
  if (desc.includes(q)) descScore += 15;

  // 채널 직접 검색 매칭 (type:channel 로 찾힌 채널) — 강한 관련성 신호
  const directBonus = item._directMatch ? 150 : 0;

  const subs  = item._subs  || parseInt(item._stats?.subscriberCount  || 0);
  const views = item._views || parseInt(item._stats?.viewCount || 0);
  const subBonus  = subs  >= 1000000 ? 30 : subs  >= 100000 ? 15 : subs  >= 10000 ? 8 : subs  >= 1000 ? 3 : 0;
  const viewBonus = views >= 500000000 ? 20 : views >= 50000000 ? 12 : views >= 5000000 ? 6 : views >= 500000 ? 3 : 0;
  return directBonus + nameScore + descScore + (item._videoCount * 5) + subBonus + viewBonus;
}

function setSort(key) {
  YT_S.sortBy = key;
  renderSortedResults();
}

function renderSortedResults() {
  let sorted = [...YT_S.searchResults];
  if (YT_S.sortBy === 'relevance') {
    sorted.sort((a, b) => {
      const diff = relevanceScore(b) - relevanceScore(a);
      return diff !== 0 ? diff : a._origIdx - b._origIdx;
    });
  } else if (YT_S.sortBy === 'subscribers') {
    sorted.sort((a, b) => parseInt(b._stats.subscriberCount || 0) - parseInt(a._stats.subscriberCount || 0));
  } else if (YT_S.sortBy === 'views') {
    sorted.sort((a, b) => parseInt(b._stats.viewCount || 0) - parseInt(a._stats.viewCount || 0));
  }
  // 한국 채널만 표시 (국가 KR | 제목 한글 | 설명 한글 OR 조건)
  renderSearchResults(sorted.filter(i => i._isKorean));
}

function renderSearchResults(items) {
  const el = document.getElementById('searchResults');
  const SORT_OPTIONS = [
    { key: 'relevance',  label: '정확도' },
    { key: 'subscribers',label: '구독자 수 ↓' },
    { key: 'views',      label: '총 조회수 ↓' }
  ];

  el.innerHTML = `
    <div class="sort-bar">
      <span class="sort-label">정렬</span>
      ${SORT_OPTIONS.map(o => `
        <button class="sort-btn ${YT_S.sortBy === o.key ? 'active' : ''}"
                onclick="setSort('${o.key}')">${escHtml(o.label)}</button>
      `).join('')}
      <span class="sort-count">${items.length}개 채널</span>
    </div>
    <div class="channel-grid">
      ${items.map(item => {
        const sn    = item.snippet;
        const cid   = item._cid || item.id.channelId || item.id;
        const thumb = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '';
        const subs  = parseInt(item._stats?.subscriberCount || 0);
        const views = parseInt(item._stats?.viewCount || 0);
        const country    = item._country || '';
        const hidden     = item._stats?.hiddenSubscriberCount;
        const nameMatch    = item._nameMatch;
        const videoCount   = item._videoCount || 0;
        const contentMatch = item._contentMatch;
        return `
          <div class="card channel-card ${item._isKorean ? 'kr-highlight' : ''}">
            <div class="channel-card-top">
              ${thumb
                ? `<img class="ch-thumb" src="${escHtml(thumb)}" alt="">`
                : `<div class="ch-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;background:var(--bg)">📺</div>`}
              <div style="min-width:0">
                <div class="ch-name">${escHtml(sn.title)}</div>
                <div class="ch-country">🇰🇷 한국</div>
              </div>
            </div>
            ${(item._directMatch || videoCount > 0) ? `
            <div class="ch-match-badges">
              ${item._directMatch ? `<span class="match-badge" style="background:#EEF2FF;color:#3B3F8C;border:1px solid #C7D2FE;">🎯 채널명 일치</span>` : ''}
              ${videoCount > 0 ? `<span class="match-badge match-video">관련 영상 ${videoCount}개</span>` : ''}
            </div>` : ''}
            <div class="ch-stat-row">
              <div class="ch-stat-item">
                <span class="ch-stat-lbl">구독자</span>
                <span class="ch-stat-val">${hidden ? '비공개' : fmtNum(subs)}</span>
              </div>
              <div class="ch-stat-item">
                <span class="ch-stat-lbl">총 조회수</span>
                <span class="ch-stat-val">${views ? fmtNum(views) : '-'}</span>
              </div>
            </div>
            <div class="ch-desc">${escHtml(sn.description || '채널 설명 없음')}</div>
            <button class="btn btn-primary btn-sm" onclick="analyzeChannelById('${escHtml(cid)}')">
              📊 분석하기
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// Panel 5 — 슈퍼 루키
// ═══════════════════════════════════════════════════════════════
async function searchRookie() {
  const q = document.getElementById('rookieInput').value.trim();
  if (!q) return;

  const btn = document.getElementById('rookieBtn');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  const el = document.getElementById('rookieContent');
  el.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>최근 급성장 채널 탐색 중…</p></div>';

  try {
    const HANGUL_RK = /[가-힣]/;
    const videoCountMap = {};       // channelId → 관련 영상 수
    const rookieKrVideoChannelIds = new Set();
    const now = Date.now();

    // ── Phase 1: 최근 1년 이내 영상, 날짜순 ──────────────────────
    // 최근에 활발히 업로드 중인 채널을 발굴
    const oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
    let pageToken = null;
    for (let p = 0; p < 3; p++) {
      const params = {
        part: 'snippet', type: 'video', q,
        order: 'date',              // 최신 업로드순 — 최근 활동 채널
        publishedAfter: oneYearAgo, // 최근 1년 이내 영상만
        maxResults: 50, regionCode: 'KR', relevanceLanguage: 'ko'
      };
      if (pageToken) params.pageToken = pageToken;
      const data = await ytFetch('/search', params);
      if (!data.items?.length) break;
      (data.items || []).forEach(v => {
        const cid = v.snippet?.channelId;
        if (!cid) return;
        videoCountMap[cid] = (videoCountMap[cid] || 0) + 1;
        if (HANGUL_RK.test(v.snippet?.title || '') || HANGUL_RK.test(v.snippet?.channelTitle || ''))
          rookieKrVideoChannelIds.add(cid);
      });
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    // ── Phase 2: 최근 6개월 이내 영상, 조회수순 ──────────────────
    // 최근에 갑자기 폭발한 영상을 만든 채널 발굴
    const sixMonthsAgo = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString();
    pageToken = null;
    for (let p = 0; p < 2; p++) {
      const params = {
        part: 'snippet', type: 'video', q,
        order: 'viewCount',           // 조회수순 — 최근 바이럴
        publishedAfter: sixMonthsAgo, // 6개월 이내 영상만
        maxResults: 50, regionCode: 'KR', relevanceLanguage: 'ko'
      };
      if (pageToken) params.pageToken = pageToken;
      const data = await ytFetch('/search', params);
      if (!data.items?.length) break;
      (data.items || []).forEach(v => {
        const cid = v.snippet?.channelId;
        if (!cid) return;
        videoCountMap[cid] = (videoCountMap[cid] || 0) + 1;
        if (HANGUL_RK.test(v.snippet?.title || '') || HANGUL_RK.test(v.snippet?.channelTitle || ''))
          rookieKrVideoChannelIds.add(cid);
      });
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    const contentMatchRookieIds = new Set(Object.keys(videoCountMap));
    const cids = [...contentMatchRookieIds];

    if (!cids.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>검색 결과가 없습니다</p></div>';
      return;
    }

    // 채널 통계 배치 조회
    const statsRes = await fetchChannelStatsBatch(cids, 'snippet,statistics');
    if (!statsRes.items?.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>채널 정보를 가져올 수 없습니다</p></div>';
      return;
    }

    // ── 급성장 지수 계산 ──────────────────────────────────────────
    // 루키 조건: 구독자 1,000~30만 AND 채널 개설 4년 이하
    // 급성장 지수 = (총조회수/구독자) × 채널나이 가중치 × log(관련영상+2)
    // → 구독자 대비 조회수가 높고 + 최근에 개설된 채널일수록 높은 점수
    const scored = statsRes.items.map(ch => {
      const st     = ch.statistics || {};
      const sn     = ch.snippet || {};
      const subs   = parseInt(st.subscriberCount || 0);
      const vCount = parseInt(st.videoCount || 0);
      const tViews = parseInt(st.viewCount || 0);
      const vidCount = videoCountMap[ch.id] || 0;

      // 구독자 범위 필터: 루키 = 1,000 ~ 300,000
      if (subs < 1000 || subs > 300000) return null;

      // 채널 나이 계산 (publishedAt 기준)
      const publishedAt = sn.publishedAt ? new Date(sn.publishedAt) : null;
      const channelAgeYears = publishedAt
        ? (now - publishedAt.getTime()) / (365 * 24 * 60 * 60 * 1000)
        : 99;

      // 채널 나이 필터: 4년 이하만 (2022년 이후 개설)
      if (channelAgeYears > 4) return null;

      // 채널 나이 가중치: 최근일수록 급성장 가능성 높음
      const ageBonus = channelAgeYears < 1 ? 4.0
                     : channelAgeYears < 2 ? 2.5
                     : channelAgeYears < 3 ? 1.5
                     : 1.0;

      const avgV = vCount > 0 ? Math.round(tViews / vCount) : 0;
      // 총조회수/구독자 = 구독자 1명당 누적 조회수 (높을수록 바이럴형)
      const viewsPerSub = subs > 0 ? tViews / subs : 0;
      const rookieScore = Math.round(viewsPerSub * ageBonus * Math.log2(vidCount + 2) * 10);

      const country  = sn.country || '';
      const isKorean = HANGUL_RK.test(sn.title || '')
                    || HANGUL_RK.test(sn.description || '')
                    || rookieKrVideoChannelIds.has(ch.id)
                    || country === 'KR';

      const publishTier = calcPublishTier(isKorean, subs, avgV, vidCount, contentMatchRookieIds.has(ch.id));

      return {
        ch, subs, avgV, vidCount, rookieScore,
        totalViews: tViews,
        channelAgeYears,
        publishedAt,
        publishTier,
        _isKorean: isKorean,
        _country:  country || (isKorean ? 'KR' : ''),
        _contentMatch: contentMatchRookieIds.has(ch.id)
      };
    }).filter(r => r !== null && r.rookieScore > 0 && r._isKorean)
      .sort((a, b) => b.rookieScore - a.rookieScore);

    if (!scored.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>조건에 맞는 급성장 채널을 찾지 못했습니다.<br><small>구독자 1천~30만, 개설 4년 이하 한국 채널 기준</small></p></div>';
      document.getElementById('rookieSortBar').style.display = 'none';
      return;
    }

    YT_S.rookieResults = scored;
    YT_S.rookieSortMode = 'publish';
    document.getElementById('rookieSortBar').style.display = 'flex';
    document.getElementById('rookieSortCount').textContent = scored.length + '개 채널';
    document.querySelectorAll('#rookieSortBar .sort-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.sort === 'publish'));
    renderRookieSorted(YT_S.rookieResults);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${escHtml(e.message)}</p></div>`;
  } finally {
    btn.innerHTML = '🚀 탐색';
    btn.disabled = false;
  }
}

// ── 루키 정렬 ──
function applyRookieSort(mode) {
  YT_S.rookieSortMode = mode;
  document.querySelectorAll('#rookieSortBar .sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === mode));
  renderRookieSorted(YT_S.rookieResults);
}

function renderRookieSorted(items) {
  if (!items || !items.length) return;

  let sorted = [...items];
  if (YT_S.rookieSortMode === 'publish') {
    // 출판 적합순: 티어 오름차순(1→2→3), 같은 티어 내 급성장 지수 내림차순
    sorted.sort((a, b) => (a.publishTier - b.publishTier) || (b.rookieScore - a.rookieScore));
  } else if (YT_S.rookieSortMode === 'score') {
    sorted.sort((a, b) => b.rookieScore - a.rookieScore);
  } else if (YT_S.rookieSortMode === 'subs') {
    sorted.sort((a, b) => b.subs - a.subs);
  }

  const maxScore = Math.max(...sorted.map(r => r.rookieScore), 1);
  const q = document.getElementById('rookieInput').value.trim();
  const el = document.getElementById('rookieContent');

  el.innerHTML = `
    <div class="rookie-info-bar">
      <span>🔍 <strong>${escHtml(q)}</strong> 키워드 · ${sorted.length}개 채널 <small style="opacity:.6;font-size:11px;">(구독자 1천~30만 · 개설 4년 이하 한국 채널)</small></span>
    </div>
    <div class="rookie-grid">
      ${sorted.map((item, i) => {
        const { ch, subs, avgV, vidCount, rookieScore, publishTier, channelAgeYears, publishedAt, _isKorean } = item;
        const sn    = ch.snippet || {};
        const thumb = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '';
        const pct   = Math.min(Math.round(rookieScore / maxScore * 100), 100);
        // 채널 나이 표시
        const ageLabel = channelAgeYears < 1
          ? `${Math.round(channelAgeYears * 12)}개월`
          : `${channelAgeYears.toFixed(1)}년`;
        const ageColor = channelAgeYears < 1 ? '#E74C3C'
                       : channelAgeYears < 2 ? '#E67E22'
                       : channelAgeYears < 3 ? '#F1C40F'
                       : '#95A5A6';
        const ageBadge = publishedAt
          ? `<span style="font-size:10px;font-weight:700;color:${ageColor};background:${ageColor}18;border-radius:4px;padding:1px 5px;">🆕 개설 ${ageLabel}</span>`
          : '';
        return `
          <div class="rookie-card ${_isKorean ? 'kr-highlight' : ''}" onclick="analyzeChannelById('${escHtml(ch.id)}')">
            <div class="rookie-rank">#${i + 1}</div>
            ${thumb
              ? `<img class="rookie-thumb" src="${escHtml(thumb)}" alt="">`
              : `<div class="rookie-thumb rookie-thumb-empty">📺</div>`}
            <div class="rookie-info">
              <div class="rookie-name">${escHtml(sn.title || '')}</div>
              <div class="rookie-meta">
                <span>구독자 ${subs > 0 ? fmtNum(subs) : '비공개'}</span>
                <span>평균 조회 ${fmtNum(avgV)}</span>
                <span class="kr-badge">🇰🇷 한국</span>
                ${ageBadge}
              </div>
              <div class="rookie-score-row">
                <span class="rookie-label">급성장 지수</span>
                <div class="rookie-bar-wrap">
                  <div class="rookie-bar">
                    <div class="rookie-bar-fill" style="width:${pct}%;background:${scoreColor(pct)}"></div>
                  </div>
                  <span class="rookie-score-num">${rookieScore.toLocaleString()}</span>
                </div>
              </div>
              ${vidCount > 0 ? `<span class="match-video">관련 최신영상 ${vidCount}개</span>` : ''}
              <span class="tag publish-tier-${publishTier}">${['','📗 출판 적합','📘 가능성 있음','🔍 추가 검토'][publishTier]}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// Panel 1 — 채널 분석
// ═══════════════════════════════════════════════════════════════
async function analyzeChannelById(cid) {
  document.getElementById('channelAnalysis').innerHTML =
    '<div class="loading-box"><div class="spinner"></div><p>채널 정보 불러오는 중…</p></div>';
  ytSwitchPanel(1);
  try {
    // 검색 결과 배치 조회 시 이미 contentDetails 포함하여 저장된 경우 → API 재호출 불필요
    const cached = YT_S.enrichedChannels[cid];
    if (cached?.contentDetails) {
      await analyzeChannel(cached);
      return;
    }
    const data = await apiGetChannelById(cid);
    if (!data.items?.length) throw new Error('채널을 찾을 수 없습니다');
    await analyzeChannel(data.items[0]);
  } catch (e) {
    document.getElementById('channelAnalysis').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${escHtml(e.message)}</p></div>`;
  }
}

async function analyzeChannel(channel) {
  ytSwitchPanel(1);
  document.getElementById('channelAnalysis').innerHTML =
    '<div class="loading-box"><div class="spinner"></div><p>영상 데이터 수집 중…</p></div>';

  YT_S.channel = channel;
  YT_S.videos  = [];

  try {
    const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (uploadsId) {
      const pl = await apiGetPlaylistItems(uploadsId, 20);
      const vids = (pl.items || []).map(i => i.contentDetails?.videoId).filter(Boolean);
      if (vids.length) {
        const vData = await apiGetVideoStats(vids);
        // 재생목록 snippet (title, thumbnail, publishedAt) 매핑
        const snMap = {};
        (pl.items || []).forEach(i => {
          if (i.contentDetails?.videoId) snMap[i.contentDetails.videoId] = i.snippet;
        });
        YT_S.videos = (vData.items || []).map(v => ({ ...v, _sn: snMap[v.id] }));
      }
    }

    const score = calcScore(channel, YT_S.videos);
    renderChannelAnalysis(channel, score);
    renderVideoList(channel, YT_S.videos);
    loadSimilarChannels(channel);
  } catch (e) {
    document.getElementById('channelAnalysis').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${escHtml(e.message)}</p></div>`;
  }
}

// 비슷한 채널 검색 & 랭킹 렌더
async function loadSimilarChannels(channel) {
  const el = document.getElementById('similarChannels');
  if (!el || !channel) return;

  el.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>비슷한 채널 탐색 중…</p></div>';

  const HANGUL_RE = /[가-힣]/;
  const STOP_KO   = new Set(['이','가','은','는','을','를','의','에','도','와','과','로','으로','에서','하는','있는','하고','그리고','하여','위한','대한','관한','없는','같은','통해','더','많은','새로운','좋은','이번','지금','바로','한번','정말','너무','모든','다른','어떻게','왜','뭐','무엇','어떤','이런','저런']);
  const STOP_EN   = new Set(['the','a','an','in','on','at','to','for','of','and','or','is','are','was','were','be','been','have','has','with','this','that','how','what','why','when','from','by','as','it','its','not','no','so','but','if','than','then','about']);

  // ── 키워드 추출: 현재 채널 영상 제목에서 주제어 뽑기 ──
  // YT_S.videos가 있으면 실제 영상 제목 활용, 없으면 채널 description 활용
  let keywords = '';
  const videos = YT_S.videos || [];
  if (videos.length > 0) {
    const freq = {};
    videos.slice(0, 30).forEach(v => {
      const t = (v.snippet?.title || v._sn?.title || '').replace(/[^\w\s가-힣]/g, ' ');
      t.split(/\s+/).forEach(w => {
        if (w.length < 2) return;
        const wl = w.toLowerCase();
        if (STOP_KO.has(w) || STOP_EN.has(wl)) return;
        freq[wl] = (freq[wl] || 0) + 1;
      });
    });
    keywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w)
      .join(' ');
  }
  // 영상 없거나 키워드 추출 실패 → 채널 description에서 시도
  if (!keywords) {
    const desc = channel.snippet?.description || '';
    keywords = desc.replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_KO.has(w) && !STOP_EN.has(w.toLowerCase()))
      .slice(0, 3)
      .join(' ')
      .trim();
  }
  if (!keywords) { el.innerHTML = ''; return; }

  try {
    // 주제 키워드로 영상 검색 → 같은 주제 영상을 올리는 채널 수집
    const videoRes = await ytFetch('/search', {
      part: 'snippet', type: 'video', q: keywords,
      maxResults: 50, regionCode: 'KR', relevanceLanguage: 'ko'
    });

    if (!videoRes.items?.length) { el.innerHTML = ''; return; }

    // 채널별 등장 횟수 + 한국 채널 판정
    const videoCountMap = {};
    const krVideoChannelIds = new Set();
    videoRes.items.forEach(v => {
      const cid    = v.snippet?.channelId;
      const vTitle = v.snippet?.title || '';
      const chName = v.snippet?.channelTitle || '';
      if (!cid || cid === channel.id) return;  // 자기 자신 제외
      videoCountMap[cid] = (videoCountMap[cid] || 0) + 1;
      if (HANGUL_RE.test(vTitle) || HANGUL_RE.test(chName)) krVideoChannelIds.add(cid);
    });

    // 등장 횟수 1회 이상인 채널만 (완전 무관한 채널 제거)
    const candidateCids = Object.keys(videoCountMap).filter(id => videoCountMap[id] >= 1);
    if (!candidateCids.length) { el.innerHTML = ''; return; }

    // 채널 통계 + 업로드 플레이리스트 ID 일괄 조회
    const statsData = await ytFetch('/channels', {
      part: 'snippet,statistics,contentDetails',
      id: candidateCids.slice(0, 50).join(',')
    });

    // 점수: 등장 횟수(주요) + 구독자 규모 보너스 (pubScore는 영상 조회 후 설정)
    const ranked = (statsData.items || []).map(ch => {
      const st   = ch.statistics || {};
      const sn   = ch.snippet || {};
      const subs = parseInt(st.subscriberCount || 0);
      const country = sn.country || '';
      const vc   = videoCountMap[ch.id] || 0;

      const isKorean = HANGUL_RE.test(sn.title || '')
        || HANGUL_RE.test(sn.description || '')
        || krVideoChannelIds.has(ch.id)
        || country === 'KR';

      const subBonus = subs >= 1000000 ? 20 : subs >= 100000 ? 15 : subs >= 10000 ? 10 : subs >= 1000 ? 5 : 0;
      const score = Math.min(vc * 10 + subBonus, 100);

      return { ch, score, pubScore: null, subs, videoCount: vc, hiddenSubs: !!st.hiddenSubscriberCount, _isKorean: isKorean };
    }).sort((a, b) => b.score - a.score);

    // 한국 채널만 필터 후 상위 15개 선정
    const biasedPre = ranked
      .filter(i => i._isKorean)
      .sort((a, b) => b.videoCount - a.videoCount || b.score - a.score)
      .slice(0, 15);

    // 상위 15개 채널의 최근 영상 5개씩 조회하여 pubScore 계산 (상세 분석과 동일 기준)
    await Promise.all(biasedPre.map(async item => {
      try {
        const uploadsId = item.ch.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsId) { item.pubScore = calcScore(item.ch, []).total; return; }
        const pl = await ytFetch('/playlistItems', { part: 'contentDetails', playlistId: uploadsId, maxResults: 5 });
        const vids = (pl.items || []).map(i => i.contentDetails?.videoId).filter(Boolean);
        if (!vids.length) { item.pubScore = calcScore(item.ch, []).total; return; }
        const vStats = await ytFetch('/videos', { part: 'statistics', id: vids.join(',') });
        item.pubScore = calcScore(item.ch, vStats.items || []).total;
      } catch (_) {
        item.pubScore = calcScore(item.ch, []).total;
      }
    }));

    const biased = biasedPre;

    if (!biased.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="card" style="margin-bottom:18px">
        <div class="section-label" style="margin-bottom:14px">📡 비슷한 채널 랭킹</div>
        <div class="similar-list">
          ${biased.map((item, i) => {
            const { ch, score, pubScore, subs, videoCount, hiddenSubs, _isKorean } = item;
            const sn = ch.snippet || {};
            const thumb = sn.thumbnails?.default?.url || '';
            const ps = pubScore != null ? pubScore : score;
            const [tagCls, tagLbl] = scoreTag(ps);
            return `
              <div class="similar-row" onclick="analyzeChannelById('${escHtml(ch.id)}')" title="분석하기">
                <div class="sim-rank" style="color:${scoreColor(ps)}">${i + 1}</div>
                ${thumb
                  ? `<img class="sim-thumb" src="${escHtml(thumb)}" alt="">`
                  : `<div class="sim-thumb sim-thumb-empty">📺</div>`}
                <div class="sim-info">
                  <div class="sim-name">${escHtml(sn.title || '')}</div>
                  <div class="sim-meta">
                    <span>구독자 ${hiddenSubs ? '비공개' : fmtNum(subs)}</span>
                    ${videoCount > 0 ? `<span class="match-video">관련 영상 ${videoCount}개</span>` : ''}
                    <span class="kr-badge">🇰🇷 한국</span>
                  </div>
                </div>
                <div class="sim-score-wrap">
                  <div class="sim-score-bar">
                    <div class="sim-score-fill" style="width:${ps}%;background:${scoreColor(ps)}"></div>
                  </div>
                  <span class="sim-score-num" style="color:${scoreColor(ps)}">${ps}점</span>
                  <span class="tag ${tagCls}">${tagLbl}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    // 비슷한 채널 로드 실패는 조용히 무시 (메인 분석에 영향 없음)
    el.innerHTML = '';
  }
}

function renderChannelAnalysis(ch, score) {
  const el  = document.getElementById('channelAnalysis');
  const st  = ch.statistics;
  const sn  = ch.snippet;
  const thumb = sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '';
  const subs  = parseInt(st.subscriberCount || 0);
  const tvs   = parseInt(st.viewCount || 0);
  const vcnt  = parseInt(st.videoCount || 0);
  const isSaved   = YT_S.savedChannels.some(c => c.id === ch.id);
  const isCompare = YT_S.compareList.some(c => c.id === ch.id);
  const [tagCls, tagLbl] = scoreTag(score.total);

  // 업로드 주기
  let vpm = '-';
  if (sn.publishedAt && vcnt > 0) {
    const months = Math.max((Date.now() - new Date(sn.publishedAt)) / (1000*60*60*24*30), 1);
    vpm = (vcnt / months).toFixed(1) + '회/월';
  }

  // 참여율
  const er = subs > 0 && score.avgV > 0
    ? ((score.avgV / subs) * 100).toFixed(2) + '%'
    : '-';

  destroyChart('analysis');

  el.innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <div class="ch-header">
        ${thumb
          ? `<img src="${escHtml(thumb)}" alt="">`
          : `<div style="width:68px;height:68px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">📺</div>`}
        <div class="ch-info">
          <h2>${escHtml(sn.title)}</h2>
          <p>${escHtml((sn.description || '').slice(0, 120))}${(sn.description || '').length > 120 ? '…' : ''}</p>
          <div class="info-chips">
            <span class="info-chip">개설 <strong>${fmtDate(sn.publishedAt)}</strong></span>
            ${sn.country ? `<span class="info-chip">국가 <strong>${escHtml(sn.country)}</strong></span>` : ''}
          </div>
        </div>
        <div class="ch-actions">
          <button id="saveBtn" class="btn btn-secondary btn-sm" onclick="toggleSave()">
            ${isSaved ? '✅ 저장됨' : '⭐ 저장'}
          </button>
          <button id="compareBtn" class="btn btn-secondary btn-sm" onclick="toggleCompare()">
            ${isCompare ? '✅ 비교중' : '⚖️ 비교 추가'}
          </button>
          <a href="https://youtube.com/channel/${escHtml(ch.id)}" target="_blank" rel="noopener"
             class="btn btn-secondary btn-sm">🔗 채널 열기</a>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="card stat-card">
        <div class="lbl">구독자</div>
        <div class="val">${st.hiddenSubscriberCount ? '비공개' : fmtNum(subs)}</div>
        <div class="sub">${st.hiddenSubscriberCount ? '' : subs.toLocaleString() + '명'}</div>
      </div>
      <div class="card stat-card">
        <div class="lbl">총 조회수</div>
        <div class="val">${fmtNum(tvs)}</div>
        <div class="sub">${tvs.toLocaleString()}회</div>
      </div>
      <div class="card stat-card">
        <div class="lbl">영상 수</div>
        <div class="val">${vcnt.toLocaleString()}</div>
        <div class="sub">개</div>
      </div>
      <div class="card stat-card">
        <div class="lbl">평균 조회수</div>
        <div class="val">${fmtNum(score.avgV)}</div>
        <div class="sub">영상당</div>
      </div>
      <div class="card stat-card">
        <div class="lbl">참여율</div>
        <div class="val" style="font-size:18px">${er}</div>
        <div class="sub">조회/구독자</div>
      </div>
      <div class="card stat-card">
        <div class="lbl">업로드 주기</div>
        <div class="val" style="font-size:18px">${vpm}</div>
        <div class="sub">평균</div>
      </div>
    </div>

    <div class="card score-section" style="margin-bottom:18px">
      <div class="score-header">
        <div class="title">📚 출판 적합도 점수</div>
        <span class="tag ${tagCls}">${tagLbl}</span>
      </div>
      <div class="score-bar-row">
        <div class="score-bar">
          <div class="score-bar-fill" style="width:${score.total}%;background:${scoreColor(score.total)}"></div>
        </div>
        <div class="score-num" style="color:${scoreColor(score.total)}">${score.total}점</div>
      </div>
      <div class="score-breakdown">
        <div class="score-item">
          <div class="score-row"><span>👥 구독자 규모</span><span class="score-pts">${score.s1}/30</span></div>
          <div class="score-reason">${escHtml(score.r1)}</div>
        </div>
        <div class="score-item">
          <div class="score-row"><span>📈 참여율</span><span class="score-pts">${score.s2}/30</span></div>
          <div class="score-reason">${escHtml(score.r2)}</div>
        </div>
        <div class="score-item">
          <div class="score-row"><span>📅 업로드 일관성</span><span class="score-pts">${score.s3}/20</span></div>
          <div class="score-reason">${escHtml(score.r3)}</div>
        </div>
        <div class="score-item">
          <div class="score-row"><span>💬 콘텐츠 반응</span><span class="score-pts">${score.s4}/20</span></div>
          <div class="score-reason">${escHtml(score.r4)}</div>
        </div>
      </div>
      <div class="score-summary">${escHtml(score.summary)}</div>
    </div>

    ${(() => {
      const q = analyzeContentQuality(YT_S.videos);
      if (!q) return '';
      return `
    <div class="card quality-card" style="margin-bottom:18px">
      <div class="section-label" style="margin-bottom:14px">🔬 콘텐츠 품질 신호 <span style="font-size:11px;font-weight:400;color:#9CA3AF;margin-left:6px">조회수·구독자와 별개의 깊이 지표</span></div>
      <div class="quality-score-header">
        <div class="quality-total-wrap">
          <span class="quality-total-num" style="color:${scoreColor(q.qualityTotal)}">${q.qualityTotal}</span>
          <span class="quality-total-label">/ 100</span>
        </div>
        <div class="quality-bar-outer">
          <div class="quality-bar-inner" style="width:${q.qualityTotal}%;background:${scoreColor(q.qualityTotal)}"></div>
        </div>
      </div>
      <div class="quality-breakdown">
        <div class="quality-item">
          <div class="quality-row"><span>💬 댓글 참여율</span><span class="score-pts">${q.cq1}/35</span></div>
          <div class="quality-mini-bar"><div class="quality-mini-bar-inner" style="width:${Math.round(q.cq1/35*100)}%;background:${scoreColor(q.cq1/35*100)}"></div></div>
          <div class="score-reason">${escHtml(q.cr1)}</div>
        </div>
        <div class="quality-item">
          <div class="quality-row"><span>👍 좋아요 비율</span><span class="score-pts">${q.cq2}/25</span></div>
          <div class="quality-mini-bar"><div class="quality-mini-bar-inner" style="width:${Math.round(q.cq2/25*100)}%;background:${scoreColor(q.cq2/25*100)}"></div></div>
          <div class="score-reason">${escHtml(q.cr2)}</div>
        </div>
        <div class="quality-item">
          <div class="quality-row"><span>📝 설명문 충실도</span><span class="score-pts">${q.cq3}/20</span></div>
          <div class="quality-mini-bar"><div class="quality-mini-bar-inner" style="width:${Math.round(q.cq3/20*100)}%;background:${scoreColor(q.cq3/20*100)}"></div></div>
          <div class="score-reason">${escHtml(q.cr3)}</div>
        </div>
        <div class="quality-item">
          <div class="quality-row"><span>🎯 제목 전문성</span><span class="score-pts">${q.cq4}/20</span></div>
          <div class="quality-mini-bar"><div class="quality-mini-bar-inner" style="width:${Math.round(q.cq4/20*100)}%;background:${scoreColor(q.cq4/20*100)}"></div></div>
          <div class="score-reason">${escHtml(q.cr4)}</div>
        </div>
      </div>
      <div class="quality-analyst-note">
        <span class="quality-analyst-label">📋 편집자 참고</span>
        ${escHtml(q.qualitySummary)}
      </div>
    </div>`;
    })()}

    ${YT_S.videos.length > 0 ? `
    <div class="card" style="margin-bottom:18px">
      <div class="section-label">최근 영상 조회수 추이</div>
      <div class="chart-wrap"><canvas id="analysisChart"></canvas></div>
    </div>` : ''}

    <div style="text-align:center;margin-bottom:24px">
      <button class="btn btn-primary" onclick="ytSwitchPanel(2)">
        🎬 영상 목록 보기 (${YT_S.videos.length}개)
      </button>
    </div>

    <div id="similarChannels">
      <div class="loading-box"><div class="spinner"></div><p>비슷한 채널 탐색 중…</p></div>
    </div>
  `;

  if (YT_S.videos.length > 0) {
    requestAnimationFrame(() => {
      const ctx = document.getElementById('analysisChart');
      if (!ctx) return;
      const recent = [...YT_S.videos].reverse().slice(-10);
      YT_S.charts.analysis = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: recent.map((v, i) => {
            const t = v.snippet?.title || v._sn?.title || ('영상 ' + (i + 1));
            return t.slice(0, 14) + (t.length > 14 ? '…' : '');
          }),
          datasets: [{
            label: '조회수',
            data: recent.map(v => parseInt(v.statistics?.viewCount || 0)),
            backgroundColor: 'rgba(59,63,140,0.72)',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { callback: v => fmtNum(v) } },
            x: { ticks: { maxRotation: 35, font: { size: 10 } } }
          }
        }
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Panel 2 — 영상 목록
// ═══════════════════════════════════════════════════════════════
function renderVideoList(ch, videos) {
  const el = document.getElementById('videoList');
  if (!videos.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🎬</div><p>영상 데이터를 불러올 수 없습니다</p></div>';
    return;
  }

  const maxV = Math.max(...videos.map(v => parseInt(v.statistics?.viewCount || 0)));
  const avgV = videos.reduce((a, v) => a + parseInt(v.statistics?.viewCount || 0), 0) / videos.length;

  el.innerHTML = `
    <div class="panel-header">
      <h2>${escHtml(ch.snippet.title)} 영상 목록</h2>
      <p>최근 ${videos.length}개 영상 · 평균 조회수 ${fmtNum(Math.round(avgV))}</p>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>썸네일</th>
              <th>제목</th>
              <th>조회수</th>
              <th>좋아요</th>
              <th>댓글</th>
              <th>참여율</th>
              <th>업로드</th>
            </tr>
          </thead>
          <tbody>
            ${videos.map(v => {
              const st  = v.statistics || {};
              const sn  = v.snippet || v._sn || {};
              const views    = parseInt(st.viewCount    || 0);
              const likes    = parseInt(st.likeCount    || 0);
              const comments = parseInt(st.commentCount || 0);
              const er  = views > 0 ? ((likes + comments) / views * 100).toFixed(2) : '0.00';
              const pct = maxV > 0 ? (views / maxV * 100) : 0;
              const thumb = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '';
              const pub   = sn.publishedAt || '';
              return `
                <tr>
                  <td style="padding:8px 14px">
                    ${thumb
                      ? `<img class="vid-thumb" src="${escHtml(thumb)}" alt="" loading="lazy">`
                      : `<div class="vid-thumb" style="display:flex;align-items:center;justify-content:center">🎬</div>`}
                  </td>
                  <td class="vid-title">
                    <a href="https://youtube.com/watch?v=${escHtml(v.id)}" target="_blank" rel="noopener">
                      ${escHtml(sn.title || '-')}
                    </a>
                    <div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
                  </td>
                  <td><strong>${fmtNum(views)}</strong></td>
                  <td>${fmtNum(likes)}</td>
                  <td>${fmtNum(comments)}</td>
                  <td>${er}%</td>
                  <td style="color:var(--text-muted);white-space:nowrap">${timeSince(pub)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// Panel 3 — 비교 분석
// ═══════════════════════════════════════════════════════════════
function toggleCompare() {
  if (!YT_S.channel) return;
  const ch  = YT_S.channel;
  const idx = YT_S.compareList.findIndex(c => c.id === ch.id);

  if (idx >= 0) {
    YT_S.compareList.splice(idx, 1);
    toast('비교 목록에서 제거했습니다');
  } else {
    if (YT_S.compareList.length >= 4) { toast('최대 4개까지 비교할 수 있습니다'); return; }
    const score = calcScore(ch, YT_S.videos);
    YT_S.compareList.push({
      id:          ch.id,
      title:       ch.snippet.title,
      thumb:       ch.snippet.thumbnails?.medium?.url || '',
      subscribers: parseInt(ch.statistics?.subscriberCount || 0),
      totalViews:  parseInt(ch.statistics?.viewCount || 0),
      videoCount:  parseInt(ch.statistics?.videoCount || 0),
      avgViews:    score.avgV,
      score:       score.total,
      publishedAt: ch.snippet.publishedAt
    });
    toast('비교 목록에 추가했습니다');
  }

  ytSaveLS();
  const btn = document.getElementById('compareBtn');
  if (btn) {
    const now = YT_S.compareList.some(c => c.id === ch.id);
    btn.textContent = now ? '✅ 비교중' : '⚖️ 비교 추가';
  }
}

function renderCompare() {
  const el = document.getElementById('compareSection');
  if (!YT_S.compareList.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">⚖️</div><p>채널 분석 화면에서 "비교에 추가" 버튼을 클릭하세요</p></div>';
    return;
  }

  const maxSub = Math.max(...YT_S.compareList.map(c => c.subscribers));
  const maxAvg = Math.max(...YT_S.compareList.map(c => c.avgViews));
  destroyChart('compare');

  el.innerHTML = `
    <div class="compare-chips">
      ${YT_S.compareList.map(c => `
        <div class="compare-chip">
          ${c.thumb ? `<img src="${escHtml(c.thumb)}" alt="">` : '📺'}
          ${escHtml(c.title)}
          <span class="chip-remove" onclick="removeCompare('${escHtml(c.id)}')">×</span>
        </div>
      `).join('')}
      <button class="btn btn-secondary btn-xs" onclick="clearCompare()">전체 초기화</button>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>채널</th><th>구독자</th><th>총 조회수</th><th>영상 수</th><th>평균 조회수</th><th>출판 적합도</th></tr>
          </thead>
          <tbody>
            ${YT_S.compareList.map(c => {
              const [tc, tl] = scoreTag(c.score);
              return `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      ${c.thumb ? `<img src="${escHtml(c.thumb)}" style="width:30px;height:30px;border-radius:50%">` : '📺'}
                      <strong>${escHtml(c.title)}</strong>
                    </div>
                  </td>
                  <td>
                    ${fmtNum(c.subscribers)}
                    <div class="mini-bar" style="margin-top:5px">
                      <div class="mini-bar-fill" style="width:${maxSub > 0 ? c.subscribers/maxSub*100 : 0}%;background:var(--accent)"></div>
                    </div>
                  </td>
                  <td>${fmtNum(c.totalViews)}</td>
                  <td>${c.videoCount.toLocaleString()}</td>
                  <td>
                    ${fmtNum(c.avgViews)}
                    <div class="mini-bar" style="margin-top:5px">
                      <div class="mini-bar-fill" style="width:${maxAvg > 0 ? c.avgViews/maxAvg*100 : 0}%;background:#10B981"></div>
                    </div>
                  </td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <strong style="color:${scoreColor(c.score)}">${c.score}점</strong>
                      <span class="tag ${tc}">${tl}</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${YT_S.compareList.length >= 2 ? `
    <div class="card">
      <div class="section-label">채널 비교 차트 (정규화 100점 기준)</div>
      <div class="chart-wrap"><canvas id="compareChart"></canvas></div>
    </div>` : ''}
  `;

  if (YT_S.compareList.length >= 2) {
    requestAnimationFrame(() => {
      const ctx = document.getElementById('compareChart');
      if (!ctx) return;
      const colors = [
        'rgba(59,63,140,0.75)',
        'rgba(16,185,129,0.75)',
        'rgba(245,158,11,0.75)',
        'rgba(239,68,68,0.75)'
      ];
      YT_S.charts.compare = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['구독자\n(정규화)', '평균 조회수\n(정규화)', '출판 점수'],
          datasets: YT_S.compareList.map((c, i) => ({
            label: c.title,
            data: [
              maxSub > 0 ? Math.round(c.subscribers / maxSub * 100) : 0,
              maxAvg > 0 ? Math.round(c.avgViews    / maxAvg * 100) : 0,
              c.score
            ],
            backgroundColor: colors[i % colors.length],
            borderRadius: 6
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { min: 0, max: 100 } }
        }
      });
    });
  }
}

function removeCompare(id) {
  YT_S.compareList = YT_S.compareList.filter(c => c.id !== id);
  ytSaveLS();
  renderCompare();
  const btn = document.getElementById('compareBtn');
  if (btn && YT_S.channel) {
    btn.textContent = YT_S.compareList.some(c => c.id === YT_S.channel.id) ? '✅ 비교중' : '⚖️ 비교 추가';
  }
}

function clearCompare() {
  YT_S.compareList = [];
  ytSaveLS();
  renderCompare();
}

// ═══════════════════════════════════════════════════════════════
// Panel 4 — 저장 목록
// ═══════════════════════════════════════════════════════════════
function toggleSave() {
  if (!YT_S.channel) return;
  const ch  = YT_S.channel;
  const idx = YT_S.savedChannels.findIndex(c => c.id === ch.id);

  if (idx >= 0) {
    YT_S.savedChannels.splice(idx, 1);
    toast('저장 목록에서 제거했습니다');
  } else {
    const score = calcScore(ch, YT_S.videos);
    YT_S.savedChannels.push({
      id:          ch.id,
      title:       ch.snippet.title,
      thumb:       ch.snippet.thumbnails?.medium?.url || '',
      subscribers: parseInt(ch.statistics?.subscriberCount || 0),
      totalViews:  parseInt(ch.statistics?.viewCount || 0),
      videoCount:  parseInt(ch.statistics?.videoCount || 0),
      score:       score.total,
      country:     ch.snippet.country || '',
      savedAt:     new Date().toISOString(),
      memo:        ''
    });
    toast('저장했습니다 ⭐');
  }

  ytSaveLS();
  const btn = document.getElementById('saveBtn');
  if (btn) {
    btn.textContent = YT_S.savedChannels.some(c => c.id === ch.id) ? '✅ 저장됨' : '⭐ 저장';
  }
}

function renderSaved() {
  const el = document.getElementById('savedList');
  if (!YT_S.savedChannels.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">⭐</div><p>저장된 채널이 없습니다<br>채널 분석 후 저장 버튼을 클릭하세요</p></div>';
    return;
  }

  el.innerHTML = `
    <div class="saved-list">
      ${YT_S.savedChannels.map(c => {
        const [tc, tl] = scoreTag(c.score);
        return `
          <div class="card saved-card">
            ${c.thumb
              ? `<img src="${escHtml(c.thumb)}" alt="">`
              : `<div style="width:42px;height:42px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-shrink:0">📺</div>`}
            <div class="s-info">
              <h4>${escHtml(c.title)}</h4>
              <p>구독자 ${fmtNum(c.subscribers)} · 영상 ${c.videoCount.toLocaleString()}개 · ${timeSince(c.savedAt)} 저장</p>
            </div>
            <span class="tag ${tc}" style="flex-shrink:0">${c.score}점 · ${tl}</span>
            <textarea class="memo-input" placeholder="메모…"
              onchange="updateMemo('${escHtml(c.id)}', this.value)">${escHtml(c.memo || '')}</textarea>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
              <button class="btn btn-secondary btn-xs" onclick="analyzeChannelById('${escHtml(c.id)}')">분석</button>
              <button class="btn btn-danger btn-xs" onclick="removeSaved('${escHtml(c.id)}')">삭제</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateMemo(id, memo) {
  const c = YT_S.savedChannels.find(x => x.id === id);
  if (c) { c.memo = memo; ytSaveLS(); }
}

function removeSaved(id) {
  YT_S.savedChannels = YT_S.savedChannels.filter(c => c.id !== id);
  ytSaveLS();
  renderSaved();
  const btn = document.getElementById('saveBtn');
  if (btn && YT_S.channel?.id === id) btn.textContent = '⭐ 저장';
  toast('삭제했습니다');
}

function clearAllSaved() {
  if (!YT_S.savedChannels.length) return;
  if (!confirm(`저장된 채널 ${YT_S.savedChannels.length}개를 모두 삭제할까요?`)) return;
  YT_S.savedChannels = [];
  ytSaveLS();
  renderSaved();
}

function exportCsv() {
  if (!YT_S.savedChannels.length) { toast('저장된 채널이 없습니다'); return; }
  const headers = ['채널명', '구독자', '총조회수', '영상수', '출판적합도', '국가', '저장일', '메모', '채널URL'];
  const rows = YT_S.savedChannels.map(c => [
    c.title, c.subscribers, c.totalViews, c.videoCount, c.score,
    c.country || '',
    new Date(c.savedAt).toLocaleDateString('ko-KR'),
    c.memo || '',
    `https://youtube.com/channel/${c.id}`
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `유튜브저자분석_${new Date().toLocaleDateString('ko-KR').replace(/\./g,'').replace(/ /g,'')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('📥 CSV 다운로드 완료');
}

// ═══════════════════════════════════════════════════════════════
// API Key Modal
// ═══════════════════════════════════════════════════════════════
function openApiModal() {
  const list = document.getElementById('apiKeyStatusList');
  if (list) {
    list.innerHTML = API_KEYS.map((key, i) => {
      const used = ytUnitsPerKey[i] || 0;
      const remaining = Math.max(0, 10000 - used);
      const exhausted = ytExhaustedKeys.has(i);
      const pct = Math.min(100, (used / 10000) * 100);
      const statusColor = exhausted ? '#C0392B' : used > 7000 ? '#B07000' : '#1A6B3C';
      const statusText = exhausted ? '⛔ 소진' : used > 7000 ? '⚠️ 주의' : '✓ 정상';
      const maskedKey = key.slice(0, 10) + '…' + key.slice(-4);
      const searchCalls = Math.floor(used / 100);
      const otherCalls = used % 100;
      return `<div style="border:1px solid #E4E2D8;border-radius:10px;padding:10px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:.78rem;font-weight:700;">키 ${i + 1} <code style="font-size:.7rem;color:#6B6860;">${maskedKey}</code></span>
          <span style="font-size:.72rem;font-weight:700;color:${statusColor};">${statusText}</span>
        </div>
        <div style="background:#F0EFE8;border-radius:4px;height:6px;overflow:hidden;margin-bottom:5px;">
          <div style="background:${statusColor};height:100%;width:${pct.toFixed(1)}%;transition:width .3s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.68rem;color:#6B6860;">
          <span><b>${used.toLocaleString()}</b> / 10,000 유닛 사용</span>
          <span>잔여 <b>${remaining.toLocaleString()}</b> 유닛</span>
        </div>
        <div style="font-size:.63rem;color:#9B9A93;margin-top:3px;">검색 약 ${searchCalls}회 + 기타 ${otherCalls}유닛 소모 (캐시 제외)</div>
      </div>`;
    }).join('');
  }
  document.getElementById('apiModal').classList.add('open');
}
function closeApiModal() {
  document.getElementById('apiModal').classList.remove('open');
}
function resetExhaustedKeys() {
  ytExhaustedKeys.clear();
  ytUnitsPerKey = API_KEYS.map(() => 0);
  ytUnitsUsed = 0;
  _saveKeyState();
  _updateQuotaDisplay();
  openApiModal(); // refresh display
  toast('키 소진 상태가 초기화되었습니다 🔄');
}
document.getElementById('apiModal').addEventListener('click', function(e) {
  if (e.target === this) closeApiModal();
});

// ═══════════════════════════════════════════════════════════════
// 트렌드 키워드
// ═══════════════════════════════════════════════════════════════
const TREND_CACHE_KEY = 'yt_trend_keywords_v5';
const TREND_CACHE_TTL = 30 * 60 * 1000; // 30분
// IT 출판 키워드 — panel10(키워드 분석) taxonomy L3에서 자동 공급
// panel10 로드 전이거나 taxonomy가 비어있으면 폴백 사용
const _FALLBACK_IT_KEYWORDS = [
  'AI', 'ChatGPT', 'Claude', 'Gemini', 'Grok', '딥시크',
  '바이브코딩', '클로드코드', '커서', '코파일럿', 'GPT',
  'LLM', 'RAG', 'AI에이전트', 'MCP', '파인튜닝', '멀티모달', '벡터DB',
  '생성형AI', '프롬프트엔지니어링', '노코드AI', 'AI자동화', '로컬LLM',
  '파이썬', 'TypeScript', '러스트', 'Go언어',
  '머신러닝', '데이터분석'
];
function getITKeywords() {
  if (typeof window.getKwTrendKeywords === 'function') {
    var kws = window.getKwTrendKeywords();
    if (kws && kws.length >= 5) return kws;
  }
  return _FALLBACK_IT_KEYWORDS;
}

// 큐레이션된 키워드 목록을 유지하되, 트렌딩 영상 텍스트에서
// 각 키워드의 언급 횟수를 세어 순위를 조정한다.
// 임의 단어 추출은 노이즈가 많아 사용하지 않는다.
function rankByTrending(corpus) {
  const text = corpus.toLowerCase();
  return getITKeywords()
    .map(kw => {
      // 공백 포함 키워드('클로드 코드' 등)도 처리
      const pattern = kw.toLowerCase().replace(/[+#()[\]]/g, '\\$&');
      const count = (text.match(new RegExp(pattern, 'g')) || []).length;
      return { kw, count };
    })
    .sort((a, b) => b.count - a.count)
    .map(s => s.kw);
}

function renderKeywordChips(keywords) {
  const wrap = document.getElementById('trendKeywords');
  const rookieWrap = document.getElementById('rookieTrendKeywords');
  if (!keywords || keywords.length === 0) {
    const msg = '<span class="kw-loading">키워드를 불러올 수 없습니다</span>';
    if (wrap) wrap.innerHTML = msg;
    if (rookieWrap) rookieWrap.innerHTML = msg;
    return;
  }
  const searchChips = keywords
    .map(kw => `<button class="kw-chip" data-kw="${escHtml(kw)}" onclick="setSearchAndRun(this.dataset.kw)">${escHtml(kw)}</button>`)
    .join('');
  const rookieChips = keywords
    .map(kw => `<button class="kw-chip" data-kw="${escHtml(kw)}" onclick="setRookieSearch(this.dataset.kw)">${escHtml(kw)}</button>`)
    .join('');
  if (wrap) wrap.innerHTML = searchChips;
  if (rookieWrap) rookieWrap.innerHTML = rookieChips;
}

function setSearchAndRun(kw) {
  document.getElementById('searchInput').value = kw;
  doSearch();
}

function setRookieSearch(kw) {
  document.getElementById('rookieInput').value = kw;
  searchRookie();
}

async function loadTrendKeywords(forceRefresh = false) {
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(localStorage.getItem(TREND_CACHE_KEY) || 'null');
      if (cached && cached.ts && (Date.now() - cached.ts < TREND_CACHE_TTL) && cached.keywords?.length) {
        renderKeywordChips(cached.keywords);
        return;
      }
    } catch (e) { /* 캐시 없거나 파손 */ }
  }

  // API 키 없으면 정적 목록 사용
  if (!getApiKey()) {
    renderKeywordChips(getITKeywords());
    return;
  }

  try {
    // IT/과학기술 카테고리(28) 인기 영상 제목+설명 텍스트로 키워드 트렌드 점수 산출
    const data = await ytFetch('/videos', {
      part: 'snippet',
      chart: 'mostPopular',
      regionCode: 'KR',
      videoCategoryId: '28',
      maxResults: '50'
    });

    const corpus = (data.items || [])
      .map(v => (v.snippet?.title || '') + ' ' + (v.snippet?.description || ''))
      .join(' ');

    // getITKeywords() 순서를 트렌딩 언급 횟수 기준으로 재정렬
    const keywords = rankByTrending(corpus);

    localStorage.setItem(TREND_CACHE_KEY, JSON.stringify({ ts: Date.now(), keywords }));
    renderKeywordChips(keywords);
  } catch (e) {
    // API 실패 시 정적 목록 원래 순서 그대로 표시
    renderKeywordChips(getITKeywords());
  }
}

async function refreshTrendKeywords() {
  const loadingHtml = '<span class="kw-loading">키워드 불러오는 중…</span>';
  document.getElementById('trendKeywords').innerHTML = loadingHtml;
  const rookieWrap = document.getElementById('rookieTrendKeywords');
  if (rookieWrap) rookieWrap.innerHTML = loadingHtml;
  await loadTrendKeywords(true);
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════
ytLoadLS();
loadTrendKeywords();
// 세션 누적 유닛 표시 초기화
(function(){ _updateQuotaDisplay(); })();
// 30분마다 키워드 자동 갱신 (페이지를 열어둔 상태에서도 최신 유지)
let _trendInterval = setInterval(() => loadTrendKeywords(true), 30 * 60 * 1000);

/* ═══════ 유튜버 분석 JS 끝 ═══════ */

/* switchTab 후크: panel7 진입 시 초기화 + 탭 잠금 해제, 비활성 시 인터벌 정리 */
(function(){
  const _origSwitchTabYT = switchTab;
  switchTab = function(i, btn){
    _origSwitchTabYT(i, btn);
    if(i === 7){
      if(typeof loadTrendKeywords === "function") loadTrendKeywords();
      // panel7 재진입 시 인터벌 없으면 재시작
      if(!_trendInterval){
        _trendInterval = setInterval(() => loadTrendKeywords(true), 30 * 60 * 1000);
      }
    } else {
      // panel7 이탈 시 인터벌 정리 (API 호출 누수 방지)
      if(_trendInterval){
        clearInterval(_trendInterval);
        _trendInterval = null;
      }
    }
  };
  function unlockYT(){
    const t7 = document.getElementById("tab7");
    if(t7){ t7.classList.remove("locked"); t7.innerHTML = '<span class="nav-label">유튜버 분석</span>'; }
  }
  if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", unlockYT); } else { unlockYT(); }
})();
