(function(){

try {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      location.href.replace(/\/[^/]*$/, '/') + 'libs/pdf.worker.min.js';
  }
} catch(e) { console.warn('panel9: PDF.js 초기화 실패:', e.message); }

// ─── State ───────────────────────────────────────────────────────────────────
let tocFile = null, bodyFile = null;
let allRows = [];       // comparison rows
let activeFilter = 'all';

// ─── File handling ────────────────────────────────────────────────────────────
function p9_onFile(e, which) {
  const f = e.target.files[0];
  if (!f) return;
  setFile(which, f);
}
function p9_onDrag(e, zoneId) {
  e.preventDefault();
  var el = document.getElementById(zoneId) || document.getElementById('p9_' + zoneId);
  if (el) el.classList.add('active');
}
function p9_offDrag(zoneId) {
  var el = document.getElementById(zoneId) || document.getElementById('p9_' + zoneId);
  if (el) el.classList.remove('active');
}
function p9_onDrop(e, which) {
  e.preventDefault();
  p9_offDrag(which === 'toc' ? 'p9_tocZone' : 'p9_bodyZone');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const name = f.name.toLowerCase();
  // 본문은 PDF만, 목차는 PDF 또는 TXT 허용
  if (which === 'body' && !name.endsWith('.pdf')) return;
  if (which === 'toc' && !name.endsWith('.pdf') && !name.endsWith('.txt')) return;
  setFile(which, f);
}
function setFile(which, f) {
  if (which === 'toc') {
    tocFile = f;
    document.getElementById('p9_tocName').textContent = '✓ ' + f.name;
    document.getElementById('p9_tocZone').classList.add('has-file');
  } else {
    bodyFile = f;
    document.getElementById('p9_bodyName').textContent = '✓ ' + f.name;
    document.getElementById('p9_bodyZone').classList.add('has-file');
  }
  document.getElementById('p9_startBtn').disabled = !(tocFile && bodyFile);
}

// ─── Panel switching ─────────────────────────────────────────────────────────
function showPanel(id) {
  ['uploadPanel','loadingPanel','resultPanel'].forEach(p => {
    const el = document.getElementById('p9_' + p);
    if (el) el.style.display = (p === id) ? 'block' : 'none';
  });
}

// ─── Step helpers ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 's1', label: '목차 파일 로딩', sub: 'PDF.js로 목차 파일을 여는 중' },
  { id: 's2', label: '목차 항목 추출', sub: '북마크 및 텍스트에서 목차 항목 파싱' },
  { id: 's3', label: '본문 파일 로딩', sub: 'PDF.js로 본문 파일을 여는 중' },
  { id: 's4', label: '본문 텍스트 추출', sub: '페이지별 텍스트 및 하단 인쇄 번호 감지' },
  { id: 's5', label: '목차 ↔ 본문 비교', sub: '제목 텍스트 매칭 및 페이지 차이 계산' },
];

function initSteps() {
  const sl = document.getElementById('p9_stepList');
  sl.innerHTML = STEPS.map(s => `
    <div class="step-item" id="${s.id}">
      <div class="step-icon pending" id="${s.id}_icon">○</div>
      <div class="step-text">
        <strong>${s.label}</strong>
        <span id="${s.id}_msg">${s.sub}</span>
      </div>
    </div>`).join('');
}

async function tick() { await new Promise(r => setTimeout(r, 0)); }

function stepRun(id, msg) {
  const el = document.getElementById(id);
  const ic = document.getElementById(id + '_icon');
  const ms = document.getElementById(id + '_msg');
  el.className = 'step-item running';
  ic.className = 'step-icon running'; ic.textContent = '↻';
  if (msg) ms.textContent = msg;
}
function stepDone(id, msg) {
  const el = document.getElementById(id);
  const ic = document.getElementById(id + '_icon');
  const ms = document.getElementById(id + '_msg');
  el.className = 'step-item done';
  ic.className = 'step-icon done'; ic.textContent = '✓';
  if (msg) ms.textContent = msg;
}
function stepError(id, msg) {
  const el = document.getElementById(id);
  const ic = document.getElementById(id + '_icon');
  const ms = document.getElementById(id + '_msg');
  el.className = 'step-item error';
  ic.className = 'step-icon error'; ic.textContent = '✗';
  if (msg) ms.textContent = msg;
}

// ─── PDF extraction ───────────────────────────────────────────────────────────
async function loadPDF(file) {
  const ab = await file.arrayBuffer();
  return await pdfjsLib.getDocument({ data: ab }).promise;
}

/** Extract TOC entries from a PDF.
 *  Strategy: 1) PDF outline (bookmarks)  2) text pattern fallback */
