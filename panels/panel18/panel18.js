(function(){
'use strict';

// ──────────────────────────────────────────────
// panel18 — 신간 안내 작성
// ──────────────────────────────────────────────

var ROOT = document.getElementById('panel18');
if (!ROOT) return;

var LS_KEY = 'p18_singan_v1';
var mode = 'manual'; // 'manual' | 'ai'
var aiFiles = [];     // [{name, text}] 업로드된 파일들

// ── 섹션 정의 ──
var SECTIONS = [
  { key: 'basic',    title: '1. 도서 정보',    icon: '📘' },
  { key: 'intro',    title: '2. 책 소개',      icon: '📖' },
  { key: 'author',   title: '3. 지은이 소개',  icon: '👤' },
  { key: 'review',   title: '4. 출판사 리뷰',  icon: '💬' },
  { key: 'toc',      title: '5. 목차',         icon: '📑' },
  { key: 'related',  title: '6. 관련 서적',    icon: '📚' },
  { key: 'recs',     title: '7. 추천사',       icon: '⭐' },
  { key: 'promo',    title: '8. 홍보 카피',    icon: '📣' }
];

// ── 필수 필드 정의 (추천사 제외) ──
var REQUIRED = {
  basic:  ['title','date','contact','authors','pubDate','isbn','price','pages','format','colors','spine','level','keywords','tags','categories','mainSubject','addSubject'],
  intro:  ['catchphrase','description'],
  author: ['authorInfo'],
  review: ['reviewIntro','reviewPoints','reviewTarget','reviewOutcome'],
  toc:    ['toc'],
  related:['relatedBooks']
};

// 필드→라벨 매핑
var FIELD_LABELS = {
  title:'제목', date:'일자', contact:'발신', authors:'저자', pubDate:'발행일',
  isbn:'ISBN', price:'정가', pages:'페이지수', series:'시리즈', format:'판형',
  colors:'도수', spine:'책등 사이즈', level:'난이도', keywords:'키워드',
  tags:'예스24 분류 태그', categories:'서가 위치', mainSubject:'메인주제어',
  addSubject:'추가주제어', catchphrase:'캐치프레이즈', description:'책 소개 본문',
  authorInfo:'지은이 소개', reviewIntro:'도입부', reviewPoints:'핵심 포인트',
  reviewTarget:'대상 독자', reviewOutcome:'기대 효과', toc:'목차',
  relatedBooks:'관련 서적'
};

// ── 기본값 ──
function _defaults() {
  return {
    title: '', subtitle: '', pubDate: '', price: '', pages: '', isbn: '',
    series: '', format: '46배변형판(183*235)', colors: '4도', spine: '',
    level: '초급', keywords: '', tags: '', authors: '', contact: '',
    date: new Date().toISOString().slice(0,10).replace(/-/g,'. '),
    mainSubject: '', addSubject: '', categories: '',
    catchphrase: '', description: '',
    authorInfo: '',
    reviewIntro: '', reviewPoints: '', reviewTarget: '', reviewOutcome: '',
    toc: '',
    relatedBooks: '',
    recommendations: [{ name: '', affiliation: '', text: '' }]
  };
}

var data = _defaults();

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) { console.warn('[panel18] save: localStorage 저장 실패', e); } }
function load() {
  try {
    var r = localStorage.getItem(LS_KEY);
    if (r) {
      var parsed = JSON.parse(r);
      data = Object.assign(_defaults(), parsed);
      if (!Array.isArray(data.recommendations) || !data.recommendations.length) {
        data.recommendations = [{ name: '', affiliation: '', text: '' }];
      }
    }
  } catch(e) { data = _defaults(); }
}

// ── 자동저장 ──
var _saveTimer = null;
function autoSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    _collectFields();
    save();
    _updateBadges();
  }, 2000);
}

function _collectFields() {
  var f = ROOT.querySelectorAll('[data-field]');
  f.forEach(function(el) {
    var key = el.getAttribute('data-field');
    data[key] = el.value || '';
  });
  var recs = ROOT.querySelectorAll('.p18-rec-item');
  data.recommendations = [];
  recs.forEach(function(item) {
    data.recommendations.push({
      name: (item.querySelector('[data-rec="name"]') || {}).value || '',
      affiliation: (item.querySelector('[data-rec="affiliation"]') || {}).value || '',
      text: (item.querySelector('[data-rec="text"]') || {}).value || ''
    });
  });
  if (!data.recommendations.length) data.recommendations = [{ name: '', affiliation: '', text: '' }];
}

// ── 필수값 검증 ──
function _getMissing() {
  var missing = {};
  Object.keys(REQUIRED).forEach(function(secKey) {
    var fields = REQUIRED[secKey];
    var m = [];
    fields.forEach(function(f) {
      if (!data[f] || !data[f].trim()) m.push(f);
    });
    if (m.length) missing[secKey] = m;
  });
  return missing;
}

function _getSectionStatus(secKey) {
  if (secKey === 'recs') {
    var hasAny = data.recommendations.some(function(r) { return r.text && r.text.trim(); });
    return hasAny ? 'done' : 'optional';
  }
  var fields = REQUIRED[secKey];
  if (!fields) return 'done';
  var filled = 0;
  fields.forEach(function(f) { if (data[f] && data[f].trim()) filled++; });
  if (filled === 0) return 'empty';
  if (filled === fields.length) return 'done';
  return 'partial';
}

// ── 배지 업데이트 ──
function _updateBadges() {
  SECTIONS.forEach(function(sec) {
    var badge = ROOT.querySelector('#p18-badge-' + sec.key);
    if (!badge) return;
    var st = _getSectionStatus(sec.key);
    badge.className = 'p18-badge p18-badge-' + st;
    if (sec.key === 'recs') {
      badge.textContent = st === 'done' ? '작성됨' : '선택';
    } else {
      var fields = REQUIRED[sec.key] || [];
      var filled = 0;
      fields.forEach(function(f) { if (data[f] && data[f].trim()) filled++; });
      badge.textContent = st === 'done' ? '완료' : st === 'empty' ? '미작성' : filled + '/' + fields.length;
    }
  });
  // 상단 진행률 바
  var bar = ROOT.querySelector('#p18-progress-fill');
  var txt = ROOT.querySelector('#p18-progress-text');
  if (bar && txt) {
    var total = 0, done = 0;
    Object.keys(REQUIRED).forEach(function(k) {
      REQUIRED[k].forEach(function(f) {
        total++;
        if (data[f] && data[f].trim()) done++;
      });
    });
    var pct = total ? Math.round(done / total * 100) : 0;
    bar.style.width = pct + '%';
    txt.textContent = done + '/' + total + ' 항목 (' + pct + '%)';
  }
}

