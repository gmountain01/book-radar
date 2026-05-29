(function(){
'use strict';

// ──────────────────────────────────────────────
// panel21 — 내지 시안
// ──────────────────────────────────────────────

var root = document.getElementById('panel21');
if (!root) return;

/* ── 상수 ── */
var FORMATS = {
  '46변형': {w:183, h:235, label:'46배변형판 183x235'},
  'A5':     {w:148, h:210, label:'A5 148x210'},
  '신국판': {w:152, h:225, label:'신국판 152x225'},
  '46판':   {w:128, h:188, label:'46판 128x188'},
  '크라운': {w:176, h:248, label:'크라운판 176x248'},
  '사용자': {w:183, h:235, label:'사용자 지정'}
};

var THEMES = {
  classic: {name:'클래식', title:'#1a1a2e', accent:'#16213e', body:'#333', codeBg:'#f5f5f0', noteBg:'#f9f8f2', noteBd:'#d4d0c0'},
  modern:  {name:'모던',  title:'#2d3436', accent:'#0984e3', body:'#2d3436', codeBg:'#f0f4f8', noteBg:'#ebf5ff', noteBd:'#b3d4f7'},
  minimal: {name:'미니멀', title:'#000',    accent:'#666',    body:'#333', codeBg:'#f7f7f7', noteBg:'#f5f5f5', noteBd:'#ddd'},
  tech:    {name:'기술서', title:'#1B1F3B', accent:'#4361ee', body:'#2b2d42', codeBg:'#f8f9fa', noteBg:'#eef0ff', noteBd:'#c0c6f5'},
  essay:   {name:'에세이', title:'#3d3b40', accent:'#8b5cf6', body:'#44403c', codeBg:'#faf8ff', noteBg:'#f5f0ff', noteBd:'#d4c4f7'}
};

var FONTS = [
  {value:'Noto Sans KR', label:'Noto Sans KR (고딕)'},
  {value:'Noto Serif KR', label:'Noto Serif KR (명조)'},
  {value:'Pretendard', label:'Pretendard (고딕)'},
  {value:'KoPubWorld돋움체', label:'KoPubWorld 돋움'},
  {value:'KoPubWorld바탕체', label:'KoPubWorld 바탕'}
];

var _file = null;
var _parsed = null; // {elements, stats}
var _pages = [];    // generated HTML pages
var _curPage = 0;
var _curTheme = 'tech';

/* ── HTML — 심플 UI: 업로드만 하면 자동 처리 ── */

root.innerHTML = '<div class="p21-main">'
  // 상단 — 업로드 + 상태 + 액션 바
  +'<div class="p21-topbar" id="p21_topbar">'
  +  '<div class="p21-topbar-left">'
  +    '<h2>📐 내지 시안</h2>'
  +    '<label class="p21-upload-btn" for="p21_fileInput">원고 업로드 (.docx / .hwpx)</label>'
  +    '<input type="file" id="p21_fileInput" accept=".docx,.hwpx" style="display:none">'
  +    '<span class="p21-fname" id="p21_fname"></span>'
  +  '</div>'
  +  '<div class="p21-topbar-right" id="p21_actions" style="display:none">'
  +    '<div class="p21-stats" id="p21_stats"></div>'
  +    '<button class="p21-action-btn" onclick="p21_openPreview()">새 창에서 보기</button>'
  +    '<button class="p21-action-btn" onclick="p21_printPreview()">🖨️ 인쇄</button>'
  +    '<button class="p21-action-btn primary" onclick="p21_downloadHtml()">💾 HTML 다운로드</button>'
  +  '</div>'
  +'</div>'
  // 진행 상태
  +'<div class="p21-progress" id="p21_progress" style="display:none">'
  +  '<div class="p21-progress-bar"><div class="p21-progress-fill" id="p21_progressFill"></div></div>'
  +  '<div class="p21-progress-text" id="p21_progressText">준비 중...</div>'
  +'</div>'
  // 빈 상태
  +'<div class="p21-empty" id="p21_empty">'
  +  '<div class="p21-empty-icon">📐</div>'
  +  '<div class="p21-empty-title">내지 시안 자동 생성</div>'
  +  '<div class="p21-empty-desc">DOCX 또는 HWPX 파일을 업로드하면<br>원고를 분석하여 출판용 내지 디자인을 자동으로 생성합니다.</div>'
  +  '<label class="p21-empty-upload" for="p21_fileInput">파일 선택</label>'
  +'</div>'
  // 미리보기 영역 (완료 후)
  +'<div class="p21-result" id="p21_result" style="display:none">'
  +  '<div class="p21-result-msg">새 창에서 내지 시안이 열렸습니다. 열리지 않았다면 위 "새 창에서 보기"를 클릭하세요.</div>'
  +'</div>'
+'</div>';

/* ── DOM refs ── */
var $fileInput = document.getElementById('p21_fileInput');
var $fname = document.getElementById('p21_fname');

/* ── 파일 업로드 → 자동 실행 ── */
$fileInput.addEventListener('change', function(e){
  if(e.target.files && e.target.files[0]) _handleFile(e.target.files[0]);
});

// 드래그앤드롭 전체 패널에서 지원
root.addEventListener('dragover', function(e){e.preventDefault();});
root.addEventListener('drop', function(e){
  e.preventDefault();
  if(e.dataTransfer.files && e.dataTransfer.files[0]) _handleFile(e.dataTransfer.files[0]);
});

function _handleFile(f){
  var ext = f.name.split('.').pop().toLowerCase();
  if(ext !== 'docx' && ext !== 'hwpx'){
    alert('DOCX 또는 HWPX 파일만 지원합니다.');
    return;
  }
  _file = f;
  $fname.textContent = f.name + ' (' + (f.size/1024).toFixed(0) + 'KB)';
  _parsed = null;
  // 자동 실행
  p21_generate();
}

/* ── 기본 설정 (사이드바 제거됨 — 46배변형판 기본) ── */
function _getSettings(){
  return {
    pageW: 183, pageH: 235,
    mt: 20, mb: 20, ml: 20, mr: 20, mi: 5,
    bodyFont: 'Pretendard',
    bodySize: 10,
    lineH: 170,
    titleFont: 'Pretendard',
    titleSize: 24,
    theme: THEMES[_curTheme]
  };
}

/* ── 진행 상태 표시 ── */
function _setProgress(pct, text){
  var bar = document.getElementById('p21_progress');
  var fill = document.getElementById('p21_progressFill');
  var txt = document.getElementById('p21_progressText');
  if(bar) bar.style.display = 'block';
  if(fill) fill.style.width = pct + '%';
  if(txt) txt.textContent = text;
}

/* ══════════════════════════════════════════════
   공통 헬퍼
   ══════════════════════════════════════════════ */

function _esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _runsToHtml(runs){
  if(!runs || !runs.length) return '';
  return runs.map(function(r){
    var s = _esc(r.text);
    if(r.bold) s = '<b>'+s+'</b>';
    if(r.italic) s = '<em>'+s+'</em>';
    return s;
  }).join('');
}

/* ── 요소 분류 유틸 ── */

var RE_PART = /^(PART\s+\d+|제\s*\d+\s*부)/i;
var RE_CHAPTER = /^(제?\s*\d+\s*장|chapter\s*\d+)/i;
var RE_SPECIAL = /^(연습문제|실습|부록|Appendix|인터뷰|Q&A)/i;
var RE_TIP = /^(TIP|NOTE|참고|주의|경고|노트|팁|CAUTION|WARNING|IMPORTANT|중요)\s*[:：]/i;
var RE_PROMPT = /^(프롬프트|Prompt|명령어|Command)\s*[:：]/i;
var RE_QUOTE_START = /^>\s/;
var RE_NUM_LIST = /^\d+[.)]\s/;
var RE_BULLET_LIST = /^[-·•▶▪★☆※]\s/;
var RE_MONO = /consolas|courier|monospace|fira\s*code|d2coding|source\s*code/i;

function _classifyPara(pStyle, fullText, runs, hasNumPr, numFmt, hasDrawing, imgSrc){
  var txt = fullText.trim();
  var ps = pStyle.toLowerCase();
  // 볼드 여부 (전체 run이 볼드이면 제목 후보)
  var allBold = runs.length > 0 && runs.every(function(r){return r.bold;});
  // 짧은 텍스트 + 전체 볼드 = 제목 가능성
  var shortBold = allBold && txt.length < 80;

  // 1. image
  if(hasDrawing || imgSrc) return 'figure';
  // 2. part-tobira
  if(/^(tocheading|heading\s*0)$/i.test(ps) || RE_PART.test(txt)) return 'part-tobira';
  // 3. chapter-tobira (heading1, title, 또는 한글 스타일)
  if(/heading\s*1|^title$|^제목/i.test(ps)) return 'chapter-tobira';
  if(RE_CHAPTER.test(txt)) return 'chapter-tobira';
  // 3b. 한글 Word "제목 1", "1" 스타일
  if(/^(제목\s*1|제목1|title\s*1|1)$/i.test(ps)) return 'chapter-tobira';
  // 4. special-page
  if(/^(exercise|부록|appendix|별면|실습)/i.test(ps) || RE_SPECIAL.test(txt)) return 'special-page';
  // 5. section-header — 스타일 기반
  if(/heading\s*[2-9]|^subtitle|^제목\s*[2-9]|^제목[2-9]/i.test(ps)) return 'section-header';
  // 5b. 텍스트 패턴 기반 절/중 제목 감지
  // ◆ ... ◆ 패턴 = 섹션 구분 제목
  if(/^◆\s*.+\s*◆\s*$/.test(txt)) return 'section-header';
  // ◆ 이렇게 하면 망해요 ◆ 등 (특별 섹션)
  if(/^◆/.test(txt) && txt.length < 80) return 'section-header';
  // ◇ 소제목
  if(/^◇\s/.test(txt) && txt.length < 100) return 'section-header';
  // <N분> 실습 제목
  if(/^<\d+분>/.test(txt) || /^&lt;\d+분&gt;/.test(txt)) return 'section-header';
  // [절], [중] 접두어 (이미 Heading2/3으로 잡히지만 스타일 없는 경우 대비)
  if(/^\[절\]|\[중\]|\[소\]/.test(txt)) return 'section-header';
  // 숫자 패턴 (1.1, 1-1 등) + 볼드
  if(shortBold && /^(\d+[-.)]\s|\d+\.\d+\s|CHAPTER|PART|제\s*\d|[A-Z]{2,}\s)/i.test(txt)) return 'section-header';
  // 짧고 전체 볼드 = 제목
  if(shortBold && txt.length > 2 && txt.length < 50) return 'section-header';
  // STEP N, Step N 패턴
  if(/^(STEP|Step)\s*\d/i.test(txt) && txt.length < 80) return 'section-header';
  // 6. code
  var isCode = RE_MONO.test(runs.map(function(r){return r.font;}).join(' '));
  if(!isCode && /^(code|listing|소스코드|코드|소스|source)/i.test(ps)) isCode = true;
  if(isCode) return 'code';
  // 7. tip-box
  if(/^(note|tip|warning|caution|참고|주의|팁|노트|important|중요)/i.test(ps)) return 'tip-box';
  if(RE_TIP.test(txt)) return 'tip-box';
  // 8. prompt-box
  if(/^(prompt|quote|인용|blockquote)/i.test(ps)) return 'prompt-box';
  if(RE_PROMPT.test(txt) || RE_QUOTE_START.test(txt)) return 'prompt-box';
  // 9. numbered-list
  if(hasNumPr && numFmt === 'decimal') return 'numbered-list';
  if(RE_NUM_LIST.test(txt)) return 'numbered-list';
  // 10. bullet-list
  if(hasNumPr && numFmt === 'bullet') return 'bullet-list';
  if(hasNumPr && !numFmt) return 'bullet-list'; // numFmt 판별 실패 시 블릿 기본
  if(RE_BULLET_LIST.test(txt)) return 'bullet-list';
  // 11. body-text
  return 'body-text';
}

