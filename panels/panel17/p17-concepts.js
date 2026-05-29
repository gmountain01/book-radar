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
      if (c.typography) html += '<div class="p17c-desc" style="color:var(--accent,#3b3f8c)">' + _esc(c.typography) + '</div>';
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
      // 분석 결과 상세 표시
      var keys = ['style','subject','composition','lighting','color_palette','texture_material','mood_atmosphere','technical'];
      var labels = {style:'🎨 스타일',subject:'📐 피사체',composition:'📏 구도',lighting:'💡 조명',
        color_palette:'🎨 색상 팔레트',texture_material:'🧱 질감·소재',mood_atmosphere:'🌄 분위기',technical:'📷 기술 특성'};
      var icons = {style:'medium',subject:'elements',composition:'layout',lighting:'light',
        color_palette:'color',texture_material:'texture',mood_atmosphere:'mood',technical:'camera'};

      html += '<div class="p17c-ref-result">';
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        if (!_refAnalysis[k]) continue;
        html += '<div class="p17c-ref-row">';
        html += '<span class="p17c-ref-key">' + labels[k] + '</span>';
        html += '<span class="p17c-ref-val">' + _esc(_refAnalysis[k]) + '</span>';

        // 색상 팔레트: HEX 코드 시각화
        if (k === 'color_palette') {
          var hexes = String(_refAnalysis[k]).match(/#[0-9a-fA-F]{3,8}/g) || [];
          if (hexes.length > 0) {
            html += '<div class="p17c-ref-swatches" style="display:flex;gap:3px;margin-top:3px">';
            for (var hi = 0; hi < hexes.length; hi++) {
              html += '<span style="display:inline-block;width:20px;height:20px;border-radius:4px;border:1px solid rgba(0,0,0,.15);background:' + hexes[hi] + '" title="' + hexes[hi] + '"></span>';
            }
            html += '</div>';
          }
        }
        html += '</div>';
      }

      // 활용 가이드
      html += '<div style="margin-top:8px;padding:6px 8px;background:var(--surface2,#f8f7ff);border-radius:6px;font-size:10px;line-height:1.5;color:var(--muted)">';
      html += '<strong style="color:var(--accent,#3b3f8c)">활용 방법</strong><br>';
      html += '• [컨셉 생성] 시 위 분석 결과가 자동 반영됩니다<br>';
      html += '• 1개는 원본에 가깝게, 나머지는 색상·구도·분위기 변형으로 생성<br>';
      html += '• 직접 [AI 표지 생성]하면 배경 디자인에도 스타일 반영';
      html += '</div>';

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
  console.log('[p17-concepts] 컨셉 생성 시작');
  if (_busy) { console.log('[p17-concepts] _busy=true, 무시'); return; }
  if (typeof callClaudeApi !== 'function' || typeof loadApiKey !== 'function') {
    alert('Claude API가 로드되지 않았습니다.\n통합현황 탭에서 API 키를 먼저 설정하세요.');
    return;
  }
  var apiKey;
  try { apiKey = await loadApiKey(); } catch(lke) { console.error('[p17-concepts] loadApiKey 오류:', lke); }
  if (!apiKey) {
    alert('Claude API 키가 설정되지 않았습니다.\n통합현황 탭에서 API 키를 먼저 설정하세요.');
    return;
  }
  console.log('[p17-concepts] API 키 확인됨');

  // 책 정보 수집
  var d = (typeof p17_getData === 'function') ? p17_getData() : {};
  console.log('[p17-concepts] 책 데이터:', d.title ? d.title.slice(0, 20) : '(없음)');
  if (!d.title) { alert('표1의 제목을 먼저 입력하세요.'); return; }

  // 재생성 시 이전 컨셉+이미지 초기화
  _concepts = [];
  _selectedIdx = -1;
  if (typeof p17_clearBg === 'function') p17_clearBg();

  _busy = true;
  var cBtn = document.getElementById('p17_conceptBtn');
  if (cBtn) { cBtn.disabled = true; cBtn.textContent = '생성 중…'; }

  var stEl = document.getElementById('p17_conceptStatus');
  if (stEl) stEl.textContent = '컨셉 생성 중… (10~15초 소요)';

  // Vision 분석 결과가 있으면 프롬프트에 포함
  var refSection = '';
  if (_refAnalysis && typeof _refAnalysis === 'object') {
    var a = _refAnalysis;
    refSection = '\n[참고 이미지 상세 분석 — 이 스타일을 기반으로 변형하세요]\n';
    if (a.style) refSection += '- 스타일/매체: ' + a.style + '\n';
    if (a.subject) refSection += '- 피사체/요소: ' + a.subject + '\n';
    if (a.composition) refSection += '- 구도/레이아웃: ' + a.composition + '\n';
    if (a.lighting) refSection += '- 조명: ' + a.lighting + '\n';
    if (a.color_palette) refSection += '- 색상 팔레트: ' + a.color_palette + '\n';
    if (a.texture_material) refSection += '- 질감/소재: ' + a.texture_material + '\n';
    if (a.mood_atmosphere) refSection += '- 분위기: ' + a.mood_atmosphere + '\n';
    if (a.technical) refSection += '- 카메라/후처리: ' + a.technical + '\n';
    refSection += '\n변형 규칙:\n' +
      '- 컨셉 1: 원본 스타일에 가장 가깝게 (색상·구도 유사, 피사체만 변형)\n' +
      '- 컨셉 2: 같은 색상 팔레트 + 다른 구도/레이아웃\n' +
      '- 컨셉 3: 같은 구도 + 완전히 다른 색상 (보색 또는 다른 온도)\n' +
      '- 컨셉 4: 같은 분위기/무드 + 다른 매체 (예: 사진→일러스트, 또는 반대)\n';
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
    '    "mood": "전체 분위기 한 줄 (예: 전문적이면서 접근하기 쉬운)",\n' +
    '    "typography": "타이포그래피 방향 (예: 굵은 고딕 제목+가는 명조 부제, 흰색 위 어두운 배경)"\n' +
    '  }\n' +
    ']\n\n' +
    '규칙:\n' +
    '- ' + CONCEPT_COUNT + '개 컨셉이 서로 시각적으로 확연히 달라야 함\n' +
    '- palette에 실제 HEX 코드 포함\n' +
    '- 세로형 표지(2:3 비율) 완성 표지 디자인 (텍스트 포함)\n' +
    '- typography 필드에 타이포그래피 방향 명시 (제목 폰트 스타일, 크기 비율, 배치)\n' +
    '- 배경과 텍스트의 대비가 충분해야 함';

  try {
    var raw = await callClaudeApi({
      apiKey: apiKey,
      model: 'claude-haiku-4-5-20251001',
      prompt: prompt,
      noPersona: true,
      maxTokens: 3000,
      temperature: 0.9
    });

    // JSON 파싱
    console.log('[p17-concepts] Claude 원본 응답 (첫 500자):', raw.slice(0, 500));
    var arr = _parseConceptsJson(raw);
    if (!arr || arr.length === 0) {
      console.error('[p17-concepts] 파싱 실패. 전체 응답:', raw);
      throw new Error('컨셉 JSON 파싱 실패 — F12 콘솔에서 원본 응답 확인하세요');
    }

    _concepts = arr.slice(0, CONCEPT_COUNT);
    _selectedIdx = -1;
    if (stEl) stEl.textContent = _concepts.length + '개 컨셉 생성 완료';
  } catch (e) {
    console.error('[p17-concepts] 컨셉 생성 실패:', e);
    var errMsg = e.message || '알 수 없는 오류';
    if (stEl) stEl.textContent = '생성 실패: ' + errMsg;
    alert('컨셉 생성 실패:\n' + errMsg);
  }

  _busy = false;
  _renderConceptArea();
}

