(function(){

// ──────────────────────────────────────────────
// PDF.js 설정 (CDN 로드 실패 시 안전하게 처리)
// ──────────────────────────────────────────────
try {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      location.href.replace(/\/[^/]*$/, '/') + 'libs/pdf.worker.min.js';
  }
} catch(e) { console.warn('PDF.js 초기화 실패:', e.message); }

// ──────────────────────────────────────────────
// API 키 형식 검증 유틸 (모듈 스코프 — 어디서든 참조 가능)
// ──────────────────────────────────────────────
function isValidApiKeyFormat(key) {
  return /^sk-ant-[a-zA-Z0-9_-]{10,}$/.test(key);
}
function showApiKeyFormatError(inputEl) {
  if (!inputEl) return;
  inputEl.style.borderColor = '#e74c3c';
  let errEl = inputEl.parentElement && inputEl.parentElement.querySelector('.p8-key-err');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'p8-key-err';
    errEl.style.cssText = 'color:#e74c3c;font-size:.78rem;margin-top:3px;';
    if (inputEl.parentElement) inputEl.parentElement.appendChild(errEl);
  }
  errEl.textContent = '⚠️ 형식 오류 — Anthropic API 키는 sk-ant- 로 시작해야 합니다.';
}
function clearApiKeyFormatError(inputEl) {
  if (!inputEl) return;
  inputEl.style.borderColor = '';
  const errEl = inputEl.parentElement && inputEl.parentElement.querySelector('.p8-key-err');
  if (errEl) errEl.remove();
}

let selectedFile = null;
let allIssues = [];
let currentSev = 'all';
let currentFileKey = null;
let pdfDoc = null;       // PDF.js document (페이지 뷰어용)
let pvCurrentPage = 1;  // 현재 뷰어 페이지
let pvRendering = false; // 렌더링 중 플래그
let rulesChunks = null;  // 교정 규칙 청크 (RAG)
// 해결됨 상태 — allIssues 인덱스 기준, 필터 변경 후에도 유지
const resolvedIndices = new Set();

// ──────────────────────────────────────────────
// 캐시 시스템 (localStorage)
// ──────────────────────────────────────────────
const CACHE_PREFIX = 'pf_v1_';
const CACHE_MAX_ENTRIES = 10; // 최대 저장 파일 수

function getCacheKey(file) {
  // 파일명 + 크기 + 수정일 → 같은 파일 판별
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function getCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function setCache(key, data) {
  try {
    // 오래된 항목 정리
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .map(k => ({ k, ts: (() => { try { return JSON.parse(localStorage.getItem(k))?.cachedAt || 0; } catch(e) { return 0; } })() }))
      .sort((a, b) => a.ts - b.ts);
    while (keys.length >= CACHE_MAX_ENTRIES) {
      localStorage.removeItem(keys.shift().k);
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch(e) {
    console.warn('캐시 저장 실패 (용량 초과 등):', e.message);
    // 저장 실패 시 오래된 캐시 모두 삭제 후 재시도
    try {
      Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
    } catch(e2) { /* 무시 */ }
  }
}

function clearCache(key) {
  try { localStorage.removeItem(CACHE_PREFIX + key); } catch(e) {}
}


function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function renderCacheInfo(file) {
  const el = document.getElementById('p8_cacheInfo');
  if (!file) { el.innerHTML = ''; return; }
  const key = getCacheKey(file);
  const cache = getCache(key);

  if (!cache) {
    el.innerHTML = `<div class="cache-badge new"><span class="dot"></span>새 파일 — 전체 검사 실행</div>`;
    return;
  }

  const aiLabel = cache.aiWasRun ? 'AI 포함' : 'AI 미포함';
  const issueCount = (cache.surfaceIssues?.length || 0) + (cache.linguisticIssues?.length || 0) + (cache.structuralIssues?.length || 0);
  el.innerHTML = `
    <div class="cache-bar">
      <div class="cache-bar-info">
        <span>⚡</span>
        <span><strong>캐시 있음</strong> — ${fmtDate(cache.cachedAt)} · ${issueCount}건 · ${aiLabel}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-cache-clear" onclick="p8_onClearThisCache()" title="이 파일 캐시 삭제 후 전체 재검사">캐시 삭제</button>
      </div>
    </div>
    <div class="cache-badge hit"><span class="dot"></span>캐시 재사용 — 달라진 AI 결과만 재실행</div>`;
}

function p8_onClearThisCache() {
  if (!currentFileKey) return;
  clearCache(currentFileKey);
  renderCacheInfo(selectedFile);
  // 버튼 라벨 변경
  document.getElementById('p8_btnStart').textContent = '교정 시작';
}

// ──────────────────────────────────────────────
// 드래그앤드롭 / 파일 선택
// ──────────────────────────────────────────────
const dropZone = document.getElementById('p8_dropZone');
const fileInput = document.getElementById('p8_fileInput');

const ALLOWED_EXTS = new Set(['pdf','docx','hwpx','hwp','doc']);
function isAllowedFile(f) {
  return f && ALLOWED_EXTS.has(f.name.split('.').pop().toLowerCase());
}

if (dropZone && fileInput) {
  // 클릭은 <label for="p8_fileInput"> 가 네이티브로 처리 — JS click() 불필요
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation(); // label 네이티브 동작 차단
    dropZone.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (isAllowedFile(f)) setFile(f);
    else alert('지원하지 않는 파일 형식입니다.\nPDF / DOCX / HWPX / HWP / DOC 파일을 업로드해 주세요.');
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });
} else {
  console.error('[panel8] 업로드 요소를 찾을 수 없습니다. p8_dropZone:', !!dropZone, 'p8_fileInput:', !!fileInput);
}

function setFile(f) {
  if (!f) return;
  try {
    selectedFile = f;
    currentFileKey = getCacheKey(f);
    const nameEl = document.getElementById('p8_fileName');
    const btnEl  = document.getElementById('p8_btnStart');
    if (nameEl) nameEl.textContent = '✓ ' + f.name;
    if (btnEl)  btnEl.disabled = false;
    renderCacheInfo(f);
  } catch(e) {
    console.error('[panel8] setFile 오류:', e);
    alert('파일 첨부 중 오류가 발생했습니다.\n' + e.message);
  }
}

// 규칙 파일 처리
async function p8_handleRulesFile(file) {
  if (!file) return;
  try {
    const count = await loadRulesFile(file);
    document.getElementById('p8_rulesLabel').textContent = `✓ ${file.name} (${count}개 섹션 로드됨)`;
    var badge = document.querySelector('.rules-badge-default');
    if (badge) { badge.className = 'rules-badge-loaded'; badge.textContent = '사용자 규칙 적용 중'; }
  } catch(e) {
    alert('규칙 파일 읽기 실패: ' + e.message);
  }
}
function p8_handleRulesDrop(file) { if (file) p8_handleRulesFile(file); }

// ──────────────────────────────────────────────
// PDF 텍스트 추출 — 계층적 TOC + 본문 페이지 번호 지원
// ──────────────────────────────────────────────

/** 텍스트 아이템을 y좌표 기준으로 줄(line) 단위로 묶는다 */
function groupTextIntoLines(items, yTol = 3) {
  const filtered = items.filter(it => it.str && it.str.trim());
  if (!filtered.length) return [];
  // y 내림차순(위→아래) → 같은 y면 x 오름차순(왼→오른)
  filtered.sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    return Math.abs(dy) > yTol ? dy : a.transform[4] - b.transform[4];
  });
  const lines = [];
  let cur = null;
  for (const it of filtered) {
    const y = it.transform[5], x = it.transform[4];
    if (!cur || Math.abs(y - cur.y) > yTol) {
      cur = { y, x, text: it.str, items: [it] };
      lines.push(cur);
    } else {
      cur.items.push(it);
      // X좌표 간격으로 띄어쓰기 판단
      cur.text = _joinItemsWithSpacing(cur.items);
    }
  }
  return lines;
}

/** 같은 줄의 텍스트 블록을 X좌표 간격 기반으로 연결 */
function _joinItemsWithSpacing(items) {
  if (items.length <= 1) return items[0]?.str || '';
  let result = items[0].str;
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    // 이전 블록의 끝 X = 시작X + 글자폭(width)
    const prevEndX = prev.transform[4] + (prev.width || 0);
    const currStartX = curr.transform[4];
    const gap = currStartX - prevEndX;
    // 폰트 크기 기준 간격 판단
    const fontSize = Math.abs(curr.transform[0]) || 10;
    const spaceThreshold = fontSize * 0.25; // 폰트의 25% 이상 간격이면 띄어쓰기
    // 이전 블록이 공백으로 끝나거나 현재가 공백으로 시작하면 추가 공백 불필요
    const prevEndsSpace = /\s$/.test(prev.str);
    const currStartsSpace = /^\s/.test(curr.str);
    if (prevEndsSpace || currStartsSpace) {
      result += curr.str;
    } else if (gap > spaceThreshold) {
      result += ' ' + curr.str;
    } else {
      result += curr.str;
    }
  }
  return result;
}

/**
 * 줄 목록을 하나의 텍스트로 연결 — 강제 개행 vs 문단 구분 자동 판단
 * - 줄 간 Y간격이 행간(lineHeight)의 1.6배 이상 → 문단 구분 (\n)
 * - 이전 줄이 마침표/물음표/느낌표/콜론으로 끝남 → 문장 끝 (\n)
 * - 그 외 → 강제 개행 → 공백으로 연결 (문장 이어붙이기)
 */
function _joinLinesSmartly(lines, pageH) {
  if (!lines.length) return '';
  if (lines.length === 1) return lines[0].text;
  // 줄 간격(행간) 추정: 전체 줄 간격의 중앙값
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    var g = Math.abs(lines[i - 1].y - lines[i].y);
    if (g > 0 && g < pageH * 0.15) gaps.push(g);
  }
  gaps.sort(function(a, b) { return a - b; });
  var medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14;
  var paraThreshold = medianGap * 1.6; // 행간의 1.6배 이상이면 문단 구분

  var parts = [lines[0].text];
  for (var i = 1; i < lines.length; i++) {
    var prevText = lines[i - 1].text.trimEnd();
    var yGap = Math.abs(lines[i - 1].y - lines[i].y);
    // 문단 구분 조건
    var isParagraphBreak =
      yGap > paraThreshold ||                         // Y 간격 큼
      /[.!?:;。]\s*$/.test(prevText) ||               // 문장 종결 부호
      /^[\s]*$/.test(prevText) ||                      // 빈 줄
      /^(Chapter|CHAPTER|Part|PART|\d+[.-]\d+|제\s*\d+)/.test(lines[i].text.trim()); // 헤딩 시작
    if (isParagraphBreak) {
      parts.push('\n' + lines[i].text);
    } else {
      // 강제 개행 → 공백으로 연결
      // 한글-한글 사이에 불필요한 공백 방지
      var lastChar = prevText.slice(-1);
      var firstChar = lines[i].text.trimStart().charAt(0);
      var needSpace = !(/[가-힣]/.test(lastChar) && /[가-힣]/.test(firstChar) && prevText.length > 15);
      parts.push(needSpace ? ' ' + lines[i].text : lines[i].text);
    }
  }
  return parts.join('');
}

/** 줄 목록에서 페이지 헤딩과 레벨을 추출 */
function extractHeadingsFromLines(lines, bodyFontSize) {
  const headings = [];
  const PART_PAT    = /^(Part|PART|파트)\s*(\d+)\s+(.*)/i;
  const CHAP_PAT    = /^(Chapter|CHAPTER|챕터)\s*(\d+)\s+(.*)/i;
  const SUBSEC_PAT  = /^(\d+)[.-](\d+)[.-](\d+)\s+(.*)/;
  const SEC_PAT     = /^(\d+)[.-](\d+)\s+(.*)/;

  for (const line of lines) {
    const text = line.text.trim();
    if (!text || text.length < 2 || text.length > 120) continue;
    const fs = line.items[0]?.transform ? Math.abs(line.items[0].transform[0]) : 0;
    const isBold = line.items.some(it => (it.fontName || '').toLowerCase().includes('bold'));

    let level = 0, title = text;
    if      (PART_PAT.test(text))   { level = 1; title = text.match(PART_PAT)[3].trim() || text; }
    else if (CHAP_PAT.test(text))   { level = 2; title = text.match(CHAP_PAT)[3].trim() || text; }
    else if (SUBSEC_PAT.test(text)) { level = 4; title = text.match(SUBSEC_PAT)[4].trim() || text; }
    else if (SEC_PAT.test(text))    { level = 3; title = text.match(SEC_PAT)[3].trim() || text; }
    else if (fs >= bodyFontSize * 1.4) level = 2;
    else if (fs >= bodyFontSize * 1.15 || (isBold && fs > bodyFontSize)) level = 3;

    if (level > 0) headings.push({ title, fullText: text, level, fontSize: fs });
  }
  return headings;
}

/**
 * 목차 한 줄에서 제목과 페이지 번호를 추출한다.
 * 규칙: 리더 문자(·, ., …, _, -, 공백 연속) 이후 맨 끝 숫자가 페이지 번호.
 * 예) "1.1 DBMS 개요 ················ 5" → { title: "1.1 DBMS 개요", page: 5 }
 */
function parseTocLine(raw) {
  // 다양한 리더 문자를 단일 공백으로 정규화
  const cleaned = raw
    .replace(/[\u00B7\u00B8\u2022\u22EF\u2026\u22C5·•]{2,}/g, ' ')  // 중점 연속
    .replace(/\.{2,}/g, ' ')     // 점 연속 (....)
    .replace(/_{2,}/g, ' ')      // 밑줄 연속 (_____)
    .replace(/-{4,}/g, ' ')      // 대시 연속 (-----)
    .replace(/\s{2,}/g, ' ')     // 공백 연속
    .trim();
  // 끝에 있는 숫자가 페이지 번호
  const m = cleaned.match(/^(.+?)\s+(\d{1,4})\s*$/);
  if (!m) return null;
  const title = m[1].trim();
  const page = parseInt(m[2], 10);
  // 제목이 너무 짧거나 페이지 범위 초과 제외
  if (title.length < 2 || page < 1 || page > 9999) return null;
  return { title, page };
}

/** 텍스트 기반 TOC 파싱 — 목차 페이지에서 Part·Chapter·절·소절 계층 추출 */
function parseTocFromPages(pages) {
  const entries = [];
  const PART_PAT   = /^(Part|PART|파트)\s*(\d+)\b/i;
  const CHAP_PAT   = /^(Chapter|CHAPTER|챕터)\s*(\d+)\b/i;
  const SUBSEC_PAT = /^(\d+)[.-](\d+)[.-](\d+)\b/;
  const SEC_PAT    = /^(\d+)[.-](\d+)\b/;

  // 앞 15페이지를 대상으로 목차 페이지 탐색
  const scanLimit = Math.min(15, pages.length);
  for (let pi = 0; pi < scanLimit; pi++) {
    const pd = pages[pi];
    if (!pd.lines || !pd.lines.length) continue;

    // 해당 페이지에 목차 패턴 줄이 2개 이상이면 목차 페이지로 간주
    const matchCount = pd.lines.filter(l => parseTocLine(l.text.trim()) !== null).length;
    const hasKeyword = /Chapter|Part|목차|챕터|파트/i.test(pd.text);
    if (matchCount < 2 && !hasKeyword) continue;

    for (const line of pd.lines) {
      const raw = line.text.trim();
      if (!raw || raw.length < 2) continue;

      // 끝 숫자(페이지) 추출
      const parsed = parseTocLine(raw);
      let title = '', pageNum = 0;
      if (parsed) {
        title = parsed.title;
        pageNum = parsed.page;
      } else {
        // Part/Chapter 줄은 페이지 번호 없어도 수집
        if (PART_PAT.test(raw) || CHAP_PAT.test(raw)) {
          title = raw;
          pageNum = 0;
        } else continue;
      }
      if (!title || title.length < 2 || pageNum > 9999) continue;

      // 계층 레벨 결정 (제목 앞부분 패턴 우선)
      let level = 3; // 기본 = 중절
      if      (PART_PAT.test(title))   level = 1;
      else if (CHAP_PAT.test(title))   level = 2;
      else if (SUBSEC_PAT.test(title)) level = 4;
      else if (SEC_PAT.test(title))    level = 3;

      const indent = line.x || (line.items[0]?.transform[4]) || 0;
      entries.push({ title, level, page: pageNum, indent, sourcePdfPage: pd.page });
    }
  }

  // 들여쓰기로 레벨 보정 (Part/Chapter는 유지, 나머지만 조정)
  if (entries.length > 3) {
    const genericEntries = entries.filter(e => e.level >= 3);
    const indents = [...new Set(genericEntries.map(e => Math.round(e.indent / 8) * 8))].sort((a,b)=>a-b);
    for (const e of genericEntries) {
      const ri = Math.round(e.indent / 8) * 8;
      const li = indents.indexOf(ri);
      if (li >= 0) e.level = Math.min(4, 3 + li);
    }
  }

  return entries;
}

// ──────────────────────────────────────────────
// 다형 추출 디스패처 — 확장자에 따라 적절한 추출 함수 호출
// ──────────────────────────────────────────────

