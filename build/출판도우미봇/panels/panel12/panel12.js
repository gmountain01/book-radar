(function(){
/* ══════════════════════════════════════════════════════
   panel12 — 원고 작성 에디터
   계층 트리 구조: level 1~4 (장 > 절 > 소절 > 항)
   4단 폼: 제목 → 제목 요약 → 도입 → 본문
   .docx 다운로드 (JSZip OOXML 직접 생성)
   ══════════════════════════════════════════════════════ */
var ROOT = document.getElementById('panel12');
if (!ROOT) return;

var LS_KEY = 'ms_manuscript_v3';
var STYLE_KEY = 'ms_style';
var sections = [];
var activeIdx = 0;
var currentStyle = 'classic';
var LEVEL_NAMES = ['', '장', '절', '중절', '소절', '소소절'];
var LEVEL_INDENT = [0, 0, 16, 32, 48, 64];

// ─── 5가지 스타일 프리셋 ────────────────────────────────
var STYLES = {
  classic: {
    name: '클래식', desc: '전통 출판 스타일',
    h1: { size: 44, color: '2F3061', bold: true, italic: false },
    h2: { size: 32, color: '333333', bold: true, italic: false },
    h3: { size: 26, color: '444444', bold: true, italic: false },
    h4: { size: 24, color: '555555', bold: true, italic: true },
    h5: { size: 22, color: '666666', bold: true, italic: false },
    summary: { size: 20, color: '777777', italic: true },
    body: { size: 22, color: '1a1a1a', font: '맑은 고딕' },
    label: { color: '3B3F8C' },
    css: { h1: '#2F3061', h2: '#333', h3: '#444', h4: '#555', h5: '#666', accent: '#3B3F8C', bg: '#fafaf8' }
  },
  modern: {
    name: '모던', desc: '깔끔한 현대적 스타일',
    h1: { size: 40, color: '0F172A', bold: true, italic: false },
    h2: { size: 30, color: '1E293B', bold: true, italic: false },
    h3: { size: 26, color: '334155', bold: true, italic: false },
    h4: { size: 24, color: '475569', bold: false, italic: false },
    h5: { size: 22, color: '64748B', bold: false, italic: false },
    summary: { size: 20, color: '94A3B8', italic: true },
    body: { size: 22, color: '1E293B', font: '맑은 고딕' },
    label: { color: '2563EB' },
    css: { h1: '#0F172A', h2: '#1E293B', h3: '#334155', h4: '#475569', h5: '#64748B', accent: '#2563EB', bg: '#f8fafc' }
  },
  warm: {
    name: '따뜻한', desc: '부드러운 세리프 스타일',
    h1: { size: 44, color: '7C2D12', bold: true, italic: false },
    h2: { size: 32, color: '92400E', bold: true, italic: false },
    h3: { size: 26, color: 'A16207', bold: true, italic: false },
    h4: { size: 24, color: 'B45309', bold: true, italic: true },
    h5: { size: 22, color: 'CA8A04', bold: false, italic: false },
    summary: { size: 20, color: 'A8A29E', italic: true },
    body: { size: 22, color: '44403C', font: '바탕' },
    label: { color: 'C2410C' },
    css: { h1: '#7C2D12', h2: '#92400E', h3: '#A16207', h4: '#B45309', h5: '#CA8A04', accent: '#C2410C', bg: '#fdf8f4' }
  },
  ocean: {
    name: '오션', desc: '시원한 블루 톤',
    h1: { size: 44, color: '0C4A6E', bold: true, italic: false },
    h2: { size: 32, color: '075985', bold: true, italic: false },
    h3: { size: 26, color: '0369A1', bold: true, italic: false },
    h4: { size: 24, color: '0284C7', bold: true, italic: false },
    h5: { size: 22, color: '0EA5E9', bold: false, italic: false },
    summary: { size: 20, color: '7DD3FC', italic: true },
    body: { size: 22, color: '0F172A', font: '맑은 고딕' },
    label: { color: '0284C7' },
    css: { h1: '#0C4A6E', h2: '#075985', h3: '#0369A1', h4: '#0284C7', h5: '#0EA5E9', accent: '#0284C7', bg: '#f0f9ff' }
  },
  forest: {
    name: '포레스트', desc: '자연 친화적 그린 톤',
    h1: { size: 44, color: '14532D', bold: true, italic: false },
    h2: { size: 32, color: '166534', bold: true, italic: false },
    h3: { size: 26, color: '15803D', bold: true, italic: false },
    h4: { size: 24, color: '16A34A', bold: true, italic: true },
    h5: { size: 22, color: '22C55E', bold: false, italic: false },
    summary: { size: 20, color: '86EFAC', italic: true },
    body: { size: 22, color: '1a1a1a', font: '맑은 고딕' },
    label: { color: '15803D' },
    css: { h1: '#14532D', h2: '#166534', h3: '#15803D', h4: '#16A34A', h5: '#22C55E', accent: '#15803D', bg: '#f0fdf4' }
  }
};

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(sections)); } catch(e) {} }
function loadStyle() { try { var s = localStorage.getItem(STYLE_KEY); if (s && STYLES[s]) currentStyle = s; } catch(e) {} }
function load() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      sections = JSON.parse(raw);
      // v1 호환: level 없으면 1로 설정
      sections.forEach(function(s) { if (!s.level) s.level = 1; });
    }
  } catch(e) {}
  if (!sections.length) sections = _defaultSections();
}

