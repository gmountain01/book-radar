/* API 사용량 기록 — callClaudeApi(shared/app.js)가 HTTP 요청마다 한 건씩 남긴다.
 * 남기는 것: 실행·호출·배치·재시도 번호, 작업 종류, 모델, 시각·소요 시간, 성공·실패, stop_reason,
 *            usage 토큰(입력·캐시 쓰기(TTL별)·캐시 읽기·출력·웹 검색 수), 프롬프트 구간별 글자 수·해시(캐시 진단용).
 * 남기지 않는 것: API 키, 원고·프롬프트 본문(길이와 해시만).
 * 비용은 공식 요금표로 계산한 '추정'이다 — 실제 청구액은 콘솔에서 확인. 요금을 모르는 모델은 비용을 비워 둔다. */
(function (root) {
  'use strict';

  // 공식 요금(USD / 100만 토큰) — https://platform.claude.com/docs/en/about-claude/pricing (2026-10-06 확인)
  // Claude API(1차) 표준, inference_geo 기본(global). 배치 API·지역 고정(1.1배)·협상 할인은 반영하지 않음.
  var PRICES = {
    source: 'https://platform.claude.com/docs/en/about-claude/pricing',
    checked: '2026-10-06',
    note: 'Claude API(1차) 표준 요금 · 전역 추론(기본) · 배치·지역 고정·할인 미반영 · 추정치이며 실제 청구액은 Claude 콘솔에서 확인',
    webSearchPer1000: 10,
    models: [
      { match: /^claude-sonnet-4-6/, name: 'Claude Sonnet 4.6', input: 3, write5m: 3.75, write1h: 6, read: 0.30, output: 15, minCache: 1024 },
      { match: /^claude-haiku-4-5/, name: 'Claude Haiku 4.5', input: 1, write5m: 1.25, write1h: 2, read: 0.10, output: 5, minCache: 4096 },
    ],
  };
  var KEY = 'api_usage_v1', MAX = 600; // 호출 1건 ≈ 0.9KB → 최대 약 0.5MB. 넘으면 오래된 실행부터 통째로 버림
  var recs = null, current = null, seq = 0;

  function load() {
    if (recs) return recs;
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || '[]'); recs = Array.isArray(v) ? v : (v && Array.isArray(v.recs) ? v.recs : []); } catch (e) { recs = []; }
    seq = recs.length; // 새로고침 뒤에도 호출 ID가 겹치지 않게
    return recs;
  }
  function save() {
    try {
      while (recs.length > MAX) { // 오래된 실행부터 통째로(실행 행과 그 호출들) 버려 고아 호출이 남지 않게
        var oldest = recs.find(function (x) { return x.type === 'run'; });
        if (!oldest) { recs.shift(); continue; }
        var id = oldest.run.id;
        recs = recs.filter(function (x) { return !(x.type === 'run' && x.run.id === id) && x.runId !== id; });
      }
      // GC(app.js _gcLocalStorage)가 나이를 볼 수 있게 cachedAt을 붙인 객체로 저장. safeLSSet이 있으면 용량 초과 시 캐시 정리 뒤 재시도
      var payload = JSON.stringify({ cachedAt: Date.now(), recs: recs });
      if (typeof root.safeLSSet === 'function') root.safeLSSet(KEY, payload); else root.localStorage.setItem(KEY, payload);
    } catch (e) { console.warn('[usage-log] 저장 실패(용량 초과 등) — 이번 세션 기록은 화면에서만 볼 수 있음', e); }
  }
  /** FNV-1a 32비트 — 프롬프트 구간이 같은지만 보는 해시(복원 불가) */
  function hash(s) {
    s = String(s || '');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }

  /** 실행(교정 한 번·검토 한 번)을 시작 — 이후 호출은 이 실행 ID로 묶인다 */
  function begin(kind, info) {
    if (current && !current.endedAt) end(current.id, '다음 실행 시작으로 닫힘');
    current = { id: 'run-' + stamp(new Date()) + '-' + Math.random().toString(36).slice(2, 6), kind: kind, info: info || {}, startedAt: new Date().toISOString() };
    load().push({ type: 'run', run: current });
    save();
    return current.id;
  }
  function end(id, status) {
    var r = load().find(function (x) { return x.type === 'run' && x.run.id === id; });
    if (r) { r.run.endedAt = new Date().toISOString(); r.run.status = status || '완료'; save(); }
    if (current && current.id === id) current.endedAt = new Date().toISOString();
  }
  var STALE_MS = 15 * 60 * 1000;
  function activeRunId() {
    if (current && !current.endedAt) {
      var last = new Date(current.lastAt || current.startedAt).getTime();
      if (Date.now() - last > STALE_MS) end(current.id, '중단(끝내지 않은 채 15분 경과)'); // 예외로 end()를 못 부른 실행
      else return current.id;
    }
    // 실행 밖의 호출(다른 패널 등)은 날짜별 '단독 호출'로 묶는다
    var day = stamp(new Date()).slice(0, 8), id = 'run-' + day + '-adhoc';
    if (!load().some(function (x) { return x.type === 'run' && x.run.id === id; })) {
      load().push({ type: 'run', run: { id: id, kind: '단독 호출(실행 밖)', info: {}, startedAt: new Date().toISOString() } });
    }
    return id;
  }

  /** 요청 본문에서 캐시 진단용 메타데이터만 — 구간별 글자 수·해시·캐시 지점, 캐시 지점까지의 누적 해시 */
  function promptMeta(body) {
    var sys = Array.isArray(body.system) ? body.system : body.system ? [{ type: 'text', text: String(body.system) }] : [];
    var parts = [];
    if (body.tools && body.tools.length) parts.push({ part: 'tools', len: JSON.stringify(body.tools).length, hash: hash(JSON.stringify(body.tools)), cache: false });
    sys.forEach(function (b, i) { parts.push({ part: 'system#' + i, len: (b.text || '').length, hash: hash(b.text || ''), cache: !!b.cache_control, ttl: b.cache_control ? (b.cache_control.ttl || '5m') : '' }); });
    (body.messages || []).forEach(function (m, i) {
      var t = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      parts.push({ part: m.role + '#' + i, len: t.length, hash: hash(t), cache: /"cache_control"/.test(typeof m.content === 'string' ? '' : t) });
    });
    var acc = '', chars = 0, bps = [];
    parts.forEach(function (p) {
      acc = hash(acc + p.hash); chars += p.len;
      if (p.cache) bps.push({ at: p.part, prefixHash: acc, prefixChars: chars, ttl: p.ttl || '5m' });
    });
    return { parts: parts, breakpoints: bps, totalChars: chars, thinking: body.thinking ? body.thinking.type : '', tools: (body.tools || []).map(function (t) { return t.type || t.name; }) };
  }

  /** callClaudeApi가 HTTP 요청 한 번마다 부른다 */
  function record(r) {
    r.type = 'call';
    r.callId = (r.runId || 'run') + '#' + (++seq);
    if (current && current.id === r.runId) current.lastAt = new Date().toISOString();
    load().push(r);
    save();
    return r.callId;
  }

  function priceOf(model) { return PRICES.models.find(function (p) { return p.match.test(model || ''); }) || null; }

  /** 호출 한 건의 추정 비용(USD). 사용량이 없거나 요금을 모르면 null — 0으로 단정하지 않음 */
  function cost(c) {
    var u = c.usage;
    if (!u) return null;
    var p = priceOf(c.respModel || c.model);
    if (!p) return null;
    var w5 = u.cw5m, w1 = u.cw1h;
    if (w5 == null && w1 == null) { // TTL 내역이 없으면 요청의 캐시 지점 TTL로 추정
      var any1h = c.prompt && c.prompt.breakpoints.some(function (b) { return b.ttl === '1h'; });
      w5 = any1h ? 0 : u.cacheWrite; w1 = any1h ? u.cacheWrite : 0;
    }
    var M = 1e6;
    var parts = {
      input: u.input * p.input / M,
      write5m: (w5 || 0) * p.write5m / M,
      write1h: (w1 || 0) * p.write1h / M,
      read: u.cacheRead * p.read / M,
      output: u.output * p.output / M,
      webSearch: (u.webSearches || 0) * PRICES.webSearchPer1000 / 1000,
    };
    parts.total = Object.keys(parts).reduce(function (s, k) { return s + parts[k]; }, 0);
    // 계산상 비교: 같은 요청·토큰에 캐시가 전혀 없었다면(모든 입력을 일반 입력 단가로)
    parts.noCache = (u.input + u.cacheWrite + u.cacheRead) * p.input / M + parts.output + parts.webSearch;
    return parts;
  }

  function runs() {
    return load().filter(function (x) { return x.type === 'run'; }).map(function (x) { return x.run; })
      .sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : -1; });
  }
  function callsOf(runId) { return load().filter(function (x) { return x.type === 'call' && x.runId === runId; }); }

  /** 실행 요약 + 캐시 진단 */
  function summarize(runId) {
    var calls = callsOf(runId);
    var run = runs().find(function (r) { return r.id === runId; }) || { id: runId };
    var ok = calls.filter(function (c) { return c.ok && c.usage; });
    var missing = calls.filter(function (c) { return !c.usage; });
    var sum = function (arr, f) { return arr.reduce(function (s, c) { return s + (f(c) || 0); }, 0); };
    var tok = function (arr) {
      return { calls: arr.length, input: sum(arr, function (c) { return c.usage && c.usage.input; }), cacheWrite: sum(arr, function (c) { return c.usage && c.usage.cacheWrite; }),
        cacheRead: sum(arr, function (c) { return c.usage && c.usage.cacheRead; }), output: sum(arr, function (c) { return c.usage && c.usage.output; }),
        webSearches: sum(arr, function (c) { return c.usage && c.usage.webSearches; }), thinking: sum(arr, function (c) { return c.usage && c.usage.thinking; }) };
    };
    var costs = ok.map(cost);
    var priced = costs.filter(Boolean);
    var byCat = ['input', 'write5m', 'write1h', 'read', 'output', 'webSearch', 'total', 'noCache'].reduce(function (o, k) { o[k] = priced.reduce(function (s, c) { return s + c[k]; }, 0); return o; }, {});
    var tasks = {};
    calls.forEach(function (c) { (tasks[c.task || '기타'] = tasks[c.task || '기타'] || []).push(c); });
    var byTask = Object.keys(tasks).map(function (t) {
      var arr = tasks[t], cs = arr.filter(function (c) { return c.ok && c.usage; }).map(cost).filter(Boolean);
      return Object.assign({ task: t, retries: arr.filter(function (c) { return c.attempt > 0; }).length, missing: arr.filter(function (c) { return !c.usage; }).length,
        cost: cs.reduce(function (s, c) { return s + c.total; }, 0), unpriced: arr.filter(function (c) { return c.usage && !cost(c); }).length }, tok(arr));
    });
    var withBp = ok.filter(function (c) { return c.prompt && c.prompt.breakpoints.length; });
    var readCalls = ok.filter(function (c) { return c.usage.cacheRead > 0; });
    var T = tok(ok);
    var inputAll = T.input + T.cacheWrite + T.cacheRead;

    // ── 캐시 진단 ──
    var diag = [];
    Object.keys(tasks).forEach(function (t) {
      var arr = tasks[t].filter(function (c) { return c.ok && c.usage && c.prompt; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      if (!arr.length) return;
      var noBp = arr.filter(function (c) { return !c.prompt.breakpoints.length; });
      if (noBp.length) diag.push({ task: t, level: 'info', msg: '캐시 지점이 없는 호출 ' + noBp.length + '건 — 캐시를 쓰지 않음' });
      // 캐시 지점별: 그 앞 내용(누적 해시)이 호출마다 다른가
      var maxBp = Math.max.apply(null, arr.map(function (c) { return c.prompt.breakpoints.length; }));
      for (var k = 0; k < maxBp; k++) {
        var have = arr.filter(function (c) { return c.prompt.breakpoints[k]; });
        if (have.length < 2) continue;
        var distinct = {}; have.forEach(function (c) { distinct[c.prompt.breakpoints[k].prefixHash] = 1; });
        var nd = Object.keys(distinct).length, at = have[0].prompt.breakpoints[k].at;
        if (nd === have.length) {
          // 어느 구간이 바뀌는지: 캐시 지점 앞 구간 중 해시가 호출마다 다른 것
          var cut = have[0].prompt.parts.findIndex(function (p) { return p.part === at; });
          var changed = have[0].prompt.parts.slice(0, cut + 1).filter(function (p, i) {
            return have.some(function (c) { return c.prompt.parts[i] && c.prompt.parts[i].hash !== p.hash; });
          }).map(function (p) { return p.part; });
          diag.push({ task: t, level: 'warn', msg: '캐시 지점 ' + (k + 1) + '(' + at + ') 앞 내용이 호출마다 다름(' + have.length + '건 모두 다른 접두부) — 이 지점은 매번 새로 쓰기만 하고 다시 읽히지 않음. 바뀌는 구간: ' + (changed.join(', ') || '확인 못 함') });
        } else if (nd > 1) {
          var mostly = nd * 2 >= have.length; // 절반 이상이 서로 다르면 사실상 매번 새로 씀
          diag.push({ task: t, level: mostly ? 'warn' : 'info', msg: '캐시 지점 ' + (k + 1) + '(' + at + ') 앞 내용이 ' + have.length + '건 중 ' + nd + '가지 — 같은 접두부를 쓰는 호출끼리만 재사용' + (mostly ? '. 대부분 새로 쓰기(쓰기 할증)만 되고 읽히지 않음' : '') });
        }
      }
      // 최소 길이: 캐시 지점이 있는데 쓰기도 읽기도 0
      var noCache = arr.filter(function (c) { return c.prompt.breakpoints.length && !c.usage.cacheWrite && !c.usage.cacheRead; });
      if (noCache.length) {
        var p = priceOf(noCache[0].respModel || noCache[0].model);
        diag.push({ task: t, level: 'warn', msg: '캐시 지점이 있는데 캐시 쓰기·읽기가 모두 0인 호출 ' + noCache.length + '건 — 캐시 지점까지 길이가 모델 최소값' + (p ? '(' + p.name + ' ' + p.minCache.toLocaleString() + '토큰)' : '') + '보다 짧을 수 있음(첫 캐시 지점까지 ' + noCache[0].prompt.breakpoints[0].prefixChars.toLocaleString() + '자)' });
      }
      // 최초 쓰기와 이후 재사용
      var writes = arr.filter(function (c) { return c.usage.cacheWrite > 0; }).length, reads = arr.filter(function (c) { return c.usage.cacheRead > 0; }).length;
      diag.push({ task: t, level: 'info', msg: '캐시 쓰기가 있던 호출 ' + writes + '건, 캐시를 읽은 호출 ' + reads + '건 / 성공 호출 ' + arr.length + '건' + (arr[0].usage.cacheRead > 0 ? ' (첫 호출부터 읽음 — 이 실행 전에 만든 캐시를 재사용)' : '') });
      // 요청 간격(5분 TTL)과 동시 요청
      for (var j = 1; j < arr.length; j++) {
        var prev = arr[j - 1], cur = arr[j];
        var gap = (new Date(cur.at) - (new Date(prev.at).getTime() + (prev.ms || 0))) / 1000;
        if (gap > 300) diag.push({ task: t, level: 'warn', msg: '호출 사이 ' + Math.round(gap / 60) + '분 간격(' + prev.callId + ' → ' + cur.callId + ') — 5분 캐시가 만료됐을 수 있음' });
        if (new Date(cur.at) < new Date(prev.at).getTime() + (prev.ms || 0)) diag.push({ task: t, level: 'warn', msg: '동시 요청(' + prev.callId + '와 ' + cur.callId + ' 겹침) — 앞 요청 응답이 시작되기 전에는 캐시를 읽을 수 없음' });
      }
    });

    var top = ok.map(function (c) { return { c: c, cost: cost(c) }; }).filter(function (x) { return x.cost; })
      .sort(function (a, b) { return b.cost.total - a.cost.total; }).slice(0, 5).map(function (x) {
        var k = ['input', 'write5m', 'write1h', 'read', 'output', 'webSearch'].sort(function (a, b) { return x.cost[b] - x.cost[a]; })[0];
        var NAME = { input: '일반 입력', write5m: '캐시 쓰기(5분)', write1h: '캐시 쓰기(1시간)', read: '캐시 읽기', output: '출력(확장 사고 포함)', webSearch: '웹 검색' };
        return { callId: x.c.callId, task: x.c.task, batch: x.c.batch, cost: x.cost.total, main: NAME[k], mainCost: x.cost[k], usage: x.c.usage, stopReason: x.c.stopReason };
      });

    return {
      run: run, prices: { source: PRICES.source, checked: PRICES.checked, note: PRICES.note },
      calls: calls.length, ok: ok.length, failed: calls.filter(function (c) { return !c.ok; }).length,
      retries: calls.filter(function (c) { return c.attempt > 0; }).length, continuations: calls.filter(function (c) { return c.part > 0; }).length,
      missing: missing.length, unpriced: ok.filter(function (c) { return !cost(c); }).length,
      tokens: T, cost: byCat, byTask: byTask,
      cacheReadCallRatio: { num: readCalls.length, den: withBp.length, label: '캐시를 읽은 호출 / 캐시 지점이 있는 성공 호출' },
      cacheReadInputRatio: { num: T.cacheRead, den: inputAll, label: '캐시 읽기 토큰 / 전체 입력 토큰(일반+캐시 쓰기+캐시 읽기, 성공 호출)' },
      diag: diag, top: top,
    };
  }

  function exportRun(runId, fmt) {
    var s = summarize(runId), calls = callsOf(runId);
    var name = 'api-usage_' + runId + (fmt === 'csv' ? '.csv' : '.json');
    var data;
    if (fmt === 'csv') {
      var cols = ['callId', 'task', 'batch', 'attempt', 'retryReason', 'part', 'model', 'respModel', 'at', 'ms', 'ok', 'status', 'stopReason', 'input', 'cacheWrite', 'cw5m', 'cw1h', 'cacheRead', 'output', 'thinking', 'webSearches', 'usageMissing', 'estCostUSD', 'error'];
      var q = function (v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v) || /^\d+\/\d+$/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      data = '﻿' + cols.join(',') + '\n' + calls.map(function (c) {
        var u = c.usage || {}, k = cost(c);
        var row = Object.assign({}, c, { input: u.input, cacheWrite: u.cacheWrite, cw5m: u.cw5m, cw1h: u.cw1h, cacheRead: u.cacheRead, output: u.output, thinking: u.thinking, webSearches: u.webSearches, usageMissing: !c.usage, estCostUSD: k ? k.total.toFixed(6) : '' });
        return cols.map(function (h) { return q(row[h]); }).join(',');
      }).join('\n');
    } else data = JSON.stringify({ summary: s, calls: calls }, null, 1);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: fmt === 'csv' ? 'text/csv' : 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
  }

  function clearAll() { recs = []; current = null; save(); }

  // ── 화면: 실행 목록 + 선택한 실행의 요약·캐시 진단 ──
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var usd = function (v) { return v == null ? '—' : '$' + (v < 0.01 ? v.toFixed(4) : v.toFixed(3)); };
  var n = function (v) { return (v || 0).toLocaleString(); };
  var local = function (iso) { if (!iso) return ''; var d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  var pct = function (r) { return r.den ? (r.num / r.den * 100).toFixed(1) + '% (' + n(r.num) + ' / ' + n(r.den) + ')' : '— (분모 0)'; };

  function showReport(runId) {
    var list = runs().filter(function (r) { return callsOf(r.id).length; });
    if (!runId) runId = list[0] && list[0].id;
    var m = document.getElementById('usageModal');
    if (!m) { m = document.createElement('div'); m.id = 'usageModal'; m.className = 'ul-modal'; document.body.appendChild(m); }
    var body;
    if (!runId) body = '<p class="ul-empty">아직 기록된 API 호출이 없습니다. 교정이나 검토를 AI로 실행하면 여기에 쌓입니다.</p>';
    else {
      var s = summarize(runId), c = s.cost, T = s.tokens;
      body = '<div class="ul-head"><b>' + esc(s.run.kind || '') + '</b> <small>' + esc(runId) + ' · ' + esc(local(s.run.startedAt)) + (s.run.info && s.run.info.file ? ' · ' + esc(s.run.info.file) : '') + '</small></div>' +
        '<div class="ul-kpis">' +
        '<div><span>추정 비용</span><b>' + usd(c.total) + '</b><small>' + (s.unpriced ? '요금 모르는 호출 ' + s.unpriced + '건 제외' : '공식 요금 기준 추정') + '</small></div>' +
        '<div><span>호출</span><b>' + s.calls + '</b><small>성공 ' + s.ok + ' · 실패 ' + s.failed + ' · 재시도 ' + s.retries + (s.continuations ? ' · 이어 받기 ' + s.continuations : '') + '</small></div>' +
        '<div class="' + (s.missing ? 'warn' : '') + '"><span>사용량 미확인</span><b>' + s.missing + '</b><small>응답을 못 받은 요청 — 비용 0으로 보지 않음</small></div>' +
        '<div><span>캐시 읽은 호출</span><b>' + pct(s.cacheReadCallRatio) + '</b><small>' + esc(s.cacheReadCallRatio.label) + '</small></div>' +
        '<div><span>입력 중 캐시 읽기</span><b>' + pct(s.cacheReadInputRatio) + '</b><small>' + esc(s.cacheReadInputRatio.label) + '</small></div></div>' +
        '<h4>항목별 비용</h4><table class="ul-t"><tr><th>일반 입력</th><th>캐시 쓰기 5분</th><th>캐시 쓰기 1시간</th><th>캐시 읽기</th><th>출력</th><th>웹 검색</th><th>합계</th></tr>' +
        '<tr><td>' + usd(c.input) + '<small>' + n(T.input) + '</small></td><td>' + usd(c.write5m) + '</td><td>' + usd(c.write1h) + '</td><td>' + usd(c.read) + '<small>' + n(T.cacheRead) + '</small></td><td>' + usd(c.output) + '<small>' + n(T.output) + (T.thinking ? ' (사고 ' + n(T.thinking) + ')' : '') + '</small></td><td>' + usd(c.webSearch) + '<small>' + n(T.webSearches) + '회</small></td><td><b>' + usd(c.total) + '</b></td></tr></table>' +
        '<p class="ul-note">캐시 쓰기 토큰 ' + n(T.cacheWrite) + '. 계산상 비교: 같은 요청·토큰에 캐시가 전혀 없었다면 ' + usd(c.noCache) + ' (실제 실행 기록으로 계산한 가정값이며 청구액이 아님)</p>' +
        '<h4>작업별</h4><table class="ul-t"><tr><th>작업</th><th>호출</th><th>재시도</th><th>미확인</th><th>일반 입력</th><th>캐시 쓰기</th><th>캐시 읽기</th><th>출력</th><th>추정 비용</th></tr>' +
        s.byTask.map(function (t) { return '<tr><td>' + esc(t.task) + '</td><td>' + t.calls + '</td><td>' + t.retries + '</td><td>' + t.missing + '</td><td>' + n(t.input) + '</td><td>' + n(t.cacheWrite) + '</td><td>' + n(t.cacheRead) + '</td><td>' + n(t.output) + '</td><td>' + usd(t.cost) + (t.unpriced ? ' <small>+요금 모름 ' + t.unpriced + '</small>' : '') + '</td></tr>'; }).join('') + '</table>' +
        '<h4>비용이 큰 호출</h4><ol class="ul-top">' + s.top.map(function (x) { return '<li><b>' + usd(x.cost) + '</b> ' + esc(x.task) + (x.batch !== '' ? ' · 배치 ' + esc(x.batch) : '') + ' — 가장 큰 항목: ' + esc(x.main) + ' ' + usd(x.mainCost) + ' <small>(입력 ' + n(x.usage.input) + ' · 쓰기 ' + n(x.usage.cacheWrite) + ' · 읽기 ' + n(x.usage.cacheRead) + ' · 출력 ' + n(x.usage.output) + (x.stopReason ? ' · ' + esc(x.stopReason) : '') + ')</small></li>'; }).join('') + '</ol>' +
        '<h4>캐시 진단</h4><ul class="ul-diag">' + (s.diag.length ? s.diag.map(function (d) { return '<li class="' + d.level + '"><b>' + esc(d.task) + '</b> ' + esc(d.msg) + '</li>'; }).join('') : '<li>진단할 성공 호출이 없습니다.</li>') + '</ul>' +
        '<p class="ul-note">요금: <a href="' + esc(s.prices.source) + '" target="_blank" rel="noopener">공식 요금표</a> (' + esc(s.prices.checked) + ' 확인) — ' + esc(s.prices.note) + '. 이 화면은 이 브라우저에서 보낸 요청만 기록합니다(다른 기기·서버 스크립트 제외).</p>';
    }
    m.innerHTML = '<div class="ul-box" role="dialog" aria-label="API 사용량">' +
      '<div class="ul-bar"><h3>💰 API 사용량</h3>' +
      (list.length ? '<select onchange="UsageLog.showReport(this.value)">' + list.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === runId ? ' selected' : '') + '>' + esc(local(r.startedAt).slice(5, 16)) + ' · ' + esc(r.kind) + ' (' + callsOf(r.id).length + '회)</option>'; }).join('') + '</select>' : '') +
      '<span class="ul-sp"></span>' +
      (runId ? '<button onclick="UsageLog.exportRun(\'' + esc(runId) + '\', \'json\')">JSON 내보내기</button><button onclick="UsageLog.exportRun(\'' + esc(runId) + '\', \'csv\')">CSV 내보내기</button>' : '') +
      '<button onclick="if (confirm(\'API 사용량 기록을 모두 지울까요?\')) { UsageLog.clearAll(); UsageLog.showReport(); }">기록 지우기</button>' +
      '<button class="ul-x" aria-label="닫기" onclick="document.getElementById(\'usageModal\').remove()">✕</button></div>' +
      '<div class="ul-body">' + body + '</div></div>';
    m.onclick = function (e) { if (e.target === m) m.remove(); };
  }

  /** 실행이 끝나면 한 줄 알림 */
  function toastRun(runId) {
    var s = summarize(runId);
    if (!s.calls || typeof root.showToast !== 'function') return;
    root.showToast('API ' + s.calls + '회 · 추정 ' + usd(s.cost.total) + ' · 캐시 읽기 ' + pct(s.cacheReadInputRatio).split(' ')[0] + (s.missing ? ' · 사용량 미확인 ' + s.missing + '회' : '') + ' — 💰 API 사용량에서 자세히', s.missing ? 'yellow' : 'blue');
  }

  root.UsageLog = { PRICES: PRICES, begin: begin, end: end, activeRunId: activeRunId, promptMeta: promptMeta, record: record, cost: cost,
    runs: runs, callsOf: callsOf, summarize: summarize, exportRun: exportRun, clearAll: clearAll, hash: hash, showReport: showReport, toastRun: toastRun };
})(typeof window !== 'undefined' ? window : globalThis);
