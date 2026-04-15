(function(){

// ──────────────────────────────────────────────
// PDF.js 설정
// ──────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let selectedFile = null;
let allIssues = [];
let currentSev = 'all';
let currentFileKey = null;
let pdfDoc = null;       // PDF.js document (페이지 뷰어용)
let pvCurrentPage = 1;  // 현재 뷰어 페이지
let pvRendering = false; // 렌더링 중 플래그
let rulesChunks = null;  // 교정 규칙 청크 (RAG)

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

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
const ALLOWED_EXTS = new Set(['pdf','docx','hwpx','hwp','doc']);
function isAllowedFile(f) {
  return f && ALLOWED_EXTS.has(f.name.split('.').pop().toLowerCase());
}

dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (isAllowedFile(f)) setFile(f);
  else alert('지원하지 않는 파일 형식입니다.\nPDF / DOCX / HWPX / HWP / DOC 파일을 업로드해 주세요.');
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(f) {
  selectedFile = f;
  currentFileKey = getCacheKey(f);
  document.getElementById('p8_fileName').textContent = '✓ ' + f.name;
  document.getElementById('p8_btnStart').disabled = false;
  renderCacheInfo(f);
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
      cur.items.push(it);
      cur.items.sort((a, b) => a.transform[4] - b.transform[4]);
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
 * HWP binary (OLE Compound Document) — 제한적 텍스트 추출.
 * UTF-16LE 한글 문자 연속 구간을 스캔한다.
 */
async function extractHWP(file) {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  // OLE 시그니처 확인: D0 CF 11 E0
  const isOLE = bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
  if (!isOLE) throw new Error('HWP 파일 형식을 인식할 수 없습니다.\n한컴오피스에서 "다른 이름으로 저장 → HWPX(.hwpx)"로 변환 후 업로드해 주세요.');

  // UTF-16LE 한글(AC00-D7A3) + 기본 ASCII 구간 스캔
  const words = [];
  let run = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const cp = bytes[i] | (bytes[i + 1] << 8);
    if ((cp >= 0xAC00 && cp <= 0xD7A3) ||  // 한글 음절
        (cp >= 0x0020 && cp <= 0x007E) ||  // 기본 ASCII 출력 가능 문자
        cp === 0x000A || cp === 0x000D) {   // 개행
      run += String.fromCodePoint(cp);
    } else {
      if (run.replace(/\s/g, '').length >= 4) words.push(run.trim());
      run = '';
    }
  }
  if (run.replace(/\s/g, '').length >= 4) words.push(run.trim());

  const fullText = words.join(' ');
  if (!fullText || fullText.replace(/\s/g, '').length < 50) {
    throw new Error('HWP(바이너리) 파일에서 텍스트를 추출하지 못했습니다.\n한컴오피스에서 "다른 이름으로 저장 → HWPX(.hwpx)"로 변환 후 업로드해 주세요.');
  }
  const extracted = textToExtracted(file.name, fullText);
  extracted.limitedExtraction = true; // 결과 화면에 경고 표시용
  return extracted;
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
  [/[가-힣]+(되어지|어지다|받아지|쓰여지)/g, '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
  [/[가-힣]+되어\s*지고/g,                   '이중수동', 'high', '단일 수동 또는 능동으로 변환'],
];

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
    for (const [pat, type, severity, sugg] of PARTICLE_PATTERNS) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(text)) !== null) {
        issues.push({ type, severity, page, found: m[0],
          suggestion: sugg, description: `조사 중복: '${m[0]}'` });
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

    // 이중 수동
    addAll(DOUBLE_PASSIVE_PATS, text, page);
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
    for (const m of (text.matchAll(/\b([A-Za-z][A-Za-z0-9\-]{2,})\b/g) || [])) {
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
      // 문장 첫 글자 대문자(1회성) 제외 — 2회 이상만 플래그
      if (pages.length < 2) continue;

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
- 사실오류: Factually incorrect or self-contradictory statements within the text

MEDIUM severity (개선 필요):
- 번역체: Unnatural translation-style Korean — ~함에 있어서, ~에 대해서, ~의 경우에 있어서, ~라고 하는, ~적(的) 남용, ~를 통해서
- 일본식표현: Japanese-influenced — ~에 있어서, ~로 인하여, ~에 의한, ~하는 바이다, ~(이)라고 하는
- 수동태과용: Excessive passive — -어지다/-되어지다(high), ~에 의해 ~되다, ~받다 남용
- 외래어표기오류: Foreign word spelling errors per Korean standard orthography (e.g., 컨텐츠→콘텐츠, 메세지→메시지, 리더쉽→리더십)
- 용어불일치: Inconsistent term notation — same concept written differently in the SAME batch (Old vs old, GitHub vs Github, API vs api, English term vs Korean transliteration for the same word e.g. "Old" vs "올드", "Model" vs "모델" used interchangeably). Report each pair once with the dominant form as canonical.
- 문체불일치: Inconsistent register — mixing formal(합쇼체/하십시오체) with informal(해요체), or literary(문어체) with colloquial(구어체) within same section

LOW severity (윤문 권장):
- 윤문필요: Polishing needed — awkward rhythm, convoluted sentence structure, weak word choice, sentences that are technically correct but read poorly
- 내용보완필요: Content supplement needed — incomplete explanation leaving readers confused, missing context, abrupt topic change, logical gap between sentences
- 문단연결불량: Poor paragraph transition — abrupt topic shift without connector, missing transitional sentence
- 중의적표현: Ambiguous expression — sentence with two or more valid interpretations
- 저자확인필요: Content requiring author verification — specific statistics/numbers without source, technical claims that could be incorrect, dates/versions that may be outdated, code snippets or formulas needing validation, references to studies/papers without citation, product names or specs that may have changed

Return ONLY this JSON (no markdown, no explanation):
{"issues":[{"type":"유형명","severity":"high|medium|low","found":"exact verbatim phrase from text, ≤60 chars","description":"한국어 설명 — 왜 문제인지","suggestion":"수정된 한국어 표현 또는 개선 방향"}]}
If no issues found: {"issues":[]}

Type names to use exactly: 비문, 주술호응오류, 잘못된표현, 사실오류, 번역체, 일본식표현, 수동태과용, 외래어표기오류, 용어불일치, 문체불일치, 윤문필요, 내용보완필요, 문단연결불량, 중의적표현, 저자확인필요

IMPORTANT:
- "found" must be an exact substring from the input text
- Report every issue you find — do not skip borderline cases
- For 내용보완필요, "found" is the sentence/phrase that needs supplement, "suggestion" explains what to add`;

async function callClaude(apiKey, text, rulesContext = '') {
  const systemPrompt = rulesContext
    ? SYS + '\n\n---\n## 📋 1팀 교정 규칙 (아래 규칙을 우선 적용할 것)\n' + rulesContext
    : SYS;
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role:'user', content: text }]
  });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-client-side-api-key-flag': 'my-test-application'
    },
    body: payload
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}

async function checkLinguistic(extracted, apiKey, onBatch) {
  const issues = [];
  const pages = extracted.pages.filter(p => p.text.trim().length >= 50);
  const batchSize = 5;
  const total = Math.ceil(pages.length / batchSize);
  for (let i = 0; i < pages.length; i += batchSize) {
    const batchIdx = Math.floor(i / batchSize) + 1;
    if (onBatch) onBatch(batchIdx, total);
    const batch = pages.slice(i, i + batchSize);
    const txt = batch.map(p => `\n[p.${p.page}]\n${p.text.slice(0, 2000)}\n`).join('');
    // RAG: 배치 텍스트와 관련된 규칙 섹션 선택
    const relevant = rulesChunks ? findRelevantChunks(rulesChunks, txt) : [];
    const rulesCtx = relevant.length > 0 ? relevant.map(c => c.text).join('\n') : '';
    try {
      const raw = await callClaude(apiKey, '교정:\n' + txt, rulesCtx);
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        for (const iss of (parsed.issues || [])) {
          const found = iss.found || '';
          iss.page = batch.find(p => found && p.text.includes(found))?.page || batch[0].page;
          issues.push(iss);
        }
      }
    } catch(e) {
      console.warn('Batch error:', e.message);
    }
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
  const fileKey = currentFileKey || getCacheKey(selectedFile);

  show('loadingPanel');
  setBar(5);

  // ── 캐시 확인 ──────────────────────────────────
  const cached = getCache(fileKey);
  const useCache = !!cached;
  const apiProvided = apiKey.startsWith('sk-ant-');
  // 캐시 있고 AI도 이미 실행된 경우: AI 재실행 불필요
  // 캐시 있지만 AI 미실행이고 지금 키 제공: AI만 실행
  const skipAI = useCache && cached.aiWasRun && apiProvided === false;
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
      const pages = extracted.pages.filter(p => p.text.trim().length >= 50);
      const totalBatches = Math.ceil(pages.length / 5);
      linguisticIssues = await checkLinguistic(extracted, apiKey,
        (batchIdx) => {
          const pct = 60 + Math.round((batchIdx / totalBatches) * 30);
          setBar(pct);
          document.getElementById('p8_step4-detail').textContent =
            `배치 ${batchIdx}/${totalBatches} 분석 중…`;
        });
      stepDone(4, `${linguisticIssues.length}건`);
      document.getElementById('p8_step4-detail').textContent =
        linguisticIssues.length ? `${linguisticIssues.length}건 발견` : '이슈 없음';
      aiUsed = true;
    } catch(e) {
      stepError(4, 'API 오류: ' + e.message);
      aiSkipped = true;
      // 이전 캐시 AI 결과 있으면 폴백
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
const SURFACE_TYPES   = ['조사중복','단어반복','이중수동','중복군더더기','접속사중복','한자남용','문장부호오류','불필요한공백','외래어오표기','용어불일치'];
const LINGUISTIC_TYPES= ['번역체','일본식표현','수동태과용','비문','주술호응오류','잘못된표현','외래어표기오류','문체불일치','윤문필요','중의적표현'];
const CONTENT_TYPES   = ['내용보완필요','문단연결불량','사실오류'];
const AUTHOR_TYPES    = ['저자확인필요'];
const STRUCT_TYPES    = ['목차불일치'];

// 편집 카테고리 현황 정의 — 항상 표시 (없음 포함)
const EDIT_CATEGORIES = [
  { key:'윤문필요',    label:'윤문 필요',     sub:'어색한 문장·표현',      types:['윤문필요'] },
  { key:'내용보완필요', label:'내용 보완 필요', sub:'설명 부족·맥락 누락',    types:['내용보완필요'] },
  { key:'문단연결불량', label:'문단 연결 불량', sub:'전환 불량·연결어 누락',   types:['문단연결불량'] },
  { key:'저자확인필요', label:'저자 확인 필요', sub:'수치·인용·기술 검증 필요', types:['저자확인필요'] },
  { key:'비문',        label:'비문',          sub:'문법 오류·구조 파손',     types:['비문','주술호응오류'] },
  { key:'번역체',      label:'번역체·일본식',  sub:'부자연스러운 표현',       types:['번역체','일본식표현'] },
  { key:'외래어',      label:'외래어 표기',    sub:'표준 표기 오류',         types:['외래어표기오류','외래어오표기'] },
  { key:'용어불일치',  label:'용어 표기 불일치', sub:'대소문자·영/한 혼재',   types:['용어불일치'] },
  { key:'사실오류',    label:'사실 오류',      sub:'텍스트 내 모순',         types:['사실오류'] },
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
      ${aiUsed ? '<span class="chip" style="background:#2980b9">AI 검사 완료</span>' : ''}
      ${getCache(currentFileKey || '') ? '<span class="chip" style="background:#27ae60" title="캐시 재사용">⚡ 캐시</span>' : ''}
    </div>`;

  // 편집 카테고리 현황 렌더링 — 항상 표시, 없으면 "없음"
  const catGrid = document.getElementById('p8_catGrid');
  catGrid.innerHTML = EDIT_CATEGORIES.map(cat => {
    const count = allIssues.filter(i => cat.types.includes(i.type)).length;
    // 카테고리 내 모든 유형이 표면/구조 검사 전용일 때만 "AI 불필요". 하나라도 AI 유형이면 isAiType.
    // 단, 표면 유형이 섞인 혼합 카테고리는 표면 결과는 이미 있으므로 isAiType=false 처리.
    const hasOnlySurface = cat.types.every(t => SURFACE_TYPES.includes(t) || STRUCT_TYPES.includes(t));
    const isAiType = !hasOnlySurface && !cat.types.some(t => SURFACE_TYPES.includes(t) || STRUCT_TYPES.includes(t));
    const notChecked = isAiType && !aiUsed;

    if (notChecked) {
      return `<div class="cat-box not-checked" title="API 키 입력 시 검사됩니다">
        <div class="cat-name">${cat.label}</div>
        <div class="cat-count">불필요</div>
        <div class="cat-sub">${cat.sub}</div>
      </div>`;
    }
    if (count === 0) {
      return `<div class="cat-box no-issues" onclick="p8_filterByTypes(${JSON.stringify(cat.types)})">
        <div class="cat-name">${cat.label}</div>
        <div class="cat-count">✓ 없음</div>
        <div class="cat-sub">${cat.sub}</div>
      </div>`;
    }
    return `<div class="cat-box has-issues" onclick="p8_filterByTypes(${JSON.stringify(cat.types)})">
      <div class="cat-name">${cat.label}</div>
      <div class="cat-count">${count}건</div>
      <div class="cat-sub">${cat.sub}</div>
    </div>`;
  }).join('');

  document.getElementById('p8_aiNotice').style.display = aiSkipped ? '' : 'none';

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
  el.innerHTML = issues.map((iss, idx) => {
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
    return `<div class="issue-card sev-${sev}" id="card-${idx}">
      <div class="card-head">
        <span class="badge-page" onclick="p8_renderPage(${iss.page})" title="페이지 ${iss.page} 보기">p.${iss.page}</span>
        <span class="badge-type ${typeClass}">${esc(iss.type)}</span>
        <span class="badge-sev ${sev}">${sevLabel}</span>
        <button class="btn-resolve" onclick="p8_toggleResolve(${idx},this)">해결됨</button>
      </div>
      <div class="ctx-line">${ctxHtml}</div>
      <div class="fix-row">
        <span class="fix-arrow">→</span>
        <span class="fix-text">${esc(iss.suggestion || '')}</span>
      </div>
      ${iss.description ? `<div class="card-desc">${esc(iss.description)}</div>` : ''}
    </div>`;
  }).join('');
}

function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function p8_toggleResolve(idx, btn) {
  const card = document.getElementById('card-'+idx);
  card.classList.toggle('resolved');
  btn.textContent = card.classList.contains('resolved') ? '취소' : '해결됨';
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

// ── 탭 복원: 세션 스토리지에 저장된 결과가 있으면 즉시 복원 ──────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
    const raw = sessionStorage.getItem('pf_session');
    if (!raw) return;
    const sess = JSON.parse(raw);
    if (!sess || !Array.isArray(sess.allIssues) || !sess.extracted) return;

    allIssues = sess.allIssues;
    currentFileKey = sess.currentFileKey || null;

    // 요약 바 재구성
    const ext = sess.extracted;
    const aiUsedS  = !!sess.aiUsed;
    const aiSkipS  = !!sess.aiSkipped;
    renderResults(
      { filename: ext.filename, total_pages: ext.total_pages },
      aiUsedS,
      aiSkipS
    );
    show('resultPanel');
  } catch (e) { /* 무시 */ }
});

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
  window.p8_filterSevChip = p8_filterSevChip;
  window.p8_filterByTypes = p8_filterByTypes;
  window.p8_onClearThisCache = p8_onClearThisCache;
})();