// ── XML 이스케이프 ──
function _x(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── 필수 라벨 마크 ──
function _req(label) { return label + ' <span class="p18-req">*</span>'; }

// ── 렌더링 ──
function render() {
  var h = '<div class="p18-wrap">';

  // 헤더
  h += '<div class="p18-header">';
  h += '<h2>📢 신간 안내 작성</h2>';
  h += '<div class="p18-mode-tabs">';
  h += '<button class="p18-mode-tab' + (mode==='manual'?' active':'') + '" onclick="p18_setMode(\'manual\')">✍️ 직접 작성</button>';
  h += '<button class="p18-mode-tab' + (mode==='ai'?' active':'') + '" onclick="p18_setMode(\'ai\')">🤖 AI 작성</button>';
  h += '</div>';
  h += '</div>';

  // 진행률 바
  h += '<div class="p18-progress">';
  h += '<div class="p18-progress-bar"><div class="p18-progress-fill" id="p18-progress-fill"></div></div>';
  h += '<span class="p18-progress-text" id="p18-progress-text"></span>';
  h += '</div>';

  // 액션 바
  h += '<div class="p18-actions">';
  h += '<button class="p18-btn" onclick="p18_preview()">👁 미리보기</button>';
  h += '<button class="p18-btn p18-btn-primary" onclick="p18_downloadDocx()">📥 .docx 다운로드</button>';
  h += '<button class="p18-btn" onclick="p18_reset()">🗑 초기화</button>';
  h += '</div>';

  // AI 모드 상단
  if (mode === 'ai') {
    h += _renderAiSection();
  }

  // 폼 섹션들
  SECTIONS.forEach(function(sec) {
    h += _renderSection(sec);
  });

  h += '<div id="p18-preview-area"></div>';
  h += '</div>';

  ROOT.innerHTML = h;
  _fillFields();
  _updateBadges();
  ROOT.addEventListener('input', autoSave);
}

function _renderAiSection() {
  var h = '';
  // 업로드 영역 (항상 표시 — 여러 파일 추가 가능)
  h += '<div class="p18-ai-upload" onclick="document.getElementById(\'p18_fileInput\').click()">';
  h += '<span class="ico">📄</span>';
  h += '<div class="ttl">참고 파일 업로드</div>';
  h += '<div class="sub">원고, 기획서 등 참고 파일을 업로드하세요 (.docx, .txt, .pdf · 여러 파일 가능)</div>';
  h += '<input type="file" id="p18_fileInput" accept=".docx,.txt,.pdf" multiple style="display:none" onchange="p18_handleFiles(this)">';
  h += '</div>';

  // 업로드된 파일 목록
  if (aiFiles.length) {
    aiFiles.forEach(function(f, i) {
      h += '<div class="p18-ai-file-info">';
      h += '<span>📄</span>';
      h += '<span class="name">' + _x(f.name) + ' (' + Math.round(f.text.length/1024) + 'KB)</span>';
      h += '<span class="remove" onclick="p18_removeFile(' + i + ')">✕</span>';
      h += '</div>';
    });
  }

  var hasFiles = aiFiles.length > 0;
  h += '<div class="p18-ai-gen-bar">';
  h += '<div class="hint">' + (hasFiles ? aiFiles.length + '개 파일이 준비되었습니다. AI 생성을 시작하세요.' : '파일을 업로드하면 내용을 분석하여 각 섹션을 자동 작성합니다.') + '</div>';
  h += '<button class="p18-btn p18-btn-primary" id="p18-ai-gen-btn" onclick="p18_aiGenerate()" ' + (hasFiles && !_aiGenerating ?'':'disabled') + '>' + (_aiGenerating ? '⏳ 생성 중...' : '✨ AI 생성 시작') + '</button>';
  h += '</div>';
  h += '<div id="p18-ai-status"></div>';

  return h;
}

function _renderSection(sec) {
  var st = _getSectionStatus(sec.key);
  var h = '<div class="p18-section' + (st === 'done' ? ' p18-sec-done' : '') + '" id="p18-sec-' + sec.key + '">';
  h += '<div class="p18-section-hdr" onclick="p18_toggleSec(\'' + sec.key + '\')">';
  h += '<span>' + sec.icon + '</span> ' + sec.title;
  h += '<span class="p18-badge" id="p18-badge-' + sec.key + '"></span>';
  h += '<span class="chevron">▾</span>';
  h += '</div>';
  h += '<div class="p18-section-body">';

  switch (sec.key) {
    case 'basic': h += _renderBasic(); break;
    case 'intro': h += _renderIntro(); break;
    case 'author': h += _renderAuthor(); break;
    case 'review': h += _renderReview(); break;
    case 'toc': h += _renderToc(); break;
    case 'related': h += _renderRelated(); break;
    case 'recs': h += _renderRecs(); break;
    case 'promo': h += _renderPromo(); break;
  }

  h += '</div></div>';
  return h;
}

function _renderBasic() {
  var h = '';
  h += '<div class="p18-field"><label>' + _req('제목 (+ 부제)') + '</label><input data-field="title" placeholder="『n8n이 다 해줌:뉴스 요약부터 투자 리포트까지...』"></div>';
  h += '<div class="p18-field-row">';
  h += '<div class="p18-field"><label>' + _req('일자') + '</label><input data-field="date" placeholder="2026. 04. 25"></div>';
  h += '<div class="p18-field"><label>' + _req('발신') + '</label><input data-field="contact" placeholder="한빛앤㈜/영업마케팅부, 김형진 팀장"></div>';
  h += '</div>';
  h += '<div class="p18-field-row3">';
  h += '<div class="p18-field"><label>' + _req('저자') + '</label><input data-field="authors" placeholder="홍길동, 김철수"></div>';
  h += '<div class="p18-field"><label>' + _req('발행일') + '</label><input data-field="pubDate" placeholder="2026년 04월 25일"></div>';
  h += '<div class="p18-field"><label>' + _req('ISBN') + '</label><input data-field="isbn" placeholder="979-11-7579-043-8 93000"></div>';
  h += '</div>';
  h += '<div class="p18-field-row3">';
  h += '<div class="p18-field"><label>' + _req('정가') + '</label><input data-field="price" placeholder="28,000원"></div>';
  h += '<div class="p18-field"><label>' + _req('페이지수') + '</label><input data-field="pages" placeholder="364쪽"></div>';
  h += '<div class="p18-field"><label>시리즈</label><input data-field="series" placeholder="다 해줌"></div>';
  h += '</div>';
  h += '<div class="p18-field-row3">';
  h += '<div class="p18-field"><label>' + _req('판형') + '</label><input data-field="format" placeholder="46배변형판(183*235)"></div>';
  h += '<div class="p18-field"><label>' + _req('도수') + '</label><input data-field="colors" placeholder="4도"></div>';
  h += '<div class="p18-field"><label>' + _req('책등 사이즈') + '</label><input data-field="spine" placeholder="14.4mm"></div>';
  h += '</div>';
  h += '<div class="p18-field-row">';
  h += '<div class="p18-field"><label>' + _req('난이도') + '</label><select data-field="level"><option value="초급">초급</option><option value="중급">중급</option><option value="고급">고급</option><option value="입문">입문</option></select></div>';
  h += '<div class="p18-field"><label>' + _req('키워드') + '</label><input data-field="keywords" placeholder="n8n, 업무 자동화, 노코드, AI 자동화"></div>';
  h += '</div>';
  h += '<div class="p18-field"><label>' + _req('예스24 분류 태그') + '</label><input data-field="tags" placeholder="#인공지능 #프로그래밍 #머신러닝"></div>';
  h += '<div class="p18-field-row">';
  h += '<div class="p18-field"><label>' + _req('메인주제어') + '</label><input data-field="mainSubject" placeholder="[UYQ] 인공지능"></div>';
  h += '<div class="p18-field"><label>' + _req('추가주제어') + '</label><input data-field="addSubject" placeholder="[UMS] 모바일..."></div>';
  h += '</div>';
  h += '<div class="p18-field"><label>' + _req('서가 위치 (서점별 카테고리)') + ' <button class="p18-auto-cat-btn" onclick="p18_autoCategories()" id="p18-auto-cat-btn">🏪 자동 생성</button></label><textarea data-field="categories" rows="10" placeholder="▶교보문고\n국내도서 > 컴퓨터/IT > ...\n\n▶예스24\n국내도서 > IT 모바일 > ..."></textarea></div>';
  return h;
}

function _renderIntro() {
  var h = '';
  h += '<div class="p18-field"><label>' + _req('캐치프레이즈 (★ / ☆ 문구)') + '</label><textarea data-field="catchphrase" rows="4" placeholder="★ 공식 n8n 글로벌 앰배서더의 검증된 노하우\n☆ 저자 직강 유튜브 강의, Q&A 채널 제공"></textarea></div>';
  h += '<div class="p18-field"><label>' + _req('책 소개 본문') + '</label><textarea data-field="description" rows="6" placeholder="단순히 AI 서비스와 대화하는 것만으로는 부족하다..."></textarea></div>';
  return h;
}

function _renderAuthor() {
  return '<div class="p18-field"><label>' + _req('지은이 소개') + '</label><textarea data-field="authorInfo" rows="8" placeholder="지은이 홍길동\n경력과 소개를 작성합니다.\n\n지은이 김철수\n경력과 소개를 작성합니다."></textarea></div>';
}

function _renderReview() {
  var h = '';
  h += '<div class="p18-field"><label>' + _req('도입부 (비전 메시지)') + '</label><textarea data-field="reviewIntro" rows="3" placeholder="비싼 유료 툴에 내 업무를 맞추지 마세요.\nn8n으로 당신의 업무에 딱 맞는 AI 팀을 무료로 고용하세요."></textarea></div>';
  h += '<div class="p18-field"><label>' + _req('핵심 포인트 (첫째/둘째/셋째...)') + '</label><textarea data-field="reviewPoints" rows="6" placeholder="★이 책의 핵심 포인트\n첫째, 3T 프레임워크로 배우는 자동화 사고법 | ...\n둘째, 실무 밀착형 프로젝트 완벽 수록 | ..."></textarea></div>';
  h += '<div class="p18-field"><label>' + _req('대상 독자 (이런 분들의 시간을 찾아드립니다)') + '</label><textarea data-field="reviewTarget" rows="4" placeholder="- 프로 \'복붙러\' 직장인: ...\n- 비용이 두려운 1인 창업가: ...\n- AI 시대를 준비하는 실무자: ..."></textarea></div>';
  h += '<div class="p18-field"><label>' + _req('기대 효과 (이 책을 읽고 나면)') + '</label><textarea data-field="reviewOutcome" rows="3" placeholder="생산성 UP! ...\n경쟁력 UP! ...\n정확성 UP! ..."></textarea></div>';
  return h;
}

function _renderToc() {
  return '<div class="p18-field"><label>' + _req('목차') + '</label><textarea data-field="toc" rows="15" placeholder="CHAPTER 01. 시작하기\n1.1 소개\n_1.1.1 세부 내용\n\nCHAPTER 02. 기본 활용\n..."></textarea></div>';
}

function _renderRelated() {
  return '<div class="p18-field"><label>' + _req('관련 서적 (제목 + ISBN)') + '</label><textarea data-field="relatedBooks" rows="3" placeholder="『관련 도서 제목』(출판사, 2025) 979-11-xxxx-xxx-x"></textarea></div>';
}

function _renderRecs() {
  var h = '<div class="p18-field-hint">추천사는 선택 사항입니다.</div>';
  h += '<div id="p18-rec-list">';
  data.recommendations.forEach(function(r, i) {
    h += '<div class="p18-rec-item">';
    h += '<button class="p18-rec-remove" onclick="p18_removeRec(' + i + ')">✕</button>';
    h += '<div class="p18-field-row">';
    h += '<div class="p18-field"><label>추천인 이름</label><input data-rec="name" value="' + _x(r.name) + '"></div>';
    h += '<div class="p18-field"><label>소속/직함</label><input data-rec="affiliation" value="' + _x(r.affiliation) + '"></div>';
    h += '</div>';
    h += '<div class="p18-field"><label>추천사 내용</label><textarea data-rec="text" rows="3">' + _x(r.text) + '</textarea></div>';
    h += '</div>';
  });
  h += '</div>';
  h += '<button class="p18-rec-add" onclick="p18_addRec()">+ 추천사 추가</button>';
  return h;
}

function _renderPromo() {
  var h = '<div class="p18-field-hint">신간 안내 데이터를 기반으로 홍보 카피를 AI가 자동 생성합니다.</div>';
  // 생성 버튼
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  h += '<button class="p18-btn p18-btn-primary" onclick="p18_genPromo(\'sns\')">📱 SNS 홍보문구</button>';
  h += '<button class="p18-btn p18-btn-primary" onclick="p18_genPromo(\'oneliner\')">💬 서점 한줄평</button>';
  h += '<button class="p18-btn p18-btn-primary" onclick="p18_genPromo(\'press\')">📰 보도자료 초안</button>';
  h += '<button class="p18-btn p18-btn-primary" onclick="p18_genPromo(\'email\')">✉️ 뉴스레터 문구</button>';
  h += '</div>';
  // 결과 영역
  h += '<div id="p18-promo-result">';
  if (data._promoResult) {
    h += '<div class="p18-promo-output"><pre style="white-space:pre-wrap;font-size:.82rem;line-height:1.6;margin:0;">' + _x(data._promoResult) + '</pre>';
    h += '<div style="display:flex;gap:6px;margin-top:8px;">';
    h += '<button class="p18-btn" onclick="p18_copyPromo()">📋 복사</button>';
    h += '<button class="p18-btn" onclick="p18_clearPromo()">지우기</button>';
    h += '</div></div>';
  } else {
    h += '<div style="text-align:center;padding:2rem;color:var(--muted,#888);font-size:.82rem;">위 버튼을 눌러 홍보 카피를 생성하세요.</div>';
  }
  h += '</div>';
  return h;
}

window.p18_genPromo = async function(type) {
  _collectFields();
  var title = data.title || '';
  if (!title) { alert('1. 도서 정보에서 도서명을 먼저 입력해주세요.'); return; }
  var apiKey = typeof loadApiKey === 'function' ? await loadApiKey() : '';
  if (!apiKey) { alert('통합현황 또는 개발자 콘솔에서 Claude API 키를 설정해주세요.'); return; }

  var bookContext = '[도서 정보]\n';
  bookContext += '제목: ' + title + '\n';
  if (data.subtitle) bookContext += '부제: ' + data.subtitle + '\n';
  if (data.authors) bookContext += '저자: ' + data.authors + '\n';
  if (data.contact) bookContext += '발신: ' + data.contact + '\n';
  if (data.description) bookContext += '책 소개: ' + data.description.substring(0, 300) + '\n';
  if (data.reviewIntro) bookContext += '출판사 리뷰: ' + data.reviewIntro.substring(0, 300) + '\n';
  if (data.reviewTarget) bookContext += '대상 독자: ' + data.reviewTarget + '\n';
  if (data.price) bookContext += '정가: ' + data.price + '\n';

  var prompts = {
    sns: '아래 도서에 대한 SNS 홍보 문구를 4종 생성하라.\n1. 트위터/X용 (140자 이내, 해시태그 3개)\n2. 인스타그램용 (3~4줄 + 해시태그 5개)\n3. 링크드인용 (전문가 톤, 5~6줄)\n4. 유튜브 커뮤니티용 (3~4줄, 친근한 톤)\n\n각 플랫폼별로 명확히 구분하여 작성.',
    oneliner: '아래 도서에 대한 서점 한줄평을 10개 생성하라.\n각 한줄평은 30~50자. 다양한 관점(실용성/재미/깊이/독자반응/전문성 등)에서 작성.\n번호를 붙여 출력.',
    press: '아래 도서에 대한 보도자료 초안을 작성하라.\n구성: 제목 / 부제 / 리드문(요약 3줄) / 본문(출간 배경, 주요 내용, 저자 소개, 도서 정보) / 미디어 문의처.\n전체 A4 1장 분량(800~1000자).',
    email: '아래 도서를 알리는 뉴스레터/이메일 문구를 작성하라.\n구성: 제목줄 / 인사말 / 도서 소개(3~4문장) / 이런 분에게 추천(3가지) / CTA(구매 링크 안내) / 마무리.\n전체 500~600자.'
  };

  var prompt = bookContext + '\n' + prompts[type] + '\n\n[글쓰기 원칙] AI투 문장 금지. 출판사 마케터가 실제로 쓰는 톤. 구체적이고 흥미로운 표현. 순수 텍스트만 출력.';

  var resultEl = ROOT.querySelector('#p18-promo-result');
  if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:2rem;"><div class="p18-spinner"></div><div style="margin-top:8px;font-size:.78rem;color:var(--accent);">홍보 카피 생성 중…</div></div>';

  try {
    var raw = await callClaudeApi({ apiKey: apiKey, model: 'claude-haiku-4-5-20251001', prompt: prompt, system: '출판사 마케팅 담당자. 한국어.', maxTokens: 2000, noPersona: true });
    var labels = { sns: 'SNS 홍보문구', oneliner: '서점 한줄평', press: '보도자료', email: '뉴스레터' };
    if (raw && raw.trim()) {
      data._promoResult = raw.trim();
      data._promoType = type;
      save();
      if (resultEl) {
        resultEl.innerHTML = '<div class="p18-promo-output"><div style="font-size:.72rem;color:var(--accent);font-weight:600;margin-bottom:6px;">' + (labels[type] || '') + '</div><pre style="white-space:pre-wrap;font-size:.82rem;line-height:1.6;margin:0;">' + _x(raw.trim()) + '</pre>' +
          '<div style="display:flex;gap:6px;margin-top:8px;"><button class="p18-btn" onclick="p18_copyPromo()">📋 복사</button><button class="p18-btn" onclick="p18_clearPromo()">지우기</button></div></div>';
      }
      showToast(labels[type] + ' 생성 완료', 'green');
    } else {
      if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:2rem;color:#e53e3e;font-size:.82rem;">응답이 비어 있습니다. 다시 시도해주세요.</div>';
      showToast('생성 실패: 빈 응답', 'red');
    }
  } catch (e) {
    console.error('[panel18] 홍보 카피 생성 실패:', e);
    if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:2rem;color:#e53e3e;font-size:.82rem;">생성 실패: ' + _x(e.message) + '</div>';
  }
};

window.p18_copyPromo = function() {
  var el = ROOT.querySelector('#p18-promo-result pre');
  if (!el) return;
  var text = el.textContent;
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('클립보드에 복사됨', 'green');
    }).catch(function() {
      _fallbackCopy(text);
    });
  } else {
    _fallbackCopy(text);
  }
};

