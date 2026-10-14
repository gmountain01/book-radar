#!/usr/bin/env node
/**
 * 원고 내용 검토(panel26 '내용 완성도 검토') 회귀 평가
 *
 *   수정 전: eval/content/baseline/panel26_v2.12.0.js + 수정 전 추출본(교정용 원고 읽기)
 *   수정 후: panels/panel26/panel26.js + 검토용 추출본(위첨자·목록·각주·그림 표시 보존) + 근거 검증
 * 같은 원고·같은 사례로 채점한다. 원고와 사례 파일은 저장소 밖에 둔다(외주 원고).
 *
 *   node eval/content/run_eval.js --cases <cases.json> --mode before|after [--runs 2] [--out <폴더>]
 *   node eval/content/run_eval.js --cases <cases.json> --grade <결과.json>     # API 없이 다시 채점
 *   ANTHROPIC_API_KEY 환경 변수 필요(실제 API 호출 — 비용 발생).
 *
 * v2.17.0 프로필 연결 평가(eval/profile):
 *   ... --mode after --profile eval/profile/profile_fm.json   # 책 프로필 연결(컨셉 사용 켬). 없으면 '프로필 없음' 전달
 *   ... --book                                               # 내용 완성도 검토 대신 책 전체 검토(reviewBook) — 채점 없이 사람 검토 목록만
 *   ... --label on --out <폴더> --runs 2                      # on-1.json, on-2.json
 *   ... --fake                                               # 가짜 API로 배선 확인(유료 호출 없음)
 *   ... --fake --fake-break 2 --max-usd 20                   # n번째 가짜 응답을 끝이 없는 스트림으로 — '비용 미확인 → 이후 차단 → incomplete' 경로 확인
 *   ... --key-file <경로> --max-usd 4                         # 키 파일(노출 없음)·누적 추정 비용 상한
 *   (비용 상한 주의) 상한은 요청을 보내기 '전'에만 막는다 — 이미 보낸 요청은 끊지 않는다. 판단은 '집계가 끝난 누적 + 진행 중인 요청들의 예상 최대(pending) + 이 요청 예상 최대'.
 *     한계: 예상 최대에는 웹 검색 '결과'가 입력 토큰으로 들어오는 몫이 없다(검색 횟수 요금 max_uses만 포함) — 웹 검색을 쓰는 근거 검증 호출 1건은 예상 최대를 넘을 수 있고,
 *     그만큼 상한을 넘을 수 있다. 따라서 상한은 '요청 전 차단' 기준의 근사이며 실제 청구액을 보장하지 않는다.
 *     사용량을 받지 못한 호출(스트림 중단·응답 읽기 실패 등)은 비용 0이 아니라 '비용 미확인'으로 기록하고, 그 예상 최대를 누적 쪽에 잡아 둔 채 이후 요청을 모두 차단한다
 *     (상한 준수를 보장할 수 없으므로 — 진행 중인 요청은 끊지 않음). 상한에 걸리거나 비용 미확인이 생긴 실행은 결과 JSON에 incomplete로 표시된다(정상 실행으로 집계하지 말 것).
 *     --max-usd 없이 돌리면 차단 없이 기록만 한다 — 유료 실험은 반드시 --max-usd를 주고 실행할 것.
 *
 * API 비용·시간 최적화 비교(2026-10-13) — 조건값은 결과 JSON의 condition에, 호출별 기록은 calls에 남는다:
 *   ... --effort low|medium|high|max                         # 근거 검증 요청에 output_config.effort 전달(기본: 전달 안 함 = high와 같음)
 *   ... --save-candidates <파일>                             # 후보 단계만 실행해 저장(근거 검증 안 함). --runs 1로 쓸 것
 *   ... --candidates <파일> [--effort low]                   # 저장한 후보로 근거 검증만 다시 실행 — effort 비교에서 후보 차이를 없앤다(수정 후 코드 전용)
 *
 * cases.json
 *   { "files": { "before": "수정 전 추출본.md", "after": "검토용 추출본.md", "meta": "추출 메타.json" },
 *     "seeds": [{ "id", "find", "replace" }],          // 두 추출본에 똑같이 심는 오류(정확히 한 번 나와야 함)
 *     "cases": [{ "id", "type": "bad"|"good"|"fact", "desc", "loc": [정규식], "claim": [정규식], "fix": [정규식], "keep": [정규식] }] }
 *   bad  : 활성 지적 중 loc·claim·fix가 모두 맞는 것이 있으면 '잘못된 지적'
 *   good : 활성 지적 중 loc·claim·fix가 모두 맞는 것이 있으면 '유지'
 *   fact : 기술 오류 — fix(바로잡은 내용)가 맞는 활성 지적이면 '바로잡음', keep(틀린 주장을 유지한 수정안)이 맞으면 '문장만 다듬음'
 */
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript } = require('../../scripts/run_tests.js');

