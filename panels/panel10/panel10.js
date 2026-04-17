(function(){
/* ══════════════════════════════════════════════════════
   panel10 — IT/AI 출판 키워드 도출기
   IIFE 래핑 — 전역 오염 방지
   ══════════════════════════════════════════════════════ */

var ROOT = document.getElementById('panel10');
function $(id) { return document.getElementById(id); }
function $$(sel) { return ROOT.querySelectorAll(sel); }

/* ═══════════════════════════════════════════
   YouTube API 키 — 유튜버 분석(panel7)과 동일한 6개 키
   할당량 소진 시 자동 순환
   ═══════════════════════════════════════════ */
var KW_YT_KEYS = typeof YT_API_KEYS_SHARED !== 'undefined' ? YT_API_KEYS_SHARED : [
  'AIzaSyDNjvfk8ZYRPumWeHCY9Axgswd80vHHSKo','AIzaSyChNq2hCvxPC6gN9oNi1gw5hTTJqGGaR6c',
  'AIzaSyB3scxbgQ5zR1-bhNfD6qWxuOky8uIRXgM','AIzaSyC-ynVQpZgd1b6-PLVrwqOteA6aXPruQAc',
  'AIzaSyDQYU8o3Oaa-anZ5PZqRzLvbFJifOU1bis','AIzaSyAVKzuZ2Wr9G6xQE687ZEypnPx6FadAvoc'
];
var _kwYtKeyIdx = 0;
var _kwYtExhausted = new Set();

function _getYtKey() {
  for (var i = 0; i < KW_YT_KEYS.length; i++) {
    var idx = (_kwYtKeyIdx + i) % KW_YT_KEYS.length;
    if (!_kwYtExhausted.has(idx)) { _kwYtKeyIdx = idx; return KW_YT_KEYS[idx]; }
  }
  // 모든 키 소진 → 첫 번째 키로 재시도
  _kwYtExhausted.clear();
  _kwYtKeyIdx = 0;
  return KW_YT_KEYS[0];
}

function _markYtKeyExhausted() {
  _kwYtExhausted.add(_kwYtKeyIdx);
  _kwYtKeyIdx = (_kwYtKeyIdx + 1) % KW_YT_KEYS.length;
}

/* ═══════════════════════════════════════════
   Globals & Constants
   ═══════════════════════════════════════════ */
var activeCats = new Set();
var aladinData = [];     // yes24 베스트셀러 (app.js getKwBestRows에서 자동 로드)
var lectureData = [];    // 패스트캠퍼스 강의 (app.js getKwLectureRows에서 자동 로드)
var lastCards = [];
var lastCatData = {};

var CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
var TAXONOMY_VERSION = 'v5';
var TAXONOMY_CACHE_KEY = 'kw_taxonomy_v6';  // 동적 생성 캐시 (7일 TTL)
var TAXONOMY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// L1 대분류별 색상/클래스 순환 할당
var L1_STYLES = [
  { color: '#4f46b8', cls: 'cat-ai' },
  { color: '#c23d2f', cls: 'cat-profit' },
  { color: '#3a6e1a', cls: 'cat-dev' },
  { color: '#b85a00', cls: 'cat-tool' },
  { color: '#0e7490', cls: 'cat-data' },
  { color: '#1d4ed8', cls: 'cat-cloud' },
  { color: '#065f46', cls: 'cat-prod' }
];

var KEYWORD_TAXONOMY = {
  '수익화': {
    color: '#c23d2f', cls: 'cat-profit',
    l2: {
      'AI콘텐츠': { l3: {
        'Midjourney':  { q: ['Midjourney 수익화 2025', 'AI 이미지 돈버는법', 'Midjourney 실전 활용'] },
        'Sora':        { q: ['Sora AI 영상 수익화 2025', 'Sora 영상 제작 수익', 'AI 영상 생성 수익'] },
        'AI글쓰기':    { q: ['AI 글쓰기 수익 2025', 'Claude 블로그 수익', 'AI 카피라이팅'] }
      }},
      'AI비즈니스': { l3: {
        'AI수익화':     { q: ['AI 수익화 방법 2025', 'AI 부업 수익', '생성형AI 수익 모델'] },
        'AI에이전시':   { q: ['AI 에이전시 창업', 'AI 프리랜서 수익', 'ChatGPT 대행업'] },
        'AI자동화수익': { q: ['업무자동화 수익', 'n8n 자동화 외주', 'AI 솔루션 판매'] }
      }}
    }
  },
  'AI기술': {
    color: '#4f46b8', cls: 'cat-ai',
    l2: {
      '에이전트': { l3: {
        'LangGraph':    { q: ['LangGraph 에이전트 구축', 'LangGraph 튜토리얼 2025', 'LangGraph 실전'] },
        'CrewAI':       { q: ['CrewAI 멀티에이전트', 'CrewAI 실전', 'CrewAI 튜토리얼'] },
        'MCP':          { q: ['MCP 프로토콜 개발 2025', 'Claude MCP 서버 구축', 'MCP 연동'] },
        'GoogleADK':    { q: ['Google ADK AI 에이전트', 'Gemini ADK 개발', 'Google ADK 튜토리얼'] },
        'RAG':          { q: ['RAG 실전 2025', 'RAG 벡터DB 구축', 'RAG 파이프라인'] }
      }},
      'LLM': { l3: {
        'Claude':       { q: ['Claude AI 활용 2025', 'Claude 실전 사용법', 'Claude vs GPT 비교'] },
        'GPT':          { q: ['GPT-4.5 활용법 2025', 'ChatGPT 실전 활용', 'OpenAI GPT 최신'] },
        'Gemini':       { q: ['Gemini 2.5 Pro 활용', 'Google Gemini 실전', 'Gemini AI 비교'] },
        'DeepSeek':     { q: ['DeepSeek R1 성능', 'DeepSeek 사용법', 'DeepSeek 오픈소스'] },
        'Llama':        { q: ['Llama 4 설치 사용법', 'Meta Llama 한국어', 'Llama 오픈소스 LLM'] },
        '파인튜닝':     { q: ['LLM 파인튜닝 2025', 'LoRA PEFT 실습', '한국어 LLM 커스텀'] }
      }},
      '생성형AI': { l3: {
        'ComfyUI':     { q: ['ComfyUI 워크플로우 2025', 'ComfyUI 실전', 'ComfyUI 이미지 생성'] },
        'Flux':        { q: ['Flux 이미지 생성 2025', 'Flux AI 실습', 'Flux vs Midjourney'] },
        'Kling':       { q: ['Kling AI 영상 생성', 'Kling AI 실전', 'Kling 영상 제작'] },
        'ElevenLabs':  { q: ['ElevenLabs 음성 복제', 'ElevenLabs TTS', 'AI 음성 생성'] }
      }}
    }
  },
  '개발': {
    color: '#3a6e1a', cls: 'cat-dev',
    l2: {
      'AI코딩': { l3: {
        '바이브코딩':   { q: ['바이브코딩 입문 2025', '바이브코딩 앱 제작', '비개발자 AI 코딩'] },
        'Cursor':       { q: ['Cursor AI 코딩 실전', '커서 AI 사용법', 'Cursor 프로젝트'] },
        'Windsurf':     { q: ['Windsurf AI IDE', '윈드서프 코딩', 'Windsurf vs Cursor'] },
        'ClaudeCode':   { q: ['Claude Code 실무', '클로드코드 활용', 'Claude Code 에이전트'] },
        'Cline':        { q: ['Cline AI VSCode', 'Cline 코딩 도구', 'Cline 사용법'] },
        'Devin':        { q: ['Devin AI 자율 개발', '데빈 AI 코딩', 'AI 소프트웨어 엔지니어'] }
      }},
      '앱빌더': { l3: {
        'Bolt.new':     { q: ['Bolt.new 앱 만들기', '볼트뉴 풀스택', 'Bolt.new 사용법'] },
        'Lovable':      { q: ['Lovable 앱 빌더', 'Lovable AI 사용법', 'Lovable vs Bolt'] },
        'Replit':       { q: ['Replit 에이전트 코딩', 'Replit AI 앱', 'Replit 사용법'] },
        'FastAPI':      { q: ['FastAPI 실전 2025', 'FastAPI LLM 서비스', 'Python AI 백엔드'] }
      }}
    }
  },
  '자동화': {
    color: '#b85a00', cls: 'cat-tool',
    l2: {
      '워크플로우': { l3: {
        'n8n':          { q: ['n8n 자동화 실전 2025', 'n8n AI 에이전트 구축', 'n8n 업무자동화'] },
        'Make':         { q: ['Make 자동화 입문 2025', 'Make 시나리오 구축', 'Make vs Zapier'] },
        'Zapier':       { q: ['Zapier AI 자동화 2025', 'Zapier 노코드 연동', 'Zapier 실전'] },
        'Activepieces': { q: ['Activepieces 오픈소스', 'Activepieces vs n8n', '셀프호스트 자동화'] }
      }},
      'AI플랫폼': { l3: {
        'Dify':         { q: ['Dify AI 플랫폼 구축', 'Dify 노코드 AI', 'Dify 챗봇 개발'] },
        'Flowise':      { q: ['Flowise 노코드 AI', 'Flowise 챗봇', 'Flowise 튜토리얼'] },
        'Copilot':      { q: ['Microsoft Copilot 활용', 'Copilot 업무 자동화', 'Copilot 실전'] }
      }}
    }
  },
  '데이터': {
    color: '#0e7490', cls: 'cat-data',
    l2: {
      '분석': { l3: {
        'Polars':       { q: ['Polars 데이터분석', 'Polars vs Pandas', 'Polars 실전'] },
        'DuckDB':       { q: ['DuckDB 분석 2025', 'DuckDB SQL', 'DuckDB 실전'] },
        'Pandas':       { q: ['Pandas 데이터분석 2025', 'Python Pandas 실전', 'Pandas 고급'] },
        'Streamlit':    { q: ['Streamlit 데이터앱', 'Streamlit 대시보드', 'Streamlit 실전'] }
      }},
      'MLOps': { l3: {
        'Ollama':       { q: ['Ollama 로컬 LLM 설치', 'Ollama 사용법', 'Ollama 실전'] },
        'vLLM':         { q: ['vLLM 배포 튜토리얼', 'vLLM 서빙', 'vLLM 실전'] },
        'Modal':        { q: ['Modal 서버리스 GPU', 'Modal AI 배포', 'Modal 실전'] }
      }}
    }
  },
  '인프라': {
    color: '#1d4ed8', cls: 'cat-cloud',
    l2: {
      '클라우드': { l3: {
        'AWS':          { q: ['AWS AI 서비스 2025', 'AWS 서버리스', 'AWS 솔루션 아키텍트'] },
        'GCP':          { q: ['GCP AI 플랫폼', 'Google Cloud 실전', 'GCP 튜토리얼'] },
        'Azure':        { q: ['Azure OpenAI 서비스', 'Azure AI 실전', 'Azure 클라우드'] }
      }},
      'DevOps': { l3: {
        '쿠버네티스':   { q: ['쿠버네티스 실전 2025', 'K8s AI 워크로드', 'K8s 운영'] },
        'GitHubActions':{ q: ['GitHub Actions 실전', 'GitHub CI/CD', 'GitHub Actions 자동화'] },
        'Docker':       { q: ['Docker 실전 2025', 'Docker 컨테이너', 'Docker AI 배포'] }
      }}
    }
  },
  '생산성': {
    color: '#065f46', cls: 'cat-prod',
    l2: {
      '지식관리': { l3: {
        '옵시디언':     { q: ['옵시디언 PKM 2025', '옵시디언 AI 플러그인', '제2의 뇌 옵시디언'] },
        'NotionAI':     { q: ['Notion AI 자동화 2025', 'Notion 시스템 고도화', 'Notion AI 실전'] }
      }},
      '디자인': { l3: {
        '피그마':       { q: ['피그마 AI 기능 2025', '피그마 디자인 시스템', 'Figma AI'] },
        'Canva':        { q: ['Canva AI 실전 2025', 'Canva 디자인 자동화', 'Canva AI 활용'] }
      }}
    }
  }
};

function getL1Class(l1) { return (KEYWORD_TAXONOMY[l1] || {}).cls || 'cat-ai'; }
function getL1Color(l1) { return (KEYWORD_TAXONOMY[l1] || {}).color || '#4f46b8'; }
function kwLog() {}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ═══════════════════════════════════════════
   Tab Switching (scoped)
   ═══════════════════════════════════════════ */
function switchResultTab(btn) {
  var tabId = btn.dataset.tab;
  $$('.kw-tab-btn').forEach(function(b) { b.classList.remove('active'); });
  $$('.kw-tab-panel').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  $(tabId).classList.add('active');
  if (tabId === 'kwTabGraph' && lastCards.length) renderD3Graph(lastCards, lastCatData);
  if (tabId === 'kwTabChart' && lastCards.length) renderCharts(lastCards, lastCatData);
}
window.kwSwitchResultTab = switchResultTab;

/* ═══════════════════════════════════════════
   대시보드 데이터 로드
   — app.js의 bestRows / lectureRows를 aladinData / lectureData에 복사
   ═══════════════════════════════════════════ */
function loadDashboardData() {
  var bestRows = typeof window.getKwBestRows === 'function' ? window.getKwBestRows() : [];
  var lecRows  = typeof window.getKwLectureRows === 'function' ? window.getKwLectureRows() : [];
  // bestRows: {rank, title, pub, sp, year} → aladinData 키 형식으로 변환
  aladinData = bestRows.map(function(r) {
    return { '상품명': r.title || '', '출판사/제작사': r.pub || '', '세일즈포인트': r.sp || 0 };
  });
  // lectureRows: {service, cat1, cat2, title, pop}
  lectureData = lecRows;
}

/* ═══════════════════════════════════════════
   연결 / 데이터 상태 표시
   — Claude: 통합현황 패널(loadApiKey) 재사용
   — YouTube: 유튜버 분석 패널 6개 키 재사용
   — yes24/패스트캠퍼스: 통합현황 탭 로드 데이터 재사용
   ═══════════════════════════════════════════ */
async function showApiKeyStatus() {
  var el = $('kwApiStatus');
  if (!el) return;
  var claudeKey = typeof loadApiKey === 'function' ? await loadApiKey() : '';
  var ytCount = KW_YT_KEYS.length - _kwYtExhausted.size;
  var claudeOk = claudeKey && claudeKey.startsWith('sk-');
  var bestOk = aladinData.length > 0;
  var lecOk  = lectureData.length > 0;
  el.innerHTML =
    '<span style="color:' + (claudeOk ? '#0c7a5e' : '#c23d2f') + ';">' +
    (claudeOk ? '✓' : '✗') + ' Claude API</span><br>' +
    '<span style="color:#0c7a5e;">✓ YouTube ×' + ytCount + '</span><br>' +
    '<span style="color:' + (bestOk ? '#0c7a5e' : '#9b9890') + ';">' +
    (bestOk ? '✓' : '–') + ' 예스24 ' + (bestOk ? aladinData.length + '권' : '미로드') + '</span><br>' +
    '<span style="color:' + (lecOk ? '#0c7a5e' : '#9b9890') + ';">' +
    (lecOk ? '✓' : '–') + ' 패스트캠퍼스 ' + (lecOk ? lectureData.length + '강의' : '미로드') + '</span>';
  if (!claudeOk) {
    // 통합현황 탭으로 바로 이동하는 링크
    el.innerHTML += '<br><a href="#" onclick="event.preventDefault();window.switchTab(1,document.getElementById(\'tab1\'))" style="color:#c23d2f;font-size:10px;text-decoration:underline;cursor:pointer;">→ 통합현황에서 API 키 설정</a>';
  }
  if (!bestOk && !lecOk) {
    el.innerHTML += '<br><span style="color:#9b9890;font-size:10px;">통합현황에서 데이터 로드 시 분석 품질 향상</span>';
  }
}

/* ═══════════════════════════════════════════
   Taxonomy Tree UI
   ═══════════════════════════════════════════ */
function buildTaxTree() {
  var container = $('kwTaxTree');
  if (!container) return;
  var html = '';
  Object.keys(KEYWORD_TAXONOMY).forEach(function(l1) {
    var l1Data = KEYWORD_TAXONOMY[l1];
    html += '<div class="tax-l1"><div class="tax-l1-hdr" onclick="kwToggleL1(this)">';
    html += '<div class="tax-l1-dot" style="background:' + l1Data.color + '"></div>';
    html += '<span>' + l1 + '</span><span class="tax-l1-arrow">&#9658;</span></div>';
    html += '<div class="tax-l1-body">';
    Object.keys(l1Data.l2).forEach(function(l2) {
      html += '<div class="tax-l2"><div class="tax-l2-hdr" onclick="kwToggleL2(this)">';
      html += '<span>' + l2 + '</span><span class="tax-l2-arrow">&#9658;</span></div>';
      html += '<div class="tax-l2-body">';
      Object.keys(l1Data.l2[l2].l3).forEach(function(l3) {
        var key = l1 + '|' + l2 + '|' + l3;
        var active = activeCats.has(key) ? ' active' : '';
        var isCustom = l1Data.l2[l2].l3[l3]._custom ? ' custom' : '';
        var delBtn = isCustom
          ? '<span class="tax-del-btn" onclick="kwTaxDeleteCustomL3(\'' + escHtml(l1) + '\',\'' + escHtml(l2) + '\',\'' + escHtml(l3) + '\',event)">\u2715</span>'
          : '';
        html += '<span class="tax-leaf' + active + isCustom + '" data-path="' + key + '" onclick="kwToggleLeaf(this)">' + escHtml(l3) + delBtn + '</span>';
      });
      html += '<span class="tax-add-btn" onclick="event.stopPropagation();kwTaxAddL3(\'' + escHtml(l1) + '\',\'' + escHtml(l2) + '\')">+ 추가</span>';
      html += '</div></div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
}

window.kwToggleL1 = function(el) { el.closest('.tax-l1').classList.toggle('open'); };
window.kwToggleL2 = function(el) { el.closest('.tax-l2').classList.toggle('open'); };
window.kwToggleLeaf = function(el) {
  var key = el.dataset.path;
  if (activeCats.has(key)) { activeCats.delete(key); el.classList.remove('active'); }
  else { activeCats.add(key); el.classList.add('active'); }
};

window.kwTaxSelectAll = function() {
  $$('.tax-leaf').forEach(function(el) { activeCats.add(el.dataset.path); el.classList.add('active'); });
};
window.kwTaxSelectNone = function() {
  activeCats.clear();
  $$('.tax-leaf').forEach(function(el) { el.classList.remove('active'); });
};

/* ═══════════════════════════════════════════
   Taxonomy Custom Additions
   ═══════════════════════════════════════════ */
var LS_KEY_CUSTOM_TAX = 'kw_custom_taxonomy';
function loadCustomTax() { try { return JSON.parse(localStorage.getItem(LS_KEY_CUSTOM_TAX)) || {}; } catch (_) { return {}; } }
function saveCustomTax(custom) { localStorage.setItem(LS_KEY_CUSTOM_TAX, JSON.stringify(custom)); }

function mergeCustomTax() {
  var custom = loadCustomTax();
  Object.keys(custom).forEach(function(key) {
    var parts = key.split('|');
    if (parts.length !== 3) return;
    var l1 = parts[0], l2 = parts[1], l3 = parts[2];
    var t = KEYWORD_TAXONOMY[l1];
    if (!t || !t.l2[l2]) return;
    if (!t.l2[l2].l3[l3]) {
      t.l2[l2].l3[l3] = { q: custom[key].q || [], _custom: true };
    } else {
      var existing = t.l2[l2].l3[l3].q;
      (custom[key].q || []).forEach(function(q) { if (existing.indexOf(q) === -1) existing.push(q); });
    }
  });
}

window.kwTaxAddL3 = function(l1, l2) {
  var modal = document.createElement('div');
  modal.className = 'tax-edit-modal';
  modal.innerHTML =
    '<div class="tax-edit-box">' +
      '<h3>' + escHtml(l1) + ' > ' + escHtml(l2) + '</h3>' +
      '<label>새 소분류(L3) 이름</label>' +
      '<input id="kwTaxNewL3Name" placeholder="예: Cursor AI" />' +
      '<label>YouTube 검색어 (쉼표로 구분)</label>' +
      '<input id="kwTaxNewL3Queries" placeholder="예: Cursor AI 코딩, Cursor 실전 개발" />' +
      '<div class="hint">검색어는 YouTube에서 영상을 찾는 데 사용됩니다</div>' +
      '<div class="tax-edit-btns">' +
        '<button class="btn-cancel" onclick="this.closest(\'.tax-edit-modal\').remove()">취소</button>' +
        '<button class="btn-ok" onclick="kwTaxSaveNewL3(\'' + escHtml(l1) + '\',\'' + escHtml(l2) + '\')">추가</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.querySelector('#kwTaxNewL3Name').focus();
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

window.kwTaxSaveNewL3 = function(l1, l2) {
  var name = document.getElementById('kwTaxNewL3Name').value.trim();
  var queries = document.getElementById('kwTaxNewL3Queries').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (!name) { alert('소분류 이름을 입력하세요'); return; }
  if (queries.length === 0) { alert('검색어를 하나 이상 입력하세요'); return; }
  var key = l1 + '|' + l2 + '|' + name;
  var custom = loadCustomTax();
  custom[key] = { q: queries };
  saveCustomTax(custom);
  var t = KEYWORD_TAXONOMY[l1];
  if (t && t.l2[l2]) {
    if (!t.l2[l2].l3[name]) t.l2[l2].l3[name] = { q: queries, _custom: true };
    else queries.forEach(function(q) { if (t.l2[l2].l3[name].q.indexOf(q) === -1) t.l2[l2].l3[name].q.push(q); });
  }
  activeCats.add(key);
  buildTaxTree();
  document.querySelector('.tax-edit-modal').remove();
  localStorage.removeItem('kw_last_result');
};

window.kwTaxDeleteCustomL3 = function(l1, l2, l3, e) {
  e.stopPropagation();
  if (!confirm('"' + l3 + '" 소분류를 삭제할까요?')) return;
  var key = l1 + '|' + l2 + '|' + l3;
  var custom = loadCustomTax();
  delete custom[key];
  saveCustomTax(custom);
  activeCats.delete(key);
  var t = KEYWORD_TAXONOMY[l1];
  if (t && t.l2[l2] && t.l2[l2].l3[l3] && t.l2[l2].l3[l3]._custom) delete t.l2[l2].l3[l3];
  buildTaxTree();
};

/* ═══════════════════════════════════════════
   동적 카테고리 생성
   — YouTube 광역 검색 → Claude로 L1>L2>L3 분류 체계 자동 생성
   ═══════════════════════════════════════════ */
async function generateTaxonomy(claudeKey) {
  // 1. 광역 YouTube 검색으로 최신 IT/AI 트렌드 수집
  var seeds = [
    'IT 강의 2025 최신', 'AI 도구 활용법 2025', '생성형AI 실전 활용',
    '프로그래밍 강좌 인기', 'AI 수익화 방법 2025', '코딩 자동화 최신'
  ];
  var titles = [];
  for (var si = 0; si < seeds.length; si++) {
    try {
      var vids = await fetchYT(seeds[si], _getYtKey());
      vids.forEach(function(v) { if (v.title) titles.push(v.title); });
    } catch (e) { /* 실패 시 해당 시드 skip */ }
  }

  // 2. 베스트셀러 + 강의 컨텍스트
  var bestCtx = aladinData.slice(0, 20).map(function(b) { return b['상품명']; }).filter(Boolean).join(', ');
  var lecCtx  = lectureData.slice(0, 15).map(function(l) { return l.title || ''; }).filter(Boolean).join(', ');

  // 3. Claude에 분류 체계 생성 요청
  var prompt =
    '당신은 IT/AI 출판 트렌드 전문가입니다. 아래 데이터를 분석하여 IT/AI 도서 출판 키워드 분류 체계를 생성하세요.\n\n' +
    '[최근 3개월 YouTube IT/AI 영상 제목]\n' + (titles.length ? titles.slice(0, 40).join('\n') : '데이터 없음') + '\n\n' +
    '[예스24 IT 베스트셀러]\n' + (bestCtx || '데이터 없음') + '\n\n' +
    '[패스트캠퍼스 강의]\n' + (lecCtx || '데이터 없음') + '\n\n' +
    '위 데이터 기반으로 출판 가치가 높은 IT/AI 키워드 분류 체계를 JSON으로 생성하세요.\n\n' +
    '반드시 순수 JSON 배열만 출력 (마크다운 없이):\n' +
    '[\n  {"l1":"대분류","l2":"중분류","l3":"소분류명","queries":["YouTube검색어1","YouTube검색어2","YouTube검색어3"]}\n]\n\n' +
    '규칙:\n' +
    '- L1: 5~7개 (예: AI기술/개발/자동화/데이터/수익화/생산성/인프라)\n' +
    '- 각 L1당 L2: 2~3개, 각 L2당 L3: 3~6개\n' +
    '- 총 L3: 최소 30개\n' +
    '- **L3는 반드시 한 단어 키워드** (제품명·기술명·도구명). 예: Cursor, n8n, RAG, 바이브코딩, DeepSeek, Ollama, Polars, MCP. 설명문(AI 코딩 도구, 워크플로우 자동화) 금지.\n' +
    '- queries: YouTube 한국어 검색어 3개 (구체적·롱테일)\n' +
    '- 2024~2025 최신 트렌드 반영\n' +
    '- 출판 가치 있는 실용 주제만\n' +
    '- 문자열 내 줄바꿈/큰따옴표 금지\n' +
    '- views/숫자값 없음';

  var raw = await callClaude(prompt, claudeKey);

  // 4. 파싱 → KEYWORD_TAXONOMY 형식으로 변환
  var start = raw.indexOf('['); var end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('분류 체계 JSON을 찾을 수 없습니다');
  var items;
  try {
    items = JSON.parse(repairJSON(raw.slice(start, end + 1)));
  } catch (e) {
    items = extractCardsIndividually(raw.slice(start, end + 1));
  }
  if (!items || items.length === 0) throw new Error('분류 항목이 비어 있습니다');

  var taxonomy = {};
  var l1Order = [];
  items.forEach(function(item) {
    var l1 = (item.l1 || '').trim();
    var l2 = (item.l2 || '').trim();
    var l3 = (item.l3 || '').trim();
    if (!l1 || !l2 || !l3) return;
    if (!taxonomy[l1]) {
      var idx = l1Order.length;
      var style = L1_STYLES[idx % L1_STYLES.length];
      taxonomy[l1] = { color: style.color, cls: style.cls, l2: {} };
      l1Order.push(l1);
    }
    if (!taxonomy[l1].l2[l2]) taxonomy[l1].l2[l2] = { l3: {} };
    if (!taxonomy[l1].l2[l2].l3[l3]) taxonomy[l1].l2[l2].l3[l3] = { q: item.queries || [] };
  });
  return taxonomy;
}

async function refreshTaxonomy(forceRefresh) {
  var treeEl = $('kwTaxTree');
  var btnEl = $('kwRefreshBtn');

  // 캐시 확인 — 캐시가 있으면 항상 사용 (TTL 무관, 수동 갱신만 API 호출)
  if (!forceRefresh) {
    try {
      var cached = JSON.parse(localStorage.getItem(TAXONOMY_CACHE_KEY) || 'null');
      if (cached && cached.taxonomy && Object.keys(cached.taxonomy).length >= 3) {
        KEYWORD_TAXONOMY = cached.taxonomy;
        mergeCustomTax();
        _autoSelectFirst();
        buildTaxTree();
        return;
      }
    } catch (e) { /* 캐시 오류 → 하드코딩 기본값 사용 */ }
    // 캐시 없으면 하드코딩 KEYWORD_TAXONOMY 기본값 그대로 사용 (API 호출 안 함)
    mergeCustomTax();
    _autoSelectFirst();
    buildTaxTree();
    return;
  }

  // ── 수동 갱신 (forceRefresh=true) ──
  var claudeKey = typeof loadApiKey === 'function' ? await loadApiKey() : '';
  if (!claudeKey) {
    alert('Claude API 키가 필요합니다.\n개발자 콘솔(Ctrl+Alt+Enter) 또는 통합현황에서 설정하세요.');
    return;
  }

  // 로딩 표시
  if (treeEl) treeEl.innerHTML = '<div style="text-align:center;padding:20px;font-size:11px;color:var(--kw-text3);font-family:var(--kw-mono);"><div class="kw-spinner" style="margin:0 auto 10px;width:20px;height:20px;"></div>YouTube 트렌드를 분석하여<br>카테고리를 생성하는 중…</div>';
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="kw-btn-spin sm"></span> 생성 중'; }

  try {
    var newTax = await generateTaxonomy(claudeKey);
    if (Object.keys(newTax).length >= 3) {
      KEYWORD_TAXONOMY = newTax;
      localStorage.setItem(TAXONOMY_CACHE_KEY, JSON.stringify({ taxonomy: newTax, ts: Date.now() }));
      localStorage.removeItem('kw_last_result');
    }
  } catch (e) {
    console.warn('[panel10] 카테고리 자동 갱신 실패:', e.message, '— 기존 분류 유지');
  }

  mergeCustomTax();
  activeCats.clear();
  _autoSelectFirst();
  buildTaxTree();
  if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '🔄 갱신'; }
}

function _autoSelectFirst() {
  // 각 L1에서 첫 번째 L3 자동 선택
  Object.keys(KEYWORD_TAXONOMY).forEach(function(l1) {
    var l2Keys = Object.keys((KEYWORD_TAXONOMY[l1].l2 || {}));
    if (!l2Keys.length) return;
    var l3Keys = Object.keys((KEYWORD_TAXONOMY[l1].l2[l2Keys[0]].l3 || {}));
    if (l3Keys.length) activeCats.add(l1 + '|' + l2Keys[0] + '|' + l3Keys[0]);
  });
}

window.kwRefreshTaxonomy = function() {
  refreshTaxonomy(true).catch(function(e) { console.warn('[panel10] 갱신 오류:', e); });
};

/* ═══════════════════════════════════════════
   JSON Repair
   ═══════════════════════════════════════════ */
function safeParseCards(raw) {
  var s = raw.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D]/g, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  var start = s.indexOf('['); var end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON 배열을 찾을 수 없습니다');
  s = s.slice(start, end + 1);
  s = s.replace(/"views"\s*:\s*"?(\d[\d,]*)[\d,]*"?\s*[가-힣A-Za-z]+/g, function(m, num) { return '"views": ' + parseInt(num.replace(/,/g, ''), 10); });
  s = s.replace(/"views"\s*:\s*(\d{1,3}(?:,\d{3})+)/g, function(m, num) { return '"views": ' + num.replace(/,/g, ''); });
  try { return JSON.parse(s); } catch (_) {}
  var repaired = repairJSON(s);
  try { return JSON.parse(repaired); } catch (_) {}
  var cards = extractCardsIndividually(repaired.length > 10 ? repaired : s);
  if (cards.length > 0) return cards;
  throw new Error('결과 파싱 실패. 잠시 후 다시 시도해주세요.');
}

function repairJSON(s) {
  var result = ''; var inString = false; var escaped = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i]; var code = s.charCodeAt(i);
    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; result += ch; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }
    if (inString && code < 0x20) {
      if (code === 0x0A) result += '\\n';
      else if (code === 0x0D) { /* skip */ }
      else if (code === 0x09) result += '\\t';
      else result += '\\u00' + ('0' + code.toString(16)).slice(-2);
      continue;
    }
    result += ch;
  }
  return result.replace(/,(\s*[}\]])/g, '$1');
}