function _fallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { showToast('클립보드에 복사됨', 'green'); }
    else { showToast('복사 실패 — 직접 선택해서 복사해주세요', 'red'); }
  } catch (e) {
    showToast('복사 실패 — 직접 선택해서 복사해주세요', 'red');
  }
}

window.p18_clearPromo = function() {
  delete data._promoResult;
  delete data._promoType;
  save(); render();
};

function _fillFields() {
  var fields = ROOT.querySelectorAll('[data-field]');
  fields.forEach(function(el) {
    var key = el.getAttribute('data-field');
    if (data[key] === undefined) return;
    var val = data[key];
    if (el.tagName === 'SELECT') {
      var opts = Array.from(el.options).map(function(o) { return o.value; });
      if (opts.indexOf(val) !== -1) {
        el.value = val;
      } else {
        // 근접 매핑: 입문/초급/중급/고급·심화 패턴
        var mapped = '초급'; // 기본값
        var v = String(val).toLowerCase();
        if (/입문/.test(v)) mapped = opts.find(function(o) { return /입문/.test(o); }) || mapped;
        else if (/초.*중|중.*초/.test(v)) mapped = opts.find(function(o) { return /초/.test(o); }) || mapped;
        else if (/중상|중·상/.test(v)) mapped = opts.find(function(o) { return /중/.test(o) && /상/.test(o); }) || opts.find(function(o) { return /중급/.test(o); }) || mapped;
        else if (/중급|중간/.test(v)) mapped = opts.find(function(o) { return /중급/.test(o); }) || mapped;
        else if (/고급|심화/.test(v)) mapped = opts.find(function(o) { return /고급|심화/.test(o); }) || mapped;
        else if (/초급/.test(v)) mapped = opts.find(function(o) { return /초급/.test(o); }) || mapped;
        // 정확히 매핑되는 옵션이 없으면 기본값 '초급' 사용
        if (opts.indexOf(mapped) === -1) mapped = opts[0] || '';
        console.warn('[panel18] _fillFields: SELECT "' + key + '" 값 "' + val + '" → 근접 매핑 "' + mapped + '"');
        el.value = mapped;
      }
    } else {
      el.value = val;
    }
  });
}

// ── 검증 후 미작성 섹션 열기 + 하이라이트 ──
function _validateAndFocus() {
  _collectFields();
  var missing = _getMissing();
  var keys = Object.keys(missing);
  if (!keys.length) return true;

  // 모든 미작성 필드 하이라이트
  ROOT.querySelectorAll('.p18-field-error').forEach(function(el) { el.classList.remove('p18-field-error'); });
  keys.forEach(function(secKey) {
    var sec = ROOT.querySelector('#p18-sec-' + secKey);
    if (sec) sec.classList.remove('collapsed');
    missing[secKey].forEach(function(f) {
      var el = ROOT.querySelector('[data-field="' + f + '"]');
      if (el) el.classList.add('p18-field-error');
    });
  });

  // 첫 번째 누락 필드로 스크롤
  var firstKey = keys[0];
  var firstField = missing[firstKey][0];
  var el = ROOT.querySelector('[data-field="' + firstField + '"]');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }

  // 누락 목록 메시지
  var labels = [];
  keys.forEach(function(k) {
    missing[k].forEach(function(f) { labels.push(FIELD_LABELS[f] || f); });
  });
  alert('다음 필수 항목이 비어 있습니다:\n\n' + labels.join(', '));
  return false;
}

// ── 외부 노출 함수 ──
window.p18_setMode = function(m) {
  _collectFields();
  save();
  mode = m;
  render();
};

window.p18_toggleSec = function(key) {
  var sec = ROOT.querySelector('#p18-sec-' + key);
  if (sec) sec.classList.toggle('collapsed');
};

window.p18_addRec = function() {
  _collectFields();
  data.recommendations.push({ name: '', affiliation: '', text: '' });
  save();
  render();
};

window.p18_removeRec = function(i) {
  _collectFields();
  data.recommendations.splice(i, 1);
  if (!data.recommendations.length) data.recommendations = [{ name: '', affiliation: '', text: '' }];
  save();
  render();
};

window.p18_reset = function() {
  if (!confirm('모든 내용을 초기화하시겠습니까?')) return;
  data = _defaults();
  aiFiles = [];
  save();
  render();
};