async function extractFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf')  return extractPDF(file);
  if (ext === 'docx') return extractDOCX(file);
  if (ext === 'hwpx') return extractHWPX(file);
  if (ext === 'hwp')  return extractHWP(file);
  if (ext === 'doc')  return extractDOC(file);
  if (ext === 'txt' || ext === 'md') return extractTXT(file);
  throw new Error(`지원하지 않는 파일 형식: .${ext}\n지원 형식: PDF, DOCX, HWPX, HWP, DOC, TXT`);
}

/** TXT/MD 파일 — 텍스트 그대로 추출 */
async function extractTXT(file) {
  const text = await file.text();
  if (!text || text.trim().length < 10) throw new Error('텍스트 파일 내용이 비어있습니다.');
  return textToExtracted(file.name, text);
}

/**
 * 텍스트 블록을 ~1500자 단위 가상 페이지로 분할해 extracted 객체 반환.
 * PDF 이외 형식에서 공통으로 사용.
 */
function textToExtracted(filename, fullText) {
  // 이중 개행 기준으로 단락 분리 후 ~1500자 묶음으로 페이지 구성
  const paragraphs = fullText.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const pages = [];
  let buf = '', pageNum = 1;
  for (const para of paragraphs) {
    buf += para.trim() + '\n\n';
    if (buf.length >= 1500) {
      pages.push({ page: pageNum++, text: buf.trim(), lines: [], headings: [], bodyPageNum: null });
      buf = '';
    }
  }
  if (buf.trim()) pages.push({ page: pageNum++, text: buf.trim(), lines: [], headings: [], bodyPageNum: null });
  if (!pages.length) throw new Error('파일에서 텍스트를 추출하지 못했습니다.');
  return { filename, total_pages: pages.length, toc: [], pages, isPdfFile: false };
}

/** DOCX → mammoth.js로 텍스트 추출 */
async function extractDOCX(file) {
  if (typeof mammoth === 'undefined') throw new Error('mammoth.js 라이브러리를 로드할 수 없습니다. 인터넷 연결을 확인하세요.');
  const ab = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  if (!result.value || result.value.trim().length < 10)
    throw new Error('DOCX 파일에서 텍스트를 추출하지 못했습니다. 파일이 손상되지 않았는지 확인하세요.');
  return textToExtracted(file.name, result.value);
}

/** HWPX (ZIP+XML) → JSZip으로 압축 풀고 hp:t 요소에서 텍스트 추출 */
async function extractHWPX(file) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리를 로드할 수 없습니다. 인터넷 연결을 확인하세요.');
  const ab = await file.arrayBuffer();
  let zip;
  try { zip = await JSZip.loadAsync(ab); }
  catch(e) { throw new Error('HWPX 파일을 열 수 없습니다. 파일이 손상되지 않았는지 확인하세요.'); }

  // Contents/section0.xml, section1.xml … 순서대로 읽기
  const sectionFiles = Object.keys(zip.files)
    .filter(n => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0]), nb = parseInt(b.match(/\d+/)[0]);
      return na - nb;
    });

  if (!sectionFiles.length) throw new Error('HWPX 파일 내 본문 섹션을 찾을 수 없습니다.');

  let fullText = '';
  for (const fname of sectionFiles) {
    const xml = await zip.files[fname].async('string');
    // <hp:t> 또는 네임스페이스 없는 <t> 태그에서 텍스트 추출
    const matches = xml.match(/<(?:hp:)?t(?:\s[^>]*)?>([^<]*)<\/(?:hp:)?t>/g) || [];
    const pageText = matches.map(m => m.replace(/<[^>]+>/g, '')).join('');
    if (pageText.trim()) fullText += pageText + '\n\n';
  }
  if (!fullText.trim()) throw new Error('HWPX 파일에서 텍스트를 추출하지 못했습니다.');
  return textToExtracted(file.name, fullText);
}

/**
 * HWP binary (OLE Compound Document) — 브라우저에서 신뢰 가능한 텍스트 추출 불가.
 * HWP 바이너리는 텍스트를 zlib 압축 OLE 스트림에 저장하므로
 * 바이트 스캔 방식은 OLE 메타데이터에서 우연히 일치하는 쓰레기 값을 반환한다.
 * → 잘못된 텍스트로 교정 검사를 수행하는 것보다 명확한 안내가 낫다.
 */
async function extractHWP(file) {
  throw new Error(
    'HWP 바이너리 파일은 브라우저에서 텍스트를 정확히 추출할 수 없습니다.\n\n' +
    '아래 방법 중 하나로 변환 후 재업로드해 주세요:\n' +
    '① 한컴오피스에서 "다른 이름으로 저장 → HWPX(.hwpx)"\n' +
    '② 한컴오피스에서 "내보내기 → PDF"\n' +
    '③ 한컴오피스에서 "다른 이름으로 저장 → DOCX(.docx)"'
  );
}

/** DOC (구형 바이너리 Word) — mammoth.js 시도 후 실패 시 안내 */
async function extractDOC(file) {
  if (typeof mammoth !== 'undefined') {
    try {
      const ab = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: ab });
      if (result.value && result.value.trim().length >= 50)
        return textToExtracted(file.name, result.value);
    } catch(e) { /* 무시하고 안내 메시지 출력 */ }
  }
  throw new Error('.doc 파일은 지원이 제한됩니다.\nMicrosoft Word에서 "다른 이름으로 저장 → .docx"로 변환 후 업로드해 주세요.');
}

async function extractPDF(file) {
  if (typeof pdfjsLib === 'undefined' || !pdfjsLib.getDocument) {
    throw new Error(
      'PDF.js 라이브러리가 로드되지 않았습니다.\n\n' +
      '인터넷 연결을 확인하고 페이지를 새로고침(F5)해 주세요.\n' +
      '계속 실패하면 PDF를 DOCX로 변환 후 업로드해 보세요.'
    );
  }
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  pdfDoc = pdf; // 페이지 뷰어용으로 보존
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    // 10페이지마다 UI 스레드 양보 — 브라우저 응답성 유지
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    const pg = await pdf.getPage(i);
    const content = await pg.getTextContent();
    const vp = pg.getViewport({ scale: 1 });
    const pageH = vp.height;
    pg.cleanup(); // 렌더링 리소스 해제

    // 줄 단위 그룹핑 + 강제 개행 제거
    const lines = groupTextIntoLines(content.items);
    const text = _joinLinesSmartly(lines, pageH);

    // 본문 페이지 번호: 하단 12% 영역에 단독으로 있는 숫자
    let bodyPageNum = null;
    const bottomY = pageH * 0.12;
    for (const line of lines) {
      if (line.y <= bottomY && /^\s*\d+\s*$/.test(line.text)) {
        const n = parseInt(line.text.trim());
        if (n >= 1 && n <= pdf.numPages * 3) bodyPageNum = n;
      }
    }

    // 전체 폰트 크기 중앙값 (본문 기준)
    const fsSizes = content.items
      .filter(it => it.transform && it.str.trim())
      .map(it => Math.abs(it.transform[0]))
      .filter(fs => fs > 6 && fs < 50);
    fsSizes.sort((a, b) => a - b);
    const medianFS = fsSizes[Math.floor(fsSizes.length / 2)] || 11;

    // 계층 헤딩 추출
    const headings = extractHeadingsFromLines(lines, medianFS);

    pages.push({ page: i, text, lines, headings, bodyPageNum });
  }

  // TOC 추출 — outline 우선, 부족하면 텍스트 파싱
  let toc = [];
  try {
    const outline = await pdf.getOutline();
    if (outline && outline.length > 0) {
      const flatten = (items, level = 1) => {
        if (!items) return;
        items.forEach(item => {
          toc.push({ level, title: item.title || '', dest: item.dest, page: null });
          if (item.items) flatten(item.items, level + 1);
        });
      };
      flatten(outline);
      // outline의 dest를 페이지 번호로 변환 (가능한 경우)
      for (const e of toc) {
        try {
          if (e.dest) {
            const dest = Array.isArray(e.dest) ? e.dest : await pdf.getDestination(e.dest);
            if (dest && dest[0]) {
              const idx = await pdf.getPageIndex(dest[0]);
              // idx는 0-based PDF index → 1-based로 변환 후 bodyPageNum 매핑 시도
              const pdfPage = idx + 1;
              // bodyPageNum이 있으면 그것 사용, 없으면 PDF 인덱스 사용
              e.page = pages[idx]?.bodyPageNum || pdfPage;
              e.pdfPage = pdfPage;
            }
          }
        } catch(_) {}
      }
    }
  } catch(e) {}

  // outline 항목이 3개 미만이면 텍스트 파싱으로 보완
  if (toc.filter(e => e.page).length < 3) {
    const textToc = parseTocFromPages(pages);
    if (textToc.length > toc.length) toc = textToc;
  }

  return { filename: file.name, total_pages: pdf.numPages, toc, pages, isPdfFile: true };
}

// ──────────────────────────────────────────────
// 표면 검사 (정규식) — 출판 교정 전 항목
// ──────────────────────────────────────────────

// 1-a. 조사 인접 오타 (을를, 은는 등 붙어 있는 경우 — 단순 타이핑 실수)
// suggestion에 구체적 수정안 포함: 앞말 받침 유무에 따라 올바른 조사 결정
const PARTICLE_PATTERNS = [
  [/을를|를을/g,         '조사중복', 'high',   '을/를 중 하나만 사용 (받침 있으면 "을", 없으면 "를")'],
  [/이가|가이(?=[^나])/g,'조사중복', 'high',   '이/가 중 하나만 사용 (받침 있으면 "이", 없으면 "가")'],
  [/은는|는은/g,         '조사중복', 'high',   '은/는 중 하나만 사용 (받침 있으면 "은", 없으면 "는")'],
  [/와과|과와/g,         '조사중복', 'high',   '와/과 중 하나만 사용 (받침 있으면 "과", 없으면 "와")'],
  [/에서서|에게서서/g,   '조사중복', 'high',   '"서" 하나 삭제 → "에서" 또는 "에게서"'],
];

/**
 * 조사 인접 중복(1-a)에 대해 앞 글자 받침을 보고 구체적 수정안을 생성한다.
 * addAll이 만든 issue를 후처리하여 suggestion을 교체한다.
 * @param {object} issue - { found, ... }
 * @param {string} text  - 해당 페이지 전문
 * @param {object} match - regex match (m.index 사용)
 * @returns {string} 구체적 수정안 (예: "데이터를")
 */
function makeParticleFix(found, text, matchIndex) {
  // 중복 조사 앞의 글자를 찾아 받침 유무 판별
  const prevChar = matchIndex > 0 ? text[matchIndex - 1] : '';
  const hasBatchim = _hasFinalConsonant(prevChar);

  // 매핑: 중복 패턴 → [받침O 조사, 받침X 조사]
  const fixes = {
    '을를': ['을', '를'], '를을': ['을', '를'],
    '이가': ['이', '가'], '가이': ['이', '가'],
    '은는': ['은', '는'], '는은': ['은', '는'],
    '와과': ['과', '와'], '과와': ['과', '와'],
    '에서서': ['에서', '에서'], '에게서서': ['에게서', '에게서'],
  };

  const pair = fixes[found];
  if (!pair) return null;

  if (found === '에서서' || found === '에게서서') {
    return `${prevChar}${pair[0]}`;
  }

  const correct = hasBatchim === null ? `${pair[0]}(받침O) 또는 ${pair[1]}(받침X)`
                : hasBatchim ? pair[0] : pair[1];
  return `${prevChar}${correct}`;
}

/** 한글 글자의 받침(종성) 유무 판별. 한글이 아니면 null 반환. */
function _hasFinalConsonant(ch) {
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null; // 한글 범위 밖
  return (code - 0xAC00) % 28 !== 0; // 종성 인덱스 0이면 받침 없음
}

// 1-b. 조사 반복 — 정규식으로는 해당 문장에 맞는 수정안을 생성할 수 없으므로
// AI 검사(checkLinguistic)에서 '조사중복' type으로 문맥 기반 판단+수정안 생성

// 2. 단어/어구 반복 — \n 제외(PDF 줄바꿈은 반복이 아님), 3글자 이상 어절만 탐지(2글자는 오탐 다수)
const REPEAT_RE = /([가-힣]{3,})[ \t]*\1/g;