function _defaultSections() {
  return [
    { id: 1, level: 1, title: '나를 바꾸는 작은 습관',
      summary: '거창한 목표보다 매일 반복하는 작은 행동이 인생을 바꾼다. 이 장에서는 습관의 힘과 시작하는 법을 이야기한다.',
      intro: '"우리는 반복적으로 하는 행동이 곧 우리 자신이다. 그러므로 탁월함은 행위가 아니라 습관이다." — 아리스토텔레스\n\n하루 1%의 변화가 1년이면 37배가 된다. 대단한 의지력이 아니라, 아주 작은 시작이 인생을 뒤바꾼다.',
      body: '아침에 눈을 뜨고 가장 먼저 하는 일이 뭔가요? 대부분 스마트폰을 집어 듭니다. 그 5분을 스트레칭으로 바꿔보세요. 처음엔 어색하지만, 2주만 지나면 몸이 먼저 기억합니다.\n\n습관은 뇌의 기저핵에 저장됩니다. 의식적 노력 없이 자동으로 실행되는 행동 패턴이죠. 나쁜 습관도, 좋은 습관도 같은 메커니즘으로 작동합니다. 차이는 단 하나 — 어떤 트리거를 설계하느냐입니다.' },
    { id: 2, level: 2, title: '2분 규칙',
      summary: '새로운 습관은 2분 안에 끝나는 크기로 시작하라.',
      intro: '제임스 클리어는 《아주 작은 습관의 힘》에서 말합니다. "새로운 습관은 2분 이내로 끝나야 한다."',
      body: '독서 습관을 들이고 싶다면 "매일 30분 읽기"가 아니라 "책을 펴서 한 문단 읽기"로 시작하세요. 운동을 시작하고 싶다면 "운동복을 입고 현관 앞에 서기"부터입니다.\n\n핵심은 완벽한 실행이 아니라 출석입니다. 2분짜리 행동이 쌓이면, 어느 날 문득 30분을 하고 있는 자신을 발견하게 됩니다.' },
    { id: 3, level: 3, title: '환경 설계',
      summary: '의지력에 기대지 말고, 환경을 바꿔라.',
      intro: '',
      body: '냉장고 앞에 과일을 놓으면 과일을 먹게 되고, 과자를 놓으면 과자를 먹게 됩니다. 의지력의 문제가 아니라 환경의 문제입니다.\n\n책을 읽고 싶으면 베개 옆에 책을 두세요. 기타를 치고 싶으면 기타를 거실 한가운데 세워두세요. 좋은 행동을 쉽게, 나쁜 행동을 어렵게 만드는 것 — 이것이 환경 설계입니다.' },
    { id: 4, level: 3, title: '습관 추적',
      summary: '기록하면 보이고, 보이면 바뀐다.',
      intro: '',
      body: '달력에 X를 하나씩 그어보세요. 사흘 연속 X가 이어지면 "이 체인을 끊고 싶지 않다"는 마음이 생깁니다. 제리 사인펠드가 매일 코미디를 쓰기 위해 사용한 방법이기도 합니다.\n\n완벽하지 않아도 됩니다. 빈칸이 생겨도 괜찮습니다. 중요한 건 "2일 연속 빠지지 않기" 규칙입니다.' },
    { id: 5, level: 1, title: '관계의 기술',
      summary: '인생에서 가장 중요한 투자는 사람이다. 좋은 관계를 만들고 유지하는 원칙을 다룬다.',
      intro: '"인생의 질은 관계의 질이다." 하버드대학교의 75년간의 행복 연구가 내린 단 하나의 결론입니다.',
      body: '돈, 명예, 건강 — 모두 중요하지만, 행복의 가장 강력한 예측 변수는 "따뜻한 인간관계"였습니다. 외로운 백만장자보다 친한 친구 셋이 있는 사람이 더 오래, 더 건강하게 살았습니다.' },
    { id: 6, level: 2, title: '경청의 힘',
      summary: '듣는 것만으로 관계가 달라진다.',
      intro: '',
      body: '대부분의 대화에서 우리는 상대의 말이 끝나기도 전에 "다음에 뭘 말할까"를 생각합니다. 진짜 경청은 상대의 말을 온전히 받아들이는 것입니다.\n\n"그래서 네 기분이 어땠어?" 이 한마디가 관계를 바꿉니다. 조언하려 하지 말고, 먼저 공감하세요.' },
    { id: 7, level: 2, title: '거절하는 용기',
      summary: '모든 관계를 유지할 필요는 없다.',
      intro: '',
      body: '"No"라고 말할 수 있어야 진정한 "Yes"의 가치가 생깁니다. 에너지를 빼앗는 관계에서 벗어나야 소중한 관계에 집중할 수 있습니다.\n\n거절은 이기적인 것이 아닙니다. 자신의 시간과 에너지를 정말 중요한 곳에 쓰겠다는 선택입니다.' },
    { id: 8, level: 1, title: '실패를 대하는 자세',
      summary: '실패는 끝이 아니라 데이터다. 넘어진 횟수가 아니라 일어선 횟수가 인생을 결정한다.',
      intro: '"나는 실패한 적이 없다. 단지 잘 되지 않는 방법 1만 가지를 발견했을 뿐이다." — 토머스 에디슨',
      body: '스티브 잡스는 자신이 세운 회사에서 쫓겨났습니다. J.K. 롤링은 12번 출판을 거절당했습니다. 월트 디즈니는 "상상력이 부족하다"는 이유로 해고당했습니다.\n\n그들의 공통점은 재능이 아니라 회복력이었습니다. 실패 앞에서 "이게 나에게 무엇을 가르쳐주는가?"라고 물을 수 있는 사람이 결국 이깁니다.' },
    { id: 9, level: 2, title: '작은 실패 연습',
      summary: '큰 실패가 두려우면 작은 실패부터 연습하라.',
      intro: '',
      body: '모르는 사람에게 말 걸어보기, 새로운 레시피 시도하기, 서투른 외국어로 주문하기. 이런 작은 실패들이 쌓이면 "실패해도 괜찮다"는 경험치가 됩니다.\n\n실패 근육도 훈련이 필요합니다.' }
  ];
}