// ── 파일 업로드 처리 (여러 파일) ──
window.p18_handleFiles = function(input) {
  var files = Array.from(input.files);
  if (!files.length) return;
  var pending = files.length;
  files.forEach(function(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var fname = file.name;

    if (ext === 'txt') {
      var reader = new FileReader();
      reader.onload = function(e) { _addFile(fname, e.target.result); pending--; if (!pending) render(); };
      reader.readAsText(file, 'UTF-8');
    } else if (ext === 'docx') {
      // file:// 환경에서 mammoth는 내부 fetch로 보안 오류 발생 → JSZip 직접 파싱 사용
      var reader = new FileReader();
      reader.onload = function(e) {
        _parseDocxAndAdd(fname, e.target.result, function() { pending--; if (!pending) render(); });
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'pdf') {
      if (typeof pdfjsLib !== 'undefined') {
        var reader = new FileReader();
        reader.onload = function(e) {
          var arr = new Uint8Array(e.target.result);
          pdfjsLib.getDocument({ data: arr }).promise.then(function(pdf) {
            var texts = new Array(pdf.numPages).fill('');
            var done = 0;
            var total = pdf.numPages;
            function finishPage() {
              done++;
              if (done === total) { _addFile(fname, texts.join('\n\n')); pending--; if (!pending) render(); }
            }
            for (var p = 1; p <= total; p++) {
              (function(pn) {
                pdf.getPage(pn).then(function(page) {
                  page.getTextContent().then(function(tc) {
                    texts[pn-1] = tc.items.map(function(it) { return it.str; }).join(' ');
                    finishPage();
                  }).catch(function() {
                    texts[pn-1] = '';
                    finishPage();
                  });
                }).catch(function() {
                  texts[pn-1] = '';
                  finishPage();
                });
              })(p);
            }
          }).catch(function(err) {
            console.warn('[panel18] PDF 로드 실패:', fname, err);
            showToast('❌ PDF 읽기 실패: ' + fname, 'red');
            pending--; if (!pending) render();
          });
        };
        reader.onerror = function() {
          console.warn('[panel18] PDF FileReader 오류:', fname);
          showToast('❌ 파일 읽기 실패: ' + fname, 'red');
          pending--; if (!pending) render();
        };
        reader.readAsArrayBuffer(file);
      } else {
        if (typeof showToast === 'function') showToast('❌ 처리할 수 없는 파일: ' + fname + ' (지원: docx/txt/pdf) — PDF.js 라이브러리 없음', 'red');
        pending--;
        if (!pending) render();
      }
    } else {
      if (typeof showToast === 'function') showToast('❌ 처리할 수 없는 파일: ' + fname + ' (지원: docx/txt/pdf)', 'red');
      pending--;
      if (!pending) render();
    }
  });
  // input 초기화 (같은 파일 재업로드 가능하게)
  input.value = '';
};

function _addFile(name, text) {
  // 중복 파일명 방지
  var exists = aiFiles.some(function(f) { return f.name === name; });
  if (!exists) aiFiles.push({ name: name, text: text });
}

function _parseDocxAndAdd(fname, buffer, cb) {
  if (typeof JSZip === 'undefined') {
    if (typeof showToast === 'function') showToast('❌ 처리할 수 없는 파일: ' + fname + ' (지원: docx/txt/pdf)', 'red');
    if (cb) cb(); return;
  }
  JSZip.loadAsync(buffer).then(function(zip) {
    var docXml = zip.file('word/document.xml');
    if (!docXml) {
      if (typeof showToast === 'function') showToast('❌ 처리할 수 없는 파일: ' + fname + ' (지원: docx/txt/pdf)', 'red');
      if (cb) cb(); return;
    }
    docXml.async('string').then(function(xml) {
      // 1) 구조 태그를 공백 문자로 치환 (태그 제거 전에 수행)
      var text = xml
        .replace(/<w:tab[^>]*\/>/g, '\t')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<w:p[^>]*>/g, '\n')
        // 2) 나머지 태그 제거
        .replace(/<[^>]+>/g, '')
        // 3) HTML 엔티티 복원 (태그 제거 이후에 수행)
        // &amp; 는 반드시 맨 마지막 — 먼저 하면 &amp;lt; → &lt; → < 로 이중 디코딩됨
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(parseInt(n, 10)); })
        .replace(/&amp;/g, '&')
        // 4) 과도한 빈 줄 정리
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      _addFile(fname, text);
      if (cb) cb();
    }).catch(function() { if (cb) cb(); });
  }).catch(function() { if (cb) cb(); });
}

window.p18_removeFile = function(i) {
  aiFiles.splice(i, 1);
  render();
};

// ── JSON 수리 파서 (다단계) ──
function _safeParseJson(raw) {
  console.log('[p18] AI 원본 응답 길이:', raw.length, '앞 200자:', raw.slice(0, 200));

  // 1단계: 직접 파싱 시도
  try { return JSON.parse(raw); } catch(e) { console.warn('[panel18] _safeParseJson: 1단계 직접 파싱 실패', e); }

  // 2단계: 마크다운 코드블록 제거 후 시도
  var text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(text); } catch(e) { console.warn('[panel18] _safeParseJson: 2단계 마크다운 제거 후 파싱 실패', e); }

  // 3단계: 최외곽 { } 추출
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    console.error('[p18] JSON 브래킷 미발견');
    return null;
  }
  var json = text.slice(start, end + 1);
  try { return JSON.parse(json); } catch(e) {
    console.log('[p18] 3단계 실패:', e.message);
  }

  // 4단계: 문자열 값 안의 리터럴 줄바꿈/제어문자 이스케이프 (문자 단위 스캔)
  var fixed = _fixJsonStrings(json);
  try { return JSON.parse(fixed); } catch(e) {
    console.log('[p18] 4단계 실패:', e.message, '위치 근처:', fixed.slice(Math.max(0, (e.message.match(/position (\d+)/) || [])[1] - 50 || 0), ((e.message.match(/position (\d+)/) || [])[1] || 100) * 1 + 50));
  }

  // 5단계: 키별 개별 추출 (정규식 매칭)
  console.log('[p18] 5단계: 키별 개별 추출 시도');
  return _extractFieldsManually(raw);
}

// 문자 단위로 JSON 문자열 내 리터럴 줄바꿈/탭을 이스케이프
function _fixJsonStrings(json) {
  var out = [];
  var inStr = false;
  for (var i = 0; i < json.length; i++) {
    var ch = json[i];
    if (inStr) {
      if (ch === '\\') {
        // 이스케이프 시퀀스 — 다음 문자와 함께 그대로 통과
        out.push(ch);
        i++;
        if (i < json.length) out.push(json[i]);
        continue;
      }
      if (ch === '"') {
        inStr = false;
        out.push(ch);
        continue;
      }
      // 문자열 안의 리터럴 제어문자 → 이스케이프
      if (ch === '\n') { out.push('\\n'); continue; }
      if (ch === '\r') { out.push('\\r'); continue; }
      if (ch === '\t') { out.push('\\t'); continue; }
      var cc = ch.charCodeAt(0);
      if (cc < 0x20) { out.push('\\u' + ('0000' + cc.toString(16)).slice(-4)); continue; }
      out.push(ch);
    } else {
      if (ch === '"') inStr = true;
      out.push(ch);
    }
  }
  // trailing comma 제거
  return out.join('').replace(/,\s*([}\]])/g, '$1');
}

// 키별로 값 추출 (최후 수단)
function _extractFieldsManually(raw) {
  var keys = ['title','authors','keywords','tags','categories','catchphrase','description',
    'authorInfo','reviewIntro','reviewPoints','reviewTarget','reviewOutcome','toc',
    'relatedBooks','mainSubject','addSubject','pubDate','price','pages','isbn','format','colors','level'];
  var result = {};
  var found = 0;
  keys.forEach(function(key) {
    // "key": "value" 또는 "key": "value with \"escapes\""
    // 키 뒤의 값을 다음 키 시작 전까지 추출
    var pat = new RegExp('"' + key + '"\\s*:\\s*"');
    var m = pat.exec(raw);
    if (!m) return;
    var valStart = m.index + m[0].length;
    // 닫는 따옴표 찾기 (이스케이프 고려)
    var pos = valStart;
    while (pos < raw.length) {
      if (raw[pos] === '\\') { pos += 2; continue; }
      if (raw[pos] === '"') break;
      pos++;
    }
    if (pos < raw.length) {
      var val = raw.slice(valStart, pos);
      // 이스케이프된 문자 해석
      try {
        result[key] = JSON.parse('"' + val + '"');
      } catch(e2) {
        // 리터럴 줄바꿈 복원 시도
        val = val.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        try { result[key] = JSON.parse('"' + val + '"'); } catch(e3) {
          result[key] = val; // 있는 그대로 사용
        }
      }
      found++;
    }
  });
  console.log('[p18] 5단계 추출 결과:', found + '/' + keys.length, '필드');
  return found >= 5 ? result : null;
}

// ── 서가 위치 자동 생성 ──
var _catGenerating = false;

