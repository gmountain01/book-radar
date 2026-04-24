(function(){
'use strict';

// ──────────────────────────────────────────────
// p17-concepts — 컨셉 다양성 레이어 + 참고 이미지 분석
// panel17.js 뒤에 로드. p17_getData()·callClaudeApi()·loadApiKey() 의존.
// 기능 off 상태(컨셉 미선택, 참조 미업로드)에서는 기존 동작에 영향 없음.
// ──────────────────────────────────────────────

var CONCEPT_COUNT = 4;
var _concepts = [];          // { style, palette, composition, elements, mood }[]
var _selectedIdx = -1;       // 선택된 컨셉 인덱스 (-1 = 미선택)
var _refDataUrl = '';        // 참고 이미지 base64 data URL
var _refMediaType = 'image/png';
var _refAnalysis = null;     // Step 1 Vision 분석 JSON 객체 (null = 미분석)
var _busy = false;

// ──────────────────────────────────────────────
// UI 렌더링
// ──────────────────────────────────────────────
function _renderConceptArea() {
  var area = document.getElementById('p17_conceptArea');
  if (!area) return;

  var html = '<div class="p17-ai-title" style="margin-bottom:8px">컨셉 후보</div>';
  html += '<button class="p17-btn p17-btn-secondary" style="width:100%;margin-bottom:8px" ' +
    'onclick="p17_generateConcepts()" id="p17_conceptBtn">' +
    (_busy ? '생성 중…' : '컨셉 ' + CONCEPT_COUNT + '개 생성') + '</button>';

  if (_concepts.length > 0) {
    html += '<div class="p17c-cards">';
    for (var i = 0; i < _concepts.length; i++) {
      var c = _concepts[i];
      var sel = (i === _selectedIdx);
      html += '<div class="p17c-card' + (sel ? ' p17c-selected' : '') + '" onclick="p17_selectConcept(' + i + ')">';
      html += '<div class="p17c-card-num">' + (i + 1) + '</div>';
      html += '<div class="p17c-card-body">';
      html += '<div class="p17c-style">' + _esc(c.style) + '</div>';
      // 팔레트 텍스트 + 색상 스워치
      var hexes = (c.palette || '').match(/#[0-9a-fA-F]{3,8}/g) || [];
      html += '<div class="p17c-palette">' + _esc(c.palette) + '</div>';
      if (hexes.length > 0) {
        html += '<div class="p17c-swatches">';
        for (var h = 0; h < hexes.length; h++) {
          html += '<span class="p17c-swatch" style="background:' + hexes[h] + '" title="' + hexes[h] + '"></span>';
        }
        html += '</div>';
      }
      html += '<div class="p17c-desc">' + _esc(c.composition) + '</div>';
      html += '</div>';
      if (sel) html += '<div class="p17c-check">&#10003;</div>';
      html += '</div>';
    }
    html += '</div>';
    if (_selectedIdx >= 0) {
      html += '<button class="p17-btn p17-btn-secondary" style="width:100%;margin-top:6px;font-size:10px" ' +
        'onclick="p17_clearConcepts()">선택 해제</button>';
    }
  }

  html += '<div id="p17_conceptStatus" style="font-size:10px;color:var(--muted);margin-top:4px"></div>';
  area.innerHTML = html;
}

function _renderRefArea() {
  var area = document.getElementById('p17_refArea');
  if (!area) return;

  var html = '<div class="p17-ai-title" style="margin-top:14px;margin-bottom:8px">참고 이미지</div>';

  if (!_refDataUrl) {
    html += '<label class="p17c-ref-upload">' +
      '<span>참조 표지/이미지 업로드</span>' +
      '<input type="file" accept="image/*" style="display:none" onchange="p17_uploadRef(this)">' +
      '</label>';
    html += '<div style="font-size:9px;color:var(--muted2);margin-top:3px;line-height:1.4">' +
      '기존 표지나 무드보드를 업로드하면<br>스타일을 분석해 AI 배경 생성에 반영합니다</div>';
  } else {
    html += '<div class="p17c-ref-preview">';
    html += '<img src="' + _refDataUrl + '" class="p17c-ref-thumb">';
    html += '<button onclick="p17_clearRef()" class="p17c-ref-remove" title="제거">x</button>';
    html += '</div>';
    if (!_refAnalysis) {
      html += '<button class="p17-btn p17-btn-secondary" style="width:100%;margin-top:6px" ' +
        'onclick="p17_analyzeRef()" id="p17_refAnalyzeBtn">Vision 분석 (GPT-4o)</button>';
    } else {
      // JSON 객체를 카테고리별로 표시
      var keys = ['style','subject','composition','lighting','color_palette','texture_material','mood_atmosphere','technical'];
      var labels = {style:'스타일',subject:'피사체',composition:'구도',lighting:'조명',
        color_palette:'색상',texture_material:'질감',mood_atmosphere:'분위기',technical:'기술'};
      html += '<div class="p17c-ref-result">';
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        if (_refAnalysis[k]) {
          html += '<div class="p17c-ref-row"><span class="p17c-ref-key">' + labels[k] + '</span>' +
            '<span class="p17c-ref-val">' + _esc(_refAnalysis[k]) + '</span></div>';
        }
      }
      html += '</div>';
      html += '<button class="p17-btn p17-btn-secondary" style="width:100%;margin-top:4px;font-size:10px" ' +
        'onclick="p17_analyzeRef()">재분석</button>';
    }
  }

  html += '<div id="p17_refStatus" style="font-size:10px;color:var(--muted);margin-top:4px"></div>';
  area.innerHTML = html;
}

function _esc(s) {
  if (Array.isArray(s)) s = s.join(', ');
  else if (s && typeof s === 'object') s = JSON.stringify(s);
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────
// 컨셉 생성 (Claude API)
// ──────────────────────────────────────────────
async function p17_generateConcepts() {
  if (_busy) return;
  if (typeof callClaudeApi !== 'function' || typeof loadApiKey !== 'function') {
    alert('Claude API가 로드되지 않았습니다.\n통합현황 탭에서 API 키를 먼저 설정하세요.');
    return;
  }
  var apiKey = await loadApiKey();
  if (!apiKey) {
    alert('Claude API 키가 설정되지 않았습니다.\n통합현황 탭에서 API 키를 먼저 설정하세요.');
    return;
  }

  // 책 정보 수집
  var d = (typeof p17_getData === 'function') ? p17_getData() : {};
  if (!d.title) { alert('표1의 제목을 먼저 입력하세요.'); return; }

  // 재생성 시 이전 컨셉+이미지 초기화
  _concepts = [];
  _selectedIdx = -1;
  if (typeof p17_clearBg === 'function') p17_clearBg();

  _busy = true;
  _renderConceptArea();

  var stEl = document.getElementById('p17_conceptStatus');
  if (stEl) stEl.textContent = '컨셉 생성 중…';

  // Vision 분석 결과가 있으면 프롬프트에 포함
  var refSection = '';
  if (_refAnalysis && typeof _refAnalysis === 'object') {
    refSection = '\n[참고 이미지 분석 결과 — 이 스타일을 기반으로 변형하세요]\n' +
      (_refAnalysis.style ? '- 스타일: ' + _refAnalysis.style + '\n' : '') +
      (_refAnalysis.color_palette ? '- 색상: ' + _refAnalysis.color_palette + '\n' : '') +
      (_refAnalysis.composition ? '- 구도: ' + _refAnalysis.composition + '\n' : '') +
      (_refAnalysis.mood_atmosphere ? '- 분위기: ' + _refAnalysis.mood_atmosphere + '\n' : '') +
      (_refAnalysis.texture_material ? '- 질감: ' + _refAnalysis.texture_material + '\n' : '') +
      (_refAnalysis.subject ? '- 피사체: ' + _refAnalysis.subject + '\n' : '') +
      '\n위 분석 결과를 참고하되, 각 컨셉은 이 스타일의 서로 다른 변형이어야 합니다.\n' +
      '1개는 원본에 가깝게, 나머지는 색상·구도·분위기를 달리한 변형으로 제안하세요.\n';
  }

  var prompt = '당신은 IT/기술 서적 표지 디자인 전문가입니다.\n\n' +
    '아래 책 정보를 바탕으로 서로 확연히 다른 표지 배경 디자인 컨셉 ' + CONCEPT_COUNT + '개를 제안하세요.\n\n' +
    '[책 정보]\n' +
    '- 제목: ' + d.title + '\n' +
    (d.subtitle ? '- 부제목: ' + d.subtitle + '\n' : '') +
    (d.sticker ? '- 딱지: ' + d.sticker + '\n' : '') +
    (d.keywords ? '- 키워드: ' + d.keywords + '\n' : '') +
    (d.copy ? '- 카피: ' + d.copy.replace(/\n/g, ' ') + '\n' : '') +
    (d.desc ? '- 설명: ' + d.desc.replace(/\n/g, ' ').slice(0, 150) + '\n' : '') +
    refSection +
    '\n각 컨셉은 반드시 아래 JSON 배열 형태로만 응답하세요. 다른 텍스트 없이 순수 JSON만:\n' +
    '[\n' +
    '  {\n' +
    '    "style": "시각 스타일 (예: 미니멀 기하학, 사이버펑크, 수채화 추상 등)",\n' +
    '    "palette": "주요 색상 2-3개 (예: 딥 네이비 #1a2744 + 코퍼 골드 #c9884c)",\n' +
    '    "composition": "구도와 레이아웃 설명 (예: 상단 30%에 일러스트, 하단 여백)",\n' +
    '    "elements": "핵심 시각 요소 (예: 코드 블록 형태의 격자, 터미널 커서)",\n' +
    '    "mood": "전체 분위기 한 줄 (예: 전문적이면서 접근하기 쉬운)"\n' +
    '  }\n' +
    ']\n\n' +
    '규칙:\n' +
    '- ' + CONCEPT_COUNT + '개 컨셉이 서로 시각적으로 확연히 달라야 함\n' +
    '- palette에 실제 HEX 코드 포함\n' +
    '- 세로형 표지(2:3 비율) 배경 전용 디자인\n' +
    '- 텍스트는 넣지 않음';

  try {
    var raw = await callClaudeApi({
      apiKey: apiKey,
      model: 'claude-haiku-4-5-20251001',
      prompt: prompt,
      noPersona: true,
      maxTokens: 1500,
      temperature: 0.9
    });

    // JSON 파싱
    var arr = _parseConceptsJson(raw);
    if (!arr || arr.length === 0) throw new Error('컨셉 파싱 실패');

    _concepts = arr.slice(0, CONCEPT_COUNT);
    _selectedIdx = -1;
    if (stEl) stEl.textContent = _concepts.length + '개 컨셉 생성 완료';
  } catch (e) {
    console.warn('[p17-concepts] 컨셉 생성 실패:', e.message);
    if (stEl) stEl.textContent = '생성 실패: ' + e.message;
  }

  _busy = false;
  _renderConceptArea();
}

function _parseConceptsJson(raw) {
  // 마크다운 코드블록 제거
  var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // 최외곽 [] 추출
  var m = clean.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); }
  catch (e) {
    // trailing comma 제거 후 재시도
    var fixed = m[0].replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(fixed); }
    catch (e2) { return null; }
  }
}

