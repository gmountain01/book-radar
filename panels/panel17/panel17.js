(function(){
'use strict';

// ──────────────────────────────────────────────
// panel17 — 표지 시안
// ──────────────────────────────────────────────

var root = document.getElementById('panel17');
if (!root) return;

var LS_KEY = 'p17_cover_data';
var currentTab = 'cover1';

// ── 기본값 ──
var DEFAULTS = {
  title: '혼자 공부하는 바이브 코딩  with 클로드 코드',
  subtitle: 'AI와 1:1 대화하며 배우는 첫 코딩 자습서',
  copy: '혼자서도 팀처럼 개발한다!\n나만의 AI 개발팀과 함께\n세상에서 가장 쉬운 첫 바이브 코딩 자습서',
  keywords: '클로드 코드, Claude Code, 엔트로픽, 바이브 코딩',
  sticker: '예제 파일 제공, 15가지 실습, 유튜브 강의',
  author: '조태호 지음',
  bio: '인디애나대학교 의과대학 영상의학 및 영상과학과 교수로, AI와 딥러닝을 의료 분야에 접목해 알츠하이머병 조기 진단 연구를 이끌고 있다.\n\n주요 저서:\n- 모두의 딥러닝(1-4판)\n- 당신의 이유는 무엇입니까',
  email: '',
  note2: 'https://github.com/taehojo\nhttps://www.jolab.ai\n\n저자가 직접 답하는 Q&A 사이트\nhttp://bit.ly/47LfEbQ',
  ad: 'AI 시대, 개발자의 지식 파트너\n\nAI 기술이 세상을 바꾸고 있는 지금,\n30년 넘게 책으로 지식을 전해온\n한빛미디어&한빛아카데미가\nAI 콘텐츠 서비스 전문기업인\n한빛앤을 설립했습니다.',
  desc: 'AI 시대의 새로운 코딩 방법을 배우고 싶을 때\n대화하며 쉽게 프로그래밍을 시작하고 싶을 때\n실제 프로젝트로 최신 워크플로를 체험하고 싶을 때',
  rec: '"AI와 대화하듯 프로그램을 만들어 본 경험이 제 업무 방식의 큰 전환점이 되었습니다."\n— 하버드대 의과대학 교수 캐롤 림\n\n"이 책을 따라가다 보면 독자는 마치 게임에서 레벨업하듯 자연스럽게 성장하게 될 것입니다."\n— 국회의원 황정아',
  spineTitle: '', spineSub: ''
};

// ── 5개 테마 프리셋 ──
var THEMES = [
  { id: 'minimal', name: '미니멀', desc: '흰 배경, 검정 타이포, 여백 강조',
    colors: { front:'#ffffff', spine:'#1a1a1a', back:'#ffffff', flap:'#fafafa',
      titleColor:'#111', subColor:'#666', accentColor:'#1a1a1a', stickerBg:'#111', kwBg:'#f0f0f0', kwColor:'#333' }},
  { id: 'elegant', name: '세련된', desc: '네이비+골드, 고급스러운 느낌',
    colors: { front:'#1b2a4a', spine:'#c9a84c', back:'#1b2a4a', flap:'#f4efe6',
      titleColor:'#ffffff', subColor:'#c9a84c', accentColor:'#c9a84c', stickerBg:'#c9a84c', kwBg:'rgba(201,168,76,.2)', kwColor:'#c9a84c' }},
  { id: 'vibrant', name: '비비드', desc: '선명한 그래디언트, 에너지 넘치는',
    colors: { front:'linear-gradient(135deg,#667eea,#764ba2)', spine:'#764ba2', back:'linear-gradient(135deg,#764ba2,#667eea)', flap:'#f8f6ff',
      titleColor:'#ffffff', subColor:'rgba(255,255,255,.85)', accentColor:'#667eea', stickerBg:'#ff6b6b', kwBg:'rgba(255,255,255,.2)', kwColor:'#fff' }},
  { id: 'nature', name: '자연', desc: '포레스트 그린, 따뜻한 크래프트 톤',
    colors: { front:'#2d5016', spine:'#4a7c28', back:'#2d5016', flap:'#f5f0e6',
      titleColor:'#f5f0e6', subColor:'#a8c68f', accentColor:'#4a7c28', stickerBg:'#e8a838', kwBg:'rgba(168,198,143,.3)', kwColor:'#f5f0e6' }},
  { id: 'mono', name: '모노톤', desc: '회색 계열, 차분하고 기술적인',
    colors: { front:'#2c2c2c', spine:'#e74c3c', back:'#2c2c2c', flap:'#eaeaea',
      titleColor:'#ffffff', subColor:'#bbbbbb', accentColor:'#e74c3c', stickerBg:'#e74c3c', kwBg:'rgba(255,255,255,.12)', kwColor:'#ddd' }}
];
var currentTheme = null;

// ── 배치 축 (가로 정렬 3 + 세로 위치 3, 표1·표4 독립) ──
var H_OPTS = [
  { id:'l', name:'좌', align:'flex-start', textAlign:'left' },
  { id:'c', name:'중', align:'center',     textAlign:'center' },
  { id:'r', name:'우', align:'flex-end',   textAlign:'right' }
];
// 표1·표4 각각 독립 상태 (가로 정렬만)
var _hC1 = 'l';
var _hC4 = 'l';

root.innerHTML = `
<div class="p17-wrap">
  <div class="p17-hdr">
    <h2>표지 시안</h2>
    <p>표1 ~ 표4 + 책등 텍스트를 입력하고 AI로 배경 이미지를 생성합니다.</p>
  </div>

  <!-- ── 테마 프리셋 (미리보기 상단, 가로 배열) ── -->
  <div class="p17-themes-bar">
    <span class="p17-themes-label">테마</span>
    <div class="p17-themes-row" id="p17_themeRow"></div>
  </div>

  <!-- ── 배치 (표1·표4 독립, 가로 정렬 + 세로 위치 + 글씨 방향) ── -->
  <div class="p17-themes-bar p17-layout-bar">
    <span class="p17-themes-label">배치</span>
    <div class="p17-layout-pair">
      <div class="p17-layout-unit">
        <span class="p17-layout-label">표4</span>
        <span class="p17-axis-row" id="p17_hC4"></span>
      </div>
      <div class="p17-layout-unit">
        <span class="p17-layout-label">표1</span>
        <span class="p17-axis-row" id="p17_hC1"></span>
      </div>
    </div>
  </div>

  <!-- ── 펼침 미리보기 ── -->
  <div class="p17-preview">
    <div class="p17-preview-title">펼침 미리보기
      <button class="p17-btn p17-btn-secondary" style="margin-left:auto;font-size:10px;padding:3px 8px" onclick="p17_capturePreview()">PNG 캡처</button>
    </div>
    <div class="p17-cover" id="p17_coverPreview">
      <div class="p17-c p17-c-flap" id="p17_pv_c3" data-label="표3 뒷날개"></div>
      <div class="p17-c p17-c-back" id="p17_pv_c4" data-label="표4 뒤표지"></div>
      <div class="p17-c p17-c-spine" id="p17_pv_spine" data-label="책등"></div>
      <div class="p17-c p17-c-front" id="p17_pv_c1" data-label="표1 앞표지"></div>
      <div class="p17-c p17-c-flap p17-c-flap-right" id="p17_pv_c2" data-label="표2 앞날개"></div>
    </div>
  </div>

  <!-- ── 입력 영역 (탭+폼) ── -->
  <div class="p17-edit">
    <div class="p17-tabs">
      <button class="p17-tab active" data-tab="cover1" onclick="p17_switchTab(this)">표1 앞표지</button>
      <button class="p17-tab" data-tab="cover2" onclick="p17_switchTab(this)">표2 앞날개</button>
      <button class="p17-tab" data-tab="cover3" onclick="p17_switchTab(this)">표3 뒷날개</button>
      <button class="p17-tab" data-tab="cover4" onclick="p17_switchTab(this)">표4 뒤표지</button>
      <button class="p17-tab" data-tab="spine" onclick="p17_switchTab(this)">책등</button>
    </div>
    <div class="p17-form">
      <div class="p17-section active" id="p17_sec_cover1">
        <div class="p17-field"><label>제목</label>
          <input type="text" id="p17_title" placeholder="예: 혼자 공부하는 파이썬" oninput="p17_update()"></div>
        <div class="p17-field"><label>부제목</label>
          <input type="text" id="p17_subtitle" placeholder="예: 1:1 과외하듯 배우는 프로그래밍 자습서" oninput="p17_update()"></div>
        <div class="p17-field"><label>카피</label>
          <textarea id="p17_copy" rows="2" placeholder="독자에게 전하는 한 줄 메시지" oninput="p17_update()"></textarea></div>
        <div class="p17-field"><label>키워드 <span class="p17-hint-inline">부제 아래 텍스트</span></label>
          <input type="text" id="p17_keywords" placeholder="예: with 클로드 코드" oninput="p17_update()"></div>
        <div class="p17-field"><label>딱지 <span class="p17-hint-inline">저자 위 동그라미</span></label>
          <input type="text" id="p17_sticker" placeholder="쉼표 구분: 예제 파일 제공, 15가지 실습" oninput="p17_update()"></div>
        <div class="p17-field"><label>지은이</label>
          <input type="text" id="p17_author" placeholder="홍길동" oninput="p17_update()"></div>
      </div>
      <div class="p17-section" id="p17_sec_cover2">
        <div class="p17-field"><label>저자 소개</label>
          <textarea id="p17_bio" rows="5" placeholder="저자의 경력, 저서, 활동 등" oninput="p17_update()"></textarea></div>
        <div class="p17-field"><label>저자 이메일</label>
          <input type="email" id="p17_email" placeholder="author@example.com" oninput="p17_update()"></div>
        <div class="p17-field"><label>기타 전달 사항</label>
          <textarea id="p17_note2" rows="3" placeholder="저자 블로그, GitHub, 유튜브 등" oninput="p17_update()"></textarea></div>
      </div>
      <div class="p17-section" id="p17_sec_cover3">
        <div class="p17-field"><label>광고 문구 <span class="p17-hint-inline">한빛앤</span></label>
          <textarea id="p17_ad" rows="3" placeholder="한빛앤 광고" oninput="p17_update()"></textarea></div>
      </div>
      <div class="p17-section" id="p17_sec_cover4">
        <div class="p17-field"><label>책 설명</label>
          <textarea id="p17_desc" rows="5" placeholder="상세 설명, 독자 대상, 학습 방법 등" oninput="p17_update()"></textarea></div>
        <div class="p17-field"><label>추천사</label>
          <textarea id="p17_rec" rows="4" placeholder="추천사 내용 — 추천인" oninput="p17_update()"></textarea></div>
      </div>
      <div class="p17-section" id="p17_sec_spine">
        <div class="p17-field"><label>책등 제목 <span class="p17-hint-inline">비우면 자동</span></label>
          <input type="text" id="p17_spineTitle" placeholder="자동: 표1 제목 사용" oninput="p17_update()"></div>
        <div class="p17-field"><label>책등 부제목</label>
          <input type="text" id="p17_spineSub" placeholder="자동: 표1 부제목 사용" oninput="p17_update()"></div>
      </div>
      <div class="p17-actions">
        <button class="p17-btn p17-btn-secondary" onclick="p17_save()">저장</button>
        <button class="p17-btn p17-btn-secondary" onclick="p17_exportText()">텍스트 내보내기</button>
        <button class="p17-btn p17-btn-danger" onclick="p17_reset()">초기화</button>
        <span class="p17-status" id="p17_status"></span>
      </div>
    </div>
  </div>

  <!-- ── AI 배경 생성 (하단 별도 섹션) ── -->
  <div class="p17-ai-section">
    <div class="p17-ai-section-title">AI 배경 생성</div>
    <div class="p17-ai-section-desc">참고 이미지와 컨셉을 설정한 뒤 배경을 생성하면, 위 미리보기의 표1(앞표지)에 자동 적용됩니다.</div>

    <!-- Step 1: 참고 이미지 -->
    <div class="p17-ai-step">
      <div class="p17-ai-step-hdr"><span class="p17-ai-step-num">1</span> 참고 이미지 (선택)</div>
      <div id="p17_refArea"></div>
    </div>

    <!-- Step 2: 컨셉 -->
    <div class="p17-ai-step">
      <div class="p17-ai-step-hdr"><span class="p17-ai-step-num">2</span> 컨셉 후보 (선택)</div>
      <div id="p17_conceptArea"></div>
    </div>

    <!-- Step 3: 생성 -->
    <div class="p17-ai-step">
      <div class="p17-ai-step-hdr"><span class="p17-ai-step-num">3</span> 배경 생성</div>
      <div class="p17-ai-gen-row">
        <button class="p17-btn p17-btn-primary" onclick="p17_genDesign()" id="p17_aiBtn">AI 배경 생성</button>
        <span class="p17-status" id="p17_genStatus"></span>
      </div>
    </div>

    <!-- 결과 -->
    <div id="p17_resultArea" class="p17-ai-result" style="display:none">
      <div class="p17-ai-result-hdr">
        <span class="p17-ai-result-badge">적용됨</span>
        <span class="p17-ai-result-model" id="p17_resultModel"></span>
      </div>
      <div class="p17-ai-result-img-wrap">
        <img id="p17_bgThumb" class="p17-ai-result-img">
        <div class="p17-ai-result-caption">이 이미지가 위 미리보기 표1(앞표지) 배경에 적용되었습니다</div>
      </div>
      <div class="p17-ai-result-actions">
        <button class="p17-btn p17-btn-secondary" onclick="p17_scrollToPreview()">미리보기 확인</button>
        <button class="p17-btn p17-btn-secondary" onclick="p17_downloadBg()">이미지 다운로드</button>
        <button class="p17-btn p17-btn-danger" onclick="p17_clearBg()">배경 제거</button>
      </div>
    </div>
    <div id="p17_bgStatus" style="font-size:10px;color:var(--muted);margin-top:6px"></div>
  </div>
</div>`;

// ──────────────────────────────────────────────
// 데이터 읽기/쓰기
// ──────────────────────────────────────────────
function _val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function _setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; }

function _getData() {
  return {
    title: _val('p17_title'), subtitle: _val('p17_subtitle'),
    copy: _val('p17_copy'), keywords: _val('p17_keywords'),
    sticker: _val('p17_sticker'), author: _val('p17_author'),
    bio: _val('p17_bio'), email: _val('p17_email'), note2: _val('p17_note2'),
    ad: _val('p17_ad'),
    desc: _val('p17_desc'), rec: _val('p17_rec'),
    spineTitle: _val('p17_spineTitle'), spineSub: _val('p17_spineSub')
  };
}

function _applyData(d) {
  _setVal('p17_title', d.title); _setVal('p17_subtitle', d.subtitle);
  _setVal('p17_copy', d.copy); _setVal('p17_keywords', d.keywords);
  _setVal('p17_sticker', d.sticker); _setVal('p17_author', d.author);
  _setVal('p17_bio', d.bio); _setVal('p17_email', d.email); _setVal('p17_note2', d.note2);
  _setVal('p17_ad', d.ad);
  _setVal('p17_desc', d.desc); _setVal('p17_rec', d.rec);
  _setVal('p17_spineTitle', d.spineTitle); _setVal('p17_spineSub', d.spineSub);
}

function _loadData() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) { _applyData(JSON.parse(raw)); return; }
  } catch(e) {}
  // 저장된 데이터 없으면 기본값 적용
  _applyData(DEFAULTS);
}

