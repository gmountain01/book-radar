(function(){

// ──────────────────────────────────────────────
// PDF.js 설정 (CDN 로드 실패 시 안전하게 처리)
// ──────────────────────────────────────────────
try {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
    document.querySelector('.rules-badge-default').className = 'rules-badge-loaded';
    document.querySelector('.rules-badge-loaded').textContent = '사용자 규칙 적용 중';
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
      // filtered는 이미 y→x 순으로 정렬됐으므로 추가 sort 불필요
      cur.items.push(it);
      cur.text = cur.items.map(i => i.str).join('');
    }
  }
  return lines;
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
  throw new Error(`지원하지 않는 파일 형식: .${ext}`);
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

    // 줄 단위 그룹핑
    const lines = groupTextIntoLines(content.items);
    const text = lines.map(l => l.text).join('\n');

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

// 1. 조사 중복
const PARTICLE_PATTERNS = [
  [/을를|를을/g,         '조사중복', 'high',   '을/를 중 하나만 사용'],
  [/이가|가이(?=[^나])/g,'조사중복', 'high',   '이/가 중 하나만 사용'],
  [/은는|는은/g,         '조사중복', 'high',   '은/는 중 하나만 사용'],
  [/와과|과와/g,         '조사중복', 'high',   '와/과 중 하나만 사용'],
  [/에서서|에게서서/g,   '조사중복', 'high',   '조사 중복 삭제'],
];

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
  [/컨텐츠/g,         '외래어오표기', 'medium', '콘텐츠 (표준 표기)'],
  [/워크플로우/g,     '외래어오표기', 'medium', '워크플로 (표준 표기)'],
  [/어플리케이션/g,   '외래어오표기', 'medium', '애플리케이션 (표준 표기)'],
  [/섀도우(?!박스)/g, '외래어오표기', 'low',    '섀도 (표준 표기)'],
  [/메세지/g,         '외래어오표기', 'medium', '메시지 (표준 표기)'],
  [/리더쉽/g,         '외래어오표기', 'medium', '리더십 (표준 표기)'],
  [/페이지(?=\s*수)/g,'외래어오표기', 'low',    '쪽 수 또는 페이지 수 (문맥 확인)'],
  [/니즈/g,           '외래어오표기', 'medium', '"요구" 또는 "필요"로 한국어 표현 권장'],
];

// 9. 번역체·일본식 표현 (표면 정규식)
const JSTYLE_PATS = [
  [/[가-힣]+에\s+있어서/g,           '일본식표현', 'medium', '"~에서"로 바꾸세요 (일본어 において 직역)'],
  [/함에\s+있어서/g,                  '번역체',     'medium', '"~할 때" 또는 "~하려면"으로 바꾸세요'],
  [/[가-힣]+를?\s*통해서\b/g,         '번역체',     'low',    '"통해"로 줄이세요 (통해서 → 통해)'],
  [/(?:그것|이것)은\s+[가-힣]+이기도/g,'번역체',    'medium', '영어식 주어 반복 — "또한 ~이다"로 통합하세요'],
  [/[가-힣]{2,}적인\s+[가-힣]+에서/g, '일본식표현','low',    '"~에서" 또는 명사 직접 사용 권장 (기술적인 → 기술)'],
];