// ──────────────────────────────────────────────
// 컨셉 선택/해제
// ──────────────────────────────────────────────
function p17_selectConcept(idx) {
  _selectedIdx = (_selectedIdx === idx) ? -1 : idx;
  _renderConceptArea();
}

function p17_clearConcepts() {
  _selectedIdx = -1;
  _renderConceptArea();
}

// ──────────────────────────────────────────────
// 참고 이미지 업로드/분석/제거
// ──────────────────────────────────────────────
function p17_uploadRef(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('파일 크기가 10MB를 초과합니다.');
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    _refDataUrl = e.target.result;
    var semi = _refDataUrl.indexOf(';');
    if (semi > 5) _refMediaType = _refDataUrl.substring(5, semi);
    // 새 이미지 업로드 시 이전 분석+컨셉+이미지 초기화
    _refAnalysis = null;
    _concepts = [];
    _selectedIdx = -1;
    if (typeof p17_clearBg === 'function') p17_clearBg();
    _renderConceptArea();
    _renderRefArea();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function p17_analyzeRef() {
  if (!_refDataUrl) return;

  // 재분석 시 이전 컨셉+이미지 초기화
  _concepts = [];
  _selectedIdx = -1;
  _renderConceptArea();
  if (typeof p17_clearBg === 'function') p17_clearBg();

  // OpenAI API 키 사용 (표지 시안과 동일)
  var apiKey = '';
  try { apiKey = localStorage.getItem('p17_openai_key') || localStorage.getItem('p11_openai_key') || ''; }
  catch(e) {}
  if (!apiKey) {
    alert('OpenAI API 키가 설정되지 않았습니다.\n개발자 콘솔(Ctrl+Alt+Enter)에서 등록하세요.');
    return;
  }

  var btn = document.getElementById('p17_refAnalyzeBtn');
  if (btn) { btn.disabled = true; btn.textContent = '분석 중…'; }
  var stEl = document.getElementById('p17_refStatus');
  if (stEl) stEl.textContent = 'Step 1: Vision 분석 중… (GPT-4o)';

  var b64Data = _refDataUrl.substring(_refDataUrl.indexOf(',') + 1);

  try {
    var res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a visual analysis expert for book cover design.\n' +
              'Analyze the reference image and return a JSON object with exactly these keys.\n' +
              'Use concrete nouns, specific numbers, and measurable descriptors — NOT abstract adjectives.\n' +
              'Example: "warm side light at 45° from upper-left, soft shadows, ~4000K" instead of "beautiful warm lighting".\n\n' +
              'Required JSON keys:\n' +
              '{\n' +
              '  "subject": "type, shape, pose, count of main subjects",\n' +
              '  "composition": "angle, framing, placement using thirds/golden ratio, percentages",\n' +
              '  "lighting": "direction (angle), intensity (soft/hard), color temp (K), shadow type",\n' +
              '  "color_palette": "3-5 HEX codes + saturation(low/mid/high) + value(dark/mid/bright)",\n' +
              '  "texture_material": "surface quality (smooth/rough/grainy), material (metal/paper/fabric/glass)",\n' +
              '  "mood_atmosphere": "atmosphere using sensory words, not emotional adjectives",\n' +
              '  "style": "medium (photo/illustration/3D/vector) + sub-style (flat/isometric/watercolor etc)",\n' +
              '  "technical": "lens feel (wide/tele/macro), depth of field, film/digital look, post-processing"\n' +
              '}\n\n' +
              'Return ONLY the JSON object. No markdown, no explanation.'
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'data:' + _refMediaType + ';base64,' + b64Data, detail: 'high' } },
              { type: 'text', text: 'Analyze this reference image for book cover design reproduction. Return the JSON.' }
            ]
          }
        ]
      })
    });

    if (res.status === 401) throw new Error('API 키가 유효하지 않습니다.');
    if (res.status === 429) throw new Error('요청 한도 초과 — 잠시 후 재시도하세요.');
    if (!res.ok) {
      var errBody = await res.text();
      throw new Error('API 오류 (' + res.status + '): ' + errBody.slice(0, 200));
    }

    var data = await res.json();
    var rawJson = data.choices[0].message.content;

    // JSON 파싱
    try {
      _refAnalysis = JSON.parse(rawJson);
    } catch(e) {
      var cleaned = rawJson.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      _refAnalysis = JSON.parse(cleaned);
    }

    // JSON 정규화 — 배열→문자열, 예상 외 키 흡수
    _refAnalysis = _normalizeAnalysis(_refAnalysis);

    console.log('[Step 1] Vision 분석 결과:');
    console.log(JSON.stringify(_refAnalysis, null, 2));

    if (stEl) stEl.textContent = '분석 완료 (8개 카테고리)';
  } catch (e) {
    console.warn('[p17-concepts] Vision 분석 실패:', e.message);
    if (stEl) stEl.textContent = '분석 실패: ' + e.message;
  }

  _renderRefArea();
}