// 3. 이중 수동 / 수동 남용
const DOUBLE_PASSIVE_PATS = [
  [/ ?되어지/g,   '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/되어\s*지고/g,'이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/쓰여지/g,     '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/받아지/g,     '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/보여지/g,     '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/잊혀지/g,     '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/나뉘어지/g,   '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
];

/**
 * 이중수동 found에 맞는 단일수동/능동 두 가지 수정안 반환
 * @returns { passive: string, active: string }
 */
function makePassiveAlts(found) {
  if (!found) return null;
  const f = found;
  if (/되어지/.test(f))   return { passive: f.replace(/되어지/g, '되'), active: f.replace(/되어지/g, '한다') };
  if (/되어\s*지고/.test(f)) return { passive: f.replace(/되어\s*지고/g, '되고'), active: f.replace(/되어\s*지고/g, '하고') };
  if (/쓰여지/.test(f))   return { passive: f.replace(/쓰여지/g, '쓰인다'), active: f.replace(/쓰여지/g, '쓴다') };
  if (/받아지/.test(f))   return { passive: f.replace(/받아지/g, '받는다'), active: f.replace(/받아지/g, '얻는다') };
  if (/보여지/.test(f))   return { passive: f.replace(/보여지/g, '보인다'), active: f.replace(/보여지/g, '본다') };
  if (/잊혀지/.test(f))   return { passive: f.replace(/잊혀지/g, '잊힌다'), active: f.replace(/잊혀지/g, '잊는다') };
  if (/나뉘어지/.test(f)) return { passive: f.replace(/나뉘어지/g, '나뉜다'), active: f.replace(/나뉘어지/g, '나눈다') };
  return null;
}

// 4. 군더더기·중복 표현
const REDUNDANT_PATS = [
  [/할\s*수\s*가\s*있/g,              '중복군더더기', 'medium', '"할 수 있"으로 수정 (수가→수)'],
  [/하게\s*되어\s*지/g,               '중복군더더기', 'medium', '"하게 되"로 수정'],
  [/이미[ \t]+[가-힣]+[ \t]*한[ \t]*바[ \t]*있/g,'중복군더더기', 'medium', '"이미 ~했다"로 줄이세요'],
  [/라고\s*하는\s*것은/g,             '중복군더더기', 'medium', '"~은/는"으로 줄이세요'],
  [/([가-힣])\s*인\s*것이다/g,        '중복군더더기', 'low',    '"~이다"로 줄이세요'],
  [/([가-힣])\s*는\s*것이다\b/g,      '중복군더더기', 'low',    '"~다"로 줄이세요'],
  [/매우\s*매우|아주\s*아주/g,        '중복군더더기', 'medium', '강조어 중복 삭제'],
  [/각각의\s*각/g,                    '중복군더더기', 'medium', '"각각의" 또는 "각"으로 통일'],
  [/함께\s*같이|같이\s*함께/g,        '중복군더더기', 'medium', '"함께" 또는 "같이" 하나만 사용'],
  [/있는[ \t]+중에[ \t]+있/g,         '중복군더더기', 'medium', '"고 있습니다"로 줄이세요 (이중 상태 표현)'],
  [/중에[ \t]+있습니다/g,             '중복군더더기', 'medium', '"중입니다"로 줄이세요 (예: 진행 중입니다)'],
  [/중에[ \t]+있다\b/g,               '중복군더더기', 'medium', '"중이다"로 줄이세요'],
];

// 5. 접속사 중복 연속 사용 — 같은 줄 내만 탐지 (\n 제외)
const CONJ_PATS = [
  [/그러나[ \t]+하지만|하지만[ \t]+그러나/g, '접속사중복', 'medium', '"그러나" 또는 "하지만" 하나만 사용'],
  [/그리고[ \t]+또한|또한[ \t]+그리고/g,     '접속사중복', 'medium', '"그리고" 또는 "또한" 하나만 사용'],
  [/따라서[ \t]+그러므로|그러므로[ \t]+따라서/g,'접속사중복','medium','"따라서" 또는 "그러므로" 하나만 사용'],
  [/그래서[ \t]+따라서|따라서[ \t]+그래서/g, '접속사중복', 'medium', '"그래서" 또는 "따라서" 하나만 사용'],
];

// 6. 한자어 남용 패턴 — 불필요한 한자 병기 형태
const HANJA_PATS = [
  [/[가-힣]{2,}\([一-龥]{1,4}\)/g, '한자남용', 'low', '한자 병기 불필요 — 한글만 표기하세요'],
];

// 7. 문장부호 오류
const PUNCT_PATS = [
  [/[?!]{3,}/g,      '문장부호오류', 'medium', '?나 ! 하나만 사용'],
  [/\.{4,}/g,        '문장부호오류', 'low',    '줄임표는 …(말줄임표) 또는 ……으로'],
  [/,[ \t]*,/g,      '문장부호오류', 'high',   '쉼표 중복 삭제'],
  // \n은 PDF 줄바꿈이므로 제외 — 같은 줄 내 스페이스/탭 2개 이상만 탐지
  [/[가-힣][ \t]{2,}[가-힣]/g, '불필요한공백', 'low', '불필요한 공백 삭제'],
];

// 8. 외래어 오표기 (1팀 교정 규칙 §7 기반)
const LOANWORD_PATS = [
  // 표준국어대사전 기준 외래어 오표기 → 올바른 표기
  [/컨텐츠/g,         '외래어표기오류', 'medium', '콘텐츠'],
  [/메세지/g,         '외래어표기오류', 'medium', '메시지'],
  [/리더쉽/g,         '외래어표기오류', 'medium', '리더십'],
  [/파트너쉽/g,       '외래어표기오류', 'medium', '파트너십'],
  [/멤버쉽/g,         '외래어표기오류', 'medium', '멤버십'],
  [/워크플로우/g,     '외래어표기오류', 'medium', '워크플로'],
  [/어플리케이션/g,   '외래어표기오류', 'medium', '애플리케이션'],
  [/어플(?=[^리]|$)/g,'외래어표기오류', 'medium', '앱 또는 애플리케이션'],
  [/데스크탑/g,       '외래어표기오류', 'medium', '데스크톱'],
  [/프리젠테이션/g,   '외래어표기오류', 'medium', '프레젠테이션'],
  [/네비게이션/g,     '외래어표기오류', 'medium', '내비게이션'],
  [/악세서리/g,       '외래어표기오류', 'medium', '액세서리'],
  [/다이나믹/g,       '외래어표기오류', 'low',    '다이내믹'],
  [/로보트/g,         '외래어표기오류', 'medium', '로봇'],
  [/싸이트/g,         '외래어표기오류', 'medium', '사이트'],
  [/시뮬레이팅/g,     '외래어표기오류', 'medium', '시뮬레이션'],
  [/인터렉티브/g,     '외래어표기오류', 'medium', '인터랙티브'],
  [/브라우져/g,       '외래어표기오류', 'medium', '브라우저'],
  [/서버(?=\s*사이드)/g,'외래어표기오류', 'low',  '서버 사이드 (띄어쓰기 확인)'],
  [/섀도우(?!박스)/g, '외래어표기오류', 'low',    '섀도'],
  [/니즈/g,           '외래어표기오류', 'low',    '"요구" 또는 "필요" (한국어 표현 권장)'],
];

// 9. 번역체·일본식 표현 (표면 정규식)
const JSTYLE_PATS = [
  [/[가-힣]+에\s+있어서/g,           '일본식표현', 'medium', '"~에서"로 바꾸세요 (일본어 において 직역)'],
  [/함에\s+있어서/g,                  '번역체',     'medium', '"~할 때" 또는 "~하려면"으로 바꾸세요'],
  [/[가-힣]+를?\s*통해서\b/g,         '번역체',     'low',    '"통해"로 줄이세요 (통해서 → 통해)'],
  [/(?:그것|이것)은\s+[가-힣]+이기도/g,'번역체',    'medium', '영어식 주어 반복 — "또한 ~이다"로 통합하세요'],
  [/[가-힣]{2,}적인\s+[가-힣]+에서/g, '일본식표현','low',    '"~에서" 또는 명사 직접 사용 권장 (기술적인 → 기술)'],
  // 다중조사 중첩 (번역투) — 한국어_다중조사_자료집.txt 기반
  [/[가-힣]+에서의\s/g,               '번역체',     'medium', '"~에서의"는 삭제하거나 동사로 풀기 ("에서의 협업" → "에서 협업한")'],
  [/[가-힣]+로부터의\s/g,             '번역체',     'medium', '"~로부터의"는 "~의" 또는 "~가 준"으로 축약'],
  [/[가-힣]+에게서의\s/g,             '번역체',     'medium', '"~에게서의"는 "~의" 또는 "~가 보낸"으로 축약'],
  [/[가-힣]+로서의\s/g,               '번역체',     'low',    '"~로서의"는 90% 생략 가능 ("편집자로서의 방향" → "편집 방향")'],
  [/[가-힣]+에\s*관해서의\s/g,        '번역체',     'medium', '"~에 관해서의"는 삭제 또는 "~의"로 축약'],
  [/[가-힣]+을\s*통해서의\s/g,        '번역체',     'medium', '"~을 통해서의"는 "~을 통한" 또는 문장 재구성'],
  [/[가-힣]+에\s*따라서의\s/g,        '번역체',     'medium', '"~에 따라서의"는 "~에 따른"으로 축약'],
];

// 10. AI투 상투어 — AI 판독기에서 가장 신뢰도 높은 단서
const AI_CLICHE_PATS = [
  // 도입부 상투어
  [/현대\s*사회에서/g,                       'AI투', 'high',   'AI 상투 도입부 — 삭제하고 본론부터 시작하세요'],
  [/급속도로\s*발전하고\s*있는/g,            'AI투', 'high',   'AI 상투 — 구체적 수치나 사례로 교체하세요'],
  [/[가-힣]+에\s*대해\s*알아보겠습니다/g,    'AI투', 'high',   'AI 상투 — 삭제하고 바로 내용을 시작하세요'],
  [/[가-힣]+을\s*살펴보도록\s*하겠습니다/g,  'AI투', 'high',   'AI 상투 — "~을 보겠습니다" 또는 삭제'],
  [/매우\s*중요한\s*주제입니다/g,            'AI투', 'medium', 'AI 상투 — 왜 중요한지 구체적으로 쓰세요'],
  // 연결·강조 상투어
  [/뿐만\s*아니라/g,                         'AI투', 'medium', 'AI 빈출 연결어 — "게다가", "더구나", "~도" 등으로 교체'],
  [/더욱이\b/g,                              'AI투', 'medium', 'AI 빈출 연결어 — "게다가", "한술 더 떠서" 등으로 교체'],
  [/나아가\b/g,                              'AI투', 'low',    'AI 빈출 — 문맥에 맞는 자연스러운 연결어로 교체'],
  [/이는\s*[가-힣]+을\s*의미합니다/g,        'AI투', 'high',   'AI 상투 — 풀어서 직접 설명하세요'],
  [/주목할\s*만한\s*점은/g,                  'AI투', 'medium', 'AI 상투 — "눈여겨볼 건", "재밌는 건" 등으로 교체'],
  [/아무리\s*강조해도\s*지나치지\s*않/g,     'AI투', 'high',   'AI 상투 — 삭제하고 구체적 근거를 제시하세요'],
  // 마무리 상투어
  [/결론적으로\b/g,                          'AI투', 'high',   'AI 상투 마무리 — 삭제하거나 "정리하면", "한마디로" 등으로 교체'],
  [/요약하자면\b/g,                          'AI투', 'medium', 'AI 상투 마무리 — "간추리면", "핵심만 뽑으면" 등으로 교체'],
  [/종합하면\b/g,                            'AI투', 'medium', 'AI 상투 마무리 — 자연스럽게 끝내거나 "모아보면" 등으로 교체'],
  [/신중한\s*접근이\s*필요합니다/g,          'AI투', 'high',   'AI 상투 — 구체적으로 어떤 접근이 필요한지 쓰세요'],
  [/균형\s*잡힌\s*시각이\s*요구됩니다/g,     'AI투', 'high',   'AI 상투 — 어느 쪽 입장인지 명확히 하세요'],
  [/지속적인\s*관심과\s*노력이\s*필요/g,     'AI투', 'high',   'AI 상투 — 삭제하거나 구체적 행동을 제시하세요'],
  // 진부한 비유
  [/양날의\s*검/g,                           'AI투', 'high',   'AI 진부 비유 — 신선한 비유로 교체하세요'],
  [/동전의\s*양면/g,                         'AI투', 'high',   'AI 진부 비유 — 신선한 비유로 교체하세요'],
  [/빙산의\s*일각/g,                         'AI투', 'medium', 'AI 진부 비유 — 구체적 수치로 규모를 보여주세요'],
  // 번역투 (기존 JSTYLE보다 더 넓은 범위)
  [/[가-힣]+을\s*가지고\s*있다/g,            'AI투', 'medium', 'have 직역 — "~이 있다"로 교체'],
  [/[가-힣]+함으로써\b/g,                    'AI투', 'low',    '번역투 — "~해서", "~하면" 등으로 바꾸세요'],
  [/[가-힣]+중\s*하나이다/g,                 'AI투', 'medium', '"one of the" 직역 — "~도 있다", "대표적인 건" 등으로 교체'],
  // 수식어 과잉
  [/혁신적이고\s*창의적이?며?\s*효율적인/g,  'AI투', 'high',   'AI 수식 나열 — 형용사 하나만 남기세요'],
  [/다양하고\s*여러\s*가지의/g,              'AI투', 'high',   'AI 의미 중복 수식 — 구체적 예시나 숫자로 교체'],
  // 단정 회피
  [/라고\s*할\s*수\s*있다/g,                 'AI투', 'medium', 'AI 단정 회피 — "~다"로 단정하세요. 자신감 있게'],
];

// 10-b. 편집 통일안 (통일안 검색기 ver.3.xlsx 기반)
const UNITY_PATS = [
  // 맞춤법 혼동어
  [/따라하기/g,           '맞춤법', 'high',   '따라 하기 (본동사+본동사는 띄어 씀)'],
  [/그리고는\b/g,         '맞춤법', 'medium', '그러고는 (그리고는 X)'],
  [/그리고\s*나서/g,      '맞춤법', 'medium', '그러고 나서 (그리고 나서 X)'],
  [/그럴려고/g,           '맞춤법', 'high',   '그러려고 (그럴려고 X)'],
  [/길다란/g,             '맞춤법', 'medium', '기다란 (길다란 X)'],
  [/어플리케이션/g,       '외래어표기오류', 'medium', '애플리케이션'],
  // 보조용언 띄어쓰기
  [/내려\s+받/g,          '띄어쓰기', 'medium', '내려받다 (붙여쓰기)'],
  [/하지\s*마라/g,        '띄어쓰기', 'low',    '하지 마라 (-지 말다는 띄어 씀)'],
  // 값 띄어쓰기 (한글명사+값)
  [/목표값/g,             '띄어쓰기', 'medium', '목표 값 (띄어 씀)'],
  [/결과값/g,             '띄어쓰기', 'medium', '결과 값 (띄어 씀)'],
  [/논리값/g,             '띄어쓰기', 'medium', '논리 값 (띄어 씀)'],
  [/기준값/g,             '띄어쓰기', 'medium', '기준 값 (띄어 씀)'],
  [/단위값/g,             '띄어쓰기', 'medium', '단위 값 (띄어 씀)'],
  [/텍스트값/g,           '띄어쓰기', 'medium', '텍스트 값 (띄어 씀)'],
  [/인덱스값/g,           '띄어쓰기', 'medium', '인덱스 값 (띄어 씀)'],
  [/셀값/g,               '띄어쓰기', 'medium', '셀 값 (띄어 씀)'],
];

// 11. 내용보완필요 (표면 정규식)
const CITE_PATS = [
  [/(?:최근|일부|한)\s*연구에\s*따르면/g,     '내용보완필요', 'medium', '연구 출처(기관·논문명·연도) 명시 필요'],
  [/\d+\s*%\s*(?:이상|향상|개선|감소|증가)/g, '내용보완필요', 'medium', '수치 출처 및 측정 기준 명시 필요'],
  [/보고도?\s*있습니다/g,                      '내용보완필요', 'low',    '"보고" 주체와 출처 명시 필요 (어느 기관·연도)'],
  [/통계(?:가|도)\s*있습니다/g,               '내용보완필요', 'low',    '통계 출처(기관·조사 시점) 명시 필요'],
  [/알려져\s*있습니다/g,                       '내용보완필요', 'low',    '"알려져 있습니다" — 출처 없는 주장, 근거 명시 권장'],
];

// 11. 문단연결불량 (표면 정규식)
const TRANSITION_PATS = [
  [/그런데\s+이와\s*동시에/g,     '문단연결불량', 'medium', '"한편"·"동시에" 중 하나로 정리하세요 (역접+동시 혼용 어색)'],
  [/그것을\s*다루느냐/g,          '문단연결불량', 'low',    '"그것" 지시 대상 불명확 — 앞 문단과의 연결이 단절됨'],
  [/달려\s*있다고\s*할\s*수\s*있습니다/g, '문단연결불량', 'low', '이 문장 이후 새 주제 전환 시 "한편"·"이와 달리" 등 전환어 삽입 권장'],
];

function checkSurface(extracted) {
  const issues = [];

  function addAll(pats, text, page) {
    for (const [pat, type, severity, sugg] of pats) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(text)) !== null) {
        const found = m[0].slice(0, 60);
        issues.push({ type, severity, page, found,
          suggestion: sugg, description: `${type}: '${found}'` });
      }
    }
  }

  for (const pd of extracted.pages) {
    const { page, text } = pd;
    if (text.length < 20) continue;

    // 조사 인접 오타 (을를, 이가 등) — 후처리로 구체적 수정안 첨부
    {
      for (const [pat, type, severity, sugg] of PARTICLE_PATTERNS) {
        pat.lastIndex = 0;
        let m;
        while ((m = pat.exec(text)) !== null) {
          const found = m[0].slice(0, 60);
          const fix = makeParticleFix(m[0], text, m.index);
          issues.push({ type, severity, page, found,
            suggestion: fix ? `→ "${fix}" ${sugg}` : sugg,
            description: `${type}: '${found}'` });
        }
      }
    }

    // 단어 반복
    REPEAT_RE.lastIndex = 0;
    let m;
    while ((m = REPEAT_RE.exec(text)) !== null) {
      issues.push({ type:'단어반복', severity:'medium', page,
        found: m[0].slice(0,50),
        suggestion: `'${m[1]}' 하나 삭제 또는 다른 표현`,
        description: `단어 반복: '${m[1]}'` });
    }

    // 이중 수동 — 탐지 후 alts(단일수동/능동 수정안) 첨부
    const beforePassive = issues.length;
    addAll(DOUBLE_PASSIVE_PATS, text, page);
    for (let i = beforePassive; i < issues.length; i++) {
      const alts = makePassiveAlts(issues[i].found);
      if (alts) issues[i].alts = alts;
    }
    // 군더더기
    addAll(REDUNDANT_PATS, text, page);
    // 접속사 중복
    addAll(CONJ_PATS, text, page);
    // 한자 남용
    addAll(HANJA_PATS, text, page);
    // 문장부호
    addAll(PUNCT_PATS, text, page);
    // 외래어 오표기
    addAll(LOANWORD_PATS, text, page);
    // 번역체·일본식 표현 (표면)
    addAll(JSTYLE_PATS, text, page);
    // AI투 상투어·번역투·수식과잉
    addAll(AI_CLICHE_PATS, text, page);
    // 편집 통일안 (띄어쓰기·맞춤법·외래어)
    addAll(UNITY_PATS, text, page);
    // 내용보완필요 (표면)
    addAll(CITE_PATS, text, page);
    // 문단연결불량 (표면)
    addAll(TRANSITION_PATS, text, page);
  }
  return issues;
}

// ──────────────────────────────────────────────
// 용어 통일성 검사 — 동일 단어의 대소문자·표기 불일치 탐지
// ──────────────────────────────────────────────
const COMMON_EN = new Set([
  'the','and','for','with','that','this','are','from','has','have',
  'will','can','but','not','all','its','our','your','their','more',
  'also','been','were','when','what','where','which','these','those',
  'they','them','then','than','into','over','after','about','such',
  'some','each','only','most','both','very','just','like','how',
  'new','get','set','use','used','using','see','may','way','any',
  'out','one','two','three','four','five','you','his','her','was',
  'had','did','him','she','who','yes','via','per','pro','etc','let',
  'add','end','old','now','try','log','key','top',
  'no','ok','do','be','so','if','or','in','is','it','at','an',
  'by','of','on','to','up','as','we','me','my','go','id','vs'
]);

function checkTermConsistency(extracted) {
  const issues = [];
  // token key(소문자) → { variant 원문 → pages[] }
  const tokenMap = {};

  for (const { page, text } of extracted.pages) {
    for (const m of (text.matchAll(/\b([A-Za-z][A-Za-z0-9\-]{1,})\b/g) || [])) {
      const tok = m[1];
      const key = tok.toLowerCase();
      if (COMMON_EN.has(key)) continue;
      if (!tokenMap[key]) tokenMap[key] = {};
      if (!tokenMap[key][tok]) tokenMap[key][tok] = [];
      tokenMap[key][tok].push(page);
    }
  }

  const seenPairs = new Set();
  for (const [key, variants] of Object.entries(tokenMap)) {
    const variantList = Object.keys(variants);
    if (variantList.length < 2) continue;

    // 대문자 시작 vs 소문자 시작 혼재만 대상
    const hasUpper = variantList.some(v => /^[A-Z]/.test(v));
    const hasLower = variantList.some(v => /^[a-z]/.test(v));
    if (!hasUpper || !hasLower) continue;

    // 전체 출현 횟수 최소 4회 이상
    const allOcc = Object.values(variants).flat().length;
    if (allOcc < 4) continue;

    // 최다 사용 표기 = 정식 표기
    const canonical = variantList.reduce((a, b) =>
      variants[a].length >= variants[b].length ? a : b);

    for (const variant of variantList) {
      if (variant === canonical) continue;
      const pages = variants[variant];
      const canonOcc = variants[canonical].length;
      // 비표준 표기가 최소 1회 이상 + canonical이 2배 이상 등장해야 플래그
      if (pages.length < 1) continue;
      if (canonOcc < pages.length * 2) continue;

      const pairKey = canonical + '|' + variant;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      issues.push({
        type: '용어불일치',
        severity: 'medium',
        page: pages[0],
        found: variant,
        suggestion: `'${canonical}'으로 통일 (${variants[canonical].length}회 사용)`,
        description: `표기 불일치: '${variant}'(${pages.length}회) vs '${canonical}'(${variants[canonical].length}회) — 도서 전체 동일 표기 필요`
      });
    }
  }
  return issues;
}