function extractCardsIndividually(s) {
  var cards = []; var depth = 0; var start = -1;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === '{' && depth === 0) { start = i; depth = 1; }
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { cards.push(JSON.parse(repairJSON(s.slice(start, i + 1)))); } catch (_) {}
        start = -1;
      }
    }
  }
  return cards;
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */
function getMonthsAgo(n) { var d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString(); }
function fmtNum(n) {
  if (n >= 10000000) return (n / 10000000).toFixed(1) + '천만';
  if (n >= 10000) return Math.round(n / 10000) + '만';
  if (n >= 1000) return (n / 1000).toFixed(1) + '천';
  return n.toLocaleString();
}

/* ═══════════════════════════════════════════
   YouTube API
   ═══════════════════════════════════════════ */
var _allYtKeysExhausted = false;

function _checkAllKeysExhausted() {
  _allYtKeysExhausted = _kwYtExhausted.size >= KW_YT_KEYS.length;
  return _allYtKeysExhausted;
}

async function _ytSearch(query, apiKey, order, months) {
  if (_allYtKeysExhausted) return []; // 모든 키 소진 시 빈 배열
  var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&q=' +
    encodeURIComponent(query) + '&type=video&order=' + order + '&publishedAfter=' + getMonthsAgo(months) +
    '&maxResults=15&key=' + apiKey + '&relevanceLanguage=ko';
  var res = await fetch(url); var data = await res.json();
  if (data.error) {
    var msg = data.error.message || '';
    if (data.error.code === 403 || msg.toLowerCase().indexOf('quota') !== -1) {
      _markYtKeyExhausted();
      _checkAllKeysExhausted();
    }
    return []; // throw 대신 빈 배열 반환 — 다른 쿼리는 계속 진행
  }
  return data.items || [];
}

