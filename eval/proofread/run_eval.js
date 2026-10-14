#!/usr/bin/env node
/**
 * 교정 도우미(panel8) 교정율 평가
 *
 * 깨끗한 원고(source.json)에 정답이 정해진 오류(cases.json)를 심고,
 * panel8의 실제 검사 코드(checkSurface·checkTermConsistency·checkLinguistic)를 그대로 돌려 채점한다.
 *   - 탐지율: 심은 오류 위치를 지적한 비율
 *   - 정확 수정률: 그 지적의 수정안을 적용하면 원래(정답) 표기로 돌아가는 비율
 *   - 추가 지적: 심지 않은 곳을 지적한 건수(원고가 편집 완료본이면 대부분 오탐)
 * 네이버 맞춤법(JSONP)은 브라우저 전용이라 이 평가에 포함되지 않는다.
 *
 * 사용법 (출판도우미/ 에서):
 *   ANTHROPIC_API_KEY=... node eval/proofread/run_eval.js --label baseline
 *   node eval/proofread/run_eval.js --oracle     # 채점기 점검: 100% 나와야 정상
 *   node eval/proofread/run_eval.js --null       # 채점기 점검: 0% 나와야 정상
 *   node eval/proofread/run_eval.js --surface    # AI 없이 규칙 검사만 (무료)
 *   ... --md                                     # Markdown판 원고로 실행 (MD 변환 효과 비교)
 *   node eval/proofread/run_eval.js --regrade results/baseline.json  # 저장된 지적으로 재채점
 *
 * v2.17.0 프로필 연결 평가(eval/profile):
 *   ... --profile eval/profile/profile_codex.json   # 책 프로필을 연결한 조건(없으면 '프로필 없음' 전달)
 *   ... --normal eval/profile/normal.json           # 정상 문장을 심어 오지적 측정(정상 조사 반복·단어 내부 문자열)
 *   ... --runs 2 --out eval/profile/results/proof --label on   # on-1.json, on-2.json
 *   ... --fake                                      # 가짜 API로 배선만 확인(유료 호출 없음)
 *   ... --root <코드 트리>                           # 다른 코드 트리로 실행(예: 변경 직전 커밋 스냅샷) — 현재 작업 파일은 건드리지 않음
 *   ... --key-file <경로>                            # 키를 명령문·채팅에 쓰지 않고 파일에서 읽음(결과·로그에 저장하지 않음)
 *   ... --max-usd 3                                  # 이 실행(반복 전체)의 누적 추정 비용 상한 — 넘으면 다음 요청을 막는다
 *   (비용 상한 주의) 상한은 요청을 보내기 '전'에만 막는다 — 이미 보낸 요청은 끊지 않는다. 판단은 '집계가 끝난 누적 + 진행 중인 요청들의 예상 최대(pending) + 이 요청 예상 최대'.
 *     한계: 예상 최대에는 웹 검색 '결과'가 입력 토큰으로 들어오는 몫이 없다(검색 횟수 요금 max_uses만 포함) — 웹 검색을 쓰는 근거 검증 호출 1건은 예상 최대를 넘을 수 있고,
 *     그만큼 상한을 넘을 수 있다. 따라서 상한은 '요청 전 차단' 기준의 근사이며 실제 청구액을 보장하지 않는다.
 *     사용량을 받지 못한 호출(스트림 중단·응답 읽기 실패 등)은 비용 0이 아니라 '비용 미확인'으로 기록하고, 그 예상 최대를 누적 쪽에 잡아 둔 채 이후 요청을 모두 차단한다
 *     (상한 준수를 보장할 수 없으므로 — 진행 중인 요청은 끊지 않음). 상한에 걸리거나 비용 미확인이 생긴 실행은 결과 JSON에 incomplete로 표시된다(정상 실행으로 집계하지 말 것).
 *     --max-usd 없이 돌리면 차단 없이 기록만 한다 — 유료 실험은 반드시 --max-usd를 주고 실행할 것.
 *
 * API 비용·시간 최적화 비교(2026-10-13) — 조건값은 결과 JSON의 condition에, 호출별 기록은 calls에 남는다:
 *   ... --concurrency 1|2                            # AI 검사 묶음 동시 실행 수(기본 1). 2 = 첫 묶음 단독 뒤 최대 2개씩
 *   ... --rag-tail-cache on|off                      # RAG 꼬리 뒤 문체 위생 블록 캐시 표시(기본 on = 앱 기본·기존 동작, off = 비교 실험)
 *   ... --fake --fake-delay 200                      # 가짜 응답을 ms만큼 늦춰 동시 실행 배선·모의 시간을 확인(유료 호출 없음)
 *   ... --fake --fake-break 1 --max-usd 5            # n번째 가짜 응답을 사용량 없는 응답으로 — '비용 미확인 → 이후 차단 → incomplete' 경로 확인
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS } = require('../../scripts/run_tests.js');

const DIR = __dirname;
const ROOT = path.join(__dirname, '../..');

// ── 평가 공용: 키 파일·비용 상한·코드 스냅샷(키 값은 어디에도 출력·저장하지 않는다) ──
const crypto = require('crypto');
function readKey(argVal, fake) {
  if (fake) return 'sk-ant-fake';
  const kf = argVal('--key-file');
  if (kf) {
    const t = fs.readFileSync(path.resolve(kf), 'utf8').split(/\r?\n/).map(x => x.trim()).find(x => /^sk-ant-/.test(x));
    if (!t) throw new Error('키 파일에 sk-ant- 로 시작하는 줄이 없습니다');
    return t;
  }
  return process.env.ANTHROPIC_API_KEY || '';
}
function snapshotOf(root, files) { // 평가에 쓴 코드 트리: 파일별 SHA-256 + git 정보
  const out = { root, files: {} };
  for (const f of files) { const p = path.join(root, f); if (fs.existsSync(p)) out.files[f] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16); }
  try { const cp = require('child_process'); out.gitHead = cp.execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    out.gitDirty = cp.execSync('git status --porcelain -- shared panels', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').filter(Boolean); } catch (e) { out.gitHead = '(git 없음 — 스냅샷 폴더)'; }
  return out;
}
/** 비용 상한: 응답의 usage로 누적 추정 비용을 세고, 상한을 넘으면 다음 요청을 보내기 전에 막는다(진행 중 요청 1건은 넘을 수 있음) */
function makeCostGuard(maxUsd) {
  const P = { input: 3, write: 3.75, read: 0.30, output: 15 }; // Sonnet 4.6 공식 요금(USD/100만 토큰), 1시간 캐시는 6 — 상한 판단용 근사
  const g = { usd: 0, calls: 0, blocked: 0, maxUsd, unknown: 0, unknownUsd: 0 }; // unknown: 사용량을 받지 못한 호출 수(비용 미확인), unknownUsd: 그 호출들의 예상 최대 합
  const WEB = 10 / 1000; // 웹 검색 $10/1,000회(공식 요금, usage-log.js PRICES와 같음)
  g.add = u => { if (!u) return false; g.calls++; g.usd += ((u.input_tokens || 0) * P.input + (u.cache_creation_input_tokens || 0) * P.write + (u.cache_read_input_tokens || 0) * P.read + (u.output_tokens || 0) * P.output) / 1e6
    + ((u.server_tool_use && u.server_tool_use.web_search_requests) || 0) * WEB; return true; };
  /** 요청 전 차단: 누적 추정 비용 + 이 요청의 예상 최대 비용(입력 전부를 캐시 쓰기 요금으로, 글자 1자=1토큰으로 과대 추정 + max_tokens 전부 출력)이 상한을 넘으면 보내지 않는다 */
  g.estimate = body => {
    const chars = JSON.stringify(body && body.system || '').length + JSON.stringify(body && body.messages || '').length + JSON.stringify(body && body.tools || '').length;
    const maxOut = (body && body.max_tokens) || 8192;
    const maxSearch = ((body && body.tools) || []).reduce((s, t) => s + (/web_search/.test(t.type || '') ? (t.max_uses || 0) : 0), 0);
    return (chars * P.write + maxOut * P.output) / 1e6 + maxSearch * WEB;
  };
  g.pending = 0; // 보냈지만 아직 사용량이 집계되지 않은 요청들의 예상 최대 합(동시 진행분)
  /** 요청 전: 집계된 누적 + 진행 중 요청의 예상 최대 + 이 요청 예상 최대가 상한을 넘으면 막는다. 통과하면 예상치를 pending에 올리고 그 값을 돌려준다(집계 뒤 release로 내린다) */
  g.check = body => {
    if (!maxUsd) return 0; // 상한 없는 실행: 막지 않는다(기록만)
    // 비용 미확인 호출이 한 건이라도 있으면 누적을 믿을 수 없다 — 상한 준수를 보장할 수 없으므로 이후 요청은 보내지 않는다(진행 중인 요청은 끊지 않음)
    if (g.unknown) { g.blocked++; throw new Error(`비용 상한 $${maxUsd}: 비용 미확인 호출 ${g.unknown}건 — 상한 준수를 보장할 수 없어 중단(요청 전 차단)`); }
    const est = g.estimate(body || {});
    g.lastEstimate = est;
    if (g.usd + g.pending + est > maxUsd) { g.blocked++; throw new Error(`비용 상한 $${maxUsd}: 누적 추정 $${g.usd.toFixed(3)} + 진행 중 예상 $${g.pending.toFixed(3)} + 이 요청 예상 최대 $${est.toFixed(3)} > 상한 — 요청 전 차단`); }
    g.pending += est;
    return est;
  };
  g.release = est => { g.pending = Math.max(0, g.pending - (est || 0)); };
  /** 사용량을 받지 못한 호출: 비용 0이 아니라 '미확인'. 예약(pending)은 내리지 않는다 — 그 예상 최대를 누적 쪽에 계속 잡아 둔다 */
  g.markUnknown = (est, body) => { g.unknown++; g.unknownUsd += est || g.estimate(body || {}); };
  g.noteStream = text => { // SSE 응답: message_start usage(입력·캐시)에 마지막 message_delta usage(출력 누계·서버 도구 수)를 덮어써 한 번만 센다(앱 _readSseMessage와 같은 방식).
    // 이벤트를 JSON으로 읽는다 — usage 안에 중첩 객체(cache_creation·server_tool_use)가 있어도 빠뜨리지 않는다(예전 정규식은 여기서 파싱에 실패해 과소 집계)
    // 반환: 집계했으면 true. message_start(입력)와 message_delta(출력 누계)를 모두 받지 못했거나 error 이벤트가 있으면 집계하지 않고 false(스트림 중단 — 비용 미확인)
    let u = null, started = false, ended = false, failed = false;
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      let d; try { d = JSON.parse(line.slice(5)); } catch (e) { continue; }
      if (d.type === 'message_start' && d.message && d.message.usage) { u = Object.assign({}, d.message.usage); started = true; }
      else if (d.type === 'message_delta' && d.usage) { u = Object.assign(u || {}, d.usage); ended = true; }
      else if (d.type === 'error') failed = true;
    }
    if (!started || !ended || failed) return false;
    return g.add(u);
  };
  return g;
}
/** 비용 상한을 거치는 fetch 래퍼(두 하네스 공용 모양): 요청 전 check → 전송(send) → 응답 사용량 집계(스트림은 noteStream, 아니면 add) → pending 해제.
 *  onBody(본문 객체): 요청 증빙 기록, onJson(응답 JSON): 비스트리밍 응답 추가 집계 */
