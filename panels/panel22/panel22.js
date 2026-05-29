(function(){
'use strict';

// ──────────────────────────────────────────────
// panel22 — 소스 코드 비교 (PDF vs Source Code)
// PDF의 코드와 소스코드를 브라우저에서 직접 비교
// 줄번호는 코드 추출용 필터로만 사용, 텍스트 내용 기반으로 매칭
// ──────────────────────────────────────────────

var root = document.getElementById('panel22');
if (!root) return;

/* ── 지원 확장자 ── */
var SKIP_DIRS = ['.venv','venv','__pycache__','node_modules','site-packages',
  '.git','.tox','.mypy_cache','.pytest_cache','dist','build','egg-info','.eggs'];
function _shouldSkipPath(relPath){
  var parts = relPath.split('/');
  for (var i = 0; i < parts.length; i++){
    var p = parts[i].toLowerCase();
    if (p.endsWith('.egg-info')) return true;
    for (var j = 0; j < SKIP_DIRS.length; j++){
      if (p === SKIP_DIRS[j]) return true;
    }
  }
  return false;
}
var CODE_EXTS = ['.py','.js','.ts','.jsx','.tsx','.java','.go','.rs','.rb',
  '.cpp','.c','.h','.hpp','.cs','.swift','.kt','.scala','.php',
  '.sh','.bash','.yaml','.yml','.json','.toml','.xml','.sql',
  '.html','.css','.scss','.vue','.svelte','.r','.m','.pl'];

/* ── HTML 구조 생성 ── */
root.innerHTML = `
<div class="p22-wrap">
  <div class="p22-header">
    <h2>소스 코드 비교</h2>
    <p>PDF의 코드와 소스코드를 브라우저에서 직접 비교합니다 (서버 불필요)</p>
  </div>

  <div class="p22-sec" id="p22_inputSec">
    <div class="p22-sec-title">파일 선택</div>
    <div class="p22-file-row">
      <label>PDF 파일</label>
      <div class="p22-file-btn"><input type="file" accept=".pdf" id="p22_pdfInput"><span class="p22-btn">PDF 선택</span></div>
      <span class="p22-file-info empty" id="p22_pdfInfo">선택 안 됨</span>
    </div>
    <div class="p22-file-row">
      <label>소스 코드</label>
      <div class="p22-file-btn"><input type="file" webkitdirectory id="p22_srcInput"><span class="p22-btn">폴더 선택</span></div>
      <span style="color:var(--muted2,#9b9890);font-size:12px;margin:0 4px">또는</span>
      <div class="p22-file-btn"><input type="file" accept=".zip" id="p22_zipInput"><span class="p22-btn">ZIP 선택</span></div>
      <span class="p22-file-info empty" id="p22_srcInfo">선택 안 됨</span>
    </div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap">
      <label class="p22-chk"><input type="checkbox" id="p22_flatMode"> 챕터 구분 없이 전체 비교</label>
    </div>
    <div style="text-align:center;margin-top:16px">
      <button class="p22-btn-run" id="p22_runBtn" disabled>비교 실행</button>
    </div>
    <div class="p22-prog" id="p22_prog">
      <div class="p22-prog-bar-bg"><div class="p22-prog-bar" id="p22_progBar"></div></div>
      <div class="p22-prog-msg" id="p22_progMsg"></div>
    </div>
  </div>

  <div id="p22_report"></div>
</div>
`;

/* ── State ── */
var pdfFile = null;
var srcFiles = {};
var srcFolders = new Set();
var topFolder = '';
var curFilter = 'all';

/* ── DOM refs ── */
var $pdfInput = root.querySelector('#p22_pdfInput');
var $srcInput = root.querySelector('#p22_srcInput');
var $zipInput = root.querySelector('#p22_zipInput');
var $runBtn   = root.querySelector('#p22_runBtn');

/* ── File Selection ── */
$pdfInput.addEventListener('change', function(){
  if (!this.files.length) return;
  pdfFile = this.files[0];
  var info = root.querySelector('#p22_pdfInfo');
  info.textContent = pdfFile.name;
  info.classList.remove('empty');
  checkReady();
});

// 폴더 선택
$srcInput.addEventListener('change', function(){
  srcFiles = {}; srcFolders.clear(); topFolder = '';
  var files = this.files;
  if (!files.length) return;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var rel = f.webkitRelativePath;
    var parts = rel.split('/');
    if (!topFolder) topFolder = parts[0];
    if (parts.length >= 2) srcFolders.add(parts[1]);
    var ext = getExt(f.name);
    if (ext && CODE_EXTS.indexOf(ext) >= 0 && !_shouldSkipPath(rel)) {
      srcFiles[rel] = f;
    }
  }
  var info = root.querySelector('#p22_srcInfo');
  info.textContent = topFolder + '/ (' + Object.keys(srcFiles).length + '개 소스 파일, ' + srcFolders.size + '개 하위 폴더)';
  info.classList.remove('empty');
  $zipInput.value = ''; // 다른 쪽 초기화
  checkReady();
});

// ZIP 파일 선택
$zipInput.addEventListener('change', async function(){
  if (!this.files.length) return;
  var zipFile = this.files[0];
  var info = root.querySelector('#p22_srcInfo');
  info.textContent = '📦 ' + zipFile.name + ' 해제 중...';
  info.classList.remove('empty');

  try {
    srcFiles = {}; srcFolders.clear(); topFolder = '';
    var buf = await zipFile.arrayBuffer();
    var zip = await JSZip.loadAsync(buf);
    var entries = [];
    zip.forEach(function(path, entry){ if (!entry.dir) entries.push({path:path, entry:entry}); });

    // 최상위 폴더 감지
    if (entries.length > 0){
      var firstParts = entries[0].path.split('/');
      if (firstParts.length >= 2) topFolder = firstParts[0];
    }

    // 소스 파일 추출
    for (var i = 0; i < entries.length; i++){
      var e = entries[i];
      var path = e.path;
      var fname = path.split('/').pop();
      var ext = getExt(fname);
      if (!ext || CODE_EXTS.indexOf(ext) < 0) continue;
      if (_shouldSkipPath(path)) continue;

      var parts = path.split('/');
      if (parts.length >= 2) srcFolders.add(parts[topFolder ? 1 : 0]);

      var content = await e.entry.async('string');
      // srcFiles에 문자열로 저장 (File 객체 대신)
      srcFiles[path] = content;
    }

    info.textContent = '📦 ' + zipFile.name + ' (' + Object.keys(srcFiles).length + '개 소스 파일, ' + srcFolders.size + '개 하위 폴더)';
    $srcInput.value = ''; // 다른 쪽 초기화
    checkReady();
  } catch(err) {
    info.textContent = 'ZIP 해제 실패: ' + err.message;
    info.classList.add('empty');
    console.error(err);
  }
});

$runBtn.addEventListener('click', function(){ p22_run(); });

function checkReady(){
  $runBtn.disabled = !(pdfFile && Object.keys(srcFiles).length);
}

function getExt(name){
  var dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot).toLowerCase() : '';
}

/* ── PDF Worker 설정 (panel8/9와 동일 패턴) ── */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    location.href.replace(/\/[^/]*$/, '/') + 'libs/pdf.worker.min.js';
}

/* ── PDF Text Extraction (원본 comparator.html과 동일) ── */
async function extractPdfText(file){
  var buf = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({data:buf}).promise;
  var pages = [];
  for (var i = 1; i <= pdf.numPages; i++){
    var page = await pdf.getPage(i);
    var tc = await page.getTextContent();
    var items = [].concat(tc.items).filter(function(it){return it.str !== undefined;}).sort(function(a,b){
      var dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 3) return dy;
      return a.transform[4] - b.transform[4];
    });
    var text = '', prevY = null, prevEndX = null;
    for (var j = 0; j < items.length; j++){
      var it = items[j];
      var x = it.transform[4], y = it.transform[5];
      if (prevY !== null){
        if (Math.abs(y - prevY) > 3){ text += '\n'; prevEndX = null; }
        else if (prevEndX !== null && x - prevEndX > 8){ text += '\t'; }
      }
      text += it.str;
      prevY = y;
      prevEndX = x + (it.width || it.str.length * 5);
    }
    pages.push(text);
  }
  return pages;
}

