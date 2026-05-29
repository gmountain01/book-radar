(function(){
/* ══════════════════════════════════════════════════════
   panel13 — 컨셉 작성
   도서 기획의 첫 단계: 핵심 콘셉트를 정리하는 구조화된 폼
   ══════════════════════════════════════════════════════ */
var ROOT = document.getElementById('panel13');
if (!ROOT) return;

var LS_KEY = 'ms_concept_v2';
var data = {};

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) {} }
function load() {
  try { var r = localStorage.getItem(LS_KEY); if (r) data = JSON.parse(r); } catch(e) {}
  if (!data.title) data = _defaults();
}

function _defaults() {
  return {
    title: '바이브코딩으로 만드는 나만의 앱',
    subtitle: '비개발자를 위한 AI 코딩 입문서',
    oneLiner: '코딩을 모르는 사람도 AI와 대화하며 자신만의 앱을 뚝딱 만들어내는 실전 가이드',
    problem: '프로그래밍을 배우고 싶지만 어디서 시작해야 할지 모르겠다. 온라인 강의를 들어봤지만 "Hello World" 이후 막막하다. 아이디어는 있는데 구현할 기술이 없어서 항상 기획 단계에서 멈춘다.',
    solution: '이 책을 읽으면 Claude, Cursor 같은 AI 도구를 활용해 실제 동작하는 웹 앱을 스스로 만들 수 있다. 코드를 한 줄씩 이해하는 것이 아니라, AI에게 의도를 전달하고 결과물을 함께 만들어가는 "바이브코딩" 방식을 익힌다.',
    reader: '- 프로그래밍 경험이 전혀 없는 직장인, 대학생, 창업 준비생\n- 사이드 프로젝트를 만들고 싶은 기획자, 디자이너, 마케터\n- AI 도구를 업무에 활용하고 싶은 비개발 직군',
    diff: '기존 코딩 입문서는 문법부터 시작해서 독자가 지치기 쉽다. 이 책은 "만들고 싶은 것"에서 출발해서, AI에게 설명하는 과정 자체가 학습이 되는 역방향 접근법을 사용한다. 또한 2025년 최신 AI 코딩 도구(Cursor, Claude Code, Bolt.new)를 실전에서 비교하며 다룬다.',
    keywords: '바이브코딩, AI코딩, Cursor, Claude, 비개발자, 앱개발, 노코드, 사이드프로젝트',
    tone: '친근하고 실습 중심. 친구에게 설명하듯이 쉽게, 하지만 핵심은 정확하게. 유머를 곁들이되 가볍지 않게.',
    scope: '- AI 코딩 도구 선택과 설치\n- 프롬프트로 코드 생성하는 실전 기법\n- 웹 앱 3개 프로젝트 (투두앱, 블로그, 대시보드)\n- 배포까지 완성하는 전체 과정',
    notScope: '- 전통적인 프로그래밍 문법 교육 (변수, 반복문 등)\n- 머신러닝/딥러닝 모델 개발\n- 모바일 네이티브 앱 개발 (iOS/Android)',
    memo: '- 각 장 끝에 "혼자 해보기" 도전 과제 포함\n- QR 코드로 예제 코드/완성본 바로 접근\n- 독자 커뮤니티(Discord) 운영 계획'
  };
}

function _field(id, label, placeholder, type, rows) {
  var val = escHtml(data[id] || '');
  if (type === 'textarea') {
    return '<div class="cp-field"><label class="cp-label">' + label + '</label>' +
      '<textarea class="cp-input cp-textarea" id="cp_' + id + '" rows="' + (rows||3) + '" placeholder="' + placeholder + '" oninput="cpUpdate(\'' + id + '\',this.value)">' + val + '</textarea></div>';
  }
  return '<div class="cp-field"><label class="cp-label">' + label + '</label>' +
    '<input class="cp-input" id="cp_' + id + '" value="' + val + '" placeholder="' + placeholder + '" oninput="cpUpdate(\'' + id + '\',this.value)"></div>';
}

