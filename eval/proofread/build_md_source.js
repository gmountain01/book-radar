#!/usr/bin/env node
/**
 * source_md.json 재생성 — 앱(panel8)이 HWP 원고를 실제로 변환하는 경로 그대로:
 * hwp5.js 문단 추출(개요→#, 글머리→-) → _compressForTokens → textToExtracted(~1500자 페이지) → stripInvisibles
 * 사용법: node eval/proofread/build_md_source.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox, loadScript, SCRIPTS } = require('../../scripts/run_tests.js');

(async () => {
  const sandbox = makeSandbox();
  sandbox.XLSX = require('../../libs/xlsx.full.min.js');
  sandbox.DecompressionStream = DecompressionStream;
  sandbox.Blob = Blob;
  for (const s of SCRIPTS) if (fs.existsSync(path.join(__dirname, '../..', s))) loadScript(sandbox, s);

  const dir = path.join(__dirname, '원고');
  const file = fs.readdirSync(dir).find(f => /\.hwp$/i.test(f));
  const buf = fs.readFileSync(path.join(dir, file));
  const paras = await sandbox.P8Hwp5.extractParagraphs(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const P8 = sandbox.__p8Eval;
  const ex = P8.textToExtracted(file, P8._compressForTokens(paras.filter(t => t.trim()).join('\n\n')));
  const pages = ex.pages.map(p => ({ page: p.page, text: sandbox.stripInvisibles(p.text) }));
  fs.writeFileSync(path.join(__dirname, 'source_md.json'), JSON.stringify({ filename: file, pages }, null, 1));
  console.log(`source_md.json: ${pages.length}쪽, ${pages.reduce((n, p) => n + p.text.length, 0)}자`);
})().catch(e => { console.error(e.message); process.exit(1); });
