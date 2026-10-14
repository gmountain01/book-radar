(function(){
/* ══════════════════════════════════════════════════════
   panel13 — 컨셉 작성
   도서 기획의 첫 단계: 핵심 콘셉트를 정리하는 구조화된 폼
   ══════════════════════════════════════════════════════ */
var ROOT = document.getElementById('panel13');
if (!ROOT) return;

var LS_KEY = 'ms_concept_v2';
var data = {};

// 컨셉 ID — 교정·구조 검토가 '어느 책의 프로필'에 연결됐는지 구별하는 고정 값.
// 규칙: 저장된 컨셉에 ID가 없으면 불러올 때 한 번만 부여해 저장, 편집·저장·다시 열기에는 유지, '초기화'로 새 책을 시작할 때만 새로 부여.
// 한계: 기존 컨셉 내용을 덮어써 다른 책으로 쓰면 ID가 같아 자동 구별 못 함(내용 지문 변경으로만 표시).
function newConceptId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ensureConceptId() { if (!data.conceptId) { data.conceptId = newConceptId(); save(); } return data.conceptId; }
var PROFILE_KEYS = ['field', 'purpose', 'editPolicy', 'protect', 'factBasis', 'changeLevel', 'limits'];
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) { console.warn('[panel13] save: localStorage 저장 실패', e); } }
function load() {
  try { var r = localStorage.getItem(LS_KEY); if (r) data = JSON.parse(r); } catch(e) { console.warn('[panel13] load: localStorage 로드/파싱 실패, 기본값 사용', e); }
  if (!localStorage.getItem(LS_KEY)) data = _defaults(); // 저장값이 없을 때만 샘플 — 제목만 비워도 샘플로 덮이던 문제 방지
  if (!data || typeof data !== 'object') data = _defaults();
  PROFILE_KEYS.forEach(function(k) { if (data[k] === undefined) data[k] = ''; }); // 옛 저장값: 프로필 칸은 '미지정'(빈값)
  ensureConceptId();
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
    memo: '- 각 장 끝에 "혼자 해보기" 도전 과제 포함\n- QR 코드로 예제 코드/완성본 바로 접근\n- 독자 커뮤니티(Discord) 운영 계획',
    // 샘플 컨셉은 IT 책이라 분야를 채운다. 새로 시작하는 컨셉은 비워 두고(미지정) 사람이 정한다 — 자동으로 IT로 분류하지 않는다
    field: 'IT/프로그래밍', purpose: '입문 학습(실습 중심)', editPolicy: '', protect: '코드·명령어·URL·제품명', factBasis: '', changeLevel: '', limits: ''
  };
}

function _field(id, label, placeholder, type, rows, options) {
  var val = escHtml(data[id] || '');
  if (type === 'select') {
    return '<div class="cp-field"><label class="cp-label">' + label + '</label>' +
      '<select class="cp-input" id="cp_' + id + '" onchange="cpUpdate(\'' + id + '\',this.value)">' +
      options.map(function(o) { return '<option value="' + escHtml(o) + '"' + (o === (data[id] || '') ? ' selected' : '') + '>' + (o ? escHtml(o) : placeholder) + '</option>'; }).join('') +
      '</select></div>';
  }
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
        '<div class="cp-section"><div class="cp-section-title">편집 프로필 <small style="font-weight:400;color:#777">— 교정 도우미·원고 구조 검토의 AI 검사 기준으로 전달됩니다(원고에서 직접 연결했을 때만)</small></div>' +
          _field('field', '분야·세부 분야', '예: IT/프로그래밍, 인문/역사, 경영/실무, 문학/소설 — 비우면 AI가 원고에서 추정(추정 표시)', 'input') +
          _field('purpose', '목적', '예: 입문 학습, 전문가 참고, 논증 이해, 서사 감상 — 비우면 추정', 'input') +
          _field('editPolicy', '편집 방침', '출판사 표기 기준·저자 문체·용어집·허용어 — 비우면 기본 정책(AI가 추정하지 않음)', 'textarea', 2) +
          _field('protect', '보호 영역', '예: 코드·명령어·수식·URL·직접 인용·고유명사·의도된 구어 — 비우면 기본 정책', 'textarea', 2) +
          _field('factBasis', '사실 검증 기준', '예: 공식 문서 v2.1(2026-03), 원전 ○○ 번역본 — 비우면 기술 사실은 확인 보류', 'input') +
          _field('changeLevel', '변경 허용 수준', '미지정(기본 정책)', 'select', 0, ['', '명백한 오류 수정', '문맥 검토', '선택적 윤문', '저자 확인']) +
          _field('limits', '알려진 제한', '예: 원고 일부만 제공, 표·그림 누락, 출처 미제공', 'textarea', 2) +
          '<div class="cp-sub" style="margin-top:6px">컨셉 ID <code>' + escHtml(data.conceptId || '') + '</code> — 교정·구조 검토가 이 컨셉을 연결할 때 쓰는 값. 초기화하면 새 ID가 생깁니다.</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
        '<button class="cp-dl-btn" onclick="cpAiDraft()" style="background:var(--accent,#4F46B8);color:#fff;">✨ AI 초안</button>' +
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
  var x = docxEsc;
  var body = '';
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
    ['자유 메모', data.memo],
    ['분야·세부 분야', data.field], ['목적', data.purpose], ['편집 방침', data.editPolicy], ['보호 영역', data.protect],
    ['사실 검증 기준', data.factBasis], ['변경 허용 수준', data.changeLevel], ['알려진 제한', data.limits]
  ];

  fields.forEach(function(f) {
    var label = f[0], val = (f[1] || '').trim();
    if (!val) return;
    body += '<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="3B3F8C"/></w:rPr><w:t>[' + x(label) + ']</w:t></w:r></w:p>';
    val.split('\n').forEach(function(line) {
      body += '<w:p><w:r><w:t xml:space="preserve">' + x(line) + '</w:t></w:r></w:p>';
    });
    body += '<w:p/>';
  });

  try {
    buildDocx(body, (data.title || '도서컨셉').replace(/[^\w가-힣]/g, '_').slice(0, 30) + '_컨셉.docx');
  } catch(e) { console.warn('[panel13] DOCX 내보내기 실패', e); alert('DOCX 내보내기 실패: ' + e.message); }
};

