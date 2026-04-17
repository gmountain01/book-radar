(function(){
/* ══════════════════════════════════════════════════════
   panel11 — 개발자 디버그 콘솔 (숨겨진 관리자 패널)
   활성화: Ctrl+Alt+Enter
   기능: 콘솔 인터셉트, JS 오류 캐처, 패널 탐색 로그
   ══════════════════════════════════════════════════════ */

var ROOT = document.getElementById('panel11');
// ROOT가 없어도 인터셉터는 설치 — 페이지 로드 시점부터 모든 로그 수집

var MAX_LOGS = 1000;

// ─── 로그 저장소 ───────────────────────────────────────
var _logs = [];      // { ts, level, msg, source }
var _filter = 'all';
var _interceptActive = false;

// 원본 console 보관 (인터셉트 전)
var _origLog   = console.log.bind(console);
var _origWarn  = console.warn.bind(console);
var _origError = console.error.bind(console);
var _origInfo  = console.info.bind(console);

// ─── 로그 추가 ──────────────────────────────────────────
function _push(level, args, source) {
  var parts = [];
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    try {
      parts.push(typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a));
    } catch(e) { parts.push('[unserializable]'); }
  }
  _logs.unshift({ // 최신 우선
    ts: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
    level: level,
    msg: parts.join(' '),
    source: source || ''
  });
  if (_logs.length > MAX_LOGS) _logs.length = MAX_LOGS;
  _refreshUI();
}

// ─── 콘솔 인터셉터 설치 ────────────────────────────────
function _installInterceptors() {
  if (_interceptActive) return;
  _interceptActive = true;

  console.log = function() { _origLog.apply(console, arguments); _push('info',  arguments, 'console.log'); };
  console.info = function() { _origInfo.apply(console, arguments); _push('info', arguments, 'console.info'); };
  console.warn = function() { _origWarn.apply(console, arguments); _push('warn',  arguments, 'console.warn'); };
  console.error= function() { _origError.apply(console, arguments); _push('error', arguments, 'console.error'); };

  // JS 런타임 오류 (file:// 보안 경고는 무시)
  window.addEventListener('error', function(e) {
    // 리소스 로드 에러는 아래 별도 리스너에서 처리
    if (e.target && e.target !== window) return;
    if (!e.message) return;
    if (e.message.indexOf('Unsafe attempt') !== -1) return;
    var file = e.filename ? e.filename.split('/').pop().split('?')[0] : '?';
    _push('error', [e.message + '\n  at ' + file + ':' + e.lineno + ':' + e.colno], 'window.error');
  }, true);

  // Promise 미처리 거부
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason instanceof Error ? reason.message + (reason.stack ? '\n' + reason.stack.split('\n')[1] : '') : String(reason);
    _push('error', ['UnhandledRejection: ' + msg], 'promise');
  }, true);

  // Resource 로드 오류 (img, script, link 등)
  window.addEventListener('error', function(e) {
    var t = e.target;
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK' || t.tagName === 'IMG')) {
      var src = t.src || t.href || '?';
      _push('warn', ['Resource load failed: ' + src.split('/').pop()], 'resource');
    }
  }, true);

  // fetch 인터셉터 — API 호출 성공/실패 로그
  var _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    var method = (opts && opts.method) || 'GET';
    var shortUrl = typeof url === 'string' ? url.split('?')[0].split('/').slice(-2).join('/') : 'fetch';
    return _origFetch.apply(this, arguments).then(function(res) {
      if (!res.ok) {
        _push('warn', [method + ' ' + shortUrl + ' → ' + res.status], 'fetch');
      }
      return res;
    }).catch(function(err) {
      _push('error', [method + ' ' + shortUrl + ' → ' + err.message], 'fetch');
      throw err;
    });
  };

  // 클릭 이벤트 로그 (버튼·nav-item)
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button, .nav-item');
    if (!btn) return;
    var label = btn.textContent.trim().slice(0, 30);
    var id = btn.id ? ' #' + btn.id : '';
    _push('nav', [label + id], 'click');
  }, true);

  _push('info', ['콘솔 인터셉터 활성화됨 (console·error·fetch·click)'], 'panel11');
}