function _parseConceptsJson(raw) {
  // Step 1: 마크다운 코드블록 제거
  var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Step 2: 최외곽 [] 추출
  var m = clean.match(/\[[\s\S]*\]/);
  if (!m) {
    console.warn('[p17-concepts] JSON 배열 [] 미발견, 전체에서 {} 개별 추출 시도');
    // 폴백: 개별 {} 객체 추출
    var objs = [];
    var objRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    var om;
    while ((om = objRe.exec(clean)) !== null) {
      try { objs.push(JSON.parse(om[0])); } catch(oe) {}
    }
    return objs.length > 0 ? objs : null;
  }

  // Step 3: 문자열 내 리터럴 줄바꿈 이스케이프 (Claude가 JSON 문자열 안에 실제 개행 넣는 경우)
  var jsonStr = m[0];
  jsonStr = jsonStr.replace(/"([^"]*?)"/g, function(match) {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '');
  });

  // Step 4: 파싱 시도
  try { return JSON.parse(jsonStr); }
  catch (e) {
    // Step 5: trailing comma 제거
    var fixed = jsonStr.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(fixed); }
    catch (e2) {
      console.warn('[p17-concepts] JSON.parse 실패, 개별 객체 추출 폴백');
      // Step 6: 최종 폴백 — 개별 {} 추출
      var objs2 = [];
      var objRe2 = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      var om2;
      while ((om2 = objRe2.exec(fixed)) !== null) {
        try { objs2.push(JSON.parse(om2[0])); } catch(oe2) {}
      }
      return objs2.length > 0 ? objs2 : null;
    }
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
            content: 'You are a professional book cover designer analyzing a reference image.\n' +
              'Your goal: extract enough detail to REPRODUCE this visual style in a new cover design.\n\n' +
              'Use concrete, measurable, actionable descriptors — NOT abstract adjectives.\n' +
              'Bad: "beautiful warm atmosphere" → Good: "warm side light at 45° from upper-left, soft diffused shadows, color temperature ~4000K"\n' +
              'Bad: "nice blue colors" → Good: "#1a2744 deep navy 60% + #c9884c copper gold 25% + #f5f0e8 warm cream 15%"\n\n' +
              'Required JSON keys:\n' +
              '{\n' +
              '  "style": "medium (photo/illustration/3D render/vector/collage) + sub-style (flat/isometric/watercolor/cyberpunk/minimal etc) + era reference if applicable",\n' +
              '  "subject": "type, shape, count, size relative to frame (%), position (center/left/right/scattered), foreground vs background elements",\n' +
              '  "composition": "camera angle (eye-level/high/low/bird), framing (tight/medium/wide), rule of thirds placement, negative space location and percentage, text placement zones",\n' +
              '  "lighting": "direction (angle degrees from top), intensity (soft diffused / hard dramatic), color temperature (K), shadow type (soft/hard/none), highlights, rim light, ambient vs directional ratio",\n' +
              '  "color_palette": "list ALL major colors as: name + HEX + area percentage. Min 3, max 6 colors. Include: dominant(60%), secondary(25%), accent(15%). Note: warm/cool bias, saturation level(low/mid/high), value distribution(dark-heavy/balanced/light-heavy)",\n' +
              '  "texture_material": "surface quality (smooth/rough/grainy/glossy/matte), specific material reference (brushed metal/kraft paper/linen/glass/concrete), grain/noise level, any overlay effects (halftone/distress/scan lines)",\n' +
              '  "mood_atmosphere": "describe using sensory comparisons: temperature(warm/cool), weight(heavy/light), density(sparse/dense), movement(static/dynamic), time of day, season — NOT emotional words like beautiful/nice",\n' +
              '  "technical": "simulated lens (24mm wide / 50mm normal / 85mm portrait / 135mm tele), depth of field (shallow bokeh / deep), film stock feel (Kodak Portra warm / Fuji Velvia saturated / digital clean), post-processing (high contrast / low contrast / desaturated / cross-processed), any visible effects (grain/vignette/light leak/chromatic aberration)"\n' +
              '}\n\n' +
              'Return ONLY the JSON object. No markdown, no explanation, no text before or after the JSON.'
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
  if (a.style) parts.push('STYLE & MEDIUM: Render as ' + _s(a.style) + '. Match this exact visual medium and sub-style.');
  if (a.subject) parts.push('VISUAL ELEMENTS: Include ' + _s(a.subject) + '. Maintain similar scale and positioning.');
  if (a.composition) parts.push('COMPOSITION: Follow this layout — ' + _s(a.composition) + '. Preserve the negative space distribution.');
  if (a.lighting) parts.push('LIGHTING: Reproduce this lighting setup — ' + _s(a.lighting) + '. Match direction, intensity, and color temperature.');
  if (a.color_palette) parts.push('COLOR PALETTE (CRITICAL): Use exactly these colors — ' + _s(a.color_palette) + '. Maintain the same dominant/secondary/accent ratio.');
  if (a.texture_material) parts.push('TEXTURE & MATERIAL: Apply ' + _s(a.texture_material) + '. Match the surface quality and material feel.');
  if (a.mood_atmosphere) parts.push('ATMOSPHERE: The overall feel should be ' + _s(a.mood_atmosphere) + '.');
  if (a.technical) parts.push('CAMERA & POST-PROCESSING: Simulate ' + _s(a.technical) + '.');
  return parts.join('\n');
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
      '- Mood: ' + (c.mood || '') + '\n' +
      (c.typography ? '- Typography: ' + c.typography : '')
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