function _new(level) {
  return { id: Date.now() + Math.random(), level: level || 1, title: '', summary: '', intro: '', body: '' };
}

// ─── 사이드바 트리 ──────────────────────────────────────
function renderTree() {
  var tree = ROOT.querySelector('.ms-tree');
  if (!tree) return;
  var nums = _calcNumbers();
  tree.innerHTML = sections.map(function(s, i) {
    var lv = s.level || 1;
    var label = s.title || '(제목 없음)';
    var isActive = i === activeIdx ? ' active' : '';
    var indent = LEVEL_INDENT[lv] || 0;
    return '<div class="ms-tree-item' + isActive + '" data-idx="' + i + '" style="--indent:' + indent + 'px" onclick="msSelectSection(' + i + ')">' +
      '<span class="ms-level" style="font-size:' + (lv === 1 ? '10px' : '8px') + ';">' + nums[i] + '</span>' +
      '<span class="ms-tree-title">' + escHtml(label) + '</span>' +
      '<span class="ms-tree-del" onclick="event.stopPropagation();msDeleteSection(' + i + ')">&#10005;</span>' +
    '</div>';
  }).join('');
}

// ─── 스타일 선택 ────────────────────────────────────────
window.msSetStyle = function(key) {
  if (!STYLES[key]) return;
  currentStyle = key;
  try { localStorage.setItem(STYLE_KEY, key); } catch(e) {}
  render();
};