async function _ytStats(ids, apiKey) {
  if (!ids.length || _allYtKeysExhausted) return {};
  var map = {};
  for (var i = 0; i < ids.length; i += 50) {
    var batch = ids.slice(i, i + 50);
    try {
      var res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' + batch.join(',') + '&key=' + apiKey);
      var data = await res.json();
      if (data.error) { _markYtKeyExhausted(); _checkAllKeysExhausted(); break; }
      (data.items || []).forEach(function(v) { map[v.id] = v.statistics; });
    } catch (e) { break; }
  }
  return map;
}

function calcViewsPerDay(views, publishedDate) {
  var days = Math.max(1, Math.round((Date.now() - new Date(publishedDate).getTime()) / 86400000));
  return Math.round(views / days);
}

var YT_CACHE_KEY = 'kw_yt_cache';
var YT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

var _ytCacheMem = null;
function _loadYtCache() {
  if (_ytCacheMem) return _ytCacheMem;
  try { _ytCacheMem = JSON.parse(localStorage.getItem(YT_CACHE_KEY) || '{}'); } catch (e) { _ytCacheMem = {}; }
  return _ytCacheMem;
}
function _saveYtCache(cache) {
  _ytCacheMem = cache;
  try {
    // 오래된 항목 정리 (100개 넘으면 가장 오래된 것부터 삭제)
    var keys = Object.keys(cache);
    if (keys.length > 100) {
      keys.sort(function(a, b) { return (cache[a].ts || 0) - (cache[b].ts || 0); });
      keys.slice(0, keys.length - 80).forEach(function(k) { delete cache[k]; });
    }
    localStorage.setItem(YT_CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* localStorage 용량 초과 시 무시 */ }
}

async function fetchYT(query, apiKey) {
  // 1) 캐시 확인 (24시간 내 같은 쿼리 결과가 있으면 재사용)
  var cacheKey = query.toLowerCase().trim();
  var cache = _loadYtCache();
  if (cache[cacheKey] && cache[cacheKey].ts && (Date.now() - cache[cacheKey].ts < YT_CACHE_TTL)) {
    return cache[cacheKey].data || [];
  }

  // 2) API 호출
  if (_allYtKeysExhausted) return [];
  var key = apiKey || _getYtKey();
  var allItems = [];
  var searches = [['relevance', 6]];
  for (var si = 0; si < searches.length; si++) {
    if (_allYtKeysExhausted) break;
    try {
      var items = await _ytSearch(query, key, searches[si][0], searches[si][1]);
      allItems = allItems.concat(items);
    } catch (e) { /* skip */ }
  }
  var seen = new Set(); var unique = [];
  allItems.forEach(function(item) {
    var vid = item.id && item.id.videoId;
    if (vid && !seen.has(vid)) { seen.add(vid); unique.push(item); }
  });
  if (!unique.length) return [];
  var ids = unique.map(function(i) { return i.id.videoId; });
  var sMap = await _ytStats(ids, key);
  var result = unique.map(function(item) {
    var vid = item.id.videoId;
    var views = parseInt((sMap[vid] || {}).viewCount || 0);
    var pub = item.snippet.publishedAt.slice(0, 10);
    return { title: item.snippet.title, channel: item.snippet.channelTitle, published: pub, views: views, viewsPerDay: calcViewsPerDay(views, pub), videoId: vid };
  }).sort(function(a, b) { return b.viewsPerDay - a.viewsPerDay; });

  // 3) 캐시 저장
  cache[cacheKey] = { data: result, ts: Date.now() };
  _saveYtCache(cache);
  return result;
}

/* ═══════════════════════════════════════════
   Claude API
   ═══════════════════════════════════════════ */
async function callClaude(prompt, apiKey) {
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  });
  var data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text;
}

