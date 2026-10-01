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
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS } = require('../../scripts/run_tests.js');

const DIR = __dirname;
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

function grade(seeded, issues, cleanSuggestion) {
  const textOf = new Map(seeded.pages.map(p => [p.page, p.text]));
  const perCase = seeded.cases.map(c => ({ id: c.id, cat: c.group || c.cat, sub: c.cat, page: c.page, wrong: c.wrong, orig: c.orig, detected: false, fixed: false, by: [] }));
  const hit = new Set();
  issues.forEach((iss, idx) => {
    const text = textOf.get(iss.page) || '';
    for (const [s, e] of issueSpans(iss, text)) {
      perCase.forEach((r, ci) => {
        const c = seeded.cases[ci];
        if (c.page !== iss.page || e <= c.start || s >= c.end) return;
        hit.add(idx);
        r.detected = true;
        r.by.push({ type: iss.type, source: iss.source || 'surface', found: iss.found, suggestion: iss.suggestion });
        const repl = cleanSuggestion(iss);
        const fixedText = repl ? text.slice(0, s) + repl + text.slice(e) : text;
        // 원래 표기로 되돌리면 정답. 비문·사실처럼 문장을 다시 쓰거나 설명으로 답하는 경우는
        // 케이스의 accept(핵심 정답어)가 수정안에 들어 있으면 인정
        const ok = (repl && fixedText.includes(c.orig) && !fixedText.slice(Math.max(0, s - 20), s + repl.length + 20).includes(c.wrong))
          || (c.accept || []).some(a => (repl || '').includes(a) || (iss.suggestion || '').includes(a));
        if (ok) r.fixed = true;
      });
    }
  });
  const extra = issues.filter((_, i) => !hit.has(i)).map(i => ({ page: i.page, type: i.type, source: i.source || 'surface', found: i.found, suggestion: i.suggestion }));
  const n = perCase.length;
  const cats = {};
  for (const r of perCase) {
    const k = cats[r.cat] ||= { total: 0, detected: 0, fixed: 0 };
    k.total++; if (r.detected) k.detected++; if (r.fixed) k.fixed++;
  }
  return {
    metrics: {
      cases: n,
      detected: perCase.filter(r => r.detected).length,
      fixed: perCase.filter(r => r.fixed).length,
      recall: n ? perCase.filter(r => r.detected).length / n : 0,
      fixRate: n ? perCase.filter(r => r.fixed).length / n : 0,
      extra: extra.length,
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
  console.log(`  탐지율     ${pct(m.recall)} (${m.detected}/${m.cases}, ±${ci(m.recall)}%p)`);
  console.log(`  정확 수정률 ${pct(m.fixRate)} (${m.fixed}/${m.cases}, ±${ci(m.fixRate)}%p)`);
  console.log(`  추가 지적   ${m.extra}건 (심지 않은 곳)`);
  for (const [cat, k] of Object.entries(m.byCategory)) {
    console.log(`    ${cat.padEnd(6)} 탐지 ${k.detected}/${k.total}  수정 ${k.fixed}/${k.total}`);
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
  fs.writeFileSync(path.join(DIR, 'seeded.json'), JSON.stringify(seeded, null, 1));

  const sandbox = makeSandbox();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, models: new Set() };
  sandbox.fetch = async (url, opts) => {
    const res = await fetch(url, opts);
    res.clone().json().then(j => {
      if (!j || !j.usage) return;
      usage.calls++; usage.models.add(j.model);
      usage.input += j.usage.input_tokens || 0;
      usage.output += j.usage.output_tokens || 0;
      usage.cacheRead += j.usage.cache_read_input_tokens || 0;
      usage.cacheWrite += j.usage.cache_creation_input_tokens || 0;
    }).catch(() => {});
    return res;
  };
  for (const s of SCRIPTS) {
    if (fs.existsSync(path.join(__dirname, '../..', s))) loadScript(sandbox, s);
  }
  const P8 = sandbox.__p8Eval;
  const clean = iss => P8._cleanSuggestion(iss);

  const label = argVal('--label') || (arg('--oracle') ? 'oracle' : arg('--null') ? 'null' : arg('--surface') ? 'surface' : 'run');
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
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY 환경 변수가 필요합니다 (AI 없이 돌리려면 --surface)');
      const t0 = Date.now();
      const r = await P8.checkLinguistic(extracted, key, (b, t) => process.stdout.write(`\r  AI 배치 ${b}/${t}`), e => console.error('\n  AI 오류:', e));
      console.log(`\n  AI ${r.issues.length}건 · 실패 배치 ${r.failedBatches}/${r.totalBatches} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
      // 앱과 같은 크로스 중복 제거: AI가 같은 found를 잡은 표면 결과는 버린다
      const cross = new Set(P8.CROSS_TYPES);
      const aiKeys = new Set(r.issues.filter(i => i.found && cross.has(i.type)).map(i => i.page + '|' + i.found.trim()));
      issues = issues.filter(i => !i.found || !cross.has(i.type) || !aiKeys.has(i.page + '|' + i.found.trim())).concat(r.issues);
    }
  }

  const g = grade(seeded, issues, clean);
  report(label, g, usage.calls ? usage : null);
  if (!['oracle', 'null'].includes(label)) {
    fs.mkdirSync(path.join(DIR, 'results'), { recursive: true });
    const out = path.join(DIR, 'results', label + '.json');
    fs.writeFileSync(out, JSON.stringify({ label, date: new Date().toISOString(), usage: { ...usage, models: [...usage.models] }, metrics: g.metrics, perCase: g.perCase, extra: g.extra, issues }, null, 1));
    console.log('  저장: ' + path.relative(process.cwd(), out));
  }
  if (label === 'oracle' && g.metrics.fixRate !== 1) { console.error('채점기 이상: oracle이 100%가 아님'); process.exit(1); }
  if (label === 'null' && g.metrics.detected !== 0) { console.error('채점기 이상: null이 0%가 아님'); process.exit(1); }
}

module.exports = { seed, grade };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