function _headingLevel(pStyle, txt){
  var m = pStyle.match(/heading\s*(\d)/i);
  if(m) return parseInt(m[1]);
  if(/^(subtitle|제목\s*2|제목2)/i.test(pStyle)) return 2;
  if(/^(제목\s*3|제목3)/i.test(pStyle)) return 3;
  // 텍스트 패턴으로 레벨 추정
  if(txt){
    if(/^◆\s*.+\s*◆\s*$/.test(txt)) return 2; // ◆ 대제목 ◆
    if(/^◆/.test(txt)) return 2;
    if(/^◇/.test(txt)) return 3; // ◇ 소제목
    if(/^<\d+분>/.test(txt) || /^&lt;\d+분&gt;/.test(txt)) return 3; // <N분> 실습
    if(/^(STEP|Step)\s*\d/i.test(txt)) return 3;
  }
  return 0;
}

/* ── 연속 동일 type 병합 ── */
function _mergeConsecutive(elements){
  var merged = [];
  for(var i=0; i<elements.length; i++){
    var el = elements[i];
    var prev = merged.length ? merged[merged.length-1] : null;
    // 코드 블록 병합
    if(el.type === 'code' && prev && prev.type === 'code'){
      prev.text += '\n' + el.text;
      continue;
    }
    // 숫자 목록 병합
    if(el.type === 'numbered-list'){
      if(prev && prev.type === 'numbered-list'){
        prev.items.push({text:el.text, runs:el.runs});
      } else {
        merged.push({type:'numbered-list', items:[{text:el.text, runs:el.runs}]});
      }
      continue;
    }
    // 블릿 목록 병합
    if(el.type === 'bullet-list'){
      if(prev && prev.type === 'bullet-list'){
        prev.items.push({text:el.text, runs:el.runs});
      } else {
        merged.push({type:'bullet-list', items:[{text:el.text, runs:el.runs}]});
      }
      continue;
    }
    // 팁 박스 연속 병합 (같은 라벨)
    if(el.type === 'tip-box' && prev && prev.type === 'tip-box'){
      prev.text += '\n' + el.text;
      if(el.runs) prev.runs = (prev.runs||[]).concat(el.runs);
      continue;
    }
    // 프롬프트 박스 연속 병합
    if(el.type === 'prompt-box' && prev && prev.type === 'prompt-box'){
      prev.text += '\n' + el.text;
      if(el.runs) prev.runs = (prev.runs||[]).concat(el.runs);
      continue;
    }
    merged.push(el);
  }
  return merged;
}

/* ── stats 계산 ── */
function _calcStats(elements){
  var s = {parts:0, chapters:0, sections:0, figures:0, tables:0, codes:0,
           tips:0, prompts:0, numberedLists:0, bulletLists:0, bodyTexts:0, specialPages:0};
  for(var el of elements){
    switch(el.type){
      case 'part-tobira': s.parts++; break;
      case 'chapter-tobira': s.chapters++; break;
      case 'section-header': s.sections++; break;
      case 'figure': s.figures++; break;
      case 'table': s.tables++; break;
      case 'code': s.codes++; break;
      case 'tip-box': s.tips++; break;
      case 'prompt-box': s.prompts++; break;
      case 'numbered-list': s.numberedLists++; break;
      case 'bullet-list': s.bulletLists++; break;
      case 'body-text': s.bodyTexts++; break;
      case 'special-page': s.specialPages++; break;
    }
  }
  return s;
}

/* ══════════════════════════════════════════════
   DOCX 파싱 — word/document.xml에서 12가지 요소 추출
   ══════════════════════════════════════════════ */