function p17_clearRef() {
  _refDataUrl = '';
  _refAnalysis = null;
  _renderRefArea();
}

// ──────────────────────────────────────────────
// 프롬프트 보강 텍스트 반환
// p17_genDesign()에서 호출. 빈 문자열이면 기존 동작 유지.
// ──────────────────────────────────────────────
/** Vision JSON 정규화 — 배열→문자열, 예상 외 키(saturation/value 등)를 color_palette에 흡수 */
function _normalizeAnalysis(a) {
  if (!a || typeof a !== 'object') return a;
  var KEYS = ['subject','composition','lighting','color_palette','texture_material','mood_atmosphere','style','technical'];
  // 모든 값을 문자열로 변환
  for (var i = 0; i < KEYS.length; i++) {
    var k = KEYS[i];
    if (Array.isArray(a[k])) a[k] = a[k].join(', ');
    else if (a[k] && typeof a[k] === 'object') a[k] = JSON.stringify(a[k]);
  }
  // saturation/value 등 예상 외 키를 color_palette에 병합
  var extras = [];
  if (a.saturation) { extras.push('saturation: ' + a.saturation); delete a.saturation; }
  if (a.value) { extras.push('value: ' + a.value); delete a.value; }
  if (extras.length > 0 && a.color_palette) {
    a.color_palette += ' (' + extras.join(', ') + ')';
  }
  return a;
}