/** 초기화 — 기본값으로 복원 */
function p17_reset() {
  if (!confirm('모든 입력값을 기본값으로 초기화합니다.\n계속하시겠습니까?')) return;
  localStorage.removeItem(LS_KEY);
  currentTheme = null;
  _hC1 = 'l'; _hC4 = 'l';
  _applyData(DEFAULTS);
  p17_update();
  _renderThemes();
  _renderLayouts();
  _setStatus('기본값으로 초기화됨');
}

/** 테마 적용 */
function p17_applyTheme(id) {
  var theme = THEMES.find(function(t){ return t.id === id; });
  if (!theme) return;
  currentTheme = (currentTheme && currentTheme.id === id) ? null : theme; // 토글
  // 테마 적용 시 AI 배경 이미지 + 컨셉 색상 해제 — 테마 색상으로 전환
  if (currentTheme) {
    if (_coverBgUrl) {
      _coverBgUrl = '';
      var c1 = document.getElementById('p17_pv_c1');
      if (c1) { c1.style.backgroundImage = ''; c1.classList.remove('p17-has-bg'); }
      var ra = document.getElementById('p17_resultArea');
      if (ra) ra.style.display = 'none';
    }
    _spineColor = '';
    _backColor = '';
  }
  p17_update();
  _renderThemes();
  _setStatus(currentTheme ? '"' + theme.name + '" 테마 적용됨' : '테마 해제됨');
}