/** 연결 단계에서 실패해 요청이 서버에 닿지 않은 것이 확실한 오류(이름 풀이 실패·연결 거부·도달 불가·연결 시간 초과). 그 밖(연결 뒤 끊김·시간 초과·원인 불명)은 닿았을 수 있다 */
const NOT_SENT_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'];
const connectFailed = e => NOT_SENT_CODES.includes((e && e.cause && e.cause.code) || (e && e.code) || '');
/** 호출 한 건의 비용 판정 기준:
 *   과금 없음(예약 반환): ① 전송 전 차단(check가 던짐) ② 연결 단계 실패(connectFailed) ③ HTTP 오류 응답(res.ok 아님 — 오류 응답은 과금되지 않는다)
 *   집계(예약 반환): 응답 usage를 받음(비스트리밍 JSON의 usage, 스트림의 message_start + message_delta)
 *   비용 미확인(예약 유지·이후 요청 차단): 그 밖 전부 — 연결 뒤 끊긴 전송 오류, 스트림 중단·error 이벤트, 응답 본문 읽기 실패, 성공 응답인데 usage 없음. 불확실하면 미확인으로 본다 */
function guardedFetch(guard, send, onBody, onJson) {
  return async (url, opts) => {
    let bodyObj = null; try { bodyObj = JSON.parse(opts.body); } catch (e) { /* 본문 없음 */ }
    const est = guard.check(bodyObj); // 상한을 넘거나 비용 미확인 호출이 있으면 여기서 던진다(전송 안 함)
    try { if (bodyObj && onBody) onBody(bodyObj); } catch (e) { guard.release(est); throw e; } // 전송 전
    let res;
    try { res = await send(url, opts, bodyObj); }
    catch (e) { if (connectFailed(e)) guard.release(est); else guard.markUnknown(est, bodyObj); throw e; }
    if (res.ok === false) { guard.release(est); return res; } // HTTP 오류 응답 — 과금 없음
    const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    (/event-stream/.test(ct) ? res.clone().text().then(t => guard.noteStream(t)) : res.clone().json().then(j => { const ok = guard.add(j && j.usage); if (onJson) onJson(j); return ok; }))
      .catch(() => false).then(ok => { if (ok) guard.release(est); else guard.markUnknown(est, bodyObj); });
    return res;
  };
}
/** 호출별 기록(UsageLog 재사용): 시작 시각·소요·꼬리표·사용량·재시도·캐시 지점 접두부 해시·effort. 키·본문은 UsageLog가 애초에 저장하지 않는다 */
function callRecords(U) {
  if (!U) return [];
  return U.runs().flatMap(r => U.callsOf(r.id)).map(c => ({ at: c.at, ms: c.ms, task: c.task, batch: c.batch, attempt: c.attempt, retry: !!c.attempt, retryReason: c.retryReason, part: c.part, model: c.model, ok: c.ok, status: c.status, stopReason: c.stopReason || '', error: c.error || '',
    usage: c.usage, effort: c.prompt ? c.prompt.effort || '' : '', cachePoints: c.prompt ? c.prompt.breakpoints.map(b => ({ at: b.at, prefixHash: b.prefixHash, prefixChars: b.prefixChars, ttl: b.ttl })) : [] }));
}
const arg = name => process.argv.includes(name);
const argVal = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

