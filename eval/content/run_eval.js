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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 환경 변수가 필요합니다(실제 API 호출)');
  const meta = C.files.meta && mode === 'after' ? JSON.parse(fs.readFileSync(path.resolve(base, C.files.meta), 'utf8')) : null;

  fs.mkdirSync(out, { recursive: true });
  for (let r = 1; r <= runs; r++) {
    const sb = makeSandbox();
    const usage = { calls: 0, input: 0, output: 0 };
    sb.fetch = async (url, init) => { // 실제 호출 + 사용량 집계
      const res = await fetch(url, init);
      res.clone().json().then(j => { if (j.usage) { usage.calls++; usage.input += j.usage.input_tokens || 0; usage.output += j.usage.output_tokens || 0; } }).catch(() => {});
      return res;
    };
    loadScript(sb, 'shared/config.js'); // app.js가 쓰는 기본값 (API 키 파일은 읽지 않음)
    loadScript(sb, 'shared/app.js');
    loadScript(sb, mode === 'before' ? 'eval/content/baseline/panel26_v2.12.0.js' : 'panels/panel26/panel26.js');
    const P26 = sb.P26;
    const outline = P26.parseOutline(text, true); // DOCX 원고: 스타일 이름으로 수준(# = 수준+1)
    const t0 = Date.now();
    const criteria = C.criteria || { useConcept: false, useToc: false, memo: '', feedback: '' };
    const result = mode === 'before'
      ? await P26.reviewLogic(outline, key, criteria, null)
      : await P26.reviewLogic(outline, key, criteria, null, { meta, onStage: t => process.stdout.write(`\r  ${t}                    `) });
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    const label = `${mode}-${r}`;
    const g = grade(result, C.cases);
    report(`${label} · ${sec}초 · API ${usage.calls}회 · 입력 ${usage.input} / 출력 ${usage.output} 토큰`, g);
    const strip = x => { const { evidence, ...rest } = x; return rest; }; // 근거 자료는 길어서 채점 파일에서 뺀다
    fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify({ label, date: new Date().toISOString(), sec, usage, grade: g,
      result: { ...result, items: (result.items || []).map(strip), proof: (result.proof || []).map(strip), withdrawn: (result.withdrawn || []).map(strip) } }, null, 1));
    console.log('  저장: ' + path.join(out, label + '.json'));
  }
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { grade, findings };