/** Step 1 JSON → Step 2 자연어 프롬프트 조립
 *  순서: style → subject → composition → lighting → color_palette → texture → mood → technical
 *  각 요소를 문장 단위로 구성 */
function _assembleFromAnalysis(a) {
  function _s(v) { return Array.isArray(v) ? v.join(', ') : String(v || ''); }
  var parts = [];
  if (a.style) parts.push('The image should be rendered as ' + _s(a.style) + '.');
  if (a.subject) parts.push('The main subject consists of ' + _s(a.subject) + '.');
  if (a.composition) parts.push('Compose the scene with ' + _s(a.composition) + '.');
  if (a.lighting) parts.push('The lighting setup uses ' + _s(a.lighting) + '.');
  if (a.color_palette) parts.push('The color palette features ' + _s(a.color_palette) + '.');
  if (a.texture_material) parts.push('Textures and materials include ' + _s(a.texture_material) + '.');
  if (a.mood_atmosphere) parts.push('The overall atmosphere conveys ' + _s(a.mood_atmosphere) + '.');
  if (a.technical) parts.push('Technical look: ' + _s(a.technical) + '.');
  return parts.join('\n\n');
}

/** panel17.js p17_genDesign()이 호출하는 프롬프트 반환 함수.
 *  빈 문자열이면 기존 동작 유지. */
