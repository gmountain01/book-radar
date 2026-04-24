(function(){
'use strict';

// ──────────────────────────────────────────────
// panel16 — 찾아보기(인덱스) 자동 생성
// ──────────────────────────────────────────────

var root = document.getElementById('panel16');
if (!root) return;

// HTML 구조 생성
root.innerHTML = `
<div class="p16-wrap">
<div class="p16-header">
  <h2>찾아보기 생성</h2>
  <p>원고 파일에서 IT/AI 핵심 용어를 자동 추출하고, 페이지 번호를 매핑하여 찾아보기(색인)를 만듭니다.</p>
</div>

<div class="p16-upload">
  <label class="p16-drop" id="p16_drop" for="p16_fileInput">
    <div class="icon">📂</div>
    <div>파일을 드래그하거나 클릭하여 선택</div>
    <div class="hint">PDF / DOCX / HWPX / HWP / DOC 지원</div>
  </label>
  <input type="file" id="p16_fileInput" accept=".pdf,.docx,.hwpx,.hwp,.doc,.txt,.md" style="display:none">
  <div class="p16-fname" id="p16_fname"></div>
  <div class="p16-actions">
    <button class="p16-btn p16-btn-primary" id="p16_genBtn" disabled onclick="p16_generate()">찾아보기 생성</button>
    <button class="p16-btn p16-btn-secondary" id="p16_aiBtn" style="display:none" onclick="p16_aiEnhance()">🤖 AI 정제</button>
    <button class="p16-btn p16-btn-secondary" id="p16_copyBtn" style="display:none" onclick="p16_copy()">📋 복사</button>
    <button class="p16-btn p16-btn-secondary" id="p16_dlBtn" style="display:none" onclick="p16_download()">💾 다운로드</button>
    <span class="p16-status" id="p16_status"></span>
  </div>
</div>

<div id="p16_resultArea" style="display:none">
  <div class="p16-summary" id="p16_summary"></div>
  <div class="p16-filters">
    <button class="p16-cat-btn active" data-cat="all" onclick="p16_filter(this)">전체</button>
    <span id="p16_catBtns"></span>
    <input class="p16-search" id="p16_search" placeholder="용어 검색…" oninput="p16_filter()">
  </div>
  <div class="p16-table-wrap">
    <div class="p16-table-scroll">
      <table class="p16-table">
        <thead><tr>
          <th style="width:35%">용어</th>
          <th style="width:15%">카테고리</th>
          <th style="width:10%;text-align:center">빈도</th>
          <th style="width:40%">페이지</th>
        </tr></thead>
        <tbody id="p16_tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<div class="p16-empty" id="p16_empty">
  <div class="icon">📑</div>
  <div>파일을 업로드하고 <strong>찾아보기 생성</strong>을 클릭하세요</div>
</div>
</div>
`;

// ──────────────────────────────────────────────
// 카테고리 정의
// ──────────────────────────────────────────────
var CATS = {
  ai:   { label: 'AI/ML',         css: 'p16-cat-ai' },
  lang: { label: '프로그래밍',     css: 'p16-cat-lang' },
  infra:{ label: '인프라/클라우드', css: 'p16-cat-infra' },
  data: { label: '데이터',         css: 'p16-cat-data' },
  dev:  { label: '개발 방법론',    css: 'p16-cat-dev' },
  book: { label: '도서 용어',      css: 'p16-cat-book' },
};

// ──────────────────────────────────────────────
// IT/AI 빌트인 용어 사전
// ──────────────────────────────────────────────
var DICT = {};
function _add(terms, cat) {
  terms.forEach(function(t) {
    var key = t.toLowerCase().replace(/[^a-z가-힣0-9]/g, '');
    if (key.length >= 2) DICT[key] = { term: t, cat: cat };
  });
}
// AI/ML
_add(['머신러닝','딥러닝','신경망','인공지능','자연어처리','NLP','강화학습',
  'LLM','GPT','BERT','Transformer','트랜스포머','어텐션','임베딩','벡터',
  'RAG','파인튜닝','프롬프트','프롬프트 엔지니어링','토큰','토크나이저',
  'CNN','RNN','LSTM','GAN','VAE','Diffusion','확산 모델',
  '과적합','과소적합','학습률','에포크','배치','미니배치',
  '손실함수','역전파','경사하강법','옵티마이저','Adam','SGD',
  '분류','회귀','클러스터링','추천 시스템','컴퓨터 비전',
  'OCR','객체 탐지','이미지 분류','음성 인식','TTS','STT',
  'LangChain','LlamaIndex','OpenAI','Claude','Anthropic',
  'Hugging Face','PyTorch','TensorFlow','Keras','scikit-learn',
  'MLOps','모델 서빙','추론','벤치마크','할루시네이션',
  '에이전트','멀티 에이전트','MCP','도구 사용','함수 호출',
  'Stable Diffusion','DALL-E','Midjourney','LoRA','RLHF','DPO',
  '시맨틱 검색','벡터 데이터베이스','Pinecone','Chroma','Weaviate',
  '지식 그래프','온톨로지','개체명 인식','감성 분석','요약'], 'ai');
// 프로그래밍
_add(['Python','JavaScript','TypeScript','Java','Kotlin','Swift','Rust','Go',
  'C++','C#','Ruby','PHP','Scala','Dart','Flutter','React','Vue','Angular',
  'Next.js','Nuxt','Svelte','Node.js','Express','FastAPI','Django','Flask',
  'Spring','Spring Boot','JPA','ORM','REST','GraphQL','gRPC',
  'API','SDK','CLI','REPL','IDE','디버깅','리팩토링',
  '함수','클래스','객체','인터페이스','상속','다형성','캡슐화',
  '제네릭','타입','변수','상수','배열','리스트','딕셔너리','해시맵',
  '재귀','반복문','조건문','예외 처리','비동기','async','await',
  '콜백','프로미스','이벤트 루프','스레드','프로세스','동시성','병렬성',
  'WebSocket','HTTP','TCP','UDP','소켓','프로토콜',
  '컴파일러','인터프리터','가비지 컬렉션','메모리 관리','포인터',
  '정규표현식','알고리즘','자료구조','스택','큐','트리','그래프','해시'], 'lang');
// 인프라/클라우드
_add(['Docker','Kubernetes','컨테이너','오케스트레이션','마이크로서비스',
  'AWS','Azure','GCP','Lambda','서버리스','EC2','S3',
  'CI/CD','Jenkins','GitHub Actions','GitLab CI','ArgoCD',
  'Terraform','Ansible','Helm','Istio','서비스 메시',
  'Nginx','Apache','로드밸런서','프록시','리버스 프록시',
  'DNS','CDN','SSL','TLS','HTTPS','인증서',
  'VPC','서브넷','보안 그룹','방화벽','IAM',
  'Linux','Ubuntu','CentOS','셸','Bash','터미널',
  '모니터링','로그','Prometheus','Grafana','ELK',
  'Kafka','RabbitMQ','메시지 큐','이벤트 드리븐',
  'CloudFormation','ECS','EKS','Fargate','RDS','DynamoDB'], 'infra');
// 데이터
_add(['데이터베이스','RDBMS','NoSQL','SQL','MySQL','PostgreSQL','Oracle',
  'MongoDB','Redis','Elasticsearch','Cassandra',
  '인덱스','쿼리','조인','트랜잭션','ACID','정규화','비정규화',
  'ETL','데이터 파이프라인','데이터 웨어하우스','데이터 레이크',
  'Pandas','NumPy','DataFrame','CSV','JSON','XML','Parquet',
  '시각화','차트','대시보드','Matplotlib','Plotly',
  'Spark','Hadoop','MapReduce','Hive','Presto',
  '빅데이터','스트리밍','배치 처리','실시간 처리',
  'Airflow','dbt','Snowflake','BigQuery','Redshift',
  'DuckDB','Polars','데이터 모델링','스키마','마이그레이션'], 'data');
// 개발 방법론
_add(['애자일','스크럼','스프린트','칸반','워터폴',
  'Git','GitHub','GitLab','브랜치','커밋','풀 리퀘스트','머지',
  'TDD','단위 테스트','통합 테스트','E2E 테스트','Jest','pytest',
  '코드 리뷰','페어 프로그래밍','몹 프로그래밍',
  '디자인 패턴','싱글톤','팩토리','옵저버','전략 패턴',
  'SOLID','DRY','KISS','YAGNI','클린 코드','클린 아키텍처',
  'DDD','헥사고날','레이어드 아키텍처',
  'DevOps','SRE','인시던트','온콜','SLA','SLO',
  '보안','인증','인가','OAuth','JWT','CORS','XSS','CSRF',
  '암호화','해싱','솔트','세션','쿠키',
  'MSA','모놀리식','CQRS','이벤트 소싱','사가 패턴'], 'dev');

// ──────────────────────────────────────────────
// 상태
// ──────────────────────────────────────────────
var selectedFile = null;
var extracted = null;   // { pages: [{page, text, bodyPageNum}], filename, total_pages }
var idxData = [];       // [{ term, cat, pages:Set, freq }]
var currentFilter = 'all';

// 영문 stopwords
var STOP = new Set('The,This,That,When,Where,What,How,Why,If,In,On,At,To,For,And,But,Or,Not,It,Is,Are,Was,Were,Has,Have,Had,Do,Did,Can,May,Will,Let,All,Any,No,So,As,An,A,Of,By,Up,My,Me,He,She,We,Be,From,With,Its,You,Your,Our,Also,See,Use,New,One,Two,Get,Set,Run,End,Now,Just,More,Most,Some,Than,Then,Each,Even,Many,Much,Such,Very,Own,Both,Only,Into,Over,Under,Upon,Same,Next,Last,Part,Step,Type,Note,Data,Code,File,True,False,None,Null,Case,Make,Take,Give,Call,Come,Work,Find,Like,Name,Good,Long,Back,Help,Need,Want,Know,Try,Test,Free,Open,High,Full,Real,Side,Line,Turn,Move,Down,Keep,Show,CHAPTER,Chapter'.toLowerCase().split(','));

// ──────────────────────────────────────────────
// 파일 업로드
// ──────────────────────────────────────────────
var drop = document.getElementById('p16_drop');
var fileInput = document.getElementById('p16_fileInput');

if (drop && fileInput) {
  drop.addEventListener('dragover', function(e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function() { drop.classList.remove('over'); });
  drop.addEventListener('drop', function(e) {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('over');
    var f = e.dataTransfer.files[0];
    if (f) _setFile(f);
  });
  fileInput.addEventListener('change', function() {
    if (fileInput.files[0]) _setFile(fileInput.files[0]);
  });
}

function _setFile(f) {
  var exts = ['pdf','docx','hwpx','hwp','doc','txt','md'];
  var ext = f.name.split('.').pop().toLowerCase();
  if (exts.indexOf(ext) === -1) { alert('지원하지 않는 파일 형식입니다.'); return; }
  selectedFile = f;
  document.getElementById('p16_fname').textContent = '✓ ' + f.name;
  document.getElementById('p16_genBtn').disabled = false;
  _setStatus('');
}

function _setStatus(msg) {
  var el = document.getElementById('p16_status');
  if (el) el.textContent = msg;
}

// ──────────────────────────────────────────────
// 텍스트 추출
// ──────────────────────────────────────────────
async function _extractFile(file) {
  var ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt' || ext === 'md') {
    var text = await file.text();
    return _textToPages(file.name, text);
  }

  if (ext === 'docx' || ext === 'doc') {
    if (typeof mammoth === 'undefined') throw new Error('mammoth.js 미로드');
    var ab = await file.arrayBuffer();
    var r = await mammoth.extractRawText({ arrayBuffer: ab });
    if (!r.value || r.value.trim().length < 10) throw new Error('텍스트 추출 실패');
    return _textToPages(file.name, r.value);
  }

  if (ext === 'hwpx') {
    if (typeof JSZip === 'undefined') throw new Error('JSZip 미로드');
    var ab2 = await file.arrayBuffer();
    var zip = await JSZip.loadAsync(ab2);
    var sections = Object.keys(zip.files)
      .filter(function(n) { return /^Contents\/section\d+\.xml$/i.test(n); })
      .sort(function(a,b) { return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); });
    if (!sections.length) throw new Error('HWPX 본문 없음');
    var full = '';
    for (var s of sections) {
      var xml = await zip.files[s].async('string');
      // 헤더/푸터/각주 제거
      xml = xml.replace(/<(?:hp:)?header[^>]*>[\s\S]*?<\/(?:hp:)?header>/gi, '')
               .replace(/<(?:hp:)?footer[^>]*>[\s\S]*?<\/(?:hp:)?footer>/gi, '')
               .replace(/<(?:hp:)?footnote[^>]*>[\s\S]*?<\/(?:hp:)?footnote>/gi, '')
               .replace(/<(?:hp:)?endnote[^>]*>[\s\S]*?<\/(?:hp:)?endnote>/gi, '');
      var paras = xml.match(/<(?:hp:)?p(?:\s[^>]*)?>[\s\S]*?<\/(?:hp:)?p>/gi) || [];
      var lines = [];
      for (var pt of paras) {
        var tms = pt.match(/<(?:hp:)?t(?:\s[^>]*)?>([^<]*)<\/(?:hp:)?t>/g) || [];
        var lt = tms.map(function(m){ return m.replace(/<[^>]+>/g,''); }).join('');
        if (lt.trim()) lines.push(lt.trim());
      }
      if (lines.length) full += lines.join('\n') + '\n\n';
    }
    if (!full.trim()) throw new Error('HWPX 텍스트 추출 실패');
    return _textToPages(file.name, full);
  }

  if (ext === 'hwp') throw new Error('HWP 바이너리는 HWPX로 변환 후 업로드하세요.');

  if (ext === 'pdf') {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js 미로드');
    var ab3 = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: ab3 }).promise;
    var pages = [];
    var offsetCounts = {};  // (pdfIndex - printedPage) → 횟수

    // 1차: 각 페이지 텍스트 추출 + 인쇄 페이지 번호 감지
    // 조판된 도서의 페이지 번호 위치: 하단 좌측 끝 또는 우측 끝 (가운데는 드묾)
    // 감지 조건: Y좌표 하단 12% + X좌표 좌측 20% 또는 우측 80%
    for (var i = 1; i <= pdf.numPages; i++) {
      if (i % 10 === 0) await new Promise(function(r){ setTimeout(r, 0); });
      var pg = await pdf.getPage(i);
      var content = await pg.getTextContent();
      var vp = pg.getViewport({scale:1});
      pg.cleanup();
      var pageW = vp.width;
      var pageH = vp.height;
      var items = content.items.filter(function(it){ return it.str && it.str.trim(); });
      var text2 = items.map(function(it){ return it.str; }).join(' ');

      // 인쇄 페이지 번호 감지
      // 조건: (1) 하단 12% 영역 (2) 좌측 20% 또는 우측 80% (3) 단독 숫자 (4) 1~9999
      var bottomThr = pageH * 0.12;
      var leftThr = pageW * 0.20;
      var rightThr = pageW * 0.80;
      var printedPage = null;
      var candidates = []; // {n, x, y} — 후보가 여럿이면 가장 끝에 있는 것 선택

      for (var it of items) {
        if (!it.transform) continue;
        var y = it.transform[5]; // PDF좌표: 0=하단
        var x = it.transform[4]; // PDF좌표: 0=좌측
        // 하단 12% 영역만 검사
        if (y > bottomThr) continue;
        var trimmed = it.str.trim();
        if (!/^\d{1,4}$/.test(trimmed)) continue;
        var n = parseInt(trimmed, 10);
        if (n < 1) continue;
        // X좌표: 좌측 끝 또는 우측 끝에 있어야 페이지 번호
        if (x <= leftThr || x >= rightThr) {
          candidates.push({ n: n, x: x, y: y });
        }
      }

      if (candidates.length > 0) {
        // 후보가 여럿이면 가장 바깥쪽(좌측 최소 x 또는 우측 최대 x) 선택
        candidates.sort(function(a, b) {
          // 우측 끝에 있는 것 우선 (가장 큰 x), 같으면 좌측 끝 (가장 작은 x)
          var aEdge = Math.max(a.x, pageW - a.x);
          var bEdge = Math.max(b.x, pageW - b.x);
          return bEdge - aEdge;
        });
        printedPage = candidates[0].n;
      }

      if (printedPage !== null) {
        var off = i - printedPage;
        offsetCounts[off] = (offsetCounts[off] || 0) + 1;
      }
      pages.push({ page: i, text: text2, bodyPageNum: printedPage });
    }

    // 2차: pdfOffset 자동 계산 (가장 많이 관찰된 오프셋)
    // 감지 못한 페이지에도 오프셋 역산으로 인쇄 번호 부여
    var pdfOffset = 0;
    if (Object.keys(offsetCounts).length > 0) {
      pdfOffset = parseInt(
        Object.entries(offsetCounts).sort(function(a,b){ return b[1] - a[1]; })[0][0], 10
      );
    }
    if (pdfOffset !== 0) {
      for (var pg2 of pages) {
        if (pg2.bodyPageNum === null) {
          // 오프셋으로 역산 (음수면 아직 본문 시작 전이므로 null 유지)
          var estimated = pg2.page - pdfOffset;
          if (estimated >= 1) pg2.bodyPageNum = estimated;
        }
      }
      console.log('[panel16] PDF 오프셋 감지: pdfOffset=' + pdfOffset +
        ' (앞 ' + pdfOffset + '페이지는 표지/목차)');
    }

    return { filename: file.name, total_pages: pdf.numPages, pages: pages, pdfOffset: pdfOffset };
  }

  throw new Error('지원하지 않는 형식: ' + ext);
}