/** 가로 정렬 변경 */
function p17_setH(target, id) {
  if (target === 'c1') _hC1 = id; else _hC4 = id;
  p17_update(); _renderLayouts();
}
/** 배치 UI 렌더링 */
function _renderLayouts() {
  _renderAxis('p17_hC1', _hC1, 'c1');
  _renderAxis('p17_hC4', _hC4, 'c4');
}

function _renderAxis(elId, current, target) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = H_OPTS.map(function(o) {
    return '<button class="p17-axis-btn' + (o.id === current ? ' active' : '') +
      '" onclick="p17_setH(\'' + target + '\',\'' + o.id + '\')">' + o.name + '</button>';
  }).join('');
}

/** 테마 버튼 렌더링 */
function _renderThemes() {
  var row = document.getElementById('p17_themeRow');
  if (!row) return;
  row.innerHTML = THEMES.map(function(t) {
    var isActive = currentTheme && currentTheme.id === t.id;
    var frontC = t.colors.front.startsWith('linear') ? '#667eea' : t.colors.front;
    var spineC = t.colors.spine;
    return '<button class="p17-theme-card' + (isActive ? ' active' : '') + '" onclick="p17_applyTheme(\'' + t.id + '\')">' +
      '<div class="p17-theme-swatch">' +
        '<span style="background:' + frontC + ';width:12px;height:16px;border-radius:2px;border:1px solid rgba(0,0,0,.1)"></span>' +
        '<span style="background:' + spineC + ';width:3px;height:16px;border-radius:1px"></span>' +
      '</div>' +
      '<div class="p17-theme-info"><div class="p17-theme-name">' + t.name + '</div>' +
      '</div>' +
    '</button>';
  }).join('');
}

