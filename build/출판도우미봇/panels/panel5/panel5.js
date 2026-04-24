/* ===================================================
   기획서 작성 탭 (panel5) 로직
   =================================================== */

const PROP_GOALS = [
  '시장 1위(전략 도서)', '베스트셀러 20위 내', '근구간 매출 견인',
  '시장 개척(타 분야)', '시리즈 라인업 확대', 'New 트렌드 대응(발굴)',
  '세부 분야 대표 도서', '개정 통한 매출 관리'
];

const PROP_KP_DEFAULTS = [
  {title:'빠른 실습 구조', desc:'즉시 따라할 수 있는 단계별 실습으로 학습 진입장벽 최소화'},
  {title:'실무 직결 콘텐츠', desc:'현장에서 바로 써먹을 수 있는 구체적 예시와 템플릿 제공'},
  {title:'차별화된 구성', desc:'기존 경쟁서에서 다루지 않는 독점 콘텐츠와 실패 사례 분석'}
];

let _propCompRows = 0;
let _propSelectedCat = null;

function initPropTab() {
  // 기획 목표 체크박스
  const goals = document.getElementById('prop-goals');
  if (!goals || goals.children.length > 0) return;
  goals.innerHTML = PROP_GOALS.map((g, i) =>
    `<label class="prop-goal-item"><input type="checkbox" id="pg-${i}" onchange="propRender()"><span>${g}</span></label>`
  ).join('');

  // 핵심 포인트 기본 3개
  const kp = document.getElementById('prop-keypoints');
  kp.innerHTML = PROP_KP_DEFAULTS.map((d, i) => `<div class="prop-kp-row">
      <input type="text" id="pkp-t-${i}" value="${d.title}" placeholder="포인트 제목" oninput="propRender()">
      <textarea id="pkp-d-${i}" placeholder="설명"  oninput="propRender()">${d.desc}</textarea>
    </div>`).join('');

  // 오늘 날짜
  const dateEl = document.getElementById('pf-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

  // 약점 카테고리 + 드롭다운 렌더
  renderPropCats();
  renderPropQuickDropdown();
  propRender();
}

let _propCatsShowAll = false;

function togglePropCatsAll() {
  _propCatsShowAll = !_propCatsShowAll;
  const toggle = document.querySelector('.prop-cats-toggle');
  if (toggle) toggle.textContent = _propCatsShowAll ? '접기' : '전체 보기';
  renderPropCats();
}

function renderPropQuickDropdown() {
  const sel = document.getElementById('prop-quick-cat');
  if (!sel) return;
  const prev = sel.value;
  // 옵션 초기화 (첫 번째 플레이스홀더 유지)
  const placeholder = sel.options[0] ? sel.options[0].outerHTML : '';
  if (!analysisData || !analysisData.length) {
    sel.innerHTML = placeholder;
    return;
  }

  const statusLabel = {gap:'▲ 공백', behind:'△ 열세', leading:'● 우위', 'plan-only':'○ 수요'};
  const sorted = [...analysisData].sort((a, b) => {
    const order = {gap:0, behind:1, 'plan-only':2, leading:3};
    return (order[a.status]??9) - (order[b.status]??9);
  });
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const newOptions = sorted.map(d => {
    const lec = d.lecture.length ? ` · 강의 ${d.lecture.length}개` : '';
    const label = `${statusLabel[d.status]||d.status}  ${d.cat}${lec}`;
    return `<option value="${esc(d.cat)}">${esc(label)}</option>`;
  }).join('');
  sel.innerHTML = placeholder + newOptions;
  if (prev) sel.value = prev;
}

function propQuickCatChange() {
  const cat = document.getElementById('prop-quick-cat')?.value;
  if (cat) propSelectCat(cat);
}

async function propQuickGenerate() {
  const cat = (document.getElementById('prop-quick-cat')?.value || '').trim();
  const author = (document.getElementById('prop-quick-author')?.value || '').trim();
  const apiKey = (await loadApiKey()).trim();

  if (!apiKey) {
    showToast('API 키가 없습니다. AI 생성 시 사전 확인 창에서 입력해주세요.', 'red');
    switchTab(3, document.getElementById('tab3'));
    return;
  }
  if (!cat) {
    showToast('카테고리를 선택해주세요.', 'red');
    document.getElementById('prop-quick-cat')?.focus();
    return;
  }

  // 카테고리 선택 → 경쟁 데이터 자동 채움
  propSelectCat(cat);

  // 저자명 반영
  if (author) {
    const authorEl = document.getElementById('pf-author');
    if (authorEl) authorEl.value = author;
  }

  // AI 생성 실행
  generatePlan5WithAI();
}

function renderPropCats() {
  const el = document.getElementById('prop-cats');
  if (!el) return;
  if (!analysisData || !analysisData.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;">분석 데이터가 없습니다. 먼저 분석을 실행해주세요.</div>';
    return;
  }
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const statusLabel = {gap:'공백',behind:'우리 열세',leading:'우위',  'plan-only':'수요'};
  const statusBg = {gap:'#fdf0ee',behind:'#fdf5e0',leading:'#eaf5ed','plan-only':'#eef4ff'};
  const statusFg = {gap:'#c0392b',behind:'#c07a00',leading:'#1a6b3c','plan-only':'#2563eb'};
  const statusBd = {gap:'#f0c0bc',behind:'#f0d890',leading:'#a8d8b8','plan-only':'#bfdbfe'};

  const allItems = [...analysisData].sort((a, b) => {
    const scoreA = (a.status==='gap'?40:a.status==='behind'?20:5) + a.comp.length*2 + a.lecture.length*3;
    const scoreB = (b.status==='gap'?40:b.status==='behind'?20:5) + b.comp.length*2 + b.lecture.length*3;
    return scoreB - scoreA;
  });
  const items = _propCatsShowAll ? allItems : allItems.filter(d => d.status === 'gap' || d.status === 'behind').slice(0, 8);

  if (!items.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;">공백/열세 카테고리가 없습니다.</div>';
    return;
  }
  el.innerHTML = items.map(d => {
    const lec = d.lecture.length ? `강의 ${d.lecture.length}개` : '';
    const comp = d.comp.length ? `경쟁사 ${d.comp.length}권` : '';
    const meta = [comp, lec].filter(Boolean).join(' · ');
    const isSelected = _propSelectedCat === d.cat;
    return `<div class="prop-cat-item${isSelected?' selected':''}" id="pcat-${d.cat.replace(/[^a-zA-Z0-9가-힣]/g,'_')}" data-cat="${esc(d.cat)}" onclick="propSelectCat(this.dataset.cat)">
      <span class="prop-cat-badge" style="background:${statusBg[d.status]||'#f5f5f5'};color:${statusFg[d.status]||'#888'};border:1px solid ${statusBd[d.status]||'#ddd'};">${statusLabel[d.status]||d.status}</span>
      <span class="prop-cat-name">${d.cat}</span>
      <span class="prop-cat-meta">${meta}</span>
    </div>`;
  }).join('');
}

function propSelectCat(cat) {
  _propSelectedCat = cat;
  document.querySelectorAll('.prop-cat-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`pcat-${cat.replace(/[^a-zA-Z0-9가-힣]/g,'_')}`);
  if (el) el.classList.add('selected');
  // 드롭다운 동기화
  const sel = document.getElementById('prop-quick-cat');
  if (sel && sel.value !== cat) sel.value = cat;

  // 도서명/분야 자동 제안
  const titleEl = document.getElementById('pf-title');
  if (titleEl && !titleEl.value) titleEl.value = `${cat} 완전 정복 (가제)`;
  const fieldEl = document.getElementById('pf-field');
  if (fieldEl && !fieldEl.value) fieldEl.value = cat;

  // 경쟁 분석 자동 입력
  const d = analysisData.find(x => x.cat === cat);
  if (d) {
    const compList = document.getElementById('prop-comp-list');
    compList.innerHTML = '';
    _propCompRows = 0;
    d.comp.slice(0, 5).forEach(book => {
      addPropCompRow(book.title || '', book.pub || '', book.year ? `${book.year}` : '', book.rank ? `${book.rank}위` : '');
    });
    if (!_propCompRows) addPropCompRow();
  }
  propRender();
}

function propAddComp() { addPropCompRow(); propRender(); }
function addPropCompRow(title='', pub='', year='', rank='') {
  const i = _propCompRows++;
  const el = document.getElementById('prop-comp-list');
  el.innerHTML += `<div class="prop-comp-row" id="pcr-${i}">
    <input type="text" id="pc-title-${i}" placeholder="도서명" value="${title}" oninput="propRender()" style="flex:2;">
    <input type="text" id="pc-pub-${i}" placeholder="출판사" value="${pub}" oninput="propRender()">
    <input type="text" id="pc-year-${i}" placeholder="연도" value="${year}" oninput="propRender()" style="width:56px;flex:none;">
    <button class="prop-comp-del" onclick="removePropComp(${i})">✕</button>
  </div>`;
}
function removePropComp(i) {
  const el = document.getElementById(`pcr-${i}`);
  if (el) { el.remove(); propRender(); }
}

function getPropData() {
  const g = v => { const el = document.getElementById(v); return el ? el.value.trim() : ''; };
  const goals = PROP_GOALS.map((label, i) => ({label, checked: document.getElementById(`pg-${i}`)?.checked || false}));
  const kps = PROP_KP_DEFAULTS.map((_, i) => ({
    title: g(`pkp-t-${i}`), desc: g(`pkp-d-${i}`)
  }));
  const comps = [];
  for (let i = 0; i < _propCompRows; i++) {
    const titleEl = document.getElementById(`pc-title-${i}`);
    if (!titleEl) continue;
    const t = titleEl.value.trim();
    if (t) comps.push({
      title: t,
      pub: g(`pc-pub-${i}`),
      year: g(`pc-year-${i}`)
    });
  }
  return {
    title: g('pf-title'), field: g('pf-field'), author: g('pf-author'),
    writer: g('pf-writer'), date: g('pf-date'),
    concept: g('pf-concept'),
    readerCore: g('pf-reader-core'), readerBudget: g('pf-reader-budget'),
    readerNeeds: g('pf-reader-needs'), readerExt: g('pf-reader-ext'),
    diff: g('pf-diff'), goals, kps, comps,
    price: g('pf-price'), pages: g('pf-pages'),
    advance: g('pf-advance'), royalty: g('pf-royalty'),
  };
}

function propRender() {
  const d = getPropData();
  const doc = document.getElementById('prop-doc');
  if (!doc) return;

  const dateStr = d.date ? new Date(d.date).toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'}) : '';
  const goalsOn = d.goals.filter(g => g.checked).map(g =>
    `<span class="pd2-goal-chip pd2-goal-on">${g.label}</span>`).join('');
  const goalsOff = d.goals.filter(g => !g.checked).map(g =>
    `<span class="pd2-goal-chip pd2-goal-off">${g.label}</span>`).join('');

  const kpHtml = d.kps.filter(k => k.title).map((k, i) =>
    `<div class="pd2-kp-item">
      <div class="pd2-kp-num">${i+1}</div>
      <div class="pd2-kp-body"><div class="pd2-kp-title">${k.title}</div><div class="pd2-kp-desc">${k.desc}</div></div>
    </div>`
  ).join('');

  const compHtml = d.comps.length ? `
    <table class="pd2-comp-table">
      <tr><th>도서명</th><th>출판사</th><th>연도</th></tr>
      ${d.comps.map(c=>`<tr><td>${c.title}</td><td>${c.pub}</td><td>${c.year}</td></tr>`).join('')}
    </table>` : '<div style="color:#bbb;font-size:11px;padding:8px 0;">경쟁 도서를 입력해주세요.</div>';

  // 출판 일정 데이터
  const schStart = document.getElementById('pf-sch-start')?.value || '';
  const schSubmit = document.getElementById('pf-sch-submit')?.value || '';
  const schEdit = document.getElementById('pf-sch-edit')?.value || '';
  const schPub = document.getElementById('pf-sch-pub')?.value || '';
  const fmtMonth = v => v ? new Date(v+'-01').toLocaleDateString('ko-KR',{year:'numeric',month:'long'}) : '—';
  const hasSchedule = schStart || schSubmit || schEdit || schPub;

  // 수익성 분석 데이터
  const profitCopies = parseInt(document.getElementById('pf-copies')?.value) || 0;
  const profitPrice = parseInt(document.getElementById('pf-price2')?.value) || 0;
  const profitRoyaltyStr = document.getElementById('pf-royalty')?.value || '8';
  const profitRoyalty = parseFloat(profitRoyaltyStr) / 100 || 0.08;
  const profitAdvance = parseInt((document.getElementById('pf-advance')?.value || '0').replace(/,/g,'')) || 0;
  const hasProfit = profitCopies > 0 && profitPrice > 0;

  doc.innerHTML = `
    <div class="pd2-header">
      <div>
        <div class="pd2-header-sub">집필 기획안 · ${d.field || '—'}</div>
        <div class="pd2-header-title">${d.title || '(도서명을 입력하세요)'}</div>
      </div>
      <div class="pd2-header-right">
        <div class="pd2-header-dept">작성자: ${d.writer || '—'}<br>작성일: ${dateStr || '—'}<br>저자: ${d.author || '—'}</div>
      </div>
    </div>

    <div class="pd2-body">
      <!-- 기획 목표 -->
      <div class="pd2-block">
        <div class="pd2-block-title">기획 목표</div>
        <div class="pd2-goals">${goalsOn}${goalsOff}</div>
      </div>

      <!-- 콘셉트 -->
      <div class="pd2-block">
        <div class="pd2-block-title">콘셉트</div>
        <div class="pd2-concept">${d.concept || '<span style="color:#bbb;">콘셉트를 입력해주세요.</span>'}</div>
      </div>

      <!-- 독자층 -->
      <div class="pd2-block">
        <div class="pd2-block-title">독자층</div>
        <div class="pd2-reader-grid">
          <div class="pd2-reader-card"><div class="pd2-reader-label">핵심 독자</div><div class="pd2-reader-val">${d.readerCore || '—'}</div></div>
          <div class="pd2-reader-card"><div class="pd2-reader-label">확산 독자</div><div class="pd2-reader-val">${d.readerExt || '—'}</div></div>
          <div class="pd2-reader-card" style="grid-column:1/-1;"><div class="pd2-reader-label">구매력 / 니즈</div><div class="pd2-reader-val">${[d.readerBudget, d.readerNeeds].filter(Boolean).join('<br>') || '—'}</div></div>
        </div>
      </div>

      <!-- 차별화 -->
      ${d.diff ? `<div class="pd2-block">
        <div class="pd2-block-title">차별화 전략</div>
        <div class="pd2-concept" style="border-left-color:#5b2d8e;">${d.diff}</div>
      </div>` : ''}

      <!-- 핵심 포인트 -->
      ${kpHtml ? `<div class="pd2-block">
        <div class="pd2-block-title">핵심 포인트</div>
        <div class="pd2-kp-list">${kpHtml}</div>
      </div>` : ''}

      <!-- 계약 정보 -->
      <div class="pd2-block">
        <div class="pd2-block-title">계약 정보</div>
        <table class="pd2-table">
          <tr><td class="label">예상 정가</td><td>${d.price||'—'}</td><td class="label">예상 페이지</td><td>${d.pages||'—'}</td></tr>
          <tr><td class="label">선인세</td><td>${d.advance ? d.advance+'원' : '—'}</td><td class="label">집필 인세</td><td>${d.royalty||'—'}</td></tr>
        </table>
      </div>

      <!-- 출판 일정 -->
      ${hasSchedule ? `<div class="pd2-block">
        <div class="pd2-block-title">출판 일정</div>
        <table class="pd2-table">
          <tr><td class="label">집필 시작</td><td>${fmtMonth(schStart)}</td><td class="label">원고 제출</td><td>${fmtMonth(schSubmit)}</td></tr>
          <tr><td class="label">편집 완료</td><td>${fmtMonth(schEdit)}</td><td class="label">출간 목표</td><td>${fmtMonth(schPub)}</td></tr>
        </table>
      </div>` : ''}

      <!-- 수익성 분석 -->
      ${hasProfit ? (() => {
        const totalRoy = profitPrice * profitRoyalty * profitCopies * 0.8;
        const netAfterAdv = totalRoy - profitAdvance;
        const bep = profitAdvance > 0 ? Math.ceil(profitAdvance / (profitPrice * profitRoyalty * 0.8)) : 0;
        return `<div class="pd2-block">
          <div class="pd2-block-title">수익성 분석</div>
          <table class="pd2-table">
            <tr><td class="label">초판 부수</td><td>${profitCopies.toLocaleString()}부</td><td class="label">예상 정가</td><td>${profitPrice.toLocaleString()}원</td></tr>
            <tr><td class="label">인세율</td><td>${(profitRoyalty*100).toFixed(1)}%</td><td class="label">총 인세 (초판)</td><td style="font-weight:700;color:#1a6b3c;">${totalRoy.toLocaleString()}원</td></tr>
            ${profitAdvance ? `<tr><td class="label">선인세 차감 후</td><td style="color:${netAfterAdv>=0?'#1a6b3c':'#ef4444'};font-weight:700;">${netAfterAdv.toLocaleString()}원</td><td class="label">손익분기 부수</td><td>${bep.toLocaleString()}부</td></tr>` : ''}
          </table>
        </div>`;
      })() : ''}

      <!-- 경쟁 분석 -->
      <div class="pd2-block">
        <div class="pd2-block-title">경쟁 분석</div>
        ${compHtml}
      </div>

    </div>

    <div class="pd2-footer">
      <div class="pd2-footer-l">한빛미디어 IT출판부<br>${dateStr}</div>
      <div class="pd2-footer-r">CONFIDENTIAL</div>
    </div>`;

}

function calcPropProfit() {
  const copies = parseInt(document.getElementById('pf-copies')?.value) || 0;
  const price = parseInt(document.getElementById('pf-price2')?.value) || 0;
  const royaltyStr = document.getElementById('pf-royalty')?.value || '8';
  const royalty = parseFloat(royaltyStr) / 100 || 0.08;
  const advance = parseInt((document.getElementById('pf-advance')?.value || '0').replace(/,/g,'')) || 0;
  const el = document.getElementById('prop-profit-result');
  if (!el) return;
  if (!copies || !price) { el.innerHTML = '초판 부수와 정가를 입력하면 자동 계산됩니다.'; return; }
  const totalRoyalty = price * royalty * copies * 0.8; // VAT 제외 기준
  const netAfterAdvance = totalRoyalty - advance;
  const breakeven = advance > 0 ? Math.ceil(advance / (price * royalty * 0.8)) : 0;
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.75rem;">
      <span style="color:var(--muted);">총 인세 (초판)</span><strong>${totalRoyalty.toLocaleString()}원</strong>
      <span style="color:var(--muted);">선인세 차감 후</span><strong style="color:${netAfterAdvance>=0?'var(--green)':'var(--red)'}">${netAfterAdvance.toLocaleString()}원</strong>
      ${breakeven?`<span style="color:var(--muted);">손익분기 부수</span><strong>${breakeven.toLocaleString()}부</strong>`:''}
    </div>`;
  propRender();
}

let _propFileText = '';

function loadPropFile(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('prop-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    _propFileText = e.target.result || '';
    const btn = document.getElementById('prop-file-ai-btn');
    if (_propFileText.trim()) {
      btn.disabled = false;
      btn.style.cssText = "width:100%;margin-top:.4rem;padding:.48rem;font-size:.78rem;font-weight:700;border:none;border-radius:7px;background:var(--green);color:#fff;cursor:pointer;font-family:inherit;transition:all .15s;";
    }
  };
  // docx는 텍스트 추출 불가 → 안내만 표시
  if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
    showToast('Word 파일은 텍스트(.txt)로 저장 후 업로드해주세요. 또는 내용을 복사하여 AI 프롬프트에 붙여넣기 하세요.', 'red');
    return;
  }
  reader.readAsText(file, 'utf-8');
}

async function fillFormFromFile() {
  if (!_propFileText.trim()) return;
  const apiKey = await loadApiKey();
  if (!apiKey) { showToast('API 키가 없습니다.', 'red'); return; }
  const btn = document.getElementById('prop-file-ai-btn');
  if (btn) { btn.disabled = true; btn.textContent = '분석 중\u2026'; }

  const excerpt = _propFileText.slice(0, 3000); // 토큰 절약
  const prompt = `아래는 출판사 기획안 문서입니다. 이 내용을 분석하여 출판 기획서 폼 항목을 JSON으로 추출해주세요.

[기획안 내용]
${excerpt}

아래 JSON 형식으로만 응답하세요. 해당 정보가 없으면 빈 문자열("")로 두세요.

{
  "title": "도서명(가제)",
  "field": "분야/카테고리",
  "author": "저자명",
  "concept": "도서 핵심 콘셉트 (2-4문장)",
  "reader_core": "핵심 독자층",
  "reader_ext": "확산 독자층",
  "diff": "차별화 포인트",
  "price": "예상 정가",
  "pages": "예상 페이지",
  "toc": [{"num":"1장","title":"장 제목","sub":"소제목"}],
  "goals": ["베스트셀러 진입", "시리즈 확장"],
  "schedule": "원고 제출 일정"
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: typeof _cachedSystem==='function'?_cachedSystem(PUBLISHING_PERSONA||''):undefined, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const res = await resp.json();
    const m = res.content[0].text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON 파싱 실패');
    const r = JSON.parse(m[0]);
    const sv = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    sv('pf-title', r.title); sv('pf-field', r.field); sv('pf-author', r.author);
    sv('pf-concept', r.concept); sv('pf-reader-core', r.reader_core);
    sv('pf-reader-ext', r.reader_ext); sv('pf-diff', r.diff);
    sv('pf-price', r.price); sv('pf-pages', r.pages);
    // 목차 채우기
    if (r.toc && r.toc.length) {
      document.getElementById('ptoc-rows').innerHTML = '';
      pTocCnt = 0;
      r.toc.forEach(t => pAddToc({ num: t.num, title: t.title, sub: t.sub || '' }));
    }
    propRender();
    showToast('기획안 파일 분석 완료! 내용을 확인하고 수정해주세요.', 'green');
  } catch (err) {
    showToast(`파일 분석 실패: ${err.message}`, 'red');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📂 기획안 분석 \u2192 폼 자동 채우기'; }
  }
}

function propReset() {
  if (!confirm('입력 내용을 모두 초기화할까요?')) return;
  ['pf-title','pf-field','pf-author','pf-writer','pf-concept',
   'pf-reader-core','pf-reader-budget','pf-reader-needs','pf-reader-ext','pf-diff',
   'pf-price','pf-pages','pf-advance','pf-royalty',
   'pf-sch-start','pf-sch-submit','pf-sch-edit','pf-sch-pub',
   'pf-copies','pf-price2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  PROP_GOALS.forEach((_, i) => {
    const el = document.getElementById(`pg-${i}`);
    if (el) el.checked = false;
  });
  PROP_KP_DEFAULTS.forEach((d, i) => {
    const t = document.getElementById(`pkp-t-${i}`);
    const dd = document.getElementById(`pkp-d-${i}`);
    if (t) t.value = d.title;
    if (dd) dd.value = d.desc;
  });
  const propCompList = document.getElementById('prop-comp-list');
  if (propCompList) propCompList.innerHTML = '';
  _propCompRows = 0;
  _propSelectedCat = null;
  _propFileText = '';
  const pfn = document.getElementById('prop-file-name');
  if (pfn) pfn.textContent = '파일 선택 (txt / docx)';
  const pfb = document.getElementById('prop-file-ai-btn');
  if (pfb) { pfb.disabled = true; pfb.style.cssText = "width:100%;margin-top:.4rem;padding:.48rem;font-size:.78rem;font-weight:700;border:none;border-radius:7px;background:var(--surface2);color:var(--muted);cursor:not-allowed;font-family:inherit;transition:all .15s;"; }
  const pfi = document.getElementById('prop-file-input');
  if (pfi) pfi.value = '';
  const ppr = document.getElementById('prop-profit-result');
  if (ppr) ppr.innerHTML = '초판 부수와 정가를 입력하면 자동 계산됩니다.';
  document.querySelectorAll('.prop-cat-item').forEach(el => el.classList.remove('selected'));
  propRender();
}

async function generatePlan5WithAI() {
  const apiKey = (await loadApiKey()).trim();
  if (!apiKey) { showToast('API 키가 없습니다. AI 생성 시 사전 확인 창에서 입력해주세요.', 'red'); return; }

  const catData = _propSelectedCat ? analysisData.find(x => x.cat === _propSelectedCat) : null;
  const currentTitle = (document.getElementById('pf-title')?.value || '').trim();
  const currentField = (document.getElementById('pf-field')?.value || '').trim();

  if (!catData && !currentTitle && !currentField) {
    showToast('카테고리를 선택하거나 도서명/분야를 입력한 후 사용해주세요.', 'red'); return;
  }

  const btn = document.getElementById('prop5-ai-btn');
  const qbtn = document.getElementById('prop-quick-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }
  if (qbtn) { qbtn.disabled = true; qbtn.textContent = '✨ AI 작성 중…'; }

  let ctx = '';
  if (catData) {
    const totalPop = catData.lecture.reduce((s, l) => s + (l.pop || 0), 0);
    ctx = `카테고리: ${catData.cat}
상태: ${({'gap':'공백(경쟁사만 있고 우리 도서 없음)','behind':'열세(경쟁사 우위)'}[catData.status] || catData.status)}
경쟁사 도서: ${catData.comp.length}권 / 우리 도서: ${catData.mine.length}권
강의 수: ${catData.lecture.length}개 / 총 수강생: ${totalPop.toLocaleString()}명
경쟁 최고순위: ${catData.compBest || '없음'}위
경쟁 도서: ${catData.comp.slice(0,5).map(b=>`"${b.title}"(${b.pub}, ${b.rank}위, ${b.year}년)`).join(' / ') || '없음'}
인기 강의: ${catData.lecture.slice(0,3).map(l=>`"${l.title}"(${(l.pop||0).toLocaleString()}명)`).join(' / ') || '없음'}`;
  } else {
    ctx = `기획 대상: ${currentTitle || currentField}`;
  }

  const prompt = `당신은 한빛미디어에서 10년간 IT 도서를 기획해온 편집자입니다. 집필 기획안을 작성하세요.

[글쓰기 원칙]
- 출판 실무자가 사내 기획회의에서 발표하는 톤. 딱딱한 보고서가 아니라 설득력 있는 피칭.
- "~입니다", "~할 수 있습니다" 반복 금지. 문장 구조를 다양하게.
- 시장 수치를 문장 안에 자연스럽게 녹일 것. 수치 나열만 하지 말고 의미를 해석.
- 기획의도·차별점은 "이 책이 왜 지금 필요한가"를 독자 입장에서 서술.

[시장/기획 데이터]
${ctx}

아래 JSON 형식으로만 응답하세요.

{
  "title": "도서명(가제) — 실무형 제목 (30자 이내)",
  "field": "분야명 (예: 인공지능 활용, LLM 개발)",
  "concept": "한 줄 콘셉트 — 독자에게 전달하는 핵심 가치 (2-3문장)",
  "reader_core": "핵심 독자 — 직군, 경력, 현재 문제 구체적으로",
  "reader_budget": "구매력 (예: 중상 (2-4만원대 IT 도서 구매 경험 있음))",
  "reader_needs": "핵심 니즈 (예: 업무 자동화, 실무 적용)",
  "reader_ext": "확산 독자층",
  "diff": "차별화 전략 — 경쟁서 대비 강점 (경쟁서 명시, 3-4문장)",
  "kp": [
    {"title": "핵심 포인트 1 제목", "desc": "설명 1-2문장"},
    {"title": "핵심 포인트 2 제목", "desc": "설명 1-2문장"},
    {"title": "핵심 포인트 3 제목", "desc": "설명 1-2문장"}
  ],
  "price": "예상 정가 (예: 28,000원)",
  "pages": "예상 페이지 (예: 360p)"
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: typeof _cachedSystem==='function'?_cachedSystem(PUBLISHING_PERSONA||''):undefined, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.error?.message || `HTTP ${resp.status}`); }
    const res = await resp.json();
    const m = res.content[0].text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON 응답을 받지 못했습니다.');
    const r = JSON.parse(m[0]);
    const sv = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    sv('pf-title', r.title); sv('pf-field', r.field); sv('pf-concept', r.concept);
    sv('pf-reader-core', r.reader_core); sv('pf-reader-budget', r.reader_budget);
    sv('pf-reader-needs', r.reader_needs); sv('pf-reader-ext', r.reader_ext);
    sv('pf-diff', r.diff); sv('pf-price', r.price); sv('pf-pages', r.pages);
    (r.kp || []).forEach((kp, i) => { sv(`pkp-t-${i}`, kp.title); sv(`pkp-d-${i}`, kp.desc); });
    propRender();
    showToast('✨ AI가 집필 기획안을 완성했습니다! 내용을 검토 후 수정하세요.', 'green');
  } catch (err) {
    showToast(`AI 생성 실패: ${err.message}`, 'red');
    console.error('generatePlan5WithAI error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ AI 자동 완성'; }
    if (qbtn) { qbtn.disabled = false; qbtn.textContent = '✨ AI 기획안 자동 작성 →'; }
  }
}

/* ── switchTab 후크: panel5 초기화 ── */
const _origSwitchTab5 = window.switchTab;
window.switchTab = function(i, btn) {
  if (typeof _origSwitchTab5 === 'function') _origSwitchTab5(i, btn);
  if (i === 5) {
    initPropTab();
    renderPropCats();
    renderPropQuickDropdown();
  }
};

/* =========================================================
   .docx 다운로드 (순수 JavaScript, 외부 라이브러리 없음)
   ZIP store 방식 + OOXML Word 문서
   ========================================================= */
function propDownloadDocx() {
  const d = getPropData();
  if (!d.title) { alert('도서명을 입력해주세요.'); return; }
  const docXml = buildWordXml(d);
  const zipBytes = buildDocxZip(docXml);
  const blob = new Blob([zipBytes], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `집필기획안_${d.title.replace(/[\\/:*?"<>|]/g,'_')}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

const xmlEsc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function wt(text) {
  if (!text) return '';
  return `<w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}
function wp(content='', style='') {
  const ps = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${ps}${content}</w:p>`;
}
function wbold(text) {
  return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}
function wrow(cells) {
  return `<w:tr>${cells.map(c=>`<w:tc><w:p><w:r><w:t xml:space="preserve">${xmlEsc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
}

function buildWordXml(d) {
  const dateStr = d.date ? new Date(d.date).toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'}) : '';
  const goalsChecked = d.goals.filter(g=>g.checked).map(g=>g.label).join(', ') || '(미선택)';
  const rows = [];

  // 제목
  rows.push(wp(wbold(`집필 기획안: ${d.title||'(도서명 미입력)'}`), 'Heading1'));
  rows.push(wp(''));

  // 기본 정보 테이블
  rows.push(wp(wbold('■ 기본 정보')));
  rows.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
    ${wrow(['도서명(가제)', d.title||''])}
    ${wrow(['분야', d.field||''])}
    ${wrow(['저자', d.author||''])}
    ${wrow(['작성자', d.writer||''])}
    ${wrow(['작성일', dateStr])}
  </w:tbl>`);
  rows.push(wp(''));

  // 기획 목표
  rows.push(wp(wbold('■ 기획 목표')));
  rows.push(wp(wt(goalsChecked)));
  rows.push(wp(''));

  // 콘셉트
  rows.push(wp(wbold('■ 콘셉트')));
  rows.push(wp(wt(d.concept||'')));
  rows.push(wp(''));

  // 독자층
  rows.push(wp(wbold('■ 독자층')));
  rows.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
    ${wrow(['핵심 독자', d.readerCore||''])}
    ${wrow(['확산 독자', d.readerExt||''])}
    ${wrow(['구매력', d.readerBudget||''])}
    ${wrow(['니즈', d.readerNeeds||''])}
  </w:tbl>`);
  rows.push(wp(''));

  // 차별화
  if (d.diff) {
    rows.push(wp(wbold('■ 차별화 전략')));
    rows.push(wp(wt(d.diff)));
    rows.push(wp(''));
  }

  // 핵심 포인트
  const kpsValid = d.kps.filter(k=>k.title);
  if (kpsValid.length) {
    rows.push(wp(wbold('■ 핵심 포인트')));
    kpsValid.forEach((k,i)=>{
      rows.push(wp(wbold(`${i+1}. ${k.title}`)));
      if (k.desc) rows.push(wp(wt(k.desc)));
    });
    rows.push(wp(''));
  }

  // 계약 정보
  rows.push(wp(wbold('■ 계약 정보')));
  rows.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
    ${wrow(['예상 정가', d.price||'', '예상 페이지', d.pages||''])}
    ${wrow(['선인세', d.advance ? d.advance+'원' : '', '집필 인세', d.royalty||''])}
  </w:tbl>`);
  rows.push(wp(''));

  // 경쟁 분석
  if (d.comps.length) {
    rows.push(wp(wbold('■ 경쟁 분석')));
    rows.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
      ${wrow(['도서명','출판사','연도'])}
      ${d.comps.map(c=>wrow([c.title, c.pub, c.year])).join('')}
    </w:tbl>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${rows.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body>
</w:document>`;
}

/* ── 미니멀 ZIP 생성기 (Store, 무압축) ── */
function buildDocxZip(docXml) {
  const enc = new TextEncoder();
  const files = [
    {name:'[Content_Types].xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)},
    {name:'_rels/.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)},
    {name:'word/document.xml', data: enc.encode(docXml)},
    {name:'word/_rels/document.xml.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)},
  ];
  return zipStore(files);
}

function zipStore(files) {
  function u16(n){return new Uint8Array([n&0xff,(n>>8)&0xff]);}
  function u32(n){return new Uint8Array([n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>24)&0xff]);}
  function cat(...arrs){const len=arrs.reduce((s,a)=>s+a.length,0);const out=new Uint8Array(len);let o=0;arrs.forEach(a=>{out.set(a,o);o+=a.length;});return out;}
  function crc32(data){
    const t=new Uint32Array(256);
    for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
    let c=0xFFFFFFFF;
    for(let i=0;i<data.length;i++)c=t[(c^data[i])&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
  }
  const enc=new TextEncoder();
  const locals=[]; const centrals=[]; let off=0;
  for(const {name,data} of files){
    const nb=enc.encode(name);
    const crc=crc32(data);
    const lh=cat(
      new Uint8Array([0x50,0x4B,0x03,0x04]),
      u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),
      u16(nb.length),u16(0),nb,data
    );
    const cd=cat(
      new Uint8Array([0x50,0x4B,0x01,0x02]),
      u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),
      u16(nb.length),u16(0),u16(0),u16(0),u16(0),
      u32(0),u32(off),nb
    );
    locals.push(lh); centrals.push(cd); off+=lh.length;
  }
  const cdSize=centrals.reduce((s,c)=>s+c.length,0);
  const eocd=cat(
    new Uint8Array([0x50,0x4B,0x05,0x06,0,0,0,0]),
    u16(files.length),u16(files.length),
    u32(cdSize),u32(off),u16(0)
  );
  return cat(...locals,...centrals,eocd);
}
