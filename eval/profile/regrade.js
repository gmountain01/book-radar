#!/usr/bin/env node
/**
 * 저장된 실행 결과(issues 포함)를 현재 채점기로 다시 채점한다 — API 호출 없음. 비용·요청 증빙·스냅샷은 그대로 두고
 * metrics/perCase/extra/normal/falsePositive/review만 갱신한다. 채점기(엄격 탐지·정상 문장 판정)를 고친 뒤 결과를 맞출 때 쓴다.
 *   node eval/profile/regrade.js eval/profile/results/proof/*.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS } = require('../../scripts/run_tests.js');
const { seed, grade, seedNormal, gradeNormal, meaningFlags } = require('../proofread/run_eval.js');
const DIR = path.join(__dirname, '..', 'proofread');
const source = JSON.parse(fs.readFileSync(path.join(DIR, 'source.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(DIR, 'cases.json'), 'utf8'));
const normal = JSON.parse(fs.readFileSync(path.join(__dirname, 'normal.json'), 'utf8'));
const sb = makeSandbox();
for (const f of SCRIPTS) if (fs.existsSync(path.join(__dirname, '../..', f)) && !/api-keys/.test(f)) loadScript(sb, f);
const clean = iss => sb.__p8Eval._cleanSuggestion(iss);
const classify = (iss, text) => sb.P8Review.classify(iss, text);
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seeded = seed(source, cases);
  const spans = seedNormal(seeded, normal);
  const g = grade(seeded, r.issues, clean);
  const textOf = new Map(seeded.pages.map(p => [p.page, p.text]));
  const lv = (page, found, type) => { const iss = r.issues.find(i => i.page === page && i.found === found && i.type === type); return iss ? classify(iss, textOf.get(page) || '').level : ''; };
  g.extra.forEach(e => { e.level = lv(e.page, e.found, e.type); });
  g.perCase.forEach(c => c.by.forEach(b => { b.level = lv(c.page, b.found, b.type); }));
  const normalGrade = gradeNormal(seeded, spans, r.issues, classify, clean);
  const normalHitCount = normalGrade.reduce((s, n) => s + n.hits.length, 0);
  r.falsePositive = { normalSentences: normalGrade.length, normalFalse: normalGrade.filter(n => n.verdict === '오지적').length, normalContext: normalGrade.filter(n => n.verdict === '문맥 지적').length, normalReview: normalGrade.filter(n => n.verdict === '사람 검토').length,
    normalRate: normalGrade.length ? normalGrade.filter(n => n.verdict === '오지적').length / normalGrade.length : null, allIssues: r.issues.length, unneededUpper: r.issues.length ? (normalHitCount + g.extra.length) / r.issues.length : null };
  r.metrics = g.metrics; r.perCase = g.perCase; r.extra = g.extra; r.normal = normalGrade;
  r.review = r.issues.filter(i => i.source === 'ai' || i.source === 'surface+ai').map(i => ({ page: i.page, type: i.type, found: i.found, suggestion: i.suggestion || '', flags: meaningFlags(i.found, i.suggestion), hitCase: (g.perCase.find(c => c.by.some(b => b.found === i.found)) || {}).id || '' }));
  r.regradedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(r, null, 1));
  console.log(`${path.basename(file)}: 엄격 ${g.metrics.aimed}/${g.metrics.cases} · 수정 ${g.metrics.fixed} · 정상 오지적 ${r.falsePositive.normalFalse} · 문맥 ${r.falsePositive.normalContext} · 검토 ${r.falsePositive.normalReview}`);
}
