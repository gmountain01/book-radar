(function(){
/* ══════════════════════════════════════════════════════
   panel15 — 앞부속 작성
   저자의 말, 추천사, 이 책의 구성, 대상 독자 등
   책 본문 앞에 들어가는 소개 콘텐츠 작성
   ══════════════════════════════════════════════════════ */
var ROOT = document.getElementById('panel15');
if (!ROOT) return;

var LS_KEY = 'ms_frontmatter_v2';
var activeTab = 'author';
var data = {};

var TABS = [
  { key: 'author',   label: '저자의 말',     title: '저자의 말 / 머리말',
    desc: '이 책을 쓰게 된 계기, 독자에게 전하고 싶은 메시지, 감사 인사를 작성합니다.',
    placeholder: '이 책을 쓰게 된 이야기, 독자에게 전하고 싶은 말, 집필 과정에서의 경험 등을 자유롭게 작성하세요.' },
  { key: 'recommend', label: '추천사',        title: '추천사',
    desc: '업계 전문가, 교수, 동료 등의 추천사를 정리합니다. 추천인별로 구분하여 작성하세요.',
    placeholder: '[추천인 이름 / 소속 / 직함]\n\n추천사 내용을 작성하세요.\n\n---\n\n[두 번째 추천인]\n\n추천사 내용...' },
  { key: 'howto',    label: '이 책의 구성',   title: '이 책의 구성 / 활용법',
    desc: '책의 전체 구조와 각 장의 역할, 권장 학습 순서를 설명합니다.',
    placeholder: '이 책은 총 N부 M장으로 구성되어 있습니다.\n\n[1부: 기초]\n1장에서는...\n2장에서는...\n\n[2부: 실전]\n3장에서는...' },
  { key: 'reader',   label: '대상 독자',      title: '이 책의 대상 독자',
    desc: '이 책을 읽으면 좋은 독자층과 사전 지식 수준을 명시합니다.',
    placeholder: '이 책은 다음과 같은 분들을 위해 쓰여졌습니다.\n\n- ...\n- ...\n\n사전에 알아야 할 지식:\n- ...' },
  { key: 'env',      label: '학습 환경',      title: '실습 환경 / 준비물',
    desc: '실습에 필요한 소프트웨어, 하드웨어, 계정 등을 안내합니다.',
    placeholder: '운영체제: Windows 10 이상 / macOS 12 이상\n필수 소프트웨어:\n- ...\n\n예제 코드 다운로드:\n- ...' },
  { key: 'ack',      label: '감사의 글',      title: '감사의 글',
    desc: '도움을 주신 분들에 대한 감사 인사를 작성합니다.',
    placeholder: '이 책이 나오기까지 도움을 주신 모든 분들께 감사드립니다.\n\n...' },
  { key: 'memo',     label: '기타 메모',      title: '기타 앞부속 메모',
    desc: '판권, 일러두기, 약어표 등 추가로 필요한 앞부속 내용을 자유롭게 메모합니다.',
    placeholder: '일러두기, 약어표, 용어 정리, 판권 표기 등 자유롭게 작성하세요.' }
];

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) {} }
function load() {
  try { var r = localStorage.getItem(LS_KEY); if (r) data = JSON.parse(r); } catch(e) {}
  if (!data || typeof data !== 'object' || !Object.keys(data).length) data = _defaults();
}