// ─── 에디터 렌더링 ──────────────────────────────────────
function renderEditor() {
  var editor = ROOT.querySelector('.ms-editor');
  if (!editor) return;
  if (!sections.length) {
    editor.innerHTML = '<div class="ms-empty"><div class="ms-empty-icon">📝</div><div class="ms-empty-text">새 섹션을 추가하세요</div></div>';
    return;
  }
  var s = sections[activeIdx] || sections[0];
  var lv = s.level || 1;
  var totalWords = (s.title + s.summary + s.intro + s.body).replace(/\s/g, '').length;
  var levelName = LEVEL_NAMES[lv] || '';

  var st = STYLES[currentStyle] || STYLES.classic;
  var css = st.css;
  var hSizes = [0, 22, 16, 13, 12, 11];
  var hColors = [null, css.h1, css.h2, css.h3, css.h4, css.h5];
  var titleSize = hSizes[lv] || 18;
  var titleColor = hColors[lv] || css.h1;

  editor.innerHTML =
    '<div class="ms-editor-header">' +
      '<div class="ms-editor-title">' + levelName + ' · ' + (s.title || '제목 없음') + '</div>' +
      '<div class="ms-editor-actions">' +
        '<button class="ms-btn" onclick="msMoveSection(-1)" title="위로 이동">↑</button>' +
        '<button class="ms-btn" onclick="msMoveSection(1)" title="아래로 이동">↓</button>' +
        '<button class="ms-btn" onclick="msLevelUp()">◀ 승격</button>' +
        '<button class="ms-btn" onclick="msLevelDown()">▶ 강등</button>' +
        '<button class="ms-btn ms-btn-primary" onclick="msDownloadDocx()">📥 .docx</button>' +
      '</div>' +
    '</div>' +
    // 스타일 선택 바
    '<div class="ms-style-bar">' +
      Object.keys(STYLES).map(function(key) {
        var sty = STYLES[key];
        var active = key === currentStyle ? ' active' : '';
        return '<button class="ms-style-chip' + active + '" onclick="msSetStyle(\'' + key + '\')" style="--chip-color:' + sty.css.h1 + ';">' +
          '<span class="ms-style-dot" style="background:' + sty.css.h1 + ';"></span>' + sty.name +
        '</button>';
      }).join('') +
    '</div>' +
    // 1단: 제목 (스타일 반영)
    '<div class="ms-section" style="background:' + css.bg + ';">' +
      '<div class="ms-section-header"><span class="ms-section-label" style="color:' + css.accent + ';">1단 · 제목</span></div>' +
      '<div class="ms-section-body"><input class="ms-input-title" style="font-size:' + titleSize + 'px;color:' + titleColor + ';" placeholder="제목을 입력하세요" value="' + escHtml(s.title) + '" oninput="msUpdate(\'title\',this.value)"></div></div>' +
    // 2단: 내용 요약 (스타일 반영)
    '<div class="ms-section" style="background:' + css.bg + ';">' +
      '<div class="ms-section-header"><span class="ms-section-label" style="color:' + css.accent + ';">2단 · 내용 요약</span></div>' +
      '<div class="ms-section-body"><textarea class="ms-textarea" style="font-style:italic;color:#777;" placeholder="이 섹션의 핵심 내용을 2~3줄로 요약" oninput="msUpdate(\'summary\',this.value)">' + escHtml(s.summary) + '</textarea></div></div>' +
    // 3단: 도입
    '<div class="ms-section" style="background:' + css.bg + ';">' +
      '<div class="ms-section-header"><span class="ms-section-label" style="color:' + css.accent + ';">3단 · 도입</span></div>' +
      '<div class="ms-section-body"><textarea class="ms-textarea" style="font-weight:600;" placeholder="독자의 관심을 끄는 도입부" oninput="msUpdate(\'intro\',this.value)">' + escHtml(s.intro) + '</textarea></div></div>' +
    // 4단: 본문
    '<div class="ms-section" style="background:' + css.bg + ';">' +
      '<div class="ms-section-header"><span class="ms-section-label" style="color:' + css.accent + ';">4단 · 본문</span></div>' +
      '<div class="ms-section-body"><textarea class="ms-textarea ms-textarea-body" placeholder="본문 내용을 작성하세요" oninput="msUpdate(\'body\',this.value)">' + escHtml(s.body) + '</textarea></div>' +
      '<div class="ms-wordcount">' + totalWords.toLocaleString() + ' 자</div></div>';
}

function render() { renderTree(); renderEditor(); }