async function _parseDocx(file){
  if(typeof JSZip==='undefined') throw new Error('JSZip 라이브러리가 필요합니다.');
  var ab = await file.arrayBuffer();
  var zip = await JSZip.loadAsync(ab);

  var docXml = await zip.files['word/document.xml'].async('string');
  // relationships for images
  var relsXml = '';
  try{ relsXml = await zip.files['word/_rels/document.xml.rels'].async('string'); }catch(e){}

  // numbering.xml for list detection
  var numXml = '';
  try{ numXml = await zip.files['word/numbering.xml'].async('string'); }catch(e){}

  // Build numId → numFmt map
  var numFmtMap = {}; // abstractNumId → numFmt
  var numIdToAbstract = {}; // numId → abstractNumId
  if(numXml){
    var absMatches = numXml.match(/<w:abstractNum[\s>][\s\S]*?<\/w:abstractNum>/g) || [];
    for(var absM of absMatches){
      var absIdM = absM.match(/w:abstractNumId="(\d+)"/);
      var fmtM = absM.match(/<w:numFmt\s+w:val="([^"]+)"/);
      if(absIdM && fmtM) numFmtMap[absIdM[1]] = fmtM[1];
    }
    var numMatches = numXml.match(/<w:num\s[\s\S]*?<\/w:num>/g) || [];
    for(var nm of numMatches){
      var nidM = nm.match(/w:numId="(\d+)"/);
      var arefM = nm.match(/w:abstractNumId\s+w:val="(\d+)"/);
      if(nidM && arefM) numIdToAbstract[nidM[1]] = arefM[1];
    }
  }

  var imageMap = {}; // rId -> base64
  var relMatches = relsXml.match(/<Relationship[^>]+>/g) || [];
  for(var rm of relMatches){
    var idM = rm.match(/Id="([^"]+)"/);
    var tgtM = rm.match(/Target="([^"]+)"/);
    if(idM && tgtM && /image/i.test(rm)){
      var imgPath = 'word/' + tgtM[1].replace(/^\//, '');
      try{
        var imgBuf = await zip.files[imgPath].async('base64');
        var ext2 = imgPath.split('.').pop().toLowerCase();
        var mime = ext2==='png'?'image/png':ext2==='gif'?'image/gif':ext2==='svg'?'image/svg+xml':'image/jpeg';
        imageMap[idM[1]] = 'data:'+mime+';base64,'+imgBuf;
      }catch(e){}
    }
  }

  // Parse body
  var bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if(!bodyMatch) throw new Error('document.xml에서 본문을 찾을 수 없습니다.');
  var bodyXml = bodyMatch[1];

  var rawElements = [];

  // Split into top-level elements (w:p, w:tbl)
  var topParts = bodyXml.match(/<w:(p|tbl)[\s>][\s\S]*?<\/w:\1>/g) || [];

  for(var part of topParts){
    if(part.startsWith('<w:tbl')){
      // Table
      var tRows = part.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
      var rows = [];
      for(var tr of tRows){
        var tCells = tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
        var row = [];
        for(var tc of tCells){
          var cellTexts = tc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
          row.push(cellTexts.map(function(t){return t.replace(/<[^>]+>/g,'');}).join(''));
        }
        rows.push(row);
      }
      if(rows.length) rawElements.push({type:'table', rows:rows});
      continue;
    }

    // Paragraph
    var pStyle = '';
    var styleM = part.match(/<w:pStyle\s+w:val="([^"]+)"/);
    if(styleM) pStyle = styleM[1];

    // Check numPr
    var hasNumPr = /<w:numPr/.test(part);
    var numFmt = '';
    if(hasNumPr){
      var numIdM2 = part.match(/<w:numId\s+w:val="(\d+)"/);
      if(numIdM2){
        var absId = numIdToAbstract[numIdM2[1]];
        if(absId && numFmtMap[absId]) numFmt = numFmtMap[absId];
      }
      if(!numFmt) numFmt = 'bullet'; // default if can't determine
    }

    // Check for image
    var hasDrawing = /<w:drawing/.test(part);
    var blipM = part.match(/<a:blip[^>]+r:embed="([^"]+)"/);
    var imgSrc = blipM && imageMap[blipM[1]] ? imageMap[blipM[1]] : '';
    // drawing은 있지만 blip 바이너리가 없으면 도형 — figure 아님
    if(hasDrawing && !imgSrc) hasDrawing = false;

    // Extract runs
    var runs = [];
    var runMatches = part.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || [];
    for(var runXml of runMatches){
      var bold = /<w:b(?:\s|\/|>)/.test(runXml) && !/<w:b\s+w:val="0"/.test(runXml);
      var italic = /<w:i(?:\s|\/|>)/.test(runXml) && !/<w:i\s+w:val="0"/.test(runXml);
      var fontM = runXml.match(/<w:rFonts[^>]+w:ascii="([^"]+)"/);
      var font = fontM ? fontM[1] : '';
      var tParts = runXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      var txt = tParts.map(function(t){return t.replace(/<[^>]+>/g,'');}).join('');
      if(txt) runs.push({text:txt, bold:bold, italic:italic, font:font});
    }

    var fullText = runs.map(function(r){return r.text;}).join('');
    if(!fullText.trim() && !hasDrawing) continue;

    // Classify
    var elType = _classifyPara(pStyle, fullText, runs, hasNumPr, numFmt, hasDrawing, imgSrc);
    // 디버그: 처음 30개 요소의 분류 결과
    if(rawElements.length < 30) console.log('[p21-parse]', elType, '|style:', pStyle, '|bold:', runs.every(function(r){return r.bold;}), '|txt:', fullText.slice(0,60));

    // Build element
    var elem = {type:elType, text:fullText, runs:runs};
    if(elType === 'figure') elem.src = imgSrc;
    if(elType === 'section-header') elem.level = _headingLevel(pStyle, fullText) || 2;

    rawElements.push(elem);
  }

  // Merge consecutive
  var elements = _mergeConsecutive(rawElements);
  var stats = _calcStats(elements);

  return {elements:elements, stats:stats};
}

/* ══════════════════════════════════════════════
   HWPX 파싱 — Contents/section*.xml에서 12가지 요소 추출
   ══════════════════════════════════════════════ */

async function _parseHwpx(file){
  if(typeof JSZip==='undefined') throw new Error('JSZip 라이브러리가 필요합니다.');
  var ab = await file.arrayBuffer();
  var zip = await JSZip.loadAsync(ab);

  var secFiles = Object.keys(zip.files)
    .filter(function(n){return /^Contents\/section\d+\.xml$/i.test(n);})
    .sort(function(a,b){return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);});

  if(!secFiles.length) throw new Error('HWPX 본문 섹션을 찾을 수 없습니다.');

  var rawElements = [];

  for(var fname of secFiles){
    var xml = await zip.files[fname].async('string');
    // Remove headers/footers/footnotes
    xml = xml
      .replace(/<(?:hp:)?header[^>]*>[\s\S]*?<\/(?:hp:)?header>/gi, '')
      .replace(/<(?:hp:)?footer[^>]*>[\s\S]*?<\/(?:hp:)?footer>/gi, '')
      .replace(/<(?:hp:)?footnote[^>]*>[\s\S]*?<\/(?:hp:)?footnote>/gi, '')
      .replace(/<(?:hp:)?endnote[^>]*>[\s\S]*?<\/(?:hp:)?endnote>/gi, '');

    // Tables (extract before paragraphs to avoid double-processing)
    var tblMatches = xml.match(/<(?:hp:)?tbl[\s>][\s\S]*?<\/(?:hp:)?tbl>/gi) || [];
    for(var tblXml of tblMatches){
      var trMatches = tblXml.match(/<(?:hp:)?tr[\s>][\s\S]*?<\/(?:hp:)?tr>/gi) || [];
      var rows = [];
      for(var trX of trMatches){
        var cellMatches = trX.match(/<(?:hp:)?tc[\s>][\s\S]*?<\/(?:hp:)?tc>/gi) || [];
        var row = [];
        for(var tcX of cellMatches){
          var tTexts = tcX.match(/<(?:hp:)?t(?:\s[^>]*)?>([^<]*)<\/(?:hp:)?t>/g) || [];
          row.push(tTexts.map(function(m){return m.replace(/<[^>]+>/g,'');}).join(''));
        }
        rows.push(row);
      }
      if(rows.length) rawElements.push({type:'table', rows:rows});
      xml = xml.replace(tblXml, '');
    }

    // Images
    var imgMatches = xml.match(/<(?:hp:)?image[\s>][\s\S]*?(?:\/>|<\/(?:hp:)?image>)/gi) || [];
    for(var im of imgMatches){
      rawElements.push({type:'figure', src:'', text:''});
    }

    // Paragraphs
    var paraMatches = xml.match(/<(?:hp:)?p(?:\s[^>]*)?>[\s\S]*?<\/(?:hp:)?p>/gi) || [];
    for(var pXml of paraMatches){
      var tParts = pXml.match(/<(?:hp:)?t(?:\s[^>]*)?>([^<]*)<\/(?:hp:)?t>/g) || [];
      var lineText = tParts.map(function(m){return m.replace(/<[^>]+>/g,'');}).join('');
      if(!lineText.trim()) continue;

      // Detect pStyle/outlineLevel
      var pStyleHw = '';
      var psM = pXml.match(/(?:hp:)?styleIDRef="([^"]+)"/i);
      if(psM) pStyleHw = psM[1];
      var outlineM = pXml.match(/outlineLevel="(\d+)"/i);
      var outlineLevel = outlineM ? parseInt(outlineM[1]) + 1 : 0;

      // Map outlineLevel to heading pStyle for classifier
      var fakePStyle = pStyleHw;
      if(outlineLevel === 1 && !/heading/i.test(fakePStyle)) fakePStyle = 'Heading1';
      else if(outlineLevel >= 2 && outlineLevel <= 4 && !/heading/i.test(fakePStyle)) fakePStyle = 'Heading'+outlineLevel;
      // Section-level headings from text patterns
      if(!outlineLevel && /^(\d+\.\s|제?\s*\d+\s*절)/.test(lineText.trim()) && !/heading/i.test(fakePStyle)){
        fakePStyle = 'Heading2';
      }

      // Detect list from text patterns (HWPX doesn't always have numPr)
      var hasNumPr = false;
      var numFmt = '';
      if(/<(?:hp:)?numbering/i.test(pXml)){
        hasNumPr = true;
        numFmt = /numFormat="([^"]+)"/i.test(pXml) ? RegExp.$1 : '';
        if(/decimal|digit/i.test(numFmt)) numFmt = 'decimal';
        else numFmt = 'bullet';
      }

      // Font detection for code
      var fontStr = '';
      var fontMatches = pXml.match(/(?:hp:)?fontRef\s[^>]*faceNameRef="([^"]+)"/gi) || [];
      fontStr = fontMatches.map(function(fm){ var m2=fm.match(/faceNameRef="([^"]+)"/); return m2?m2[1]:''; }).join(' ');

      var runs = [{text:lineText, bold:false, italic:false, font:fontStr}];
      var elType = _classifyPara(fakePStyle, lineText, runs, hasNumPr, numFmt, false, '');

      var elem = {type:elType, text:lineText, runs:runs};
      if(elType === 'section-header'){
        elem.level = outlineLevel >= 2 ? Math.min(outlineLevel, 4) : (_headingLevel(fakePStyle, lineText) || 2);
      }

      rawElements.push(elem);
    }
  }

  var elements = _mergeConsecutive(rawElements);
  var stats = _calcStats(elements);

  return {elements:elements, stats:stats};
}