// 서점별 실제 카테고리 체계 (대분류 → 중분류 → 소분류 참조용)
var BOOKSTORE_TAXONOMIES = {
  '교보문고': [
    // 컴퓨터/IT
    '국내도서 > 컴퓨터/IT > 컴퓨터입문/활용 > 컴퓨터입문/활용',
    '국내도서 > 컴퓨터/IT > 컴퓨터공학 > 인공지능 > 인공지능일반',
    '국내도서 > 컴퓨터/IT > 컴퓨터공학 > 인공지능 > 머신러닝/딥러닝',
    '국내도서 > 컴퓨터/IT > 프로그래밍 언어 > 파이썬',
    '국내도서 > 컴퓨터/IT > 프로그래밍 언어 > 자바/JSP',
    '국내도서 > 컴퓨터/IT > 프로그래밍 언어 > C/C++',
    '국내도서 > 컴퓨터/IT > 프로그래밍 언어 > 자바스크립트/타입스크립트',
    '국내도서 > 컴퓨터/IT > 프로그래밍 언어 > 기타',
    '국내도서 > 컴퓨터/IT > 웹개발 > 프론트엔드',
    '국내도서 > 컴퓨터/IT > 웹개발 > 백엔드/서버',
    '국내도서 > 컴퓨터/IT > 앱프로그래밍 > 안드로이드',
    '국내도서 > 컴퓨터/IT > 앱프로그래밍 > iOS/Swift',
    '국내도서 > 컴퓨터/IT > 네트워크/보안 > 네트워크',
    '국내도서 > 컴퓨터/IT > 네트워크/보안 > 보안/해킹',
    '국내도서 > 컴퓨터/IT > 데이터베이스 > SQL/NoSQL',
    '국내도서 > 컴퓨터/IT > OS/데이터베이스 > 리눅스/유닉스',
    '국내도서 > 컴퓨터/IT > IT비즈니스 > IT트렌드/전망',
    '국내도서 > 컴퓨터/IT > IT비즈니스 > e비즈니스',
    '국내도서 > 컴퓨터/IT > IT자격증/수험서',
    '국내도서 > 컴퓨터/IT > 그래픽/멀티미디어 > 그래픽일반',
    '국내도서 > 컴퓨터/IT > 그래픽/멀티미디어 > 포토샵',
    '국내도서 > 컴퓨터/IT > 그래픽/멀티미디어 > 일러스트레이터',
    '국내도서 > 컴퓨터/IT > 그래픽/멀티미디어 > 영상편집',
    '국내도서 > 컴퓨터/IT > OA/오피스 > 엑셀',
    '국내도서 > 컴퓨터/IT > OA/오피스 > 파워포인트',
    '국내도서 > 컴퓨터/IT > OA/오피스 > 한글/워드',
    // 경제/경영
    '국내도서 > 경제/경영 > 경영전략 > 경영혁신',
    '국내도서 > 경제/경영 > 경영일반',
    '국내도서 > 경제/경영 > 마케팅/세일즈',
    '국내도서 > 경제/경영 > 트렌드/미래전망',
    '국내도서 > 경제/경영 > 재테크/투자 > 주식/펀드',
    '국내도서 > 경제/경영 > 재테크/투자 > 부동산',
    '국내도서 > 경제/경영 > 창업/스타트업',
    '국내도서 > 경제/경영 > 인사/조직관리',
    '국내도서 > 경제/경영 > 회계/세무',
    '국내도서 > 경제/경영 > 유통/물류',
    '국내도서 > 경제/경영 > CEO/리더십',
    // 자기계발
    '국내도서 > 자기계발 > 성공학/경력관리',
    '국내도서 > 자기계발 > 인간관계',
    '국내도서 > 자기계발 > 화술/협상',
    '국내도서 > 자기계발 > 시간관리/습관',
    // 인문
    '국내도서 > 인문 > 철학 일반',
    '국내도서 > 인문 > 심리학 > 심리학 일반',
    '국내도서 > 인문 > 심리학 > 긍정심리/행복',
    '국내도서 > 인문 > 교육학',
    '국내도서 > 인문 > 언어학',
    '국내도서 > 인문 > 인문교양',
    // 사회과학
    '국내도서 > 사회과학 > 사회학 일반',
    '국내도서 > 사회과학 > 정치/외교',
    '국내도서 > 사회과학 > 언론/미디어',
    '국내도서 > 사회과학 > 교육/학습',
    // 자연과학
    '국내도서 > 자연과학 > 과학 일반',
    '국내도서 > 자연과학 > 수학',
    '국내도서 > 자연과학 > 물리학',
    '국내도서 > 자연과학 > 생물학/생명과학',
    '국내도서 > 자연과학 > 뇌과학',
    '국내도서 > 자연과학 > 천문학/우주과학',
    // 건강/의학
    '국내도서 > 건강/의학 > 건강 일반',
    '국내도서 > 건강/의학 > 다이어트/운동',
    '국내도서 > 건강/의학 > 질병/건강관리',
    '국내도서 > 건강/의학 > 의학/약학',
    // 가정/생활
    '국내도서 > 가정/생활 > 요리/레시피',
    '국내도서 > 가정/생활 > 육아/자녀교육',
    '국내도서 > 가정/생활 > 인테리어/살림',
    '국내도서 > 가정/생활 > 취미/DIY',
    // 예술/디자인
    '국내도서 > 예술/대중문화 > 디자인/인테리어 > 디자인 일반',
    '국내도서 > 예술/대중문화 > 디자인/인테리어 > 그래픽디자인',
    '국내도서 > 예술/대중문화 > 사진/영상',
    '국내도서 > 예술/대중문화 > 미술 > 드로잉/스케치',
    '국내도서 > 예술/대중문화 > 음악',
    // 여행
    '국내도서 > 여행 > 국내여행',
    '국내도서 > 여행 > 해외여행',
    // 에세이/문학
    '국내도서 > 에세이 > 한국에세이',
    '국내도서 > 소설 > 한국소설',
    '국내도서 > 소설 > 외국소설',
    // 어린이/청소년
    '국내도서 > 어린이 > 학습/교육',
    '국내도서 > 어린이 > 과학/수학',
    '국내도서 > 청소년 > 청소년 교양',
    // 수험서/자격증
    '국내도서 > 수험서/자격증 > 공무원 수험서',
    '국내도서 > 수험서/자격증 > 취업/상식',
    // 외국어
    '국내도서 > 외국어 > 영어회화',
    '국내도서 > 외국어 > 일본어',
    '국내도서 > 외국어 > 중국어'
  ],
  '예스24': [
    // IT 모바일
    '국내도서 > IT 모바일 > 컴퓨터 입문/활용 > 어른을 위한 컴퓨터',
    '국내도서 > IT 모바일 > 컴퓨터 입문/활용 > 인터넷 입문서',
    '국내도서 > IT 모바일 > 컴퓨터 공학 > 인공지능',
    '국내도서 > IT 모바일 > 컴퓨터 공학 > 컴퓨터 교육',
    '국내도서 > IT 모바일 > 컴퓨터 공학 > 컴퓨터 공학 일반',
    '국내도서 > IT 모바일 > 프로그래밍 언어 > 파이썬',
    '국내도서 > IT 모바일 > 프로그래밍 언어 > 자바',
    '국내도서 > IT 모바일 > 프로그래밍 언어 > C/C++',
    '국내도서 > IT 모바일 > 프로그래밍 언어 > 자바스크립트',
    '국내도서 > IT 모바일 > 프로그래밍 언어 > 프로그래밍 언어 기타',
    '국내도서 > IT 모바일 > 웹사이트 > 웹프로그래밍',
    '국내도서 > IT 모바일 > 모바일 프로그래밍 > 안드로이드/iOS',
    '국내도서 > IT 모바일 > 네트워크/보안 > 네트워크 일반',
    '국내도서 > IT 모바일 > 네트워크/보안 > 보안/해킹',
    '국내도서 > IT 모바일 > 데이터베이스 > SQL',
    '국내도서 > IT 모바일 > OS/데이터베이스 > 리눅스/유닉스',
    '국내도서 > IT 모바일 > 인터넷 비즈니스 > 인터넷 마케팅',
    '국내도서 > IT 모바일 > 인터넷 비즈니스 > e-비즈니스',
    '국내도서 > IT 모바일 > 그래픽/디자인 > 포토샵',
    '국내도서 > IT 모바일 > 그래픽/디자인 > 일러스트레이터',
    '국내도서 > IT 모바일 > 그래픽/디자인 > 영상편집/모션그래픽',
    '국내도서 > IT 모바일 > OA/사무자동화 > 엑셀',
    '국내도서 > IT 모바일 > OA/사무자동화 > 파워포인트',
    // 경제 경영
    '국내도서 > 경제 경영 > 경제 > 각국 경제/경제사/전망 > 경제전망',
    '국내도서 > 경제 경영 > 경영 > 경영전략/경영혁신',
    '국내도서 > 경제 경영 > 경영관리/전략/경영학 > 경영관리/기업경영',
    '국내도서 > 경제 경영 > CEO/비즈니스맨 > 성공학/경력관리',
    '국내도서 > 경제 경영 > 마케팅/세일즈 > 마케팅/브랜드',
    '국내도서 > 경제 경영 > 마케팅/세일즈 > 트렌드/미래예측',
    '국내도서 > 경제 경영 > 인터넷비즈니스 > e-비즈니스',
    '국내도서 > 경제 경영 > 재테크/금융 > 주식/펀드',
    '국내도서 > 경제 경영 > 재테크/금융 > 부동산',
    '국내도서 > 경제 경영 > 창업/취업',
    '국내도서 > 경제 경영 > 회계/세무/재무',
    // 자기계발
    '국내도서 > 자기계발 > 성공/처세',
    '국내도서 > 자기계발 > 인간관계',
    '국내도서 > 자기계발 > 화술/협상/설득',
    '국내도서 > 자기계발 > 시간/습관관리',
    // 인문
    '국내도서 > 인문 > 철학 > 철학 일반',
    '국내도서 > 인문 > 심리학 > 심리학 일반',
    '국내도서 > 인문 > 심리학 > 긍정심리',
    '국내도서 > 인문 > 교육학',
    '국내도서 > 인문 > 인문교양',
    // 사회 정치
    '국내도서 > 사회 정치 > 사회학',
    '국내도서 > 사회 정치 > 정치/외교',
    '국내도서 > 사회 정치 > 언론/미디어',
    '국내도서 > 사회 정치 > 교육/학습',
    // 자연과학
    '국내도서 > 자연과학 > 과학 > 과학 일반',
    '국내도서 > 자연과학 > 수학',
    '국내도서 > 자연과학 > 물리학',
    '국내도서 > 자연과학 > 생물/생명과학',
    '국내도서 > 자연과학 > 뇌과학',
    // 건강
    '국내도서 > 건강 > 건강 일반',
    '국내도서 > 건강 > 다이어트/운동/스포츠',
    '국내도서 > 건강 > 질병/건강관리',
    // 가정/생활
    '국내도서 > 가정/생활 > 요리/레시피',
    '국내도서 > 가정/생활 > 육아/자녀교육',
    '국내도서 > 가정/생활 > 인테리어/살림',
    '국내도서 > 가정/생활 > 취미/원예/DIY',
    // 예술
    '국내도서 > 예술/대중문화 > 디자인/공예',
    '국내도서 > 예술/대중문화 > 사진',
    '국내도서 > 예술/대중문화 > 미술 > 드로잉/스케치',
    '국내도서 > 예술/대중문화 > 음악',
    // 여행
    '국내도서 > 여행 > 국내여행',
    '국내도서 > 여행 > 해외여행',
    // 에세이/문학
    '국내도서 > 에세이 > 한국에세이',
    '국내도서 > 소설/시/희곡 > 한국소설',
    '국내도서 > 소설/시/희곡 > 외국소설',
    // 어린이/청소년
    '국내도서 > 어린이 > 학습/교육',
    '국내도서 > 어린이 > 과학/수학',
    '국내도서 > 청소년 > 청소년 교양',
    // 수험서
    '국내도서 > 수험서/자격증 > IT자격증',
    '국내도서 > 수험서/자격증 > 취업/상식',
    // 외국어
    '국내도서 > 외국어 > 영어 > 영어회화',
    '국내도서 > 외국어 > 일본어',
    '국내도서 > 외국어 > 중국어'
  ],
  '알라딘': [
    // 컴퓨터/모바일
    '국내도서 > 컴퓨터/모바일 > PC/게임/디지털 카메라 > 초보자를 위한 컴퓨터 책',
    '국내도서 > 컴퓨터/모바일 > 인공지능',
    '국내도서 > 컴퓨터/모바일 > 프로그래밍 개발/방법론',
    '국내도서 > 컴퓨터/모바일 > 프로그래밍 언어 > 파이썬',
    '국내도서 > 컴퓨터/모바일 > 프로그래밍 언어 > 자바/JSP',
    '국내도서 > 컴퓨터/모바일 > 프로그래밍 언어 > C/C++',
    '국내도서 > 컴퓨터/모바일 > 프로그래밍 언어 > 자바스크립트',
    '국내도서 > 컴퓨터/모바일 > 웹사이트/홈페이지',
    '국내도서 > 컴퓨터/모바일 > 네트워크/보안',
    '국내도서 > 컴퓨터/모바일 > 데이터베이스/데이터분석',
    '국내도서 > 컴퓨터/모바일 > OS/데이터베이스 > 리눅스/유닉스',
    '국내도서 > 컴퓨터/모바일 > e비즈니스/창업 > 디지털 문화',
    '국내도서 > 컴퓨터/모바일 > e비즈니스/창업 > 인터넷비즈니스',
    '국내도서 > 컴퓨터/모바일 > 그래픽/멀티미디어 > 그래픽 일반',
    '국내도서 > 컴퓨터/모바일 > 그래픽/멀티미디어 > 포토샵',
    '국내도서 > 컴퓨터/모바일 > OA/사무자동화 > 엑셀',
    // 경제경영
    '국내도서 > 경제경영 > 트렌드/미래전망 > 인공지능/빅데이터',
    '국내도서 > 경제경영 > 트렌드/미래전망 > 트렌드/미래전망 일반',
    '국내도서 > 경제경영 > 마케팅/세일즈',
    '국내도서 > 경제경영 > 경영전략/혁신',
    '국내도서 > 경제경영 > 재테크/투자 > 주식',
    '국내도서 > 경제경영 > 재테크/투자 > 부동산',
    '국내도서 > 경제경영 > 창업/취업',
    '국내도서 > 경제경영 > 회계/세무',
    '국내도서 > 경제경영 > 리더십/조직관리',
    // 자기계발
    '국내도서 > 자기계발 > 성공/처세',
    '국내도서 > 자기계발 > 인간관계',
    '국내도서 > 자기계발 > 설득/협상/화술',
    // 인문
    '국내도서 > 인문학 > 철학 일반',
    '국내도서 > 인문학 > 심리학',
    '국내도서 > 인문학 > 교육학',
    '국내도서 > 인문학 > 인문교양',
    // 사회과학
    '국내도서 > 사회과학 > 사회학',
    '국내도서 > 사회과학 > 정치/외교',
    '국내도서 > 사회과학 > 언론/미디어',
    // 자연과학
    '국내도서 > 과학 > 과학 일반',
    '국내도서 > 과학 > 수학',
    '국내도서 > 과학 > 물리/화학',
    '국내도서 > 과학 > 생물/생명과학',
    '국내도서 > 과학 > 뇌과학',
    // 건강
    '국내도서 > 건강/스포츠 > 건강 일반',
    '국내도서 > 건강/스포츠 > 다이어트/운동',
    // 가정/생활
    '국내도서 > 가정/생활 > 요리',
    '국내도서 > 가정/생활 > 육아/자녀교육',
    '국내도서 > 가정/생활 > 인테리어/수납',
    '국내도서 > 가정/생활 > 취미/공예',
    // 예술
    '국내도서 > 예술/대중문화 > 디자인',
    '국내도서 > 예술/대중문화 > 사진',
    '국내도서 > 예술/대중문화 > 미술',
    '국내도서 > 예술/대중문화 > 음악',
    // 여행
    '국내도서 > 여행 > 국내여행',
    '국내도서 > 여행 > 해외여행',
    // 에세이/문학
    '국내도서 > 에세이',
    '국내도서 > 소설/시/희곡 > 한국소설',
    // 어린이
    '국내도서 > 어린이 > 과학/수학/컴퓨터',
    '국내도서 > 어린이 > 학습/교육'
  ],
  '영풍문고': [
    // 컴퓨터/IT
    '국내도서 > 컴퓨터/IT > 컴퓨터입문/활용',
    '국내도서 > 컴퓨터/IT > 컴퓨터언어 > 파이썬',
    '국내도서 > 컴퓨터/IT > 컴퓨터언어 > 자바/JSP',
    '국내도서 > 컴퓨터/IT > 컴퓨터언어 > C/C++',
    '국내도서 > 컴퓨터/IT > 컴퓨터언어 > 기타언어／언어일반/어셈블리,파스칼',
    '국내도서 > 컴퓨터/IT > 인터넷',
    '국내도서 > 컴퓨터/IT > 네트워크/보안',
    '국내도서 > 컴퓨터/IT > 데이터베이스',
    '국내도서 > 컴퓨터/IT > 인공지능/머신러닝',
    '국내도서 > 컴퓨터/IT > 그래픽/멀티미디어',
    '국내도서 > 컴퓨터/IT > OA/오피스',
    // 경제/자기계발
    '국내도서 > 경제/자기계발 > 비즈니스',
    '국내도서 > 경제/자기계발 > 마케팅',
    '국내도서 > 경제/자기계발 > 트렌드/전망',
    '국내도서 > 경제/자기계발 > 재테크/투자',
    '국내도서 > 경제/자기계발 > 자기계발',
    '국내도서 > 경제/자기계발 > 창업/취업',
    // 인문/사회
    '국내도서 > 인문/사회 > 철학',
    '국내도서 > 인문/사회 > 심리학',
    '국내도서 > 인문/사회 > 교육',
    '국내도서 > 인문/사회 > 사회과학',
    '국내도서 > 인문/사회 > 정치/법률',
    // 자연과학
    '국내도서 > 자연/과학 > 과학 일반',
    '국내도서 > 자연/과학 > 수학',
    '국내도서 > 자연/과학 > 생명과학',
    // 건강/생활
    '국내도서 > 건강/생활 > 건강/의학',
    '국내도서 > 건강/생활 > 요리/맛집',
    '국내도서 > 건강/생활 > 육아/자녀교육',
    '국내도서 > 건강/생활 > 취미/레저',
    // 예술/디자인
    '국내도서 > 예술/디자인 > 디자인',
    '국내도서 > 예술/디자인 > 사진/영상',
    '국내도서 > 예술/디자인 > 미술/드로잉',
    // 여행
    '국내도서 > 여행 > 국내여행',
    '국내도서 > 여행 > 해외여행',
    // 에세이/문학
    '국내도서 > 문학 > 에세이',
    '국내도서 > 문학 > 한국소설',
    '국내도서 > 문학 > 외국소설',
    // 외국어
    '국내도서 > 외국어 > 영어',
    '국내도서 > 외국어 > 일본어',
    '국내도서 > 외국어 > 중국어'
  ],
  '쿠팡': [
    // IT
    'IT모바일 > IT컴퓨터 > 컴퓨터 입문/활용',
    'IT모바일 > 컴퓨터 공학 > 인공지능/퍼지',
    'IT모바일 > 프로그래밍 언어 > 파이썬',
    'IT모바일 > 프로그래밍 언어 > 자바',
    'IT모바일 > 프로그래밍 언어 > C/C++',
    'IT모바일 > 웹프로그래밍',
    'IT모바일 > 네트워크/보안',
    'IT모바일 > 데이터베이스',
    'IT모바일 > 그래픽/멀티미디어',
    'IT모바일 > OA/오피스',
    // 경제/경영
    '경제/경영 > 트렌드/전망',
    '경제/경영 > 마케팅/세일즈',
    '경제/경영 > 비즈니스/경영전략',
    '경제/경영 > 재테크/투자',
    '경제/경영 > 창업',
    // 자기계발
    '자기계발 > 성공/처세',
    '자기계발 > 인간관계',
    // 인문
    '인문 > 철학',
    '인문 > 심리학',
    '인문 > 교양',
    // 자연과학
    '자연과학 > 과학 일반',
    '자연과학 > 수학',
    // 건강/생활
    '건강/생활 > 건강 일반',
    '건강/생활 > 요리',
    '건강/생활 > 육아',
    '건강/생활 > 취미/레저',
    // 예술
    '예술/디자인 > 디자인',
    '예술/디자인 > 사진',
    // 여행
    '여행 > 국내여행',
    '여행 > 해외여행',
    // 문학
    '문학 > 에세이',
    '문학 > 소설'
  ]
};