// ──────────────────────────────────────────────
// 구조 검사
// ──────────────────────────────────────────────
function sim(t1, t2) {
  const n = s => s.replace(/[^\w가-힣]/g,' ').replace(/\s+/g,' ').trim();
  const a = n(t1), b = n(t2);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter(c => sb.has(c)).length;
  return inter / Math.max(sa.size, sb.size);
}

function checkStructural(extracted) {
  const issues = [];
  const { toc, pages } = extracted;
  if (!toc || toc.length === 0) return issues;

  // 본문 페이지 번호(하단 인쇄 번호) → 헤딩 맵
  // 두 종류의 맵을 모두 구성: PDF 인덱스 기반 + 인쇄 번호 기반
  const hmapPdf    = {};  // PDF 페이지 인덱스(1-based) → headings
  const hmapPrint  = {};  // 본문 하단 인쇄 번호 → headings

  for (const pd of pages) {
    const hdgs = (pd.headings || []).map(h =>
      typeof h === 'string' ? h : (h.fullText || h.title || '')
    );
    hmapPdf[pd.page] = hdgs;
    if (pd.bodyPageNum != null) {
      if (!hmapPrint[pd.bodyPageNum]) hmapPrint[pd.bodyPageNum] = [];
      hmapPrint[pd.bodyPageNum].push(...hdgs);
    }
  }

  const LEVEL_LABEL = { 1: 'Part', 2: 'Chapter', 3: '중절', 4: '소절' };

  for (const item of toc) {
    if (!item.title || item.title.length < 2) continue;
    const pg = item.page;
    if (!pg && pg !== 0) continue;  // 페이지 정보 없으면 skip

    // 허용 오차 ±3페이지 범위에서 헤딩 탐색
    // 인쇄 번호 기반 먼저, 없으면 PDF 인덱스 기반
    const offsets = [-3, -2, -1, 0, 1, 2, 3];
    const found = offsets.some(off => {
      const printHdgs = hmapPrint[pg + off] || [];
      const pdfHdgs   = hmapPdf[(item.pdfPage || pg) + off] || [];
      const combined  = [...new Set([...printHdgs, ...pdfHdgs])];
      return combined.some(h => sim(item.title, h) >= 0.7);
    });

    if (!found) {
      const levelLabel = LEVEL_LABEL[item.level] || '항목';
      const sev = item.level <= 2 ? 'high' : 'medium';
      issues.push({
        type: '목차불일치',
        severity: sev,
        page: item.pdfPage || pg || 1,
        found: item.title.slice(0, 60),
        suggestion: '목차와 본문 제목을 일치시키세요.',
        description: `[${levelLabel}] 목차 '${item.title}' (p.${pg}) — 본문에서 일치하는 제목을 찾을 수 없음`
      });
    }
  }
  return issues;
}

// ──────────────────────────────────────────────
// RAG: 교정 규칙 파싱 및 검색
// ──────────────────────────────────────────────
const DEFAULT_RULES_MD = `## 1. 화면 표기 규칙
메뉴/버튼/탭: [대괄호] — [파일], [확인], [취소]
대화상자: [대화상자 이름] 대화상자 — [열기] 대화상자
경로: [폴더명]-[하위폴더]-[파일] 순
아이콘: ○○ 아이콘 (화살표 아이콘, 더하기 아이콘)
단축키: Ctrl+C, Alt+F4 형태

## 2. 띄어쓰기
본용언+보조용언: 원칙적으로 띄어 씀 — 먹어 보다, 해 두다, 읽어 나가다
의존명사: 때, 것, 수, 줄, 만큼, 대로, 뿐, 데, 채, 듯 → 앞말과 띄어 씀
단위: 1개, 2층, 3번, 4km → 수와 단위 띄어 씀 (단, 어림수는 붙임 — 몇백, 몇천)
접미사 -적/-화/-성/-들/-만/-쯤: 앞말에 붙여 씀
보조용언 -하다/-되다/-시키다: 앞말에 붙여 씀

## 3. 맞춤법
되다/돼다 구별: '되'+'어'='돼'. 되어(→돼)야, 되(→돼). 되다/됩니다/되어서=됐/되었다
로서/로써: 자격·신분=로서, 수단·방법=로써
데: 의존명사(장소·경우)=띄어씀, 어미(-는데)=붙여씀
든지/던지: 선택=든지, 회상=던지
안/않: 부정부사=안, 부정어미=않 (하지 않다)

## 4. 사이시옷
합성어에서 앞말이 모음 종성+뒷말 첫소리 된소리화 시 사이시옷 적용
최댓값, 최솟값, 평균값(×평균치), 성공률(o)
순우리말+한자어 합성어: 핏기, 전셋집, 예삿일

## 5. 문장 부호
쌍점: 표제 뒤 → 앞 붙임·뒤 띔 — 예: 문방사우: 종이
괄호: 소괄호()→보충설명, 대괄호[]→화면요소, 홑화살괄호〈〉→예술작품, 겹화살괄호《》→단행본
가운뎃점: 대등한 단어 나열 — 수·화·목
줄표(—): 앞뒤 붙여 씀 — 가격—배송—환불
빗금: 앞뒤 붙여 씀 — 좌/우, 확대/축소

## 6. 고유 명사 및 전문 용어
인명: 성+이름 붙여 씀 (남궁억). 호칭어·관직명 띄어 씀 (OOO 팀장)
지명·브랜드: 붙여 씀 (카리브해, 발리섬). 상표·서비스 업계 통용 표기 (마이크로소프트, 윈도우)
영문 브랜드: macOS, iOS (그대로 사용)
전문용어: 두 명사 합성 → 미등재어면 띄어 씀 (명령 행, 행 번호, 절대 참조)
붙여 쓰는 전문용어: 더블클릭, 오버프린트, 운영체제 (근거 후 도서 전체 통일)
키캡: [Spacebar], [Caps Lock], [Backspace], [Delete] (대괄호+풀네임)

## 7. 외래어 표기법
워크플로 (워크플로우 ×)
섀도 (섀도우 ×)
애플리케이션 (어플리케이션 ×)
콘텐츠 (컨텐츠 ×)
메시지 (메세지 ×)
리더십 (리더쉽 ×)

## 8. 출처 표기
블로그·웹 인용: 제목, 출처, 날짜, 링크 순
예: "온점? 이젠 마침표로 불러요", 문화관광부 홈페이지, 2014.10.27., http://...

## 9. 교정 작업 원칙
1. 전문 지식 필요 시 참/거짓 판단 후 거짓이면 윤문 위치·내용 추천
2. 'LLM에게' 같은 표현보다 자연스러운 표현으로 대체 권장
3. 과도한 윤문 금지 — 맞춤법 위주 교정
4. 논리 부족·내용 추가 필요 시 바로 수정 말고 방향 먼저 제시
5. 수정이 필요한 부분만 언급
6. 수정 전·후 비교 제시
7. 교정 항목: 맞춤법, 조사, 어미, 띄어쓰기, 구두점, 서식
8. 원문 구조·의도 최대한 유지

## 부록: 충돌 규칙 (1팀 우선 적용)
보조 용언 기본 원칙: 본용언과 보조 용언은 띄어 씀 (표준 붙여쓰기 아님)
사이시옷+값: 최댓값 등은 사이시옷 적용 합성어로 붙여 씀
쌍점 앞뒤(표제): 앞 붙임, 뒤 띔 (표준의 앞뒤 모두 띔과 다름)
`;