// ─── 즉시 인터셉터 설치 (페이지 로드 시점부터 수집) ───────
_installInterceptors();

// ─── switchTab 훅 — 패널 탐색 로그 ───────────────────────
function _hookSwitchTab() {
  if (typeof window.switchTab !== 'function') return;
  if (window.__p11_hooked) return;
  window.__p11_hooked = true;

  var _orig = window.switchTab;
  window.switchTab = function(idx, el) {
    if (idx !== 11) {
      var label = el && el.querySelector('.nav-label') ? el.querySelector('.nav-label').textContent.replace(/🔒/g,'').trim() : ('panel' + idx);
      _push('nav', ['→ ' + label + ' (panel' + idx + ')'], 'navigation');
    }
    return _orig.apply(this, arguments);
  };
}

// ─── 렌더링 ────────────────────────────────────────────
function _escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _renderLogs() {
  if (!ROOT) return;
  var container = ROOT.querySelector('.p11-log-list');
  if (!container) return;

  var filtered = _filter === 'all' ? _logs : _logs.filter(function(l) { return l.level === _filter; });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="p11-empty">[ 로그 없음 ]</div>';
    return;
  }

  container.innerHTML = filtered.map(function(l) {
    return '<div class="p11-log-entry p11-level-' + l.level + '">' +
      '<span class="p11-ts">' + _escHtml(l.ts) + '</span>' +
      '<span class="p11-badge p11-badge-' + l.level + '">' + l.level.toUpperCase() + '</span>' +
      (l.source ? '<span class="p11-source">' + _escHtml(l.source) + '</span>' : '') +
      '<span class="p11-msg">' + _escHtml(l.msg) + '</span>' +
    '</div>';
  }).join('');
}

function _renderStats() {
  if (!ROOT) return;
  var el = ROOT.querySelector('.p11-stats');
  if (!el) return;
  var counts = { error: 0, warn: 0, info: 0, nav: 0 };
  _logs.forEach(function(l) { if (counts[l.level] !== undefined) counts[l.level]++; });
  el.innerHTML =
    '<span class="p11-stat p11-stat-error"><span class="p11-stat-dot"></span>오류 ' + counts.error + '</span>' +
    '<span class="p11-stat p11-stat-warn"><span class="p11-stat-dot"></span>경고 ' + counts.warn + '</span>' +
    '<span class="p11-stat p11-stat-info"><span class="p11-stat-dot"></span>로그 ' + counts.info + '</span>' +
    '<span class="p11-stat p11-stat-nav"><span class="p11-stat-dot"></span>탐색 ' + counts.nav + '</span>' +
    '<span class="p11-stat" style="color:#444c56;margin-left:auto;">총 ' + _logs.length + ' / ' + MAX_LOGS + '</span>';
}

function _refreshUI() {
  if (!ROOT) ROOT = document.getElementById('panel11');
  if (!ROOT) return;
  // 패널이 보이는 상태일 때만 렌더
  if (!ROOT.classList.contains('active')) return;
  _renderStats();
  _renderLogs();
}

// ─── 필터 활성화 ───────────────────────────────────────
function _setFilter(f) {
  _filter = f;
  ['all','error','warn','info','nav'].forEach(function(t) {
    var btn = ROOT.querySelector('[data-p11-filter="' + t + '"]');
    if (btn) btn.classList.toggle('p11-active', t === f);
  });
  _renderLogs();
}