window.p18_autoCategories = async function() {
  if (_catGenerating) return;
  _collectFields();

  var title = data.title || '';
  var keywords = data.keywords || '';
  var tags = data.tags || '';
  var toc = data.toc || '';
  var description = data.description || '';

  if (!title.trim() && !keywords.trim()) {
    alert('제목 또는 키워드를 먼저 입력해주세요.\n도서의 주제를 파악할 정보가 필요합니다.');
    return;
  }

  var apiKey;
  if (typeof loadApiKey === 'function') apiKey = await loadApiKey();
  if (!apiKey) {
    alert('Claude API 키가 필요합니다. 통합 현황 또는 개발자 콘솔에서 설정하세요.');
    return;
  }

  _catGenerating = true;
  var btn = ROOT.querySelector('#p18-auto-cat-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 생성 중...'; }
  var textarea = ROOT.querySelector('[data-field="categories"]');

  // 서점별 카테고리 체계를 프롬프트에 포함
  var taxonomyRef = '';
  Object.keys(BOOKSTORE_TAXONOMIES).forEach(function(store) {
    taxonomyRef += '▶' + store + ' 카테고리 체계:\n';
    BOOKSTORE_TAXONOMIES[store].forEach(function(cat) {
      taxonomyRef += '  ' + cat + '\n';
    });
    taxonomyRef += '\n';
  });

  var bookInfo = '제목: ' + title;
  if (keywords) bookInfo += '\n키워드: ' + keywords;
  if (tags) bookInfo += '\n태그: ' + tags;
  if (description) bookInfo += '\n책 소개: ' + description.slice(0, 500);
  if (toc) bookInfo += '\n목차 일부: ' + toc.slice(0, 800);

  var prompt = '다음 도서 정보를 분석하여 한국 주요 서점 5곳의 서가 위치(카테고리)를 작성하세요.\n\n' +
    '--- 도서 정보 ---\n' + bookInfo + '\n\n' +
    '--- 서점별 카테고리 참조 ---\n' + taxonomyRef + '\n' +
    '[규칙]\n' +
    '1. 각 서점마다 도서의 주제에 가장 적합한 카테고리를 선택하세요.\n' +
    '2. 교보문고: 1~3개, 예스24: 2~14개(많이 가능), 알라딘: 2~5개, 영풍문고: 2~4개, 쿠팡: 1~2개 선택.\n' +
    '3. 예스24은 IT뿐 아니라 경제경영, 자연과학 등 교차 카테고리도 적극 활용합니다.\n' +
    '4. 위 참조 목록에 정확히 맞는 카테고리가 없으면, 해당 서점의 카테고리 체계 스타일에 맞춰 가장 근접한 카테고리를 작성하세요.\n' +
    '5. 반드시 아래 형식 그대로 출력하세요. 다른 설명이나 마크다운 없이 텍스트만:\n\n' +
    '▶교보문고\n국내도서 > ...\n국내도서 > ...\n\n' +
    '▶예스24\n  국내도서 > ...\n  국내도서 > ...\n\n' +
    '▶알라딘\n국내도서 > ...\n국내도서 > ...\n\n' +
    '▶영풍문고\n국내도서 > ...\n국내도서 > ...\n\n' +
    '▶쿠팡\n... > ...\n... > ...';

  try {
    var result = await callClaudeApi({
      apiKey: apiKey,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2000,
      prompt: prompt,
      system: '당신은 한국 서점(교보문고, 예스24, 알라딘, 영풍문고, 쿠팡)의 도서 카테고리 분류 전문가입니다. 도서의 제목, 키워드, 내용을 분석하여 각 서점의 실제 카테고리 체계에 맞는 서가 위치를 정확하게 매칭합니다. 서점마다 카테고리 명칭과 깊이가 다르므로 각 서점의 고유한 체계를 따릅니다.',
      noPersona: true,
      temperature: 0.2
    });

    // 결과 정리: ▶로 시작하는 블록만 추출
    var cleaned = result.trim();
    // 마크다운 코드블록 제거
    cleaned = cleaned.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '').trim();
    // ▶ 기호가 없으면 그대로 사용, 있으면 ▶부터 추출
    if (cleaned.indexOf('▶') >= 0) {
      cleaned = cleaned.slice(cleaned.indexOf('▶'));
    }

    data.categories = cleaned;
    if (textarea) textarea.value = cleaned;
    save();
    _updateBadges();

    _catGenerating = false;
    if (btn) { btn.disabled = false; btn.textContent = '🏪 자동 생성'; }

  } catch(e) {
    _catGenerating = false;
    if (btn) { btn.disabled = false; btn.textContent = '🏪 자동 생성'; }
    alert('서가 위치 자동 생성 오류: ' + e.message);
  }
};