/* ── Normalization Helpers ── */
function normPdf(s){
  // 사이드바/마지널 노트 제거: 탭 뒤 코드 문법 없는 한국어 텍스트
  // 예: 'log("에러:", e)\t직접 해보기' → 'log("에러:", e)'
  s = s.replace(/\t([^\t]*)$/, function(m, tail){
    if (!/[{}()\[\];=<>\/\\|&^~`@+\-*%!"'#]/.test(tail) && /[\uAC00-\uD7AF]/.test(tail)) return '';
    return m;
  });
  // 제어 문자 제거
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // PDF에서 분리된 연산자 복원
  s = s.replace(/= =/g,'==').replace(/! =/g,'!=');
  s = s.replace(/> =/g,'>=').replace(/< =/g,'<=');
  s = s.replace(/\+ =/g,'+=').replace(/- =/g,'-=');
  s = s.replace(/\* =/g,'*=').replace(/\/ =/g,'/=');
  s = s.replace(/\* \*/g,'**');           // ** 연산자
  s = s.replace(/< </g,'<<').replace(/> >/g,'>>'); // 비트 시프트
  // 언더스코어 복원: _ _ → __
  s = s.replace(/_ _(\w+)_ _/g,'__$1__');
  s = s.replace(/(?<!\w)_ _(?=\w)/g,'__');
  s = s.replace(/(?<=\w)_ _(?!\w)/g,'__');
  s = s.replace(/_ _/g,'__');
  // f-string 분리 복원: f " → f"
  s = s.replace(/\bf\s+"/g,'f"').replace(/\bf\s+'/g,"f'");
  // r-string 분리 복원: r " → r"
  s = s.replace(/\br\s+"/g,'r"').replace(/\br\s+'/g,"r'");
  // 데코레이터 분리: @ 접두어
  s = s.replace(/^@\s+/,'@');
  // ... (ellipsis) 복원
  s = s.replace(/\.\s\.\s\./g,'...');
  return s;
}

function normWs(s){ return s.replace(/\s+/g,' ').trim(); }

// 공격적 정규화: 모든 공백 제거 (PDF 글자 분리 아티팩트 대응)
// 1차 normWs 매칭 실패 시 2차 시도용
function normAggressive(s){
  return normWs(normPdf(s)).replace(/\s+/g,'');
}

// 후행 주석 제거: 문자열 밖 첫 # 이후 제거
// "x = func()  # 설명" → "x = func()"
// "# 전체 주석" → "# 전체 주석" (코드 없으면 원본 유지)
// 's = "a#b"  # comment' → 's = "a#b"'
function _stripComment(s){
  var inStr = false, ch = '';
  for (var i = 0; i < s.length; i++){
    var c = s[i];
    if (inStr){
      if (c === ch && (i === 0 || s[i-1] !== '\\')) inStr = false;
    } else {
      if (c === '"' || c === "'"){ inStr = true; ch = c; }
      else if (c === '#'){
        var before = s.substring(0, i).trimEnd();
        return before || s; // 코드 없으면(주석 전용 줄) 원본 유지
      }
    }
  }
  return s;
}

function esc(s){
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}


/* ── Build source index ── */
async function buildSourceIndex(){
  var idx = {};
  var byFolder = {};
  var promises = [];
  var skipped = 0;
  var skippedFiles = [];
  var entries = Object.entries(srcFiles);
  for (var k = 0; k < entries.length; k++){
    (function(rel, fileOrStr){
      var p = typeof fileOrStr === 'string'
        ? Promise.resolve(fileOrStr)
        : fileOrStr.text();
      promises.push(p.then(function(content){
        var parts = rel.replace(/\\/g, '/').split('/');
        var fname = parts[parts.length - 1];
        var folder = parts.length >= 3 ? parts[1] : '';
        if (!idx[fname]) idx[fname] = [];
        idx[fname].push({relPath:rel, content:content});
        if (folder){
          if (!byFolder[folder]) byFolder[folder] = {};
          if (!byFolder[folder][fname]) byFolder[folder][fname] = [];
          byFolder[folder][fname].push({relPath:rel, content:content});
        }
      }).catch(function(err){
        skipped++;
        skippedFiles.push(rel);
        console.warn('파일 읽기 실패 (건너뜀):', rel, err.message);
      }));
    })(entries[k][0], entries[k][1]);
  }
  await Promise.all(promises);
  if (skipped > 0){
    console.warn('총 ' + skipped + '개 파일을 읽지 못해 건너뛰었습니다:', skippedFiles);
  }
  return {idx:idx, byFolder:byFolder, skipped:skipped, skippedFiles:skippedFiles};
}

// PDF 텍스트 추출 시 파일명 아티팩트 정규화
// data _ loader.py, data\t_loader.py, data_ loader .py → data_loader.py
function normFilename(s){
  s = s.replace(/_ _/g,'__');       // _ _ → __
  s = s.replace(/\s*_\s*/g,'_');    // 공백_공백 → _
  s = s.replace(/\s*\.\s*/g,'.');   // 공백.공백 → .
  s = s.replace(/\t/g,'');          // 탭 제거
  return s.trim();
}

// 조판 강제 개행 감지: 괄호 미닫힘 또는 후행 연산자/쉼표
function _looksIncomplete(s){
  var depth = 0;
  for (var ci = 0; ci < s.length; ci++){
    var ch = s.charAt(ci);
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
  }
  if (depth > 0) return true;
  var t = s.trimEnd();
  return /[,(\[{\\+\-*\/|&]$/.test(t) || /[=\-]>$/.test(t) || /\b(and|or|not|in|is)\s*$/.test(t);
}

/* ══════════════════════════════════════════════════
   코드 블록 추출 — comparator.html 원본 알고리즘 충실 재현

   원리: 책의 코드 리스팅에는 줄번호가 붙어있고, 설명 문장에는 없음.
   → 줄번호 패턴이 있는 줄만 수집하면 자동으로 설명 제외, 코드만 추출.

   유일한 변경: isFilename에서 .py → CODE_EXTS 다중 확장자 지원
   ══════════════════════════════════════════════════ */
function extractCodeBlocks(pages){
  var LINE_RE  = /^\t?\s*(\d{1,4})\t/;    // tab NUM tab (PyMuPDF style)
  var LINE_RE2 = /^(\d{1,4})\s{2,}(.+)/;  // NUM  CODE (PDF.js style)
  var LINE_RE3 = /^(\d{1,4})$/;           // standalone number

  function isFilename(s){
    s = normFilename(s.trim());
    // 트리 문자는 무조건 차단
    if (/^[\u2502\u251C\u2514\u2500]/.test(s)) return null;
    // 줄번호 접두어(1~4자리 숫자 + 비알파벳) → 코드 줄이지 파일명 아님
    // 예: "1  # data_loader.py", "28  self.path = path" 차단
    // 단, "2048game.py" 같은 숫자 시작 파일명은 허용 (숫자+알파벳)
    if (/^\d{1,4}(?!\w)/.test(s)) return null;
    // "# filename.py" 패턴 허용: # 접두어 제거 후 파일명 검사
    if (/^#+\s+/.test(s)) s = s.replace(/^#+\s+/, '');
    if (s.length < 3) return null;

    // ① 직접 매칭: 전체 문자열이 파일명
    if (s.length < 60){
      var ext = getExt(s);
      if (ext && CODE_EXTS.indexOf(ext) >= 0){
        var base = s.split('/').pop().split('\\').pop();
        return {base:base, pdfPath:s};
      }
    }

    // ② 토큰 추출: "[코드 3-5] spec_llm.py" / "spec_llm.py — 설명" 등
    //    실행 코드 줄은 제외 (=, ;, 함수호출 패턴)
    if (s.length > 120) return null;
    if (/[=;]/.test(s) || /\w\s*\(/.test(s)) return null;
    var fnRe = /([\w][\w.\-\/\\]*\.\w+)/;
    var m = s.match(fnRe);
    if (m && m[1].length >= 3 && m[1].length < 60){
      var tok = normFilename(m[1]);
      var tokExt = getExt(tok);
      if (tokExt && CODE_EXTS.indexOf(tokExt) >= 0){
        var tokBase = tok.split('/').pop().split('\\').pop();
        return {base:tokBase, pdfPath:tok};
      }
    }

    return null;
  }

  // 다음 줄을 code로 가져올 때 줄번호 접두어 strip (루프 밖에 정의)
  function stripNumPrefix(s){
    var t = s.trim();
    var m = t.match(/^(\d{1,4})\s{2,}(.+)/);
    if (m) return m[2];
    var m2 = t.match(/^(\d{1,4})\t(.+)/);
    if (m2) return m2[2];
    return s;
  }

  var blocks = [];
  var curFile = null, curPdfPath = '', curLines = [], curPages = new Set(), lastLn = 0;
  var nonCodeLines = 0; // 비코드 줄 연속 카운터 (블록 경계 감지용)

  for (var pi = 0; pi < pages.length; pi++){
    var pageNum = pi + 1;
    var lines = pages[pi].split('\n');

    for (var li = 0; li < lines.length; li++){
      var line = lines[li];
      var trimmed = line.trim();

      // 파일명 라벨?
      var fnResult = isFilename(trimmed);
      if (fnResult){
        var basename = fnResult.base;
        var pdfPath = fnResult.pdfPath;
        if (curFile && curFile.endsWith('?') && curLines.length){ curFile = basename; curPdfPath = pdfPath; nonCodeLines = 0; continue; }
        if (basename !== curFile || pdfPath !== curPdfPath){
          if (curFile && curLines.length){
            blocks.push({filename:curFile, pdfPath:curPdfPath, code_lines:curLines.slice(), pages:new Set(curPages)});
          }
          curFile = basename; curPdfPath = pdfPath; curLines = []; curPages = new Set(); lastLn = 0;
        }
        nonCodeLines = 0;
        continue;
      }

      // 줄번호 패턴 매칭
      var ln = null, code = '';

      // 패턴1: \t NUM \t ...
      var m1 = line.match(LINE_RE);
      if (m1){
        ln = parseInt(m1[1]);
        var rest = line.substring(m1.index + m1[0].length).trimEnd();
        if (rest){ code = rest; }
        else if (li + 1 < lines.length){
          var next = lines[li + 1];
          if (next.trim() && !LINE_RE.test(next) && !LINE_RE3.test(next.trim())){
            code = stripNumPrefix(next); li++;
          }
        }
      }

      // 패턴2: NUM  CODE (공백 2개+)
      if (ln === null){
        var m2 = trimmed.match(LINE_RE2);
        if (m2){ ln = parseInt(m2[1]); code = m2[2]; }
      }

      // 패턴3: 독립 숫자 + 다음 줄이 코드
      if (ln === null){
        var m3 = trimmed.match(LINE_RE3);
        if (m3 && parseInt(m3[1]) >= 1 && parseInt(m3[1]) <= 9999){
          // 페이지 번호 오감지 방지: 직전 줄이 코드 문법 없는 한국어(머리글/제목)면 건너뜀
          // 예: "hapter 04 영업 데이터 분석과 시각화" 다음 "129" → 페이지 번호
          var prevLn = li > 0 ? lines[li - 1].trim() : '';
          var looksPageNum = prevLn && /[\uAC00-\uD7AF]/.test(prevLn)
              && !/[{}()\[\];=<>\/\\#]/.test(prevLn);
          if (!looksPageNum){
            ln = parseInt(m3[1]);
            if (li + 1 < lines.length){
              var next2 = lines[li + 1];
              if (next2.trim() && !LINE_RE3.test(next2.trim())){
                code = stripNumPrefix(next2); li++;
              }
            }
          }
        }
      }

      // 줄번호 뒤 파일명 감지: "15  client_sse.py" → code="client_sse.py"
      // 줄번호 패턴에 걸렸지만, 추출된 code가 파일명이면 새 블록 시작
      if (ln !== null && code){
        var fnCheck = isFilename(code.trim());
        if (fnCheck){
          if (curFile && curLines.length){
            blocks.push({filename:curFile, pdfPath:curPdfPath, code_lines:curLines.slice(), pages:new Set(curPages)});
          }
          curFile = fnCheck.base; curPdfPath = fnCheck.pdfPath;
          curLines = []; curPages = new Set(); lastLn = 0; nonCodeLines = 0;
          continue;
        }
      }

      // 조판 강제 개행 병합:
      // (1) 괄호 미닫힘 → 다음 줄(줄번호·주석 아닌)을 이어붙임
      // (2) 후행 주석 → 코드 완성 시 # 주석 밀려난 경우 1줄 병합
      if (ln !== null && code){
        // (1) 괄호 미닫힘 → 다음 줄(줄번호·주석 아닌)을 이어붙임
        while (li + 1 < lines.length && _looksIncomplete(code)){
          var cont = lines[li + 1];
          var contTrim = cont.trim();
          if (!contTrim) break;
          if (LINE_RE.test(cont) || LINE_RE2.test(contTrim) || LINE_RE3.test(contTrim)) break;
          if (isFilename(contTrim)) break;
          if (/^#/.test(contTrim)) break; // 주석은 삼키지 않음 (괄호 depth 오염 방지)
          code += ' ' + contTrim;
          li++;
        }
        // (2) 후행 주석 병합 (코드가 완성된 경우에만)
        //     미완성 코드 뒤 # 주석은 인라인 주석이지 밀려난 후행 주석이 아님
        if (!_looksIncomplete(code) && li + 1 < lines.length){
          var cmt = lines[li + 1], cmtT = cmt.trim();
          if (cmtT && /^#/.test(cmtT)
              && !LINE_RE.test(cmt) && !LINE_RE2.test(cmtT) && !LINE_RE3.test(cmtT)
              && !isFilename(cmtT)){
            code += '  ' + cmtT;
            li++;
          }
        }
      }

      if (ln !== null && curFile){
        if (ln < 1 || ln > 9999) continue;

        // 코드 없는 독립 숫자: 페이지 번호일 가능성 높음 → lastLn 오염 방지
        // 예: 코드 뒤에 "129" 단독 → 코드 줄번호가 아닌 페이지 번호
        if (!code){ nonCodeLines++; continue; }

        // 조기 제목/머리글 차단: lastLn 오염 방지 (블록 분리·페이지 범위 왜곡 예방)
        // "217  Chapter 06 약관 기반 질의응답" → ln=217이 lastLn에 남으면 안 됨
        if (code){
          var _pre = normPdf(code).trimEnd();
          if (!_pre.trim()){ nonCodeLines++; continue; }
          if (/^(Part|PART|[Cc]?hapter|CHAPTER|Appendix|APPENDIX)\s/i.test(_pre)){ nonCodeLines++; continue; }
          if (/^(제?\s*\d+\s*(장|절|부|편|章)|부록|서문|머리말|들어가며|마치며|찾아보기|참고문헌|에필로그|프롤로그|옮긴이)/.test(_pre)){ nonCodeLines++; continue; }
          // 코드 문법 없는 한국어 전용 줄도 조기 차단 (제목 변형 대응)
          if (/[\uAC00-\uD7AF]/.test(_pre) && !/[{}()\[\];=<>\/\\|&^~`#:@+\-*%!"']/.test(_pre) && !/^(import |from |def |class |if |for |while |return |async |await )/.test(_pre)){ nonCodeLines++; continue; }
        }

        // 블록 분리: (1) 큰 줄번호 점프, (2) 갭 후 줄번호 감소, (3) 줄번호 1 리셋
        var doSplit = false;
        if (lastLn > 0 && curLines.length){
          if (ln < lastLn - 5) doSplit = true;                    // 큰 점프 (갭 불필요)
          if (nonCodeLines >= 3 && ln < lastLn) doSplit = true;   // 갭 3줄+ & 줄번호 감소
          if (nonCodeLines >= 1 && ln <= 2 && lastLn > 5) doSplit = true; // 줄번호 1~2 리셋 (갭 1줄이면 충분)
        }
        if (doSplit){
          blocks.push({filename:curFile, pdfPath:curPdfPath, code_lines:curLines.slice(), pages:new Set(curPages)});
          curFile = curFile + '?'; curLines = []; curPages = new Set(); lastLn = 0;
        }
        nonCodeLines = 0;
        lastLn = ln;

        if (code){
          var cleaned = _pre; // 이미 위에서 normPdf 적용됨
          // 생략 마커
          if (/\uc0dd\ub7b5/.test(cleaned)){ curLines.push(null); continue; }
          // 코드인지 판별 — 아래 중 하나라도 해당하면 코드
          // a) 코드 키워드로 시작
          // b) 코드 문법 문자(연산자/괄호/구두점) 포함
          // c) 들여쓰기(공백2+)로 시작
          var isCode = /^(import |from |def |class |return |if |elif |else:|for |while |try:|except |with |async |await |raise |yield |pass|break|continue|lambda )/.test(cleaned)
            || /[{}()\[\];=<>\/\\|&^~`#:@+\-*%!"',.]/.test(cleaned)
            || /^\s{2,}\S/.test(cleaned);
          if (isCode){
            curLines.push(cleaned); curPages.add(pageNum);
          }
        }
      } else if (ln === null) {
        // 파일명도 코드줄도 아닌 줄 → 갭 카운터 증가
        nonCodeLines++;
      }
    }
  }
  if (curFile && curLines.length){
    blocks.push({filename:curFile, pdfPath:curPdfPath, code_lines:curLines.slice(), pages:new Set(curPages)});
  }
  return blocks;
}

/* ── Match & Compare ── */

/**
 * 2-pass 매칭: 페이지→프로젝트 폴더 맵을 구축한 뒤 중복 파일명도 정확 매칭
 *
 * Pass 1: 고유 파일명(후보 1개)으로 확실한 매칭 → 페이지↔폴더 맵 구축
 * Pass 2: 중복 파일명은 해당 페이지가 속하는 폴더의 후보만 선택
 */
function matchAllBlocks(blocks, sourceIdx){
  var results = new Array(blocks.length);

  // ── Pass 1: 고유 파일명으로 확정 매칭 + 페이지→폴더 맵 구축 ──
  var pageToFolder = {}; // pageNum → folderName

  // 정규화된 파일명 → 원본 키 매핑 (폴백용)
  var normToKeys = {};
  var idxKeys = Object.keys(sourceIdx);
  for (var nk = 0; nk < idxKeys.length; nk++){
    var nkey = normFilename(idxKeys[nk]);
    if (!normToKeys[nkey]) normToKeys[nkey] = [];
    normToKeys[nkey].push(idxKeys[nk]);
  }

  for (var i = 0; i < blocks.length; i++){
    var block = blocks[i];
    // ? 접미사: 파일명 불확실 (갭/점프로 분리된 블록) → Pass 2 내용 매칭으로 위임
    if (block.filename.endsWith('?')){ results[i] = null; continue; }
    var fname = block.filename;
    var candidates = sourceIdx[fname];
    // 정규화 폴백: data _ loader.py → data_loader.py로 재검색
    if ((!candidates || !candidates.length) && fname !== normFilename(fname)){
      var nf = normFilename(fname);
      var mappedKeys = normToKeys[nf];
      if (mappedKeys){
        candidates = [];
        for (var mk = 0; mk < mappedKeys.length; mk++){
          candidates = candidates.concat(sourceIdx[mappedKeys[mk]]);
        }
      }
    }
    if (!candidates || !candidates.length){ results[i] = null; continue; }

    if (candidates.length === 1){
      // 후보 1개 → 확정
      results[i] = candidates[0];
      // 이 블록의 페이지들을 해당 폴더에 할당
      var folder = getFolderFromPath(candidates[0].relPath);
      if (folder){
        block.pages.forEach(function(p){ pageToFolder[p] = folder; });
      }
    } else {
      // PDF 경로로 1개로 좁혀지면 확정
      var pdfPath = block.pdfPath || '';
      if (pdfPath && pdfPath.indexOf('/') >= 0){
        var pathFiltered = candidates.filter(function(c){
          return c.relPath.indexOf(pdfPath) >= 0;
        });
        if (pathFiltered.length === 1){
          results[i] = pathFiltered[0];
          var folder2 = getFolderFromPath(pathFiltered[0].relPath);
          if (folder2){
            block.pages.forEach(function(p){ pageToFolder[p] = folder2; });
          }
          continue;
        }
      }
      results[i] = null; // Pass 2에서 처리
    }
  }

  // ── Pass 2: 미매칭 블록 → 페이지→폴더 맵으로 프로젝트 특정 후 매칭 ──
  for (var i2 = 0; i2 < blocks.length; i2++){
    if (results[i2] !== null) continue;

    var block2 = blocks[i2];

    // ? 접미사 블록: 파일명 불확실 → 전체 소스 대상 내용 기반 매칭
    if (block2.filename.endsWith('?')){
      var allCand = [];
      for (var aik = 0; aik < idxKeys.length; aik++){
        allCand = allCand.concat(sourceIdx[idxKeys[aik]]);
      }
      if (allCand.length){
        var contentMatch = bestByContent(block2, allCand);
        if (contentMatch){
          results[i2] = contentMatch;
          block2.filename = contentMatch.relPath.split('/').pop();
          var fc = getFolderFromPath(contentMatch.relPath);
          if (fc){ block2.pages.forEach(function(p){ pageToFolder[p] = fc; }); }
        }
      }
      continue;
    }

    var fname2 = block2.filename;
    var candidates2 = sourceIdx[fname2];
    // 정규화 폴백
    if ((!candidates2 || !candidates2.length) && fname2 !== normFilename(fname2)){
      var nf2 = normFilename(fname2);
      var mappedKeys2 = normToKeys[nf2];
      if (mappedKeys2){
        candidates2 = [];
        for (var mk2 = 0; mk2 < mappedKeys2.length; mk2++){
          candidates2 = candidates2.concat(sourceIdx[mappedKeys2[mk2]]);
        }
      }
    }
    if (!candidates2 || !candidates2.length) continue;

    // 이 블록의 페이지에서 폴더 추정
    var folderGuess = guessFolderFromPages(block2.pages, pageToFolder);

    if (folderGuess && candidates2.length > 1){
      // 해당 폴더 후보만 필터
      var folderFiltered = candidates2.filter(function(c){
        return getFolderFromPath(c.relPath) === folderGuess;
      });
      if (folderFiltered.length === 1){
        results[i2] = folderFiltered[0];
        // Pass 2 결과도 맵에 반영 → 후속 블록에 도움
        var f3 = getFolderFromPath(folderFiltered[0].relPath);
        if (f3){ block2.pages.forEach(function(p){ pageToFolder[p] = f3; }); }
        continue;
      }
      if (folderFiltered.length > 1) candidates2 = folderFiltered;
    }

    // 폴더로도 안 좁혀지면 content overlap
    var matched = bestByContent(block2, candidates2);
    results[i2] = matched;
    // content match 결과도 맵에 반영
    if (matched){
      var f4 = getFolderFromPath(matched.relPath);
      if (f4){ block2.pages.forEach(function(p){ pageToFolder[p] = f4; }); }
    }
  }

  // ── Pass 3: 매칭 품질 검증 — 일치율 낮은 블록은 전체 소스 대상 재매칭 ──
  // 블록 분리 실패로 다른 파일 코드가 섞였을 때 올바른 소스로 교정
  for (var i3 = 0; i3 < blocks.length; i3++){
    if (!results[i3]) continue;
    var block3 = blocks[i3];
    var curMatch = results[i3];
    var pdfLines3 = block3.code_lines.filter(function(c){ return c !== null; });
    if (pdfLines3.length < 5) continue; // 짧은 블록은 검증 생략

    // 현재 매칭의 일치율 계산
    var curNorms = new Set(curMatch.content.split('\n').map(function(l){ return normWs(l); }).filter(function(l){ return l; }));
    var curHit = 0;
    for (var p3 = 0; p3 < pdfLines3.length; p3++){
      var n3 = normWs(normPdf(pdfLines3[p3]));
      if (n3 && curNorms.has(n3)) curHit++;
    }
    var curRate = curHit / pdfLines3.length;

    if (curRate >= 0.4) continue; // 40% 이상이면 OK

    // 전체 소스 대상 재매칭
    var allCand3 = [];
    for (var ak3 = 0; ak3 < idxKeys.length; ak3++){
      allCand3 = allCand3.concat(sourceIdx[idxKeys[ak3]]);
    }
    var bestAlt = null, bestAltHit = curHit;
    for (var ac3 = 0; ac3 < allCand3.length; ac3++){
      if (allCand3[ac3].relPath === curMatch.relPath) continue;
      var altNorms = new Set(allCand3[ac3].content.split('\n').map(function(l){ return normWs(l); }).filter(function(l){ return l; }));
      var altHit = 0;
      for (var ap3 = 0; ap3 < pdfLines3.length; ap3++){
        var an3 = normWs(normPdf(pdfLines3[ap3]));
        if (an3 && altNorms.has(an3)) altHit++;
      }
      if (altHit > bestAltHit){ bestAltHit = altHit; bestAlt = allCand3[ac3]; }
    }
    if (bestAlt){
      console.log('[panel22] Pass 3 재매칭:', block3.filename, curMatch.relPath,
        '→', bestAlt.relPath, '(' + curHit + '→' + bestAltHit + '/' + pdfLines3.length + ')');
      results[i3] = bestAlt;
      block3.filename = bestAlt.relPath.split('/').pop();
      var f5 = getFolderFromPath(bestAlt.relPath);
      if (f5){ block3.pages.forEach(function(p){ pageToFolder[p] = f5; }); }
    }
  }

  return results;
}

function getFolderFromPath(relPath){
  var parts = relPath.split('/');
  // topFolder/projectFolder/... → projectFolder
  return parts.length >= 3 ? parts[1] : (parts.length >= 2 ? parts[0] : '');
}

function guessFolderFromPages(pagesSet, pageToFolder){
  // 블록 페이지 중 가장 많이 등장하는 폴더
  var freq = {};
  pagesSet.forEach(function(p){
    var f = pageToFolder[p];
    if (f){ freq[f] = (freq[f] || 0) + 1; }
  });
  // 인접 페이지도 확인 (±3)
  pagesSet.forEach(function(p){
    for (var d = -3; d <= 3; d++){
      var f = pageToFolder[p + d];
      if (f){ freq[f] = (freq[f] || 0) + 1; }
    }
  });
  var best = null, bestCnt = 0;
  var keys = Object.keys(freq);
  for (var k = 0; k < keys.length; k++){
    if (freq[keys[k]] > bestCnt){ bestCnt = freq[keys[k]]; best = keys[k]; }
  }
  return best;
}

function bestByContent(block, candidates){
  var best = null, bestScore = -1;
  for (var i = 0; i < candidates.length; i++){
    var cand = candidates[i];
    var srcLines = cand.content.split('\n');
    var srcNorms = new Set(srcLines.map(function(l){return normWs(l);}).filter(function(l){return l;}));
    var srcAggs = new Set(srcLines.map(function(l){return normAggressive(l);}).filter(function(l){return l;}));
    var score = 0;
    for (var j = 0; j < block.code_lines.length; j++){
      var cl = block.code_lines[j];
      if (cl === null) continue;
      var n = normWs(normPdf(cl));
      if (n && srcNorms.has(n)){ score++; continue; }
      var na = normAggressive(cl);
      if (na && srcAggs.has(na)) score++;
    }
    if (score > bestScore){ bestScore = score; best = cand; }
  }
  // 최소 임계값: 코드줄의 20% 이상 매칭되어야 유효 (import 1줄 공유로 잘못 매칭 방지)
  var codeCount = block.code_lines.filter(function(c){return c!==null;}).length;
  if (codeCount > 3 && bestScore / codeCount < 0.2) return null;
  return best;
}

/**
 * 같은 소스 파일에 매칭된 블록 병합 (위치 무관)
 * p.221과 p.398이 같은 소스 파일이면 하나로 합침
 */
function mergeMatchedBlocks(blocks, matches){
  var merged = {};  // relPath → {block, match}
  var order = [];   // 첫 등장 순서 유지

  for (var i = 0; i < blocks.length; i++){
    var src = matches[i];
    var key = src ? src.relPath : ('__unmatched_' + i);

    if (src && merged[key]){
      // 기존 블록에 병합
      var prev = merged[key].block;
      prev.code_lines.push(null); // 구분용 생략
      prev.code_lines = prev.code_lines.concat(blocks[i].code_lines);
      blocks[i].pages.forEach(function(p){ prev.pages.add(p); });
    } else {
      var entry = {
        block: {
          filename: blocks[i].filename,
          pdfPath: blocks[i].pdfPath,
          code_lines: blocks[i].code_lines.slice(),
          pages: new Set(blocks[i].pages)
        },
        match: src
      };
      merged[key] = entry;
      order.push(key);
    }
  }

  var newBlocks = [];
  var newMatches = [];
  for (var j = 0; j < order.length; j++){
    var e = merged[order[j]];
    newBlocks.push(e.block);
    newMatches.push(e.match);
  }
  return {blocks:newBlocks, matches:newMatches};
}

function compareBlock(block, srcContent){
  console.log('[panel22 DEBUG] compareBlock:', block.filename,
    '| srcContent length:', (srcContent||'').length,
    '| srcContent 첫 80자:', (srcContent||'').substring(0,80).replace(/\n/g,'↵'),
    '| PDF code_lines:', block.code_lines.filter(function(c){return c!==null;}).length);
  var srcLines = srcContent.split('\n');
  var srcLookup = {}, srcLookupAgg = {}, srcLookupCode = {}, srcLookupCodeAgg = {};
  for (var i = 0; i < srcLines.length; i++){
    var raw = srcLines[i].replace(/[\r\n]+$/,'');
    var n = normWs(raw);
    if (n){ if (!srcLookup[n]) srcLookup[n] = []; srcLookup[n].push(raw); }
    var na = normAggressive(raw);
    if (na){ if (!srcLookupAgg[na]) srcLookupAgg[na] = []; srcLookupAgg[na].push(raw); }
    // 주석 제거 인덱스: "code  # comment" → "code" 로도 매칭 가능하게
    var stripped = _stripComment(raw);
    if (stripped !== raw){
      var sn = normWs(stripped);
      if (sn){ if (!srcLookupCode[sn]) srcLookupCode[sn] = []; srcLookupCode[sn].push(raw); }
      var sna = normAggressive(stripped);
      if (sna){ if (!srcLookupCodeAgg[sna]) srcLookupCodeAgg[sna] = []; srcLookupCodeAgg[sna].push(raw); }
    }
  }
  // 소스에서도 여러 줄로 쓴 코드를 합쳐서 인덱싱 (PDF 병합 줄과 매칭용)
  // 예: def foo(\n    arg1,\n    arg2\n): → "def foo( arg1, arg2 ):"
  for (var si2 = 0; si2 < srcLines.length; si2++){
    var sraw = srcLines[si2].replace(/[\r\n]+$/,'');
    if (!sraw.trim()) continue;
    var sMerged = sraw;
    // 괄호 미닫힘이면 다음 줄들을 합침 (최대 8줄)
    for (var sk = 1; sk <= 8 && si2 + sk < srcLines.length; sk++){
      if (!_looksIncomplete(sMerged)) break;
      var sNext = srcLines[si2 + sk].replace(/[\r\n]+$/,'').trim();
      if (!sNext) break;
      sMerged += ' ' + sNext;
    }
    if (sMerged !== sraw){
      var nm = normWs(sMerged);
      if (nm && !srcLookup[nm]){ srcLookup[nm] = []; srcLookup[nm].push(sMerged); }
      var nma = normAggressive(sMerged);
      if (nma && !srcLookupAgg[nma]){ srcLookupAgg[nma] = []; srcLookupAgg[nma].push(sMerged); }
    }
  }
  console.log('[panel22 DEBUG]', block.filename, '| srcLines:', srcLines.length, '| srcLookup entries:', Object.keys(srcLookup).length);

  var comparisons = [];
  var stats = {match:0, near_match:0, diff:0, omitted:0};

  for (var ci = 0; ci < block.code_lines.length; ci++){
    var cl = block.code_lines[ci];
    if (cl === null){
      stats.omitted++;
      comparisons.push({status:'omitted', pdf_code:'(... 생략 ...)', src_code:''});
      continue;
    }
    // 원본과 동일: 첫 줄만 추출 + multi-line join 정규화
    var first = cl.split('\n')[0];
    var pdfClean = normPdf(first).trimEnd();
    if (!pdfClean.trim()) continue;

    var pdfNorms = new Set([normWs(pdfClean)]);
    if (cl.indexOf('\n') >= 0){
      pdfNorms.add(normWs(normPdf(cl.split('\n').map(function(l){return l.trim();}).join(' '))));
    }

    // Exact match
    var found = false, matchedSrc = '';
    pdfNorms.forEach(function(pn){
      if (!found && srcLookup[pn]){ matchedSrc = srcLookup[pn][0]; found = true; }
    });

    // 2차: 공격적 정규화 매칭 (PDF 공백 아티팩트 대응)
    if (!found){
      var pdfAgg = normAggressive(pdfClean);
      if (pdfAgg && srcLookupAgg[pdfAgg]){ matchedSrc = srcLookupAgg[pdfAgg][0]; found = true; }
    }

    // 2.5차: 소스 주석 제거 매칭 — PDF에 주석 없고 소스에 주석 있는 경우
    // 예: PDF "x = func()" vs Source "x = func()  # comment"
    if (!found){
      var pdfN25 = normWs(pdfClean);
      if (pdfN25 && srcLookupCode[pdfN25]){ matchedSrc = srcLookupCode[pdfN25][0]; found = true; }
      if (!found){
        var pdfA25 = normAggressive(pdfClean);
        if (pdfA25 && srcLookupCodeAgg[pdfA25]){ matchedSrc = srcLookupCodeAgg[pdfA25][0]; found = true; }
      }
    }

    if (found){
      stats.match++;
      comparisons.push({status:'match', pdf_code:pdfClean, src_code:matchedSrc});
    } else {
      // 3차: 주석 인식 매칭 — 양쪽 주석 제거 후 코드만 비교
      // (a) PDF에 주석 추가됨: "code  # 설명" → strip → "code" vs srcLookupCode
      // (b) 양쪽 주석 다름: "code  # 한글" vs "code  # english" → 코드 동일
      var commentFound = false, commentSrc = '';
      var pdfStripped = _stripComment(pdfClean);
      if (pdfStripped !== pdfClean && pdfStripped){
        var csNorm = normWs(pdfStripped);
        if (csNorm && srcLookup[csNorm]){
          commentFound = true; commentSrc = srcLookup[csNorm][0];
        } else if (csNorm && srcLookupCode[csNorm]){
          commentFound = true; commentSrc = srcLookupCode[csNorm][0];
        } else {
          var csAgg = normAggressive(pdfStripped);
          if (csAgg && srcLookupAgg[csAgg]){
            commentFound = true; commentSrc = srcLookupAgg[csAgg][0];
          } else if (csAgg && srcLookupCodeAgg[csAgg]){
            commentFound = true; commentSrc = srcLookupCodeAgg[csAgg][0];
          }
        }
      }
      if (commentFound){
        stats.match++;
        comparisons.push({status:'comment_extra', pdf_code:pdfClean, src_code:commentSrc});
      } else {
      // Fuzzy match — 원본과 동일: srcLookup 순회 (중복 제거), 조기종료 없음
      var bestRatio = 0, bestSrc = '';
      var lookupEntries = Object.entries(srcLookup);
      for (var le = 0; le < lookupEntries.length; le++){
        var nk = lookupEntries[le][0], entries = lookupEntries[le][1];
        pdfNorms.forEach(function(pn){
          var r = similarity(pn, nk);
          if (r > bestRatio){ bestRatio = r; bestSrc = entries[0]; }
        });
      }
      if (bestRatio >= 0.90){
        stats.near_match++;
        comparisons.push({status:'near_match', pdf_code:pdfClean, src_code:bestSrc, similarity:bestRatio.toFixed(2)});
      } else {
        stats.diff++;
        comparisons.push({status:'diff', pdf_code:pdfClean,
          src_code: bestRatio > 0.4 ? bestSrc : '(not found in source)',
          similarity:bestRatio.toFixed(2)});
      }
      } // end commentFound else
    }
  }

  // 역방향: 소스 코드 중 PDF에 없는 줄 (생략 구간 보정)
  var pdfNormSet = new Set(), pdfAggSet = new Set(), pdfCodeSet = new Set();
  for (var pi = 0; pi < block.code_lines.length; pi++){
    var cll = block.code_lines[pi];
    if (cll === null) continue;
    var cllFirst = normPdf(cll.split('\n')[0]);
    pdfNormSet.add(normWs(cllFirst));
    pdfAggSet.add(normAggressive(cllFirst));
    // 주석 제거 버전도 추가 (PDF 주석 ≠ 소스 주석 대응)
    var cllStripped = _stripComment(cllFirst);
    if (cllStripped !== cllFirst){
      pdfCodeSet.add(normWs(cllStripped));
      pdfCodeSet.add(normAggressive(cllStripped));
    }
  }

  var omitCount = stats.omitted;
  var srcTotal = 0, srcCovered = 0, missingLines = [];
  for (var si = 0; si < srcLines.length; si++){
    var rawS = srcLines[si].replace(/[\r\n]+$/,'');
    var ns = normWs(rawS);
    if (!ns) continue;
    srcTotal++;
    if (pdfNormSet.has(ns) || pdfAggSet.has(normAggressive(rawS))) srcCovered++;
    // 소스 주석 제거 후 PDF 코드와 매칭
    else {
      var srcStripped = _stripComment(rawS);
      var ssn = normWs(srcStripped);
      if (ssn && (pdfNormSet.has(ssn) || pdfAggSet.has(normAggressive(srcStripped)) || pdfCodeSet.has(ssn))) srcCovered++;
      else missingLines.push(rawS);
    }
  }

  // 생략 보정: 생략된 줄은 "의도적 미포함"이므로 커버리지 분모에서 제외
  var intentionallyOmitted = 0;
  if (omitCount > 0){
    intentionallyOmitted = missingLines.length;
    var pdfCodeCount = block.code_lines.filter(function(c){return c !== null;}).length;
    intentionallyOmitted = Math.min(intentionallyOmitted, srcTotal - pdfCodeCount);
  }

  stats.src_total = srcTotal;
  stats.src_covered = srcCovered;
  stats.src_intentionally_omitted = intentionallyOmitted;
  // 보정된 커버리지: (커버된 줄) / (전체 - 의도적 생략)
  stats.src_effective_total = omitCount > 0 ? (srcTotal - intentionallyOmitted) : srcTotal;
  stats.src_missing_count = omitCount > 0 ? 0 : missingLines.length;
  stats.src_missing_lines = omitCount > 0 ? [] : missingLines.slice(0, 30);

  return {comparisons:comparisons, stats:stats};
}

// 원본과 동일한 similarity / editDistance
function similarity(a, b){
  if (a === b) return 1;
  var len = a.length + b.length;
  if (!len) return 1;
  var d = editDistance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function editDistance(a, b){
  var m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  var dp = [];
  for (var i = 0; i <= m; i++){ dp[i] = []; for (var j = 0; j <= n; j++) dp[i][j] = 0; }
  for (var i2 = 0; i2 <= m; i2++) dp[i2][0] = i2;
  for (var j2 = 0; j2 <= n; j2++) dp[0][j2] = j2;
  for (var i3 = 1; i3 <= m; i3++){
    for (var j3 = 1; j3 <= n; j3++){
      dp[i3][j3] = a[i3-1] === b[j3-1] ? dp[i3-1][j3-1] : 1 + Math.min(dp[i3-1][j3], dp[i3][j3-1], dp[i3-1][j3-1]);
    }
  }
  return dp[m][n];
}

/* ── Progress ── */
function showProg(pct, msg){
  var p = root.querySelector('#p22_prog');
  p.classList.add('show');
  var bar = root.querySelector('#p22_progBar');
  bar.style.width = pct + '%';
  bar.className = 'p22-prog-bar' + (pct >= 100 ? ' done' : '');
  root.querySelector('#p22_progMsg').textContent = msg;
}

/* ── Main Run ── */
async function p22_run(){
  $runBtn.disabled = true;
  try {
    showProg(5, 'PDF 텍스트 추출 중...');
    var pages = await extractPdfText(pdfFile);

    showProg(25, '소스 파일 읽는 중...');
    var res = await buildSourceIndex();
    var idx = res.idx;
    var idxCount = Object.keys(idx).length;
    var srcFileTotal = Object.keys(srcFiles).length;
    console.log('[panel22] 소스 인덱스:', idxCount, '개 파일명 (전체', srcFileTotal, '개 중 읽기 성공),',
      '샘플:', Object.keys(idx).slice(0,5));
    if (res.skipped > 0){
      showProg(30, '⚠ ' + res.skipped + '개 파일 읽기 실패 (OneDrive 클라우드 전용 등)');
      console.warn('[panel22] 읽기 실패 파일:', res.skippedFiles);
      await new Promise(function(r){ setTimeout(r, 1500); }); // 잠시 표시
    }

    showProg(40, '코드 블록 추출 중 (인덱스: ' + idxCount + '개 파일)...');
    var blocks = extractCodeBlocks(pages);
    console.log('[panel22] PDF 블록:', blocks.length, '개,', blocks.slice(0,3).map(function(b){return b.filename;}));

    // PDF에서 참조하는 파일명 vs 소스 인덱스 대조 → 누락 경고 (페이지·PDF경로 포함)
    var missingInSrc = [];
    var missingSet = new Set();
    for (var mi = 0; mi < blocks.length; mi++){
      var mfn = blocks[mi].filename.replace(/\?+$/,'');
      if (missingSet.has(mfn)) continue;
      if (!idx[mfn] && !idx[normFilename(mfn)]){
        missingSet.add(mfn);
        var mPages = Array.from(blocks[mi].pages).sort(function(a,b){return a-b;});
        missingInSrc.push({
          name: mfn,
          pdfPath: blocks[mi].pdfPath || mfn,
          pages: mPages,
          lines: blocks[mi].code_lines.filter(function(c){return c!==null;}).length
        });
      }
    }
    if (missingInSrc.length > 0){
      console.warn('[panel22] PDF에서 참조하지만 소스에 없는 파일:', missingInSrc);
    }

    showProg(55, '소스 파일 매칭 및 비교 중...');
    var flat = root.querySelector('#p22_flatMode').checked;

    // 2-pass 매칭: 페이지→프로젝트 폴더 맵 기반
    var matchResults = matchAllBlocks(blocks, idx);

    // 같은 소스 파일에 매칭된 블록 병합 (페이지 넘김으로 분리된 것 합치기)
    var merged = mergeMatchedBlocks(blocks, matchResults);
    blocks = merged.blocks;
    matchResults = merged.matches;

    var report = {chapters:{}, summary:{
      total_blocks:blocks.length, total_match:0, total_near_match:0,
      total_diff:0, total_omitted:0, blocks_clean:0, blocks_with_diffs:0, unmatched:0,
      total_src_lines:0, total_src_covered:0, total_src_effective:0}};

    for (var bi = 0; bi < blocks.length; bi++){
      showProg(55 + Math.round(bi / blocks.length * 35), '비교 중... ' + blocks[bi].filename);
      var block = blocks[bi];
      var src = matchResults[bi];
      var chKey = 'all';
      if (!flat && src){
        var parts = src.relPath.split('/');
        if (parts.length >= 2) chKey = parts[1];
      }
      if (!report.chapters[chKey]){
        report.chapters[chKey] = {title: chKey === 'all' ? 'All Files' : chKey, source_folder:chKey, blocks:[]};
      }

      var br = {filename:block.filename, pages:[].concat(Array.from(block.pages)).sort(function(a,b){return a-b;}),
        pdf_code_count:block.code_lines.filter(function(c){return c !== null;}).length,
        source_path:null, source_rel_path:null, comparisons:[], stats:{}};

      if (!src){
        br.source_path = 'NOT FOUND';
        br.stats = {match:0, near_match:0, diff:0, omitted:0, src_total:0, src_covered:0, src_effective_total:0, src_missing_count:0, src_missing_lines:[]};
        report.summary.unmatched++;
      } else {
        br.source_path = src.relPath;
        br.source_rel_path = src.relPath;
        var cmpRes = compareBlock(block, src.content);
        br.comparisons = cmpRes.comparisons;
        br.stats = cmpRes.stats;
        report.summary.total_match += cmpRes.stats.match;
        report.summary.total_near_match += cmpRes.stats.near_match;
        report.summary.total_diff += cmpRes.stats.diff;
        report.summary.total_omitted += cmpRes.stats.omitted;
        report.summary.total_src_lines += (cmpRes.stats.src_total || 0);
        report.summary.total_src_covered += (cmpRes.stats.src_covered || 0);
        report.summary.total_src_effective += (cmpRes.stats.src_effective_total || 0);
        if (cmpRes.stats.diff > 0) report.summary.blocks_with_diffs++;
        else report.summary.blocks_clean++;
      }
      report.chapters[chKey].blocks.push(br);
    }

    // 진단 정보 추가
    report.diag = {
      srcFileTotal: srcFileTotal,
      srcIndexed: idxCount,
      readFailed: res.skipped,
      readFailedFiles: (res.skippedFiles || []).slice(0, 20),
      missingInSrc: missingInSrc
    };

    showProg(95, '리포트 생성 중...');
    renderReport(report);
    showProg(100, '완료!');
  } catch(e) {
    var bar = root.querySelector('#p22_progBar');
    bar.style.width = '100%';
    bar.className = 'p22-prog-bar err';
    root.querySelector('#p22_progMsg').textContent = '오류: ' + e.message;
    console.error(e);
  }
  $runBtn.disabled = false;
}

/* ── Report Rendering ── */
function renderReport(data){
  var s = data.summary;
  var chapters = data.chapters;
  var total = s.total_match + s.total_near_match + s.total_diff;
  var mr = total ? (((s.total_match + s.total_near_match) / total) * 100) : 0;
  var rp = total ? (s.total_diff / total * 100) : 0;
  // 보정된 커버리지 (생략 구간 제외)
  var effTotal = s.total_src_effective || s.total_src_lines;
  var srcCov = effTotal ? ((s.total_src_covered / effTotal) * 100) : 0;
  var srcMiss = effTotal - s.total_src_covered;

  var h = '';

  // 진단 정보 (읽기 실패 또는 소스 누락이 있을 때만 표시)
  var dg = data.diag || {};
  if ((dg.readFailed > 0) || (dg.missingInSrc && dg.missingInSrc.length > 0)){
    h += '<div class="p22-sec" style="margin-top:24px;border-color:#e74c3c;background:#fef5f5">';
    h += '<div class="p22-sec-title" style="font-size:14px;color:#e74c3c">⚠ 소스 파일 진단</div>';
    h += '<div style="font-size:12px;line-height:1.6;color:#333">';
    h += '소스 파일: 전체 ' + (dg.srcFileTotal || 0) + '개 → 인덱스 ' + (dg.srcIndexed || 0) + '개';
    if (dg.readFailed > 0){
      h += '<div style="color:#e74c3c;margin:4px 0"><b>읽기 실패 ' + dg.readFailed + '개</b> (OneDrive 클라우드 전용이면 파일을 로컬에 다운로드하세요)';
      h += '<div style="font-size:11px;color:#888;max-height:60px;overflow:auto">';
      (dg.readFailedFiles || []).forEach(function(f){ h += esc(f) + '<br>'; });
      h += '</div></div>';
    }
    if (dg.missingInSrc && dg.missingInSrc.length > 0){
      h += '<div style="color:#e67e22;margin:4px 0"><b>PDF에서 참조하지만 소스에 없는 파일 ' + dg.missingInSrc.length + '개</b>';
      h += ' <span style="font-size:11px;color:#999">(소스 폴더에 해당 파일이 있는지 확인하세요)</span>';
      h += '<table style="font-size:11px;color:#555;margin:4px 0;border-collapse:collapse;width:100%">';
      h += '<tr style="color:#999;border-bottom:1px solid #eee"><td style="padding:2px 8px">파일명</td><td style="padding:2px 8px">PDF 경로</td><td style="padding:2px 8px">페이지</td><td style="padding:2px 8px">코드줄</td></tr>';
      dg.missingInSrc.forEach(function(f){
        var pg = f.pages ? (f.pages.length > 3 ? f.pages.slice(0,3).join(',')+'…' : f.pages.join(',')) : '?';
        h += '<tr style="border-bottom:1px solid #f5f5f5">';
        h += '<td style="padding:2px 8px;font-weight:600">' + esc(f.name) + '</td>';
        h += '<td style="padding:2px 8px;color:#888">' + esc(f.pdfPath || f.name) + '</td>';
        h += '<td style="padding:2px 8px">p.' + pg + '</td>';
        h += '<td style="padding:2px 8px">' + (f.lines || 0) + '줄</td>';
        h += '</tr>';
      });
      h += '</table></div>';
    }
    h += '</div></div>';
  }

  h += '<div class="p22-sec" style="margin-top:24px;border-color:var(--accent,#3b3f8c)">';
  h += '<div class="p22-sec-title" style="font-size:15px">비교 결과</div>';
  h += '<div class="p22-cards">';
  h += '<div class="p22-card b"><div class="n">' + s.total_blocks + '</div><div class="l">Code Blocks</div></div>';
  h += '<div class="p22-card b"><div class="n">' + total + '</div><div class="l">PDF Lines</div></div>';
  h += '<div class="p22-card b"><div class="n">' + s.total_src_lines + '</div><div class="l">Source Lines</div></div>';
  h += '<div class="p22-card g"><div class="n">' + s.total_match + '</div><div class="l">Exact Match</div></div>';
  h += '<div class="p22-card g"><div class="n">' + s.total_near_match + '</div><div class="l">Near Match</div></div>';
  h += '<div class="p22-card r"><div class="n">' + s.total_diff + '</div><div class="l">Different</div></div>';
  h += '<div class="p22-card y"><div class="n">' + s.total_omitted + '</div><div class="l">생략 (의도적)</div></div>';
  h += '<div class="p22-card"><div class="n">' + mr.toFixed(1) + '%</div><div class="l">PDF Match Rate</div></div>';
  h += '<div class="p22-card' + (srcCov >= 90 ? ' g' : srcCov >= 70 ? '' : ' r') + '"><div class="n">' + srcCov.toFixed(1) + '%</div><div class="l">Coverage (보정)</div></div>';
  h += '</div>';
  h += '<div style="font-size:12px;color:var(--muted2,#9b9890);margin:8px 0">';
  h += 'PDF ' + total + '줄 vs Source ' + s.total_src_lines + '줄';
  if (s.total_omitted > 0) h += ' | 생략 마커 ' + s.total_omitted + '개 (생략 구간 커버리지에서 제외)';
  h += ' | 보정 커버리지: ' + s.total_src_covered + '/' + effTotal;
  h += '</div>';
  h += '<div class="p22-rbar"><div class="bg">';
  h += '<div class="fg p22-fg-g" style="width:' + mr.toFixed(1) + '%"></div>';
  h += '<div class="fg p22-fg-r" style="width:' + rp.toFixed(1) + '%"></div>';
  h += '</div></div></div>';

  // Filter bar
  h += '<div class="p22-fbar">';
  h += '<input type="text" id="p22_searchBox" placeholder="파일명 검색...">';
  h += '<button class="p22-btn on" id="p22_f-all">All</button>';
  h += '<button class="p22-btn" id="p22_f-diff">Diffs Only</button>';
  h += '<button class="p22-btn" id="p22_f-clean">Clean Only</button>';
  h += '<button class="p22-btn" id="p22_expandAll">Expand All</button>';
  h += '<button class="p22-btn" id="p22_collapseAll">Collapse All</button>';
  h += '</div>';

  // Chapters
  var blkId = 0;
  // 챕터 순서: 숫자 자연순 정렬 (ch1 < ch2 < ch10)
  var chKeys = Object.keys(chapters).sort(function(a, b){
    return a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'});
  });
  for (var ci = 0; ci < chKeys.length; ci++){
    var ck = chKeys[ci];
    var ch = chapters[ck];
    var chMatch = 0, chDiff = 0;
    for (var bi = 0; bi < ch.blocks.length; bi++){
      chMatch += (ch.blocks[bi].stats.match || 0) + (ch.blocks[bi].stats.near_match || 0);
      chDiff += (ch.blocks[bi].stats.diff || 0);
    }
    var chTotal = chMatch + chDiff;
    var chPct = chTotal ? ((chMatch / chTotal) * 100) : 100;

    h += '<div class="p22-ch open" id="p22_ch-' + ck + '">';
    h += '<div class="p22-ch-hdr"><div><span class="p22-ch-title">' + esc(ch.title) + '</span></div>';
    h += '<div class="p22-ms"><span class="g">' + chMatch + '&#10003;</span><span class="r">' + chDiff + '&#10007;</span>';
    h += '<span style="color:var(--muted2,#9b9890)">' + chPct.toFixed(0) + '%</span></div>';
    h += '</div><div class="p22-ch-body">';

    for (var bj = 0; bj < ch.blocks.length; bj++){
      var block = ch.blocks[bj];
      var st = block.stats;
      var m = (st.match || 0) + (st.near_match || 0);
      var d = st.diff || 0;
      var hasDiff = d > 0;
      var totB = m + d;
      var mpct = totB ? ((m / totB) * 100) : 100;

      var fname = esc(block.filename.replace(/\?+$/,''));
      var rel = esc(block.source_rel_path || 'NOT FOUND');
      var pgs = block.pages;
      var pstr = pgs.length ? 'p.' + pgs[0] + '-' + pgs[pgs.length - 1] : '';
      var srcT = st.src_effective_total || st.src_total || 0;
      var srcC = st.src_covered || 0;
      var srcM = st.src_missing_count || 0;
      var srcPct = srcT ? ((srcC / srcT) * 100) : 0;
      var pdfCnt = block.pdf_code_count || 0;

      var bc, bt;
      if (!hasDiff && srcPct >= 90){ bc = 'p22-b-c'; bt = 'Clean'; }
      else if (hasDiff && mpct < 50){ bc = 'p22-b-w'; bt = mpct.toFixed(0) + '%'; }
      else if (hasDiff){ bc = 'p22-b-d'; bt = d + ' diffs'; }
      else { bc = 'p22-b-c'; bt = 'Clean'; }
      var ds = (hasDiff || srcPct < 80) ? 'diff' : 'clean';

      h += '<div class="p22-fb" data-s="' + ds + '" data-f="' + fname.toLowerCase() + '" id="p22_bl-' + blkId + '">';
      h += '<div class="p22-fh"><div><span class="p22-fn">' + fname + '</span>';
      h += '<span style="color:var(--muted2,#9b9890);font-size:11px;margin-left:6px">' + rel + ' | ' + pstr + '</span>';
      h += '<span style="color:var(--accent,#3b3f8c);font-size:11px;margin-left:8px">PDF ' + pdfCnt + ' / Src ' + srcT + ' lines (' + srcPct.toFixed(0) + '%)</span></div>';
      h += '<div style="display:flex;align-items:center;gap:6px">';
      h += '<div class="p22-ms"><span class="g">' + m + '&#10003;</span><span class="r">' + d + '&#10007;</span></div>';
      h += '<span class="p22-badge ' + bc + '">' + bt + '</span>';
      h += '</div></div>';
      h += '<div class="p22-fbody">';

      // 소스에만 있는 줄 (생략이 있으면 표시 안 함)
      var missList = st.src_missing_lines || [];
      if (missList.length > 0){
        h += '<details class="p22-missing-detail"><summary>Source에만 있는 줄 (' + srcM + '줄, PDF 미포함)</summary>';
        h += '<div class="p22-missing-code">';
        for (var ml = 0; ml < missList.length; ml++) h += esc(missList[ml]) + '\n';
        if (srcM > missList.length) h += '\n... 외 ' + (srcM - missList.length) + '줄 더';
        h += '</div></details>';
      }

      h += '<table class="p22-ct"><thead><tr><th class="st">Status</th><th style="width:47%">PDF Code</th><th style="width:47%">Source Code</th></tr></thead><tbody>';

      for (var cci = 0; cci < block.comparisons.length; cci++){
        var cmp = block.comparisons[cci];
        var status = cmp.status;
        var pc = esc(cmp.pdf_code || '');
        var sc = esc(cmp.src_code || '');
        var sim = cmp.similarity || '';
        var icon, rc;
        if (status === 'match'){ icon = '&#10003;'; rc = 'p22-r-m'; }
        else if (status === 'comment_extra'){ icon = '&#10003;+#'; rc = 'p22-r-ce'; }
        else if (status === 'near_match'){ icon = '&#8776; ' + sim; rc = 'p22-r-nm'; }
        else if (status === 'diff'){ icon = sim ? '&#10007; ' + sim : '&#10007;'; rc = 'p22-r-d'; }
        else { icon = '&#8230;'; rc = 'p22-r-o'; }
        h += '<tr class="' + rc + '"><td class="st">' + icon + '</td><td>' + pc + '</td><td>' + sc + '</td></tr>';
      }
      h += '</tbody></table></div></div>';
      blkId++;
    }
    h += '</div></div>';
  }

  root.querySelector('#p22_report').innerHTML = h;

  // Bind filter/toggle events
  var searchBox = root.querySelector('#p22_searchBox');
  if (searchBox) searchBox.addEventListener('input', filterBlocks);

  var btnAll = root.querySelector('#p22_f-all');
  var btnDiff = root.querySelector('#p22_f-diff');
  var btnClean = root.querySelector('#p22_f-clean');
  var btnExpand = root.querySelector('#p22_expandAll');
  var btnCollapse = root.querySelector('#p22_collapseAll');

  if (btnAll) btnAll.addEventListener('click', function(){ setFilter('all'); });
  if (btnDiff) btnDiff.addEventListener('click', function(){ setFilter('diff'); });
  if (btnClean) btnClean.addEventListener('click', function(){ setFilter('clean'); });
  if (btnExpand) btnExpand.addEventListener('click', function(){ toggleAll(true); });
  if (btnCollapse) btnCollapse.addEventListener('click', function(){ toggleAll(false); });

  // Chapter header toggle
  root.querySelectorAll('.p22-ch-hdr').forEach(function(hdr){
    hdr.addEventListener('click', function(){ this.parentElement.classList.toggle('open'); });
  });

  // File block header toggle
  root.querySelectorAll('.p22-fh').forEach(function(fh){
    fh.addEventListener('click', function(){
      this.closest('.p22-fb').classList.toggle('open');
    });
  });
}

/* ── Filter/Toggle ── */
function setFilter(f){
  curFilter = f;
  root.querySelectorAll('.p22-fbar .p22-btn').forEach(function(b){ b.classList.remove('on'); });
  var el = root.querySelector('#p22_f-' + f);
  if (el) el.classList.add('on');
  filterBlocks();
}

function filterBlocks(){
  var q = '';
  var searchBox = root.querySelector('#p22_searchBox');
  if (searchBox) q = searchBox.value;
  var ql = q.toLowerCase();
  root.querySelectorAll('.p22-fb').forEach(function(b){
    var show = true;
    if (ql && b.dataset.f.indexOf(ql) < 0) show = false;
    if (curFilter === 'diff' && b.dataset.s !== 'diff') show = false;
    if (curFilter === 'clean' && b.dataset.s !== 'clean') show = false;
    b.style.display = show ? '' : 'none';
  });
}

function toggleAll(open){
  root.querySelectorAll('.p22-fb').forEach(function(b){ open ? b.classList.add('open') : b.classList.remove('open'); });
  root.querySelectorAll('.p22-ch').forEach(function(c){ open ? c.classList.add('open') : c.classList.remove('open'); });
}

/* ── PanelRegistry ── */
if (typeof PanelRegistry !== 'undefined'){
  PanelRegistry.register(22, {
    onActivate: function(){}
  });
}

})();