function parseRulesIntoChunks(mdText) {
  const lines = mdText.split('\n');
  const chunks = [];
  let current = null;
  let parentHeading = '';
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) chunks.push(current);
      parentHeading = line.replace(/^## /, '').trim();
      current = { heading: parentHeading, text: line + '\n', keywords: [] };
    } else if (line.startsWith('### ')) {
      // 하위 섹션을 별도 청크로 분리 (RAG 정확도 향상)
      if (current) chunks.push(current);
      var subHeading = line.replace(/^### /, '').trim();
      current = { heading: parentHeading + ' > ' + subHeading, text: line + '\n', keywords: [] };
    } else if (current) {
      current.text += line + '\n';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// 섹션별 키워드 — 배치 텍스트에 이 단어가 있으면 해당 규칙 섹션 포함
const CHUNK_KEYWORDS = {
  '화면 표기': ['메뉴', '버튼', '탭', '대화상자', '아이콘', '단축키', '인터페이스', '화면', '팝업', '클릭', '경로', '대괄호', '작은따옴표', '큰따옴표', '코드', '백틱', '꺽쇠'],
  '띄어쓰기': ['보조용언', '의존명사', '때', '것', '수', '만큼', '대로', '뿐', '채', '듯', '단위', '접사', '조사', '어미', '합성어', '숫자', '값', '간', '별', '순', '드리다', '시키다', '못하다', '안되다'],
  '맞춤법': ['되다', '돼', '돼야', '됩니다', '로서', '로써', '데', '든지', '던지', '다달이', '짭짤', '영락없이', '바라다', '얼마예요', '부스스', '맞추다', '맞히다', '들르다', '다르다', '틀리다'],
  '사이시옷': ['최댓값', '최솟값', '사이시옷', '합성어', '성공률', '초깃값', '결괏값', '근삿값', '기본값', '정숫값'],
  '문장 부호': ['쌍점', '괄호', '가운뎃점', '줄표', '빗금', '마침표', '물음표', '쉼표', '따옴표', '말줄임표', '소괄호', '대괄호', '붙임표'],
  '고유 명사': ['인명', '지명', '브랜드', '상표', '전문용어', '전문 용어', '키캡', '키보드', 'macOS', 'iOS', '운영체제', '수식', '매개변수'],
  '외래어': ['외래어', '워크플로', '애플리케이션', '컨텐츠', '콘텐츠', '섀도', '메시지', '리더십', '인터체인지', '케이크', '윈도', '파일', '주스', '서비스'],
  '출처 표기': ['출처', '인용', '블로그', '참고', '링크'],
  '교정 작업 원칙': [],  // 항상 포함
  '충돌 규칙': [],        // 항상 포함
  '100제': ['발음', '맞춤법', '사이시옷', '띄어쓰기', '외래어', '혼동', '율', '렬', '깨끗이', '며칠'],
  '한글 맞춤법 규정': ['두음법칙', '불규칙', '활용', '준말', '로서', '로써', '이히', '깨끗이', '깨끗히', '노란', '걸어', '지어', '가까워', '돼', '어떡해', '비율', '출석률'],
  '문장 부호 상세': ['마침표', '물음표', '느낌표', '쉼표', '가운뎃점', '줄표', '붙임표', '물결표', '줄임표', '겹낫표', '홑낫표', '큰따옴표', '작은따옴표', '소괄호', '대괄호', '인용', '제목'],
  '표준어 규정': ['표준어', '비표준어', '복수 표준어', '강낭콩', '냄비', '빌리다', '우레', '나무꾼', '짜깁기', '거름', '걸음', '부치다', '붙이다', '조리다', '졸이다'],
};

function findRelevantChunks(chunks, batchText) {
  const result = [];
  const textLower = batchText.toLowerCase();
  for (const chunk of chunks) {
    const h = chunk.heading;
    // 항상 포함
    if (h.includes('교정 작업 원칙') || h.includes('충돌 규칙') || h.includes('부록')) {
      result.push(chunk);
      continue;
    }
    // 1단계: 헤딩 키워드 매칭 (부모 > 자식 형태도 부모 섹션 매칭)
    let matched = false;
    const hParts = h.split(' > ');
    for (const [section, kws] of Object.entries(CHUNK_KEYWORDS)) {
      if (!hParts.some(p => p.includes(section))) continue;
      if (kws.length === 0 || kws.some(kw => textLower.includes(kw.toLowerCase()))) {
        matched = true;
        break;
      }
    }
    // 2단계: 본문 내 교정 대상 단어 직접 매칭 (RAG 정확도 향상)
    // 규칙 텍스트에서 '올바른 표기 | 틀린 표기' 표의 틀린 표기가 배치 텍스트에 있는지 확인
    if (!matched && chunk.text) {
      const lines = chunk.text.split('\n');
      for (const line of lines) {
        if (!line.includes('|')) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        // 표 행에서 틀린 표기 / 예시 단어가 텍스트에 있으면 해당 규칙 포함
        for (const cell of cells) {
          if (cell.length >= 2 && cell.length <= 20 && cell !== '---' && !cell.startsWith('#') && textLower.includes(cell.toLowerCase())) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }
    if (matched) result.push(chunk);
  }
  // 토큰 제한: 너무 많은 청크가 매칭되면 상위 8개로 제한 (항상 포함 제외)
  const isAlways = c => c.heading.includes('교정 작업 원칙') || c.heading.includes('충돌') || c.heading.includes('부록');
  const always = result.filter(isAlways);
  const others = result.filter(c => !isAlways(c));
  if (others.length > 8) return always.concat(others.slice(0, 8));
  return result;
}

// 규칙 파일 로드 (업로드 or 기본값)
function loadRulesFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      rulesChunks = parseRulesIntoChunks(text);
      resolve(rulesChunks.length);
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

// 기본 규칙 초기화 (페이지 로드 시) — 요약본 먼저 적용, 상세 파일 자동 로드 시도
rulesChunks = parseRulesIntoChunks(DEFAULT_RULES_MD);

// 상세 규칙 로드 — 교정규칙.js (<script> 태그)가 window.FULL_RULES_MD를 설정함
// file:// 환경에서 fetch/XHR 모두 CORS 차단되므로 JS 임베드 방식 사용
(function _loadFullRules() {
  if (typeof window.FULL_RULES_MD === 'string' && window.FULL_RULES_MD.length > 500) {
    var chunks = parseRulesIntoChunks(window.FULL_RULES_MD);
    if (chunks.length >= 5) {
      rulesChunks = chunks;
      var badge = document.getElementById('p8_rulesBadge');
      if (badge) { badge.className = 'rules-badge-loaded'; badge.textContent = '상세 규칙 ' + chunks.length + '섹션'; }
      console.log('[panel8] 상세 규칙 로드 완료: ' + chunks.length + '섹션, ' + window.FULL_RULES_MD.length + '자');
    }
  } else {
    console.log('[panel8] FULL_RULES_MD 미발견 — 요약본 사용');
  }
})();

// ──────────────────────────────────────────────
// 언어 검사 (Claude API)
// ──────────────────────────────────────────────
const SYS = `You are a professional Korean book editor with 15+ years in IT/tech publishing. Your writing philosophy: every sentence should sound like a real person wrote it, not a machine. Analyze the given text thoroughly and return ONLY valid JSON.

[윤문 핵심 원칙]
When suggesting rewrites (suggestion), follow these writing principles:
- Natural Korean rhythm: vary sentence length, avoid monotonous ~입니다 endings
- No AI clichés: ban "~할 수 있습니다", "~것으로 판단됩니다", "~에 대해서", "혁신적인", "획기적인"
- Human touch: write as if an experienced editor is polishing, not a template filling blanks
- Concrete over abstract: replace vague modifiers with specific examples or data
- Reader-first: every rewrite should be clearer and more engaging for the reader

TYPE CLASSIFICATION RULES (type 분류를 반드시 지킬 것):
같은 문장에 여러 문제가 겹칠 수 있다. 이때 가장 구체적인 type을 선택하라:
- 같은 조사(을/를, 은/는, 이/가, 에서, 으로 등)가 한 문장에서 2회 이상 반복 → type="조사중복" (절대 "윤문필요"로 분류하지 말 것)
- '-에서의', '-로부터의', '-에 대한' 등 번역투 다중조사 중첩 → type="번역체" (절대 "윤문필요"로 분류하지 말 것)
- 문법적으로 틀린 문장 (주어-서술어 불일치, 조사 오용) → type="비문" 또는 "주술호응오류"
- 문법은 맞지만 어색하거나 장황한 문장 → type="윤문필요"
- 핵심: "윤문필요"는 위 3가지에 해당하지 않을 때만 사용. 조사 반복이 원인이면 반드시 "조사중복"으로 분류.

Check ALL of the following issue types:

MEDIUM severity — 조사중복 (가장 적극적으로 검사할 것):
같은 조사가 한 문장에서 2회 이상 반복되면 잡을 것.
- 을/를, 은/는, 이/가, 에서, 으로/로, 와/과, 에 등
- found: 해당 문장 전체를 복사
- suggestion: 조사 1~2개를 다른 표현으로 바꾼 수정 문장을 직접 작성
- 예: found="데이터를 수집하고 결과를 분석하고 보고서를 작성했다" → suggestion="데이터를 수집하고 결과 분석 후 보고서를 작성했다"

HIGH severity (명백한 오류):
- 비문: Ungrammatical sentences — broken structure, missing subject/predicate, dangling modifiers
- 주술호응오류: Subject-predicate disagreement — e.g. "원인은 ~때문입니다" is correct; "원인은 ~했습니다" is wrong
- 잘못된표현: Wrong expressions — incorrect idioms, wrong word choice, unclear pronoun referents
- 사실오류: Factually incorrect statements or internal contradictions within the text — wrong technical facts, incorrect definitions, contradictory claims between sentences

MEDIUM severity (개선 필요):
- 윤문필요: Polishing needed — awkward rhythm, convoluted sentence structure, weak word choice, overly long sentences that should be split, or passages that are technically correct but significantly impair readability
- 내용보완필요: Content supplement needed — concept explained incompletely or too superficially, missing prerequisite knowledge that would confuse readers, abrupt topic transition, logical gap between ideas, claim made without supporting explanation
- 번역체: Unnatural translation-style Korean — ~함에 있어서, ~에 대해서, ~의 경우에 있어서, ~라고 하는, ~적(的) 남용, ~를 통해서
- 일본식표현: Japanese-influenced — ~에 있어서, ~로 인하여, ~에 의한, ~하는 바이다, ~(이)라고 하는
- 수동태과용: Excessive passive — -어지다/-되어지다(high), ~에 의해 ~되다, ~받다 남용
- 외래어표기오류: WRONG loanword spelling per Korean standard orthography rules. IMPORTANT: Using a loanword itself is NOT an error. Only flag when the SPELLING is wrong. 컨텐츠→콘텐츠, 메세지→메시지, 리더쉽→리더십, 악세서리→액세서리, 카페인→카페인(OK), 인터페이스(OK — do NOT flag correct loanwords). Common errors: 데스크탑→데스크톱, 프리젠테이션→프레젠테이션, 컴퓨팅(OK), 소프트웨어(OK), 어플→앱/애플리케이션, 시뮬레이션(OK), 커뮤니케이션(OK), 콘텐트→콘텐츠, 다이나믹→다이내믹, 로보트→로봇, 싸이트→사이트, 웹사이트(OK), 매니저→매니저(OK), 네비게이션→내비게이션, 가이드라인(OK)
- 용어불일치: Inconsistent term notation — same concept written differently in the SAME batch
- 문체불일치: Inconsistent register — mixing formal and informal within same section

MEDIUM severity (표기·부호 오류):
- 띄어쓰기: Spacing errors per Korean orthography — key rules: (1) 의존명사(것/수/만큼/대로/뿐/지/데/듯/바)는 관형사형 뒤 띄어 씀, 조사는 붙여 씀, (2) 보조용언은 띄어 씀이 원칙(먹어 보다, 알려 주다), -아/-어 연결 시 붙여 씀 허용, (3) 합성어 사전 등재어는 붙여 씀(살펴보다, 알아보다), (4) 숫자 만(萬) 단위로 띄어 씀, (5) 접사(-님/-별/-순)는 붙여 씀, 의존명사(님)는 띄어 씀
- 맞춤법: Spelling errors per Korean orthography — key rules: (1) 두음법칙: 단어 첫머리 녀→여, 리→이, 렬→열, 률→율(모음·ㄴ뒤), 단어 내부는 본음 유지(남녀, 협력), (2) 사이시옷: 합성어+앞말 모음 끝+고유어 1개 이상일 때만(나뭇잎○, 촛점×), 한자어+한자어는 6개만(숫자,횟수,곳간,셋방,찻간,툇간), (3) 불규칙활용: ㅂ불규칙(가까워), ㄷ불규칙(걸어), ㅅ불규칙(지어), ㅎ불규칙(노란), (4) -이/-히 구분: ㅅ받침 뒤→-이(깨끗이), -하다 어근→-히(급히), (5) 준말: 되어→돼, 어떻게해→어떡해, (6) 혼동어: -던(과거)/-든(선택), -로서(자격)/-로써(수단), 다르다(相異)/틀리다(誤)
- 문장부호오류: Punctuation errors per 2014 Korean punctuation rules — key rules: (1) 제목·표어에 마침표 쓰지 않음, (2) 직접 인용문 끝 마침표는 원칙적으로 씀("떠나자."라고), (3) 접속부사(그러나, 하지만, 그러므로) 뒤 쉼표 쓰지 않음이 원칙, (4) 줄임표 앞에 쉼표 쓰지 않음(대전……○, 대전,……×), (5) '그리고' 앞에 쉼표 쓰지 않음, (6) 겹낫표『 』=책 제목, 홑낫표「 」=소제목·법률명, (7) 큰따옴표=직접 인용, 작은따옴표=마음속 말·강조, (8) 연월일 마지막 '일' 뒤 마침표 필수(2019. 3. 1.), (9) 물결표~는 범위 표시(앞뒤 붙여 씀), (10) 줄임표는 여섯 점 원칙, 세 점도 허용

LOW severity (검토 권장):
- 문단연결불량: Poor paragraph transition — abrupt topic shift without connector, missing transitional sentence
- 중의적표현: Ambiguous expression — sentence with two or more valid interpretations
- 저자확인필요: Content requiring author verification — specific statistics/numbers without source, technical claims that could be incorrect, dates/versions that may be outdated

HALLUCINATION CHECK (할루시네이션 — HIGH severity):
- 할루시네이션: AI-generated false facts, fabricated statistics, non-existent tools/libraries/APIs, wrong version numbers, fictional research citations, or plausible-sounding but incorrect technical claims. For each hallucination issue, add a "verifyUrl" field with a URL to an authoritative source (official docs, Wikipedia, etc.) where the correct information can be verified.

Return ONLY raw JSON — no markdown fences, no explanation, no text before or after:
{"issues":[{"type":"유형명","severity":"high|medium|low","found":"exact verbatim substring from text (≤120 chars; up to 150 chars for 윤문필요·내용보완필요·사실오류·할루시네이션)","description":"한국어 설명 — 왜 문제인지 구체적으로","suggestion":"완성된 수정 내용 (길이 제한 없음 — 아래 지침 참조)","verifyUrl":"검증 URL (할루시네이션·사실오류 전용, 없으면 빈 문자열)"}]}
If no issues found: {"issues":[]}
DO NOT wrap in markdown code blocks. Start your response directly with { and end with }.

Type names to use exactly: 비문, 주술호응오류, 잘못된표현, 사실오류, 할루시네이션, 번역체, 일본식표현, 수동태과용, 외래어표기오류, 용어불일치, 문체불일치, 윤문필요, 내용보완필요, 조사중복, 문단연결불량, 중의적표현, 저자확인필요, 띄어쓰기, 맞춤법, 문장부호오류

IMPORTANT — suggestion 작성 기준:
"suggestion"은 편집자가 바로 복사해 사용할 수 있는 완성된 수정 내용이어야 한다. "표현 개선 필요" 같은 방향 제시는 금지.

▶ 윤문필요 (적극적 윤문):
  - 단어 교체가 아니라 문장 전체를 다시 쓸 것. 필요하면 두 문장으로 나누거나 구조 자체를 바꿔도 됨.
  - 리듬·간결성·독자 이해도를 기준으로 완성도 높은 대안 문장을 제시할 것.
  - CRITICAL: suggestion이 found와 실질적으로 동일하면 이슈를 보고하지 말 것. 진짜로 더 나은 문장을 쓸 수 없다면 이 이슈를 생략할 것.
  - 예: found="이러한 방식으로 구성된 시스템은 여러 가지 복잡한 요인들로 인해 성능 저하가 발생할 수 있다는 점에서 주의가 필요합니다"
       suggestion="이 시스템은 복잡한 요인이 많아 성능이 저하될 수 있으므로 주의가 필요합니다."

▶ 내용보완필요 (구체적 보완 내용 작성):
  - 독자에게 실제로 필요한 설명을 2~4문장으로 직접 작성할 것. "출처 추가 필요" 같은 지시는 금지.
  - 어떤 개념이 빠졌는지 파악한 뒤 그 내용을 편집자가 삽입할 수 있는 형태로 완성된 문장으로 제공할 것.
  - 예: found="이 알고리즘은 효율적입니다"
       suggestion="이 알고리즘은 O(log n)의 시간 복잡도를 가지므로, 데이터가 많아질수록 선형 탐색(O(n)) 대비 처리 속도가 크게 빨라집니다. 예를 들어 100만 개의 데이터를 탐색할 때 선형 탐색은 최대 100만 번 비교가 필요하지만, 이 알고리즘은 약 20번만에 완료됩니다."

▶ 사실오류 (정확한 교정 내용 작성):
  - 무엇이 왜 틀렸는지 설명하고, 올바른 사실을 구체적으로 기술할 것.
  - 단순히 "사실 확인 필요"가 아니라 정확한 정보를 제공할 것.
  - 텍스트 내 모순(앞에서 A라 했는데 뒤에서 B라 함)은 어느 쪽이 맞는지 판단 근거와 함께 제시.
  - 예: found="Python은 C보다 빠릅니다"
       suggestion="[오류] Python은 일반적으로 C보다 느립니다. Python은 인터프리터 언어로 실행 시 바이트코드를 해석하는 오버헤드가 있어, 연산 집약적 작업에서는 C 대비 수십~수백 배 느릴 수 있습니다. 다만 NumPy 등 C 확장 라이브러리 사용 시 성능 차이를 줄일 수 있습니다."

▶ 조사중복:
  - found: 해당 문장 전체를 복사 (절대 잘라내지 말 것)
  - suggestion: 조사 1~2개를 다른 표현으로 바꾼 완성된 수정 문장. 원문의 의미를 유지하면서 반복되는 조사를 줄일 것.
  - 절대 "~를 줄이세요" 같은 방향 제시를 하지 말 것. 직접 고쳐 쓴 문장을 줘야 함.

▶ 기타 유형:
  - 문단연결불량: 삽입할 전환 문장을 직접 작성
  - 번역체/일본식표현: 자연스러운 한국어로 바꾼 문장 제시
  - 외래어표기오류: 표준 표기 단어
  - 비문/주술호응오류/잘못된표현: 교정된 완성 문장
  - 저자확인필요: 저자에게 보낼 구체적인 확인 질문

- Report every issue you find — do not skip borderline cases. Be aggressive: if a sentence is hard to read, report it. If explanation is thin, report it.
- 조사중복은 특히 적극적으로 찾을 것. IT 기술서 원고에서 가장 흔한 문제이며, 편집자가 가장 많이 수정하는 항목이다.

HALLUCINATION PREVENTION (CRITICAL):
- "found" MUST be copied character-by-character from the input text. Do NOT paraphrase, summarize, or reconstruct.
- If you cannot find the exact phrase in the text, do NOT report the issue. Omit it entirely.
- Do NOT invent issues that do not exist in the given text.
- Every "found" value must pass this test: it appears verbatim in the input text you received.`;

// callClaude — callClaudeApi(shared/app.js) 래핑
async function callClaude(apiKey, text, rulesContext = '') {
  const systemPrompt = rulesContext
    ? SYS + '\n\n---\n## 📋 1팀 교정 규칙 (아래 규칙을 우선 적용할 것)\n' + rulesContext
    : SYS;
  return callClaudeApi({
    apiKey: apiKey,
    prompt: text,
    system: systemPrompt,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
    temperature: 0,
    noPersona: true
  });
}

/**
 * Claude 응답에서 JSON 파싱 — 마크다운 코드블록, 앞뒤 텍스트, 제어문자 등 방어 처리
 */
/**
 * suggestion과 found가 실질적으로 같은지 확인.
 * 공백·구두점 제거 후 비교 — AI가 원문을 그대로 반환하는 경우를 걸러낸다.
 */
function _isSameSuggestion(found, suggestion) {
  const norm = s => s.replace(/[\s\u00A0.,!?·…。、]/g, '').toLowerCase();
  const f = norm(found);
  const s = norm(suggestion);
  if (!f || !s) return false;
  if (f === s) return true;
  // suggestion이 found를 완전히 포함하고 10% 이내로만 길면 실질 동일 취급
  // (예: "원문입니다." → "원문입니다. (수정 없음)" 같은 패턴)
  if (s.includes(f) && s.length <= f.length * 1.10) return true;
  // 편집 거리 기반: 두 문자열이 95% 이상 유사하면 동일 취급
  const longer = f.length >= s.length ? f : s;
  const shorter = f.length < s.length ? f : s;
  if (longer.length === 0) return true;
  // 간단한 공통 접두 비율 체크 (완전한 Levenshtein 대신 빠른 근사)
  let same = 0;
  for (let i = 0; i < shorter.length; i++) { if (shorter[i] === longer[i]) same++; }
  return (same / longer.length) >= 0.95;
}

function _parseClaudeJson(raw) {
  if (!raw) return null;

  // 1) 마크다운 코드블록 제거
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // 2) 가장 바깥 { } 블록 추출
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);

  // 3) 제어 문자 제거 (줄바꿈·탭 제외)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 4) JSON 문자열 값 안의 리터럴 개행·탭 → 이스케이프
  //    "key":"value\nwith newline" → "key":"value\\nwith newline"
  text = _escapeJsonStrings(text);

  // 5) JSON.parse 시도
  try {
    return JSON.parse(text);
  } catch (e1) {
    // 6) 후행 쉼표 제거 후 재시도
    try {
      const fixed = text.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed);
    } catch (e2) {
      // 7) 응답 잘림 복구: 마지막 완전한 issue 객체 찾기
      // },{  또는  }] 기준으로 끝을 잘라내고 닫아줌
      const lastClose = text.lastIndexOf('"}');
      if (lastClose > start) {
        const truncFixed = text.slice(0, lastClose + 2).replace(/,\s*$/, '') + ']}';
        try {
          const r = JSON.parse(truncFixed);
          console.info(`JSON 잘림 복구 성공 — ${(r.issues||[]).length}건 구출`);
          return r;
        } catch (e3) { /* 복구 실패 시 null 반환 */ }
      }
      console.warn('JSON 파싱 실패:', e2.message, '\n원본 응답:', raw.slice(0, 300));
      return null;
    }
  }
}

/**
 * JSON 문자열 값 안에 있는 리터럴 개행·탭 문자를 이스케이프 시퀀스로 교체
 * 이미 이스케이프된 \\n 은 건드리지 않음
 */
function _escapeJsonStrings(text) {
  // 상태 머신: 따옴표 내부 여부를 추적하면서 개행을 치환
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
    }
    result += ch;
  }
  return result;
}

async function checkLinguistic(extracted, apiKey, onBatch, onError) {
  const issues = [];
  // 짧은 페이지도 포함 — 20자 이상이면 검사 (이전 50자 기준으로 단문 문서가 통째로 제외되는 문제 수정)
  const pages = extracted.pages.filter(p => p.text.trim().length >= 20);
  if (!pages.length) {
    if (onError) onError('추출된 텍스트가 없거나 너무 짧습니다.');
    return issues;
  }
  const batchSize = 3;
  const total = Math.ceil(pages.length / batchSize);
  let firstError = '';
  let successCount = 0;

  for (let i = 0; i < pages.length; i += batchSize) {
    const batchIdx = Math.floor(i / batchSize) + 1;
    if (onBatch) onBatch(batchIdx, total);
    const batch = pages.slice(i, i + batchSize);
    const txt = batch.map(p => `\n[p.${p.page}]\n${p.text.slice(0, 2000)}\n`).join('');
    const relevant = rulesChunks ? findRelevantChunks(rulesChunks, txt) : [];
    const rulesCtx = relevant.length > 0 ? relevant.map(c => c.text).join('\n') : '';
    try {
      const raw = await callClaude(apiKey, '교정:\n' + txt, rulesCtx);
      const parsed = _parseClaudeJson(raw);
      if (parsed) {
        const batchText = batch.map(p => p.text).join('\n');
        for (const iss of (parsed.issues || [])) {
          const found = (iss.found || '').trim();
          // 할루시네이션 필터: found가 실제 텍스트에 없으면 제외
          if (!found || !batchText.includes(found)) continue;
          // 동일 내용 필터: suggestion이 found와 실질적으로 같으면 제외
          // (윤문필요 등에서 AI가 원문을 그대로 돌려주는 경우 방어)
          const sugg = (iss.suggestion || '').trim();
          if (sugg && _isSameSuggestion(found, sugg)) {
            console.info(`[교정] suggestion≈found 제거 (${iss.type}): "${found.slice(0,40)}"`);
            continue;
          }
          iss.page = batch.find(p => p.text.includes(found))?.page || batch[0].page;
          issues.push(iss);
        }
      }
      successCount++;
    } catch(e) {
      console.warn('Batch error:', e.message);
      if (!firstError) firstError = e.message;
    }
  }

  // 전체 배치가 실패했을 때 에러 콜백 호출
  if (successCount === 0 && firstError) {
    if (onError) onError(firstError);
  }
  return issues;
}

// ──────────────────────────────────────────────
// 컨텍스트 추출
// ──────────────────────────────────────────────
function getCtx(text, found, ctxWindow=90) {
  if (!found || !text) return { before:'', target:found, after:'' };
  const idx = text.indexOf(found);
  if (idx === -1) return { before:'', target:'', after: text.slice(0, ctxWindow) + '…' };
  const bs = Math.max(0, idx - ctxWindow);
  const ae = Math.min(text.length, idx + found.length + ctxWindow);
  return {
    before: (bs > 0 ? '…' : '') + text.slice(bs, idx),
    target: text.slice(idx, idx + found.length),
    after:  text.slice(idx + found.length, ae) + (ae < text.length ? '…' : '')
  };
}