async function extractTOC(pdf) {
  const entries = [];

  // 1) Outline / bookmarks
  let outline = null;
  try { outline = await pdf.getOutline(); } catch(e) {}

  if (outline && outline.length > 0) {
    // Flatten outline recursively
    function flatten(items, level) {
      for (const item of items) {
        entries.push({
          title: item.title ? item.title.trim() : '',
          level,
          page: null,       // will resolve below
          dest: item.dest,
          bold: item.bold || false,
          italic: item.italic || false,
        });
        if (item.items && item.items.length > 0) flatten(item.items, level + 1);
      }
    }
    flatten(outline, 1);

    // Resolve destinations → page numbers
    for (const e of entries) {
      if (!e.dest) continue;
      try {
        let dest = e.dest;
        if (typeof dest === 'string') {
          dest = await pdf.getDestination(dest);
        }
        if (dest && dest[0]) {
          const idx = await pdf.getPageIndex(dest[0]);
          e.page = idx + 1;
        }
      } catch(_) {}
    }
    return entries;
  }

  // 2) Text fallback — scan all pages for chapter/section patterns
  return await extractHeadingsFromPDF(pdf, true);
}

/** Extract headings from body PDF by font size + bold heuristics */
async function extractHeadingsFromPDF(pdf, isTocMode = false) {
  const headings = [];
  const numPages = pdf.numPages;

  // Collect all text items with style info across pages
  // First pass: find typical body font size
  let fontSizes = [];
  for (let p = 1; p <= Math.min(numPages, 20); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    page.cleanup();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      if (item.transform) {
        const fs = Math.abs(item.transform[0]);
        if (fs > 5 && fs < 100) fontSizes.push(fs);
      }
    }
  }
  fontSizes.sort((a, b) => a - b);
  const bodyFontSize = fontSizes[Math.floor(fontSizes.length * 0.5)] || 10;

  // Second pass: extract headings where font is significantly larger than body
  const H1_THRESH = bodyFontSize * 1.5;
  const H2_THRESH = bodyFontSize * 1.25;
  const H3_THRESH = bodyFontSize * 1.1;

  for (let p = 1; p <= numPages; p++) {
    if (p % 10 === 0) await new Promise(r => setTimeout(r, 0)); // UI 스레드 양보
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    page.cleanup();

    // Group items by Y position (same line)
    const lines = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push(item);
    }

    // Sort lines top-to-bottom
    const sortedY = [...lines.keys()].sort((a, b) => b - a);

    for (const y of sortedY) {
      const lineItems = lines.get(y);
      const text = lineItems.map(i => i.str).join('').trim();
      if (!text || text.length < 2 || text.length > 120) continue;

      // Font size of dominant item in line
      const fs = Math.abs(lineItems[0].transform[0]);
      const fontName = (lineItems[0].fontName || '').toLowerCase();
      const isBold = fontName.includes('bold') || fontName.includes('heavy') ||
                     fontName.includes('black') || lineItems[0].bold;

      // 한국 출판 5계층: 파트/장(1) → 챕터/절(2) → 중절 N.N(3) → 소절 N.N.N(4) → 소소절 N.N.N.N(5)
      const isPartPat    = /^(Part|PART|파트|장)\s*\d+|^제\s*\d+\s*[편부]/i.test(text);
      const isChapPat    = /^(Chapter|CHAPTER|챕터)\s*\d+|^제\s*\d+\s*[장절]/i.test(text);
      const isSoSoPat    = /^\d+[.-]\d+[.-]\d+[.-]\d+/.test(text);  // N.N.N.N → 소소절
      const isSubSecPat  = /^\d+[.-]\d+[.-]\d+\s/.test(text);       // N.N.N   → 소절
      const isSecPat     = /^\d+[.-]\d+\s/.test(text);               // N.N     → 중절
      const isKorNumPat  = /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(text);
      const isChapterPat = isPartPat || isChapPat || isKorNumPat ||
                           /^\d+\.\s+[가-힣]/.test(text);

      let level = 0;
      if      (isPartPat)                                            level = 1;
      else if (isChapPat || fs >= H1_THRESH)                        level = 2;
      else if (isSoSoPat)                                           level = 5;
      else if (isSubSecPat)                                         level = 4;
      else if (isSecPat)                                            level = 3;
      else if (fs >= H2_THRESH || (isBold && isChapterPat))         level = 2;
      else if (fs >= H3_THRESH || (isBold && fs >= bodyFontSize * 1.05)) level = 3;
      else if (isChapterPat)                                        level = 2;

      if (level > 0) {
        // Avoid duplicates (same text on consecutive lines)
        const last = headings[headings.length - 1];
        if (last && normForMatch(last.title) === normForMatch(text) && p - last.page <= 1) continue;

        headings.push({ title: text, level, page: p, fontSize: fs, bold: isBold });
      }
    }
  }

  // In TOC mode: also look for "페이지 숫자" patterns (table of content text lines)
  if (isTocMode) {
    const tocPattern = /^(.+?)\s+(\d+)\s*$/;
    const tocEntries = headings.filter(h => tocPattern.test(h.title));
    if (tocEntries.length > 0) {
      for (const e of tocEntries) {
        const m = e.title.match(tocPattern);
        e.title = m[1].trim();
        e.pageRef = parseInt(m[2]);
        e.page = e.pageRef; // page는 인쇄 페이지 번호 (책 하단 숫자), PDF 인덱스 아님
      }
    }
  }

  return headings;
}