const args = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
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

/** 결과 → 채점용 지적 목록. state: active(반영 대상) / held(보류) / withdrawn(검증에서 철회) */
function findings(rv) {
  const f = [];
  const push = (x, src, state) => f.push({
    src, state, tier: x.tier || '', kind: x.kind || '',
    loc: [x.where, x.quote, x.at, x.evidence && x.evidence.here].filter(Boolean).join(' | '),
    claim: [x.question, x.basis, x.reason, x.problem, x.understood, x.kind].filter(Boolean).join(' | '),
    fix: [x.fix, x.text].filter(Boolean).join(' | '),
  });
  (rv.items || []).forEach(x => push(x, 'item', x.unverified ? 'unverified' : x.held || x.tier === 'C' ? 'held' : 'active'));
  (rv.proof || []).forEach(x => push(x, 'proof', x.unverified ? 'unverified' : x.held || x.fixHeld ? 'held' : 'active'));
  (rv.withdrawn || []).forEach(x => push(x, x.kind && rv.proof && rv.proof.includes(x) ? 'proof' : 'item', 'withdrawn'));
  return f;
}
const all = (res, s) => (res || []).every(r => new RegExp(r, 'i').test(s));
const hits = (f, c) => f.filter(x => all(c.loc, x.loc + ' ' + x.claim + ' ' + x.fix) && all(c.claim, x.claim + ' ' + x.loc) && all(c.fix, x.fix));

function grade(rv, cases) {
  const f = findings(rv);
  const active = f.filter(x => x.state === 'active'), held = f.filter(x => x.state === 'held' || x.state === 'unverified'), unverified = f.filter(x => x.state === 'unverified');
  const per = cases.map(c => {
    if (c.type === 'fact') {
      const fixed = hits(active, { ...c, fix: c.fix }).length + hits(held, { ...c, fix: c.fix }).length;
      const polished = hits([...active, ...held], { ...c, fix: c.keep }).length;
      return { id: c.id, type: c.type, desc: c.desc, outcome: fixed ? (hits(active, c).length ? '바로잡음' : '보류로 바로잡음') : polished ? '문장만 다듬음(오류 유지)' : '놓침' };
    }
    const a = hits(active, c), h = hits(held, c), w = hits(f.filter(x => x.state === 'withdrawn'), c);
    const u = hits(unverified, c);
    if (c.type === 'bad') return { id: c.id, type: c.type, desc: c.desc, outcome: a.length ? '잘못된 지적 남음' : u.length ? '검증 못 함으로 남음' : h.length ? '보류로 남음' : w.length ? '검증에서 철회' : '안 냄', n: a.length };
    return { id: c.id, type: c.type, desc: c.desc, outcome: a.length ? '유지' : u.length ? '검증 못 함' : h.length ? '보류로 내려감' : w.length ? '검증에서 잘못 철회' : '놓침' };
  });
  const by = t => per.filter(p => p.type === t);
  return {
    per,
    summary: {
      goodKept: by('good').filter(p => p.outcome === '유지').length + '/' + by('good').length,
      badRemaining: by('bad').filter(p => p.outcome === '잘못된 지적 남음').length + '/' + by('bad').length,
      factFixed: by('fact').filter(p => /바로잡음/.test(p.outcome)).length + '/' + by('fact').length,
      counts: { active: active.length, held: held.length - unverified.length, unverified: unverified.length, withdrawn: f.length - active.length - held.length,
        A: (rv.items || []).filter(x => x.tier === 'A').length, B: (rv.items || []).filter(x => x.tier === 'B').length, C: (rv.items || []).filter(x => x.tier === 'C').length,
        proof: (rv.proof || []).length, rewritten: [...(rv.items || []), ...(rv.proof || [])].filter(x => x.fixRewritten).length,
        techUnverified: (rv.items || []).filter(x => x.check && x.check.tech && x.check.techStatus !== '출처 확인').length },
    },
  };
}