// ──────────────────────────────────────────────
// 단계 상태 업데이트 헬퍼
// ──────────────────────────────────────────────
function stepRun(n, detail) {
  const icon = document.getElementById(`p8_step${n}-icon`);
  const name = document.getElementById(`p8_step${n}-name`);
  const det  = document.getElementById(`p8_step${n}-detail`);
  if (icon) { icon.className = 'step-icon running'; icon.innerHTML = '<div style="width:12px;height:12px;border:2px solid #3498db;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div>'; }
  if (name) name.className = 'step-name running';
  if (det && detail) det.textContent = detail;
}

function stepDone(n, countText) {
  const icon  = document.getElementById(`p8_step${n}-icon`);
  const name  = document.getElementById(`p8_step${n}-name`);
  const count = document.getElementById(`p8_step${n}-count`);
  const det   = document.getElementById(`p8_step${n}-detail`);
  if (icon) { icon.className = 'step-icon done'; icon.textContent = '✓'; }
  if (name) name.className = 'step-name';
  if (count && countText !== undefined) count.textContent = countText;
  if (det) det.style.color = '#27ae60';
}

function stepSkip(n, reason) {
  const icon = document.getElementById(`p8_step${n}-icon`);
  const name = document.getElementById(`p8_step${n}-name`);
  const det  = document.getElementById(`p8_step${n}-detail`);
  if (icon) { icon.className = 'step-icon pending'; icon.textContent = '—'; }
  if (name) name.className = 'step-name pending';
  if (det) { if (reason) det.textContent = reason; det.style.color = '#aaa'; }
}

function stepError(n, msg) {
  const icon = document.getElementById(`p8_step${n}-icon`);
  const det  = document.getElementById(`p8_step${n}-detail`);
  if (icon) { icon.className = 'step-icon error'; icon.textContent = '✕'; }
  if (det) { det.textContent = msg; det.style.color = '#e74c3c'; }
}

function setBar(pct) {
  document.getElementById('p8_loadingBar').style.width = pct + '%';
  document.getElementById('p8_loadingPct').textContent = pct + '%';
}

// ──────────────────────────────────────────────
// 메인 교정 실행
// ──────────────────────────────────────────────
async function p8_startProofread() {
  if (!selectedFile) return;
  // API 키: app.js loadApiKey() (AES-GCM 암호화 저장소) 우선, 없으면 p8 input 폴백
  let apiKey = '';
  if (typeof loadApiKey === 'function') {
    try { apiKey = (await loadApiKey()) || ''; } catch(e) {}
  }
  if (!apiKey) {
    const keyInput = document.getElementById('p8_apiKey');
    if (keyInput) apiKey = keyInput.value.trim() || keyInput.dataset.apiSynced || '';
  }
  // API 키가 입력됐는데 형식이 틀린 경우 즉시 오류 안내
  if (apiKey && !isValidApiKeyFormat(apiKey)) {
    const keyInput = document.getElementById('p8_apiKey');
    showApiKeyFormatError(keyInput);
    if (keyInput) keyInput.focus();
    alert('API 키 형식이 올바르지 않습니다.\n\nAnthropic API 키는 sk-ant- 로 시작하는 문자열입니다.\n예) sk-ant-api03-XXXX...\n\n키를 비워두면 AI 검사 없이 표면 검사만 실행됩니다.');
    return;
  }
  const fileKey = currentFileKey || getCacheKey(selectedFile);

  show('loadingPanel');
  // 이전 실행의 "교정 완료!" 텍스트 초기화
  document.getElementById('p8_loadingTitle').textContent = '교정 진행 중…';
  // 스텝 아이콘·텍스트 초기화 (이전 실행 잔재 제거)
  for (let i = 1; i <= 5; i++) {
    const icon = document.getElementById(`p8_step${i}-icon`);
    const name = document.getElementById(`p8_step${i}-name`);
    const det  = document.getElementById(`p8_step${i}-detail`);
    if (icon) { icon.className = 'step-icon pending'; icon.textContent = (i); }
    if (name) name.className = 'step-name pending';
    if (det) { det.textContent = ''; det.style.color = ''; }
  }
  setBar(5);

  // ── 캐시 확인 ──────────────────────────────────
  const cached = getCache(fileKey);
  const useCache = !!cached;
  const apiProvided = apiKey.startsWith('sk-ant-');
  // 캐시 있지만 AI 미실행이고 지금 키 제공: AI만 실행
  const aiOnlyRun = useCache && !cached.aiWasRun && apiProvided;

  let extracted, surfaceIssues, structuralIssues;

  if (useCache) {
    // ── Step 1: 캐시에서 복원 ──
    stepRun(1, '캐시에서 복원 중…');
    await tick();
    extracted = cached.extracted;
    stepDone(1, `캐시 ⚡ ${extracted.total_pages}p`);
    document.getElementById('p8_step1-detail').textContent = `캐시 복원 — ${extracted.total_pages}페이지`;
    setBar(25);

    // ── Step 2: 캐시에서 복원 ──
    stepRun(2, '캐시에서 복원 중…');
    await tick();
    surfaceIssues = cached.surfaceIssues || [];
    stepDone(2, `캐시 ⚡ ${surfaceIssues.length}건`);
    document.getElementById('p8_step2-detail').textContent = `캐시 복원 — ${surfaceIssues.length}건`;
    setBar(45);

    // ── Step 3: 캐시에서 복원 ──
    stepRun(3, '캐시에서 복원 중…');
    await tick();
    structuralIssues = cached.structuralIssues || [];
    stepDone(3, `캐시 ⚡ ${structuralIssues.length}건`);
    document.getElementById('p8_step3-detail').textContent = `캐시 복원 — ${structuralIssues.length}건`;
    setBar(60);
  } else {
    // ── Step 1: PDF 추출 ──
    stepRun(1, '텍스트 추출 중…');
    try {
      extracted = await extractFile(selectedFile);
      const label = extracted.isPdfFile === false ? `${extracted.total_pages}p (가상)` : `${extracted.total_pages}p`;
      stepDone(1, label);
      document.getElementById('p8_step1-detail').textContent = `총 ${extracted.total_pages}페이지`;
    } catch(e) {
      stepError(1, e.message);
      alert('파일 읽기 오류:\n' + e.message);
      show('uploadPanel');
      return;
    }
    setBar(25);

    // ── Step 2: 표면 검사 ──
    stepRun(2, '오타·조사중복·용어불일치 탐지 중…');
    await tick();
    surfaceIssues = [
      ...checkSurface(extracted),
      ...checkTermConsistency(extracted)
    ];
    stepDone(2, `${surfaceIssues.length}건`);
    document.getElementById('p8_step2-detail').textContent =
      surfaceIssues.length ? `${surfaceIssues.length}건 발견` : '이슈 없음';
    setBar(45);

    // ── Step 3: 구조 검사 ──
    stepRun(3, '목차·헤딩 비교 중…');
    await tick();
    structuralIssues = checkStructural(extracted);
    stepDone(3, `${structuralIssues.length}건`);
    document.getElementById('p8_step3-detail').textContent =
      structuralIssues.length ? `${structuralIssues.length}건 발견` : '이슈 없음';
    setBar(60);
  }

  // ── Step 4: AI 언어 검사 ──
  let linguisticIssues = [];
  let aiUsed = false;
  let aiSkipped = false;

  // 캐시에 AI 결과가 있으면 재사용, 없거나 키가 새로 제공된 경우만 API 호출
  if (useCache && cached.aiWasRun && !(apiProvided && aiOnlyRun)) {
    // 캐시된 AI 결과 사용
    linguisticIssues = cached.linguisticIssues || [];
    stepDone(4, `캐시 ⚡ ${linguisticIssues.length}건`);
    document.getElementById('p8_step4-detail').textContent = `캐시 복원 — ${linguisticIssues.length}건`;
    aiUsed = true;
    setBar(93);
  } else if (apiProvided) {
    stepRun(4, aiOnlyRun ? 'AI 검사 실행 (캐시 미포함 항목)…' : 'Claude API 호출 준비 중…');
    try {
      const totalBatches = Math.ceil(
        extracted.pages.filter(p => p.text.trim().length >= 20).length / 3
      );
      let batchApiError = '';
      linguisticIssues = await checkLinguistic(extracted, apiKey,
        (batchIdx) => {
          const pct = 60 + Math.round((batchIdx / Math.max(totalBatches, 1)) * 30);
          setBar(pct);
          document.getElementById('p8_step4-detail').textContent =
            `배치 ${batchIdx}/${totalBatches || 1} 분석 중…`;
        },
        (errMsg) => { batchApiError = errMsg; }
      );

      if (batchApiError && !linguisticIssues.length) {
        // 전체 배치 실패 — 에러 표시
        stepError(4, 'API 오류: ' + batchApiError);
        aiSkipped = true;
        const hint = batchApiError.includes('401') ? ' — API 키를 확인하세요.'
                   : batchApiError.includes('403') ? ' — 권한이 없습니다.'
                   : batchApiError.includes('429') ? ' — 요청 한도 초과, 잠시 후 재시도.'
                   : '';
        alert(`AI 교정 중 오류가 발생했습니다.\n\n${batchApiError}${hint}`);
        if (useCache && cached.linguisticIssues) {
          linguisticIssues = cached.linguisticIssues;
          aiUsed = true;
          document.getElementById('p8_step4-detail').textContent = '오류 — 캐시 결과 사용';
        }
      } else {
        stepDone(4, `${linguisticIssues.length}건`);
        document.getElementById('p8_step4-detail').textContent =
          linguisticIssues.length ? `${linguisticIssues.length}건 발견` : '이슈 없음';
        aiUsed = true;
      }
    } catch(e) {
      stepError(4, 'API 오류: ' + e.message);
      aiSkipped = true;
      if (useCache && cached.linguisticIssues) {
        linguisticIssues = cached.linguisticIssues;
        aiUsed = true;
        document.getElementById('p8_step4-detail').textContent = '오류 — 캐시 결과 사용';
      }
    }
    setBar(93);
  } else {
    if (useCache && !cached.aiWasRun) {
      stepSkip(4, 'API 키 없음 — 이전 캐시에도 AI 결과 없음');
    } else {
      stepSkip(4, 'API 키 없음 — 건너뜀');
    }
    setBar(93);
  }

  // ── Step 5: 결과 정리 ──
  stepRun(5, '이슈 통합 및 정렬 중…');
  await tick();

  const pageTexts = {};
  extracted.pages.forEach(p => { pageTexts[p.page] = p.text; });

  // 크로스 중복 제거: 표면검사와 AI검사 양쪽에서 같은 found를 잡은 경우
  // AI 결과가 더 구체적인 suggestion을 제공하므로 AI 결과 우선, 표면 결과 제거
  const _crossTypes = new Set(CROSS_TYPES);
  const aiFoundSet = new Set();
  for (const iss of linguisticIssues) {
    if (iss.found && _crossTypes.has(iss.type)) {
      aiFoundSet.add(`${iss.page}|${iss.found.trim()}`);
    }
  }
  const dedupedSurface = surfaceIssues.filter(iss => {
    if (!iss.found || !_crossTypes.has(iss.type)) return true; // 표면 전용 type은 유지
    const key = `${iss.page}|${iss.found.trim()}`;
    if (aiFoundSet.has(key)) {
      console.info(`[교정] 크로스 중복 제거 (표면→AI 우선): ${iss.type} "${iss.found.slice(0,30)}"`);
      return false;
    }
    return true;
  });

  allIssues = [...dedupedSurface, ...linguisticIssues, ...structuralIssues].map(iss => {
    const pt = pageTexts[iss.page] || '';
    return { ...iss, ctx: getCtx(pt, iss.found || '') };
  });

  const sevOrd = { high:0, medium:1, low:2, info:3 };
  allIssues.sort((a,b) => (a.page - b.page) || (sevOrd[a.severity]||9) - (sevOrd[b.severity]||9));

  const total = allIssues.length;
  stepDone(5, `${total}건`);
  document.getElementById('p8_step5-detail').textContent = `이슈 ${total}건 정리 완료`;
  setBar(100);
  document.getElementById('p8_loadingTitle').textContent = '교정 완료!';

  // ── 캐시 저장 ──
  // extracted는 용량이 크므로 최소 필드만 보관 (lines 제외, headings 제외)
  // checkStructural은 캐시 경로에서 다시 실행하지 않으므로 headings 불필요
  const extractedForCache = {
    filename: extracted.filename,
    total_pages: extracted.total_pages,
    toc: extracted.toc,
    pages: extracted.pages.map(p => ({ page: p.page, text: p.text, bodyPageNum: p.bodyPageNum || null })),
    isPdfFile: extracted.isPdfFile !== false,
  };
  setCache(fileKey, {
    version: 1,
    fileKey,
    filename: selectedFile.name,
    filesize: selectedFile.size,
    lastModified: selectedFile.lastModified,
    cachedAt: Date.now(),
    extracted: extractedForCache,
    surfaceIssues,
    structuralIssues,
    linguisticIssues: aiUsed ? linguisticIssues : (cached?.linguisticIssues || null),
    aiWasRun: aiUsed || (cached?.aiWasRun || false),
  });

  await tick();
  renderResults(extracted, aiUsed, aiSkipped);
  show('resultPanel');

  // 페이지 뷰어: PDF 파일일 때만 표시
  const isPdf = extracted.isPdfFile !== false;
  const pv = document.getElementById('p8_pageViewer');
  if (pv) pv.style.display = isPdf ? '' : 'none';

  // 제한적 추출 경고 (HWP 바이너리 등)
  if (extracted.limitedExtraction) {
    const notice = document.getElementById('p8_aiNotice');
    if (notice) {
      notice.style.display = 'block';
      notice.textContent = '⚠️ HWP 바이너리 파일은 텍스트 추출이 제한됩니다. 정확한 결과를 위해 한컴오피스에서 HWPX로 변환 후 재업로드하세요.';
    }
  }

  // 탭 이동 후 복원을 위해 세션 상태 저장
  try {
    sessionStorage.setItem('pf_session', JSON.stringify({
      allIssues,
      aiUsed,
      aiSkipped,
      currentFileKey,
      resolvedIndices: [...resolvedIndices],
      extracted: {
        filename: extracted.filename,
        total_pages: extracted.total_pages,
      },
    }));
  } catch (e) { /* 용량 초과 등 무시 */ }
}

// 브라우저 렌더링 한 프레임 대기 (UI 업데이트 반영)
function tick() {
  return new Promise(r => setTimeout(r, 60));
}

// ──────────────────────────────────────────────
// 페이지 뷰어
// ──────────────────────────────────────────────

/** pdfDoc이 없을 때 (캐시 경로) selectedFile에서 지연 로드 */
async function ensurePdfDoc() {
  if (pdfDoc) return pdfDoc;
  if (!selectedFile) return null;
  try {
    const ab = await selectedFile.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
    return pdfDoc;
  } catch(e) {
    console.warn('PDF 지연 로드 실패:', e.message);
    return null;
  }
}

/** 특정 페이지를 canvas에 렌더링 */
async function renderPage(pageNum) {
  if (pvRendering) return;
  pvRendering = true;

  const doc = await ensurePdfDoc();
  if (!doc) { pvRendering = false; return; }

  const total = doc.numPages;
  pageNum = Math.max(1, Math.min(pageNum, total));
  pvCurrentPage = pageNum;

  // UI 업데이트
  document.getElementById('p8_pvHint').style.display = 'none';
  const canvas = document.getElementById('p8_pvCanvas');
  canvas.style.display = 'block';
  document.getElementById('p8_pvLoading').style.display = 'flex';
  document.getElementById('p8_pvPageInp').value = pageNum;
  document.getElementById('p8_pvTotal').textContent = `/ ${total}`;
  document.getElementById('p8_pvPrev').disabled = pageNum <= 1;
  document.getElementById('p8_pvNext').disabled = pageNum >= total;

  try {
    const page = await doc.getPage(pageNum);
    // 뷰어 너비에 맞게 스케일 계산 (420px 컨테이너)
    const wrap = document.getElementById('p8_pvWrap');
    const containerW = wrap.clientWidth || 380;
    const viewport0 = page.getViewport({ scale: 1 });
    const scale = containerW / viewport0.width;
    const viewport = page.getViewport({ scale });

    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
    }).promise;

    // 이슈 수 표시
    const issuesOnPage = allIssues.filter(i => i.page === pageNum);
    document.getElementById('p8_pvInfo').innerHTML = issuesOnPage.length
      ? `<strong>${pageNum}페이지</strong> — 이슈 ${issuesOnPage.length}건: ` +
        issuesOnPage.slice(0, 4).map(i =>
          `<span style="color:${i.severity==='high'?'#e74c3c':i.severity==='medium'?'#e67e22':'#27ae60'}">${esc(i.type)}</span>`
        ).join(', ') + (issuesOnPage.length > 4 ? ` 외 ${issuesOnPage.length-4}건` : '')
      : `<strong>${pageNum}페이지</strong> — 이슈 없음`;

  } catch(e) {
    document.getElementById('p8_pvInfo').textContent = '페이지 렌더링 오류: ' + e.message;
  } finally {
    document.getElementById('p8_pvLoading').style.display = 'none';
    pvRendering = false;
  }
}