// ─── 공개 API ──────────────────────────────────────────
window.msSelectSection = function(idx) {
  _saveCurrentFields();
  activeIdx = Math.max(0, Math.min(idx, sections.length - 1));
  render();
};

// 같은 레벨 섹션 추가 (현재 섹션 뒤에)
window.msAddSection = function() {
  _saveCurrentFields();
  var curLevel = sections[activeIdx] ? sections[activeIdx].level : 1;
  sections.splice(activeIdx + 1, 0, _new(curLevel));
  activeIdx = activeIdx + 1;
  save(); render();
};

// 초기화 — 샘플 원고로 리셋
window.msReset = function() {
  if (!confirm('모든 원고를 삭제하고 샘플 원고로 초기화합니다.\n계속하시겠습니까?')) return;
  sections = _defaultSections();
  activeIdx = 0;
  save();
  render();
  _updateTotalWords();
};

// 하위 섹션 추가 (현재 섹션 바로 아래, level +1)
window.msAddSubSection = function() {
  _saveCurrentFields();
  var curLevel = sections[activeIdx] ? sections[activeIdx].level : 1;
  var childLevel = Math.min(curLevel + 1, 5);
  sections.splice(activeIdx + 1, 0, _new(childLevel));
  activeIdx = activeIdx + 1;
  save(); render();
};

window.msDeleteSection = function(idx) {
  if (sections.length <= 1) { alert('최소 1개 섹션이 필요합니다.'); return; }
  if (!confirm((sections[idx].title || '섹션') + '을 삭제하시겠습니까?')) return;
  sections.splice(idx, 1);
  if (activeIdx >= sections.length) activeIdx = sections.length - 1;
  save(); render();
};

window.msMoveSection = function(dir) {
  var newIdx = activeIdx + dir;
  if (newIdx < 0 || newIdx >= sections.length) return;
  _saveCurrentFields();
  var tmp = sections[activeIdx];
  sections[activeIdx] = sections[newIdx];
  sections[newIdx] = tmp;
  activeIdx = newIdx;
  save(); render();
};

// 레벨 승격/강등
window.msLevelUp = function() {
  if (!sections[activeIdx]) return;
  if (sections[activeIdx].level <= 1) return;
  sections[activeIdx].level--;
  save(); render();
};
window.msLevelDown = function() {
  if (!sections[activeIdx]) return;
  if (sections[activeIdx].level >= 5) return;
  sections[activeIdx].level++;
  save(); render();
};

window.msUpdate = function(field, value) {
  if (sections[activeIdx]) {
    sections[activeIdx][field] = value;
    save();
    if (field === 'title') renderTree();
  }
};

function _saveCurrentFields() {
  var editor = ROOT.querySelector('.ms-editor');
  if (!editor || !sections[activeIdx]) return;
  var titleEl = editor.querySelector('.ms-input-title');
  var textareas = editor.querySelectorAll('.ms-textarea');
  if (titleEl) sections[activeIdx].title = titleEl.value;
  if (textareas[0]) sections[activeIdx].summary = textareas[0].value;
  if (textareas[1]) sections[activeIdx].intro = textareas[1].value;
  if (textareas[2]) sections[activeIdx].body = textareas[2].value;
  save();
}

// ─── 섹션별 번호 계산 ──────────────────────────────────
function _calcNumbers() {
  var counters = [0, 0, 0, 0, 0, 0];
  return sections.map(function(s) {
    var lv = s.level || 1;
    counters[lv]++;
    for (var r = lv + 1; r <= 5; r++) counters[r] = 0;
    // 중간 레벨 건너뛴 경우 최소 1로 보정 (예: level 1 바로 아래 level 3)
    for (var p = 1; p < lv; p++) { if (counters[p] === 0) counters[p] = 1; }
    var num = '';
    if (lv === 1) num = counters[1] + '장';
    else if (lv === 2) num = counters[1] + '.' + counters[2];
    else if (lv === 3) num = counters[1] + '.' + counters[2] + '.' + counters[3];
    else if (lv === 4) num = counters[1] + '.' + counters[2] + '.' + counters[3] + '.' + counters[4];
    else num = counters[1] + '.' + counters[2] + '.' + counters[3] + '.' + counters[4] + '.' + counters[5];
    return num;
  });
}

