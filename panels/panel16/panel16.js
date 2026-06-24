(function(){
'use strict';

// ──────────────────────────────────────────────
// panel16 — 찾아보기(인덱스) 자동 생성
// 색인 가치 평가 기반 (7점 이상만 노출)
// ──────────────────────────────────────────────

var root = document.getElementById('panel16');
if (!root) return;

// HTML 구조 생성
root.innerHTML = `
<div class="p16-wrap">
<div class="p16-header">
  <h2>찾아보기 생성</h2>
  <p>원고 파일에서 IT/AI 핵심 용어를 자동 추출하고, 색인 가치 점수(7점 이상)로 필터링하여 찾아보기(색인)를 만듭니다.</p>
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
          <th style="width:30%">용어</th>
          <th style="width:13%">카테고리</th>
          <th style="width:8%;text-align:center">점수</th>
          <th style="width:8%;text-align:center">빈도</th>
          <th style="width:41%">페이지</th>
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
// 언어 키워드 / 타입 단어 — 무조건 제외
// ──────────────────────────────────────────────
var LANG_KEYWORDS = new Set([
  'await','async','yield','return','import','export','from','require',
  'class','function','const','let','var','new','this','super','extends',
  'if','else','for','while','do','switch','case','break','continue',
  'try','catch','finally','throw','typeof','instanceof','in','of','delete',
  'true','false','null','undefined','void','nan','infinity',
  'int','float','double','bool','boolean','char','byte','short','long',
  'string','number','object','symbol','bigint','any','never','unknown',
  'list','dict','tuple','set','map','array','vector','queue','stack',
  'optional','nullable','readonly','static','final','abstract','interface',
  'enum','struct','union','type','trait','impl','fn','pub','mod','crate',
  'def','self','cls','lambda','pass','none','elif','except','raise',
  'val','println','main','override','companion','suspend','sealed','data',
  'print','input','range','len','str','repr','iter','next','filter',
  'foreach','select','where','group','join','orderby','into',
  'package','implements','protected','private','public','synchronized',
  'volatile','transient','native','throws','assert','goto','default',
]);

// ──────────────────────────────────────────────
// 코드 폰트 이름 패턴
// ──────────────────────────────────────────────
var CODE_FONT_RE = /courier|consolas|mono|menlo|source\s?code|fira\s?code|jetbrains|inconsolata|roboto\s?mono|hack|dejavu\s?sans\s?mono|liberation\s?mono|d2coding|nanum\s?gothic\s?coding/i;

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
var extracted = null;   // { pages: [{page, text, bodyPageNum, items?, maxFontSize?}], filename, total_pages }
var idxData = [];       // [{ term, cat, pages:Set, freq, score, isDefined, ... }]
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
// 도비라 페이지 감지
// ──────────────────────────────────────────────
function _isDobira(page) {
  if (!page) return false;
  var text = (page.text || '').toLowerCase();
  var maxFont = page.maxFontSize || 0;

  // 조건 1: 큰 폰트(20pt+) + Part/Chapter/장 패턴
  if (maxFont >= 20) {
    if (/\b(part|chapter)\b/i.test(text) || /\d+\s*장\b/.test(text) || /제\s*\d+\s*장/.test(text) || /CHAPTER/i.test(page.text || '')) {
      return true;
    }
  }

  // 조건 2: 학습목표/학습흐름/핵심개념 키워드 2개 이상
  var dobiraPats = ['학습목표','학습 목표','학습흐름','학습 흐름','핵심 개념','핵심개념',
    '이 장에서 배울','이 장의 목표','학습 내용','이 장에서는','이번 장에서'];
  var matchCount = 0;
  for (var dp of dobiraPats) {
    if (text.indexOf(dp.toLowerCase()) !== -1) matchCount++;
  }
  if (matchCount >= 2) return true;

  return false;
}

// ──────────────────────────────────────────────
// 합성어 쪼개짐 방지 — span x좌표 인접성 검사
// ──────────────────────────────────────────────
function _checkCompound(items, termText) {
  // items가 없으면 (non-PDF) 검사 불가 → 합성어로 간주
  if (!items || !items.length) return true;
  // termText에서 공백 없이 연속된 영문인 경우 span이 인접한지 확인
  if (!/[A-Za-z]{2,}/.test(termText)) return true;

  // termText를 items에서 찾아서 span 간 x좌표 인접성 검사
  var termLow = termText.toLowerCase();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.str) continue;
    var itLow = it.str.toLowerCase();
    if (itLow.indexOf(termLow) !== -1) return true; // 단일 span에 포함 → OK

    // 여러 span에 걸쳐있는 경우 — 인접 span 연결 시도
    if (termLow.startsWith(itLow.trim().toLowerCase()) && itLow.trim().length > 0) {
      var concat = it.str.trim();
      var lastItem = it;
      for (var j = i + 1; j < items.length && j < i + 5; j++) {
        var nxt = items[j];
        if (!nxt.str || !nxt.str.trim()) continue;
        // x좌표 인접성: 이전 span 끝 ~ 다음 span 시작 < 3pt
        if (lastItem.transform && nxt.transform) {
          var prevEnd = lastItem.transform[4] + (lastItem.width || lastItem.str.length * 5);
          var nxtStart = nxt.transform[4];
          if (Math.abs(nxtStart - prevEnd) > 3) break; // 3pt 초과 → 쪼개진 것
        }
        concat += nxt.str.trim();
        lastItem = nxt;
        if (concat.toLowerCase().indexOf(termLow) !== -1) return true;
      }
    }
  }
  return false; // 합성어 쪼개짐으로 판단
}

// ──────────────────────────────────────────────
// 색인 가치 점수 계산
// ──────────────────────────────────────────────
function _calcScore(entry) {
  var score = 5; // 기본: 단순 언급

  // 가산
  if (entry.isDefined && entry.hasEnglishParen) {
    score += 5; // 10점: 영문 병기 정의
  } else if (entry.isDefined) {
    score += 4; // 9점: 명확한 정의
  }
  if (entry.freq >= 3) {
    score += 3; // 8점: 3회 이상 의미 있게 다뤄짐
  }
  if (entry.hasActionContext) {
    score += 2; // 7점: 동작/사용 설명
  }

  // 감점
  if (entry.isHeaderOnly) score -= 3;
  if (entry.isModifierOnly) score -= 2;
  if (entry.codeOnlyPages > 0 && entry.bodyPages === 0) score -= 5;

  return Math.max(0, Math.min(10, score));
}

// ──────────────────────────────────────────────
// 한글-영문 중복 제거
// ──────────────────────────────────────────────
function _deduplicateKoEn(dataArr) {
  // 괄호 정의에서 수집한 한글↔영문 매핑으로 중복 제거
  // PascalCase 클래스명은 별도 유지
  var koEnPairs = []; // [{ko, en, koIdx, enIdx}]

  // 1단계: 매핑 구축 — 괄호 관계, 번역 관계
  for (var i = 0; i < dataArr.length; i++) {
    var e = dataArr[i];
    if (e.parenPair) {
      // 이 용어가 괄호 정의에서 한글-영문 쌍으로 등록된 경우
      for (var j = 0; j < dataArr.length; j++) {
        if (i === j) continue;
        var o = dataArr[j];
        if (o.term.toLowerCase().replace(/[^a-z가-힣0-9]/g,'') === e.parenPair.toLowerCase().replace(/[^a-z가-힣0-9]/g,'')) {
          var isKo = /[가-힣]/.test(e.term);
          koEnPairs.push({
            ko: isKo ? e.term : o.term,
            en: isKo ? o.term : e.term,
            koIdx: isKo ? i : j,
            enIdx: isKo ? j : i
          });
        }
      }
    }
  }

  // 공통 번역 매핑
  var KNOWN_TRANSLATIONS = {
    '벡터': 'vector', '임베딩': 'embedding', '토큰': 'token',
    '프롬프트': 'prompt', '에이전트': 'agent', '파이프라인': 'pipeline',
    '클러스터': 'cluster', '인스턴스': 'instance', '컨테이너': 'container',
    '데이터': 'data', '모델': 'model', '서버': 'server',
    '클라이언트': 'client', '인터페이스': 'interface', '모듈': 'module',
    '패키지': 'package', '라이브러리': 'library', '프레임워크': 'framework',
    '알고리즘': 'algorithm', '파라미터': 'parameter', '아키텍처': 'architecture',
    '캐시': 'cache', '스택': 'stack', '큐': 'queue',
    '노드': 'node', '레이어': 'layer', '배치': 'batch',
  };
  for (var ki = 0; ki < dataArr.length; ki++) {
    var ke = dataArr[ki];
    var isKoTerm = /[가-힣]/.test(ke.term);
    if (!isKoTerm) continue;
    var koLow = ke.term.toLowerCase();
    var knownEn = KNOWN_TRANSLATIONS[koLow];
    if (!knownEn) continue;
    for (var kj = 0; kj < dataArr.length; kj++) {
      if (ki === kj) continue;
      if (dataArr[kj].term.toLowerCase() === knownEn) {
        // PascalCase 클래스명 확인
        var enTerm = dataArr[kj].term;
        var isPascal = /^[A-Z][a-z]+[A-Z]/.test(enTerm); // PascalCase
        if (!isPascal) {
          koEnPairs.push({ ko: ke.term, en: enTerm, koIdx: ki, enIdx: kj });
        }
      }
    }
  }

  // 2단계: 영문 제거 (한글 메인 유지), PascalCase 클래스명 제외
  var removeSet = new Set();
  for (var p of koEnPairs) {
    var isPascalCase = /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(dataArr[p.enIdx].term);
    if (!isPascalCase) {
      removeSet.add(p.enIdx);
    }
  }

  return dataArr.filter(function(_, idx) { return !removeSet.has(idx); });
}

// ──────────────────────────────────────────────
// 데이터 필드명 패턴 제거
// ──────────────────────────────────────────────
function _isDataFieldPattern(term, pagesText) {
  // "X 필드", "X 값", "X 컬럼" 패턴
  if (/\s*(필드|값|컬럼|열|행|키|속성)\s*$/.test(term)) return true;

  // "항목명: TypeHint" 패턴으로만 사용
  var termEsc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var fieldRe = new RegExp(termEsc + '\\s*:\\s*[A-Z]', 'i');
  var enumRe = new RegExp('[·,]\\s*' + termEsc + '\\s*[·,]');

  var fieldCount = 0;
  var totalCount = 0;
  for (var pt of pagesText) {
    if (pt.indexOf(term) === -1) continue;
    totalCount++;
    if (fieldRe.test(pt) || enumRe.test(pt)) fieldCount++;
  }
  // 대부분 필드명/나열로만 사용
  if (totalCount > 0 && fieldCount / totalCount >= 0.7) return true;
  return false;
}

// ──────────────────────────────────────────────
// 영문 용어 경계 매칭 정규식 (단순 \b 대신)
// ──────────────────────────────────────────────
function _makeTermRegex(term, flags) {
  var esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var isAlphaNum = /^[A-Za-z0-9]/.test(term);
  var endsAlphaNum = /[A-Za-z0-9]$/.test(term);
  var prefix = isAlphaNum ? '(?<![A-Za-z0-9])' : '';
  var suffix = endsAlphaNum ? '(?![A-Za-z0-9])' : '';
  return new RegExp(prefix + esc + suffix, flags || 'i');
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
    var offsetCounts = {};

    for (var i = 1; i <= pdf.numPages; i++) {
      if (i % 10 === 0) await new Promise(function(r){ setTimeout(r, 0); });
      var pg = await pdf.getPage(i);
      var content = await pg.getTextContent();
      var vp = pg.getViewport({scale:1});
      pg.cleanup();
      var pageW = vp.width;
      var pageH = vp.height;
      var rawItems = content.items.filter(function(it){ return it.str && it.str.trim(); });

      // 폰트 정보 수집 — 코드 폰트 여부 태깅
      var maxFontSize = 0;
      var itemsWithMeta = [];
      for (var ri of rawItems) {
        var fontSize = ri.transform ? Math.abs(ri.transform[3]) || Math.abs(ri.transform[0]) : 12;
        if (fontSize > maxFontSize) maxFontSize = fontSize;
        var fontName = ri.fontName || '';
        var isCodeFont = CODE_FONT_RE.test(fontName);
        itemsWithMeta.push({
          str: ri.str,
          transform: ri.transform,
          width: ri.width,
          fontName: fontName,
          fontSize: fontSize,
          isCodeFont: isCodeFont
        });
      }

      var text2 = rawItems.map(function(it){ return it.str; }).join(' ');

      // 인쇄 페이지 번호 감지
      var bottomThr = pageH * 0.12;
      var leftThr = pageW * 0.20;
      var rightThr = pageW * 0.80;
      var printedPage = null;
      var candidates = [];

      for (var it of rawItems) {
        if (!it.transform) continue;
        var y = it.transform[5];
        var x = it.transform[4];
        if (y > bottomThr) continue;
        var trimmed = it.str.trim();
        if (!/^\d{1,4}$/.test(trimmed)) continue;
        var n = parseInt(trimmed, 10);
        if (n < 1) continue;
        if (x <= leftThr || x >= rightThr) {
          candidates.push({ n: n, x: x, y: y });
        }
      }

      if (candidates.length > 0) {
        candidates.sort(function(a, b) {
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
      pages.push({
        page: i,
        text: text2,
        bodyPageNum: printedPage,
        items: itemsWithMeta,
        maxFontSize: maxFontSize
      });
    }

    // pdfOffset 자동 계산
    var pdfOffset = 0;
    if (Object.keys(offsetCounts).length > 0) {
      pdfOffset = parseInt(
        Object.entries(offsetCounts).sort(function(a,b){ return b[1] - a[1]; })[0][0], 10
      );
    }
    if (pdfOffset !== 0) {
      for (var pg2 of pages) {
        if (pg2.bodyPageNum === null) {
          var estimated = pg2.page - pdfOffset;
          if (estimated >= 1) pg2.bodyPageNum = estimated;
        }
      }
      console.log('[panel16] PDF 오프셋 감지: pdfOffset=' + pdfOffset);
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
// UI 메뉴/버튼명 필터
// ──────────────────────────────────────────────
function _isUiMenuText(term, pagesText) {
  // [메뉴명] 안에서만 등장하는 용어
  var termEsc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var bracketRe = new RegExp('\\[' + termEsc + '\\]');
  var bracketCount = 0;
  var bodyCount = 0;
  for (var pt of pagesText) {
    if (bracketRe.test(pt)) bracketCount++;
    if (pt.indexOf(term) !== -1) bodyCount++;
  }
  if (bodyCount > 0 && bracketCount / bodyCount >= 0.8) return true;
  return false;
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
  await new Promise(function(r){ setTimeout(r, 50); });

  // ── Step 1: 도비라 페이지 제외 ──
  var dobiraPages = new Set();
  for (var dp of extracted.pages) {
    if (_isDobira(dp)) dobiraPages.add(dp.page);
  }
  if (dobiraPages.size > 0) {
    console.log('[panel16] 도비라 페이지 제외: ' + dobiraPages.size + '개');
  }

  // 유효 페이지만 사용
  var validPages = extracted.pages.filter(function(p) { return !dobiraPages.has(p.page); });

  // 모든 페이지 텍스트 배열 (데이터 필드 패턴 검사용)
  var allPagesText = validPages.map(function(p) { return p.text || ''; });

  // ── Step 2: 용어 추출 (코드 폰트 감지 포함) ──
  var termMap = new Map();

  for (var p of validPages) {
    var text = p.text;
    if (!text || text.trim().length < 10) continue;
    var pageNum = p.bodyPageNum || p.page;
    var pageItems = p.items || [];

    // 코드 폰트에서만 등장하는 텍스트 수집
    var codeFontTexts = new Set();
    var bodyFontTexts = new Set();
    for (var item of pageItems) {
      var w = (item.str || '').trim().toLowerCase();
      if (!w) continue;
      if (item.isCodeFont) { codeFontTexts.add(w); }
      else { bodyFontTexts.add(w); }
    }

    // 사전 매칭
    for (var key in DICT) {
      var entry = DICT[key];
      // 언어 키워드 제외
      if (LANG_KEYWORDS.has(entry.term.toLowerCase())) continue;

      var isKo = /[가-힣]/.test(entry.term);
      var found = false;
      if (isKo) {
        found = text.indexOf(entry.term) !== -1;
      } else {
        var re = _makeTermRegex(entry.term);
        found = re.test(text);
      }
      if (found) {
        // 합성어 쪼개짐 검사 (PDF만)
        if (!isKo && pageItems.length > 0 && !_checkCompound(pageItems, entry.term)) continue;

        if (!termMap.has(key)) termMap.set(key, {
          term: entry.term, cat: entry.cat, pages: new Set(), freq: 0,
          isDefined: false, hasEnglishParen: false, hasActionContext: false,
          isHeaderOnly: false, isModifierOnly: false,
          codeOnlyPages: 0, bodyPages: 0, parenPair: null
        });
        var e = termMap.get(key);
        e.pages.add(pageNum);
        e.freq++;

        // 코드 vs 본문 페이지 카운트
        var termLow = entry.term.toLowerCase();
        if (codeFontTexts.has(termLow) && !bodyFontTexts.has(termLow)) {
          e.codeOnlyPages++;
        } else if (bodyFontTexts.has(termLow)) {
          e.bodyPages++;
        } else {
          e.bodyPages++; // non-PDF 또는 판별 불가 시 본문으로
        }
      }
    }

    // 영문 고유명사/약어 자동 감지
    var caps = text.match(/\b[A-Z][A-Za-z0-9]*(?:\.[A-Za-z]+)*\b/g) || [];
    for (var w2 of caps) {
      if (w2.length < 2) continue;
      var wLow = w2.toLowerCase();
      if (STOP.has(wLow) || LANG_KEYWORDS.has(wLow)) continue;
      var ck = wLow.replace(/[^a-z0-9]/g, '');
      if (ck.length < 2 || DICT[ck]) continue;
      if (!termMap.has(ck)) termMap.set(ck, {
        term: w2, cat: 'book', pages: new Set(), freq: 0,
        isDefined: false, hasEnglishParen: false, hasActionContext: false,
        isHeaderOnly: false, isModifierOnly: false,
        codeOnlyPages: 0, bodyPages: 0, parenPair: null
      });
      var e2 = termMap.get(ck);
      e2.pages.add(pageNum);
      e2.freq++;
      // 코드 폰트 검사
      if (codeFontTexts.has(wLow) && !bodyFontTexts.has(wLow)) {
        e2.codeOnlyPages++;
      } else {
        e2.bodyPages++;
      }
    }

    // 한글 복합 기술 용어 자동 감지
    var KO_TECH_SUFFIX = /(?:엔진|프레임워크|파이프라인|아키텍처|패턴|알고리즘|모델|라이브러리|플랫폼|프로토콜|미들웨어|데이터베이스|서버|클라이언트|인터페이스|컴파일러|런타임|커널|드라이버|에뮬레이터|시뮬레이터|컨트롤러|매니저|핸들러|리스너|프로세서|파서|렌더러|스케줄러|레지스트리|레포지토리|게이트웨이|프록시|브로커|오케스트레이터|체이닝|추론|임베딩|토크나이저|벡터화|직렬화|역직렬화|인코딩|디코딩|매핑|바인딩|래핑|캐싱|풀링|샤딩|리플리케이션|마이그레이션|디플로이|롤백|스케일링|모니터링|로깅|프로파일링|디버깅|테스팅|리팩토링)$/;
    var koCompounds = text.match(/[가-힣A-Za-z]{2,}\s[가-힣A-Za-z]{2,}(?:\s[가-힣A-Za-z]{2,})?/g) || [];
    for (var kc of koCompounds) {
      var kcTrim = kc.trim();
      if (kcTrim.length < 4 || kcTrim.length > 20) continue;
      if (!KO_TECH_SUFFIX.test(kcTrim)) continue;
      var kcKey = kcTrim.toLowerCase().replace(/[^a-z가-힣0-9]/g, '');
      if (kcKey.length < 3 || DICT[kcKey]) continue;
      if (!termMap.has(kcKey)) termMap.set(kcKey, {
        term: kcTrim, cat: 'book', pages: new Set(), freq: 0,
        isDefined: false, hasEnglishParen: false, hasActionContext: false,
        isHeaderOnly: false, isModifierOnly: false,
        codeOnlyPages: 0, bodyPages: 0, parenPair: null
      });
      var e3 = termMap.get(kcKey);
      e3.pages.add(pageNum);
      e3.freq++;
      e3.bodyPages++;
    }

    // 괄호 영문 정의 감지: "한글용어(EnglishTerm)"
    var parenTerms = text.match(/[가-힣]{2,}(?:\s[가-힣]{2,})?\s*\([A-Z][A-Za-z\s-]+\)/g) || [];
    for (var pt2 of parenTerms) {
      var koMatch = pt2.match(/^([가-힣\s]+)\s*\(/);
      var enMatch = pt2.match(/\(([A-Z][A-Za-z\s-]+)\)/);
      if (!koMatch || !enMatch) continue;
      var koTerm = koMatch[1].trim();
      var enTerm = enMatch[1].trim();
      if (LANG_KEYWORDS.has(enTerm.toLowerCase())) continue;

      var koKey = koTerm.toLowerCase().replace(/[^가-힣0-9]/g, '');
      if (koKey.length >= 2 && !DICT[koKey] && !termMap.has(koKey)) {
        termMap.set(koKey, {
          term: koTerm, cat: 'book', pages: new Set(), freq: 0,
          isDefined: true, hasEnglishParen: true, hasActionContext: false,
          isHeaderOnly: false, isModifierOnly: false,
          codeOnlyPages: 0, bodyPages: 0, parenPair: enTerm
        });
      }
      if (termMap.has(koKey)) {
        var ke = termMap.get(koKey);
        ke.pages.add(pageNum); ke.freq++; ke.bodyPages++;
        ke.isDefined = true; ke.hasEnglishParen = true;
        if (!ke.parenPair) ke.parenPair = enTerm;
      }

      var enKey = enTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (enKey.length >= 2 && !DICT[enKey] && !STOP.has(enKey) && !LANG_KEYWORDS.has(enTerm.toLowerCase()) && !termMap.has(enKey)) {
        termMap.set(enKey, {
          term: enTerm, cat: 'book', pages: new Set(), freq: 0,
          isDefined: true, hasEnglishParen: false, hasActionContext: false,
          isHeaderOnly: false, isModifierOnly: false,
          codeOnlyPages: 0, bodyPages: 0, parenPair: koTerm
        });
      }
      if (termMap.has(enKey)) {
        var ee = termMap.get(enKey);
        ee.pages.add(pageNum); ee.freq++; ee.bodyPages++;
        ee.isDefined = true;
        if (!ee.parenPair) ee.parenPair = koTerm;
      }
    }

    // 정의 패턴 감지
    var DEF_PATTERNS = [
      /([가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,15}?)(?:이란|란|는|은)\s+(?:[^.]*?)(?:이다|를 의미한다|를 가리킨다|라고 한다|라고 부른다)/g,
      /([가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,15}?)\(?이?\)?란\s/g,
      /이른바\s+([가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,15}?)(?:는|은|이)/g,
    ];
    for (var dpat of DEF_PATTERNS) {
      dpat.lastIndex = 0;
      var dm;
      while ((dm = dpat.exec(text)) !== null) {
        var defTerm = dm[1].trim();
        if (defTerm.length < 2 || defTerm.length > 20) continue;
        var defKey = defTerm.toLowerCase().replace(/[^a-z가-힣0-9]/g, '');
        if (defKey.length < 2 || STOP.has(defKey) || LANG_KEYWORDS.has(defTerm.toLowerCase())) continue;
        if (!termMap.has(defKey)) {
          termMap.set(defKey, {
            term: defTerm, cat: 'book', pages: new Set(), freq: 0,
            isDefined: true, hasEnglishParen: false, hasActionContext: false,
            isHeaderOnly: false, isModifierOnly: false,
            codeOnlyPages: 0, bodyPages: 0, definedAt: pageNum, parenPair: null
          });
        }
        var de = termMap.get(defKey);
        de.pages.add(pageNum);
        de.freq++;
        de.isDefined = true;
        de.bodyPages++;
        if (!de.definedAt) de.definedAt = pageNum;
      }
    }

    // 동작/사용 컨텍스트 감지
    var ACTION_PATTERNS = [
      /사용하[여려면]/g, /실행하[여려면]/g, /설정하[여려면]/g, /호출하[여려면]/g,
      /구현하[여려면]/g, /생성하[여려면]/g, /적용하[여려면]/g, /설치하[여려면]/g,
      /활용하[여려면]/g, /연결하[여려면]/g, /변환하[여려면]/g, /처리하[여려면]/g,
    ];
    termMap.forEach(function(entry) {
      if (entry.hasActionContext) return;
      var termEsc = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 동작 동사와 함께 등장하는지
      for (var ap of ACTION_PATTERNS) {
        ap.lastIndex = 0;
        var actionRe = new RegExp(termEsc + '[^.]{0,20}' + ap.source, 'g');
        if (actionRe.test(text)) {
          entry.hasActionContext = true;
          break;
        }
      }
    });
  }

  // ── Step 3: 헤더 전용 / 수식어 전용 검사 ──
  termMap.forEach(function(entry, key) {
    // 헤더 전용: 페이지에서 해당 용어가 첫 줄에만 등장
    var headerOnlyCount = 0;
    var totalPageCount = 0;
    for (var vp of validPages) {
      if (!(vp.text || '').includes(entry.term)) continue;
      totalPageCount++;
      var lines = vp.text.split('\n');
      var inFirst = lines.length > 0 && lines[0].includes(entry.term);
      var inRest = lines.slice(1).some(function(l){ return l.includes(entry.term); });
      if (inFirst && !inRest) headerOnlyCount++;
    }
    if (totalPageCount > 0 && headerOnlyCount / totalPageCount >= 0.8) {
      entry.isHeaderOnly = true;
    }

    // 수식어 전용: "X 알고리즘", "X 방식" 등에서 X만 추출된 경우
    if (!entry.isDefined && entry.freq <= 2) {
      var modPats = ['알고리즘','방식','패턴','모드','타입','유형','기법','방법','기능','옵션'];
      var isModOnly = true;
      for (var vp2 of validPages) {
        if (!(vp2.text || '').includes(entry.term)) continue;
        var surrounding = vp2.text;
        var idx = surrounding.indexOf(entry.term);
        while (idx !== -1) {
          var after = surrounding.substring(idx + entry.term.length, idx + entry.term.length + 10).trim();
          var hasModifier = modPats.some(function(mp) { return after.startsWith(mp); });
          if (!hasModifier) { isModOnly = false; break; }
          idx = surrounding.indexOf(entry.term, idx + 1);
        }
        if (!isModOnly) break;
      }
      if (isModOnly) entry.isModifierOnly = true;
    }
  });

  // ── Step 4: 점수 계산 + 필터 ──
  var scoredData = [];
  var _excludedCount = 0;
  var _definedCount = 0;
  termMap.forEach(function(v) {
    // 언어 키워드 최종 체크
    if (LANG_KEYWORDS.has(v.term.toLowerCase())) return;

    // UI 메뉴 텍스트 제외
    if (_isUiMenuText(v.term, allPagesText)) return;

    // 데이터 필드명 제외
    if (_isDataFieldPattern(v.term, allPagesText)) return;

    // 점수 계산
    v.score = _calcScore(v);

    if (v.isDefined) _definedCount++;
    if (v.score >= 7) {
      scoredData.push(v);
    } else {
      _excludedCount++;
    }
  });

  // ── Step 5: 한글-영문 중복 제거 ──
  scoredData = _deduplicateKoEn(scoredData);

  // 정렬: 점수 내림차순 → 가나다순
  scoredData.sort(function(a,b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.term.localeCompare(b.term, 'ko');
  });

  idxData = scoredData;

  // UI 표시
  btn.disabled = false; btn.textContent = '찾아보기 생성';
  document.getElementById('p16_aiBtn').style.display = '';
  document.getElementById('p16_copyBtn').style.display = '';
  document.getElementById('p16_dlBtn').style.display = '';
  document.getElementById('p16_resultArea').style.display = '';
  document.getElementById('p16_empty').style.display = 'none';

  var statParts = [extracted.total_pages + '페이지에서 ' + idxData.length + '개 용어 추출'];
  if (dobiraPages.size) statParts.push('도비라 ' + dobiraPages.size + '페이지 제외');
  if (_definedCount) statParts.push('정의 감지 ' + _definedCount + '개');
  if (_excludedCount) statParts.push('7점 미만 ' + _excludedCount + '개 제외');
  statParts.push('AI 정제로 더 개선 가능');
  _setStatus(statParts.join(' · '));
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

  // 요약 + QA 통계
  var catCounts = {};
  var totalScore = 0;
  var scoreDistrib = { excellent: 0, good: 0, fair: 0 }; // 9+, 8~9, 7~8
  idxData.forEach(function(e) {
    catCounts[e.cat] = (catCounts[e.cat] || 0) + 1;
    totalScore += (e.score || 0);
    if (e.score >= 9) scoreDistrib.excellent++;
    else if (e.score >= 8) scoreDistrib.good++;
    else scoreDistrib.fair++;
  });
  var avgScore = idxData.length > 0 ? (totalScore / idxData.length).toFixed(1) : '0.0';
  var pctExcellent = idxData.length > 0 ? Math.round(scoreDistrib.excellent / idxData.length * 100) : 0;
  var pctGood = idxData.length > 0 ? Math.round(scoreDistrib.good / idxData.length * 100) : 0;
  var pctFair = idxData.length > 0 ? Math.round(scoreDistrib.fair / idxData.length * 100) : 0;

  var sum = document.getElementById('p16_summary');
  if (sum) {
    var parts = [];
    for (var c in catCounts) {
      parts.push((CATS[c]?.label || c) + ' ' + catCounts[c] + '개');
    }
    var html = '총 <strong>' + idxData.length + '</strong>개 용어 &middot; ' + parts.join(' &middot; ');
    html += (filtered.length !== idxData.length ? ' &middot; 표시: ' + filtered.length + '개' : '');
    html += '<br><span class="p16-qa-stats">평균 점수 <strong>' + avgScore + '</strong> / 10 &middot; ';
    html += '우수(9+) ' + pctExcellent + '% &middot; 양호(8~9) ' + pctGood + '% &middot; 보통(7~8) ' + pctFair + '%</span>';
    sum.innerHTML = html;
  }

  // 카테고리 버튼
  var btns = document.getElementById('p16_catBtns');
  if (btns) {
    var bhtml = '';
    for (var c2 in CATS) {
      if (!catCounts[c2]) continue;
      bhtml += '<button class="p16-cat-btn' + (currentFilter===c2?' active':'') + '" data-cat="' + c2 + '" onclick="p16_filter(this)">' +
        CATS[c2].label + ' (' + catCounts[c2] + ')</button>';
    }
    btns.innerHTML = bhtml;
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
    var pageStr = pArr.map(function(pg) {
      return e.definedAt === pg ? '<strong>' + pg + '</strong>' : '' + pg;
    }).join(', ');
    var termLabel = _esc(e.term) + (e.isDefined ? ' <span style="color:var(--accent);font-size:10px" title="저자가 정의한 용어">📖</span>' : '');
    var scoreVal = e.score || 0;
    var scoreCls = scoreVal >= 9 ? 'p16-score-excellent' : scoreVal >= 8 ? 'p16-score-good' : 'p16-score-fair';
    return '<tr>' +
      '<td class="p16-term">' + termLabel + '</td>' +
      '<td><span class="p16-cat ' + catInfo.css + '">' + catInfo.label + '</span></td>' +
      '<td style="text-align:center"><span class="p16-score ' + scoreCls + '">' + scoreVal + '</span></td>' +
      '<td style="text-align:center">' + e.freq + '</td>' +
      '<td class="p16-pages">' + pageStr + '</td>' +
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
    try { apiKey = (await loadApiKey()) || ''; } catch(e) { console.warn('[panel16] p16_aiEnhance() API 키 로드 실패', e); }
  }
  if (!apiKey) {
    alert('AI 정제에는 Claude API 키가 필요합니다.\n통합현황 탭에서 API 키를 설정하세요.');
    return;
  }
  if (!idxData.length) return;

  var btn = document.getElementById('p16_aiBtn');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 분석 중…'; }
  _setStatus('AI가 용어를 분석하고 있습니다…');

  // 용어 목록 (점수 포함)
  var termList = idxData.map(function(e) {
    return e.term + ' (점수:' + (e.score||0) + ', ' + e.freq + '회, ' + (CATS[e.cat]?.label || e.cat) + (e.isDefined ? ', 정의됨' : '') + ')';
  }).join('\n');

  // 문서 샘플
  var allPages = (extracted?.pages || []);
  var mid = Math.floor(allPages.length / 2);
  var samplePages = [
    ...allPages.slice(0, 2),
    ...allPages.slice(Math.max(0, mid - 1), mid + 1),
    ...allPages.slice(-2)
  ];
  var sample = samplePages.map(function(p) {
    return '[p.' + (p.bodyPageNum || p.page) + '] ' + p.text.slice(0, 400);
  }).join('\n---\n');

  var prompt = '아래는 IT 기술서의 자동 추출 용어 목록(색인 가치 점수 포함)과 문서 샘플입니다.\n' +
    '이 책의 뒤쪽 "찾아보기(INDEX)" 페이지에 들어갈 용어를 9단계 기술서 색인 방법론으로 정리해 주세요.\n\n' +
    '[현재 용어 목록 (' + idxData.length + '개)]\n' + termList + '\n\n' +
    '[문서 샘플 (앞·중간·끝)]\n' + sample + '\n\n' +
    '=== 9단계 색인 방법론 기반 작업 ===\n\n' +
    '1. **색인 가치 평가 재검증**: 7점 미만이 남아있다면 제거. 점수 기준:\n' +
    '   - 10: 영문 병기 정의 (예: "환각Hallucination이란?")\n' +
    '   - 9: "X는 ~이다" 식 명확한 정의\n' +
    '   - 8: 본문에서 3회 이상 의미 있게 다뤄짐\n' +
    '   - 7: 동작/사용 설명이 있음\n' +
    '   - 5 이하: 단순 언급 → 제거\n\n' +
    '2. **합성어 쪼개짐 검토**: PDF에서 "Transformer"가 "Trans"+"former"로 쪼개져 추출된 경우 → 올바른 형태로 교체\n\n' +
    '3. **한글-영문 중복**: 같은 개념의 한글/영문이 둘 다 있으면 한글을 메인으로 유지 (단, PascalCase 클래스명은 별도 유지)\n\n' +
    '4. **데이터 필드명/언어 키워드 제거**: "항목명: TypeHint" 패턴, "A·B·C" 나열의 일부, "X 필드"/"X 값" 패턴, ' +
    'await/List/Optional/String/int 등 프로그래밍 언어 키워드 제거\n\n' +
    '5. **같은 유형 일관성**: 비슷한 개념은 같은 표기 수준으로 통일 (예: 전부 한글 또는 전부 영문)\n\n' +
    '6. **영문 병기 개념어 발굴**: 문서에서 "한글(English)" 형태로 정의되었지만 목록에 없는 핵심 용어를 최대 20개 추가\n\n' +
    '7. **제거 대상**:\n' +
    '   - 너무 일반적 (Python, Git 등 어느 IT 책에나 나오는 기본어 — 이 책의 핵심이 아닐 때)\n' +
    '   - 코드에서만 등장하는 변수명/함수명\n' +
    '   - UI 메뉴명 [File] [Edit] 등\n' +
    '   - 1~2글자 무의미 약어\n\n' +
    '8. **추가 대상**: 이 책만의 핵심 개념, 독자가 찾아볼 만한 고유 용어 (최대 30개)\n\n' +
    '9. **재분류**: 카테고리 오류 수정\n\n' +
    '카테고리: ai(AI/ML), lang(프로그래밍), infra(인프라), data(데이터), dev(개발방법론), book(이 책 전용)\n\n' +
    'JSON 반환 (순수 JSON만, 마크다운 금지):\n' +
    '{"remove":["용어1"],"add":[{"term":"새 용어","cat":"카테고리","score":8}],"reclassify":[{"term":"용어","to":"카테고리"}],"fix_compound":[{"wrong":"쪼개진형태","correct":"올바른형태"}]}';

  try {
    var raw = await callClaudeApi({
      apiKey: apiKey,
      prompt: prompt,
      system: 'You are a Korean IT book index editor specializing in the 9-step technical book indexing methodology. Return ONLY valid JSON.',
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2500,
      temperature: 0,
      noPersona: true
    });

    var result = null;
    try {
      var cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      var m = cleaned.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : null;
    } catch(e) { console.warn('[panel16] p16_aiEnhance() AI 응답 JSON 파싱 실패', e); }

    var changes = 0;
    if (result) {
      // 합성어 교정
      if (result.fix_compound && result.fix_compound.length) {
        for (var fc of result.fix_compound) {
          if (!fc.wrong || !fc.correct) continue;
          var wrongKey = fc.wrong.toLowerCase().replace(/[^a-z가-힣0-9]/g,'');
          var found = idxData.find(function(e){ return e.term.toLowerCase().replace(/[^a-z가-힣0-9]/g,'') === wrongKey; });
          if (found) { found.term = fc.correct; changes++; }
        }
      }

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
          if (fr > 0) {
            idxData.push({
              term: a.term, cat: a.cat, pages: ps, freq: fr,
              score: a.score || 7, isDefined: false
            });
            changes++;
          }
        }
      }
      // 재분류
      if (result.reclassify && result.reclassify.length) {
        for (var rc of result.reclassify) {
          var rcFound = idxData.find(function(e){ return e.term === rc.term; });
          if (rcFound && rc.to && CATS[rc.to]) { rcFound.cat = rc.to; changes++; }
        }
      }
      idxData.sort(function(a,b) {
        if (b.score !== a.score) return (b.score||0) - (a.score||0);
        return a.term.localeCompare(b.term, 'ko');
      });
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
  var header = '용어\t카테고리\t점수\t빈도\t페이지';
  var lines = idxData.map(function(e) {
    var pArr = []; e.pages.forEach(function(v){ pArr.push(v); });
    pArr.sort(function(a,b){ return a-b; });
    return e.term + '\t' + (CATS[e.cat]?.label || e.cat) + '\t' + (e.score||0) + '\t' + e.freq + '\t' + pArr.join(', ');
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