function _esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ──────────────────────────────────────────────
// 미리보기 갱신
// ──────────────────────────────────────────────
function p17_update() {
  var d = _getData();
  var spT = d.spineTitle || d.title || '제목';
  var spS = d.spineSub || d.subtitle || '';
  var t = currentTheme ? currentTheme.colors : null;

  // ═══ 표1 앞표지 — PDF 참조: 제목 대형(좌측), 부제 아래, 딱지 세로(우측 중앙), 키워드 배지 하단, 저자+카피 최하단 ═══
  var c1 = document.getElementById('p17_pv_c1');
  if (c1) {
    var tc = t ? t.titleColor : ''; var sc = t ? t.subColor : '';
    var kwBg = t ? t.kwBg : ''; var kwColor = t ? t.kwColor : '';
    if (t) { c1.style.cssText = 'background:' + t.front + ';border-color:transparent'; }
    else { c1.style.cssText = ''; }
    // 배경 이미지가 있으면 복원 (cssText가 초기화하므로)
    if (_coverBgUrl) {
      c1.style.backgroundImage = 'url(' + _coverBgUrl + ')';
      c1.style.backgroundSize = 'cover';
      c1.style.backgroundPosition = 'center';
      // 동적 글씨색 CSS 변수 복원
      if (_coverTextColor) {
        c1.style.setProperty('--cover-text', _coverTextColor);
        c1.style.setProperty('--cover-shadow', _coverTextShadow);
        c1.style.setProperty('--cover-overlay', _coverOverlay);
      }
    }
    // 레이아웃 적용 (표1)
    var h1 = H_OPTS.find(function(o){ return o.id === _hC1; }) || H_OPTS[0];
    c1.style.alignItems = h1.align;
    c1.style.textAlign = h1.textAlign;
    // 딱지 = 동그라미 배열 (저자 위)
    var stickerHtml = '';
    if (d.sticker) {
      var stBg = t ? t.stickerBg : '#c0392b';
      var stItems = d.sticker.split(',');
      stickerHtml = '<div class="c1-stickers">' + stItems.map(function(s) {
        return '<span class="c1-sticker" style="background:' + stBg + '">' + _esc(s.trim()) + '</span>';
      }).join('') + '</div>';
    }
    var ta1 = h1.textAlign;
    c1.innerHTML =
      '<div class="c1-top" style="' + (sc ? 'color:'+sc+';' : '') + 'text-align:' + ta1 + '">&lt;혼자 공부하는&gt; 시리즈</div>' +
      '<div class="c1-main" style="align-items:' + h1.align + '">' +
        '<h3 style="' + (tc ? 'color:'+tc+';' : '') + 'text-align:' + ta1 + '">' + _esc(d.title || '제목') + '</h3>' +
        '<h4 style="' + (sc ? 'color:'+sc+';' : '') + 'text-align:' + ta1 + '">' + _esc(d.subtitle || '') + '</h4>' +
        (d.keywords ? '<div class="c1-keywords" style="' + (sc ? 'color:'+sc+';' : '') + 'text-align:' + ta1 + '">' + _esc(d.keywords) + '</div>' : '') +
        (d.copy ? '<div class="copy" style="' + (sc ? 'color:'+sc+';' : '') + 'text-align:' + ta1 + '">' + _esc(d.copy).replace(/\n/g,'<br>') + '</div>' : '') +
      '</div>' +
      stickerHtml +
      '<div class="c1-bottom" style="text-align:' + ta1 + '">' +
        '<div class="author" style="' + (tc ? 'color:'+tc : '') + '">' + _esc(d.author || '') + '</div>' +
      '</div>';
  }

  // ═══ 표2 앞날개 — PDF 참조: 지은이(라벨+이름), URL, 소개문, Q&A 링크(하단) ═══
  var c2 = document.getElementById('p17_pv_c2');
  if (c2) {
    if (t) c2.style.background = t.flap; else c2.style.cssText = '';
    var authorName = (d.author || '').replace(/ 지음$/, '');
    var urls = ''; var links = '';
    if (d.note2) {
      var noteLines = d.note2.split('\n');
      var urlLines = []; var linkLines = [];
      noteLines.forEach(function(l) {
        if (l.match(/^https?:\/\//)) urlLines.push(l);
        else linkLines.push(l);
      });
      urls = urlLines.map(function(u){ return _esc(u); }).join('<br>');
      links = linkLines.map(function(l){ return _esc(l); }).join('<br>');
    }
    c2.innerHTML =
      '<div class="bio-label">지은이</div>' +
      '<div class="bio-name">' + _esc(authorName) + '</div>' +
      (urls ? '<div class="bio-url">' + urls + '</div>' : '') +
      '<div class="bio">' + _esc(d.bio || '').replace(/\n/g, '<br>') + '</div>' +
      '<div class="bio-links">' +
        (links ? links : '') +
        (d.email ? '<br>' + _esc(d.email) : '') +
      '</div>';
  }

  // ═══ 표3 뒷날개 — PDF 참조: 타이틀(AI 시대...) + 본문 + 학습 경험 목록 ═══
  var c3 = document.getElementById('p17_pv_c3');
  if (c3) {
    if (t) c3.style.background = t.flap; else c3.style.cssText = '';
    var adText = d.ad || '한빛앤 광고';
    var adParts = adText.split('\n');
    var adTitle = adParts[0] || '';
    var adRest = adParts.slice(1).join('\n');
    // 빈 줄로 소제목 분리
    var adSections = adRest.split(/\n\n+/);
    var adHtml = '<div class="ad"><div class="ad-title">' + _esc(adTitle) + '</div>';
    adSections.forEach(function(sec) {
      if (!sec.trim()) return;
      var secLines = sec.trim().split('\n');
      adHtml += '<div class="ad-sub">' + _esc(secLines[0]) + '</div>';
      if (secLines.length > 1) adHtml += '<div>' + secLines.slice(1).map(function(l){ return _esc(l); }).join('<br>') + '</div>';
    });
    adHtml += '</div>';
    c3.innerHTML = adHtml;
  }

  // ═══ 표4 뒤표지 — PDF 참조: 상단 카피(볼드), 추천의 한마디 제목, 추천사 목록, 하단 가격 ═══
  var c4 = document.getElementById('p17_pv_c4');
  if (c4) {
    if (t) { c4.style.cssText = 'background:' + t.back + ';border-color:transparent'; }
    else { c4.style.cssText = ''; }
    // 컨셉/분석 색상이 있으면 복원 (cssText가 초기화하므로)
    if (_backColor && !t) { c4.style.background = _backColor; }
    // 레이아웃 적용 (표4)
    var h4 = H_OPTS.find(function(o){ return o.id === _hC4; }) || H_OPTS[0];
    c4.style.alignItems = h4.align;
    c4.style.textAlign = h4.textAlign;
    var tc4 = t ? t.titleColor : ''; var sc4 = t ? t.subColor : '';
    // 카피 (표1에서 가져옴)
    var c4copy = d.copy ? '<div class="c4-copy" style="' + (tc4 ? 'color:'+tc4 : '') + '">' +
      _esc(d.copy).replace(/\n/g,'<br>') + '</div>' : '';
    // 추천사
    var recHtml = '';
    if (d.rec) {
      recHtml = '<div class="rec-title" style="' + (tc4 ? 'color:'+tc4 : '') + '">추천의 한마디</div>' +
        '<div class="rec" style="' + (sc4 ? 'color:'+sc4 : '') + '">' + _esc(d.rec).replace(/\n/g, '<br>') + '</div>';
    }
    // 설명
    var descHtml = d.desc ? '<div class="desc" style="' + (tc4 ? 'color:'+tc4 : '') + '">' +
      _esc(d.desc).replace(/\n/g,'<br>') + '</div>' : '';
    c4.innerHTML = c4copy + descHtml + recHtml + '<div class="price">정가 00,000원</div>';
  }

  // ═══ 책등 — 세로 텍스트, 제목만 ═══
  var sp = document.getElementById('p17_pv_spine');
  if (sp) {
    sp.textContent = spT;
    if (t) sp.style.background = t.spine; else sp.style.cssText = '';
    // 컨셉/분석 색상이 있으면 복원
    if (_spineColor && !t) { sp.style.background = _spineColor; }
  }
}

// ──────────────────────────────────────────────
// 탭 전환
// ──────────────────────────────────────────────
function p17_switchTab(btn) {
  if (!btn || !btn.dataset || !btn.dataset.tab) return;
  currentTab = btn.dataset.tab;
  // 탭 버튼 active
  var tabs = root.querySelectorAll('.p17-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].className = 'p17-tab' + (tabs[i].dataset.tab === currentTab ? ' active' : '');
  }
  // 섹션 표시
  var secs = root.querySelectorAll('.p17-section');
  for (var j = 0; j < secs.length; j++) {
    secs[j].className = 'p17-section' + (secs[j].id === 'p17_sec_' + currentTab ? ' active' : '');
  }
}

// ──────────────────────────────────────────────
// 저장 / 불러오기
// ──────────────────────────────────────────────
function p17_save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_getData()));
    _setStatus('저장 완료');
  } catch(e) { _setStatus('저장 실패'); }
}