// ─── DOCX 다운로드 ─────────────────────────────────────
window.msDownloadDocx = function() {
  _saveCurrentFields();
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리가 필요합니다.'); return; }
  var zip = new JSZip();

  // [Content_Types].xml — styles.xml 포함
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>');

  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');

  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>');

  // word/styles.xml — 선택된 스타일 프리셋으로 동적 생성
  var st = STYLES[currentStyle] || STYLES.classic;
  var spacings = [null, '480,240', '360,180', '240,120', '200,100', '160,80'];
  function _hStyle(n, h) {
    var sp = spacings[n].split(',');
    return '<w:style w:type="paragraph" w:styleId="Heading' + n + '">' +
      '<w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
      '<w:pPr><w:keepNext/><w:spacing w:before="' + sp[0] + '" w:after="' + sp[1] + '"/><w:outlineLvl w:val="' + (n-1) + '"/></w:pPr>' +
      '<w:rPr>' + (h.bold ? '<w:b/>' : '') + (h.italic ? '<w:i/>' : '') +
      '<w:sz w:val="' + h.size + '"/><w:szCs w:val="' + h.size + '"/><w:color w:val="' + h.color + '"/></w:rPr></w:style>';
  }
  zip.file('word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
        '<w:rPr><w:rFonts w:ascii="' + st.body.font + '" w:eastAsia="' + st.body.font + '" w:hAnsi="' + st.body.font + '"/>' +
        '<w:sz w:val="' + st.body.size + '"/><w:szCs w:val="' + st.body.size + '"/><w:color w:val="' + st.body.color + '"/></w:rPr>' +
        '<w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:style>' +
      _hStyle(1, st.h1) + _hStyle(2, st.h2) + _hStyle(3, st.h3) + _hStyle(4, st.h4) + _hStyle(5, st.h5) +
      '<w:style w:type="paragraph" w:styleId="Summary"><w:name w:val="Summary"/><w:basedOn w:val="Normal"/>' +
        '<w:pPr><w:spacing w:after="80"/><w:ind w:left="240"/></w:pPr>' +
        '<w:rPr><w:i/><w:sz w:val="' + st.summary.size + '"/><w:szCs w:val="' + st.summary.size + '"/><w:color w:val="' + st.summary.color + '"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="SectionLabel"><w:name w:val="SectionLabel"/><w:basedOn w:val="Normal"/>' +
        '<w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr>' +
        '<w:rPr><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="' + st.label.color + '"/></w:rPr></w:style>' +
    '</w:styles>');

  // word/document.xml — 라벨 + 번호 포함 제목 + 스타일 적용
  var nums = _calcNumbers();
  var lvName = ['', '장', '절', '중절', '소절', '소소절'];
  var body = '';
  sections.forEach(function(s, i) {
    var lv = Math.min(s.level || 1, 5);
    var headingStyle = 'Heading' + lv;
    var numPrefix = nums[i];
    var sectionName = numPrefix; // "1장", "1.1", "1.1.1" 등

    // [1장] 라벨 + 제목 (Heading 스타일)
    body += '<w:p><w:pPr><w:pStyle w:val="' + headingStyle + '"/></w:pPr>' +
      '<w:r><w:t xml:space="preserve">' + _xmlEsc(numPrefix + ' ' + (s.title || '')) + '</w:t></w:r></w:p>';

    // [내용 요약] 라벨 + 내용 (Summary 스타일)
    if (s.summary) {
      body += '<w:p><w:pPr><w:pStyle w:val="SectionLabel"/></w:pPr>' +
        '<w:r><w:t>[' + _xmlEsc(sectionName) + ' 내용 요약]</w:t></w:r></w:p>';
      s.summary.split('\n').forEach(function(line) {
        body += '<w:p><w:pPr><w:pStyle w:val="Summary"/></w:pPr>' +
          '<w:r><w:t xml:space="preserve">' + _xmlEsc(line) + '</w:t></w:r></w:p>';
      });
    }
    // [도입] 라벨 + 내용
    if (s.intro) {
      body += '<w:p><w:pPr><w:pStyle w:val="SectionLabel"/></w:pPr>' +
        '<w:r><w:t>[' + _xmlEsc(sectionName) + ' 도입]</w:t></w:r></w:p>';
      s.intro.split('\n').forEach(function(line) {
        body += '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + _xmlEsc(line) + '</w:t></w:r></w:p>';
      });
    }
    // [본문] 라벨 + 내용
    if (s.body) {
      body += '<w:p><w:pPr><w:pStyle w:val="SectionLabel"/></w:pPr>' +
        '<w:r><w:t>[' + _xmlEsc(sectionName) + ' 본문]</w:t></w:r></w:p>';
      s.body.split('\n').forEach(function(line) {
        body += '<w:p><w:r><w:t xml:space="preserve">' + _xmlEsc(line) + '</w:t></w:r></w:p>';
      });
    }
  });

  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>');

  zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    .then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = ((sections[0] && sections[0].title) || '원고').replace(/[^\w가-힣]/g, '_').slice(0, 30) + '.docx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
};