// ─── 초기화 (패널 활성화 시 호출) ────────────────────────
var _p11initialized = false;
function initPanel11() {
  _hookSwitchTab();
  _installInterceptors();
  if (_p11initialized) {
    // 재활성화 시 상태만 갱신 (innerHTML 덮어쓰기 방지)
    _renderStats();
    _renderLogs();
    _renderKeyStatus();
    return;
  }
  _p11initialized = true;

  ROOT.innerHTML =
    '<div class="p11-header">' +
      '<h2>⚙️ 개발자 콘솔</h2>' +
      '<div class="p11-controls">' +
        '<button class="p11-btn p11-active" data-p11-tab="logs" onclick="p11_switchTab(\'logs\',this)">로그</button>' +
        '<button class="p11-btn" data-p11-tab="keys" onclick="p11_switchTab(\'keys\',this)">API 키</button>' +
        '<span style="width:1px;height:16px;background:#30363d;margin:0 4px;"></span>' +
        '<button class="p11-btn p11-active" data-p11-filter="all"   onclick="p11_setFilter(\'all\')">전체</button>' +
        '<button class="p11-btn" data-p11-filter="error" onclick="p11_setFilter(\'error\')">오류</button>' +
        '<button class="p11-btn" data-p11-filter="warn"  onclick="p11_setFilter(\'warn\')">경고</button>' +
        '<button class="p11-btn" data-p11-filter="info"  onclick="p11_setFilter(\'info\')">로그</button>' +
        '<button class="p11-btn" data-p11-filter="nav"   onclick="p11_setFilter(\'nav\')">탐색</button>' +
        '<button class="p11-btn p11-btn-clear"  onclick="p11_clearLogs()">지우기</button>' +
        '<button class="p11-btn p11-btn-copy"   onclick="p11_copyLogs()">복사</button>' +
        '<button class="p11-btn p11-btn-export" onclick="p11_exportLogs()">저장</button>' +
      '</div>' +
    '</div>' +
    '<div class="p11-stats"></div>' +
    '<div class="p11-log-list"></div>' +
    '<div class="p11-keys-panel" style="display:none;padding:1rem 1.5rem;overflow-y:auto;flex:1;min-height:0;">' +
      '<div style="font-size:0.78rem;color:#8b949e;margin-bottom:12px;">API 키를 입력하면 자동 검증 후 저장됩니다. 모든 메뉴에 즉시 적용.</div>' +
      '<div class="p11-key-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<div class="p11-key-label" style="margin:0;">Claude API</div>' +
          '<div id="p11-claude-badge" class="p11-key-badge">미설정</div>' +
        '</div>' +
        '<div style="font-size:0.6rem;color:#444c56;margin-bottom:8px;font-family:\'DM Mono\',monospace;">저자 제안서 · 출판 기획서 · 교정 도우미 · 키워드 분석</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<input type="text" id="p11-claude-key" class="p11-key-input p11-key-masked" placeholder="sk-ant-api03-...">' +
          '<button id="p11-claude-save-btn" class="p11-btn p11-btn-save" onclick="p11_saveClaudeKey()">저장</button>' +
        '</div>' +
        '<div id="p11-claude-status" class="p11-key-status"></div>' +
      '</div>' +
      '<div class="p11-key-section" style="margin-top:16px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<div class="p11-key-label" style="margin:0;">YouTube Data API v3</div>' +
          '<div id="p11-yt-badge" class="p11-key-badge">내장 6개</div>' +
        '</div>' +
        '<div style="font-size:0.6rem;color:#444c56;margin-bottom:8px;font-family:\'DM Mono\',monospace;">유튜버 분석 · 키워드 분석</div>' +
        '<div id="p11-yt-keys-list"></div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">' +
          '<input type="text" id="p11-yt-new-key" class="p11-key-input" placeholder="AIzaSy... (추가 키 등록)">' +
          '<button id="p11-yt-add-btn" class="p11-btn p11-btn-save" onclick="p11_addYtKey()">추가</button>' +
        '</div>' +
        '<div id="p11-yt-status" class="p11-key-status"></div>' +
      '</div>' +
    '</div>';

  _renderStats();
  _renderLogs();
  _renderKeyStatus();

  _push('nav', ['개발자 콘솔 열림'], 'panel11');
  // 디버그: keys 패널 내부 요소 확인
  var kp = ROOT.querySelector('.p11-keys-panel');
  var ci = ROOT.querySelector('#p11-claude-key');
  var cb = ROOT.querySelector('#p11-claude-save-btn');
  _push('info', ['keys-panel: ' + (kp ? 'OK' : 'NULL') + ', claude-input: ' + (ci ? 'OK' : 'NULL') + ', save-btn: ' + (cb ? 'OK' : 'NULL')], 'panel11');
}