function _defaults() {
  return {
    author: '"완벽한 준비"를 기다리던 시절이 있었습니다.\n\n프로그래밍을 시작하기 전에 컴퓨터공학 전공서를 다 읽어야 한다고 생각했고, 글을 쓰기 전에 문장력 강좌를 먼저 들어야 한다고 믿었습니다. 그렇게 준비만 하다가 정작 아무것도 시작하지 못한 채 1년이 흘렀습니다.\n\n이 책은 그런 저 자신에게 보내는 편지이기도 합니다. 완벽하지 않아도 시작할 수 있다는 것, 작은 한 걸음이 모여 길이 된다는 것을 독자 여러분과 나누고 싶었습니다.\n\n책을 쓰는 동안 가장 많이 떠올린 독자는 "지금 막 시작하려는 사람"입니다. 어디서부터 손대야 할지 막막한 분, 정보의 바다에서 방향을 잃은 분, 그리고 "나도 할 수 있을까?"라는 질문 앞에 서 있는 분. 이 책이 그 첫 발걸음에 작은 용기가 되기를 바랍니다.\n\n2026년 봄\n저자 드림',

    recommend: '[김지현 / 네이버 테크 리드]\n\n기술 서적은 보통 두 부류로 나뉩니다. 이론에 치우쳐 현실과 동떨어진 책, 아니면 코드만 나열하고 "왜"를 설명하지 않는 책. 이 책은 드물게 두 가지를 모두 잡았습니다. 현업에서 매일 마주치는 문제를 실제 코드로 풀어내면서도, 그 뒤에 숨은 설계 철학까지 짚어줍니다.\n\n---\n\n[박수영 / 서울대학교 컴퓨터공학부 교수]\n\n학생들에게 늘 "교과서 밖의 세상을 보라"고 말합니다. 이 책이 바로 그 다리 역할을 합니다. 학교에서 배운 이론이 실무에서 어떻게 숨 쉬는지, 생생한 사례로 보여줍니다. 입문자뿐 아니라 현업 3~5년 차에게도 새로운 시야를 열어줄 겁니다.',

    howto: '이 책은 3부 10장으로 구성되어 있습니다.\n\n[1부: 기초 다지기 (1~3장)]\n프로그래밍 경험이 전혀 없는 분도 따라올 수 있도록 핵심 개념부터 차근차근 설명합니다. 1장에서 개발 환경을 세팅하고, 2장에서 기본 문법을 익히고, 3장에서 첫 번째 작은 프로젝트를 완성합니다.\n\n[2부: 실전 프로젝트 (4~7장)]\n실제 서비스를 만들어보는 핵심 파트입니다. 4장부터 난이도를 조금씩 올리면서 총 4개의 프로젝트를 완성합니다. 각 장 끝에 "도전 과제"를 넣었으니, 본문을 따라한 뒤 혼자 힘으로 변형해보세요.\n\n[3부: 한 단계 더 (8~10장)]\n배포, 테스트, 성능 최적화 등 실무에서 반드시 필요한 주제를 다룹니다. 2부까지 마친 뒤 필요한 장만 골라 읽어도 좋습니다.\n\n💡 권장 학습 순서\n입문자: 1부 → 2부 → 3부 (순서대로)\n경험자: 2부부터 시작 → 모르는 부분만 1부 참고\n현업 개발자: 3부 먼저 → 관심 있는 프로젝트만 2부에서 선택',

    reader: '이 책은 다음과 같은 분들을 위해 쓰여졌습니다.\n\n✅ 이런 분께 추천합니다\n- 프로그래밍을 처음 배우는 비전공자\n- 온라인 강의를 들었지만 혼자 프로젝트를 완성하지 못하는 분\n- 현업에서 새로운 기술 스택을 빠르게 익혀야 하는 주니어 개발자\n- 사이드 프로젝트를 시작하고 싶은 기획자/디자이너\n\n⚠️ 이런 분께는 맞지 않을 수 있습니다\n- 이미 해당 기술로 2년 이상 실무 경험이 있는 분\n- 학술 논문 수준의 이론적 깊이를 원하는 분\n\n📋 사전 지식\n- 컴퓨터 기본 조작 (파일 생성, 웹 브라우저 사용)\n- 프로그래밍 경험은 없어도 됩니다',

    env: '💻 운영체제\n- Windows 10/11 또는 macOS 12(Monterey) 이상\n- Linux(Ubuntu 22.04 이상)도 가능합니다\n\n🛠 필수 소프트웨어\n- VS Code (무료, https://code.visualstudio.com)\n- Node.js 20 LTS 이상\n- Git\n\n☁️ 계정 (무료)\n- GitHub 계정\n- Vercel 또는 Netlify 계정 (배포 실습용)\n\n📦 예제 코드\n- GitHub 저장소: (출판 시 URL 기입)\n- 각 장별 브랜치로 구분되어 있어, 원하는 장부터 시작할 수 있습니다\n- 완성본과 스타터 코드를 모두 제공합니다\n\n⚡ 권장 사양\n- RAM 8GB 이상\n- 디스크 여유 공간 10GB 이상',

    ack: '이 책이 세상에 나올 수 있었던 건 수많은 분들의 도움 덕분입니다.\n\n먼저 기획 단계부터 함께 고민해주신 한빛미디어 편집팀에 깊이 감사드립니다. 특히 담당 편집자님의 날카로운 피드백이 없었다면 이 책은 훨씬 두껍고 읽기 어려운 책이 되었을 겁니다.\n\n베타리딩에 참여해주신 20분의 독자님 — 여러분의 "여기가 이해 안 돼요"라는 솔직한 피드백이 이 책의 완성도를 한 단계 끌어올렸습니다.\n\n회사에서 업무 시간 외에 집필을 허락해주신 팀장님, 주말마다 아빠를 카페에 보내준 아내와 아이에게도 사랑과 감사를 전합니다.\n\n마지막으로, 이 책을 선택해주신 독자 여러분께 감사드립니다. 읽으시면서 궁금한 점이 생기면 언제든 GitHub 이슈나 이메일로 연락해주세요. 함께 성장하는 여정이 되기를 바랍니다.',

    memo: ''
  };
}