function p17_getConceptPrompt() {
  var parts = [];

  // 선택된 컨셉 (Claude가 생성한 텍스트 기반)
  if (_selectedIdx >= 0 && _concepts[_selectedIdx]) {
    var c = _concepts[_selectedIdx];
    parts.push(
      'SELECTED CONCEPT DIRECTION (follow this closely):\n' +
      '- Style: ' + (c.style || '') + '\n' +
      '- Color palette: ' + (c.palette || '') + '\n' +
      '- Composition: ' + (c.composition || '') + '\n' +
      '- Key elements: ' + (c.elements || '') + '\n' +
      '- Mood: ' + (c.mood || '')
    );
  }

  // 참고 이미지 Vision 분석 (Step 1 JSON → 문장 조립)
  if (_refAnalysis && typeof _refAnalysis === 'object') {
    parts.push('REFERENCE IMAGE ANALYSIS (reproduce this style closely):\n' +
      _assembleFromAnalysis(_refAnalysis));
  }

  return parts.join('\n\n');
}

/** Vision 분석 JSON 반환 (panel17.js에서 색상 추출 등에 사용) */
function p17_getRefAnalysis() {
  return _refAnalysis;
}

// ──────────────────────────────────────────────
// 초기 렌더링
// ──────────────────────────────────────────────
function _init() {
  _renderConceptArea();
  _renderRefArea();
}

// panel17.js가 먼저 실행되어 컨테이너가 이미 존재함 — 즉시 초기화
_init();

// ──────────────────────────────────────────────
// window 노출
// ──────────────────────────────────────────────
window.p17_generateConcepts = p17_generateConcepts;
window.p17_selectConcept = p17_selectConcept;
window.p17_clearConcepts = p17_clearConcepts;
window.p17_uploadRef = p17_uploadRef;
window.p17_analyzeRef = p17_analyzeRef;
window.p17_clearRef = p17_clearRef;
window.p17_getConceptPrompt = p17_getConceptPrompt;
window.p17_getRefAnalysis = p17_getRefAnalysis;
window.p17_getSelectedConcept = function() {
  return (_selectedIdx >= 0 && _concepts[_selectedIdx]) ? _concepts[_selectedIdx] : null;
};

})();