function _setStatus(msg) {
  var el = document.getElementById('p17_status');
  if (el) { el.textContent = msg; setTimeout(function(){ el.textContent = ''; }, 3000); }
}

// ──────────────────────────────────────────────
// 텍스트 내보내기
// ──────────────────────────────────────────────
function p17_exportText() {
  var d = _getData();
  var text = '표지 시안 텍스트\n' + '═'.repeat(40) + '\n\n';
  text += '[표1 앞표지]\n';
  text += '제목: ' + (d.title || '') + '\n';
  text += '부제목: ' + (d.subtitle || '') + '\n';
  text += '카피: ' + (d.copy || '') + '\n';
  text += '키워드: ' + (d.keywords || '') + '\n';
  text += '딱지: ' + (d.sticker || '') + '\n';
  text += '지은이: ' + (d.author || '') + '\n\n';
  text += '[표2 앞날개]\n';
  text += '저자 소개:\n' + (d.bio || '') + '\n';
  text += '이메일: ' + (d.email || '') + '\n';
  text += '기타: ' + (d.note2 || '') + '\n\n';
  text += '[표3 뒷날개]\n' + (d.ad || '한빛앤 광고') + '\n\n';
  text += '[표4 뒤표지]\n';
  text += '책 설명:\n' + (d.desc || '') + '\n';
  text += '추천사:\n' + (d.rec || '') + '\n\n';
  text += '[책등]\n';
  text += '제목: ' + (d.spineTitle || d.title || '') + '\n';
  text += '부제목: ' + (d.spineSub || d.subtitle || '') + '\n';

  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (d.title || '표지시안') + '_표지텍스트.txt';
  a.click();
  URL.revokeObjectURL(url);
  _setStatus('텍스트 내보내기 완료');
}