function p8_pvGo(delta) {
  renderPage(pvCurrentPage + delta);
}

function p8_pvGoTo(n) {
  if (!isNaN(n)) renderPage(n);
}

// ──────────────────────────────────────────────
// 결과 렌더링
// ──────────────────────────────────────────────
// 유형별 카테고리 분류
// ── type 분류 (검사 출처 기반) ──
// 표면검사(정규식)에서만 생성되는 type
const SURFACE_ONLY    = ['단어반복','이중수동','중복군더더기','접속사중복','한자남용','불필요한공백','AI투'];
// AI검사에서만 생성되는 type
const AI_ONLY         = ['비문','주술호응오류','잘못된표현','수동태과용','윤문필요','중의적표현','문체불일치','사실오류','할루시네이션','저자확인필요'];
// 표면(인접오타)+AI(문맥반복) 양쪽에서 생성 가능 (크로스 중복 제거: AI 우선)
const CROSS_TYPES     = ['조사중복','번역체','일본식표현','외래어표기오류','용어불일치','내용보완필요','문단연결불량','문장부호오류','띄어쓰기','맞춤법'];
// 구조검사에서 생성
const STRUCT_TYPES    = ['목차불일치'];
// 호환용 집합 (기존 렌더링 코드와 호환)
const SURFACE_TYPES   = [...SURFACE_ONLY, ...CROSS_TYPES];
const LINGUISTIC_TYPES= [...AI_ONLY, ...CROSS_TYPES];
const CONTENT_TYPES   = ['내용보완필요','문단연결불량','사실오류','할루시네이션'];
const AUTHOR_TYPES    = ['저자확인필요'];

// ── 편집 카테고리 현황 정의 ──
// 원칙: 각 type은 정확히 하나의 카테고리에만 속한다 (중복 금지)
// 분류 기준: 오탈자(기계적) → 문법(규칙 위반) → 스타일(다듬기) → 내용(의미) → 구조
const EDIT_CATEGORIES = [
  // ── 1. 오탈자·표기 (기계적 오류 — 맞다/틀리다가 명확) ──
  { key:'오탈자',      label:'오탈자·표기',     sub:'띄어쓰기·맞춤법·문장부호·공백',
    types:['띄어쓰기','맞춤법','문장부호오류','불필요한공백'] },
  { key:'외래어',      label:'외래어 표기',     sub:'외래어 표준 표기 오류',
    types:['외래어표기오류'] },
  // ── 2. 문법 오류 (문법 규칙 위반) ──
  { key:'조사문법',    label:'조사·문법',       sub:'조사 중복·이중수동·비문·주술 호응',
    types:['조사중복','이중수동','비문','주술호응오류','잘못된표현'] },
  // ── 3. 중복·군더더기 (불필요한 반복) ──
  { key:'중복군더더기', label:'중복·군더더기',   sub:'단어 반복·군더더기·접속사 중복',
    types:['단어반복','중복군더더기','접속사중복','한자남용'] },
  // ── 4. 윤문 (틀리진 않지만 다듬기 필요) ──
  { key:'윤문필요',    label:'윤문 필요',       sub:'어색한 문장·중의적 표현',
    types:['윤문필요','중의적표현'] },
  // ── 5. 번역체·외국어투 ──
  { key:'번역체',      label:'번역체·외국어투', sub:'번역투·일본식 표현·수동태 과용',
    types:['번역체','일본식표현','수동태과용'] },
  // ── 6. AI투 의심 ──
  { key:'AI투',        label:'AI투 의심',       sub:'AI 상투어·수식 과잉·단정 회피',
    types:['AI투'] },
  // ── 7. 표기 일관성 ──
  { key:'표기불일치',  label:'표기 불일치',     sub:'용어·문체 혼재',
    types:['용어불일치','문체불일치'] },
  // ── 8. 내용·구성 (의미 수준 문제) ──
  { key:'내용구성',    label:'내용·구성',       sub:'설명 부족·출처 누락·문단 전환',
    types:['내용보완필요','문단연결불량'] },
  // ── 9. 사실 검증 (사실 확인 필요) ──
  { key:'사실검증',    label:'사실 검증',       sub:'사실 오류·AI 생성 허위 정보',
    types:['사실오류','할루시네이션'] },
  // ── 10. 저자 확인 ──
  { key:'저자확인필요', label:'저자 확인 필요',  sub:'수치·인용·기술 검증 필요',
    types:['저자확인필요'] },
  // ── 11. 목차 불일치 ──
  { key:'목차불일치',  label:'목차 불일치',     sub:'목차-본문 제목 불일치',
    types:['목차불일치'] },
];