// ── AI 생성 ──
var _aiGenerating = false;

window.p18_aiGenerate = async function() {
  if (_aiGenerating) return;
  if (!aiFiles.length) { alert('먼저 참고 파일을 업로드하세요.'); return; }

  var apiKey;
  if (typeof loadApiKey === 'function') apiKey = await loadApiKey();
  if (!apiKey) {
    alert('Claude API 키가 필요합니다. 통합 현황 또는 개발자 콘솔에서 설정하세요.');
    return;
  }

  _aiGenerating = true;
  var genBtn = ROOT.querySelector('#p18-ai-gen-btn');
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳ 생성 중...'; }
  var statusEl = ROOT.querySelector('#p18-ai-status');
  if (statusEl) statusEl.innerHTML = '<div class="p18-loading"><div class="p18-spinner"></div>AI가 신간 안내를 작성하고 있습니다...</div>';

  // 여러 파일 합치기
  var combined = aiFiles.map(function(f) { return '=== ' + f.name + ' ===\n' + f.text; }).join('\n\n');
  var truncated = combined.length > 20000 ? combined.slice(0, 20000) + '\n...(이하 생략)' : combined;

  var prompt = '다음은 출판할 도서의 원고 또는 관련 자료입니다. 이 내용을 분석하여 서점에 배포할 "신간 안내" 문서의 각 섹션을 작성해주세요.\n\n' +
    '[중요 규칙]\n' +
    '1. 반드시 순수 JSON 객체 하나만 출력하세요. 마크다운, 설명, 코드블록 없이 { 로 시작하고 } 로 끝나야 합니다.\n' +
    '2. 모든 문자열 값 안의 줄바꿈은 반드시 \\n으로 이스케이프하세요.\n' +
    '3. 문자열 값 안에 큰따옴표를 쓸 때는 반드시 \\"로 이스케이프하세요.\n' +
    '4. 작은따옴표(\')는 그냥 쓰세요(이스케이프 불필요).\n' +
    '5. 모든 필드를 반드시 채워주세요. 빈 값 없이 작성하세요.\n\n' +
    '{\n' +
    '  "title": "도서 전체 제목(부제 포함, 『』 감싸기)",\n' +
    '  "authors": "저자 이름(쉼표 구분)",\n' +
    '  "keywords": "키워드1, 키워드2, ...(최소 8개)",\n' +
    '  "tags": "#태그1 #태그2 ...(최소 5개)",\n' +
    '  "categories": "서점별 서가 위치(▶교보문고\\n국내도서 > ...\\n\\n▶예스24\\n국내도서 > ...\\n\\n▶알라딘\\n국내도서 > ...\\n\\n▶영풍문고\\n국내도서 > ...\\n\\n▶쿠팡\\n...)",\n' +
    '  "catchphrase": "★ 캐치프레이즈1\\n☆ 캐치프레이즈2\\n★ 핵심 문구 (최소 3줄)",\n' +
    '  "description": "책 소개 본문(2~3문단, 최소 200자)",\n' +
    '  "authorInfo": "지은이 소개(각 저자별 경력 상세, 최소 100자/인)",\n' +
    '  "reviewIntro": "출판사 리뷰 도입부(2~3줄 비전 메시지)",\n' +
    '  "reviewPoints": "★이 책의 핵심 포인트\\n첫째, ... | 설명\\n둘째, ... | 설명\\n셋째, ... | 설명 (최소 3개)",\n' +
    '  "reviewTarget": "★ 이런 분들의 시간을 찾아드립니다\\n- 대상독자1: 설명\\n- 대상독자2: 설명\\n- 대상독자3: 설명 (최소 3개)",\n' +
    '  "reviewOutcome": "★ 이 책을 읽고 나면 이렇게 달라집니다\\n효과1 UP! 설명\\n효과2 UP! 설명\\n효과3 UP! 설명 (최소 3개)",\n' +
    '  "toc": "목차 전체(CHAPTER, 절, 소절 모두 포함)",\n' +
    '  "relatedBooks": "관련 서적(제목 + 출판사 + 연도 + ISBN)",\n' +
    '  "mainSubject": "[코드] 주제어",\n' +
    '  "addSubject": "[코드] 추가주제어, ...",\n' +
    '  "pubDate": "발행일(YYYY년 MM월 DD일)",\n' +
    '  "price": "정가(예: 28,000원)",\n' +
    '  "pages": "페이지수(예: 364쪽)",\n' +
    '  "isbn": "ISBN(예: 979-11-xxxx-xxx-x xxxxx)",\n' +
    '  "format": "판형(예: 46배변형판(183*235))",\n' +
    '  "colors": "도수(예: 4도)",\n' +
    '  "level": "난이도(초급/중급/고급/입문)"\n' +
    '}\n\n' +
    '--- 원고 내용 ---\n' + truncated;

  try {
    var result = await callClaudeApi({
      apiKey: apiKey,
      model: 'claude-sonnet-4-6',
      maxTokens: 8000,
      prompt: prompt,
      system: '당신은 한빛미디어 영업마케팅부의 신간 안내 문서 작성 전문가입니다. 서점 담당자에게 도서를 효과적으로 소개하는 문서를 작성합니다. 실제 서점에 배포하는 공식 문서이므로 전문적이고 설득력 있게 작성하세요. AI투 표현을 피하고 편집자 톤으로 작성하세요. 반드시 순수 JSON만 출력하고 모든 필드를 빠짐없이 채우세요.',
      noPersona: true,
      temperature: 0.3
    });

    var parsed = _safeParseJson(result);
    if (!parsed) throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');

    // 데이터에 적용 (모든 텍스트 필드)
    var fillable = ['title','authors','keywords','tags','categories','catchphrase','description',
      'authorInfo','reviewIntro','reviewPoints','reviewTarget','reviewOutcome','toc',
      'mainSubject','addSubject','relatedBooks','pubDate','price','pages','isbn','format','colors','level'];
    fillable.forEach(function(k) {
      if (parsed[k]) data[k] = parsed[k];
    });
    save();
    _aiGenerating = false;
    render();
    var newStatus = ROOT.querySelector('#p18-ai-status');
    if (newStatus) newStatus.innerHTML = '<div style="padding:.6rem 1rem;background:var(--green-bg);border:1px solid var(--green-bd);border-radius:8px;font-size:13px;color:var(--green);">AI 생성이 완료되었습니다. 각 섹션의 내용을 확인하고 수정하세요.</div>';

  } catch(e) {
    _aiGenerating = false;
    if (genBtn) { genBtn.disabled = false; genBtn.textContent = '✨ AI 생성 시작'; }
    if (statusEl) statusEl.innerHTML = '<div style="padding:.6rem 1rem;background:var(--red-bg);border:1px solid var(--red-bd);border-radius:8px;font-size:13px;color:var(--red);">오류: ' + _x(e.message) + '</div>';
  }
};