// ─── 탭 전환 (로그 / API 키) ────────────────────────────
window.p11_switchTab = function(tab, btn) {
  var logList = ROOT.querySelector('.p11-log-list');
  var stats = ROOT.querySelector('.p11-stats');
  var keysPanel = ROOT.querySelector('.p11-keys-panel');
  var filterBtns = ROOT.querySelectorAll('[data-p11-filter]');
  var tabBtns = ROOT.querySelectorAll('[data-p11-tab]');
  tabBtns.forEach(function(b) { b.classList.toggle('p11-active', b === btn); });
  if (tab === 'keys') {
    if (logList) logList.style.display = 'none';
    if (stats) stats.style.display = 'none';
    if (keysPanel) { keysPanel.style.display = 'flex'; keysPanel.style.flexDirection = 'column'; keysPanel.style.gap = '0'; }
    filterBtns.forEach(function(b) { b.style.display = 'none'; });
    ROOT.querySelectorAll('.p11-header .p11-btn-clear,.p11-header .p11-btn-copy,.p11-header .p11-btn-export').forEach(function(b) { b.style.display = 'none'; });
    _renderKeyStatus();
  } else {
    if (logList) logList.style.display = '';
    if (stats) stats.style.display = '';
    if (keysPanel) keysPanel.style.display = 'none';
    filterBtns.forEach(function(b) { b.style.display = ''; });
    ROOT.querySelectorAll('.p11-header .p11-btn-clear,.p11-header .p11-btn-copy,.p11-header .p11-btn-export').forEach(function(b) { b.style.display = ''; });
  }
};

// ─── API 키 관리 ─────────────────────────────────────────
function _setBadge(id, type, text) {
  var el = ROOT.querySelector('#' + id);
  if (!el) return;
  var colors = {
    ok:    'background:#0d2818;color:#34d399;border-color:#134e2a;',
    warn:  'background:#2d230f;color:#fbbf24;border-color:#4a3910;',
    error: 'background:#2d1515;color:#f87171;border-color:#5c2020;',
    none:  'background:#1c2128;color:#6b7280;border-color:#30363d;',
    loading: 'background:#1a1730;color:#a78bfa;border-color:#3b3170;'
  };
  el.setAttribute('style', (colors[type] || colors.none));
  el.textContent = text;
}

function _renderKeyStatus() {
  // Claude 배지 + 상태
  var statusEl = ROOT.querySelector('#p11-claude-status');
  var inputEl = ROOT.querySelector('#p11-claude-key');
  if (typeof loadApiKey === 'function') {
    loadApiKey().then(function(key) {
      if (key && key.startsWith('sk-')) {
        _setBadge('p11-claude-badge', 'ok', '연결됨');
        if (statusEl) statusEl.innerHTML = '<span style="color:#34d399;">✓ ' + key.slice(0, 15) + '…</span>';
        if (inputEl) inputEl.placeholder = key.slice(0, 15) + '… (변경하려면 새 키 입력)';
      } else {
        _setBadge('p11-claude-badge', 'none', '미설정');
        if (statusEl) statusEl.innerHTML = '<span style="color:#6b7280;">키를 입력하세요</span>';
        if (inputEl) inputEl.placeholder = 'sk-ant-api03-...';
      }
    });
  }
  // YouTube 배지 + 키 목록
  var ytList = ROOT.querySelector('#p11-yt-keys-list');
  if (ytList) {
    var ytKeys = _getYtKeyList();
    var extraCount = Math.max(0, ytKeys.length - 6);
    _setBadge('p11-yt-badge', 'ok', '내장 6개' + (extraCount ? ' + 추가 ' + extraCount + '개' : ''));
    ytList.innerHTML = ytKeys.map(function(key, i) {
      var isExtra = i >= 6;
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
        '<span style="color:' + (isExtra ? '#a78bfa' : '#34d399') + ';font-size:0.62rem;font-family:\'DM Mono\',monospace;">' +
        (isExtra ? '추가' : 'KEY') + ' ' + (i+1) + '</span>' +
        '<span style="color:#6b7280;font-size:0.62rem;font-family:\'DM Mono\',monospace;">' + key.slice(0, 10) + '…' + key.slice(-4) + '</span>' +
        (isExtra ? '<span style="color:#f87171;font-size:0.58rem;cursor:pointer;" onclick="p11_removeYtKey(' + (i-6) + ')">삭제</span>' : '') +
        '</div>';
    }).join('');
  }
}