/**
 * 목차 한 줄에서 제목과 페이지 번호를 추출한다.
 * 규칙: 리더 문자(·, ., …, _, -, 공백 연속) 이후 맨 끝 숫자가 페이지 번호.
 * 예) "1.1 DBMS 개요 ················ 5" → { title: "1.1 DBMS 개요", page: 5 }
 */
function parseTocLine(raw) {
  const cleaned = raw
    .replace(/[\u00B7\u00B8\u2022\u22EF\u2026\u22C5·•]{2,}/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/_{2,}/g, ' ')
    .replace(/-{4,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const m = cleaned.match(/^(.+?)\s+(\d{1,4})\s*$/);
  if (!m) return null;
  const title = m[1].trim();
  const page = parseInt(m[2], 10);
  if (title.length < 2 || page < 1 || page > 9999) return null;
  return { title, page };
}

/**
 * 텍스트 파일(.txt)에서 목차 항목을 파싱한다.
 * 각 줄에 parseTocLine()을 적용하여 제목과 페이지 번호를 추출한다.
 * 예) "Chapter 01 멀티 에이전트란 ............... 3" → { title, page: 3, level: 2 }
 */
async function parseTocFromTextFile(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = parseTocLine(line);
    if (parsed) {
      const { title, page: pageNum } = parsed;

      // 5계층 레벨 결정
      let level = 0;
      if      (/^(Part|PART|파트|장)\s*\d+|^제\s*\d+\s*[편부]/i.test(title))  level = 1;
      else if (/^(Chapter|CHAPTER|챕터)\s*\d+|^제\s*\d+\s*[장절]/i.test(title)) level = 2;
      else if (/^\d+[.-]\d+[.-]\d+[.-]\d+/.test(title))                         level = 5; // 소소절
      else if (/^\d+[.-]\d+[.-]\d+/.test(title))                                 level = 4; // 소절
      else if (/^\d+[.-]\d+/.test(title))                                         level = 3; // 중절
      else                                                                         level = 3;

      entries.push({ title, page: pageNum, level });

    } else {
      // 페이지 번호 없는 파트/챕터 줄은 섹션 헤더로 포함
      if      (/^(Part|PART|파트|장)\s*\d+|^제\s*\d+\s*[편부]/i.test(line))  entries.push({ title: line, page: 0, level: 1 });
      else if (/^(Chapter|CHAPTER|챕터)\s*\d+|^제\s*\d+\s*[장절]/i.test(line)) entries.push({ title: line, page: 0, level: 2 });
    }
  }

  return entries;
}

/** Also try to extract TOC from text by scanning for dotted/spaced number patterns */
async function extractTOCFromText(pdf) {
  const entries = [];
  const numPages = Math.min(pdf.numPages, 15); // TOC usually at start

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    page.cleanup();

    // Build full page text
    const rawItems = content.items.filter(i => i.str && i.str.trim());
    if (rawItems.length === 0) continue;

    // Group by Y
    const lines = new Map();
    for (const item of rawItems) {
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, { items: [], y });
      lines.get(y).items.push(item);
    }

    const sortedLines = [...lines.values()].sort((a, b) => b.y - a.y);

    // 이 페이지에 목차 패턴 줄이 2개 이상인지 확인
    const pageMatchCount = sortedLines.filter(line => {
      const text = line.items.map(i => i.str).join('').replace(/\s+/g, ' ').trim();
      return parseTocLine(text) !== null;
    }).length;
    const fullPageText = sortedLines.map(l => l.items.map(i => i.str).join('')).join(' ');
    const hasKeyword = /Chapter|Part|목차|챕터|파트/i.test(fullPageText);
    if (pageMatchCount < 2 && !hasKeyword) continue;

    for (const line of sortedLines) {
      const text = line.items.map(i => i.str).join('').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 2) continue;

      const parsed = parseTocLine(text);
      if (parsed) {
        const { title, page: pageNum } = parsed;
        if (title.length <= 100) {
          const fs = Math.abs(line.items[0].transform[0]);
          const indent = line.items[0].transform[4];

          // 5계층 레벨 우선 결정 (0이면 나중에 들여쓰기로 보정)
          let level = 0;
          if      (/^(Part|PART|파트|장)\s*\d+|^제\s*\d+\s*[편부]/i.test(title))  level = 1;
          else if (/^(Chapter|CHAPTER|챕터)\s*\d+|^제\s*\d+\s*[장절]/i.test(title)) level = 2;
          else if (/^\d+[.-]\d+[.-]\d+[.-]\d+/.test(title))                         level = 5; // 소소절
          else if (/^\d+[.-]\d+[.-]\d+\s/.test(title))                               level = 4; // 소절
          else if (/^\d+[.-]\d+\s/.test(title))                                       level = 3; // 중절

          entries.push({ title, page: pageNum, level, fontSize: fs, indent, sourcePage: p });
        }
      } else if (/^(Part|PART|파트|Chapter|CHAPTER|챕터)\s*\d+/i.test(text)) {
        // 페이지 번호 없는 Part/Chapter 제목 줄도 포함
        const fs = Math.abs(line.items[0].transform[0]);
        const indent = line.items[0].transform[4];
        const level = /^(Part|PART|파트)/i.test(text) ? 1 : 2;
        entries.push({ title: text, page: 0, level, fontSize: fs, indent, sourcePage: p });
      }
    }
  }

  // Post-process: 레벨 미결정(=0) 항목만 들여쓰기로 레벨 보정
  if (entries.length > 0) {
    const undecided = entries.filter(e => e.level === 0);
    const indents = [...new Set(undecided.map(e => Math.round(e.indent / 8) * 8))].sort((a,b)=>a-b);
    for (const e of undecided) {
      const ri = Math.round(e.indent / 8) * 8;
      e.level = Math.min(5, (indents.indexOf(ri) + 1) || 3);
    }
    // 나머지 레벨 0은 3으로 설정
    entries.forEach(e => { if (e.level === 0) e.level = 3; });
  }

  return entries;
}