function _xmlEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── 초기화 ────────────────────────────────────────────
var _p12init = false;
function initPanel12() {
  // 매 활성화 시 데이터 리로드 (목차 적용 등 외부 변경 감지)
  load();
  loadStyle();
  if (!_p12init) {
    _p12init = true;
    ROOT.innerHTML =
      '<div class="ms-layout">' +
        '<aside class="ms-sidebar">' +
          '<div class="ms-sidebar-header">' +
            '<div class="ms-sidebar-title">원고 목차</div>' +
            '<div class="ms-sidebar-btns">' +
              '<button class="ms-sb-btn" onclick="msAddSection()">+ 섹션</button>' +
              '<button class="ms-sb-btn" onclick="msAddSubSection()">+ 하위</button>' +
              '<button class="ms-sb-btn" onclick="msReset()" style="color:#c23d2f;">초기화</button>' +
            '</div>' +
          '</div>' +
          '<div class="ms-tree"></div>' +
          '<div class="ms-footer"><span id="ms-total-words">0 자</span><span id="ms-a4-pages">A4 0매</span><span id="ms-section-count">' + sections.length + '개 섹션</span></div>' +
        '</aside>' +
        '<div class="ms-editor"></div>' +
      '</div>';
  }
  render();
  _updateTotalWords();
}

function _updateTotalWords() {
  var totalNoSpace = 0;
  // A4 줄 수 기반 계산 (서식 반영)
  // A4 1매 ≈ 35줄 (11pt, 줄간 160%, 기본 여백)
  var totalLines = 0;
  sections.forEach(function(sec) {
    var all = sec.title + '\n' + sec.summary + '\n' + sec.intro + '\n' + sec.body;
    totalNoSpace += all.replace(/\s/g, '').length;
    // 제목: 레벨에 따라 위/아래 여백이 다름 (Heading 스타일의 spacing)
    var lv = sec.level || 1;
    if (lv === 1) totalLines += 4;      // Heading1: 큰 폰트 + 위아래 여백 ≈ 4줄
    else if (lv === 2) totalLines += 3;  // Heading2 ≈ 3줄
    else if (lv === 3) totalLines += 2.5;
    else totalLines += 2;
    // 라벨 ([1장 내용 요약] 등) — 각 비어있지 않은 영역마다 1줄
    if (sec.summary) { totalLines += 1; totalLines += _countLines(sec.summary); }
    if (sec.intro) { totalLines += 1 + 1; totalLines += _countLines(sec.intro); } // 라벨 + 빈줄
    if (sec.body) { totalLines += 1 + 1; totalLines += _countLines(sec.body); }
  });
  var a4Pages = totalLines / 35;
  var a4Label = a4Pages < 0.5 ? (totalLines > 0 ? '1매 미만' : '0매') : Math.ceil(a4Pages * 10) / 10 + '매';

  var el = ROOT.querySelector('#ms-total-words');
  if (el) el.textContent = totalNoSpace.toLocaleString() + ' 자';
  var a4El = ROOT.querySelector('#ms-a4-pages');
  if (a4El) a4El.textContent = 'A4 약 ' + a4Label;
  var fc = ROOT.querySelector('#ms-section-count');
  if (fc) fc.textContent = sections.length + '개 섹션';
}

function _countLines(text) {
  if (!text) return 0;
  var lines = 0;
  // A4 기준 한 줄 ≈ 40자 (11pt 맑은고딕, 기본 여백)
  text.split('\n').forEach(function(paragraph) {
    lines += Math.max(1, Math.ceil(paragraph.length / 40));
  });
  return lines;
}

setInterval(function() {
  if (!ROOT.classList.contains('active')) return;
  _saveCurrentFields(); _updateTotalWords();
}, 5000);

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(12, { onActivate: initPanel12 });
}
window._initPanel12 = initPanel12;
})();