/* ═══════════════════════════════════════════
   Loading Steps UI
   ═══════════════════════════════════════════ */
function setStep(steps, current) {
  var el = $('kwLoadingSteps');
  if (!el) return;
  el.innerHTML = steps.map(function(s, i) {
    var cls = i < current ? 'done' : i === current ? 'active' : '';
    return '<div class="loading-step"><div class="step-dot ' + cls + '"></div>' +
      '<span style="color:' + (i === current ? 'var(--kw-text)' : 'var(--kw-text3)') + '">' + s + '</span></div>';
  }).join('');
  // 실행 버튼에도 현재 단계 반영
  var runBtn = $('kwRunBtn');
  if (runBtn && runBtn.classList.contains('kw-loading')) {
    var pct = Math.round(((current + 1) / steps.length) * 100);
    runBtn.innerHTML = '<span class="kw-btn-spin"></span> ' + (current + 1) + '/' + steps.length + ' ' + steps[current];
  }
}

/* ═══════════════════════════════════════════
   Cache Management
   ═══════════════════════════════════════════ */
function loadCache() {
  try {
    var raw = localStorage.getItem('kw_last_result');
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (!cached.ts || !cached.cards) return null;
    // taxonomy 버전이 달라도 캐시 유지 (API 비용 절약 — 새 분석 시 자동 갱신)
    return cached;
  } catch (_) { return null; }
}