/* ══════════════════════════════════════════════
   HTML 페이지 생성 — 12가지 요소별 고유 디자인
   ══════════════════════════════════════════════ */

function _buildFullHtml(parsed, settings, aiCss){
  var s = settings;
  var th = s.theme;
  var pageW = s.pageW, pageH = s.pageH;
  var mt = s.mt, mb = s.mb, ml = s.ml + s.mi, mr = s.mr;
  var bfSz = s.bodySize;
  var tSz = s.titleSize;

  // 자동 채번 카운터
  var partNum = 0, chapterNum = 0, figNum = 0, tblNum = 0;

  // ── CSS ──
  var css = '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;700&family=DM+Mono:wght@400&display=swap");\n'
    +'*{box-sizing:border-box;margin:0;padding:0;}\n'
    +'@page{size:'+pageW+'mm '+pageH+'mm;margin:'+mt+'mm '+mr+'mm '+mb+'mm '+ml+'mm;}\n'
    +'html{background:#fff;scroll-behavior:smooth;}\n'
    +'body{font-family:"'+s.bodyFont+'","Noto Sans KR",sans-serif;font-size:'+bfSz+'pt;'
    +'line-height:'+(s.lineH/100)+';color:#1e293b;max-width:760px;margin:0 auto;background:#fff;padding:48px 40px;'
    +'min-height:100vh;}\n'
    +'@media print{body{padding:'+mt+'mm '+mr+'mm '+mb+'mm '+ml+'mm;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}\n'
    +'@media(max-width:800px){body{padding:24px 16px;}}\n'

    /* ── 1. 파트 도비라 ── */
    +'.part-tobira{page-break-before:always;display:flex;flex-direction:column;align-items:center;'
    +'justify-content:center;min-height:80vh;text-align:center;'
    +'background:linear-gradient(160deg, '+th.accent+'08 0%, '+th.accent+'18 100%);padding:60px 40px;}\n'
    +'.part-tobira:first-child{page-break-before:auto;}\n'
    +'.pt-label{font-size:11pt;font-weight:700;letter-spacing:6px;text-transform:uppercase;color:'+th.accent+';opacity:.7;margin-bottom:12px;}\n'
    +'.pt-num{font-family:"'+s.titleFont+'","Noto Sans KR",sans-serif;font-size:72pt;font-weight:700;'
    +'color:'+th.title+';line-height:1;margin-bottom:16px;}\n'
    +'.pt-title{font-family:"'+s.titleFont+'","Noto Sans KR",sans-serif;font-size:'+(tSz*1.1)+'pt;font-weight:700;'
    +'color:'+th.title+';line-height:1.3;margin-bottom:24px;}\n'
    +'.pt-bar{width:80px;height:4px;background:'+th.accent+';border-radius:2px;}\n'

    /* ── 2. 장 도비라 ── */
    +'.ch-tobira{page-break-before:always;padding:40% 0 30px;position:relative;}\n'
    +'.ch-tobira:first-child{page-break-before:auto;}\n'
    +'.cht-badge{display:inline-block;font-size:10pt;font-weight:700;color:#fff;background:'+th.accent+';'
    +'padding:5px 16px;border-radius:20px;letter-spacing:1.5px;margin-bottom:18px;}\n'
    +'.cht-title{font-family:"'+s.titleFont+'","Noto Sans KR",sans-serif;font-size:'+tSz+'pt;font-weight:700;'
    +'color:'+th.title+';line-height:1.25;margin-bottom:14px;}\n'
    +'.cht-bar{width:60px;height:3px;background:'+th.accent+';border-radius:2px;}\n'

    /* ── 3. 절 제목 (section-header) ── */
    +'h2.sh{font-family:"'+s.titleFont+'","Noto Sans KR",sans-serif;font-size:'+(tSz*0.65)+'pt;font-weight:700;'
    +'color:'+th.title+';margin:36px 0 14px;padding:0 0 8px 12px;border-left:4px solid '+th.accent+';'
    +'border-bottom:1px solid '+th.accent+'40;page-break-after:avoid;}\n'
    +'h3.sh{font-family:"'+s.titleFont+'","Noto Sans KR",sans-serif;font-size:'+(tSz*0.5)+'pt;font-weight:600;'
    +'color:'+th.title+';margin:28px 0 10px;padding:6px 12px;'
    +'background:'+th.accent+'0a;border-left:3px solid '+th.accent+'60;page-break-after:avoid;}\n'
    +'h4.sh{font-family:"'+s.titleFont+'","Noto Sans KR",sans-serif;font-size:'+(tSz*0.42)+'pt;font-weight:600;'
    +'color:'+th.body+';margin:20px 0 8px;}\n'

    /* ── 4. 그림 (figure) ── */
    +'.fig-wrap{text-align:center;margin:20px 0;page-break-inside:avoid;}\n'
    +'.fig-frame{display:inline-block;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden;'
    +'box-shadow:0 2px 8px rgba(0,0,0,.06);}\n'
    +'.fig-frame img{max-width:100%;height:auto;display:block;}\n'
    +'.fig-caption{font-size:'+(bfSz*0.78)+'pt;color:#888;margin-top:10px;font-style:italic;}\n'
    +'.fig-placeholder{background:linear-gradient(135deg,#f7f7f5,#eeedea);border:2px dashed #d0cec6;'
    +'padding:40px 0;text-align:center;color:#aaa;font-size:9pt;margin:20px 0;border-radius:8px;}\n'

    /* ── 5. 표 (table) ── */
    +'.tbl-wrap{margin:20px 0;page-break-inside:avoid;}\n'
    +'.tbl-caption{font-size:'+(bfSz*0.82)+'pt;font-weight:600;color:'+th.title+';margin-bottom:8px;}\n'
    +'.tbl-wrap table{width:100%;border-collapse:collapse;font-size:'+(bfSz*0.88)+'pt;border-radius:6px;overflow:hidden;border:1px solid #e0e0e0;}\n'
    +'.tbl-wrap th{background:'+th.accent+';color:#fff;font-weight:600;font-size:'+(bfSz*0.82)+'pt;padding:8px 12px;text-align:left;}\n'
    +'.tbl-wrap td{padding:7px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #eee;}\n'
    +'.tbl-wrap tr:nth-child(even) td{background:#f9f9f7;}\n'
    +'.tbl-wrap tr:hover td{background:#f0eef8;}\n'

    /* ── 6. 코드 (code) ── */
    +'.code-wrap{margin:16px 0;page-break-inside:avoid;border-radius:8px;overflow:hidden;'
    +'border:1px solid #2a2a3a;}\n'
    +'.code-lang{background:#1e1e2e;color:'+th.accent+';font-size:8pt;font-weight:700;'
    +'padding:4px 14px;letter-spacing:1px;border-bottom:1px solid #2a2a3a;}\n'
    +'.code-body{background:#1e1e2e;color:#e0e0e0;font-family:"JetBrains Mono","D2Coding","Consolas",monospace;'
    +'font-size:'+(bfSz*0.82)+'pt;line-height:1.7;padding:14px 16px;margin:0;white-space:pre-wrap;overflow-wrap:break-word;}\n'
    +'.code-body .ln{display:inline-block;width:28px;color:#555;text-align:right;margin-right:14px;user-select:none;font-size:'+(bfSz*0.72)+'pt;}\n'

    /* ── 7. 팁 박스 (tip-box) ── */
    +'.tip-box{display:flex;gap:14px;align-items:flex-start;background:'+th.noteBg+';'
    +'border-left:4px solid '+th.accent+';border-radius:0 8px 8px 0;padding:16px 18px;margin:16px 0;'
    +'font-size:'+(bfSz*0.9)+'pt;page-break-inside:avoid;}\n'
    +'.tip-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
    +'font-size:16px;flex-shrink:0;background:'+th.accent+'15;}\n'
    +'.tip-content{flex:1;}\n'
    +'.tip-label{font-weight:700;color:'+th.accent+';margin-bottom:4px;font-size:'+(bfSz*0.85)+'pt;letter-spacing:.5px;}\n'
    +'.tip-text{line-height:1.65;}\n'

    /* ── 8. 프롬프트 박스 (prompt-box) ── */
    +'.prompt-box{margin:16px 0;border-radius:8px;overflow:hidden;page-break-inside:avoid;'
    +'border:1px solid #3a3a4a;}\n'
    +'.prompt-header{background:#2d2d3d;color:'+th.accent+';font-size:9pt;font-weight:700;'
    +'padding:6px 14px;display:flex;align-items:center;gap:8px;}\n'
    +'.prompt-icon{font-size:10px;}\n'
    +'.prompt-body{background:#2d2d3d;color:#d4d4dc;font-family:"JetBrains Mono","D2Coding","Consolas",monospace;'
    +'font-size:'+(bfSz*0.85)+'pt;line-height:1.7;padding:12px 16px;white-space:pre-wrap;overflow-wrap:break-word;}\n'

    /* ── 9. 숫자 목록 (numbered-list) ── */
    +'.num-list{margin:14px 0;padding:0;list-style:none;counter-reset:nlist;}\n'
    +'.num-list li{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;padding-left:4px;counter-increment:nlist;}\n'
    +'.num-list .num-marker{display:inline-flex;align-items:center;justify-content:center;'
    +'width:22px;height:22px;border-radius:50%;background:'+th.accent+';color:#fff;'
    +'font-size:'+(bfSz*0.72)+'pt;font-weight:700;flex-shrink:0;margin-top:2px;}\n'
    +'.num-list .num-text{flex:1;}\n'

    /* ── 10. 블릿 목록 (bullet-list) ── */
    +'.bul-list{margin:14px 0 14px 6px;padding:0;list-style:none;}\n'
    +'.bul-list li{position:relative;padding-left:18px;margin-bottom:5px;}\n'
    +'.bul-list li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;'
    +'border-radius:50%;background:'+th.accent+';}\n'

    /* ── 11. 본문 (body-text) ── */
    +'p.bt{margin:0 0 10px;text-align:justify;word-break:keep-all;}\n'
    +'p.bt+p.bt{text-indent:1.2em;}\n'

    /* ── 12. 별면 (special-page) ── */
    +'.special-page{page-break-before:always;padding:40px 30px;margin:0;'
    +'background:#fafaf8;border:2px dashed '+th.accent+'40;border-radius:0;min-height:50vh;}\n'
    +'.sp-badge{display:inline-block;font-size:10pt;font-weight:700;color:'+th.accent+';'
    +'background:'+th.accent+'12;padding:6px 16px;border-radius:6px;margin-bottom:20px;letter-spacing:.5px;}\n'
    +'.sp-content{line-height:1.7;}\n'

    /* ── 판권 페이지 ── */
    +'.copyright-page{page-break-before:always;padding-top:120px;text-align:center;}\n'
    +'.copyright-page .cp-title{font-size:14pt;font-weight:700;margin-bottom:24px;color:'+th.title+';}\n'
    +'.copyright-page .cp-divider{width:40px;height:2px;background:'+th.accent+';margin:0 auto 24px;}\n'
    +'.copyright-page .cp-info{font-size:8.5pt;color:#888;line-height:2.4;}\n';

  // AI가 생성한 커스텀 CSS가 있으면 12요소 기본 CSS를 대체
  if(aiCss){
    // 웹 UI 골격 — 흰색 배경 기반
    var baseCss = '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=DM+Mono:wght@400&display=swap");\n'
      +'*{box-sizing:border-box;margin:0;padding:0;}\n'
      +'html{background:#fff;scroll-behavior:smooth;}\n'
      +'body{font-family:"Inter","Noto Sans KR",sans-serif;font-size:16px;'
      +'line-height:1.8;color:#1e293b;max-width:760px;margin:0 auto;background:#fff;padding:48px 40px;'
      +'min-height:100vh;}\n'
      +'@media print{body{padding:20mm;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}\n'
      +'@media(max-width:800px){body{padding:24px 16px;font-size:15px;}}\n';
    css = baseCss + '\n' + aiCss + '\n';
  }

  // ── Body HTML 생성 ──
  var body = '';

  for(var i=0; i<parsed.elements.length; i++){
    var el = parsed.elements[i];

    switch(el.type){

      case 'part-tobira': {
        partNum++;
        var ptMatch = el.text.match(/(?:PART\s*(\d+)|제\s*(\d+)\s*부)/i);
        var ptDisplayNum = ptMatch ? (ptMatch[1] || ptMatch[2]) : String(partNum);
        var ptTitle = el.text.replace(/^(PART\s*\d+|제\s*\d+\s*부)\s*/i, '').trim();
        body += '<div class="part-tobira">'
          +'<div class="pt-label">PART</div>'
          +'<div class="pt-num">'+String(ptDisplayNum).padStart(2,'0')+'</div>'
          +(ptTitle ? '<div class="pt-title">'+_esc(ptTitle)+'</div>' : '')
          +'<div class="pt-bar"></div>'
          +'</div>\n';
        break;
      }

      case 'chapter-tobira': {
        chapterNum++;
        var chMatch = el.text.match(/(?:제?\s*(\d+)\s*장|chapter\s*(\d+))/i);
        var chDisplayNum = chMatch ? (chMatch[1] || chMatch[2]) : String(chapterNum);
        var chTitle = el.text.replace(/^(제?\s*\d+\s*장|chapter\s*\d+)\s*/i, '').trim() || el.text;
        body += '<div class="ch-tobira">'
          +'<div class="cht-badge">CHAPTER '+String(chDisplayNum).padStart(2,'0')+'</div>'
          +'<div class="cht-title">'+_esc(chTitle)+'</div>'
          +'<div class="cht-bar"></div>'
          +'</div>\n';
        break;
      }

      case 'section-header': {
        var lvl = Math.min(Math.max(el.level||2, 2), 4);
        body += '<h'+lvl+' class="sh">'+_runsToHtml(el.runs||[{text:el.text}])+'</h'+lvl+'>\n';
        break;
      }

      case 'figure': {
        figNum++;
        if(el.src){
          body += '<div class="fig-wrap"><div class="fig-frame"><img src="'+el.src+'" alt="그림 '+figNum+'"></div>'
            +'<div class="fig-caption">그림 '+figNum+'</div></div>\n';
        } else {
          body += '<div class="fig-wrap"><div class="fig-placeholder">[그림 '+figNum+']</div></div>\n';
        }
        break;
      }

      case 'table': {
        tblNum++;
        var tHtml = '<div class="tbl-wrap">';
        tHtml += '<div class="tbl-caption">표 '+tblNum+'</div>';
        tHtml += '<table>';
        el.rows.forEach(function(row,ri){
          tHtml += '<tr>';
          row.forEach(function(cell){
            tHtml += (ri===0?'<th>':'<td>')+_esc(cell)+(ri===0?'</th>':'</td>');
          });
          tHtml += '</tr>';
        });
        tHtml += '</table></div>\n';
        body += tHtml;
        break;
      }

      case 'code': {
        var lines = el.text.split('\n');
        var codeHtml = lines.map(function(ln,idx){
          return '<span class="ln">'+(idx+1)+'</span>'+_esc(ln);
        }).join('\n');
        body += '<div class="code-wrap"><div class="code-lang">CODE</div>'
          +'<pre class="code-body">'+codeHtml+'</pre></div>\n';
        break;
      }

      case 'tip-box': {
        var noteLabel = 'TIP';
        var noteText = el.text;
        var nlm = noteText.match(RE_TIP);
        if(nlm){ noteLabel = nlm[1]; noteText = noteText.slice(nlm[0].length).trim(); }
        var tipIcon = /tip|팁/i.test(noteLabel)?'💡'
          : /주의|경고|warn|caution/i.test(noteLabel)?'⚠️'
          : /중요|important/i.test(noteLabel)?'❗'
          : '📌';
        body += '<div class="tip-box">'
          +'<div class="tip-icon">'+tipIcon+'</div>'
          +'<div class="tip-content">'
          +'<div class="tip-label">'+_esc(noteLabel.toUpperCase())+'</div>'
          +'<div class="tip-text">'+_esc(noteText)+'</div>'
          +'</div></div>\n';
        break;
      }

      case 'prompt-box': {
        var pText = el.text;
        var pm = pText.match(/^(프롬프트|Prompt|명령어|Command)\s*[:：]\s*/i);
        if(pm) pText = pText.slice(pm[0].length);
        // Remove leading >
        pText = pText.replace(/^>\s?/, '');
        body += '<div class="prompt-box">'
          +'<div class="prompt-header"><span class="prompt-icon">▶</span> PROMPT</div>'
          +'<div class="prompt-body">'+_esc(pText)+'</div>'
          +'</div>\n';
        break;
      }

      case 'numbered-list': {
        var olHtml = '<ol class="num-list">';
        (el.items||[]).forEach(function(item, idx){
          var itemText = item.text.replace(/^\d+[.)]\s*/, '');
          olHtml += '<li><span class="num-marker">'+(idx+1)+'</span>'
            +'<span class="num-text">'+_runsToHtml(item.runs||[{text:itemText}])+'</span></li>';
        });
        olHtml += '</ol>\n';
        body += olHtml;
        break;
      }

      case 'bullet-list': {
        var ulHtml = '<ul class="bul-list">';
        (el.items||[]).forEach(function(item){
          var itemText = item.text.replace(/^[-·•▶▪★☆※]\s*/, '');
          ulHtml += '<li>'+_runsToHtml(item.runs||[{text:itemText}])+'</li>';
        });
        ulHtml += '</ul>\n';
        body += ulHtml;
        break;
      }

      case 'body-text': {
        body += '<p class="bt">'+_runsToHtml(el.runs||[{text:el.text}])+'</p>\n';
        break;
      }

      case 'special-page': {
        var spLabel = '별면';
        var spMatch = el.text.match(RE_SPECIAL);
        if(spMatch) spLabel = spMatch[0];
        var spText = el.text.replace(RE_SPECIAL, '').trim();
        body += '<div class="special-page">'
          +'<div class="sp-badge">'+_esc(spLabel)+'</div>'
          +'<div class="sp-content">'+_esc(spText || el.text)+'</div>'
          +'</div>\n';
        break;
      }
    }
  }

  // Copyright page
  body += '<div class="copyright-page">'
    +'<div class="cp-title">[도서 제목]</div>'
    +'<div class="cp-divider"></div>'
    +'<div class="cp-info">'
    +'초판 발행 YYYY년 M월 D일<br>'
    +'지은이 [저자명]<br>'
    +'펴낸이 [발행인명]<br>'
    +'펴낸곳 한빛미디어(주)<br>'
    +'서울시 서대문구 연희로2길 62 한빛미디어(주) IT출판부<br>'
    +'전화 02-325-5544 / 팩스 02-336-7124<br>'
    +'등록 1999년 6월 24일 제25100-2017-000058호<br><br>'
    +'ISBN 979-11-XXXXX-XX-X XXXXX<br><br>'
    +'&copy; YYYY [저자명], 한빛미디어(주)'
    +'</div></div>\n';

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
    +'<title>내지 시안</title><style>'+css+'</style></head><body>'
    +body+'</body></html>';
}