// ── 미리보기 ──
window.p18_preview = function() {
  _collectFields();
  save();
  if (!_validateAndFocus()) return;

  var area = ROOT.querySelector('#p18-preview-area');
  if (!area) return;
  if (area.querySelector('.p18-preview-wrap')) { area.innerHTML = ''; return; }

  var h = '<div class="p18-preview-wrap">';

  h += '<div style="text-align:center;margin-bottom:1.5rem;">';
  h += '<div style="font-size:11px;color:var(--muted);">(예약 판매)신간 안내</div>';
  h += '<div style="font-size:18px;font-weight:700;margin-top:.5rem;">' + _x(data.title) + '</div>';
  if (data.authors) h += '<div style="font-size:13px;color:var(--muted);margin-top:.3rem;">' + _x(data.authors) + '</div>';
  h += '</div>';

  h += '<div class="meta">일자: ' + _x(data.date) + '</div>';
  h += '<div class="meta">발신: ' + _x(data.contact) + '</div>';
  h += '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border);">';

  // 1. 도서 정보
  h += '<h3>1. 도서 정보</h3>';
  if (data.categories) h += '<div style="font-size:12px;white-space:pre-wrap;color:var(--muted);line-height:1.6;margin-bottom:.8rem;">- 서가 위치\n' + _x(data.categories) + '</div>';
  var infoItems = [
    ['난이도', data.level], ['키워드', data.keywords], ['예스24 분류 태그', data.tags],
    ['저자', data.authors], ['ISBN', data.isbn], ['시리즈', data.series],
    ['발행일', data.pubDate], ['페이지수', data.pages], ['정가', data.price],
    ['책등 사이즈', data.spine], ['도수', data.colors], ['판형', data.format],
    ['메인주제어', data.mainSubject], ['추가주제어', data.addSubject]
  ];
  infoItems.forEach(function(item) {
    if (item[1]) h += '<div style="font-size:12px;margin-bottom:.2rem;">- ' + item[0] + ': ' + _x(item[1]) + '</div>';
  });

  // 2~6
  h += '<h3>2. 책 소개</h3>';
  h += '<div style="white-space:pre-wrap;margin-bottom:.5rem;">' + _x(data.catchphrase) + '</div>';
  h += '<div style="white-space:pre-wrap;">' + _x(data.description) + '</div>';

  h += '<h3>3. 지은이 소개</h3>';
  h += '<div style="white-space:pre-wrap;">' + _x(data.authorInfo) + '</div>';

  h += '<h3>4. 출판사 리뷰</h3>';
  [data.reviewIntro, data.reviewPoints, data.reviewTarget, data.reviewOutcome].forEach(function(t) {
    if (t) { h += '<div style="white-space:pre-wrap;margin-bottom:.8rem;">' + _x(t) + '</div>'; }
  });

  h += '<h3>5. 목차</h3>';
  h += '<div style="white-space:pre-wrap;font-size:12px;line-height:1.7;">' + _x(data.toc) + '</div>';

  h += '<h3>6. 관련 서적(제목 + ISBN)</h3>';
  h += '<div style="white-space:pre-wrap;">' + _x(data.relatedBooks) + '</div>';

  // 7. 추천사 (선택)
  var hasRec = data.recommendations.some(function(r) { return r.text && r.text.trim(); });
  if (hasRec) {
    h += '<h3>7. 추천사</h3>';
    data.recommendations.forEach(function(r) {
      if (!r.text || !r.text.trim()) return;
      h += '<div style="margin-bottom:1rem;">';
      h += '<div style="white-space:pre-wrap;">' + _x(r.text) + '</div>';
      if (r.name || r.affiliation) {
        h += '<div style="text-align:right;color:var(--muted);font-size:12px;margin-top:.3rem;">_';
        if (r.affiliation) h += _x(r.affiliation) + ' ';
        h += _x(r.name) + '</div>';
      }
      h += '</div>';
    });
  }

  if (data._promoResult) {
    h += '<h3>8. 홍보 카피</h3>';
    h += '<pre style="white-space:pre-wrap;font-size:.85rem;line-height:1.6;">' + _x(data._promoResult) + '</pre>';
  }
  h += '<h3>9. 상세 이미지 (별첨)</h3>';
  h += '</div>';

  area.innerHTML = h;
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── DOCX 다운로드 ──
window.p18_downloadDocx = function() {
  _collectFields();
  if (!_validateAndFocus()) return;
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리가 필요합니다.'); return; }

  var zip = new JSZip();

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

  zip.file('word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
        '<w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/>' +
        '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
        '<w:pPr><w:spacing w:after="120" w:line="320" w:lineRule="auto"/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
        '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr>' +
        '<w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1F3864"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
        '<w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>' +
        '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>' +
        '<w:pPr><w:jc w:val="center"/></w:pPr>' +
        '<w:rPr><w:color w:val="666666"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>' +
    '</w:styles>');

  var body = '';
  body += _wp('Title', '(예약 판매)신간 안내');
  body += _wp('Title', data.title);
  body += _wp('Subtitle', data.authors);
  body += _wp('Normal', '');
  body += _wp('Normal', '일자: ' + data.date);
  body += _wp('Normal', '발신: ' + data.contact);
  body += _wp('Normal', '');

  body += _wp('Heading1', '1. 도서 정보');
  body += _wp('Normal', '- 서가 위치');
  data.categories.split('\n').forEach(function(line) { body += _wp('Normal', line); });
  body += _wp('Normal', '');
  [['난이도',data.level],['키워드',data.keywords],['예스24 분류 태그',data.tags],
   ['저자',data.authors],['ISBN',data.isbn],['시리즈',data.series],
   ['발행일',data.pubDate],['페이지수',data.pages],['정가',data.price],
   ['책등 사이즈',data.spine],['도수',data.colors],['판형',data.format],
   ['메인주제어',data.mainSubject],['추가주제어',data.addSubject]
  ].forEach(function(item) {
    if (item[1]) body += _wp('Normal', '- ' + item[0] + ': ' + item[1]);
  });

  body += _wp('Heading1', '2. 책 소개');
  data.catchphrase.split('\n').forEach(function(l) { body += _wp('Normal', l); });
  body += _wp('Normal', '');
  data.description.split('\n').forEach(function(l) { body += _wp('Normal', l); });

  body += _wp('Heading1', '3. 지은이 소개');
  data.authorInfo.split('\n').forEach(function(l) { body += _wp('Normal', l); });

  body += _wp('Heading1', '4. 출판사 리뷰');
  [data.reviewIntro, data.reviewPoints, data.reviewTarget, data.reviewOutcome].forEach(function(t) {
    if (t) { t.split('\n').forEach(function(l) { body += _wp('Normal', l); }); body += _wp('Normal', ''); }
  });

  body += _wp('Heading1', '5. 목차');
  data.toc.split('\n').forEach(function(l) { body += _wp('Normal', l); });

  body += _wp('Heading1', '6. 관련 서적(제목 + ISBN)');
  data.relatedBooks.split('\n').forEach(function(l) { body += _wp('Normal', l); });

  var hasRec = data.recommendations.some(function(r) { return r.text && r.text.trim(); });
  if (hasRec) {
    body += _wp('Heading1', '7. 추천사');
    data.recommendations.forEach(function(r) {
      if (!r.text || !r.text.trim()) return;
      r.text.split('\n').forEach(function(l) { body += _wp('Normal', l); });
      var sig = '_';
      if (r.affiliation) sig += r.affiliation + ' ';
      sig += r.name;
      body += _wp('Normal', sig);
      body += _wp('Normal', '');
    });
  }

  if (data._promoResult) {
    body += _wp('Heading1', '8. 홍보 카피');
    data._promoResult.split('\n').forEach(function(line) { body += _wp('Normal', line); });
  }
  body += _wp('Heading1', '9. 상세 이미지 (별첨)');

  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>');

  var filename = (data.title || '신간안내').replace(/[『』\[\]\/\\:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 40) + '_신간안내.docx';

  zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    .then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
};

function _wp(style, text) {
  return '<w:p><w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' +
    '<w:r><w:t xml:space="preserve">' + _x(text) + '</w:t></w:r></w:p>';
}

// ── 초기화 ──
function initPanel18() {
  load();
  render();
}

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(18, { onActivate: initPanel18 });
}

initPanel18();

})();