window.cpAiDraft = async function() {
  var apiKey = typeof loadApiKey === 'function' ? await loadApiKey() : '';
  if (!apiKey) { alert('통합현황 또는 개발자 콘솔에서 Claude API 키를 설정해주세요.'); return; }
  var title = data.title || '';
  if (!title) { alert('도서 제목(가제)을 먼저 입력해주세요.'); return; }

  // 기획 보드/키워드 데이터 수집
  var context = '';
  if (window._kwDisplayedCards && window._kwDisplayedCards.length) {
    context += '[키워드 분석 데이터]\n';
    window._kwDisplayedCards.slice(0, 5).forEach(function(c) {
      context += '- ' + c.keyword + ' (' + (c.pick_type || '') + '): ' + (c.reason || '').substring(0, 80) + '\n';
    });
    context += '\n';
  }
  if (window._p25_exportData && window._p25_exportData.summary) {
    context += '[기획 보드 종합 의견]\n' + window._p25_exportData.summary + '\n\n';
  }

  var prompt = '아래 도서 제목으로 컨셉 기획서 초안을 작성하라.\n\n';
  prompt += '도서 제목(가제): ' + title + '\n';
  if (data.subtitle) prompt += '부제: ' + data.subtitle + '\n';
  if (context) prompt += '\n' + context;
  prompt += '\n아래 JSON 형식으로만 답하라. 다른 말 없이 JSON만.\n';
  prompt += '{"oneLiner":"한줄 콘셉트","reader":"대상 독자 (직급/경력/상황 구체적)","problem":"독자가 겪는 문제 3가지 (줄바꿈으로 구분)","solution":"이 책의 해결책 3가지","diff":"기존 도서와의 차별점","scope":"다루는 범위","notScope":"다루지 않는 범위","tone":"문체/톤 제안","keywords":"핵심 키워드 5개 (쉼표 구분)"}\n';
  prompt += '\n[글쓰기 원칙] AI투 문장 금지. 편집자가 기획회의에서 쓰는 말투로. 구체적 수치와 사례 포함.';

  if (!confirm('AI가 빈 필드를 자동으로 채웁니다.\n이미 작성한 필드는 유지됩니다.\n\n진행하시겠습니까?')) return;

  try {
    showToast('AI 초안 생성 중…', 'blue');
    var raw = await callClaudeApi({ apiKey: apiKey, model: 'claude-haiku-4-5-20251001', prompt: prompt, system: '출판 기획 편집자(분야: ' + (data.field || '미정 — IT로 가정하지 말 것') + '). 한국어.', maxTokens: 2000, noPersona: true }); // 분야는 사람이 정한다(초안 JSON에 field 없음)
    var jsonStr = (raw || '').replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    var m = jsonStr.match(/\{[\s\S]*\}/);
    if (m) jsonStr = m[0];
    var result = JSON.parse(jsonStr);
    // 빈 필드만 채우기
    var filled = 0;
    Object.keys(result).forEach(function(k) {
      if (result[k] && !data[k]) { data[k] = result[k]; filled++; }
    });
    save();
    render();
    showToast('AI 초안 ' + filled + '개 필드 완성', 'green');
  } catch (e) {
    console.error('[panel13] AI 초안 실패:', e);
    showToast('AI 초안 생성 실패: ' + e.message, 'red');
  }
};

window.cpReset = function() {
  if (!confirm('모든 컨셉 내용을 삭제합니다.\n계속하시겠습니까?')) return;
  data = { title:'', subtitle:'', oneLiner:'', problem:'', solution:'', reader:'', diff:'', keywords:'', tone:'', scope:'', notScope:'', memo:'',
    field:'', purpose:'', editPolicy:'', protect:'', factBasis:'', changeLevel:'', limits:'', conceptId: newConceptId() }; // 새 책 = 새 ID
  save();
  render();
};
// 테스트·다른 패널용: 컨셉 ID 규칙을 밖에서 확인할 수 있게
window.P13 = { load: load, save: save, data: function() { return data; }, ensureConceptId: ensureConceptId, newConceptId: newConceptId,
  resetNoConfirm: function() { var c = window.confirm; window.confirm = function() { return true; }; try { window.cpReset(); } finally { window.confirm = c; } } };

var _init13 = false;
function initPanel13() {
  if (!_init13) { _init13 = true; }
  load(); // 매 활성화 시 리로드 (외부 변경 감지)
  render();
}

if (typeof PanelRegistry !== 'undefined') PanelRegistry.register(13, { onActivate: initPanel13 });
window._initPanel13 = initPanel13;
})();