function renderResults(extracted, aiUsed, aiSkipped) {
  const total = allIssues.length;
  const high = allIssues.filter(i=>i.severity==='high').length;
  const med  = allIssues.filter(i=>i.severity==='medium').length;
  const low  = allIssues.filter(i=>i.severity==='low').length;
  const surf = allIssues.filter(i=>SURFACE_TYPES.includes(i.type)).length;
  const ling = allIssues.filter(i=>LINGUISTIC_TYPES.includes(i.type)).length;
  const cont = allIssues.filter(i=>CONTENT_TYPES.includes(i.type)).length;
  const auth = allIssues.filter(i=>AUTHOR_TYPES.includes(i.type)).length;
  const stru = allIssues.filter(i=>STRUCT_TYPES.includes(i.type)).length;
  const term = allIssues.filter(i=>i.type==='용어불일치').length;

  document.getElementById('p8_summaryBar').innerHTML = `
    <span class="sum-title">총 ${total}건 이슈</span>
    <span class="sum-file">${extracted.filename} · ${extracted.total_pages}p</span>
    <div class="sum-chips">
      <span class="chip high" title="높음" onclick="p8_filterSevChip('high',this)">높음 ${high}</span>
      <span class="chip med"  title="중간" onclick="p8_filterSevChip('medium',this)">중간 ${med}</span>
      <span class="chip low"  title="낮음" onclick="p8_filterSevChip('low',this)">낮음 ${low}</span>
      <span class="chip" style="background:#c0392b" title="표면오류">표면 ${surf}</span>
      <span class="chip ai" title="언어품질">언어 ${ling}</span>
      <span class="chip" style="background:#8e44ad" title="내용보완">내용 ${cont}</span>
      <span class="chip" style="background:#d35400" title="저자확인">저자확인 ${auth}</span>
      <span class="chip" style="background:#16a085" title="구조">구조 ${stru}</span>
      ${term > 0 ? `<span class="chip" style="background:#795548" title="용어불일치" onclick="p8_filterByTypes(['용어불일치'])">용어 ${term}</span>` : ''}
      <span class="chip" style="background:#059669" title="해결됨 필터" onclick="p8_filterResolved('resolved',this)">해결됨 ${resolvedIndices.size}</span>
      <span class="chip" style="background:#b45309" title="미해결 필터" onclick="p8_filterResolved('unresolved',this)">미해결 ${total - resolvedIndices.size}</span>
      ${aiUsed ? '<span class="chip" style="background:#2980b9">AI 검사 완료</span>' : '<span class="chip" style="background:#c0392b" title="비문·사실오류·주술호응 등 의미 오류는 API 키 입력 후 재검사하세요">⚠️ AI 미실행</span>'}
      ${getCache(currentFileKey || '') ? '<span class="chip" style="background:#27ae60" title="캐시 재사용">⚡ 캐시</span>' : ''}
    </div>`;

  // AI 미실행 배너 — API 키 입력 + 재검사 버튼 포함
  const notice = document.getElementById('p8_aiNotice');
  if (notice && !aiUsed) {
    notice.style.display = 'block';
    notice.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0;">
        <span style="font-weight:600;">⚠️ AI 의미 검사 미실행</span>
        <span style="font-size:.8rem;color:var(--muted)">비문·윤문필요·사실오류·주술호응 등은 아래 키 입력 후 재검사하세요</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;">
        <input type="password" id="p8_noticeKeyInp"
               placeholder="sk-ant-api03-..."
               style="flex:1;min-width:220px;padding:5px 10px;border:1px solid var(--border2);
                      border-radius:6px;font-size:.82rem;background:var(--bg2);color:var(--fg);">
        <button id="p8_rerunAiBtn" onclick="p8_rerunAI()"
                style="padding:5px 16px;background:var(--accent);color:#fff;border:none;
                       border-radius:6px;cursor:pointer;font-size:.82rem;white-space:nowrap;
                       font-weight:600;">
          AI 재검사 실행
        </button>
      </div>`;

    // 세션에 저장된 키 자동 채움 + 입력 이벤트 바인딩
    setTimeout(async () => {
      const inp = document.getElementById('p8_noticeKeyInp');
      if (!inp) return;
      try {
        if (typeof loadApiKey === 'function') {
          const k = await loadApiKey();
          if (k) inp.value = k;
        }
      } catch(e) {}
      inp.addEventListener('input', () => {
        inp.style.borderColor = '';
        if (typeof saveApiKey === 'function') saveApiKey(inp.value.trim() || '');
      });
      inp.addEventListener('blur', () => {
        const v = inp.value.trim();
        if (v && !isValidApiKeyFormat(v)) {
          inp.style.borderColor = '#e74c3c';
          alert('API 키 형식이 올바르지 않습니다.\n\nAnthropic API 키는 sk-ant- 로 시작하는 문자열입니다.\n예) sk-ant-api03-XXXX...');
        } else {
          inp.style.borderColor = '';
        }
      });
    }, 0);
  } else if (notice && aiUsed) {
    notice.style.display = 'none';
  }

  // 편집 카테고리 현황 렌더링 — 항상 표시, 없으면 "없음"
  // onclick 속성은 JSON 큰따옴표 충돌을 피하기 위해 data-idx 인덱스 방식 사용
  const catGrid = document.getElementById('p8_catGrid');

  // 모든 카테고리 타입 집합 — 미분류 이슈 탐지용
  const allCatTypes = new Set(EDIT_CATEGORIES.flatMap(c => c.types));
  const uncategorized = allIssues.filter(i => !allCatTypes.has(i.type));
  if (uncategorized.length > 0) {
    const utypes = [...new Set(uncategorized.map(i => i.type))];
    console.warn('[교정] 미분류 이슈:', uncategorized.length + '건, 타입:', utypes.join(', '));
  }

  const catBoxes = EDIT_CATEGORIES.map((cat, catIdx) => {
    const count = allIssues.filter(i => cat.types.includes(i.type)).length;
    const hasOnlySurface = cat.types.every(t => SURFACE_TYPES.includes(t) || STRUCT_TYPES.includes(t));
    const isAiType = !hasOnlySurface && !cat.types.some(t => SURFACE_TYPES.includes(t) || STRUCT_TYPES.includes(t));
    const notChecked = isAiType && !aiUsed;

    // onclick: data-cat-idx 인덱스로 전달 → JSON 따옴표 충돌 없음
    if (count > 0) {
      return `<div class="cat-box has-issues" data-cat-idx="${catIdx}" onclick="p8_filterByCatIdx(this)">
        <div class="cat-name">${cat.label}</div>
        <div class="cat-count">${count}건</div>
        <div class="cat-sub">${cat.sub}</div>
      </div>`;
    }
    if (notChecked) {
      return `<div class="cat-box not-checked" title="API 키를 입력하면 AI가 이 항목을 검사합니다">
        <div class="cat-name">${cat.label}</div>
        <div class="cat-count">불필요</div>
        <div class="cat-sub">API 키 필요</div>
      </div>`;
    }
    return `<div class="cat-box no-issues" data-cat-idx="${catIdx}" onclick="p8_filterByCatIdx(this)">
      <div class="cat-name">${cat.label}</div>
      <div class="cat-count">✓ 없음</div>
      <div class="cat-sub">${cat.sub}</div>
    </div>`;
  });

  // 미분류 카테고리 박스 — 집계 누락 이슈 시각화
  if (uncategorized.length > 0) {
    catBoxes.push(`<div class="cat-box has-issues cat-uncategorized" onclick="p8_filterUncategorized()">
      <div class="cat-name">미분류</div>
      <div class="cat-count">${uncategorized.length}건</div>
      <div class="cat-sub">카테고리 미매핑 유형</div>
    </div>`);
  }

  catGrid.innerHTML = catBoxes.join('');

  // 유형 드롭다운 채우기
  const types = [...new Set(allIssues.map(i=>i.type))].sort();
  const sel = document.getElementById('p8_typeSel');
  sel.innerHTML = '<option value="">전체 유형</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join('');

  p8_applyFilters();
}

function renderIssues(issues) {
  const el = document.getElementById('p8_issuesList');
  document.getElementById('p8_resultCount').textContent = `${issues.length}건 표시`;
  if (!issues.length) {
    el.innerHTML = '<div class="no-issues"><div class="big">✅</div>이슈가 없습니다</div>';
    return;
  }
  el.innerHTML = issues.map((iss) => {
    // 전역 인덱스: 필터 변경 후에도 resolved 상태를 올바르게 복원하는 기준
    const globalIdx = allIssues.indexOf(iss);
    const isResolved = resolvedIndices.has(globalIdx);

    const sev = iss.severity || 'low';
    const sevLabel = {high:'높음', medium:'중간', low:'낮음'}[sev] || sev;
    const ctx = iss.ctx || {};
    const hasCtx = ctx.target || ctx.before || ctx.after;
    const ctxHtml = hasCtx
      ? `<span class="ctx-before">${esc(ctx.before)}</span><span class="ctx-found">${esc(ctx.target || iss.found || '')}</span><span class="ctx-after">${esc(ctx.after)}</span>`
      : `<span class="ctx-na">컨텍스트 없음</span>`;

    const typeClass = SURFACE_TYPES.includes(iss.type) ? 'surface'
      : CONTENT_TYPES.includes(iss.type) ? 'content'
      : STRUCT_TYPES.includes(iss.type)  ? 'struct'
      : 'linguistic';
    const hasSuggestion = iss.suggestion && iss.suggestion.trim();
    // 이중수동: alts가 있으면 단일수동/능동 두 칩 렌더링
    // data-text 속성으로 텍스트 전달 — onclick 속성 안 따옴표 충돌 방지
    const altsHtml = iss.alts ? `
      <div class="alts-box">
        <span class="alts-label">수정 방안 선택</span>
        <button class="alt-chip passive" data-text="${esc(iss.alts.passive)}" onclick="p8_copyChip(this.dataset.text)" title="클릭하면 복사됩니다">
          단일수동: ${esc(iss.alts.passive)}
        </button>
        <button class="alt-chip active" data-text="${esc(iss.alts.active)}" onclick="p8_copyChip(this.dataset.text)" title="클릭하면 복사됩니다">
          능동형: ${esc(iss.alts.active)}
        </button>
      </div>` : '';
    return `<div class="issue-card sev-${sev}${isResolved ? ' resolved' : ''}" data-global-idx="${globalIdx}">
      <div class="card-head">
        <span class="badge-page" onclick="p8_renderPage(${iss.page})" title="페이지 ${iss.page} 보기">p.${iss.page}</span>
        <span class="badge-type ${typeClass}">${esc(iss.type)}</span>
        <span class="badge-sev ${sev}">${sevLabel}</span>
        <button class="btn-resolve" onclick="p8_toggleResolve(${globalIdx},this)">${isResolved ? '해결됨' : '미해결'}</button>
      </div>
      ${iss.description ? `<div class="card-desc">${esc(iss.description)}</div>` : ''}
      <div class="diff-block">
        <div class="diff-row diff-before">
          <span class="diff-label">원문</span>
          <span class="diff-content">${ctxHtml}</span>
        </div>
        ${altsHtml}
        ${!iss.alts && hasSuggestion ? `<div class="diff-row diff-after">
          <span class="diff-label">수정안</span>
          <span class="diff-content diff-suggestion">${esc(iss.suggestion)}</span>
          <button class="btn-copy" data-global-idx="${globalIdx}" onclick="p8_copyText(this.dataset.globalIdx)" title="수정안 복사">복사</button>
        </div>` : ''}
        ${iss.verifyUrl ? `<div class="diff-row" style="background:#fef3c7;border-left:3px solid #f59e0b;padding:4px 8px;margin-top:2px;border-radius:4px;">
          <span class="diff-label" style="color:#b45309;">검증</span>
          <a href="${esc(iss.verifyUrl)}" target="_blank" rel="noopener" style="color:#1d4ed8;text-decoration:underline;font-size:0.78rem;word-break:break-all;">${esc(iss.verifyUrl)}</a>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function p8_toggleResolve(globalIdx, btn) {
  // resolvedIndices에 전역 인덱스 기준으로 토글 — 필터 변경 후에도 상태 유지
  if (resolvedIndices.has(globalIdx)) {
    resolvedIndices.delete(globalIdx);
  } else {
    resolvedIndices.add(globalIdx);
  }
  const resolved = resolvedIndices.has(globalIdx);
  const card = btn.closest('.issue-card');
  if (card) card.classList.toggle('resolved', resolved);
  btn.textContent = resolved ? '해결됨' : '미해결';
  _updateResolvedChips();
}

function p8_copyChip(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => _p8Toast(`"${text}" 복사됨`))
      .catch(() => _p8FallbackCopy(text));
  } else {
    _p8FallbackCopy(text);
  }
}

function p8_copyText(idx) {
  const issue = allIssues[parseInt(idx, 10)];
  if (!issue || !issue.suggestion) return;
  const text = issue.suggestion;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => _p8Toast('수정안이 클립보드에 복사되었습니다.')).catch(() => _p8FallbackCopy(text));
  } else {
    _p8FallbackCopy(text);
  }
}
function _p8FallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  _p8Toast('수정안이 클립보드에 복사되었습니다.');
}
function _p8Toast(msg) {
  let t = document.getElementById('p8_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'p8_toast';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#2c3e50;color:#fff;padding:8px 20px;border-radius:20px;font-size:.82rem;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity = '0'; }, 1800);
}

// ──────────────────────────────────────────────
// 필터링
// ──────────────────────────────────────────────
function p8_setSev(btn) {
  document.querySelectorAll('.sev-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentSev = btn.dataset.sev;
  p8_applyFilters();
}

function p8_filterSevChip(sev, chip) {
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active-filter'));
  const isActive = currentSev === sev;
  currentSev = isActive ? 'all' : sev;
  if (!isActive) chip.classList.add('active-filter');
  // sync sev buttons
  document.querySelectorAll('.sev-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.sev === currentSev);
  });
  p8_applyFilters();
}

// 해결됨/미해결 필터
let activeResolvedFilter = null; // 'resolved' | 'unresolved' | null

function p8_filterResolved(mode, chip) {
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active-filter'));
  const isActive = activeResolvedFilter === mode;
  activeResolvedFilter = isActive ? null : mode;
  if (!isActive && chip) chip.classList.add('active-filter');
  p8_applyFilters();
}

// 해결됨/미해결 카운트 칩 업데이트
function _updateResolvedChips() {
  const bar = document.getElementById('p8_summaryBar');
  if (!bar) return;
  const resolvedChip = bar.querySelector('[title="해결됨 필터"]');
  const unresolvedChip = bar.querySelector('[title="미해결 필터"]');
  if (resolvedChip) resolvedChip.textContent = '해결됨 ' + resolvedIndices.size;
  if (unresolvedChip) unresolvedChip.textContent = '미해결 ' + (allIssues.length - resolvedIndices.size);
}

// 카테고리 박스 클릭 시 설정되는 유형 OR 필터 (검색창과 독립)
let activeTypeFilter = null;

// data-cat-idx 방식 래퍼 — onclick="..." 속성 안의 JSON 큰따옴표 충돌 방지
function p8_filterByCatIdx(el) {
  const idx = parseInt(el.dataset.catIdx, 10);
  if (!isNaN(idx) && EDIT_CATEGORIES[idx]) {
    p8_filterByTypes(EDIT_CATEGORIES[idx].types);
  }
}

// 미분류 이슈 필터 — 모든 카테고리에 속하지 않는 이슈
function p8_filterUncategorized() {
  const allCatTypes = new Set(EDIT_CATEGORIES.flatMap(c => c.types));
  const uncatTypes = [...new Set(allIssues.filter(i => !allCatTypes.has(i.type)).map(i => i.type))];
  p8_filterByTypes(uncatTypes);
}

function p8_filterByTypes(types) {
  activeTypeFilter = types.length ? types : null;
  // typeSel 드롭다운은 단일 유형일 때만 동기화
  const sel = document.getElementById('p8_typeSel');
  sel.value = types.length === 1 ? types[0] : '';
  p8_applyFilters();
}

function p8_applyFilters() {
  const type   = document.getElementById('p8_typeSel').value;
  const search = document.getElementById('p8_searchInp').value.trim().toLowerCase();

  // typeSel 변경 시 카테고리 필터 초기화
  if (type) activeTypeFilter = null;

  const filtered = allIssues.filter(i => {
    // 해결됨/미해결 필터
    if (activeResolvedFilter) {
      const idx = allIssues.indexOf(i);
      const isRes = resolvedIndices.has(idx);
      if (activeResolvedFilter === 'resolved' && !isRes) return false;
      if (activeResolvedFilter === 'unresolved' && isRes) return false;
    }
    if (currentSev !== 'all' && i.severity !== currentSev) return false;
    if (type && i.type !== type) return false;
    if (activeTypeFilter) {
      if (!activeTypeFilter.includes(i.type)) return false;
    } else if (search) {
      const hay = [i.found, i.suggestion, i.description, i.type].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  renderIssues(filtered);
}


// ──────────────────────────────────────────────
// 교정 원고 다운로드
// ──────────────────────────────────────────────

/** suggestion에서 실제 교체할 텍스트만 추출 */
function _cleanSuggestion(iss) {
  if (iss.alts) return iss.alts.passive || iss.alts.active || '';
  const s = iss.suggestion || '';
  if (!s) return '';
  // 표면검사: → "교정문" 설명... → 따옴표 안 텍스트만
  const q = s.match(/^→\s*"([^"]+)"/);
  if (q) return q[1];
  // AI검사: suggestion 그대로 사용 (완성된 수정 문장)
  return s;
}

/** 해결됨 이슈에서 교정 내용 수집 */
function _getCorrections() {
  const list = [];
  resolvedIndices.forEach(idx => {
    const iss = allIssues[idx];
    if (!iss || !iss.found) return;
    const repl = _cleanSuggestion(iss);
    if (repl && iss.found !== repl) {
      list.push({ found: iss.found, repl, page: iss.page });
    }
  });
  list.sort((a, b) => b.found.length - a.found.length);
  return list;
}

/** 텍스트에 교정 적용 */
function _applyAll(text, corrs) {
  let r = text;
  for (const c of corrs) {
    // 모든 출현 치환
    r = r.split(c.found).join(c.repl);
  }
  return r;
}

function _dlBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
}

async function p8_downloadCorrected() {
  if (!selectedFile) {
    alert('원본 파일이 없습니다. 파일을 다시 업로드해 주세요.');
    return;
  }
  const corrs = _getCorrections();
  if (!corrs.length) {
    alert('해결됨으로 표시된 이슈가 없습니다.\n이슈 카드의 [미해결] 버튼을 클릭하여 [해결됨]으로 변경하세요.');
    return;
  }

  const ext = selectedFile.name.split('.').pop().toLowerCase();
  const base = selectedFile.name.replace(/\.[^.]+$/, '');

  try {
    if (ext === 'txt' || ext === 'md') {
      const text = await selectedFile.text();
      _dlBlob(new Blob(['\uFEFF' + _applyAll(text, corrs)], { type: 'text/plain;charset=utf-8' }), base + '_교정.' + ext);

    } else if (ext === 'docx') {
      if (typeof JSZip === 'undefined') throw new Error('JSZip 필요');
      const zip = await JSZip.loadAsync(await selectedFile.arrayBuffer());
      const df = zip.file('word/document.xml');
      if (!df) throw new Error('document.xml 없음');
      let xml = await df.async('string');
      for (const c of corrs) {
        const ef = c.found.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const er = c.repl.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        xml = xml.split(ef).join(er);
      }
      zip.file('word/document.xml', xml);
      _dlBlob(await zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), base + '_교정.docx');

    } else if (ext === 'hwpx') {
      if (typeof JSZip === 'undefined') throw new Error('JSZip 필요');
      const zip = await JSZip.loadAsync(await selectedFile.arrayBuffer());
      const secs = Object.keys(zip.files).filter(n => /^Contents\/section\d+\.xml$/i.test(n)).sort();
      if (!secs.length) throw new Error('섹션 없음');
      for (const fn of secs) {
        let xml = await zip.files[fn].async('string');
        for (const c of corrs) xml = xml.split(c.found).join(c.repl);
        zip.file(fn, xml);
      }
      _dlBlob(await zip.generateAsync({ type:'blob' }), base + '_교정.hwpx');

    } else if (ext === 'pdf') {
      // PDF 텍스트 직접 수정 불가 → 교정 보고서 출력
      const rows = corrs.map(c =>
        `<tr><td>${c.page||''}</td><td><del style="color:#c0392b;background:#fde8e8">${_esc(c.found)}</del></td><td style="color:#27ae60;background:#e8f8e8">${_esc(c.repl)}</td></tr>`
      ).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>교정 보고서</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Pretendard,'Malgun Gothic',sans-serif;font-size:11px;padding:24px;line-height:1.6}
h1{font-size:16px;margin-bottom:8px}table{width:100%;border-collapse:collapse;font-size:10.5px}
th,td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top;word-break:break-all}
th{background:#f0f0f0;font-weight:600}del{text-decoration:line-through}
@media print{body{padding:12px}}</style></head><body>
<h1>${_esc(base)} — 교정 보고서 (${corrs.length}건)</h1>
<p style="color:#666;font-size:10px;margin-bottom:12px">${_esc(selectedFile.name)} · ${new Date().toLocaleDateString('ko')}</p>
<table><thead><tr><th>p.</th><th>원문 (삭제)</th><th>수정 (반영)</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
      if (typeof openPrintPopup === 'function') openPrintPopup(html);
      else { const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();} }

    } else {
      alert(ext.toUpperCase() + ' 형식은 교정 다운로드를 지원하지 않습니다.\nTXT, DOCX, HWPX, PDF를 지원합니다.');
    }
  } catch (e) {
    console.error('[교정 다운로드]', e);
    alert('다운로드 오류: ' + e.message);
  }
}

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────
function show(id) {
  ['uploadPanel','loadingPanel','resultPanel'].forEach(p => {
    const el = document.getElementById('p8_' + p);
    if (el) el.style.display = p === id ? 'block' : 'none';
  });
}

function p8_reset() {
  selectedFile = null;
  allIssues = [];
  currentSev = 'all';
  activeTypeFilter = null;
  activeResolvedFilter = null;
  currentFileKey = null;
  pdfDoc = null;
  resolvedIndices.clear();
  pvCurrentPage = 1;
  pvRendering = false;
  document.getElementById('p8_fileName').textContent = '';
  document.getElementById('p8_btnStart').disabled = true;
  document.getElementById('p8_fileInput').value = '';
  document.getElementById('p8_cacheInfo').innerHTML = '';
  // 뷰어 초기화
  const canvas = document.getElementById('p8_pvCanvas');
  canvas.style.display = 'none';
  document.getElementById('p8_pvHint').style.display = 'flex';
  document.getElementById('p8_pvInfo').textContent = '';
  document.getElementById('p8_pvPageInp').value = 1;
  document.getElementById('p8_pvTotal').textContent = '/ —';
  document.getElementById('p8_pvPrev').disabled = true;
  document.getElementById('p8_pvNext').disabled = true;
  // 세션 상태 삭제
  try { sessionStorage.removeItem('pf_session'); } catch(e) {}
  show('uploadPanel');
}

// ── 탭 복원 + API 키 세션 로드 ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // API 키 세션 복원 — 탭 닫기 전까지 유지
  (async () => {
    try {
      if (typeof loadApiKey === 'function') {
        const key = await loadApiKey();
        if (key) {
          const inp = document.getElementById('p8_apiKey');
          if (inp && !inp.value) inp.value = key;
        }
      }
    } catch(e) {}
  })();

  // p8_apiKey 입력 시 세션에 즉시 저장 + 형식 검증
  const keyInp = document.getElementById('p8_apiKey');
  if (keyInp) {
    keyInp.addEventListener('input', () => {
      const v = keyInp.value.trim();
      clearApiKeyFormatError(keyInp);
      if (typeof saveApiKey === 'function') saveApiKey(v || '');
    });
    keyInp.addEventListener('blur', () => {
      const v = keyInp.value.trim();
      if (v && !isValidApiKeyFormat(v)) {
        showApiKeyFormatError(keyInp);
      } else {
        clearApiKeyFormatError(keyInp);
      }
    });
  }

  // 이전 세션 결과 복원
  try {
    const raw = sessionStorage.getItem('pf_session');
    if (!raw) return;
    const sess = JSON.parse(raw);
    if (!sess || !Array.isArray(sess.allIssues) || !sess.extracted) return;

    allIssues = sess.allIssues;
    currentFileKey = sess.currentFileKey || null;
    resolvedIndices.clear();
    if (Array.isArray(sess.resolvedIndices)) {
      sess.resolvedIndices.forEach(i => resolvedIndices.add(i));
    }

    const ext = sess.extracted;
    renderResults(
      { filename: ext.filename, total_pages: ext.total_pages },
      !!sess.aiUsed,
      !!sess.aiSkipped
    );
    show('resultPanel');
  } catch (e) { /* 무시 */ }
});

  // ──────────────────────────────────────────────
  // AI 재검사 (결과 화면에서 API 키 입력 후 재실행)
  // ──────────────────────────────────────────────
  async function p8_rerunAI() {
    // 1. API 키 확인
    const noticeInp = document.getElementById('p8_noticeKeyInp');
    let apiKey = (noticeInp && noticeInp.value.trim()) || '';
    if (!apiKey && typeof loadApiKey === 'function') {
      try { apiKey = await loadApiKey(); } catch(e) {}
    }
    if (!apiKey) {
      alert('API 키를 입력해 주세요.\n\n배너의 입력창에 Anthropic API 키(sk-ant-...)를 붙여넣으세요.');
      return;
    }
    if (!isValidApiKeyFormat(apiKey)) {
      if (noticeInp) { noticeInp.style.borderColor = '#e74c3c'; noticeInp.focus(); }
      alert('API 키 형식이 올바르지 않습니다.\n\nAnthropic API 키는 sk-ant- 로 시작하는 문자열입니다.\n예) sk-ant-api03-XXXX...');
      return;
    }

    // 2. 캐시에서 추출 데이터 가져오기
    const cacheKey = currentFileKey;
    const cached = cacheKey ? getCache(cacheKey) : null;
    const extracted = cached?.extracted || null;
    if (!extracted || !extracted.pages || !extracted.pages.length) {
      alert('원본 텍스트 데이터가 없습니다.\n파일을 다시 업로드하여 전체 검사를 실행해 주세요.');
      return;
    }

    // 3. 버튼 로딩 상태
    const btn = document.getElementById('p8_rerunAiBtn');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = 'AI 검사 중…'; btn.disabled = true; }

    // 4. AI 언어 검사 실행
    let linguisticIssues = [];
    let hasError = '';
    try {
      linguisticIssues = await checkLinguistic(
        extracted,
        apiKey,
        (batchIdx) => {
          if (btn) btn.textContent = `AI 검사 중… (배치 ${batchIdx})`;
        },
        (errMsg) => { hasError = errMsg; }
      );
    } catch(e) {
      hasError = e.message || 'AI 검사 오류';
    }

    if (btn) { btn.textContent = origText; btn.disabled = false; }

    if (hasError && !linguisticIssues.length) {
      const hint = hasError.includes('401') || hasError.includes('403')
        ? '\n\nAPI 키가 올바른지 확인하세요.'
        : hasError.includes('429') ? '\n\n요청 한도 초과 — 잠시 후 다시 시도하세요.' : '';
      alert(`AI 교정 중 오류가 발생했습니다.\n\n${hasError}${hint}`);
      return;
    }

    // 5. 세션에 키 저장
    if (typeof saveApiKey === 'function') saveApiKey(apiKey);
    const p8inp = document.getElementById('p8_apiKey');
    if (p8inp && !p8inp.value) p8inp.value = apiKey;

    // 6. 기존 표면·구조 이슈 유지 + AI 결과 병합
    const surface   = (cached?.surfaceIssues    || []);
    const structural = (cached?.structuralIssues || []);
    allIssues = [...surface, ...structural, ...linguisticIssues];

    // 7. 캐시 갱신
    if (cacheKey) {
      setCache(cacheKey, {
        ...cached,
        linguisticIssues,
        aiWasRun: true,
        cachedAt: Date.now(),
      });
    }

    // 8. 결과 다시 렌더링 (aiUsed=true)
    renderResults(extracted, true, false);
    show('resultPanel');

    // 9. 세션 상태 갱신
    try {
      sessionStorage.setItem('pf_session', JSON.stringify({
        allIssues,
        aiUsed: true,
        aiSkipped: false,
        currentFileKey: cacheKey,
        resolvedIndices: [...resolvedIndices],
        extracted: { filename: extracted.filename, total_pages: extracted.total_pages },
      }));
    } catch(e) {}
  }

  window.p8_handleRulesDrop = p8_handleRulesDrop;
  window.p8_handleRulesFile = p8_handleRulesFile;
  window.p8_startProofread = p8_startProofread;
  window.p8_pvGo = p8_pvGo;
  window.p8_pvGoTo = p8_pvGoTo;
  window.p8_renderPage = renderPage;
  window.p8_setSev = p8_setSev;
  window.p8_applyFilters = p8_applyFilters;
  window.p8_reset = p8_reset;
  window.p8_toggleResolve = p8_toggleResolve;
  window.p8_copyText = p8_copyText;
  window.p8_filterSevChip = p8_filterSevChip;
  window.p8_filterResolved = p8_filterResolved;
  window.p8_filterByTypes = p8_filterByTypes;
  window.p8_filterByCatIdx = p8_filterByCatIdx;
  window.p8_filterUncategorized = p8_filterUncategorized;
  window.p8_copyChip = p8_copyChip;
  window.p8_onClearThisCache = p8_onClearThisCache;
  window.p8_rerunAI = p8_rerunAI;
  window.p8_downloadCorrected = p8_downloadCorrected;
})();