// (첫 번째 p21_openPreview 정의 삭제 — 하단 통합 정의 사용)

/* ── 구조 분석 표시 (12가지) ── */
function _showStats(stats){
  var items = [
    ['파트', stats.parts], ['장', stats.chapters], ['절', stats.sections],
    ['그림', stats.figures], ['표', stats.tables], ['코드', stats.codes],
    ['팁', stats.tips], ['프롬프트', stats.prompts],
    ['목록', (stats.numberedLists||0)+(stats.bulletLists||0)],
    ['본문', stats.bodyTexts], ['별면', stats.specialPages]
  ];
  var html = items
    .filter(function(it){return it[1] > 0;})
    .map(function(it){return '<span class="p21-stat">'+it[0]+' <b>'+it[1]+'</b></span>';})
    .join('');
  var el = document.getElementById('p21_stats');
  if(el) el.innerHTML = html;
}

/* ══════════════════════════════════════════════
   메인 생성 함수
   ══════════════════════════════════════════════ */

var _fullHtml = '';


var _fullHtml = '';

/* ══════════════════════════════════════════════
   design_axes — 6축 × 6좌표 = 46,656 조합
   배경은 축에 없음 (흰색 고정). palette는 악센트 1색만.
   ══════════════════════════════════════════════ */

var DESIGN_AXES = {
  chapter_opener: [
    'minimal',
    'editorial_magazine',
    'typographic_large',
    'numbered_only',
    'split_layout',
    'quote_lead'
  ],
  body_rhythm: [
    '학술체_정렬',
    '가독형_여백넉넉',
    '컴팩트_실용서',
    '여백강조_에세이',
    '좁은단_긴호흡',
    '표준_교과서'
  ],
  code_block: [
    '미니멀_라인만',
    '카드형_옅은보더',
    '좌측_수직악센트바',
    '노트북셀_번호배지',
    '라이트박스_옅은회색',
    '캡션상단_언더라인'
  ],
  callout: [
    '좌측보더_라벨상단',
    '박스형_옅은보더',
    '마진노트_본문옆',
    '아이콘_타이틀형',
    '인용블록형',
    '구분선_위아래'
  ],
  accent_palette: [
    '모노+블루(#2D5BFF)',
    '모노+레드(#C73E1D)',
    '모노+다크그린(#1F5D3A)',
    '모노+버건디(#7A1F2B)',
    '모노+딥네이비(#0B2545)',
    '모노+차콜(#2B2B2B) 무채색'
  ],
  typography: [
    'Pretendard_단일',
    'Pretendard+NotoSerifKR_헤딩세리프',
    'Pretendard+NotoSerifKR_본문세리프',
    'IBMPlexSansKR_단일',
    'Spoqa+NotoSerif_혼합',
    'Pretendard+D2Coding_코드강조'
  ]
};