function report(label, g) {
  console.log(`\n=== ${label} ===`);
  g.per.forEach(p => console.log(`  [${p.type}] ${p.id} ${p.desc} → ${p.outcome}`));
  const s = g.summary;
  console.log(`  올바른 지적 유지 ${s.goodKept} · 잘못된 지적 남음 ${s.badRemaining} · 기술 오류 바로잡음 ${s.factFixed}`);
  console.log(`  지적 수 — 반영 대상 ${s.counts.active} · 보류 ${s.counts.held} · 검증 못 함 ${s.counts.unverified} · 철회 ${s.counts.withdrawn} (A ${s.counts.A} / B ${s.counts.B} / C ${s.counts.C}, 교정 ${s.counts.proof}, 수정안 다시 씀 ${s.counts.rewritten}, 출처 미확인 기술 ${s.counts.techUnverified})`);
}

async function main() {
  const casesPath = argVal('--cases');
  if (!casesPath) throw new Error('--cases <cases.json> 가 필요합니다');
  const C = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const base = path.dirname(path.resolve(casesPath));
  if (argVal('--grade')) { const r = JSON.parse(fs.readFileSync(argVal('--grade'), 'utf8')); report(r.label + ' (다시 채점)', grade(r.result, C.cases)); return; }

  const mode = argVal('--mode') || 'after';
  const runs = +(argVal('--runs') || 1);
  const out = path.resolve(argVal('--out') || path.join(base, 'results'));
  let text = fs.readFileSync(path.resolve(base, C.files[mode]), 'utf8');
  for (const s of C.seeds || []) { // 두 추출본에 같은 오류를 심는다
    const n = text.split(s.find).length - 1;
    if (n !== 1) throw new Error(`심을 자리 '${s.id}'가 ${mode} 추출본에 ${n}번 나옵니다(정확히 1번이어야 함)`);
    text = text.replace(s.find, s.replace);
  }
  if (args.includes('--dry')) { console.log(`심을 자리 ${(C.seeds || []).length}곳 확인 — ${mode} 추출본 ${text.length}자`); return; }
  const fake = args.includes('--fake');
  const key = readKey(argVal, fake);
  if (!key) throw new Error('API 키가 없습니다 — --key-file <경로> 또는 ANTHROPIC_API_KEY(실제 API 호출)');
  const guard = makeCostGuard(+(argVal('--max-usd') || 0));
  const meta = C.files.meta && mode === 'after' ? JSON.parse(fs.readFileSync(path.resolve(base, C.files.meta), 'utf8')) : null;
  const profile = argVal('--profile') ? JSON.parse(fs.readFileSync(path.resolve(argVal('--profile')), 'utf8')) : null;
  const book = args.includes('--book');
  const labelBase = argVal('--label') || mode;

  fs.mkdirSync(out, { recursive: true });
  for (let r = 1; r <= runs; r++) {
    const sb = makeSandbox();
    const usage = { calls: 0, input: 0, output: 0 };
    const requests = []; // 요청 증빙: 판단 기준에 책 프로필이 들어갔는지(원고 본문은 기록하지 않음)
    const noteRequest = (sysText, userText, effortSent) => {
      const all = String(sysText || '') + '\n' + String(userText || '');
      const i = all.indexOf('### 책 프로필');
      const m = i >= 0 ? all.slice(i, i + 400).match(/- 분야·세부 분야: ([^\n]*)/) : null;
      requests.push({ task: /검증할 후보/.test(all) ? '검증' : /기존 피드백|책 전체|옮길 것/.test(all) ? '책 전체' : '내용 검토', effort: effortSent || '', profile: i < 0 ? '블록 없음' : m ? m[1] : (all.slice(i, i + 200).includes('프로필 없음') ? '프로필 없음' : '있음(분야 미표기)') });
    };
    const blocked0 = guard.blocked, unknown0 = guard.unknown;
    const userText = b => (b.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(c => c.text || '').join('\n')).join('\n');
    // 가짜 API(fetch 단계): 앱이 만든 요청 본문 그대로 받아 가짜 응답(스트리밍 요청이면 SSE)을 돌려준다 — 사용량 기록(calls)·비용 상한·output_config 전달이 가짜 모드에서도 같은 경로로 확인된다. 사용량은 0(모의)
    let fakeN = 0; const breakAt = +(argVal('--fake-break') || 0);
    const fakeResponse = b => {
      const u = userText(b);
      const text = /검증할 후보/.test(u) ? JSON.stringify({ results: [] })
        : book ? JSON.stringify({ scope: '가짜', summary: '가짜', items: [] })
        : JSON.stringify({ reader: '가짜', scope: '가짜', summary: '가짜', sections: [], items: [{ tier: 'B', where: '가짜', question: '가짜: 배선 확인용 질문', fix: '가짜 보강안' }], proof: [] }); // 후보 1건 — 근거 검증 요청까지 배선 확인
      const usage0 = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
      if (!b.stream) return new Response(JSON.stringify({ model: b.model, stop_reason: 'end_turn', usage: usage0, content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      const ev = d => 'event: ' + d.type + '\ndata: ' + JSON.stringify(d) + '\n\n';
      if (++fakeN === breakAt) return new Response(ev({ type: 'message_start', message: { model: b.model, usage: usage0 } }) + ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
        ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) + ev({ type: 'content_block_stop', index: 0 }), { status: 200, headers: { 'content-type': 'text/event-stream' } }); // message_delta 없이 끝난 스트림 — '비용 미확인' 경로 확인용
      return new Response(ev({ type: 'message_start', message: { model: b.model, usage: usage0 } }) + ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
        ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) + ev({ type: 'content_block_stop', index: 0 }) +
        ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } }) + ev({ type: 'message_stop' }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    sb.fetch = guardedFetch(guard, (url, init, b) => (fake ? fakeResponse(b) : fetch(url, init)), // 실제 호출 또는 가짜 + 사용량 집계(전체 비용은 UsageLog로 따로 집계)
      b => noteRequest(Array.isArray(b.system) ? b.system.map(x => x.text).join('\n') : b.system, userText(b), b.output_config && b.output_config.effort),
      j => { if (j && j.usage) { usage.calls++; usage.input += j.usage.input_tokens || 0; usage.output += j.usage.output_tokens || 0; } });
    const codeFiles = ['shared/config.js', 'shared/usage-log.js', 'shared/app.js', mode === 'before' ? 'eval/content/baseline/panel26_v2.12.0.js' : 'panels/panel26/panel26.js'];
    const snapshot = snapshotOf(ROOT, codeFiles);
    loadScript(sb, 'shared/config.js'); // app.js가 쓰는 기본값 (API 키 파일은 읽지 않음)
    loadScript(sb, 'shared/usage-log.js'); // 비용 추정(공식 요금)
    loadScript(sb, 'shared/app.js');
    if (profile) sb.localStorage.setItem('ms_concept_v2', JSON.stringify(profile)); // 연결 조건: 컨셉 저장 + useConcept
    loadScript(sb, mode === 'before' ? 'eval/content/baseline/panel26_v2.12.0.js' : 'panels/panel26/panel26.js');
    const P26 = sb.P26;
    const effort = argVal('--effort') || '', candFile = argVal('--candidates'), saveCand = argVal('--save-candidates');
    if ((effort || candFile || saveCand) && !P26.VERIFY_TUNE) throw new Error('이 코드에는 VERIFY_TUNE이 없습니다 — --effort/--candidates/--save-candidates 는 수정 후(after) 코드 전용');
    if (effort && !['low', 'medium', 'high', 'max'].includes(effort)) throw new Error('--effort 는 low|medium|high|max');
    if (effort) P26.VERIFY_TUNE.effort = effort;
    const textSha = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    const outline = P26.parseOutline(text, true); // DOCX 원고: 스타일 이름으로 수준(# = 수준+1)
    const t0 = Date.now();
    const criteria = { ...(C.criteria || { useConcept: false, useToc: false, memo: '', feedback: '' }), useConcept: !!profile };
    // 검사 당시 기준 고정(v2.17.0): 실행 전에 기준 문자열을 한 번 만들어 후보·검증이 같은 값을 쓰고, 결과에 기록한다
    const crit = mode === 'before' ? null : P26.criteriaText(criteria);
    const used = mode === 'before' ? null : P26.criteriaUsedOf(criteria, crit);
    if (mode !== 'before' && !!profile !== /- 분야·세부 분야: /.test(crit)) throw new Error('프로필 연결 상태가 조건과 다릅니다');
    const onStage = t => process.stdout.write(`\r  ${t}                    `);
    const review = verify => (book ? P26.reviewBook(outline, key, criteria, { meta, onStage, crit, verify }) : P26.reviewLogic(outline, key, criteria, null, { meta, onStage, crit, verify }));
    let result;
    if (candFile) { // 저장한 후보로 근거 검증만 — reviewLogic/reviewBook의 검증 뒤 처리와 같은 순서(scopeNotes는 후보 단계 것 그대로: 검증 범위 메모는 verifyState에 따로 남긴다)
      const saved = JSON.parse(fs.readFileSync(path.resolve(candFile), 'utf8'));
      if (saved.textSha !== textSha || !!saved.book !== book) throw new Error('후보 파일이 이 원고·모드와 다릅니다(textSha/book 불일치)');
      // 후보를 만든 판단 기준(기준 문자열 지문·지시문 판)과 이번 실행 기준이 다르면 막는다 — 다른 기준의 후보를 이번 기준으로 검증하면 비교가 무의미
      const su = saved.criteriaUsed || {};
      if (!used || su.sig !== used.sig || su.promptVer !== used.promptVer) throw new Error(`후보 파일의 판단 기준이 이번 실행과 다릅니다(후보: ${su.summary || '-'} · ${su.sig || '-'} · 지시문 ${su.promptVer || '-'} / 이번: ${used ? used.summary + ' · ' + used.sig + ' · 지시문 ' + used.promptVer : '-'}) — 같은 --profile·기준으로 실행하거나 후보를 다시 저장하세요`);
      result = saved.result;
      const groups = book ? [{ list: result.items.filter(x => x.area !== 'proofread') }, { list: result.items.filter(x => x.area === 'proofread'), isProof: true }]
        : [{ list: result.items }, { list: result.proof, isProof: true }];
      const vs = await P26.verifyCandidates(outline, groups, key, meta, onStage, crit);
      if (book) result.items.forEach(x => { if (x.held || x.downgraded) x.tier = 'H'; });
      result.withdrawn = [...result.items.filter(x => x.withdrawn), ...(result.proof || []).filter(x => x.withdrawn)];
      result.items = result.items.filter(x => !x.withdrawn);
      if (result.proof) result.proof = result.proof.filter(x => !x.withdrawn);
      result.verified = true; result.verifyVersion = P26.VERIFY_VERSION;
      result.verifyState = { n: vs.n, calls: vs.calls, sentChars: vs.sentChars, failed: vs.failed, web: vs.web };
    } else if (saveCand) { // 후보 단계만 — 근거 검증 없이 저장
      result = await review(false);
      fs.writeFileSync(path.resolve(saveCand), JSON.stringify({ date: new Date().toISOString(), mode, book, textSha, criteriaUsed: used, result }, null, 1));
      console.log('\n  후보 저장: ' + saveCand + ` (내용 ${(result.items || []).length}건 · 교정 ${(result.proof || []).length}건, 근거 검증 안 함)`);
    } else result = mode === 'before'
      ? await P26.reviewLogic(outline, key, criteria, null)
      : await review(undefined);
    if (used) result.criteriaUsed = used;
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    const label = `${labelBase}-${r}`;
    const U = sb.UsageLog, cost = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, webSearches: 0, usd: 0, usdNoCache: 0 };
    if (U) for (const rr of U.runs()) { const sm = U.summarize(rr.id); cost.calls += sm.calls; cost.input += sm.tokens.input; cost.cacheWrite += sm.tokens.cacheWrite; cost.cacheRead += sm.tokens.cacheRead; cost.output += sm.tokens.output; cost.thinking += sm.tokens.thinking; cost.webSearches += sm.tokens.webSearches; cost.usd += sm.cost.total; cost.usdNoCache += sm.cost.noCache; }
    await new Promise(r => setTimeout(r, 0)); // 마지막 응답의 사용량 집계(비동기)가 끝나길 기다린다
    const blockedRun = guard.blocked - blocked0;
    const unknownRun = guard.unknown - unknown0;
    const incomplete = [blockedRun ? `비용 상한 차단 ${blockedRun}건으로 미완료` : '', unknownRun && guard.maxUsd ? `비용 미확인 호출 ${unknownRun}건 — 상한 준수를 보장할 수 없어 중단` : ''].filter(Boolean).join(' · ').replace(/(.+)/, '$1 — 정상 실행으로 집계하지 말 것');
    if (unknownRun) console.warn(`  ⚠ 비용 미확인 호출 ${unknownRun}건(사용량을 받지 못함 — 예상 최대 합 $${guard.unknownUsd.toFixed(3)}, 0으로 치지 않음)${guard.maxUsd ? '' : ' · 상한 없음: 기록만'}`);
    if (incomplete) console.warn(`\n  ⚠ ${incomplete}`);
    let g = null;
    if (book) { // 책 전체 검토: 정답 사례가 없으므로 채점하지 않고 사람 검토 목록만
      const list = (result.items || []).map(x => ({ tier: x.tier, type: x.type, area: x.area || '', where: x.where, quote: (x.quote || x.at || '').slice(0, 120), problem: x.problem, fix: x.fix, text: (x.text || '').slice(0, 200), applicable: P26.bookApplicable(x), hold: P26.holdReason(x), check: x.check ? { claim: x.check.claim, fix: x.check.fix, tech: x.check.techStatus || '' } : null }));
      console.log(`\n=== ${label} · ${sec}초 · 비용 추정 $${cost.usd.toFixed(3)} · 지적 ${list.length}건(자동 반영 가능 ${list.filter(x => x.applicable).length}) — 채점 없음, 사람 검토 ===`);
      list.forEach((x, i) => console.log(`  ${i + 1}. [${x.tier}/${x.type}] ${x.where} — ${String(x.problem || '').slice(0, 70)} → ${String(x.fix || '').slice(0, 60)}${x.applicable ? '' : ' (보류: ' + x.hold + ')'}`));
      g = { per: [], summary: { counts: { items: list.length, applicable: list.filter(x => x.applicable).length } }, human: list };
    } else {
      g = grade(result, C.cases);
      if (incomplete) g.summary.incomplete = '상한 차단으로 미완료';
      report(`${label}${incomplete ? ' [상한 차단으로 미완료]' : ''} · ${sec}초 · API ${cost.calls || usage.calls}회 · 비용 추정 $${cost.usd.toFixed(3)} · 입력 ${cost.input || usage.input} / 출력 ${cost.output || usage.output} 토큰`, g);
    }
    console.log(`  요청 증빙: ${requests.map(x => x.task + ':' + x.profile).join(' | ') || '없음'}`);
    const strip = x => { const { evidence, ...rest } = x; return rest; }; // 근거 자료는 길어서 채점 파일에서 뺀다
    console.log(`  코드: ${snapshot.gitHead}${snapshot.gitDirty.length ? ' + 미커밋 ' + snapshot.gitDirty.length + '파일' : ''}${guard.maxUsd ? ` · 누적 추정 $${guard.usd.toFixed(3)} / 상한 $${guard.maxUsd}${guard.unknown ? ` · 비용 미확인 ${guard.unknown}건(예상 최대 합 $${guard.unknownUsd.toFixed(3)} 별도)` : ''}` : ''}`);
    fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify({ label, date: new Date().toISOString(), version: 'v2.17.0', snapshot, mode, book, sec, usage, cost, incomplete, condition: { effort: effort || '', candidates: candFile ? path.basename(candFile) : '', candidatesOnly: !!saveCand && !candFile, fake }, calls: callRecords(U), guard: { usd: guard.usd, calls: guard.calls, maxUsd: guard.maxUsd, blocked: guard.blocked, unknown: guard.unknown, unknownUsd: guard.unknownUsd, pending: guard.pending }, requests,
      profile: profile ? { conceptId: profile.conceptId, title: profile.title, field: profile.field } : null, criteriaUsed: used, grade: g,
      result: { ...result, items: (result.items || []).map(strip), proof: (result.proof || []).map(strip), withdrawn: (result.withdrawn || []).map(strip) } }, null, 1));
    console.log('  저장: ' + path.join(out, label + '.json'));
  }
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { grade, findings, makeCostGuard, callRecords, guardedFetch, connectFailed };