// ──────────────────────────────────────────────
// 배경 이미지 관리 — 미리보기 표1에 직접 반영
// ──────────────────────────────────────────────
var _coverBgUrl = '';      // 현재 배경 이미지 (data URL 또는 외부 URL)
var _spineColor = '';      // 컨셉에서 추출한 책등 색상
var _backColor = '';       // 컨셉에서 추출한 표4 색상
var _coverTextColor = '';  // 배경 기반 글씨색 (#fff 또는 #111)
var _coverTextShadow = ''; // 배경 기반 텍스트 그림자
var _coverOverlay = '';    // 배경 기반 오버레이 그래디언트

/** 표1 미리보기에 배경 이미지 적용 + 사이드바 썸네일 표시 */
function _applyBgToPreview(url) {
  _coverBgUrl = url;
  var c1 = document.getElementById('p17_pv_c1');
  if (c1) {
    if (url) {
      c1.style.backgroundImage = 'url(' + url + ')';
      c1.style.backgroundSize = 'cover';
      c1.style.backgroundPosition = 'center';
      c1.classList.add('p17-has-bg');
    } else {
      c1.style.backgroundImage = '';
      c1.classList.remove('p17-has-bg');
    }
  }
  p17_update();
}

/** 배경 제거 */
function p17_clearBg() {
  _spineColor = '';
  _backColor = '';
  _coverTextColor = '';
  _coverTextShadow = '';
  _coverOverlay = '';
  _applyBgToPreview(''); // 내부에서 p17_update() 호출
  var ra = document.getElementById('p17_resultArea');
  if (ra) ra.style.display = 'none';
  var st = document.getElementById('p17_bgStatus');
  if (st) st.textContent = '배경 제거됨';
}