function render() {
  var tab = TABS.filter(function(t) { return t.key === activeTab; })[0] || TABS[0];
  var content = data[activeTab] || '';
  var wc = content.replace(/\s/g, '').length;

  ROOT.innerHTML =
    '<div class="fm-wrap">' +
      '<div class="fm-header">' +
        '<div class="fm-title">📖 앞부속 작성</div>' +
        '<div class="fm-sub">본문 앞에 들어가는 소개 콘텐츠 — 저자의 말, 추천사, 이 책의 구성 등</div>' +
      '</div>' +
      '<div class="fm-tabs">' +
        TABS.map(function(t) {
          var cls = t.key === activeTab ? ' active' : '';
          return '<button class="fm-tab' + cls + '" onclick="fmSetTab(\'' + t.key + '\')">' + t.label + '</button>';
        }).join('') +
      '</div>' +
      '<div class="fm-card">' +
        '<div class="fm-card-title">' + tab.title + '</div>' +
        '<div class="fm-card-desc">' + tab.desc + '</div>' +
        '<textarea class="fm-textarea" id="fm-content" placeholder="' + escHtml(tab.placeholder) + '" oninput="fmUpdate(this.value)">' + escHtml(content) + '</textarea>' +
        '<div class="fm-wordcount">' + wc.toLocaleString() + ' 자</div>' +
      '</div>' +
      '<div class="fm-actions">' +
        '<button class="fm-btn fm-btn-primary" onclick="fmDownloadDocx()">📥 .docx 다운로드</button>' +
        '<button class="fm-btn" onclick="fmCopyAll()">📋 전체 복사</button>' +
        '<span style="flex:1;"></span>' +
        '<button class="fm-btn" onclick="fmReset()" style="color:#c23d2f;border-color:#f0c0bc;">초기화</button>' +
      '</div>' +
    '</div>';
}

window.fmSetTab = function(key) {
  // 현재 내용 저장
  var el = document.getElementById('fm-content');
  if (el) { data[activeTab] = el.value; save(); }
  activeTab = key;
  render();
};

window.fmReset = function() {
  if (!confirm('모든 앞부속 내용을 삭제합니다.\n계속하시겠습니까?')) return;
  data = {};
  TABS.forEach(function(t) { data[t.key] = ''; });
  save();
  render();
};

window.fmUpdate = function(value) {
  data[activeTab] = value;
  save();
  // 글자 수만 갱신
  var wc = value.replace(/\s/g, '').length;
  var wcEl = ROOT.querySelector('.fm-wordcount');
  if (wcEl) wcEl.textContent = wc.toLocaleString() + ' 자';
};

window.fmCopyAll = function() {
  var txt = TABS.map(function(t) {
    var content = (data[t.key] || '').trim();
    if (!content) return '';
    return '=== ' + t.title + ' ===\n\n' + content;
  }).filter(Boolean).join('\n\n\n');
  if (!txt) { alert('작성된 내용이 없습니다.'); return; }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(function() { alert('전체 앞부속이 클립보드에 복사되었습니다.'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    alert('전체 앞부속이 클립보드에 복사되었습니다.');
  }
};

window.fmDownloadDocx = function() {
  var el = document.getElementById('fm-content');
  if (el) { data[activeTab] = el.value; save(); }
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리가 필요합니다.'); return; }
  var zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');

  var body = '';
  TABS.forEach(function(t) {
    var content = (data[t.key] || '').trim();
    if (!content) return;
    // 섹션 제목 (인라인 스타일 — 22pt 굵게 인디고)
    body += '<w:p><w:pPr><w:spacing w:before="360" w:after="200"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/><w:color w:val="2F3061"/></w:rPr><w:t>' + _x(t.title) + '</w:t></w:r></w:p>';
    // 본문
    content.split('\n').forEach(function(line) {
      body += '<w:p><w:r><w:t xml:space="preserve">' + _x(line) + '</w:t></w:r></w:p>';
    });
    // 페이지 나누기
    body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  });

  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>');

  zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    .then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '앞부속.docx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
};

function _x(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

var _init15 = false;
function initPanel15() {
  if (!_init15) { _init15 = true; }
  load();
  render();
}

if (typeof PanelRegistry !== 'undefined') PanelRegistry.register(15, { onActivate: initPanel15 });
window._initPanel15 = initPanel15;
})();