function render() {
  ROOT.innerHTML =
    '<div class="cp-wrap">' +
      '<div class="cp-header">' +
        '<div class="cp-title">💡 도서 컨셉 작성</div>' +
        '<div class="cp-sub">도서 기획의 첫 단계 — 핵심 콘셉트를 체계적으로 정리합니다</div>' +
      '</div>' +
      '<div class="cp-body">' +
        '<div class="cp-section"><div class="cp-section-title">기본 정보</div>' +
          _field('title', '도서 제목 (가제)', '예: 바이브코딩으로 만드는 나만의 앱', 'input') +
          _field('subtitle', '부제', '예: 비개발자를 위한 AI 코딩 입문서', 'input') +
          _field('oneLiner', '한 줄 콘셉트', '이 책을 한 문장으로 설명한다면?', 'input') +
        '</div>' +
        '<div class="cp-section"><div class="cp-section-title">독자와 문제</div>' +
          _field('reader', '대상 독자', '이 책을 읽을 사람은 누구인가? 직군, 경력, 현재 고민', 'textarea', 2) +
          _field('problem', '독자의 문제', '독자가 겪고 있는 구체적인 문제나 니즈는?', 'textarea', 3) +
          _field('solution', '이 책의 해결책', '이 책을 읽으면 독자가 얻는 것은?', 'textarea', 3) +
        '</div>' +
        '<div class="cp-section"><div class="cp-section-title">차별화와 범위</div>' +
          _field('diff', '기존 도서와 차별점', '같은 주제의 기존 도서와 무엇이 다른가?', 'textarea', 3) +
          _field('scope', '다루는 범위', '이 책에서 반드시 다루는 내용', 'textarea', 2) +
          _field('notScope', '다루지 않는 범위', '이 책에서 명시적으로 제외하는 내용', 'textarea', 2) +
        '</div>' +
        '<div class="cp-section"><div class="cp-section-title">톤과 키워드</div>' +
          _field('tone', '문체 / 톤', '예: 친근하고 실습 중심, 대화체, 전문적이되 쉽게', 'input') +
          _field('keywords', '핵심 키워드', '쉼표로 구분 — 예: 바이브코딩, AI, 앱개발, 비개발자', 'input') +
          _field('memo', '자유 메모', '추가로 정리하고 싶은 아이디어, 참고 사항', 'textarea', 4) +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
        '<button class="cp-dl-btn" onclick="cpDownloadDocx()">📥 .docx 다운로드</button>' +
        '<button class="cp-reset-btn" onclick="cpReset()">초기화</button>' +
      '</div>' +
    '</div>';
}

window.cpUpdate = function(field, value) {
  data[field] = value;
  save();
};

window.cpDownloadDocx = function() {
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리가 필요합니다.'); return; }
  var x = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');

  var body = '';
  // 큰 제목
  body += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/><w:color w:val="2F3061"/></w:rPr><w:t>도서 컨셉 기획서</w:t></w:r></w:p>';
  body += '<w:p/>';

  var fields = [
    ['도서 제목 (가제)', data.title],
    ['부제', data.subtitle],
    ['한 줄 콘셉트', data.oneLiner],
    ['대상 독자', data.reader],
    ['독자의 문제', data.problem],
    ['이 책의 해결책', data.solution],
    ['기존 도서와 차별점', data.diff],
    ['다루는 범위', data.scope],
    ['다루지 않는 범위', data.notScope],
    ['문체 / 톤', data.tone],
    ['핵심 키워드', data.keywords],
    ['자유 메모', data.memo]
  ];

  fields.forEach(function(f) {
    var label = f[0], val = (f[1] || '').trim();
    if (!val) return;
    // 라벨 (굵게, 보라색)
    body += '<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="3B3F8C"/></w:rPr><w:t>[' + x(label) + ']</w:t></w:r></w:p>';
    // 내용
    val.split('\n').forEach(function(line) {
      body += '<w:p><w:r><w:t xml:space="preserve">' + x(line) + '</w:t></w:r></w:p>';
    });
    body += '<w:p/>';
  });

  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>');

  zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    .then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (data.title || '도서컨셉').replace(/[^\w가-힣]/g, '_').slice(0, 30) + '_컨셉.docx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
};

window.cpReset = function() {
  if (!confirm('모든 컨셉 내용을 삭제합니다.\n계속하시겠습니까?')) return;
  data = { title:'', subtitle:'', oneLiner:'', problem:'', solution:'', reader:'', diff:'', keywords:'', tone:'', scope:'', notScope:'', memo:'' };
  save();
  render();
};

var _init13 = false;
function initPanel13() {
  if (!_init13) { _init13 = true; }
  load(); // 매 활성화 시 리로드 (외부 변경 감지)
  render();
}

if (typeof PanelRegistry !== 'undefined') PanelRegistry.register(13, { onActivate: initPanel13 });
window._initPanel13 = initPanel13;
})();