/* ══════════════════════════════════════════════
   Step 1: LLM 의미 태깅 — 원고 텍스트 → 구조 JSON
   haiku, temp 0, 1회. 구조만 판별. 디자인 안 함.
   ══════════════════════════════════════════════ */

var _TAG_SYS = 'IT 기술서 원고의 구조를 분석하는 태거. 입력 텍스트의 각 블록을 의미 태그로 분류한 JSON 배열을 출력한다. JSON만 출력. 설명 금지.';

var _TAG_PROMPT = '아래 원고 텍스트의 각 블록을 분류하여 JSON 배열로 출력하라.\n\n'
  +'[태그]\n'
  +'"chapter": 장 제목. depth:1\n'
  +'"section": 절/중/소 제목. depth:2~4\n'
  +'"body": 본문 단락\n'
  +'"code": 코드 블록. lang 필드\n'
  +'"tip": 팁/참고/주의. label 필드("TIP","NOTE","주의" 등)\n'
  +'"prompt": AI 프롬프트/명령어\n'
  +'"ol": 순서목록. items:[]\n'
  +'"ul": 비순서목록. items:[]\n'
  +'"table": 표. rows:[[]]\n'
  +'"figure": 도판\n'
  +'"divider": 구분선/파트\n\n'
  +'[도판(figure) 처리 규칙]\n'
  +'- 원고에 "그림 X-Y" 형태 언급이 있으면, 그 언급 단락 바로 다음 위치에 figure 블록 삽입.\n'
  +'- 별도 캡션 줄(예: "그림 5-1 에이전트 메모리 구조")이 있으면 캡션 위치를 그대로 따른다.\n'
  +'- figure 필드: {"tag":"figure","id":"그림 5-1","caption":"...","src":"이미지_N","anchor_text":"본문에서 이 그림을 가리킨 표현"}\n'
  +'- 본문에 "그림 X-Y 참고"라는 언급은 있는데 캡션이 원고에 없으면 caption은 빈 문자열. 절대 지어내지 마라.\n'
  +'- 본문에 언급도 없고 캡션도 없는 그림은 무시(만들지 마라).\n'
  +'- [이미지_N] 표시가 원고에 있으면 src에 "이미지_N" 그대로 넣어라.\n'
  +'- 그림 순서는 원고 등장 순서를 절대 바꾸지 마라.\n\n'
  +'[형식] JSON 배열만. 마크다운/코드블록 금지.\n\n'
  +'--- 원고 ---\n';

async function _aiTag(rawText){
  var apiKey;
  if(typeof loadApiKey === 'function') apiKey = await loadApiKey();
  if(!apiKey) return null;

  // haiku: 입력 길면 출력 JSON이 잘리므로 12000자로 제한
  var trimmed = rawText.length > 12000 ? rawText.slice(0,12000)+'\n...(이하 동일 패턴 생략)' : rawText;

  var raw = await callClaudeApi({
    apiKey: apiKey,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
    prompt: _TAG_PROMPT + trimmed,
    system: _TAG_SYS,
    noPersona: true,
    temperature: 0
  });

  var cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
  var s = cleaned.indexOf('[');
  if(s<0) return null;
  var e = cleaned.lastIndexOf(']');

  var jsonStr;
  if(e > s){
    jsonStr = cleaned.slice(s, e+1);
  } else {
    // ] 없음 → 잘린 JSON 복구: 마지막 완전한 } 찾아서 자르고 ] 붙이기
    var partial = cleaned.slice(s);
    var lastBrace = partial.lastIndexOf('}');
    if(lastBrace < 0) return null;
    jsonStr = partial.slice(0, lastBrace+1) + ']';
    console.warn('[p21] JSON 잘림 복구: '+jsonStr.length+'자');
  }

  // 문자열 안 리터럴 줄바꿈 이스케이프
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1'); // trailing comma
  try { return JSON.parse(jsonStr); }
  catch(err){
    // 줄바꿸 이스케이프 시도
    jsonStr = jsonStr.replace(/"([^"]*?)"/g, function(m){ return m.replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t'); });
    try { return JSON.parse(jsonStr); }
    catch(err2){ console.warn('[p21] JSON parse fail:', err2.message, 'len:', jsonStr.length); return null; }
  }
}