// ── 오류 심기 ───────────────────────────────────────────────
function seed(source, cases) {
  const pages = source.pages.map(p => ({ ...p }));
  const byPage = new Map(pages.map(p => [p.page, p]));
  const located = [];
  // 같은 페이지 안에서는 뒤에서부터 치환해야 앞쪽 위치가 유지된다
  // 원고 판본마다 페이지 나눔이 달라 오류 위치는 문서 전체에서 찾는다(문서 안에서 유일해야 함)
  const sorted = cases.map(c => {
    const hits = pages.filter(p => p.text.includes(c.orig));
    if (!hits.length) throw new Error(`${c.id}: 원문에 "${c.orig}" 없음`);
    const p = hits[0];
    const at = p.text.indexOf(c.orig);
    if (hits.length > 1 || p.text.indexOf(c.orig, at + 1) >= 0) throw new Error(`${c.id}: "${c.orig}"가 문서에 2번 이상 — 앞뒤 문맥을 늘리세요`);
    c = { ...c, page: p.page };
    if (c.orig === c.wrong) throw new Error(`${c.id}: orig와 wrong이 같음`);
    return { c, p, at };
  }).sort((a, b) => (a.p.page - b.p.page) || (b.at - a.at));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (a.p === b.p && b.at + b.c.orig.length > a.at) throw new Error(`${a.c.id}·${b.c.id}: 같은 위치에 겹침`);
  }
  for (const { c, p, at } of sorted) {
    p.text = p.text.slice(0, at) + c.wrong + p.text.slice(at + c.orig.length);
  }
  // 치환이 끝난 뒤 최종 위치 계산 (같은 페이지의 앞선 치환 길이 차 반영)
  for (const { c } of sorted) {
    const p = byPage.get(c.page);
    const at = p.text.indexOf(c.wrong);
    located.push({ ...c, start: at, end: at + c.wrong.length });
  }
  return { pages, cases: located };
}

// ── 정상 문장 심기(오류를 심은 뒤 앵커 문장 바로 뒤에 붙인다) ──
function seedNormal(seeded, normal) {
  const spans = [];
  for (const n of normal.seeds) {
    const hits = seeded.pages.filter(p => p.text.includes(n.after));
    if (hits.length !== 1 || hits[0].text.indexOf(n.after, hits[0].text.indexOf(n.after) + 1) >= 0) throw new Error(`${n.id}: 앵커 "${n.after}"가 본문에 정확히 한 번 있어야 합니다(${hits.length}쪽)`);
    const p = hits[0], at = p.text.indexOf(n.after) + n.after.length;
    p.text = p.text.slice(0, at) + n.text + p.text.slice(at);
    // 같은 쪽의 뒤쪽 오류 위치를 밀어 준다
    for (const c of seeded.cases) if (c.page === p.page && c.start >= at) { c.start += n.text.length; c.end += n.text.length; }
    for (const sp of spans) if (sp.page === p.page && sp.start >= at) { sp.start += n.text.length; sp.end += n.text.length; } // 앞서 심은 정상 문장 위치도 민다
    if (n.kind === 'error') { // 심은 오류 문장: 35건에 더해 같은 채점
      const k = n.text.indexOf(n.wrong);
      if (k < 0 || n.text.indexOf(n.wrong, k + 1) >= 0) throw new Error(`${n.id}: 문장 안에 wrong이 정확히 한 번 있어야 합니다`);
      seeded.cases.push({ id: n.id, group: n.group || '코드·병기', cat: n.cat || n.kind, orig: n.orig, wrong: n.wrong, accept: n.accept || [], page: p.page, start: at + k, end: at + k + n.wrong.length, seededSentence: true });
      continue;
    }
    spans.push({ ...n, page: p.page, start: at, end: at + n.text.length });
  }
  return spans;
}
/** 정상 문장에 걸린 지적: 정상이라고 정한 문장을 바꾸자는 지적(수정안이 원문과 다름)이면 '오지적',
 *  수정안 없는 안내(조사중복·주어과다 검토 등)는 정답이 없으므로 '사람 검토'. 단계(오류 교정/문맥 검토/선택적 윤문)는 함께 기록 */