// ─── 텍스트 정규화 (비교용) ──────────────────────────────────────────────────
// 특수문자 제거, 점→공백, 대소문자 무시, 공백 정규화
function normForMatch(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[·•\-–—_~`'"«»「」『』【】〔〕（）()\[\]{}]/g, ' ') // 특수문자 → 공백
    .replace(/\./g, ' ')   // 점 → 공백 ("1.1" → "1 1")
    .replace(/[^\sa-z0-9가-힣]/g, ' ') // 그 외 비문자 → 공백
    .replace(/\s+/g, ' ')
    .trim();
}

// 제목이 페이지 텍스트 안에 존재하는지 확인
// 1) 공백 포함 substring 매칭
// 2) 공백 제거 후 substring 매칭 (PDF가 공백 없이 텍스트를 붙여 저장한 경우 대응)
function titleFoundInPage(title, pageText) {
  const nt = normForMatch(title);
  const np = normForMatch(pageText);
  if (!nt || !np) return false;

  // 1) 공백 포함 직접 매칭
  if (np.includes(nt)) return true;

  // 2) 공백 제거 매칭 (4글자 이상)
  const ntNoSp = nt.replace(/\s/g, '');
  const npNoSp = np.replace(/\s/g, '');
  if (ntNoSp.length >= 4 && npNoSp.includes(ntNoSp)) return true;

  // 3) 핵심 단어 매칭 — 제목의 단어 중 3글자 이상인 단어의 60% 이상이 페이지에 포함되면 매칭
  const words = nt.split(/\s+/).filter(w => w.length >= 2);
  if (words.length >= 2) {
    const matchedWords = words.filter(w => np.includes(w) || npNoSp.includes(w.replace(/\s/g, '')));
    const ratio = matchedWords.length / words.length;
    if (ratio >= 0.6 && matchedWords.length >= 2) return true;
  }

  return false;
}

// ─── 본문 전체 텍스트 추출 (페이지별) ────────────────────────────────────────
// 각 페이지의 전체 텍스트를 저장하면서, 하단/상단 영역 단독 숫자를 인쇄 페이지 번호로 감지한다.
// 반환: { byPdfPage, byPrintedPage, totalPages, pdfOffset }
//   pdfOffset = pdfIndex - printedPage (가장 많이 관찰된 값, 전문 페이지 수)
async function extractBodyPageTexts(pdf, onProgress) {
  const byPdfPage = {};
  const byPrintedPage = {};
  const offsetCounts = {};   // offset → 감지 횟수
  const total = pdf.numPages;

  for (let p = 1; p <= total; p++) {
    // 5페이지마다 UI 스레드에 제어권 반환
    if (p % 5 === 0) {
      if (onProgress) onProgress(p, total);
      await new Promise(r => setTimeout(r, 0));
    }

    let pg;
    try {
      pg = await pdf.getPage(p);
    } catch(e) {
      console.warn(`페이지 ${p} 로드 실패:`, e);
      byPdfPage[p] = '';
      continue;
    }

    try {
      const vp = pg.getViewport({ scale: 1 });
      const content = await pg.getTextContent({ includeMarkedContent: false });
      const items = content.items.filter(i => i.str && i.str.trim());

      // 인쇄 페이지 번호: 하단 12% + 좌측 20%/우측 80% 끝 영역의 단독 숫자
      // 조판 도서의 페이지 번호는 하단 좌측 끝(짝수) 또는 우측 끝(홀수)에 위치
      const bottomThr = vp.height * 0.12;
      const leftThr = vp.width * 0.20;
      const rightThr = vp.width * 0.80;
      let printedPage = null;
      for (const item of items) {
        const y = item.transform[5]; // PDF좌표계: 0=하단
        const x = item.transform[4]; // PDF좌표계: 0=좌측
        if (y > bottomThr) continue; // 하단 12% 밖이면 스킵
        const trimmed = item.str.trim();
        if (!/^\d+$/.test(trimmed)) continue;
        // X좌표: 좌측 끝 또는 우측 끝에 있어야 페이지 번호
        if (x <= leftThr || x >= rightThr) {
          const n = parseInt(trimmed, 10);
          if (n >= 1 && n <= 9999) printedPage = n;
        }
      }

      const pageText = items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      byPdfPage[p] = pageText;

      if (printedPage !== null) {
        // 같은 인쇄번호가 여러 페이지에 나타날 수 있으므로(부록·재시작) 텍스트 누적
        byPrintedPage[printedPage] = (byPrintedPage[printedPage] || '') + ' ' + pageText;
        // 오프셋 집계: pdfIndex - printedPage
        const off = p - printedPage;
        offsetCounts[off] = (offsetCounts[off] || 0) + 1;
      }
    } finally {
      pg.cleanup();
    }
  }

  // 가장 많이 관찰된 오프셋 = 전문 페이지 수(표지·목차 등)
  let pdfOffset = 0;
  if (Object.keys(offsetCounts).length > 0) {
    pdfOffset = parseInt(
      Object.entries(offsetCounts).sort((a, b) => b[1] - a[1])[0][0], 10
    );
  }

  return { byPdfPage, byPrintedPage, totalPages: total, pdfOffset };
}

// ─── Comparison logic ─────────────────────────────────────────────────────────
// bodyData = { byPdfPage, byPrintedPage, totalPages, pdfOffset }
// pdfOffset = pdfIndex - printedPage (전문 페이지 수, 자동 감지)
function compareEntries(tocEntries, bodyData) {
  const { byPdfPage, byPrintedPage, totalPages, pdfOffset = 0 } = bodyData;
  const printedKeys = Object.keys(byPrintedPage).map(Number);
  const hasPrintedMap = printedKeys.length > 0;
  const maxPrintedPage = hasPrintedMap ? Math.max.apply(null, printedKeys) : 0;
  const minPrintedPage = hasPrintedMap ? Math.min.apply(null, printedKeys) : 0;
  console.log('[panel9] 비교 설정: totalPages=' + totalPages + ', offset=' + pdfOffset +
    ', 인쇄번호=' + (hasPrintedMap ? minPrintedPage + '~' + maxPrintedPage : '없음') +
    ', PDF페이지텍스트=' + Object.keys(byPdfPage).length + '개');

  function nearPages(center, range, max) {
    const result = [];
    for (let d = 0; d <= range; d++) {
      if (center + d >= 1 && center + d <= max) result.push(center + d);
      if (d > 0 && center - d >= 1 && center - d <= max) result.push(center - d);
    }
    return result;
  }

  // 본문 전체 텍스트 (페이지 번호 무시하고 전체에서 검색하는 폴백용)
  var allBodyText = '';
  for (var pk = 1; pk <= totalPages; pk++) {
    allBodyText += ' ' + (byPdfPage[pk] || '');
  }

  const rows = [];

  for (const te of tocEntries) {
    if (!te.title || te.title.length < 2) continue;

    const tocPage = te.page || null;

    if (!tocPage) {
      rows.push({
        tocTitle: te.title, tocPage: null, tocLevel: te.level,
        bodyTitle: null, bodyPage: null,
        pageDiff: null, status: 'no-page',
      });
      continue;
    }

    let foundPage = null;

    // 디버그: 처음 3개 항목의 매칭 과정 출력
    if (rows.length < 3) {
      var estPdfDbg = tocPage + pdfOffset;
      var printedText = byPrintedPage[tocPage] ? byPrintedPage[tocPage].slice(0, 80) : '(없음)';
      var pdfText = byPdfPage[estPdfDbg] ? byPdfPage[estPdfDbg].slice(0, 80) : '(없음)';
      console.log('[panel9] 매칭 #' + (rows.length+1) + ': "' + te.title.slice(0, 30) + '" tocPage=' + tocPage +
        '\n  인쇄맵[' + tocPage + ']=' + printedText +
        '\n  PDF[' + estPdfDbg + ']=' + pdfText +
        '\n  norm제목="' + normForMatch(te.title) + '"');
    }

    // 1) 인쇄 페이지 번호 맵 검색 (±5 범위, max = 인쇄 페이지 최대값)
    if (hasPrintedMap) {
      for (const p of nearPages(tocPage, 5, maxPrintedPage)) {
        if (byPrintedPage[p] && titleFoundInPage(te.title, byPrintedPage[p])) {
          foundPage = p;
          break;
        }
      }
    }

    // 2) PDF 인덱스 폴백: pdfOffset 적용
    if (foundPage === null) {
      const estPdf = tocPage + pdfOffset;
      for (const p of nearPages(estPdf, 5, totalPages)) {
        if (titleFoundInPage(te.title, byPdfPage[p] || '')) {
          foundPage = p - pdfOffset;
          if (foundPage < 1) { foundPage = null; continue; }
          break;
        }
      }
    }

    // 3) 전체 본문 텍스트 폴백 — 페이지 특정 불가하지만 존재 여부는 확인
    if (foundPage === null && titleFoundInPage(te.title, allBodyText)) {
      // 제목이 본문 어딘가에 존재 → 페이지 번호는 모르지만 match로 간주
      // 실제 페이지를 찾기 위해 전체 페이지 순회
      for (var sp = 1; sp <= totalPages; sp++) {
        if (titleFoundInPage(te.title, byPdfPage[sp] || '')) {
          foundPage = hasPrintedMap ? (sp - pdfOffset) : sp;
          if (foundPage < 1) foundPage = sp;
          break;
        }
      }
    }

    if (foundPage !== null) {
      const pageDiff = Math.abs(tocPage - foundPage);
      rows.push({
        tocTitle: te.title,
        tocPage,
        tocLevel: te.level,
        bodyTitle: te.title,
        bodyPage: foundPage,
        pageDiff,
        status: pageDiff === 0 ? 'match' : 'page-mismatch',
      });
    } else {
      rows.push({
        tocTitle: te.title,
        tocPage,
        tocLevel: te.level,
        bodyTitle: null,
        bodyPage: null,
        pageDiff: null,
        status: 'missing-body',
      });
    }
  }

  return rows;
}

// ─── Main flow ────────────────────────────────────────────────────────────────
async function p9_startCompare() {
  console.log('[panel9] 비교 시작 — toc:', tocFile?.name, 'body:', bodyFile?.name);
  showPanel('loadingPanel');
  initSteps();
  await tick();

  let tocEntries = [], bodyData = { byPdfPage: {}, byPrintedPage: {}, totalPages: 0 };

  const isTocTxt = tocFile.name.toLowerCase().endsWith('.txt');

  try {
    // Step 1: Load TOC (PDF 또는 TXT)
    stepRun('s1', isTocTxt ? '텍스트 파일 감지 — PDF 로딩 건너뜀' : '목차 PDF 열기 중...');
    await tick();
    let tocPdf = null;
    if (isTocTxt) {
      stepDone('s1', `텍스트 파일 확인 완료: ${tocFile.name}`);
    } else {
      try {
        tocPdf = await loadPDF(tocFile);
        stepDone('s1', `목차 파일 로드 완료 (${tocPdf.numPages}페이지)`);
      } catch(e) {
        stepError('s1', '목차 파일 로드 실패: ' + e.message);
        return;
      }
    }

    // Step 2: Extract TOC entries
    stepRun('s2', '목차 항목 추출 중...');
    await tick();
    try {
      if (isTocTxt) {
        // 텍스트 파일 직접 파싱
        tocEntries = await parseTocFromTextFile(tocFile);
        const withPage = tocEntries.filter(e => e.page > 0).length;
        stepDone('s2', `텍스트 파싱 완료 — ${tocEntries.length}개 항목 (페이지 있음: ${withPage}개)`);
      } else {
        // PDF: 북마크 → 텍스트 패턴 → 헤딩 폴백
        tocEntries = await extractTOC(tocPdf);
        if (tocEntries.length < 3) {
          const textEntries = await extractTOCFromText(tocPdf);
          if (textEntries.length > tocEntries.length) tocEntries = textEntries;
        }
        if (tocEntries.length < 2) {
          tocEntries = await extractHeadingsFromPDF(tocPdf, true);
        }
        const withPage = tocEntries.filter(e => e.page).length;
        stepDone('s2', `목차 항목 ${tocEntries.length}개 추출 (페이지 있음: ${withPage}개)`);
      }
    } catch(e) {
      stepError('s2', '목차 추출 실패: ' + e.message);
      tocEntries = [];
    }

    // Step 3: Load body pdf
    stepRun('s3', '본문 PDF 열기 중...');
    await tick();
    let bodyPdf;
    try {
      bodyPdf = await loadPDF(bodyFile);
      stepDone('s3', `본문 파일 로드 완료 (${bodyPdf.numPages}페이지)`);
    } catch(e) {
      stepError('s3', '본문 파일 로드 실패: ' + e.message);
      return;
    }

    // Step 4: 본문 전체 텍스트 + 하단 인쇄 페이지 번호 추출
    // 각 페이지의 전체 텍스트와 함께, 하단 12% 영역의 단독 숫자를 인쇄 페이지 번호로 감지한다.
    stepRun('s4', '본문 페이지 텍스트 및 인쇄 번호 감지 중...');
    await tick();
    try {
      bodyData = await extractBodyPageTexts(bodyPdf, (cur, total) => {
        const pct = Math.round((cur / total) * 100);
        const s4msg = document.getElementById('s4_msg');
        if (s4msg) s4msg.textContent = `본문 텍스트 추출 중... ${cur}/${total}페이지 (${pct}%)`;
      });
      const detectedPrinted = Object.keys(bodyData.byPrintedPage).length;
      const offsetInfo = bodyData.pdfOffset !== 0
        ? `, 전문 ${bodyData.pdfOffset}p 오프셋 감지`
        : '';
      const msg = detectedPrinted > 0
        ? `본문 ${bodyData.totalPages}페이지 처리 완료 (인쇄 번호 감지: ${detectedPrinted}페이지${offsetInfo})`
        : `본문 ${bodyData.totalPages}페이지 처리 완료 (인쇄 번호 미감지 — PDF 인덱스 사용)`;
      stepDone('s4', msg);
    } catch(e) {
      stepError('s4', '본문 추출 실패: ' + e.message);
      bodyData = { byPdfPage: {}, byPrintedPage: {}, totalPages: 0 };
    }

    // Step 5: Compare — TOC 인쇄 페이지 번호 → 본문 해당 페이지 텍스트 내 제목 검색
    stepRun('s5', '비교 분석 중...');
    await tick();
    console.log('[panel9] TOC 항목:', tocEntries.length, '본문 페이지:', bodyData.totalPages, 'offset:', bodyData.pdfOffset);
    allRows = compareEntries(tocEntries, bodyData);
    const matched = allRows.filter(r => r.status === 'match').length;
    const total   = allRows.filter(r => r.tocPage).length;
    console.log('[panel9] 비교 결과:', allRows.length, '행, 일치:', matched, '/', total);
    stepDone('s5', `비교 완료 — 일치 ${matched}/${total}건`);

    await new Promise(r => setTimeout(r, 400));
    renderResults();

    // 탭 이동 후 복원을 위해 세션 상태 저장
    try {
      sessionStorage.setItem('toc_session', JSON.stringify({
        allRows,
        tocFileName: tocFile ? tocFile.name : '',
        bodyFileName: bodyFile ? bodyFile.name : '',
      }));
    } catch (e) { /* 무시 */ }

  } catch(e) {
    console.error('[panel9] 비교 오류:', e);
    alert('처리 중 오류가 발생했습니다:\n' + e.message + (e.stack ? '\n\n' + e.stack.split('\n').slice(0,3).join('\n') : ''));
    showPanel('uploadPanel');
  }
}

// ─── Render results ───────────────────────────────────────────────────────────
function renderResults() {
  // Counts (no-page 행 제외한 실질 비교 항목)
  const cnt = {
    match: 0, 'missing-body': 0, 'page-mismatch': 0,
  };
  for (const r of allRows) if (r.status !== 'no-page') cnt[r.status] = (cnt[r.status] || 0) + 1;
  const total = allRows.filter(r => r.status !== 'no-page').length;
  const matchPct = total > 0 ? Math.round(((cnt.match || 0) / total) * 100) : 0;

  // ── Match ring ──
  const circumference = 188.5; // 2πr, r=30
  const offset = circumference * (1 - matchPct / 100);
  const ringEl = document.getElementById('p9_ringFill');
  if (ringEl) {
    ringEl.style.strokeDashoffset = offset;
    ringEl.style.stroke = matchPct >= 90 ? '#2ecc71' : matchPct >= 70 ? '#e67e22' : '#e74c3c';
  }
  const matchPctEl = document.getElementById('p9_matchPct');
  if (matchPctEl) matchPctEl.innerHTML = `${matchPct}%<span>일치율</span>`;

  // ── Header meta ──
  document.getElementById('p9_resultTitle').textContent = '목차 비교 결과';
  document.getElementById('p9_resultMeta').textContent =
    `전체 ${total}개 항목 중 ${cnt.match || 0}개 일치`;
  const fileTagsEl = document.getElementById('p9_fileTags');
  if (fileTagsEl) fileTagsEl.innerHTML = `
    <span class="file-tag toc">📋 ${tocFile ? tocFile.name : ''}</span>
    <span class="file-tag body">📖 ${bodyFile ? bodyFile.name : ''}</span>
  `;

  // ── Summary cards ──
  document.getElementById('p9_summaryGrid').innerHTML = `
    <div class="stat-card info">
      <div class="stat-icon">📋</div>
      <div class="stat-body">
        <div class="stat-num">${total}</div>
        <div class="stat-label">전체 항목</div>
      </div>
    </div>
    <div class="stat-card ok">
      <div class="stat-icon">✅</div>
      <div class="stat-body">
        <div class="stat-num">${cnt.match || 0}</div>
        <div class="stat-label">일치</div>
      </div>
    </div>
    <div class="stat-card warn">
      <div class="stat-icon">⚡</div>
      <div class="stat-body">
        <div class="stat-num">${cnt['page-mismatch']||0}</div>
        <div class="stat-label">페이지 불일치</div>
      </div>
    </div>
    <div class="stat-card err">
      <div class="stat-icon">🔍</div>
      <div class="stat-body">
        <div class="stat-num">${cnt['missing-body']||0}</div>
        <div class="stat-label">누락</div>
      </div>
    </div>
  `;

  // ── Filter bar ──
  const filters = [
    { key: 'all',          label: '전체',        cnt: total,                                           cls: 'all' },
    { key: 'match',        label: '일치',         cnt: cnt.match||0,                                   cls: 'match' },
    { key: 'page-mismatch',label: '페이지 불일치', cnt: cnt['page-mismatch']||0,    cls: 'page-mismatch' },
    { key: 'missing-body', label: '본문에 없음',   cnt: cnt['missing-body']||0,     cls: 'missing-body' },
  ];
  document.getElementById('p9_filterBar').innerHTML = filters.map(f =>
    `<button class="filter-btn ${f.cls} ${activeFilter === f.key ? 'active' : ''}"
      onclick="p9_setFilter('${f.key}')">${f.label} <span class="cnt">${f.cnt}</span></button>`
  ).join('');

  renderTable();
  showPanel('resultPanel');
}

function p9_setFilter(key) {
  activeFilter = key;
  renderResults();
}

// 레벨 체계: 1=파트/장  2=챕터/절  3=중절  4=소절  5=소소절
const LEVEL_LABEL = { 1: '파트/장', 2: '챕터/절', 3: '중절', 4: '소절', 5: '소소절' };
function levelBadge(level, cls = '') {
  if (!level) return '<span style="color:#ccc">—</span>';
  const lv = Math.min(level, 5);
  const label = LEVEL_LABEL[lv] || `L${lv}`;
  return `<span class="level-badge level-${lv}${cls ? ' ' + cls : ''}" title="레벨 ${lv}: ${label}">${label}</span>`;
}

function pageCell(page, cls = '') {
  if (page === null || page === undefined)
    return `<span class="page-chip none">—</span>`;
  return `<span class="page-chip ${cls || 'ok'}">p.${page}</span>`;
}

function statusPill(status) {
  const map = {
    'match': ['pill-match', '✓ 일치'],
    'missing-body': ['pill-missing-body', '✗ 본문 없음'],
    'page-mismatch': ['pill-page-mismatch', '⚡ 페이지 차이'],
    'no-page': ['', '— 페이지 없음'],
  };
  const [cls, label] = map[status] || ['', status];
  return `<span class="status-pill ${cls}">${label}</span>`;
}

// escHtml — shared/app.js의 전역 escHtml 사용 (", ' 치환 포함)

function renderTable() {
  const filtered = activeFilter === 'all'
    ? allRows.filter(r => r.status !== 'no-page')
    : activeFilter === 'page-mismatch'
      ? allRows.filter(r => r.status === 'page-mismatch')
      : activeFilter === 'missing-body'
        ? allRows.filter(r => r.status === 'missing-body')
        : allRows.filter(r => r.status === activeFilter);

  if (filtered.length === 0) {
    document.getElementById('p9_compTable').innerHTML =
      `<tr><td colspan="7"><div class="empty-state">
        <div class="es-icon">🎉</div>
        <p>해당 유형의 항목이 없습니다.</p>
      </div></td></tr>`;
    return;
  }

  document.getElementById('p9_compTable').innerHTML = filtered.map((r, i) => {
    const tocTitleHtml = r.tocTitle ? escHtml(r.tocTitle) : '<span style="color:#ccc">—</span>';
    const bodyTitleHtml = r.bodyTitle ? escHtml(r.bodyTitle) : '<span style="color:#ccc">—</span>';

    const pageCls = r.status === 'page-mismatch' ? 'bad' : (r.status === 'match' ? 'ok' : '');

    let noteHtml = '';
    if (r.status === 'page-mismatch' && r.pageDiff !== null) {
      noteHtml = `<div class="note-text">페이지 차이: ${r.pageDiff}페이지</div>`;
    }

    return `<tr class="status-${r.status}">
      <td class="row-num">${i + 1}</td>
      <td>${levelBadge(r.tocLevel)}</td>
      <td><div class="cell-title">${tocTitleHtml}</div>${noteHtml}</td>
      <td>${pageCell(r.tocPage, pageCls)}</td>
      <td><div class="cell-title">${bodyTitleHtml}</div></td>
      <td>${pageCell(r.bodyPage, pageCls)}</td>
      <td>${statusPill(r.status)}</td>
    </tr>`;
  }).join('');
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function p9_reset() {
  tocFile = null; bodyFile = null; allRows = []; activeFilter = 'all';
  document.getElementById('p9_tocName').textContent = '파일을 선택하거나 드래그하세요';
  document.getElementById('p9_bodyName').textContent = '파일을 선택하거나 드래그하세요';
  document.getElementById('p9_tocZone').classList.remove('has-file','active');
  document.getElementById('p9_bodyZone').classList.remove('has-file','active');
  document.getElementById('p9_tocInput').value = '';
  document.getElementById('p9_bodyInput').value = '';
  document.getElementById('p9_startBtn').disabled = true;
  // 세션 상태 삭제
  try { sessionStorage.removeItem('toc_session'); } catch(e) {}
  showPanel('uploadPanel');
}

// ── 초기 상태: 로딩/결과 패널 숨기기 + 세션 복원 ──────────────
document.addEventListener('DOMContentLoaded', () => {
  // 초기 상태 — 업로드 패널만 표시
  showPanel('uploadPanel');

  // 세션 복원
  try {
    const raw = sessionStorage.getItem('toc_session');
    if (!raw) return;
    const sess = JSON.parse(raw);
    if (!sess || !Array.isArray(sess.allRows) || !sess.allRows.length) return;

    allRows = sess.allRows;
    if (sess.tocFileName)  tocFile  = { name: sess.tocFileName };
    if (sess.bodyFileName) bodyFile = { name: sess.bodyFileName };

    renderResults();
  } catch (e) { /* 무시 */ }
});

  window.p9_onFile = p9_onFile;
  window.p9_onDrag = p9_onDrag;
  window.p9_offDrag = p9_offDrag;
  window.p9_onDrop = p9_onDrop;
  window.p9_startCompare = p9_startCompare;
  window.p9_reset = p9_reset;
  window.p9_setFilter = p9_setFilter;
})();
