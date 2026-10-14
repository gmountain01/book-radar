#!/usr/bin/env node
/**
 * v2.17.0 실제 AI 품질 평가 보고서 — eval/profile/results/{proof,logic}/{before,off,on}-N.json → report.md
 *
 *   node eval/profile/compare.js [--dir eval/profile/results]
 *
 * 두 비교를 따로 둔다.
 *   A. 전체 개선 효과 = 변경 직전 코드(before: 커밋 252fd7f 스냅샷, 프로필 기능 없음) ↔ 최종 코드 미연결(off)
 *      — 내용 완성도 검토(panel26)는 변경 직전 코드(v2.16.1+후속, 미커밋)를 정확히 확보할 수 없어 '평가 불가'
 *   B. 프로필 연결 효과 = 최종 코드 미연결(off) ↔ 연결(on)
 * 사례 판정(조건당 반복 n회): 개선 = 뒤 조건 성공 횟수 > 앞 조건, 악화 = 반대, 동일 = 같음, 판단 불가 = 어느 조건이든 반복 간 결과가 다름.
 * 자동 반영 가능 건수는 품질 지표로 쓰지 않는다. 정답 없는 지적은 사람 검토 표로만 낸다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const argVal = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DIR = path.resolve(argVal('--dir') || path.join(__dirname, 'results'));

const load = (sub, cond) => {
  const d = path.join(DIR, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => new RegExp('^' + cond + '(-\\d+)?\\.json$').test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')))
    .filter(r => { if (r.incomplete) console.warn(`⚠ ${sub}/${r.label}: ${r.incomplete} — 비교에서 제외`); return !r.incomplete; }); // 비용 상한에 걸린 실행은 정상 실행으로 집계하지 않는다
};
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const money = x => '$' + (x || 0).toFixed(3);
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const avg = (list, f) => list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : NaN;
const fx = (x, d = 1) => Number.isNaN(x) ? '-' : x.toFixed(d);
const judge = (aOk, bOk, aN, bN) => { // a=앞 조건, b=뒤 조건 성공 횟수
  const stable = (aOk === 0 || aOk === aN) && (bOk === 0 || bOk === bN);
  if (!stable) return '판단 불가(반복 간 차이)';
  const ra = aOk / aN, rb = bOk / bN;
  return rb > ra ? '개선' : rb < ra ? '악화' : '동일';
};
const LV = { correction: '오류 교정', review: '문맥 검토', style: '선택적 윤문', layout: '조판 확인', extract: '추출 영향', '': '미분류' };
const out = [];
const H = (n, t) => out.push('\n' + '#'.repeat(n) + ' ' + t + '\n');
const row = (...c) => out.push('| ' + c.map(esc).join(' | ') + ' |');
const head = (...c) => { row(...c); out.push('|' + c.map(() => '---').join('|') + '|'); };

out.push('# v2.17.0 실제 AI 품질 평가 보고서 — 전체 개선 효과(A)와 프로필 연결 효과(B)');
out.push(`\n생성: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 결과 폴더: ${path.relative(process.cwd(), DIR)}`);
out.push('\n> **A. 전체 개선 효과** = 1단계 변경 직전 코드 ↔ 후속 수정까지 끝난 최종 코드(프로필 미연결). **B. 프로필 연결 효과** = 최종 코드 미연결 ↔ 연결. 두 비교는 섞어 읽지 않는다. 조건당 반복이 2회 이하이면 **초기 평가**이며, 반복 간 결과가 다른 사례는 판단 불가로 둔다. 자동 반영 가능 건수 증가는 품질 향상의 근거로 쓰지 않는다. 기능 테스트 통과(`node scripts/run_tests.js`)는 이 보고서의 AI 품질 결과와 별개다.');

const pB = load('proof', 'before'), pOff = load('proof', 'off'), pOn = load('proof', 'on');
const anyP = pB[0] || pOff[0] || pOn[0];

// ── 0. 코드 스냅샷·실행 조건 ──
H(2, '0. 비교한 코드와 실행 조건');
head('조건', '평가', '코드', 'git', '미커밋 파일', '파일 해시(앞 16자)');
const snapRow = (cond, ev, r) => r && r.snapshot && row(cond, ev, r.version, r.snapshot.gitHead || '-', (r.snapshot.gitDirty || []).length ? (r.snapshot.gitDirty || []).join(', ') : '없음', Object.entries(r.snapshot.files || {}).filter(([f]) => /panel8\.js|panel26\.js|app\.js|review-policy/.test(f)).map(([f, h]) => `${path.basename(f)}=${h}`).join(' · '));
snapRow('before', '교정', pB[0]); snapRow('off', '교정', pOff[0]); snapRow('on', '교정', pOn[0]);
const lOff = load('logic', 'off'), lOn = load('logic', 'on');
snapRow('off', '내용 완성도', lOff[0]); snapRow('on', '내용 완성도', lOn[0]);
out.push('\n- 변경 직전 코드(before)는 커밋 252fd7f를 저장소 밖 폴더로 추출해 썼다(현재 작업 파일은 건드리지 않음). panel8.js·review-policy.js·app.js는 최종 파일에 1단계 패치를 역적용하면 252fd7f와 같음을 확인했다(panel8.js는 1단계가 추가한 식별자 줄 2개만 남음). panel26.js의 변경 직전(v2.16.1+후속, 미커밋)은 커밋도 검증 해시도 없어 **내용 완성도 검토의 전체 개선 효과는 평가 불가**.');
out.push('- 같은 원고·같은 모델(claude-sonnet-4-6)·같은 평가 기준·같은 심은 오류/정상 문장. 조건 간에 다른 것은 코드 트리(before)와 프로필 연결 여부(on)뿐이다.');

if (anyP) {
  const n = anyP.metrics.cases;
  H(2, `1. 교정 도우미 — 심은 오류 ${n}건 + 정상 문장 ${(anyP.normal || []).length}건 · before ${pB.length}회 / off ${pOff.length}회 / on ${pOn.length}회`);
  H(3, '1-1. 실행별 비용·시간·요청 증빙');
  head('조건', '실행', '검사 기준', '요청 증빙(프로필 블록)', '호출', '입력/캐시쓰기/캐시읽기/출력', '비용 추정', '상한', '시간');
  for (const [cond, list] of [['before', pB], ['off', pOff], ['on', pOn]]) for (const r of list) row(cond, r.label, r.criteria.text, [...new Set(r.requests.map(q => q.profile))].join(', ') || '-', r.cost.calls, `${r.cost.input}/${r.cost.cacheWrite}/${r.cost.cacheRead}/${r.cost.output}`, money(r.cost.usd), r.guard && r.guard.maxUsd ? `$${r.guard.maxUsd}${r.guard.blocked ? ' 차단 ' + r.guard.blocked : ''}` : '-', (r.elapsedMs / 1000).toFixed(0) + '초');

  const corr = r => r.extra.filter(e => e.level === 'correction').length;
  const normN = (anyP.normal || []).length;
  const normBad = (r, v) => (r.normal || []).filter(x => x.verdict === v).length;
  const normKind = (r, kind, v) => (r.normal || []).filter(x => x.kind === kind && x.verdict === v).length;
  const summary = (title, A, B, an, bn) => {
    H(3, title);
    head('묶음', '지표', an, bn, '판정(지표 수준)', '비고');
    const rowM = (grp, name, f, better, note) => { const a = avg(A, f), b = avg(B, f); const j = Number.isNaN(a) || Number.isNaN(b) ? '-' : a === b ? '동일' : (better === 'high' ? b > a : b < a) ? '개선' : '악화'; row(grp, name, fx(a), fx(b), j, note); };
    const Q = 'AI 지적·수정안 품질', R = '실제 반영 품질', N = '정상 문장';
    rowM(Q, `엄격 탐지(건/${n})`, r => r.metrics.aimed, 'high', '정확 수정, 또는 설명·수정안이 그 오류를 직접 언급, 또는 found가 오류 조각을 집어낸 수(평균). found가 오류 구간을 포함하기만 한 것은 제외');
    rowM(Q, `수정안 정답(건/${n})`, r => r.metrics.rawFixed || 0, 'high', '지적이 낸 수정안 원문을 적용하면 정답 — 앱의 수정안 정리 규칙을 거치기 전');
    rowM(Q, '겹침만(사람 검토, 건)', r => r.metrics.overlapOnly, 'low', '문장·표 전체를 잡은 지적이 오류 구간과 겹치기만 한 경우 — 자동 판정하지 않음');
    rowM(Q, `느슨 탐지(건/${n}, 참고)`, r => r.metrics.detected, 'high', '겹침 기준 — 참고용');
    rowM(Q, '의미 훼손 후보(건)', r => (r.review || []).filter(x => x.flags.length).length, 'low', 'AI 수정안에서 숫자·영문 용어가 바뀐 것 — 사람 검토');
    rowM(R, `정확 수정(교정본 기준, 건/${n})`, r => r.metrics.fixed, 'high', '앱의 정리 규칙을 거친 수정안을 적용해도 정답 — 해결됨 표시 시 교정본에 그대로 들어가는 품질');
    rowM(R, '수정안 정답·반영 시 손실(건)', r => r.metrics.cleanLoss || 0, 'low', '수정안은 정답인데 정리 규칙(괄호 제거 등)을 거치면 정답이 아님 — 영문 병기 손실 등 별도 실패 사례');
    rowM(R, '교정본 반영 조건 충족 지적(건)', r => [...r.perCase.flatMap(c => c.by), ...r.extra].filter(x => x.applyPath === '해결됨 표시 시 교정본 반영').length, 'high', '해결됨 표시 시 교정본에 들어가는 조건을 충족한 지적 수(지시문·예시·원문 불일치 제외). 편집상 수락 가능성은 사람 판정');
    rowM(R, '추가 지적 — 오류 교정 단계', corr, 'low', '심지 않은 곳에 낸 교정본 반영급 지적 — 편집 완료 원고이므로 오지적 후보(사람 검토)');
    rowM(R, '추가 지적 — 문맥 검토·윤문 단계', r => r.extra.length - corr(r), 'low', '교정본에 안 들어가는 검토용 지적');
    rowM(R, '전체 지적 중 불필요 지적 상한(%)', r => (r.falsePositive ? r.falsePositive.unneededUpper : NaN) * 100, 'low', '(정상 문장 지적 + 심지 않은 곳 지적) ÷ 전체 지적. 사람 분류(실제 오류/취향/오지적/중복) 뒤 확정');
    rowM(N, '정상 문장 오지적률(%)', r => (r.falsePositive ? r.falsePositive.normalRate : NaN) * 100, 'low', '정상 문장을 바꾸자는 수정안이 붙은 문장 비율(÷' + normN + ')');
    rowM(N, '불필요한 검토 요청(건)', r => normBad(r, '사람 검토'), 'low', '정상 문장에 수정안 없는 검토 안내(조사중복·주어과다 등)가 붙은 수 — 별도 집계');
    rowM(N, '문맥 지적(건, 사람 검토)', r => normBad(r, '문맥 지적'), 'low', '삭제·이동·저자 확인을 권하는 지적 — 심은 문장이 앞뒤 문단과 어긋나서 나온 것일 수 있어(평가 설계 한계) 오지적과 분리');
    rowM(N, '이웃 수정 겹침(건, 통과)', r => (r.normal || []).reduce((t, x) => t + x.hits.filter(h => h.verdict === '이웃 수정 겹침').length, 0), 'high', '바로 옆 심은 오류의 수정안이 구간만 겹치고 정상 문장은 그대로 둔 경우 — 오지적 아님');
    for (const [k, lab] of [['particle', '정상 조사 반복'], ['inword', '단어 내부 문자열'], ['loanword', '외래어·URL+조사'], ['code', '코드'], ['gloss', '영문 병기'], ['passive', '정상 피동'], ['unit', '규격·숫자'], ['abbr', '영문 약어']]) {
      rowM(N, `  · ${lab} 오지적(건)`, r => normKind(r, k, '오지적'), 'low', '종류별 별도 집계');
      rowM(N, `  · ${lab} 검토 요청(건)`, r => normKind(r, k, '사람 검토'), 'low', '종류별 별도 집계');
    }
    const rep = list => list.length > 1 ? `탐지 ${list.map(r => r.metrics.detected).join('/')} · 수정 ${list.map(r => r.metrics.fixed).join('/')} · 추가 ${list.map(r => r.extra.length).join('/')}` : '반복 1회';
    out.push(`\n반복 간 차이 — ${an}: ${rep(A)} · ${bn}: ${rep(B)}`);
  };
  const cases = (title, A, B, an, bn) => {
    H(3, title);
    head('사례', '유형', '심은 오류', `${an} 엄격/수정`, `${bn} 엄격/수정`, '판정(정확 수정 기준)', '판정(엄격 탐지 기준)', '근거(단계·반영 경로·수정안, 마지막 실행)');
    const counts = {}, counts2 = {};
    anyP.perCase.forEach((c, i) => {
      const a = L => L.filter(r => r.perCase[i].aimed).length, f = L => L.filter(r => r.perCase[i].fixed).length, o = L => L.filter(r => r.perCase[i].tier === '겹침만(사람 검토)').length;
      const j = A.length && B.length ? judge(f(A), f(B), A.length, B.length) : '-', j2 = A.length && B.length ? judge(a(A), a(B), A.length, B.length) : '-';
      counts[j] = (counts[j] || 0) + 1; counts2[j2] = (counts2[j2] || 0) + 1;
      const last = L => { const r = L[L.length - 1]; return r ? (r.perCase[i].by.map(b => `${b.type}[${LV[b.level] || b.level || '?'}·${b.applyPath}] → ${b.suggestion || '(없음)'}`).join(' / ') || r.perCase[i].tier) : ''; };
      const cell = L => `${a(L)}/${f(L)}` + (o(L) ? ` (겹침만 ${o(L)})` : '');
      row(c.id, c.sub, `${c.orig} → ${c.wrong}`, cell(A), cell(B), j, j2, (`${an}: ${last(A) || '-'} ‖ ${bn}: ${last(B) || '-'}`).slice(0, 180));
    });
    out.push('\n겹침만(사람 검토) 사례는 자동 판정에서 미탐으로 센다 — 사람이 겨냥 여부를 확인한 뒤 바꿀 수 있다.');
    out.push('\n판정 합계(정확 수정 기준): ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') + ' / (엄격 탐지 기준): ' + Object.entries(counts2).map(([k, v]) => `${k} ${v}`).join(' · '));
  };
  const normals = (title, A, B, an, bn) => {
    H(3, title);
    head('ID', '종류', '문장', an, bn, '판정');
    (anyP.normal || []).forEach((x, i) => {
      const s = L => L.map(r => { const v = r.normal[i]; return v.verdict === '정상 통과' ? '통과' : v.verdict + '(' + v.hits.map(h => `${h.type}[${LV[h.level] || '?'}·${h.applyPath}]${h.suggestion ? '→' + h.suggestion.slice(0, 30) : ''}`).join('; ') + ')'; }).join(' / ');
      const ok = L => L.filter(r => r.normal[i].verdict !== '오지적').length;
      row(x.id, x.kind, x.text, s(A) || '-', s(B) || '-', A.length && B.length ? judge(ok(A), ok(B), A.length, B.length) : '-');
    });
  };
  const extras = (title, A, B, an, bn) => {
    H(3, title + ' — 사람 검토');
    const key = e => e.page + '|' + e.type + '|' + String(e.found).slice(0, 60);
    const setOf = L => { const m = new Map(); L.forEach(r => r.extra.forEach(e => { const k = key(e); m.set(k, { ...e, runs: (m.get(k)?.runs || 0) + 1 }); })); return m; };
    const ea = setOf(A), eb = setOf(B);
    head('구분', '쪽', '유형(출처·단계·반영 경로)', '원문', '수정안', '나온 횟수', '사람 판정(실제 오류/취향/오지적/중복)');
    for (const [k, e] of eb) if (!ea.has(k)) row(`${bn}에서만`, e.page, `${e.type}(${e.source}·${LV[e.level] || '?'}·${e.applyPath || ''})`, String(e.found).slice(0, 60), String(e.suggestion || '').slice(0, 50), `${e.runs}/${B.length}`, '');
    for (const [k, e] of ea) if (!eb.has(k)) row(`${an}에서만`, e.page, `${e.type}(${e.source}·${LV[e.level] || '?'}·${e.applyPath || ''})`, String(e.found).slice(0, 60), String(e.suggestion || '').slice(0, 50), `${e.runs}/${A.length}`, '');
    for (const [k, e] of ea) if (eb.has(k)) row('양쪽', e.page, `${e.type}(${e.source}·${LV[e.level] || '?'}·${e.applyPath || ''})`, String(e.found).slice(0, 60), String(e.suggestion || '').slice(0, 50), `${e.runs}/${A.length} · ${eb.get(k).runs}/${B.length}`, '');
  };
  const gloss = (title, lists) => { // E1 영문 병기: 별도 실패 사례 — AI가 병기를 지웠는지 / 정답을 냈는데 정리 규칙이 손실시켰는지 / 미탐
    H(3, title);
    head('조건', '실행', '단계', '수정안', '분류');
    for (const [cond, L] of lists) for (const r of L) {
      const c = r.perCase.find(x => x.id === 'E1'); if (!c) continue;
      const sugg = c.by.map(b => b.suggestion || '').filter(Boolean);
      const cls = c.fixed ? '병기 복원(반영까지 정답)' : c.cleanLoss ? '병기 복원 수정안이나 정리 규칙에서 영문 손실' : sugg.some(x => /\(prompt\)|\(Prompt\)/.test(x)) ? '병기 유지하나 정답과 다름' : sugg.some(x => /프롬프트|요청 문장/.test(x) && !/prompt/i.test(x)) ? 'AI가 영문 병기를 삭제(수정안 품질 실패)' : c.detected ? '겹침만' : '미탐';
      row(cond, r.label, c.tier, sugg.map(x => x.slice(0, 50)).join(' / ') || '-', cls);
    }
  };
  const meaning = (title, lists) => {
    H(3, title + ' — 사람 검토');
    head('조건', '실행', '쪽', '유형', '원문', '수정안', '표시', '맞춘 사례');
    let any = false;
    for (const [cond, L] of lists) for (const r of L) (r.review || []).filter(x => x.flags.length).forEach(x => { any = true; row(cond, r.label, x.page, x.type, String(x.found).slice(0, 50), String(x.suggestion).slice(0, 50), x.flags.join(','), x.hitCase); });
    if (!any) out.push('| (없음) | | | | | | | |');
  };

  H(2, 'A. 전체 개선 효과(교정) — 변경 직전(before) ↔ 최종 미연결(off)');
  if (pB.length && pOff.length) {
    summary('A-1. 요약 지표(조건별 평균)', pB, pOff, 'before', 'off');
    cases('A-2. 사례별 비교', pB, pOff, 'before', 'off');
    normals('A-3. 정상 문장', pB, pOff, 'before', 'off');
    extras('A-4. 추가 지적 차이', pB, pOff, 'before', 'off');
  } else out.push('before 또는 off 결과가 없어 평가 불가.');

  H(2, 'B. 프로필 연결 효과(교정) — 최종 미연결(off) ↔ 연결(on)');
  if (pOff.length && pOn.length) {
    summary('B-1. 요약 지표(조건별 평균)', pOff, pOn, 'off', 'on');
    cases('B-2. 사례별 비교', pOff, pOn, 'off', 'on');
    normals('B-3. 정상 문장', pOff, pOn, 'off', 'on');
    extras('B-4. 추가 지적 차이', pOff, pOn, 'off', 'on');
    meaning('B-5. 의미 훼손 후보(모든 조건)', [['before', pB], ['off', pOff], ['on', pOn]]);
    gloss('B-6. 영문 병기(E1) — 별도 실패 사례(모든 조건)', [['before', pB], ['off', pOff], ['on', pOn]]);
  } else out.push('off 또는 on 결과가 없어 평가 불가.');
}

// ── 내용 완성도 검토 ──
if (lOff.length || lOn.length) {
  H(2, `2. 원고 구조 검토 — 내용 완성도 검토(정답 사례 ${(lOff[0] || lOn[0]).grade.per.length}건) · off ${lOff.length}회 / on ${lOn.length}회`);
  out.push('**A. 전체 개선 효과: 평가 불가** — 변경 직전 panel26.js(v2.16.1+후속 2, 미커밋)를 정확히 확보할 수 없어 재구성하지 않았다.');
  H(3, '2-1. 실행별 비용·시간·요청 증빙');
  head('조건', '실행', '검토 당시 기준', '요청 증빙', '호출', '입력/캐시쓰기/캐시읽기/출력(사고 포함)', '웹 검색', '비용 추정', '상한', '시간');
  for (const [cond, L] of [['off', lOff], ['on', lOn]]) for (const r of L) row(cond, r.label, r.criteriaUsed ? r.criteriaUsed.summary : '-', [...new Set(r.requests.map(q => q.task + ':' + q.profile))].join(', '), r.cost.calls, `${r.cost.input}/${r.cost.cacheWrite}/${r.cost.cacheRead}/${r.cost.output}`, r.cost.webSearches, money(r.cost.usd), r.guard && r.guard.maxUsd ? `$${r.guard.maxUsd}${r.guard.blocked ? ' 차단 ' + r.guard.blocked : ''}` : '-', r.sec + '초');
  H(3, 'B. 프로필 연결 효과 — 2-2. 정답 사례별(타당한 지적 유지 / 오지적 남음 / 기술 오류 바로잡음)');
  head('사례', '유형', '설명', 'off', 'on', '판정');
  const per = (lOff[0] || lOn[0]).grade.per;
  const good = p => p.type === 'good' ? p.outcome === '유지' : p.type === 'bad' ? p.outcome !== '잘못된 지적 남음' : /바로잡음/.test(p.outcome);
  per.forEach((c, i) => {
    const o = L => L.map(r => r.grade.per[i].outcome).join(' / ');
    const ok = L => L.filter(r => good(r.grade.per[i])).length;
    row(c.id, c.type, c.desc, o(lOff) || '-', o(lOn) || '-', lOff.length && lOn.length ? judge(ok(lOff), ok(lOn), lOff.length, lOn.length) : '-');
  });
  H(3, '2-3. 지적 수 — 반영 대상 / 근거 부족(보류·검증 못 함) / 수정안 부적절(수정안 보류·다시 씀) / 철회');
  out.push('지적 수 자체는 품질 지표가 아니다(정답 없는 지적은 2-4 목록을 사람이 검토). 근거 부족 = 검증에서 보류되거나 검증 못 한 지적, 수정안 부적절 = 수정안만 보류되거나 검증이 다시 쓴 것.');
  head('조건', '실행', '반영 대상', '보류', '검증 못 함', '철회', 'A/B/C', '교정', '수정안 다시 씀', '수정안 보류', '출처 미확인 기술');
  for (const [cond, L] of [['off', lOff], ['on', lOn]]) for (const r of L) { const c = r.grade.summary.counts; const fixHeld = [...(r.result.items || []), ...(r.result.proof || [])].filter(x => x.fixHeld).length; row(cond, r.label, c.active, c.held, c.unverified, c.withdrawn, `${c.A}/${c.B}/${c.C}`, c.proof, c.rewritten, fixHeld, c.techUnverified); }
  out.push(`\n반복 간 차이 — off: 반영 ${lOff.map(r => r.grade.summary.counts.active).join('/')} · on: 반영 ${lOn.map(r => r.grade.summary.counts.active).join('/')}`);
  H(3, '2-4. 지적 목록(조건별 마지막 실행) — 타당 / 오지적 / 근거 부족 / 부적절한 수정안을 사람이 표시');
  head('조건', '#', '묶음', '위치', '지적(질문/근거)', '수정안', '검증 상태', '사람 판정');
  for (const [cond, L] of [['off', lOff], ['on', lOn]]) { const r = L[L.length - 1]; if (!r) continue; (r.result.items || []).forEach((x, i) => row(cond, i + 1, x.tier, x.where, String(x.question || x.basis || x.problem || '').slice(0, 90), String(x.fix || x.text || '').slice(0, 70), x.unverified ? '검증 못 함' : x.held ? '보류(근거 부족)' : x.fixHeld ? '수정안 보류' : x.fixRewritten ? '수정안 다시 씀' : '반영 대상', '')); }
}

H(2, '3. 비용·시간 합계와 한계');
const all = [...pB, ...pOff, ...pOn, ...lOff, ...lOn];
const usd = all.reduce((s, r) => s + (r.cost?.usd || 0), 0), secs = all.reduce((s, r) => s + (r.elapsedMs ? r.elapsedMs / 1000 : +r.sec || 0), 0), calls = all.reduce((s, r) => s + (r.cost?.calls || 0), 0);
out.push(`- 실행 ${all.length}회 · API 호출 ${calls}회 · 비용 추정 ${money(usd)}(공식 요금표 기준 추정, 실제 청구액은 콘솔 확인) · 모델 실행 시간 합계 ${(secs / 60).toFixed(1)}분`);
out.push('- 비IT 분야 효과: **미평가** — 두 원고 모두 IT 분야. 프로필의 분야 정보가 "IT로 가정하지 말 것"을 바꾸지 않는다.');
out.push('- 조건당 반복 2회 이하 — 초기 평가. 반복 간 결과가 다른 사례는 판단 불가.');
out.push('- 교정 평가는 checkLinguistic(AI 검사)까지만 돌린다 — 앱의 "예시 만들기" 다시 쓰기 호출은 포함하지 않는다.');
out.push('- 책 전체 검토·2단계는 보류. 발견한 문제는 수정하지 않고 보고만 한다.');
fs.writeFileSync(path.join(DIR, 'report.md'), out.join('\n') + '\n', 'utf8');
console.log('보고서: ' + path.relative(process.cwd(), path.join(DIR, 'report.md')) + ` (${out.length}줄)`);