/** 컨셉 palette 문자열에서 HEX 색상 추출 */
function _extractColors(paletteStr) {
  if (!paletteStr) return [];
  var m = paletteStr.match(/#[0-9a-fA-F]{3,8}/g);
  return m ? m : [];
}

/** HEX → 상대 휘도 (0~1) */
function _luminance(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  var r = parseInt(hex.substr(0,2),16)/255;
  var g = parseInt(hex.substr(2,2),16)/255;
  var b = parseInt(hex.substr(4,2),16)/255;
  // sRGB → 선형
  r = r <= 0.03928 ? r/12.92 : Math.pow((r+0.055)/1.055, 2.4);
  g = g <= 0.03928 ? g/12.92 : Math.pow((g+0.055)/1.055, 2.4);
  b = b <= 0.03928 ? b/12.92 : Math.pow((b+0.055)/1.055, 2.4);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}

/** 배경색 기준 최적 글씨색 반환 (#fff 또는 #111) */
function _textColorFor(bgHex) {
  return _luminance(bgHex) > 0.4 ? '#111' : '#fff';
}

/** 배경색 기준 최적 그림자 반환 */
function _textShadowFor(bgHex) {
  return _luminance(bgHex) > 0.4
    ? '0 1px 3px rgba(255,255,255,.5)'
    : '1px 1px 4px rgba(0,0,0,.6)';
}

/** 배경색 기준 오버레이 그래디언트 반환 */
function _overlayFor(bgHex) {
  if (_luminance(bgHex) > 0.4) {
    // 밝은 배경 → 반투명 흰 오버레이
    return 'linear-gradient(180deg,rgba(255,255,255,.25) 0%,rgba(255,255,255,.05) 40%,rgba(255,255,255,.3) 100%)';
  }
  // 어두운 배경 → 반투명 검정 오버레이
  return 'linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.1) 40%,rgba(0,0,0,.45) 100%)';
}

/** 결과 영역 표시 + 표1/책등/표4 적용 + 스크롤 + 하이라이트 */
function _showResult(imgUrl, modelUsed) {
  var ra = document.getElementById('p17_resultArea');
  var thumb = document.getElementById('p17_bgThumb');
  var modelEl = document.getElementById('p17_resultModel');
  if (ra) ra.style.display = 'block';
  if (thumb) thumb.src = imgUrl;
  if (modelEl) modelEl.textContent = modelUsed;

  // 컨셉에서 팔레트 색상 추출 → 책등/표4에 적용 + 상태 저장
  var colors = [];
  if (typeof p17_getSelectedConcept === 'function') {
    var sc = p17_getSelectedConcept();
    if (sc && sc.palette) colors = _extractColors(sc.palette);
  }
  // Vision 분석 JSON에서도 색상 추출 (컨셉 미선택 시)
  if (colors.length === 0 && typeof p17_getRefAnalysis === 'function') {
    var ra2 = p17_getRefAnalysis();
    if (ra2 && ra2.color_palette) colors = _extractColors(String(ra2.color_palette));
  }
  if (colors.length > 0) {
    _spineColor = colors[0];
    _backColor = colors.length > 1 ? colors[1] : colors[0];
  }

  // 팔레트 주요 색상 기준 글씨색 결정
  var dominantColor = colors.length > 0 ? colors[0] : '#333333';
  _coverTextColor = _textColorFor(dominantColor);
  _coverTextShadow = _textShadowFor(dominantColor);
  _coverOverlay = _overlayFor(dominantColor);

  // 미리보기로 스크롤 + 하이라이트
  p17_scrollToPreview();
  var c1 = document.getElementById('p17_pv_c1');
  if (c1) {
    c1.classList.add('p17-highlight');
    setTimeout(function() { c1.classList.remove('p17-highlight'); }, 2000);
  }
}

/** 미리보기 영역으로 스크롤 */
function p17_scrollToPreview() {
  var pv = document.getElementById('p17_coverPreview');
  if (pv) pv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** 생성된 배경 이미지 다운로드 */
function p17_downloadBg() {
  if (!_coverBgUrl) { alert('다운로드할 배경 이미지가 없습니다.'); return; }
  var a = document.createElement('a');
  var d = _getData();
  a.download = (d.title || '표지') + '_배경.png';
  if (_coverBgUrl.startsWith('data:')) {
    a.href = _coverBgUrl;
  } else {
    // 외부 URL — fetch로 blob 변환
    fetch(_coverBgUrl).then(function(r){ return r.blob(); }).then(function(blob){
      var url = URL.createObjectURL(blob);
      a.href = url; a.click(); URL.revokeObjectURL(url);
    }).catch(function(){ window.open(_coverBgUrl, '_blank'); });
    return;
  }
  a.click();
}

/** 사용자 배경 이미지 업로드 */
function p17_uploadBg(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    _applyBgToPreview(e.target.result);
    var st = document.getElementById('p17_bgStatus');
    if (st) st.textContent = '✓ ' + file.name + ' 적용됨';
  };
  reader.readAsDataURL(file);
  input.value = ''; // 같은 파일 재선택 가능
}

/** 미리보기 캡처 → PNG 다운로드 */
async function p17_capturePreview() {
  var cover = document.getElementById('p17_coverPreview');
  if (!cover) { alert('미리보기 영역을 찾을 수 없습니다'); return; }

  _setStatus('미리보기 캡처 중…');
  try {
    if (typeof html2canvas === 'undefined') {
      await new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    var canvas = await html2canvas(cover, {
      scale: 3, useCORS: true, allowTaint: true, backgroundColor: null, logging: false
    });
    var a = document.createElement('a');
    var d = _getData();
    a.download = (d.title || '표지') + '_시안.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    _setStatus('캡처 완료');
  } catch(e) {
    alert('캡처 실패: ' + e.message);
    _setStatus('캡처 실패');
  }
}

// ──────────────────────────────────────────────
// OpenAI GPT Image 표지 디자인 생성
// ──────────────────────────────────────────────
function _getOpenAiKey() {
  // panel11 개발자 콘솔에서 저장한 키 또는 localStorage
  try { return localStorage.getItem('p17_openai_key') || localStorage.getItem('p11_openai_key') || ''; }
  catch(e) { return ''; }
}

async function p17_genDesign() {
  var apiKey = _getOpenAiKey();
  if (!apiKey) {
    alert('OpenAI API 키가 설정되지 않았습니다.\n\n개발자 콘솔(Ctrl+Alt+Enter)의 API 키 탭에서\nOpenAI API 키를 등록하세요.\n\n또는 브라우저 콘솔에서:\nlocalStorage.setItem("p17_openai_key", "sk-...")');
    return;
  }

  var d = _getData();
  if (!d.title) { alert('표1의 제목을 먼저 입력하세요.'); return; }

  var btn = document.getElementById('p17_aiBtn');
  var genStatus = document.getElementById('p17_genStatus');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="p17-spin"></span> 생성 중…'; }
  if (genStatus) genStatus.textContent = '프롬프트 조립 중…';

  // ── Step 2: 프롬프트 조립 ──
  // Vision 분석 JSON(Step 1)이 있으면 문장 단위로 조립, 없으면 책 정보 기반 폴백
  var conceptExtra = (typeof p17_getConceptPrompt === 'function')
    ? p17_getConceptPrompt() : '';

  var prompt = '';
  if (conceptExtra) {
    // Step 1 분석 결과 또는 컨셉 기반 프롬프트
    prompt = 'REQUIREMENTS:\n' +
      'Book cover background for "' + d.title + '"' +
      (d.subtitle ? ' — ' + d.subtitle : '') + '.\n' +
      'Do NOT include any text, letters, numbers, or words.\n' +
      'This is a vertical/portrait book cover (2:3 ratio). Leave some breathing room for title text overlay.\n\n' +
      conceptExtra;
  } else {
    // 폴백: 책 정보만으로 프롬프트 생성 (Step 1 없이)
    prompt = 'You are a world-class book cover designer.\n' +
      'Create a background illustration for a Korean IT/tech book cover.\n\n' +
      'BOOK INFO:\n' +
      '- Title: "' + d.title + '"\n' +
      (d.subtitle ? '- Subtitle: "' + d.subtitle + '"\n' : '') +
      '- Keywords: ' + (d.keywords || d.title) + '\n\n' +
      'RULES:\n' +
      '- Do NOT include any text, letters, numbers, or words.\n' +
      '- This is a vertical/portrait book cover (2:3 ratio). Leave some breathing room for title text overlay.\n' +
      '- Choose visual style that matches the book topic.\n' +
      '- Quality: premium, editorial, bookstore-shelf worthy.';
  }

  prompt += '\n\nCRITICAL: Do NOT include any text, letters, numbers, or words in the image.';

  // 로깅
  console.log('[Step 2] 최종 프롬프트:');
  console.log(prompt);

  try {
    // gpt-image-1 → dall-e-3 폴백
    var imgUrl = '';
    var modelUsed = '';
    var attempts = [
      { model: 'gpt-image-1', size: '1024x1536', quality: 'high' },
      { model: 'dall-e-3', size: '1024x1792', quality: 'hd' }
    ];

    for (var ai = 0; ai < attempts.length; ai++) {
      var cfg = attempts[ai];
      if (btn) btn.innerHTML = '<span class="p17-spin"></span> ' + cfg.model;
      if (genStatus) genStatus.textContent = cfg.model + ' 이미지 생성 중… (30초~1분 소요)';
      try {
        var res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({ model: cfg.model, prompt: prompt, n: 1, size: cfg.size, quality: cfg.quality })
        });

        if (res.status === 401) throw new Error('API 키가 유효하지 않습니다.');
        if (res.status === 429) throw new Error('요청 한도 초과 — 잠시 후 재시도하세요.');

        if (!res.ok) {
          var errBody = await res.text();
          console.warn('[panel17] ' + cfg.model + ' 실패:', errBody.slice(0, 200));
          if (ai < attempts.length - 1) continue;
          throw new Error('API 오류 (' + res.status + '): ' + errBody.slice(0, 200));
        }

        var data = await res.json();
        if (data.data && data.data[0]) {
          imgUrl = data.data[0].url || (data.data[0].b64_json ? 'data:image/png;base64,' + data.data[0].b64_json : '');
        }
        if (imgUrl) { modelUsed = cfg.model; break; }
      } catch(e2) {
        if (e2.message.includes('API 키') || e2.message.includes('한도')) throw e2;
        if (ai < attempts.length - 1) { console.warn('[panel17] ' + cfg.model + ' 폴백:', e2.message); continue; }
        throw e2;
      }
    }
    if (!imgUrl) throw new Error('이미지를 받지 못했습니다.');

    // 미리보기 표1에 배경 직접 적용
    _applyBgToPreview(imgUrl);
    _showResult(imgUrl, modelUsed);
  } catch(e) {
    alert('표지 디자인 생성 오류:\n' + e.message);
    _setStatus('생성 실패');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = 'AI 배경 생성'; }
  if (genStatus) genStatus.textContent = '';
}

// ──────────────────────────────────────────────
// 초기화
// ──────────────────────────────────────────────
_loadData();
_renderThemes();
_renderLayouts();
p17_update();

// ──────────────────────────────────────────────
// window 노출
// ──────────────────────────────────────────────
window.p17_getData = _getData;
window.p17_switchTab = p17_switchTab;
window.p17_update = p17_update;
window.p17_save = p17_save;
window.p17_exportText = p17_exportText;
window.p17_genDesign = p17_genDesign;
window.p17_reset = p17_reset;
window.p17_applyTheme = p17_applyTheme;
window.p17_setH = p17_setH;
window.p17_clearBg = p17_clearBg;
window.p17_scrollToPreview = p17_scrollToPreview;
window.p17_downloadBg = p17_downloadBg;
window.p17_capturePreview = p17_capturePreview;

if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(17, { onActivate: function(){ p17_update(); } });
}

})();