/* ══════════════════════════════════════════════
   Step 2: 좌표 3세트 랜덤 샘플링 (코드, 매번 다름)
   축당 중복 없이 뽑기
   ══════════════════════════════════════════════ */

function _pick(arr, exclude){
  var idx;
  var tries = 0;
  do { idx = Math.floor(Math.random()*arr.length); tries++; }
  while(exclude.indexOf(idx)>=0 && tries<20);
  return idx;
}

/* ── 도판 순서 검증 ── */
function _validateFigureOrder(tagged, rawText){
  // 원고에서 이미지 마커 등장 순서 추출 — 2가지 패턴 모두 감지
  var mentions = [];
  // 패턴1: [이미지_N]
  var re1 = /\[이미지_(\d+)\]/g;
  var m;
  while((m = re1.exec(rawText)) !== null) {
    var id = '이미지_'+m[1];
    if(mentions.indexOf(id) < 0) mentions.push(id);
  }
  // 패턴2: 그림 X-Y (mentions가 비어있을 때만)
  if(mentions.length === 0){
    var re2 = /그림\s*(\d+-\d+)/g;
    while((m = re2.exec(rawText)) !== null) {
      var id2 = '그림 '+m[1];
      if(mentions.indexOf(id2) < 0) mentions.push(id2);
    }
  }

  // 구조 JSON에서 figure/image 등장 순서
  var figures = [];
  for(var i=0; i<tagged.length; i++){
    var t = tagged[i];
    if((t.tag === 'figure' || t.tag === 'image') && t.id){
      figures.push(t.id);
    } else if((t.tag === 'figure' || t.tag === 'image') && t.src){
      figures.push(t.src);
    }
  }

  if(mentions.length === 0 && figures.length === 0) return true;
  // 개수만 비교 (AI가 id를 다르게 쓸 수 있으므로)
  if(mentions.length === figures.length){
    console.log('[p21] 도판 검증 OK ('+figures.length+'개)');
    return true;
  }
  console.warn('[p21] 도판 개수 불일치: 원고 '+mentions.length+'개, 구조 '+figures.length+'개');
  return false;
}

function _sampleAxes(){
  var used = {ch:[],br:[],cb:[],ca:[],ap:[],ty:[]};
  var variants = [];
  var labels = ['A','B','C'];
  for(var i=0;i<3;i++){
    var ch = _pick(DESIGN_AXES.chapter_opener, used.ch); used.ch.push(ch);
    var br = _pick(DESIGN_AXES.body_rhythm, used.br); used.br.push(br);
    var cb = _pick(DESIGN_AXES.code_block, used.cb); used.cb.push(cb);
    var ca = _pick(DESIGN_AXES.callout, used.ca); used.ca.push(ca);
    var ap = _pick(DESIGN_AXES.accent_palette, used.ap); used.ap.push(ap);
    var ty = _pick(DESIGN_AXES.typography, used.ty); used.ty.push(ty);
    variants.push({
      label: labels[i],
      chapter_opener: DESIGN_AXES.chapter_opener[ch],
      body_rhythm: DESIGN_AXES.body_rhythm[br],
      code_block: DESIGN_AXES.code_block[cb],
      callout: DESIGN_AXES.callout[ca],
      accent_palette: DESIGN_AXES.accent_palette[ap],
      typography: DESIGN_AXES.typography[ty]
    });
  }
  return variants;
}

function _axesSummary(v){
  return v.typography.split('_')[0] + ' · ' + v.accent_palette.split('(')[0].replace('모노+','') + ' · ' + v.chapter_opener;
}

/* ══════════════════════════════════════════════
   Step 3: 구조JSON + 좌표 → HTML (LLM, temp 1.0)
   sonnet 병렬 3회. 각각 독립 HTML 페이지.
   ══════════════════════════════════════════════ */

function _buildRenderPrompt(structJson, axes){
  // 구조 JSON 전문 전달 (sonnet 200K 컨텍스트)
  var jsonStr = JSON.stringify(structJson);


  return '구조 JSON과 디자인 좌표가 주어진다. 이 구조를 좌표에 맞게 렌더링한 완전한 HTML 페이지를 만들어라.\n\n'
    +'[구조 JSON]\n'+jsonStr+'\n\n'
    +'[디자인 좌표]\n'
    +'- chapter_opener: '+axes.chapter_opener+'\n'
    +'- body_rhythm: '+axes.body_rhythm+'\n'
    +'- code_block: '+axes.code_block+'\n'
    +'- callout: '+axes.callout+'\n'
    +'- accent_palette: '+axes.accent_palette+'\n'
    +'- typography: '+axes.typography+'\n\n'
    +'[필수 규칙]\n'
    +'1. 배경 반드시 #fff. 악센트 색은 palette에 명시된 1색만.\n'
    +'2. 완전한 HTML. <!DOCTYPE html>로 시작, </html>로 끝.\n'
    +'3. <style> 안에 모든 CSS. Google Fonts @import 가능.\n'
    +'4. max-width:720px; margin:0 auto; padding:48px 32px.\n'
    +'5. 구조 JSON의 모든 요소를 빠짐없이 렌더링.\n'
    +'6. chapter_opener 좌표에 따라 장 시작 디자인을 변주.\n'
    +'7. body_rhythm 좌표에 따라 본문 여백/정렬/줄간격을 변주.\n'
    +'8. code_block 좌표에 따라 코드 블록 스타일을 변주.\n'
    +'9. callout 좌표에 따라 팁/노트 박스 스타일을 변주.\n'
    +'10. typography 좌표에 따라 폰트 조합을 변주.\n'
    +'11. 코드블록(```) 금지. 순수 HTML만 출력.\n'
    +'12. 반응형. @media(max-width:768px) 대응.\n\n'
    +'[블록 순서 절대 제약]\n'
    +'- 구조 JSON의 blocks 배열 순서를 절대 변경하지 마라.\n'
    +'- figure 블록은 배열에 등장한 그 자리에 그대로 렌더링.\n'
    +'- 디자인을 위해 도판을 위/아래로 옮기거나, 좌우 플로팅, 페이지 상단 이동 금지.\n'
    +'- 본문 단락 ↔ 도판의 인접 관계가 시각적으로 유지되어야 한다.\n';
}

var _RENDER_SYS = '웹 UI/UX 디자이너. 구조 JSON과 디자인 좌표를 받아 완전한 HTML 페이지를 렌더링한다. 배경 흰색. 악센트 1색. 좌표별 변주 명확히. HTML만 출력. 마크다운/설명 금지.';

function _extractHtml(raw){
  var c = raw.replace(/```html\s*/gi,'').replace(/```\s*/g,'').trim();
  var s = c.indexOf('<!DOCTYPE'); if(s<0) s = c.indexOf('<!doctype'); if(s<0) s = c.indexOf('<html');
  if(s<0) return null;
  var e = c.lastIndexOf('</html>');
  if(e>s) return c.slice(s, e+7);
  // 잘림 → 강제 닫기
  return c.slice(s) + '</body></html>';
}

async function _renderVariant(apiKey, structJson, axes){
  var prompt = _buildRenderPrompt(structJson, axes);
  var raw = await callClaudeApi({
    apiKey: apiKey,
    model: 'claude-sonnet-4-6',
    maxTokens: 16000,
    prompt: prompt,
    system: _RENDER_SYS,
    noPersona: true,
    temperature: 1.0
  });
  return _extractHtml(raw);
}

/* ══════════════════════════════════════════════
   Step 4: compare.html 생성 (코드)
   탭 UI로 3시안 비교. Blob URL 사용 (file:// 호환).
   ══════════════════════════════════════════════ */