function gradeNormal(seeded, spans, issues, classify, cleanSuggestion) {
  const textOf = new Map(seeded.pages.map(p => [p.page, p.text]));
  return spans.map(n => {
    const hits = [];
    issues.forEach(iss => {
      if (iss.page !== n.page) return;
      for (const [s, e] of issueSpans(iss, textOf.get(iss.page) || '')) {
        if (e <= n.start || s >= n.end) continue;
        const pageText = textOf.get(iss.page) || '';
        const level = classify ? classify(iss, pageText).level : '';
        const repl = cleanSuggestion ? cleanSuggestion(iss) : (iss.suggestion || '');
        const changes = !!repl && repl !== iss.found;
        // 이웃 오류 수정이 겹치기만 한 경우: 수정안을 적용해도 정상 문장 자체가 그대로면 오지적이 아니다(통과)
        const sentence = n.text.trim();
        const after = changes ? pageText.slice(0, s) + repl + pageText.slice(e) : pageText;
        const intact = changes && after.includes(sentence);
        // 문맥 지적(삭제·이동·저자 확인): 심은 문장이 앞뒤 문단과 어긋나서 나오는 지적 — 삽입 위치 탓일 수 있어 오지적과 분리
        const contextual = /^\s*\[|삭제|이동|저자에게|섹션/.test(String(iss.suggestion || '')) || /내용보완필요|문단연결불량|저자확인필요|구성/.test(iss.type || '');
        const verdict = contextual ? '문맥 지적' : !changes ? '검토 요청' : intact ? '이웃 수정 겹침' : '오지적';
        hits.push({ type: iss.type, source: iss.source || 'surface', found: iss.found, suggestion: iss.suggestion || '', description: String(iss.description || '').slice(0, 100), level, verdict, applyPath: applyPath(iss, pageText, cleanSuggestion || (x => x.suggestion || ''), level) });
        break;
      }
    });
    const order = ['오지적', '문맥 지적', '검토 요청', '이웃 수정 겹침'];
    const top = order.find(v => hits.some(h => h.verdict === v));
    return { id: n.id, kind: n.kind, desc: n.desc, expect: n.expect || '', text: n.text.trim(), hits, verdict: top === '이웃 수정 겹침' || !top ? '정상 통과' : top === '검토 요청' ? '사람 검토' : top };
  });
}
/** AI 수정안의 의미 훼손 후보: 숫자·영문 토큰이 바뀌면 사람 검토 대상으로 표시 */
function meaningFlags(found, sugg) {
  const tok = t => ({ num: (String(t || '').match(/\d+(?:[.:]\d+)?/g) || []).join(','), en: (String(t || '').match(/[A-Za-z][A-Za-z0-9_.-]*/g) || []).join(',') });
  const a = tok(found), b = tok(sugg), f = [];
  if (a.num !== b.num) f.push('숫자 변경');
  if (a.en !== b.en) f.push('영문 용어 변경');
  return f;
}

// ── 채점 ───────────────────────────────────────────────────
function issueSpans(iss, text) {
  const found = (iss.found || '').trim();
  if (!found) return [];
  const spans = [];
  if (Number.isInteger(iss.start) && text.slice(iss.start, iss.start + found.length) === found) {
    spans.push([iss.start, iss.start + found.length]);
  } else {
    for (let at = text.indexOf(found); at >= 0; at = text.indexOf(found, at + 1)) spans.push([at, at + found.length]);
  }
  return spans;
}

/** 교정본 반영 조건(앱 _getCorrections와 같은 조건, '해결됨' 표시는 편집자 몫): found가 본문에 그대로 있고, 수정안이 지시문이 아닌 문장이며 원문과 다르고,
 *  noAutoReplace(긴·여러 줄 예시, 원문·수정안 불일치 가드)가 아니고, 조판·추출 단계가 아닐 때 → '해결됨 표시 시 교정본 반영'. 아니면 '카드 안내만(원고 반영 없음)' */
function applyPath(iss, text, cleanSuggestion, level) {
  if (!iss.found || !text.includes(iss.found)) return '반영 불가(원문 불일치)';
  if (iss.noAutoReplace) return '반영 불가(예시·참고용)';
  if (level === 'layout' || level === 'extract') return '반영 불가(조판·추출 확인)';
  const repl = cleanSuggestion(iss);
  if (!repl) return '안내만(수정안 없음·지시문)';
  if (repl === iss.found) return '안내만(수정안=원문)';
  return '해결됨 표시 시 교정본 반영';
}
function grade(seeded, issues, cleanSuggestion) {
  const textOf = new Map(seeded.pages.map(p => [p.page, p.text]));
  const perCase = seeded.cases.map(c => ({ id: c.id, cat: c.group || c.cat, sub: c.cat, page: c.page, wrong: c.wrong, orig: c.orig, detected: false, fixed: false, rawFixed: false, cleanLoss: false, aimed: false, tier: '미탐', by: [] }));
  const hit = new Set();
  issues.forEach((iss, idx) => {
    const text = textOf.get(iss.page) || '';
    for (const [s, e] of issueSpans(iss, text)) {
      perCase.forEach((r, ci) => {
        const c = seeded.cases[ci];
        if (c.page !== iss.page || e <= c.start || s >= c.end) return;
        hit.add(idx);
        r.detected = true;
        const repl = cleanSuggestion(iss);
        const fixedText = repl ? text.slice(0, s) + repl + text.slice(e) : text;
        // 원래 표기로 되돌리면 정답. 비문·사실처럼 문장을 다시 쓰거나 설명으로 답하는 경우는
        // 케이스의 accept(핵심 정답어)가 수정안에 들어 있으면 인정
        const ok = (repl && fixedText.includes(c.orig) && !fixedText.slice(Math.max(0, s - 20), s + repl.length + 20).includes(c.wrong))
          || (c.accept || []).some(a => (repl || '').includes(a) || (iss.suggestion || '').includes(a));
        // 엄격 탐지: 수정안이 정답을 복원했거나(정확 수정), 설명·수정안이 심은 오류 문자열이나 정답 문자열을 직접 언급(설명 겨냥).
        // found가 오류 구간을 '포함'하기만 한 것은 성공으로 치지 않고 '겹침만'(사람 검토)으로 둔다
        const desc = String(iss.description || '') + ' ' + String(iss.suggestion || '');
        // found가 오류 문자열 '안'에 들어가는 조각(예: 규칙이 '~에 있어서'만 집어냄)이면 그 오류를 겨냥한 것으로 본다. 반대로 found가 오류 구간을 포함하는 긴 구간(문장·표 행)은 겨냥으로 보지 않는다
        const foundIn = !!iss.found && iss.found.trim().length >= 2 && c.wrong.includes(iss.found.trim()) && iss.found.trim() !== c.wrong && !c.orig.includes(iss.found.trim());
        const nums = x => (String(x).match(/\d+(?:[.:]\d+)*/g) || []); // 숫자 묶음('15:12', '2.5')은 통째로 비교
        const distinct = c.wrong.split(/[\s,.:;()"'·→]+/).filter(t => t.length >= 2 && !/^\d+$/.test(t) && !c.orig.includes(t)).concat(nums(c.wrong).filter(t => !nums(c.orig).includes(t))); // 오류 문자열에만 있는 토큰(예: '15:12', '훌적')
        const broad = !!iss.found && iss.found.includes(c.wrong) && iss.found.trim().length > c.wrong.length + 10; // 문장·표 행 전체를 잡은 지적은 설명에 오류가 인용돼 있어도 겨냥으로 보지 않는다
        const aimed = ok || (!broad && (desc.includes(c.wrong) || desc.includes(c.orig) || (c.accept || []).some(a => desc.includes(a)) || foundIn || distinct.some(t => desc.includes(t))));
        r.by.push({ type: iss.type, source: iss.source || 'surface', found: iss.found, suggestion: iss.suggestion, description: String(iss.description || '').slice(0, 120), fixes: !!ok, aimed, applyPath: applyPath(iss, text, cleanSuggestion, iss.level) });
        // 수정안 원문(정리 전)은 정답인데 앱의 수정안 정리(_cleanSuggestion: 'X (설명)' 괄호 제거 등)를 거치면 정답이 아니게 되는 경우 — 반영 시 손실(사람 검토)
        const rawRepl = String(iss.suggestion || '').trim();
        const rawText = rawRepl ? text.slice(0, s) + rawRepl + text.slice(e) : text;
        const okRaw = !!rawRepl && rawText.includes(c.orig) && !rawText.slice(Math.max(0, s - 20), s + rawRepl.length + 20).includes(c.wrong);
        if (okRaw) r.rawFixed = true; // AI(또는 규칙)가 낸 수정안 자체의 정답 여부 — '지적·수정안 품질'
        if (okRaw && !ok) { r.cleanLoss = true; r.by[r.by.length - 1].cleanLoss = true; }
        if (ok) r.fixed = true;
        if (aimed) r.aimed = true;
      });
    }
  });
  perCase.forEach(r => { r.tier = r.fixed ? '정확 수정' : r.cleanLoss ? '수정안 정답·반영 시 손실(사람 검토)' : r.aimed ? '설명 겨냥' : r.detected ? '겹침만(사람 검토)' : '미탐'; });
  const extra = issues.filter((_, i) => !hit.has(i)).map(i => ({ page: i.page, type: i.type, source: i.source || 'surface', found: i.found, suggestion: i.suggestion, description: String(i.description || '').slice(0, 120), applyPath: applyPath(i, textOf.get(i.page) || '', cleanSuggestion, i.level) }));
  const n = perCase.length;
  const cats = {};
  for (const r of perCase) {
    const k = cats[r.cat] ||= { total: 0, detected: 0, aimed: 0, fixed: 0 };
    k.total++; if (r.detected) k.detected++; if (r.aimed) k.aimed++; if (r.fixed) k.fixed++;
  }
  return {
    metrics: {
      cases: n,
      detected: perCase.filter(r => r.detected).length,   // 느슨(겹침) — 참고용
      aimed: perCase.filter(r => r.aimed).length,         // 엄격(정확 수정 또는 설명 겨냥)
      fixed: perCase.filter(r => r.fixed).length,            // 반영 품질: 정리 규칙을 거친 수정안이 정답
      rawFixed: perCase.filter(r => r.rawFixed).length,      // 수정안 품질: 수정안 원문이 정답
      cleanLoss: perCase.filter(r => r.cleanLoss).length,    // 수정안은 정답인데 반영 시 손실(영문 병기 등) — 별도 실패 사례
      overlapOnly: perCase.filter(r => r.tier === '겹침만(사람 검토)').length,
      recall: n ? perCase.filter(r => r.detected).length / n : 0,
      strictRecall: n ? perCase.filter(r => r.aimed).length / n : 0,
      fixRate: n ? perCase.filter(r => r.fixed).length / n : 0,
      extra: extra.length,
      issues: issues.length,
      byCategory: cats,
    },
    perCase, extra,
  };
}

function report(label, g, usage) {
  const pct = x => (x * 100).toFixed(1) + '%';
  const m = g.metrics;
  // 표본 수 n에서 비율의 95% 신뢰 구간 반폭(정규 근사) — 변경 효과가 이보다 작으면 잡음일 수 있음
  const ci = p => (1.96 * Math.sqrt(p * (1 - p) / Math.max(m.cases, 1)) * 100).toFixed(1);
  console.log(`\n[${label}] 오류 ${m.cases}건`);
  console.log(`  엄격 탐지율 ${pct(m.strictRecall)} (${m.aimed}/${m.cases}, ±${ci(m.strictRecall)}%p — 정확 수정 또는 설명 겨냥) · 겹침만(사람 검토) ${m.overlapOnly}건 · 느슨 탐지 ${pct(m.recall)}`);
  console.log(`  정확 수정률 ${pct(m.fixRate)} (${m.fixed}/${m.cases}, ±${ci(m.fixRate)}%p)`);
  console.log(`  추가 지적   ${m.extra}건 (심지 않은 곳) / 전체 지적 ${m.issues}건`);
  for (const [cat, k] of Object.entries(m.byCategory)) {
    console.log(`    ${cat.padEnd(6)} 엄격 ${k.aimed}/${k.total}  수정 ${k.fixed}/${k.total}  겹침 ${k.detected}/${k.total}`);
  }
  if (usage) {
    console.log(`  모델 ${[...usage.models].join(',') || '-'} · 입력 ${usage.input} · 출력 ${usage.output} · 캐시읽기 ${usage.cacheRead} · 캐시쓰기 ${usage.cacheWrite} 토큰 · 호출 ${usage.calls}회`);
  }
}

// ── 실행 ───────────────────────────────────────────────────
async function main() {
  // --md: 같은 원고의 Markdown판(source_md.json)으로 돌려 MD 변환 효과를 비교
  const source = JSON.parse(fs.readFileSync(path.join(DIR, arg('--md') ? 'source_md.json' : 'source.json'), 'utf8'));
  const cases = JSON.parse(fs.readFileSync(path.join(DIR, 'cases.json'), 'utf8'));
  const seeded = seed(source, cases);
  const normal = argVal('--normal') ? JSON.parse(fs.readFileSync(path.resolve(argVal('--normal')), 'utf8')) : null;
  const normalSpans = normal ? seedNormal(seeded, normal) : [];
  // 정상 문장을 심은 뒤에도 심은 오류 35건의 위치·정답 연결이 그대로인지 확인(위치가 밀렸으면 채점이 깨진다)
  for (const c of seeded.cases) { const t = seeded.pages.find(p => p.page === c.page).text; if (t.slice(c.start, c.end) !== c.wrong) throw new Error(`${c.id}: 정상 문장 심기 뒤 오류 위치가 어긋남`); }
  if (normalSpans.length) console.log(`  정상 문장 ${normalSpans.length}건 심음 — 오류 ${seeded.cases.length}건 위치·정답 연결 확인`);
  fs.writeFileSync(path.join(DIR, 'seeded.json'), JSON.stringify(seeded, null, 1));
  const profile = argVal('--profile') ? JSON.parse(fs.readFileSync(path.resolve(argVal('--profile')), 'utf8')) : null;
  const runs = +(argVal('--runs') || 1);
  const outDir = argVal('--out') ? path.resolve(argVal('--out')) : path.join(DIR, 'results');
  const root = argVal('--root') ? path.resolve(argVal('--root')) : ROOT;
  const guard = makeCostGuard(+(argVal('--max-usd') || 0));
  for (let run = 1; run <= runs; run++) await runOnce({ source, seeded: JSON.parse(JSON.stringify(seeded)), normalSpans, profile, outDir, suffix: runs > 1 ? '-' + run : '', root, guard });
  if (guard.maxUsd) console.log(`  누적 추정 비용 $${guard.usd.toFixed(3)} / 상한 $${guard.maxUsd}${guard.blocked ? ` · 차단 ${guard.blocked}건` : ''}${guard.unknown ? ` · 비용 미확인 ${guard.unknown}건(예상 최대 합 $${guard.unknownUsd.toFixed(3)} 별도)` : ''}`);
}

async function runOnce({ source, seeded, normalSpans, profile, outDir, suffix, root, guard }) {
  const sandbox = makeSandbox();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, models: new Set() };
  const requests = []; // 요청 증빙: 시스템 블록 머리(원고 본문은 기록하지 않음)
  const noteRequest = body => {
    try {
      const sys = Array.isArray(body.system) ? body.system.map(b => b.text || '') : [String(body.system || '')];
      const prof = sys.find(t => t.includes('## 책 프로필')) || '';
      const m = prof.match(/- 분야·세부 분야: ([^\n]*)/);
      requests.push({ blocks: sys.map(t => t.slice(0, 24)), cacheMarks: Array.isArray(body.system) ? body.system.map(b => (b.cache_control ? 1 : 0)).join('') : '', profile: prof ? (m ? m[1] : (prof.includes('프로필 없음') ? '프로필 없음' : '있음(분야 미표기)')) : '블록 없음', model: body.model, stream: !!body.stream });
    } catch (e) { requests.push({ error: e.message }); }
  };
  const blocked0 = guard.blocked, unknown0 = guard.unknown;
  // --fake: 실제 전송 없이 가짜 응답(Response 객체)을 같은 경로(비용 상한·집계)로 흘린다
  sandbox.fetch = guardedFetch(guard, (url, opts, bodyObj) => (arg('--fake') ? fakeResponse(bodyObj) : fetch(url, opts)), noteRequest, j => {
    if (!j || !j.usage) return;
    usage.calls++; usage.models.add(j.model);
    usage.input += j.usage.input_tokens || 0;
    usage.output += j.usage.output_tokens || 0;
    usage.cacheRead += j.usage.cache_read_input_tokens || 0;
    usage.cacheWrite += j.usage.cache_creation_input_tokens || 0;
  });
  const loaded = SCRIPTS.filter(s => fs.existsSync(path.join(root, s)) && !/api-keys/.test(s));
  for (const s of loaded) loadScript(sandbox, s, root);
  const snapshot = snapshotOf(root, loaded);
  const P8 = sandbox.__p8Eval;
  const clean = iss => P8._cleanSuggestion(iss);
  // 책 프로필 연결(v2.17.0): 연결 조건이면 컨셉을 저장소에 넣고 이 원고에 명시적으로 연결, 아니면 '프로필 없음' 전달.
  // 변경 직전 코드 트리(buildCriteria 없음)에서는 프로필 기능 자체가 없다 — 'before' 조건
  const before = typeof P8.buildCriteria !== 'function';
  if (before && profile) throw new Error('변경 직전 코드에는 프로필 연결이 없습니다 — --profile 없이 실행');
  const docKey = source.filename || 'eval.hwp';
  let crit = null;
  if (!before) {
    P8._setDocKey(docKey);
    if (profile) { sandbox.localStorage.setItem('ms_concept_v2', JSON.stringify(profile)); sandbox.p8_setProfileLink(true); }
    crit = P8.buildCriteria();
    if (!!profile !== crit.profileOn) throw new Error('프로필 연결 상태가 조건과 다릅니다');
  }
  console.log(`  코드: ${snapshot.gitHead}${snapshot.gitDirty && snapshot.gitDirty.length ? ' + 미커밋 ' + snapshot.gitDirty.length + '파일' : ''} (${path.basename(root)}) · 기준: ${crit ? crit.ai.text : '변경 직전 코드(프로필 기능 없음)'}`);
  // 실행 조건(동시성·RAG 꼬리 캐시 표시) — 앱의 조정 객체(__p8Eval.AI_TUNE)를 덮어쓴다
  const condition = { concurrency: null, ragTailCache: null, fake: arg('--fake') };
  if (P8.AI_TUNE) {
    if (argVal('--concurrency')) P8.AI_TUNE.concurrency = +argVal('--concurrency');
    if (argVal('--rag-tail-cache')) { if (!/^(on|off)$/.test(argVal('--rag-tail-cache'))) throw new Error('--rag-tail-cache 는 on 또는 off'); P8.AI_TUNE.ragTailCache = argVal('--rag-tail-cache') === 'on'; }
    condition.concurrency = Math.min(2, Math.max(1, Math.floor(+P8.AI_TUNE.concurrency) || 1)); condition.ragTailCache = !!P8.AI_TUNE.ragTailCache;
  } else if (argVal('--concurrency') || argVal('--rag-tail-cache')) throw new Error('이 코드 트리에는 AI_TUNE이 없습니다 — --concurrency/--rag-tail-cache 없이 실행');
  let fakeResponse = null;
  if (arg('--fake')) { // 배선 확인용 가짜 API(fetch 단계) — 앱이 만든 요청 본문을 기록하고 사례 몇 건만 '찾은' 척. 사용량은 0(모의)
    const delay = +(argVal('--fake-delay') || 0);
    let fakeN = 0; const breakAt = +(argVal('--fake-break') || 0);
    fakeResponse = async body => {
      if (delay) await new Promise(r => setTimeout(r, delay));
      if (++fakeN === breakAt) return new Response(JSON.stringify({ content: [] }), { status: 200, headers: { 'content-type': 'application/json' } }); // 사용량 없는 응답 — '비용 미확인' 경로 확인용
      const text = JSON.stringify({ issues: [ // 채점 예시: 정확 수정 / 설명 겨냥(수정안 없음) / 문장 전체 겹침만 / 정상 문장 오지적 / 병기 오류 정확 수정
        { type: '오탈자', severity: 'high', found: '훌적 지나갑니다', suggestion: '훌쩍 지나갑니다', description: '가짜: 오타', page: 1 },
        { type: '사실오류', severity: 'medium', found: '남녀 비율은 15:12로', suggestion: '', description: '가짜: 명단 28명과 15:12 합계가 맞지 않습니다(요청 문장이라 수정안은 제시하지 않음)', page: 2 },
        { type: '윤문필요', severity: 'low', found: '엑셀에서 복사한 명단은 칸 사이가 눈에 보이지않는 탭으로 구분됩니다.', suggestion: '엑셀에서 복사한 명단은 칸 사이가 탭으로 구분됩니다.', description: '가짜: 문장 다듬기(오류와 무관)', page: 5 },
        { type: '문법', severity: 'medium', found: '명단을 붙여 넣고, 조 수를 정하고, 버튼을 누르면 됩니다.', suggestion: '명단을 붙여 넣은 뒤 조 수를 정하고 버튼을 누르면 됩니다.', description: '가짜(정상 문장에 낸 지적)', page: 1 },
        { type: '표기', severity: 'medium', found: '(prompt)요청 문장', suggestion: '요청 문장(prompt)', description: '가짜: 병기 순서', page: 6 }] });
      return new Response(JSON.stringify({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  }

  let elapsed = 0, ai = null;
  const label = (argVal('--label') || (arg('--oracle') ? 'oracle' : arg('--null') ? 'null' : arg('--surface') ? 'surface' : 'run')) + suffix;
  let issues;
  if (argVal('--regrade')) {
    issues = JSON.parse(fs.readFileSync(path.resolve(DIR, argVal('--regrade')), 'utf8')).issues;
  } else if (arg('--oracle')) {
    issues = seeded.cases.map(c => ({ page: c.page, found: c.wrong, start: c.start, type: c.cat, suggestion: `→ "${c.orig}"` }));
  } else if (arg('--null')) {
    issues = [];
  } else {
    const extracted = { filename: source.filename || 'eval', total_pages: seeded.pages.length, pages: seeded.pages, toc: [] };
    issues = [...P8.checkSurface(extracted), ...P8.checkTermConsistency(extracted)];
    if (!arg('--surface')) {
      const key = readKey(argVal, arg('--fake'));
      if (!key) throw new Error('API 키가 없습니다 — --key-file <경로> 또는 ANTHROPIC_API_KEY (AI 없이 돌리려면 --surface)');
      const t0 = Date.now();
      const r = await P8.checkLinguistic(extracted, key, (b, t) => process.stdout.write(`\r  AI 배치 ${b}/${t}`), e => console.error('\n  AI 오류:', e), null, crit);
      elapsed = Date.now() - t0;
      ai = { totalBatches: r.totalBatches, failedBatches: r.failedBatches, failedPages: r.failedPages };
      console.log(`\n  AI ${r.issues.length}건 · 실패 배치 ${r.failedBatches}/${r.totalBatches} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
      // 앱과 같은 크로스 중복 제거: AI가 같은 found를 잡은 표면 결과는 버린다
      const cross = new Set(P8.CROSS_TYPES);
      const aiKeys = new Set(r.issues.filter(i => i.found && cross.has(i.type)).map(i => i.page + '|' + i.found.trim()));
      issues = issues.filter(i => !i.found || !cross.has(i.type) || !aiKeys.has(i.page + '|' + i.found.trim())).concat(r.issues);
    }
  }

  const g = grade(seeded, issues, clean);
  await new Promise(r => setTimeout(r, 0)); // 마지막 응답의 사용량 집계(비동기)가 끝나길 기다린다
  const blockedRun = guard.blocked - blocked0;
  const unknownRun = guard.unknown - unknown0;
  const incomplete = [blockedRun ? `비용 상한 차단 ${blockedRun}건으로 미완료` : '', unknownRun && guard.maxUsd ? `비용 미확인 호출 ${unknownRun}건 — 상한 준수를 보장할 수 없어 중단` : ''].filter(Boolean).join(' · ').replace(/(.+)/, '$1 — 정상 실행으로 집계하지 말 것');
  if (unknownRun) console.warn(`  ⚠ 비용 미확인 호출 ${unknownRun}건(사용량을 받지 못함 — 예상 최대 합 $${guard.unknownUsd.toFixed(3)}, 0으로 치지 않음)${guard.maxUsd ? '' : ' · 상한 없음: 기록만'}`);
  report(label + (incomplete ? ' [상한 차단으로 미완료]' : ''), g, usage.calls ? usage : null);
  if (incomplete) console.warn(`  ⚠ ${incomplete} (AI 실패 묶음 ${ai ? ai.failedBatches + '/' + ai.totalBatches : '-'})`);
  { const textOf = new Map(seeded.pages.map(p => [p.page, p.text])); // 교정 단계(correction=오류 교정 / review=문맥 검토 / style=선택적 윤문) — 오지적·개선 해석에 필요
    const lv = (page, found, type) => { const iss = issues.find(i => i.page === page && i.found === found && i.type === type); return iss ? sandbox.P8Review.classify(iss, textOf.get(page) || '').level : ''; };
    g.extra.forEach(e => { e.level = lv(e.page, e.found, e.type); });
    g.perCase.forEach(r => r.by.forEach(b => { b.level = lv(r.page, b.found, b.type); })); }
  // 정상 문장 오지적
  const normalGrade = normalSpans.length ? gradeNormal(seeded, normalSpans, issues, (iss, text) => sandbox.P8Review.classify(iss, text), clean) : [];
  // 오지적률 2종: (1) 정상 문장 기준 = 오지적 판정 정상 문장 / 정상 문장 수, (2) 전체 지적 기준 상한 = (정상 문장에 붙은 지적 + 심지 않은 곳 지적) / 전체 지적 — 편집 완료 원고 가정, 사람 분류 뒤 확정
  const normalHitCount = normalGrade.reduce((s, n) => s + n.hits.length, 0);
  const fp = { normalSentences: normalGrade.length, normalFalse: normalGrade.filter(n => n.verdict === '오지적').length, normalContext: normalGrade.filter(n => n.verdict === '문맥 지적').length, normalReview: normalGrade.filter(n => n.verdict === '사람 검토').length,
    normalRate: normalGrade.length ? normalGrade.filter(n => n.verdict === '오지적').length / normalGrade.length : null,
    allIssues: issues.length, unneededUpper: issues.length ? (normalHitCount + g.extra.length) / issues.length : null };
  if (normalGrade.length) {
    console.log(`  정상 문장 ${fp.normalSentences}건: 오지적 ${fp.normalFalse} · 문맥 지적 ${fp.normalContext} · 검토 요청 ${fp.normalReview} · 통과 ${fp.normalSentences - fp.normalFalse - fp.normalContext - fp.normalReview} → 정상 문장 오지적률 ${(fp.normalRate * 100).toFixed(1)}%`);
    console.log(`  전체 지적 ${fp.allIssues}건 중 불필요 지적 상한 ${(fp.unneededUpper * 100).toFixed(1)}% (정상 문장 지적 ${normalHitCount} + 심지 않은 곳 ${g.extra.length}; 사람 분류 뒤 확정)`);
    normalGrade.forEach(n => n.hits.forEach(h => console.log(`    ${n.id} [${h.verdict}] ${h.type}(${h.source}·${h.level}) "${(h.found || '').slice(0, 40)}" → "${(h.suggestion || '').slice(0, 40)}" · ${h.applyPath}`)));
  }
  // 사람 검토 목록: AI 수정안 전부(의미 훼손 후보 표시)
  const review = issues.filter(i => i.source === 'ai' || i.source === 'surface+ai').map(i => ({ page: i.page, type: i.type, found: i.found, suggestion: i.suggestion || '', flags: meaningFlags(i.found, i.suggestion), hitCase: (g.perCase.find(r => r.by.some(b => b.found === i.found)) || {}).id || '' }));
  // 사용량·비용(UsageLog — 스트리밍 포함, 공식 요금 추정)
  const U = sandbox.UsageLog, cost = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, webSearches: 0, usd: 0, usdNoCache: 0 };
  if (U) for (const r of U.runs()) { const sm = U.summarize(r.id); cost.calls += sm.calls; cost.input += sm.tokens.input; cost.cacheWrite += sm.tokens.cacheWrite; cost.cacheRead += sm.tokens.cacheRead; cost.output += sm.tokens.output; cost.webSearches += sm.tokens.webSearches; cost.usd += sm.cost.total; cost.usdNoCache += sm.cost.noCache; }
  if (cost.calls) console.log(`  비용 추정 $${cost.usd.toFixed(4)} (무캐시 가정 $${cost.usdNoCache.toFixed(4)}) · ${(elapsed / 1000).toFixed(0)}초`);
  console.log(`  요청 증빙: ${requests.map(r => r.profile).join(' | ') || '없음'}`);
  if (!['oracle', 'null'].includes(label)) {
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, label + '.json');
    fs.writeFileSync(out, JSON.stringify({ label, date: new Date().toISOString(), version: before ? 'before(252fd7f)' : 'v2.17.0', snapshot, profile: profile ? { conceptId: profile.conceptId, title: profile.title, field: profile.field } : null,
      criteria: crit ? { ruleSig: crit.ruleSig, aiSig: crit.aiSig, text: crit.ai.text, profileText: crit.profileText } : { text: '변경 직전 코드(프로필 기능 없음)' }, requests, condition, incomplete, ai, calls: callRecords(U), elapsedMs: elapsed, cost, guard: { usd: guard.usd, calls: guard.calls, maxUsd: guard.maxUsd, blocked: guard.blocked, unknown: guard.unknown, unknownUsd: guard.unknownUsd, pending: guard.pending },
      usage: { ...usage, models: [...usage.models] }, metrics: g.metrics, falsePositive: fp, perCase: g.perCase, extra: g.extra, normal: normalGrade, review, issues }, null, 1));
    console.log('  저장: ' + path.relative(process.cwd(), out));
  }
  if (label === 'oracle' && g.metrics.fixRate !== 1) { console.error('채점기 이상: oracle이 100%가 아님'); process.exit(1); }
  if (label === 'null' && g.metrics.detected !== 0) { console.error('채점기 이상: null이 0%가 아님'); process.exit(1); }
}

module.exports = { seed, grade, seedNormal, gradeNormal, meaningFlags, applyPath, makeCostGuard, callRecords, guardedFetch, connectFailed };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