function saveCache(cards, catData) {
  try {
    localStorage.setItem('kw_last_result', JSON.stringify({
      cards: cards, catData: catData, ts: Date.now(),
      taxonomyVersion: TAXONOMY_VERSION,
      activeCats: Array.from(activeCats)
    }));
  } catch (_) {}
}

function showCacheBanner(ts) {
  var el = $('kwCacheBanner');
  if (!el) return;
  var age = Date.now() - ts;
  var days = Math.floor(age / (24 * 60 * 60 * 1000));
  var isStale = age > CACHE_TTL;
  var label = days === 0 ? '오늘' : days + '일 전';
  if (isStale) {
    el.innerHTML = '<div class="cache-banner stale"><span>오래된 결과 (' + label + ') — 새로 분석을 권장합니다</span><button class="btn-cache" onclick="kwRunAnalysis()">새로 분석</button></div>';
  } else {
    el.innerHTML = '<div class="cache-banner"><span>캐시된 결과 (' + label + ')</span><button class="btn-cache" onclick="kwRunAnalysis()">새로 분석</button></div>';
  }
}

function hideCacheBanner() { var el = $('kwCacheBanner'); if (el) el.innerHTML = ''; }

/* ═══════════════════════════════════════════
   Main Analysis
   ═══════════════════════════════════════════ */
async function runAnalysis() {
  var claudeKey = typeof loadApiKey === 'function' ? await loadApiKey() : '';
  if (!claudeKey) {
    if (confirm('Claude API 키가 필요합니다.\n통합현황 탭에서 API 키를 설정하시겠습니까?')) {
      window.switchTab(1, document.getElementById('tab1'));
    }
    return;
  }
  if (!activeCats.size) { alert('카테고리를 하나 이상 선택해주세요.'); return; }

  var runBtn = $('kwRunBtn');
  runBtn.disabled = true;
  runBtn.classList.add('kw-loading');
  runBtn.innerHTML = '<span class="kw-btn-spin"></span> 분석 중…';
  $('kwEmptyState').style.display = 'none';
  $('kwResultArea').style.display = 'none';
  $('kwLoadingState').style.display = 'flex';
  hideCacheBanner();

  var activeLeaves = Array.from(activeCats);
  var steps = ['YouTube 트렌드 수집', '데이터 정제 및 집계', 'Claude AI 키워드 도출', '기획 카드 생성'];

  try {
    setStep(steps, 0);
    $('kwLoadingText').textContent = 'YouTube 데이터 수집 중... (0/' + activeLeaves.length + ')';

    _allYtKeysExhausted = false; // 분석 시작 시 리셋
    _kwYtExhausted.clear();
    var catData = {};
    var ytFailed = false;
    for (var li = 0; li < activeLeaves.length; li++) {
      if (_allYtKeysExhausted) {
        $('kwLoadingText').textContent = 'YouTube API 할당량 소진 — 수집된 데이터로 진행…';
        ytFailed = true;
        break;
      }
      $('kwLoadingText').textContent = 'YouTube 수집 중… (' + (li + 1) + '/' + activeLeaves.length + ')';
      var pathKey = activeLeaves[li];
      var parts = pathKey.split('|');
      var taxL1 = KEYWORD_TAXONOMY[parts[0]] || {};
      var taxL2 = (taxL1.l2 || {})[parts[1]] || {};
      var taxL3 = (taxL2.l3 || {})[parts[2]] || {};
      var queries = taxL3.q || [];
      var allVideos = [];
      for (var qi = 0; qi < queries.length; qi++) {
        if (_allYtKeysExhausted) break;
        var vids = await fetchYT(queries[qi], _getYtKey());
        allVideos.push.apply(allVideos, vids);
      }
      var seen = new Set(); var unique = [];
      allVideos.forEach(function(v) { if (v.videoId && !seen.has(v.videoId)) { seen.add(v.videoId); unique.push(v); } });
      unique.sort(function(a, b) { return b.viewsPerDay - a.viewsPerDay; });
      catData[pathKey] = unique.slice(0, 50);
    }

    setStep(steps, 1);
    $('kwLoadingText').textContent = '데이터 정제 중...';
    await new Promise(function(r) { setTimeout(r, 300); });

    var ytSummary = activeLeaves.map(function(pathKey) {
      var parts = pathKey.split('|');
      var vids = catData[pathKey] || [];
      var topTitles = vids.slice(0, 8).map(function(v) {
        return '  - "' + v.title + '" (' + fmtNum(v.views) + '회, 일평균 ' + fmtNum(v.viewsPerDay || 0) + '회/일, ' + v.published + ')';
      }).join('\n');
      var totalViews = vids.reduce(function(s, v) { return s + v.views; }, 0);
      var avgVpd = vids.length ? Math.round(vids.reduce(function(s, v) { return s + (v.viewsPerDay || 0); }, 0) / vids.length) : 0;
      return '[경로: ' + parts.join(' > ') + ']\n총 조회수: ' + fmtNum(totalViews) + ', 영상 수: ' + vids.length + ', 평균 성장속도: ' + fmtNum(avgVpd) + '회/일\n상위 영상 (성장속도순):\n' + topTitles;
    }).join('\n\n');

    // 대시보드 데이터를 프롬프트 컨텍스트로 구성
    var aladinSummary = aladinData.length > 0
      ? '예스24 IT 베스트셀러 (통합현황 로드):\n' + aladinData.slice(0, 20).map(function(b) {
          return '  - ' + b['상품명'] + (b['출판사/제작사'] ? ' (' + b['출판사/제작사'] + ')' : '');
        }).join('\n')
      : '예스24 데이터 없음 (통합현황 탭에서 로드 가능)';
    var lectureSummary = lectureData.length > 0
      ? '패스트캠퍼스 인기 강의 (통합현황 로드):\n' + lectureData.slice(0, 15).map(function(l) {
          return '  - ' + (l.title || '') + (l.cat2 ? ' [' + l.cat2 + ']' : '');
        }).join('\n')
      : '';

    setStep(steps, 2);
    $('kwLoadingText').textContent = 'Claude AI가 키워드를 도출하는 중...';

    var totalCards = activeLeaves.length * 3;
    var pathListStr = activeLeaves.map(function(p) { return p.split('|').join(' > '); }).join(', ');
    var prompt = '당신은 IT/AI 분야 출판 기획 전문가입니다. YouTube 트렌드를 분석해 출판 기획 가치가 높은 키워드를 도출하세요.\n\n' +
      '**분석 기준**: 일평균 조회수(성장속도)가 핵심. 절대 조회수보다 최근 급성장 주제가 출판 가치 높음.\n\n' +
      '[글쓰기 원칙] subtitle_suggestion과 trend_vs_supply, yt_keyword_signal은 사람이 쓴 것처럼 자연스럽게. "~할 수 있습니다" 같은 AI 투 문장 금지. 편집자가 기획회의에서 한마디로 설명하듯 간결하고 구체적으로.\n\n' +
      '[YouTube 트렌드 - 최근 6개월, 성장속도순]\n' + ytSummary + '\n\n' +
      '[' + aladinSummary + ']\n\n' +
      (lectureSummary ? '[' + lectureSummary + ']\n\n' : '') +
      '총 ' + totalCards + '개의 기획 추천 키워드를 도출하세요. 반드시 아래 JSON 배열만 출력하세요.\n\n활성 경로 목록: ' + pathListStr + '\n\n' +
      '키워드 품질 기준:\n- 구체적 롱테일 키워드 (25자 이내)\n- path의 L1/L2/L3 계층 반영\n- 각 L3 소분류당 2-3개\n- **키워드 고유성 필수**: 동일 keyword 문자열 2개 이상 금지\n- **competitor_books 필수**: 위 예스24 베스트셀러 목록에서 해당 키워드와 주제가 겹치는 도서를 1~3권 찾아 title+publisher를 반드시 기입하라. 없으면 빈 배열 []. 절대 생략하지 마라.\n- aladin_gap: 예스24에 유사 도서가 많으면 "낮음", 1~2권이면 "보통", 없으면 "높음"\n\n' +
      '[\n  {\n    "keyword": "구체적 롱테일 키워드",\n    "path": ["L1", "L2", "L3"],\n    "category": "L3 소분류명",\n    "subtitle_suggestion": "부제 한 문장",\n    "trend_vs_supply": "불균형 한 줄",\n    "yt_keyword_signal": "트렌드 근거 한 문장",\n    "readers": ["독자층1", "독자층2"],\n    "aladin_gap": "높음 또는 보통 또는 낮음",\n    "competitor_books": [{"title": "도서명", "publisher": "출판사"}],\n    "top_videos": [{"title": "영상 제목", "views": 1234567}],\n    "urgency": "지금 또는 3개월 내 또는 6개월 내",\n    "author_type": "현업 개발자 / IT 유튜버 / 연구자 / 컨설턴트"\n  }\n]\n\n' +
      '[JSON 형식 규칙]\n1. 문자열 값 한 줄. 줄바꿈 금지.\n2. 큰따옴표(") 사용 금지.\n3. views는 정수만.\n4. path는 3개 요소 배열.';

    var raw = await callClaude(prompt, claudeKey);

    setStep(steps, 3);
    $('kwLoadingText').textContent = '카드 생성 중...';
    var cards = safeParseCards(raw);
    lastCards = cards;
    lastCatData = catData;
    saveCache(cards, catData);
    renderCards(cards, catData);
    if (ytFailed) {
      var banner = $('kwCacheBanner');
      if (banner) banner.innerHTML = '<div class="cache-banner stale"><span>⚠ YouTube API 할당량 소진 — 일부 카테고리의 영상 데이터가 누락되었습니다. 내일 다시 시도하면 할당량이 초기화됩니다.</span></div>';
    }
  } catch (e) {
    $('kwLoadingState').style.display = 'none';
    $('kwEmptyState').style.display = 'flex';
    alert('오류: ' + e.message);
  } finally {
    runBtn.disabled = false;
    runBtn.classList.remove('kw-loading');
    runBtn.innerHTML = '🚀 키워드 분석 시작';
  }
}
window.kwRunAnalysis = runAnalysis;