function _getYtKeyList() {
  try {
    var defaults = typeof YT_API_KEYS_SHARED !== 'undefined' ? YT_API_KEYS_SHARED : [];
    var saved = JSON.parse(localStorage.getItem('p11_extra_yt_keys') || '[]');
    return defaults.concat(saved);
  } catch (e) { return []; }
}

window.p11_saveClaudeKey = async function() {
  _push('info', ['저장 버튼 클릭됨'], 'panel11');
  var input = ROOT.querySelector('#p11-claude-key');
  var statusEl = ROOT.querySelector('#p11-claude-status');
  var btn = ROOT.querySelector('#p11-claude-save-btn');
  if (!input) { _push('error', ['input 요소를 찾을 수 없음'], 'panel11'); return; }
  var key = input.value.trim();
  if (!key) { _push('warn', ['입력값이 비어있음'], 'panel11'); if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">키를 입력하세요</span>'; return; }
  if (!key.startsWith('sk-')) {
    _setBadge('p11-claude-badge', 'error', '형식 오류');
    if (statusEl) statusEl.innerHTML = '<span style="color:#f87171;">키는 sk-ant-api03- 으로 시작해야 합니다</span>';
    return;
  }

  // 1) 저장
  if (typeof saveApiKey === 'function') await saveApiKey(key);
  input.value = '';

  // 2) 진행 중 표시
  _setBadge('p11-claude-badge', 'loading', '검증 중…');
  if (btn) { btn.disabled = true; btn.textContent = '검증 중…'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:#a78bfa;">⏳ API 연결 확인 중… (' + key.slice(0, 12) + '…)</span>';
  _push('info', ['Claude API 키 저장 → 검증 시작'], 'panel11');

  // 3) 검증
  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
    });
    if (res.ok) {
      _setBadge('p11-claude-badge', 'ok', '연결됨');
      if (statusEl) statusEl.innerHTML = '<span style="color:#34d399;">✓ API 연결 성공 — 모든 메뉴에서 사용 가능</span>';
      _push('info', ['Claude API 연결 확인 ✓'], 'panel11');
    } else {
      var errData = await res.json().catch(function() { return {}; });
      var errMsg = (errData.error && errData.error.message) || ('HTTP ' + res.status);
      _setBadge('p11-claude-badge', 'error', '미연결');
      if (statusEl) statusEl.innerHTML = '<span style="color:#f87171;">✗ 인증 실패: ' + _escHtml(errMsg) + '</span><br><span style="color:#444c56;font-size:0.6rem;">키가 저장되었으나 API 인증에 실패했습니다. 키를 확인하세요.</span>';
      _push('error', ['Claude API 미연결: ' + errMsg], 'panel11');
    }
  } catch (e) {
    // file:// CORS 차단 — 저장은 됨, 검증 불가
    _setBadge('p11-claude-badge', 'warn', '저장됨');
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">⚠ 키 저장됨 — 로컬(file://) 환경에서 사전 검증 불가</span><br><span style="color:#444c56;font-size:0.6rem;">실제 기능 사용 시 자동으로 연결됩니다.</span>';
    _push('info', ['Claude API 키 저장됨 (로컬 환경 — 사전 검증 불가)'], 'panel11');
  }
  if (btn) { btn.disabled = false; btn.textContent = '저장'; }
};

