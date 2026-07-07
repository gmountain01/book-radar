#!/usr/bin/env node
/**
 * CI 스모크 테스트 (Node, 의존성 없음)
 *  1. shared/app.js parseAiJson 단위 테스트
 *  2. panel8 교정 규칙 픽스처 40건 채점 (p8_computeTestResults)
 *
 * 사용법: node scripts/run_tests.js   (저장소 루트 기준 상대 경로 자동 해석)
 * 실패 시 exit code 1 → GitHub Actions 실패 처리.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
function fail(msg) { failures++; console.error('  ✗ ' + msg); }
function pass(msg) { console.log('  ✓ ' + msg); }

// ── 브라우저 DOM 스텁 ─────────────────────────────────────────
function makeElementStub() {
  const el = {
    style: {}, dataset: {}, classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    children: [], innerHTML: '', textContent: '', value: '', checked: false,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {},
    insertAdjacentHTML() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return makeElementStub(); },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    focus() {}, blur() {}, click() {},
    getContext() { return null; },
    parentElement: null, parentNode: null,
  };
  return el;
}

function makeStorageStub() {
  const store = Object.create(null);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k in store) delete store[k]; },
    key(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
  };
}

function makeSandbox() {
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextDecoder, TextEncoder, Blob: typeof Blob !== 'undefined' ? Blob : function() {},
    fetch: function() { return Promise.reject(new Error('fetch disabled in CI')); },
    alert() {}, confirm() { return false; }, prompt() { return null; },
    localStorage: makeStorageStub(),
    sessionStorage: makeStorageStub(),
    navigator: { userAgent: 'node-ci', clipboard: { writeText() { return Promise.resolve(); } } },
    location: { href: 'file:///ci/index.html', protocol: 'file:', hostname: '', search: '', hash: '' },
    document: {
      getElementById() { return makeElementStub(); },
      querySelector() { return makeElementStub(); },
      querySelectorAll() { return []; },
      createElement() { return makeElementStub(); },
      createTextNode(t) { return { textContent: t }; },
      addEventListener() {}, removeEventListener() {},
      body: makeElementStub(), documentElement: makeElementStub(), head: makeElementStub(),
    },
    PanelRegistry: { register() {}, onDeactivate() {} },
    Chart: Object.assign(function() {}, { // Chart.js 스텁
      defaults: { font: {}, plugins: { legend: { labels: {} }, tooltip: {} }, scales: {} },
      register() {},
    }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function loadScript(sandbox, relPath) {
  const full = path.join(ROOT, relPath);
  const code = fs.readFileSync(full, 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

// ── 1. parseAiJson 단위 테스트 ───────────────────────────────
function testParseAiJson(sandbox) {
  console.log('\n[1/2] parseAiJson 단위 테스트');
  const p = sandbox.window.parseAiJson;
  if (typeof p !== 'function') { fail('window.parseAiJson 미노출'); return; }

  const cases = [
    ['순수 객체', '{"a":1}', r => r && r.a === 1],
    ['마크다운 펜스', '```json\n{"a":1}\n```', r => r && r.a === 1],
    ['앞뒤 잡담 텍스트', '결과는 다음과 같습니다:\n{"a":1}\n이상입니다.', r => r && r.a === 1],
    ['후행 쉼표', '{"a":1,}', r => r && r.a === 1],
    ['문자열 내 리터럴 줄바꿈', '{"a":"줄1\n줄2"}', r => r && r.a === '줄1\n줄2'],
    ['제어문자 포함', '{"a":"x\u0001y"}', r => r && r.a === 'xy'],
    ['잘린 issues 배열 복구', '{"issues":[{"page":1,"found":"오타"},{"page":2,"fo', r => r && r.issues && r.issues.length === 1],
    ['배열 루트', '[{"a":1},{"a":2}]', r => Array.isArray(r) && r.length === 2],
    ['배열 루트 + 펜스', '```json\n[1,2,3]\n```', r => Array.isArray(r) && r.length === 3],
    ['JSON 없음 → null', '죄송합니다. JSON을 생성할 수 없습니다.', r => r === null],
    ['빈 입력 → null', '', r => r === null],
  ];

  for (const [name, input, check] of cases) {
    let r;
    try { r = p(input); } catch (e) { fail(`${name}: 예외 발생 — ${e.message}`); continue; }
    if (check(r)) pass(name);
    else fail(`${name}: 결과 불일치 — ${JSON.stringify(r).slice(0, 120)}`);
  }
}

// ── 2. panel8 교정 규칙 픽스처 채점 ──────────────────────────
// 기준선: 픽스처 도입(FEAT-1) 시점 성능. 하회하면 규칙 회귀로 판단.
const BASELINE = { minDetected: 30, maxFp: 0 };

function testProofreadFixtures(sandbox) {
  console.log('\n[2/2] panel8 교정 규칙 픽스처 테스트');
  const compute = sandbox.window.p8_computeTestResults;
  const fixtures = sandbox.window.P8_TEST_FIXTURES;
  if (typeof compute !== 'function') { fail('window.p8_computeTestResults 미노출'); return; }
  if (!fixtures || !fixtures.length) { fail('P8_TEST_FIXTURES 미로드'); return; }

  let s;
  try { s = compute(fixtures); } catch (e) { fail('채점 중 예외: ' + e.message); return; }

  console.log(`  픽스처 ${s.total}건 — 탐지 ${s.detected}/${s.errTotal}, 누락 ${s.missed}, 오탐 ${s.fp}/${s.normTotal}`);
  for (const r of s.results) {
    if (!r.ok) console.log(`    [${r.label}] ${r.text.slice(0, 50)} — ${r.note.slice(0, 100)}`);
  }

  if (s.detected >= BASELINE.minDetected) pass(`탐지 ${s.detected}건 ≥ 기준선 ${BASELINE.minDetected}건`);
  else fail(`탐지 ${s.detected}건 < 기준선 ${BASELINE.minDetected}건 — 교정 규칙 회귀 의심`);

  if (s.fp <= BASELINE.maxFp) pass(`오탐 ${s.fp}건 ≤ 허용 ${BASELINE.maxFp}건`);
  else fail(`오탐 ${s.fp}건 > 허용 ${BASELINE.maxFp}건 — 정상 문장 오탐 회귀 의심`);
}

// ── 실행 ─────────────────────────────────────────────────────
function main() {
  const sandbox = makeSandbox();
  const scripts = [
    'shared/config.js',
    'shared/api-keys.js', // gitignore — CI에는 없을 수 있음 (선택)
    'shared/app.js',
    'panels/panel8/loanword-data.js',
    'panels/panel8/test-fixtures.js',
    'panels/panel8/panel8.js',
  ];
  console.log('스크립트 로드 (런타임 top-level 오류도 함께 검증):');
  for (const s of scripts) {
    if (!fs.existsSync(path.join(ROOT, s))) { console.log('  - ' + s + ' 없음 (건너뜀)'); continue; }
    try { loadScript(sandbox, s); console.log('  ✓ ' + s); }
    catch (e) {
      failures++;
      console.error('  ✗ ' + s + ' 로드 실패: ' + e.message);
      console.error((e.stack || '').split('\n').slice(0, 4).join('\n'));
    }
  }

  testParseAiJson(sandbox);
  testProofreadFixtures(sandbox);

  console.log('\n' + (failures ? `❌ 실패 ${failures}건` : '✅ 전체 통과'));
  process.exit(failures ? 1 : 0);
}

main();