/* ═══════════════════════════════════════════
   Card Rendering
   ═══════════════════════════════════════════ */
function gapPill(gap) {
  var map = { '높음': 'gap-high', '보통': 'gap-mid', '낮음': 'gap-low' };
  var label = { '높음': '공백 높음', '보통': '공백 보통', '낮음': '경쟁 있음' };
  return '<span class="gap-pill ' + (map[gap] || 'gap-mid') + '">' + (label[gap] || gap) + '</span>';
}
function urgencyPill(u) {
  var map = { '지금': 'gap-high', '3개월 내': 'gap-mid', '6개월 내': 'gap-low' };
  return '<span class="gap-pill ' + (map[u] || 'gap-mid') + '">\u23F1 ' + u + '</span>';
}

function renderCards(cards, catData) {
  $('kwLoadingState').style.display = 'none';
  $('kwEmptyState').style.display = 'none';
  $('kwResultArea').style.display = 'block';

  var now = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  var subParts = activeCats.size > 0
    ? [].concat(Array.from(new Set(Array.from(activeCats).map(function(p) { return p.split('|')[0]; }))))
    : [].concat(Array.from(new Set(cards.map(function(c) { return (c.path && c.path[0]) || c.category; }))));
  $('kwResultSub').textContent = now + ' 기준 \xB7 ' + subParts.join(', ') + ' \xB7 YouTube 최근 6개월 \xB7 성장속도순';

  var totalVids = Object.values(catData).reduce(function(s, v) { return s + v.length; }, 0);
  var totalViews = Object.values(catData).reduce(function(s, v) { return s + v.reduce(function(a, b) { return a + b.views; }, 0); }, 0);
  var highGap = cards.filter(function(c) { return c.aladin_gap === '높음'; }).length;
  var leafCount = Object.keys(catData).length;

  $('kwSummaryBar').innerHTML =
    '<div class="summary-chip"><div class="summary-chip-val">' + cards.length + '</div><div class="summary-chip-label">도출된 키워드</div></div>' +
    '<div class="summary-chip"><div class="summary-chip-val">' + totalVids + '</div><div class="summary-chip-label">수집 영상 (L3 ' + leafCount + '개 x 최대 50)</div></div>' +
    '<div class="summary-chip"><div class="summary-chip-val">' + fmtNum(totalViews) + '</div><div class="summary-chip-label">총 조회수 (6개월 내)</div></div>' +
    '<div class="summary-chip"><div class="summary-chip-val">' + highGap + '</div><div class="summary-chip-label">공백 높음</div></div>' +
    '<div class="summary-chip"><div class="summary-chip-val">' + (aladinData.length || '-') + '</div><div class="summary-chip-label">yes24 도서</div></div>';

  var maxViews = Math.max.apply(null, cards.flatMap(function(c) { return (c.top_videos || []).map(function(v) { return v.views || 0; }); }).concat([1]));

  $('kwCardsGrid').innerHTML = cards.map(function(card) {
    var path = card.path || [];
    var l1 = path[0] || card.category;
    var catCls = getL1Class(l1);
    // 경로
    var bc = path.length >= 2 ? path.join(' › ') : '';
    // yes24 경쟁 도서: Claude가 준 것 + aladinData에서 키워드 쪼개기 매칭
    var compArr = (card.competitor_books || []).slice();
    if (compArr.length < 3 && aladinData.length > 0) {
      var kwParts = card.keyword.toLowerCase().replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(function(w) { return w.length >= 2; });
      aladinData.forEach(function(b) {
        if (compArr.length >= 3) return;
        var title = (b['상품명'] || '').toLowerCase();
        var matched = kwParts.filter(function(w) { return title.indexOf(w) !== -1; });
        if (matched.length >= 1) {
          var already = compArr.some(function(c) { return (c.title || '').toLowerCase() === title; });
          if (!already) compArr.push({ title: b['상품명'], publisher: b['출판사/제작사'] || '' });
        }
      });
    }
    var compHtml = compArr.length
      ? compArr.slice(0, 3).map(function(b) {
          var searchUrl = 'https://www.yes24.com/Product/Search?domain=ALL&query=' + encodeURIComponent(b.title || '');
          return '<div class="comp-item"><a href="' + searchUrl + '" target="_blank" title="' + escHtml(b.title || '') + '">' + escHtml(b.title || '') + '</a><div class="comp-pub">' + escHtml(b.publisher || '') + '</div></div>';
        }).join('')
      : '<div class="no-comp">관련 도서 없음 — 선점 기회</div>';
    // YouTube 영상 (링크 포함)
    var topVids = (card.top_videos || []).slice(0, 3);
    var totalCardViews = topVids.reduce(function(s, v) { return s + (parseInt(v.views, 10) || 0); }, 0);
    if (totalCardViews === 0 && catData) {
      var pathKey = path.join('|') || card.category;
      var catVids = catData[pathKey] || catData[card.category] || [];
      catVids.slice(0, 3).forEach(function(v) { totalCardViews += (v.views || 0); });
    }
    var vidHtml = topVids.length
      ? topVids.map(function(v) {
          var ytUrl = v.videoId ? 'https://youtu.be/' + v.videoId : '#';
          return '<div class="card-vid-link"><a href="' + ytUrl + '" target="_blank" title="' + escHtml(v.title || '') + '">' + escHtml(v.title || '') + '</a><span class="card-vid-views">' + fmtNum(parseInt(v.views, 10) || 0) + '</span></div>';
        }).join('')
      : '<div class="no-comp">영상 데이터 없음</div>';
    // 독자 + 저자
    var meta = [];
    if (card.readers && card.readers.length) meta.push(card.readers.slice(0, 3).map(function(r) { return escHtml(r); }).join(', '));
    if (card.author_type) meta.push('✍ ' + escHtml(card.author_type));
    var signalText = card.yt_keyword_signal || card.trend_vs_supply || '';
    return '<div class="plan-card">' +
      '<div class="card-head">' +
        (bc ? '<div class="card-breadcrumb" style="margin-bottom:4px;"><span class="bc-l1">' + escHtml(bc) + '</span></div>' : '') +
        '<div class="card-keyword">' + escHtml(card.keyword) + '</div>' +
        (card.subtitle_suggestion ? '<div class="card-subtitle">' + escHtml(card.subtitle_suggestion) + '</div>' : '') +
        '<div class="card-cat-row">' +
          '<span class="cat-pill ' + catCls + '">' + escHtml(l1) + '</span>' +
          gapPill(card.aladin_gap) + urgencyPill(card.urgency) +
        '</div>' +
        (signalText ? '<div class="kw-signal" style="margin-top:6px;">' + escHtml(signalText) + '</div>' : '') +
      '</div>' +
      '<div class="card-body">' +
        '<div><div class="card-section-title">YouTube 트렌드 <span class="src-badge src-yt">YT</span> <span style="font-weight:400;letter-spacing:0;">합산 ' + (totalCardViews > 0 ? fmtNum(totalCardViews) : '-') + '</span></div>' + vidHtml + '</div>' +
        '<div><div class="card-section-title">yes24 경쟁 도서 <span class="src-badge src-aladin">yes24</span></div><div class="comp-list">' + compHtml + '</div></div>' +
      '</div>' +
      '<div class="card-foot">' +
        '<span style="font-size:10px;color:var(--kw-text2);">' + (meta.length ? meta.join(' · ') : '&nbsp;') + '</span>' +
        urgencyPill(card.urgency) +
      '</div>' +
    '</div>';
  }).join('');
}

/* ═══════════════════════════════════════════
   D3 Graph
   ═══════════════════════════════════════════ */
var _d3State = null;