function _textToPages(filename, fullText) {
  var paragraphs = fullText.replace(/\r\n/g, '\n').split(/\n{2,}/);
  var pages = [], buf = '', pageNum = 1;
  for (var para of paragraphs) {
    buf += para.trim() + '\n\n';
    if (buf.length >= 1500) {
      pages.push({ page: pageNum++, text: buf.trim(), bodyPageNum: null });
      buf = '';
    }
  }
  if (buf.trim()) pages.push({ page: pageNum++, text: buf.trim(), bodyPageNum: null });
  return { filename: filename, total_pages: pages.length, pages: pages };
}

// ──────────────────────────────────────────────
// 찾아보기 생성
// ──────────────────────────────────────────────
async function p16_generate() {
  if (!selectedFile) return;
  var btn = document.getElementById('p16_genBtn');
  btn.disabled = true; btn.textContent = '추출 중…';
  _setStatus('파일에서 텍스트 추출 중…');

  try {
    extracted = await _extractFile(selectedFile);
  } catch(e) {
    alert('파일 추출 오류:\n' + e.message);
    btn.disabled = false; btn.textContent = '찾아보기 생성';
    _setStatus('');
    return;
  }

  _setStatus('용어 추출 중…');
  btn.textContent = '분석 중…';
  await new Promise(function(r){ setTimeout(r, 50); }); // UI 갱신

  // 용어 추출
  var termMap = new Map();
  for (var p of extracted.pages) {
    var text = p.text;
    if (!text || text.trim().length < 10) continue;
    var pageNum = p.bodyPageNum || p.page;

    // 사전 매칭
    for (var key in DICT) {
      var entry = DICT[key];
      var isKo = /[가-힣]/.test(entry.term);
      var found = false;
      if (isKo) {
        found = text.indexOf(entry.term) !== -1;
      } else {
        var re = new RegExp('\\b' + entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        found = re.test(text);
      }
      if (found) {
        if (!termMap.has(key)) termMap.set(key, { term: entry.term, cat: entry.cat, pages: new Set(), freq: 0 });
        var e = termMap.get(key);
        e.pages.add(pageNum);
        e.freq++;
      }
    }

    // 영문 고유명사/약어 자동 감지
    var caps = text.match(/\b[A-Z][A-Za-z0-9]*(?:\.[A-Za-z]+)*\b/g) || [];
    for (var w of caps) {
      if (w.length < 2) continue;
      var wLow = w.toLowerCase();
      if (STOP.has(wLow)) continue;
      var ck = wLow.replace(/[^a-z0-9]/g, '');
      if (ck.length < 2 || DICT[ck]) continue;
      if (!termMap.has(ck)) termMap.set(ck, { term: w, cat: 'book', pages: new Set(), freq: 0 });
      var e2 = termMap.get(ck);
      e2.pages.add(pageNum);
      e2.freq++;
    }
  }

  // 빈도 2 이상만 유지
  idxData = [];
  termMap.forEach(function(v) { if (v.freq >= 2) idxData.push(v); });
  idxData.sort(function(a,b) { return a.term.localeCompare(b.term, 'ko'); });

  // UI 표시
  btn.disabled = false; btn.textContent = '찾아보기 생성';
  document.getElementById('p16_aiBtn').style.display = '';
  document.getElementById('p16_copyBtn').style.display = '';
  document.getElementById('p16_dlBtn').style.display = '';
  document.getElementById('p16_resultArea').style.display = '';
  document.getElementById('p16_empty').style.display = 'none';
  _setStatus(extracted.total_pages + '페이지에서 ' + idxData.length + '개 용어 추출 완료');
  currentFilter = 'all';
  _render();
}

// ──────────────────────────────────────────────
// 렌더링
// ──────────────────────────────────────────────
function _render() {
  var search = (document.getElementById('p16_search')?.value || '').toLowerCase();
  var filtered = idxData.filter(function(e) {
    if (currentFilter !== 'all' && e.cat !== currentFilter) return false;
    if (search && e.term.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  // 요약
  var catCounts = {};
  idxData.forEach(function(e) { catCounts[e.cat] = (catCounts[e.cat] || 0) + 1; });
  var sum = document.getElementById('p16_summary');
  if (sum) {
    var parts = [];
    for (var c in catCounts) {
      parts.push((CATS[c]?.label || c) + ' ' + catCounts[c] + '개');
    }
    sum.innerHTML = '총 <strong>' + idxData.length + '</strong>개 용어 &middot; ' + parts.join(' &middot; ') +
      (filtered.length !== idxData.length ? ' &middot; 표시: ' + filtered.length + '개' : '');
  }

  // 카테고리 버튼
  var btns = document.getElementById('p16_catBtns');
  if (btns) {
    var html = '';
    for (var c2 in CATS) {
      if (!catCounts[c2]) continue;
      html += '<button class="p16-cat-btn' + (currentFilter===c2?' active':'') + '" data-cat="' + c2 + '" onclick="p16_filter(this)">' +
        CATS[c2].label + ' (' + catCounts[c2] + ')</button>';
    }
    btns.innerHTML = html;
  }
  var allBtn = root.querySelector('.p16-cat-btn[data-cat="all"]');
  if (allBtn) allBtn.className = 'p16-cat-btn' + (currentFilter === 'all' ? ' active' : '');

  // 테이블
  var tbody = document.getElementById('p16_tbody');
  if (!tbody) return;
  tbody.innerHTML = filtered.map(function(e) {
    var catInfo = CATS[e.cat] || { label: e.cat, css: '' };
    var pArr = []; e.pages.forEach(function(v){ pArr.push(v); });
    pArr.sort(function(a,b){ return a-b; });
    return '<tr>' +
      '<td class="p16-term">' + _esc(e.term) + '</td>' +
      '<td><span class="p16-cat ' + catInfo.css + '">' + catInfo.label + '</span></td>' +
      '<td style="text-align:center">' + e.freq + '</td>' +
      '<td class="p16-pages">' + pArr.join(', ') + '</td>' +
      '</tr>';
  }).join('');
}

function _esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ──────────────────────────────────────────────
// 필터
// ──────────────────────────────────────────────
function p16_filter(btn) {
  if (btn && btn.dataset) currentFilter = btn.dataset.cat || 'all';
  _render();
}

// ──────────────────────────────────────────────
// AI 정제
// ──────────────────────────────────────────────
async function p16_aiEnhance() {
  var apiKey = '';
  if (typeof loadApiKey === 'function') {
    try { apiKey = (await loadApiKey()) || ''; } catch(e) {}
  }
  if (!apiKey) {
    alert('AI 정제에는 Claude API 키가 필요합니다.\n통합현황 탭에서 API 키를 설정하세요.');
    return;
  }
  if (!idxData.length) return;

  var btn = document.getElementById('p16_aiBtn');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 분석 중…'; }
  _setStatus('AI가 용어를 분석하고 있습니다…');

  // 용어 목록만 전송 (토큰 최소)
  var termList = idxData.map(function(e) {
    return e.term + ' (' + e.freq + '회, ' + (CATS[e.cat]?.label || e.cat) + ')';
  }).join('\n');
  // 문서 샘플 (첫 3페이지, 500자씩)
  var sample = (extracted?.pages || []).slice(0, 3).map(function(p) {
    return p.text.slice(0, 500);
  }).join('\n---\n');

  var prompt = '아래는 IT 기술서의 용어 목록과 문서 샘플입니다.\n\n' +
    '[용어 목록 (' + idxData.length + '개)]\n' + termList + '\n\n' +
    '[문서 샘플]\n' + sample + '\n\n' +
    '작업:\n' +
    '1. 찾아보기(색인)에 부적절한 일반 단어를 제거 대상으로 표시\n' +
    '2. 누락된 중요 기술 용어를 최대 20개 추가 제안\n' +
    '3. 카테고리가 잘못된 용어의 수정 제안\n\n' +
    '카테고리: ai, lang, infra, data, dev, book\n\n' +
    'JSON 반환:\n{"remove":["용어1"],"add":[{"term":"새 용어","cat":"카테고리"}],"reclassify":[{"term":"용어","to":"카테고리"}]}';

  try {
    var raw = await callClaudeApi({
      apiKey: apiKey,
      prompt: prompt,
      system: 'You are a Korean IT book index editor. Return ONLY valid JSON.',
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2000,
      temperature: 0,
      noPersona: true
    });

    var result = null;
    try {
      var cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      var m = cleaned.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : null;
    } catch(e) {}

    var changes = 0;
    if (result) {
      // 제거
      if (result.remove && result.remove.length) {
        var rmSet = new Set(result.remove.map(function(t){ return t.toLowerCase().replace(/[^a-z가-힣0-9]/g,''); }));
        var before = idxData.length;
        idxData = idxData.filter(function(e) {
          return !rmSet.has(e.term.toLowerCase().replace(/[^a-z가-힣0-9]/g,''));
        });
        changes += before - idxData.length;
      }
      // 추가
      if (result.add && result.add.length) {
        for (var a of result.add) {
          if (!a.term || !a.cat) continue;
          var ak = a.term.toLowerCase().replace(/[^a-z가-힣0-9]/g,'');
          if (idxData.some(function(e){ return e.term.toLowerCase().replace(/[^a-z가-힣0-9]/g,'') === ak; })) continue;
          var ps = new Set(), fr = 0;
          for (var pg of (extracted?.pages || [])) {
            if (pg.text && pg.text.indexOf(a.term) !== -1) { ps.add(pg.bodyPageNum || pg.page); fr++; }
          }
          if (fr > 0) { idxData.push({ term: a.term, cat: a.cat, pages: ps, freq: fr }); changes++; }
        }
      }
      // 재분류
      if (result.reclassify && result.reclassify.length) {
        for (var rc of result.reclassify) {
          var found = idxData.find(function(e){ return e.term === rc.term; });
          if (found && rc.to && CATS[rc.to]) { found.cat = rc.to; changes++; }
        }
      }
      idxData.sort(function(a,b){ return a.term.localeCompare(b.term, 'ko'); });
    }
    _render();
    _setStatus('AI 정제 완료: ' + changes + '건 변경');
  } catch(e) {
    alert('AI 정제 오류: ' + e.message);
    _setStatus('AI 정제 실패');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🤖 AI 정제'; }
}

// ──────────────────────────────────────────────
// 복사 / 다운로드
// ──────────────────────────────────────────────
function p16_copy() {
  if (!idxData.length) return;
  var header = '용어\t카테고리\t빈도\t페이지';
  var lines = idxData.map(function(e) {
    var pArr = []; e.pages.forEach(function(v){ pArr.push(v); });
    pArr.sort(function(a,b){ return a-b; });
    return e.term + '\t' + (CATS[e.cat]?.label || e.cat) + '\t' + e.freq + '\t' + pArr.join(', ');
  });
  navigator.clipboard.writeText(header + '\n' + lines.join('\n'))
    .then(function(){ _setStatus(idxData.length + '개 용어 클립보드 복사 완료'); });
}

function p16_download() {
  if (!idxData.length) return;
  // ㄱㄴㄷ / ABC 그룹핑
  var groups = {};
  var choList = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  for (var e of idxData) {
    var first = e.term.charAt(0);
    var gk;
    if (/[가-힣]/.test(first)) {
      var code = first.charCodeAt(0) - 0xAC00;
      gk = choList[Math.floor(code / (21 * 28))] || 'ㄱ';
    } else if (/[A-Za-z]/.test(first)) {
      gk = first.toUpperCase();
    } else { gk = '#'; }
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push(e);
  }

  var text = '찾아보기 (Index)\n' + '═'.repeat(40) + '\n';
  text += '생성일: ' + new Date().toLocaleDateString('ko-KR') + '\n';
  text += '총 ' + idxData.length + '개 용어\n\n';

  var keys = Object.keys(groups).sort(function(a,b) {
    if (/[ㄱ-ㅎ]/.test(a) && /[A-Z]/.test(b)) return -1;
    if (/[A-Z]/.test(a) && /[ㄱ-ㅎ]/.test(b)) return 1;
    return a.localeCompare(b, 'ko');
  });

  for (var k of keys) {
    text += '\n[' + k + ']\n';
    for (var e2 of groups[k]) {
      var pArr = []; e2.pages.forEach(function(v){ pArr.push(v); });
      pArr.sort(function(a,b){ return a-b; });
      text += '  ' + e2.term + '  ···  ' + pArr.join(', ') + '\n';
    }
  }

  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var fname = (extracted?.filename || '문서').replace(/\.[^.]+$/, '');
  a.download = fname + '_찾아보기.txt';
  a.click();
  URL.revokeObjectURL(url);
  _setStatus('다운로드 완료');
}

// ──────────────────────────────────────────────
// window 노출
// ──────────────────────────────────────────────
window.p16_generate = p16_generate;
window.p16_filter = p16_filter;
window.p16_aiEnhance = p16_aiEnhance;
window.p16_copy = p16_copy;
window.p16_download = p16_download;

// PanelRegistry 등록
if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(16, { onActivate: function(){} });
}

})();