window.p11_addYtKey = async function() {
  _push('info', ['YouTube 추가 버튼 클릭됨'], 'panel11');
  var input = ROOT.querySelector('#p11-yt-new-key');
  var statusEl = ROOT.querySelector('#p11-yt-status');
  var btn = ROOT.querySelector('#p11-yt-add-btn');
  if (!input) { _push('error', ['YouTube input 요소를 찾을 수 없음'], 'panel11'); return; }
  var key = input.value.trim();
  if (!key || !key.startsWith('AIza')) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#f87171;">YouTube 키는 AIzaSy... 형식이어야 합니다</span>';
    return;
  }

  // 1) 저장
  try {
    var saved = JSON.parse(localStorage.getItem('p11_extra_yt_keys') || '[]');
    if (saved.indexOf(key) === -1) { saved.push(key); localStorage.setItem('p11_extra_yt_keys', JSON.stringify(saved)); }
  } catch (e) {}
  input.value = '';

  // 2) 진행 중
  if (btn) { btn.disabled = true; btn.textContent = '검증 중…'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:#a78bfa;">⏳ YouTube API 확인 중…</span>';

  // 3) 검증
  try {
    var res = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=' + key);
    var data = await res.json();
    if (data.error) {
      var errMsg = data.error.message || ('코드 ' + data.error.code);
      if (statusEl) statusEl.innerHTML = '<span style="color:#f87171;">✗ ' + _escHtml(errMsg) + '</span>';
      _push('warn', ['YouTube 키 검증 실패: ' + errMsg], 'panel11');
    } else {
      if (statusEl) statusEl.innerHTML = '<span style="color:#34d399;">✓ 연결 확인 완료</span>';
      _push('info', ['YouTube API 키 연결 확인 ✓'], 'panel11');
      setTimeout(function() { if (statusEl) statusEl.innerHTML = ''; }, 3000);
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">⚠ 저장됨 — 로컬 환경 사전 검증 불가</span>';
    _push('info', ['YouTube 키 저장됨 (사전 검증 불가)'], 'panel11');
  }
  if (btn) { btn.disabled = false; btn.textContent = '추가'; }
  _renderKeyStatus();
};

window.p11_removeYtKey = function(idx) {
  try {
    var saved = JSON.parse(localStorage.getItem('p11_extra_yt_keys') || '[]');
    saved.splice(idx, 1);
    localStorage.setItem('p11_extra_yt_keys', JSON.stringify(saved));
  } catch (e) {}
  _renderKeyStatus();
  _push('info', ['YouTube 추가 키 삭제됨'], 'panel11');
};

// ─── 공개 API (window 노출) ─────────────────────────────
window.p11_setFilter = function(f) { _setFilter(f); };

window.p11_clearLogs = function() {
  _logs = [];
  _renderStats();
  _renderLogs();
  _push('info', ['로그 초기화됨'], 'panel11');
};

window.p11_copyLogs = function() {
  var text = _logs.map(function(l) {
    return '[' + l.ts + '] [' + l.level.toUpperCase() + '] ' +
           (l.source ? '[' + l.source + '] ' : '') + l.msg;
  }).join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      _push('info', ['로그 ' + _logs.length + '건이 클립보드에 복사됨'], 'panel11');
    });
  } else {
    // 구형 폴백
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    _push('info', ['로그 클립보드 복사 (폴백)'], 'panel11');
  }
};

window.p11_exportLogs = function() {
  var text = _logs.map(function(l) {
    return '[' + l.ts + '] [' + l.level.toUpperCase() + '] ' +
           (l.source ? '[' + l.source + '] ' : '') + l.msg;
  }).join('\n');
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url;
  a.download = 'debug_log_' + new Date().toISOString().replace(/[:.]/g,'-').slice(0,19) + '.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  _push('info', ['로그 파일 저장됨'], 'panel11');
};

// ─── PanelRegistry 등록 ────────────────────────────────
if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(11, { onActivate: initPanel11 });
}
window._initPanel11 = initPanel11;

})();