window.kwGraphAutoLayout = function(btn) {
  if (!_d3State || !_d3State.simulation) return;
  var sim = _d3State.simulation;
  // 1) 드래그로 고정된 노드 풀기
  sim.nodes().forEach(function(d) {
    if (d.type !== 'root') { d.fx = null; d.fy = null; }
  });
  // 2) collision 반경 대폭 강화 — 라벨까지 포함해서 겹침 방지
  sim.force('collision', d3.forceCollide().radius(function(d) {
    if (d.type === 'root') return 30;
    if (d.type === 'l1') return 35;
    if (d.type === 'l2') return 25;
    if (d.type === 'l3') return 20;
    return d.r + 22; // keyword: 노드 + 라벨 여백
  }).strength(1).iterations(3));
  // 3) charge 반발력 강화
  sim.force('charge', d3.forceManyBody().strength(function(d) {
    return ({ root: 0, l1: -250, l2: -150, l3: -100, keyword: -80 })[d.type] || -80;
  }));
  // 4) 시뮬레이션 재시작 (높은 alpha로 충분히 돌림)
  sim.alpha(1).alphaDecay(0.01).restart();
  // 5) 줌 → fit all (전체 노드가 보이도록)
  setTimeout(function() { _fitGraphToView(); }, 2000);
};

function _fitGraphToView() {
  if (!_d3State || !_d3State.simulation || !_d3State.svg || !_d3State.zoom) return;
  var nodes = _d3State.simulation.nodes();
  if (!nodes.length) return;
  var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  nodes.forEach(function(d) {
    if (d.x < xMin) xMin = d.x;
    if (d.x > xMax) xMax = d.x;
    if (d.y < yMin) yMin = d.y;
    if (d.y > yMax) yMax = d.y;
  });
  var pad = 60;
  var bw = (xMax - xMin) + pad * 2;
  var bh = (yMax - yMin) + pad * 2;
  var W = _d3State.W; var H = _d3State.H;
  var scale = Math.min(W / bw, H / bh, 1.5);
  var tx = W / 2 - (xMin + xMax) / 2 * scale;
  var ty = H / 2 - (yMin + yMax) / 2 * scale;
  _d3State.svg.transition().duration(750).call(
    _d3State.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}

window.kwGraphResetZoom = function(btn) {
  if (!_d3State || !_d3State.svg || !_d3State.zoom) return;
  _d3State.svg.transition().duration(500).call(
    _d3State.zoom.transform, d3.zoomIdentity
  );
};

function renderD3Graph(cards, catData) {
  var container = $('kwGraphContainer');
  if (typeof d3 === 'undefined') {
    if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--kw-text3);font-size:13px;">D3.js 라이브러리 로딩 중… 새로고침 후 다시 시도하세요</div>';
    return;
  }
  if (!container) return;
  if (_d3State && _d3State.simulation) _d3State.simulation.stop();
  container.innerHTML = '';
  var W = container.clientWidth; var H = container.clientHeight || 600;
  var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  var g = svg.append('g');
  var zoomBehavior = d3.zoom().scaleExtent([0.2, 3]).on('zoom', function(event) { g.attr('transform', event.transform); });
  svg.call(zoomBehavior);
  // 모듈 변수에 저장 (자동 정렬/초기화에서 사용)
  _d3State = { svg: svg, g: g, zoom: zoomBehavior, W: W, H: H, simulation: null };
  var tooltip = d3.select('#kwD3Tooltip');
  var gapRingColor = { '높음': '#c23d2f', '보통': '#b85a00', '낮음': '#0c7a5e' };
  var nodes = []; var links = []; var nodeMap = {};

  nodeMap['root'] = { id: 'root', label: 'IT/AI\n키워드', type: 'root', r: 22, fx: W/2, fy: H/2, color: '#3B3F8C' };
  nodes.push(nodeMap['root']);

  var cardViews = cards.map(function(c) { return (c.top_videos || []).reduce(function(s, v) { return s + (parseInt(v.views, 10) || 0); }, 0); });
  var maxV = Math.max.apply(null, cardViews.concat([1]));

  cards.forEach(function(card, idx) {
    var path = card.path || []; var l1 = path[0] || card.category; var l2 = path[1] || ''; var l3 = path[2] || '';
    var l1Color = getL1Color(l1);
    var l1Id = 'l1_' + l1;
    if (!nodeMap[l1Id]) { nodeMap[l1Id] = { id: l1Id, label: l1, type: 'l1', color: l1Color, r: 20 }; nodes.push(nodeMap[l1Id]); links.push({ source: 'root', target: l1Id, type: 'root-l1' }); }
    var l2Id = l2 ? ('l2_' + l1 + '_' + l2) : null;
    if (l2 && !nodeMap[l2Id]) { nodeMap[l2Id] = { id: l2Id, label: l2, type: 'l2', color: l1Color, r: 12 }; nodes.push(nodeMap[l2Id]); links.push({ source: l1Id, target: l2Id, type: 'l1-l2' }); }
    var l3Id = l3 ? ('l3_' + l1 + '_' + l2 + '_' + l3) : null;
    if (l3 && !nodeMap[l3Id]) { nodeMap[l3Id] = { id: l3Id, label: l3, type: 'l3', color: l1Color, r: 8 }; nodes.push(nodeMap[l3Id]); links.push({ source: l2Id || l1Id, target: l3Id, type: 'l2-l3' }); }
    var kwId = 'kw_' + idx; var tv = cardViews[idx]; var kwR = Math.round(6 + (tv / maxV) * 12);
    nodeMap[kwId] = { id: kwId, label: card.keyword, type: 'keyword', color: l1Color, r: kwR, totalViews: tv, ringColor: gapRingColor[card.aladin_gap] || '#aaa', ringWidth: card.aladin_gap === '높음' ? 3 : 2 };
    nodes.push(nodeMap[kwId]); links.push({ source: l3Id || l2Id || l1Id, target: kwId, type: 'l3-kw' });
  });

  var R1 = Math.min(W, H) * 0.17; var R2 = Math.min(W, H) * 0.30; var R3 = Math.min(W, H) * 0.43; var R4 = Math.min(W, H) * 0.56;
  var simulation = _d3State.simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(function(d) { return d.id; }).distance(function(d) { var dm = { 'root-l1': R1, 'l1-l2': R2-R1, 'l2-l3': R3-R2, 'l3-kw': R4-R3 }; return dm[d.type] || 60; }).strength(0.4))
    .force('charge', d3.forceManyBody().strength(function(d) { return ({ root:0,l1:-120,l2:-80,l3:-60,keyword:-50 })[d.type] || -50; }))
    .force('radial-l1', d3.forceRadial(R1, W/2, H/2).strength(function(d) { return d.type === 'l1' ? 1.2 : 0; }))
    .force('radial-l2', d3.forceRadial(R2, W/2, H/2).strength(function(d) { return d.type === 'l2' ? 1.0 : 0; }))
    .force('radial-l3', d3.forceRadial(R3, W/2, H/2).strength(function(d) { return d.type === 'l3' ? 0.9 : 0; }))
    .force('radial-kw', d3.forceRadial(R4, W/2, H/2).strength(function(d) { return d.type === 'keyword' ? 0.7 : 0; }))
    .force('collision', d3.forceCollide().radius(function(d) { return d.r + (d.type === 'keyword' ? 16 : 10); }));

  var link = g.append('g').selectAll('line').data(links).enter().append('line')
    .attr('stroke', '#c6c4ba').attr('stroke-opacity', function(d) { return ({  'root-l1':0.5,'l1-l2':0.4,'l2-l3':0.3,'l3-kw':0.2 })[d.type] || 0.3; })
    .attr('stroke-width', function(d) { return ({ 'root-l1':1.5,'l1-l2':1.5,'l2-l3':1,'l3-kw':0.8 })[d.type] || 1; });

  var nodeEl = g.append('g').selectAll('circle').data(nodes).enter().append('circle')
    .attr('r', function(d) { return d.r; })
    .attr('fill', function(d) { return d.color || '#888'; })
    .attr('fill-opacity', function(d) { return ({ root:1,l1:0.9,l2:0.75,l3:0.65,keyword:0.8 })[d.type] || 0.8; })
    .attr('stroke', function(d) { return d.type === 'root' ? '#fff' : d.type === 'keyword' ? (d.ringColor || '#fff') : 'rgba(255,255,255,0.5)'; })
    .attr('stroke-width', function(d) { return d.type === 'keyword' ? d.ringWidth : d.type === 'root' ? 3 : 1.5; })
    .call(d3.drag()
      .on('start', function(event, d) { if (d.type === 'root') return; if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', function(event, d) { if (d.type === 'root') return; d.fx = event.x; d.fy = event.y; })
      .on('end', function(event, d) { if (d.type === 'root') return; if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))
    .on('mouseover', function(event, d) {
      if (d.type === 'root') return;
      var txt = d.type === 'keyword' ? d.label + ' (조회: ' + fmtNum(d.totalViews || 0) + ')' : d.label;
      tooltip.style('opacity', 1).html(txt).style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 10) + 'px');
    })
    .on('mousemove', function(event) { tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 10) + 'px'); })
    .on('mouseout', function() { tooltip.style('opacity', 0); });

  ['IT/AI', '키워드'].forEach(function(line, i) {
    g.append('text').datum(nodeMap['root']).text(line)
      .attr('font-size', '9px').attr('font-weight', '700').attr('font-family', 'IBM Plex Sans KR, sans-serif')
      .attr('text-anchor', 'middle').attr('fill', '#fff').attr('pointer-events', 'none')
      .attr('dy', (i === 0 ? -4 : 8) + 'px').attr('x', nodeMap['root'].fx).attr('y', nodeMap['root'].fy);
  });

  var structNodes = nodes.filter(function(d) { return d.type === 'l1' || d.type === 'l2' || d.type === 'l3'; });
  var structLabels = g.append('g').selectAll('text').data(structNodes).enter().append('text')
    .text(function(d) { return d.label; })
    .attr('font-size', function(d) { return d.type === 'l1' ? '12px' : d.type === 'l2' ? '10px' : '9px'; })
    .attr('font-weight', function(d) { return d.type === 'l1' ? '700' : '500'; })
    .attr('font-family', 'IBM Plex Sans KR, sans-serif').attr('text-anchor', 'middle')
    .attr('dy', function(d) { return -(d.r + 5); }).attr('fill', '#1a1917')
    .attr('stroke', '#ffffff').attr('stroke-width', '2.5').attr('paint-order', 'stroke');

  var kwNodes = nodes.filter(function(d) { return d.type === 'keyword'; });
  var kwLabels = g.append('g').selectAll('.kw-name').data(kwNodes).enter().append('text')
    .text(function(d) { return d.label.length > 14 ? d.label.slice(0, 14) + '\u2026' : d.label; })
    .attr('font-size', '9px').attr('font-weight', '600').attr('font-family', 'IBM Plex Sans KR, sans-serif')
    .attr('text-anchor', 'middle').attr('dy', function(d) { return d.r + 12; })
    .attr('fill', '#1a1917').attr('stroke', '#ffffff').attr('stroke-width', '2').attr('paint-order', 'stroke');

  var kwViewLabels = g.append('g').selectAll('.kw-views').data(kwNodes).enter().append('text')
    .text(function(d) { return d.totalViews > 0 ? fmtNum(d.totalViews) : ''; })
    .attr('font-size', '8px').attr('font-family', 'IBM Plex Mono, monospace').attr('text-anchor', 'middle')
    .attr('dy', function(d) { return d.r + 23; }).attr('fill', '#9b9890');

  simulation.on('tick', function() {
    link.attr('x1', function(d) { return d.source.x; }).attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; }).attr('y2', function(d) { return d.target.y; });
    nodeEl.attr('cx', function(d) { return d.x; }).attr('cy', function(d) { return d.y; });
    structLabels.attr('x', function(d) { return d.x; }).attr('y', function(d) { return d.y; });
    kwLabels.attr('x', function(d) { return d.x; }).attr('y', function(d) { return d.y; });
    kwViewLabels.attr('x', function(d) { return d.x; }).attr('y', function(d) { return d.y; });
  });

  var legend = svg.append('g').attr('transform', 'translate(14, 14)');
  var legendData = [
    { r: 11, color: '#3B3F8C', label: '중심 허브' },
    { r: 9, color: '#4f46b8', label: 'L1 대분류' },
    { r: 6, color: '#4f46b8', label: 'L2 중분류', opacity: 0.75 },
    { r: 4, color: '#4f46b8', label: 'L3 소분류', opacity: 0.65 },
    { r: 4, color: '#4f46b8', label: '키워드 (크기=조회수)', outline: '#c23d2f' }
  ];
  var lx = 0;
  legendData.forEach(function(item) {
    legend.append('circle').attr('cx', lx + item.r).attr('cy', 10).attr('r', item.r)
      .attr('fill', item.color).attr('fill-opacity', item.opacity || 1)
      .attr('stroke', item.outline || 'none').attr('stroke-width', item.outline ? 2 : 0);
    legend.append('text').attr('x', lx + item.r * 2 + 4).attr('y', 14).text(item.label)
      .attr('font-size', '9px').attr('font-family', 'IBM Plex Sans KR, sans-serif').attr('fill', '#56544e');
    lx += item.r * 2 + 4 + item.label.length * 7 + 10;
  });
  legend.append('text').attr('x', lx).attr('y', 14).text('| 테두리: 빨강=공백높음 \xB7 주황=보통 \xB7 초록=경쟁있음')
    .attr('font-size', '9px').attr('font-family', 'IBM Plex Sans KR, sans-serif').attr('fill', '#9b9890');
}