// 10. 내용보완필요 (표면 정규식)
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

    // 조사 중복
    addAll(PARTICLE_PATTERNS, text, page);

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
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) chunks.push(current);
      current = { heading: line.replace(/^## /, '').trim(), text: line + '\n', keywords: [] };
    } else if (current) {
      current.text += line + '\n';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// 섹션별 키워드 — 배치 텍스트에 이 단어가 있으면 해당 규칙 섹션 포함
const CHUNK_KEYWORDS = {
  '화면 표기': ['메뉴', '버튼', '탭', '대화상자', '아이콘', '단축키', '인터페이스', '화면', '팝업'],
  '띄어쓰기': ['보조용언', '의존명사', '때', '것', '수', '만큼', '대로', '뿐', '채', '듯', '단위'],
  '맞춤법': ['되다', '돼', '돼야', '됩니다', '로서', '로써', '데', '든지', '던지'],
  '사이시옷': ['최댓값', '최솟값', '사이시옷', '합성어', '성공률'],
  '문장 부호': ['쌍점', '괄호', '가운뎃점', '줄표', '빗금', '마침표', '물음표', '쉼표'],
  '고유 명사': ['인명', '지명', '브랜드', '상표', '전문용어', '전문 용어', '키캡', '키보드', 'macOS', 'iOS', '운영체제'],
  '외래어': ['외래어', '워크플로', '애플리케이션', '컨텐츠', '콘텐츠', '섀도', '메시지', '리더십'],
  '교정 작업 원칙': [],  // 항상 포함
  '충돌 규칙': [],        // 항상 포함
};

function findRelevantChunks(chunks, batchText) {
  const result = [];
  for (const chunk of chunks) {
    const h = chunk.heading;
    // 항상 포함
    if (h.includes('교정 작업 원칙') || h.includes('충돌 규칙') || h.includes('부록')) {
      result.push(chunk);
      continue;
    }
    // 헤딩 키워드 매칭
    let matched = false;
    for (const [section, kws] of Object.entries(CHUNK_KEYWORDS)) {
      if (!h.includes(section)) continue;
      if (kws.length === 0 || kws.some(kw => batchText.includes(kw))) {
        matched = true;
        break;
      }
    }
    if (matched) result.push(chunk);
  }
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

// 기본 규칙 초기화 (페이지 로드 시)
rulesChunks = parseRulesIntoChunks(DEFAULT_RULES_MD);

// ──────────────────────────────────────────────
// 언어 검사 (Claude API)
// ──────────────────────────────────────────────
const SYS = `You are a professional Korean book editor with expertise in publishing proofreading (교정교열). Analyze the given text thoroughly and return ONLY valid JSON.

Check ALL of the following issue types:

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
- 외래어표기오류: Foreign word spelling errors per Korean standard orthography (e.g., 컨텐츠→콘텐츠, 메세지→메시지, 리더쉽→리더십)
- 용어불일치: Inconsistent term notation — same concept written differently in the SAME batch
- 문체불일치: Inconsistent register — mixing formal and informal within same section

LOW severity (검토 권장):
- 문단연결불량: Poor paragraph transition — abrupt topic shift without connector, missing transitional sentence
- 중의적표현: Ambiguous expression — sentence with two or more valid interpretations
- 저자확인필요: Content requiring author verification — specific statistics/numbers without source, technical claims that could be incorrect, dates/versions that may be outdated

Return ONLY raw JSON — no markdown fences, no explanation, no text before or after:
{"issues":[{"type":"유형명","severity":"high|medium|low","found":"exact verbatim substring from text (≤120 chars; up to 150 chars for 윤문필요·내용보완필요·사실오류)","description":"한국어 설명 — 왜 문제인지 구체적으로","suggestion":"완성된 수정 내용 (길이 제한 없음 — 아래 지침 참조)"}]}
If no issues found: {"issues":[]}
DO NOT wrap in markdown code blocks. Start your response directly with { and end with }.

Type names to use exactly: 비문, 주술호응오류, 잘못된표현, 사실오류, 번역체, 일본식표현, 수동태과용, 외래어표기오류, 용어불일치, 문체불일치, 윤문필요, 내용보완필요, 문단연결불량, 중의적표현, 저자확인필요, 띄어쓰기, 맞춤법

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

▶ 기타 유형:
  - 문단연결불량: 삽입할 전환 문장을 직접 작성
  - 번역체/일본식표현: 자연스러운 한국어로 바꾼 문장 제시
  - 외래어표기오류: 표준 표기 단어
  - 비문/주술호응오류/잘못된표현: 교정된 완성 문장
  - 저자확인필요: 저자에게 보낼 구체적인 확인 질문

- Report every issue you find — do not skip borderline cases. Be aggressive: if a sentence is hard to read, report it. If explanation is thin, report it.

HALLUCINATION PREVENTION (CRITICAL):
- "found" MUST be copied character-by-character from the input text. Do NOT paraphrase, summarize, or reconstruct.
- If you cannot find the exact phrase in the text, do NOT report the issue. Omit it entirely.
- Do NOT invent issues that do not exist in the given text.
- Every "found" value must pass this test: it appears verbatim in the input text you received.`;

async function callClaude(apiKey, text, rulesContext = '') {
  const systemPrompt = rulesContext
    ? SYS + '\n\n---\n## 📋 1팀 교정 규칙 (아래 규칙을 우선 적용할 것)\n' + rulesContext
    : SYS;
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role:'user', content: text }]
  });

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: payload,
    });
  } catch (e) {
    throw new Error(
      'API 연결 실패 (네트워크 오류)\n\n' +
      '인터넷 연결을 확인하거나 잠시 후 다시 시도하세요.\n' +
      `(${e.message})`
    );
  }

  if (!res.ok) {
    let errMsg = `API 오류 ${res.status}`;
    try {
      const j = await res.json();
      if (j.error?.message) errMsg += ': ' + j.error.message;
    } catch {}
    if (res.status === 401 || res.status === 403) errMsg += '\n→ API 키가 올바른지 확인하세요.';
    else if (res.status === 429) errMsg += '\n→ 요청 한도 초과 — 잠시 후 재시도하세요.';
    throw new Error(errMsg);
  }
  const data = await res.json();
  return data.content[0].text;
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
function getCtx(text, found, window=90) {
  if (!found || !text) return { before:'', target:found, after:'' };
  const idx = text.indexOf(found);
  if (idx === -1) return { before:'', target:'', after: text.slice(0, window) + '…' };
  const bs = Math.max(0, idx - window);
  const ae = Math.min(text.length, idx + found.length + window);
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
    if (keyInput) apiKey = keyInput.value.trim();
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

  allIssues = [...surfaceIssues, ...linguisticIssues, ...structuralIssues].map(iss => {
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
const SURFACE_TYPES   = ['조사중복','단어반복','이중수동','중복군더더기','접속사중복','한자남용','문장부호오류','불필요한공백','외래어오표기','용어불일치','번역체','일본식표현','내용보완필요','문단연결불량'];
const LINGUISTIC_TYPES= ['번역체','일본식표현','수동태과용','비문','주술호응오류','잘못된표현','외래어표기오류','문체불일치','윤문필요','중의적표현','띄어쓰기','맞춤법'];
const CONTENT_TYPES   = ['내용보완필요','문단연결불량','사실오류'];
const AUTHOR_TYPES    = ['저자확인필요'];
const STRUCT_TYPES    = ['목차불일치'];

// 편집 카테고리 현황 정의 — 항상 표시 (없음 포함)
const EDIT_CATEGORIES = [
  { key:'맞춤법비문',  label:'맞춤법·비문',    sub:'문법·조사·이중수동·반복·띄어쓰기',
    types:['비문','주술호응오류','잘못된표현','조사중복','단어반복','이중수동','중복군더더기','접속사중복','한자남용','문장부호오류','불필요한공백','띄어쓰기','맞춤법'] },
  { key:'윤문필요',    label:'윤문 필요',     sub:'어색한 문장·중의적 표현',
    types:['윤문필요','중의적표현'] },
  { key:'번역체',      label:'번역체·일본식',  sub:'부자연스러운 번역투·수동',
    types:['번역체','일본식표현','수동태과용'] },
  { key:'내용보완필요', label:'내용 보완 필요', sub:'설명 부족·출처 누락',
    types:['내용보완필요'] },
  { key:'문단연결불량', label:'문단 연결 불량', sub:'전환 불량·연결어 누락',
    types:['문단연결불량'] },
  { key:'표기불일치',  label:'표기 불일치',    sub:'용어·문체 혼재',
    types:['용어불일치','문체불일치'] },
  { key:'외래어',      label:'외래어 표기',    sub:'표준 표기 오류',
    types:['외래어표기오류','외래어오표기'] },
  { key:'사실오류',    label:'사실 오류',      sub:'텍스트 내 모순',
    types:['사실오류'] },
  { key:'저자확인필요', label:'저자 확인 필요', sub:'수치·인용·기술 검증 필요',
    types:['저자확인필요'] },
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
        <button class="btn-resolve" onclick="p8_toggleResolve(${globalIdx},this)">${isResolved ? '취소' : '해결됨'}</button>
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
  btn.textContent = resolved ? '취소' : '해결됨';
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
  window.p8_filterByTypes = p8_filterByTypes;
  window.p8_filterByCatIdx = p8_filterByCatIdx;
  window.p8_filterUncategorized = p8_filterUncategorized;
  window.p8_copyChip = p8_copyChip;
  window.p8_onClearThisCache = p8_onClearThisCache;
  window.p8_rerunAI = p8_rerunAI;
})();