function _buildCompareHtml(variants, htmls){
  var tabs = '', frames = '', blobScripts = '';

  for(var i=0;i<3;i++){
    var v = variants[i];
    var active = i===0?' active':'';
    tabs += '<button class="tab'+active+'" onclick="sw('+i+')">시안 '+v.label
      +'<span class="tag">'+_axesSummary(v)+'</span></button>';
    frames += '<iframe class="frame'+active+'" id="f'+i+'"></iframe>';
    // Blob URL로 HTML 주입 (file:// 환경 srcdoc 보안 우회)
    var escaped = (htmls[i]||'<html><body><p style="padding:40px;color:#999;">렌더링 실패</p></body></html>')
      .replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$');
    blobScripts += 'var b'+i+'=new Blob([`'+escaped+'`],{type:"text/html"});'
      +'document.getElementById("f'+i+'").src=URL.createObjectURL(b'+i+');\n';
  }

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>내지 시안 비교</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:Inter,"Noto Sans KR",sans-serif;background:#f8f8f8;}'
    +'.tab-bar{display:flex;background:#fff;border-bottom:2px solid #e5e7eb;position:sticky;top:0;z-index:10;}'
    +'.tab{flex:1;padding:14px 8px;text-align:center;font-size:14px;font-weight:600;cursor:pointer;border:none;background:transparent;color:#94a3b8;transition:all .15s;font-family:inherit;}'
    +'.tab.active{color:#1e293b;border-bottom:2px solid #1e293b;margin-bottom:-2px;}'
    +'.tab .tag{display:block;font-size:10px;font-weight:400;color:#94a3b8;margin-top:3px;}'
    +'.frame{display:none;width:100%;height:calc(100vh - 54px);border:none;}'
    +'.frame.active{display:block;}'
    +'</style></head><body>'
    +'<div class="tab-bar">'+tabs+'</div>'
    +frames
    +'<script>'
    +'function sw(n){'
    +'document.querySelectorAll(".tab").forEach(function(t,i){t.classList.toggle("active",i===n)});'
    +'document.querySelectorAll(".frame").forEach(function(f,i){f.classList.toggle("active",i===n)});'
    +'}\n'+blobScripts
    +'</script></body></html>';
}

/* ══════════════════════════════════════════════
   메인 파이프라인
   ══════════════════════════════════════════════ */

window.p21_generate = async function(){
  if(!_file) return;
  document.getElementById('p21_empty').style.display = 'none';
  document.getElementById('p21_result').style.display = 'none';

  var apiKey;
  if(typeof loadApiKey === 'function') apiKey = await loadApiKey();

  try{
    // Step 0: 원고 텍스트 추출
    _setProgress(5, '원고 추출...');
    var ext = _file.name.split('.').pop().toLowerCase();
    if(ext === 'docx') _parsed = await _parseDocx(_file);
    else if(ext === 'hwpx') _parsed = await _parseHwpx(_file);
    else throw new Error('지원하지 않는 파일 형식');
    _showStats(_parsed.stats);

    // 이미지 base64 맵 추출 — id→src 매핑
    var _imageMap = {}; // "이미지_1" → "data:image/png;base64,..."
    var imgCounter = 0;
    var rawText = _parsed.elements.map(function(el, elIdx){
      if(el.type === 'table') return '[표]\n'+(el.rows||[]).map(function(r){return r.join(' | ');}).join('\n');
      if(el.type === 'figure'){
        imgCounter++;
        var imgId = '이미지_'+imgCounter;
        _imageMap[imgId] = el.src || '';
        return '['+imgId+']';
      }
      if(el.items) return (el.items||[]).map(function(it){return it.text;}).join('\n');
      return el.text||'';
    }).join('\n');

    if(!apiKey){
      // API 키 없음 → 폴백
      _setProgress(50, 'API 키 없음 — 기본 디자인...');
      var settings = _getSettings();
      _fullHtml = _buildFullHtml(_parsed, settings, null);
      _setProgress(100, '완료 — 기본 디자인 (API 키 설정 시 3시안 생성)');
      document.getElementById('p21_actions').style.display = 'flex';
      document.getElementById('p21_result').style.display = 'block';
      setTimeout(function(){ document.getElementById('p21_progress').style.display='none'; },800);
      p21_openPreview();
      return;
    }


    // Step 1: 파서 결과를 구조 JSON으로 변환 (LLM 태깅 불필요 — 파서가 이미 12가지 분류)
    _setProgress(15, '1단계: 구조 변환...');
    var tagged = _parsed.elements.map(function(el){
      var t = {tag: el.type, text: el.text || ''};
      if(el.type === 'chapter-tobira') t.tag = 'chapter';
      else if(el.type === 'section-header') { t.tag = 'section'; t.depth = el.level || 2; }
      else if(el.type === 'body-text') t.tag = 'body';
      else if(el.type === 'code') { t.tag = 'code'; t.lang = 'code'; }
      else if(el.type === 'tip-box') { t.tag = 'tip'; t.label = 'TIP'; }
      else if(el.type === 'prompt-box') t.tag = 'prompt';
      else if(el.type === 'numbered-list') { t.tag = 'ol'; t.items = (el.items||[]).map(function(it){return it.text;}); }
      else if(el.type === 'bullet-list') { t.tag = 'ul'; t.items = (el.items||[]).map(function(it){return it.text;}); }
      else if(el.type === 'table') { t.tag = 'table'; t.rows = el.rows; }
      else if(el.type === 'figure') { t.tag = 'image'; t.src = el.src ? '[이미지]' : ''; }
      else if(el.type === 'part-tobira') t.tag = 'divider';
      else if(el.type === 'special-page') t.tag = 'section';
      else t.tag = 'body';
      return t;
    });
    console.log('[p21] 구조 변환 완료:', tagged.length, '블록');


    // Step 2: 좌표 3세트 샘플링
    _setProgress(25, '2단계: 디자인 좌표 생성...');
    var variants = _sampleAxes();
    console.log('[p21] 좌표:', variants.map(function(v){return v.label+': '+_axesSummary(v);}));

    // Step 3: 3개 병렬 렌더 (sonnet, temp 1.0)
    _setProgress(30, '3단계: 시안 A/B/C 렌더링 (병렬)...');
    var promises = variants.map(function(v){
      return _renderVariant(apiKey, tagged, v).catch(function(err){
        console.warn('[p21] 시안', v.label, '실패:', err.message);
        return null;
      });
    });
    var htmls = await Promise.all(promises);

    // 이미지 후처리: [이미지_N] 텍스트만 실제 <img>로 교체 (AI가 이미 만든 img는 건드리지 않음)
    htmls = htmls.map(function(h){
      if(!h) return h;
      Object.keys(_imageMap).forEach(function(imgId){
        var src = _imageMap[imgId];
        if(!src) return;
        var num = imgId.replace('이미지_','');
        var figHtml = '<figure style="margin:24px 0;text-align:center;">'
          +'<img src="'+src+'" alt="그림 '+num+'" style="max-width:100%;height:auto;border-radius:6px;border:1px solid #e5e7eb;">'
          +'<figcaption style="margin-top:8px;font-size:13px;color:#64748b;">그림 '+num+'</figcaption>'
          +'</figure>';
        // [이미지_N] 대괄호 포함 텍스트만 교체
        h = h.split('['+imgId+']').join(figHtml);
      });
      return h;
    });

    // Step 4: compare.html
    _setProgress(90, '4단계: 비교 페이지 생성...');
    _fullHtml = _buildCompareHtml(variants, htmls);
    _setProgress(100, '완료 — 3개 시안 생성');

    document.getElementById('p21_actions').style.display = 'flex';
    document.getElementById('p21_result').style.display = 'block';
    setTimeout(function(){ document.getElementById('p21_progress').style.display='none'; },800);
    p21_openPreview();

  } catch(e){
    _setProgress(0, '오류: '+e.message);
    alert('오류: '+e.message);
  }
};

/* ── 미리보기/인쇄/다운로드 ── */
var _previewWin = null;

window.p21_openPreview = function(){
  if(_previewWin && !_previewWin.closed) _previewWin.close();
  _previewWin = window.open('','_blank','width=900,height=1000,scrollbars=yes');
  if(!_previewWin){ alert('팝업 차단됨'); return; }
  _previewWin.document.open();
  _previewWin.document.write(_fullHtml);
  _previewWin.document.close();
};

window.p21_printPreview = function(){
  if(!_fullHtml) return alert('먼저 내지를 생성하세요.');
  if(typeof openPrintPopup==='function') openPrintPopup(_fullHtml,'내지 시안');
  else { var w=window.open('','_blank'); w.document.open(); w.document.write(_fullHtml); w.document.close(); setTimeout(function(){w.print();},500); }
};

window.p21_downloadHtml = function(){
  if(!_fullHtml) return alert('먼저 내지를 생성하세요.');
  var blob = new Blob([_fullHtml],{type:'text/html;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (_file?_file.name.replace(/\.[^.]+$/,''):'내지시안')+'_compare.html';
  a.click(); URL.revokeObjectURL(a.href);
};

/* ── PanelRegistry ── */
if(typeof PanelRegistry!=='undefined'){
  PanelRegistry.register(21,{onActivate:function(){}});
}

})();