/* ═══════════════════════════════════════════
   Chart.js
   ═══════════════════════════════════════════ */
var chartBarInstance = null;

function renderCharts(cards, catData) {
  if (chartBarInstance) { chartBarInstance.destroy(); chartBarInstance = null; }
  var catLabels = Object.keys(catData);
  var catViews = catLabels.map(function(key) { return catData[key].reduce(function(s, v) { return s + v.views; }, 0); });
  var catColors = catLabels.map(function(key) { return getL1Color(key.split('|')[0]); });
  var catDisplayLabels = catLabels.map(function(key) { var p = key.split('|'); return p.length >= 3 ? p[2] : key; });

  var canvas = $('kwChartBar');
  if (!canvas) return;
  chartBarInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: catDisplayLabels, datasets: [{ label: '총 조회수', data: catViews, backgroundColor: catColors, borderColor: catColors, borderWidth: 1, borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return fmtNum(ctx.raw) + ' 조회'; } } } },
      scales: { x: { ticks: { callback: function(v) { return fmtNum(v); } }, grid: { color: 'rgba(0,0,0,0.05)' } }, y: { grid: { display: false } } }
    }
  });
}

/* ═══════════════════════════════════════════
   Sort Cards
   ═══════════════════════════════════════════ */
window.kwSortCards = function(mode, btn) {
  $$('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (!lastCards.length) return;
  var urgencyOrder = { '지금': 0, '3개월 내': 1, '6개월 내': 2 };
  var gapOrder = { '높음': 0, '보통': 1, '낮음': 2 };
  var sorted = lastCards.slice();
  if (mode === 'urgency') {
    sorted.sort(function(a, b) { return (urgencyOrder[a.urgency] || 9) - (urgencyOrder[b.urgency] || 9); });
  } else if (mode === 'views') {
    sorted.sort(function(a, b) {
      var aV = (a.top_videos || []).reduce(function(s, v) { return s + (parseInt(v.views, 10) || 0); }, 0);
      var bV = (b.top_videos || []).reduce(function(s, v) { return s + (parseInt(v.views, 10) || 0); }, 0);
      return bV - aV;
    });
  } else if (mode === 'gap') {
    sorted.sort(function(a, b) { return (gapOrder[a.aladin_gap] || 9) - (gapOrder[b.aladin_gap] || 9); });
  }
  renderCards(sorted, lastCatData);
};

/* ═══════════════════════════════════════════
   Init — PanelRegistry 등록
   ═══════════════════════════════════════════ */
var initialized = false;

function initPanel10() {
  if (initialized) return;
  initialized = true;

  // 1. 대시보드 데이터 로드 (yes24 / 패스트캠퍼스 — app.js getter 사용)
  loadDashboardData();

  // 2. 연결 상태 표시
  showApiKeyStatus();

  // 3. 캐시 먼저 복원 (즉시 표시 — API 호출 없음)
  var cached = loadCache();
  if (cached && cached.cards && cached.cards.length) {
    lastCards = cached.cards;
    lastCatData = cached.catData || {};
    if (cached.activeCats && cached.activeCats.length) {
      activeCats.clear();
      cached.activeCats.forEach(function(c) { activeCats.add(c); });
    }
    renderCards(cached.cards, cached.catData || {});
    showCacheBanner(cached.ts);
  }

  // 4. taxonomy 로드 (캐시/기본값 — API 호출 안 함)
  refreshTaxonomy(false).then(function() {
    var l1Els = ROOT.querySelectorAll('.tax-l1');
    [0, 1].forEach(function(i) {
      if (l1Els[i]) {
        l1Els[i].classList.add('open');
        var firstL2 = l1Els[i].querySelector('.tax-l2');
        if (firstL2) firstL2.classList.add('open');
      }
    });
  }).catch(function(e) {
    console.warn('[panel10] initPanel10 오류:', e);
  });
}

// 패널 활성화 시: 초기화 + 매번 상태 갱신
function activatePanel10() {
  if (!initialized) {
    initPanel10();
  } else {
    // 재방문 시: 대시보드 데이터·API 키 상태 갱신
    loadDashboardData();
    showApiKeyStatus();
  }
}

// ─── 트렌드 키워드 getter — panel7(유튜버 분석)에서 자동 사용 ───
// KEYWORD_TAXONOMY의 L3 이름을 한 단어 키워드 배열로 반환
window.getKwTrendKeywords = function() {
  var keywords = [];
  Object.keys(KEYWORD_TAXONOMY).forEach(function(l1) {
    var l2s = KEYWORD_TAXONOMY[l1].l2 || {};
    Object.keys(l2s).forEach(function(l2) {
      var l3s = l2s[l2].l3 || {};
      Object.keys(l3s).forEach(function(l3) {
        keywords.push(l3);
      });
    });
  });
  return keywords;
};

// switchTab(10)에서 호출되도록 window에 노출
window._initPanel10 = activatePanel10;

// PanelRegistry가 있으면 등록 (split 아키텍처용)
if (typeof PanelRegistry !== 'undefined') {
  PanelRegistry.register(10, { onActivate: activatePanel10 });
}

// tab10 잠금 해제
(function unlockTab10() {
  var t10 = document.getElementById('tab10');
  if (t10) { t10.classList.remove('locked'); t10.innerHTML = '<span class="nav-label">키워드 분석</span>'; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', unlockTab10);
})();

})();
