const P_WHY_DEF=[
  {num:'TREND',title:'n8n × Claude Code, 지금이 선점 타이밍',body:'두 도구를 함께 다룬 국내 단행본은 아직 없습니다. AI 자동화 수요가 빠르게 성장하는 지금이 선점할 적기입니다.'},
  {num:'READER',title:'비개발 직군까지 아우르는 타겟',body:'개발자뿐 아니라 기획·마케팅·운영 직군도 이해할 수 있는 커리큘럼 구성은 책의 독자층을 훨씬 넓혀줍니다.'},
  {num:'PROOF',title:'이미 시장 검증 완료',body:'패스트캠퍼스에서 현재 판매 중인 강의로, 콘텐츠와 수요가 검증된 상태입니다. 검증된 콘텐츠를 책으로 전환하는 가장 안전한 경로입니다.'},
  {num:'OSMU',title:'IP 확장성',body:'단행본 출간 이후 전자책, 기업 교육용 워크북 등 저자님의 콘텐츠가 다양한 형태로 확장될 수 있는 소재입니다.'},
];
const P_HB_DEF=[
  {num:'DISTRIBUTION',title:'온·오프라인 전 채널 유통',body:'교보·yes24·알라딘 등 주요 서점 MD와의 직접 협업으로 신간 노출 및 기획전 입점을 함께 설계합니다.'},
  {num:'MARKETING',title:'채널H 콘텐츠 마케팅',body:'한빛미디어 자체 콘텐츠 채널을 통해 출간 전후 독자 유입을 지속적으로 만들어 갑니다.'},
  {num:'TRUST',title:'IT 독자층과의 접점',body:'한빛미디어를 통해 출간된 책은 IT 독자들에게 이미 익숙한 채널로 유통됩니다.'},
  {num:'PRODUCTION',title:'전담 편집팀 원고 지원',body:'기획부터 교정·교열·디자인까지 전담 편집팀이 함께합니다.'},
];
const P_TOC_DEF=[
  {num:'1장',title:'AI 자동화, 왜 지금인가',sub:'자동화의 패러다임 변화 · n8n과 Claude Code를 선택한 이유 · 환경 설정'},
  {num:'2장',title:'n8n 완벽 입문 — 워크플로우 설계의 기초',sub:'노드 기반 인터페이스 · 트리거·액션 구조 · 첫 자동화 워크플로우 만들기'},
  {num:'3장',title:'Claude Code로 개발 속도를 높이다',sub:'Claude Code 핵심 사용법 · 코드 생성·수정·디버깅 실전 · 비개발자도 쓸 수 있는 활용법'},
  {num:'4장',title:'n8n × Claude Code 시너지 프로젝트',sub:'두 도구의 조합 · 실무 자동화 시나리오 · 사내 챗봇·AI 에이전트 구현'},
  {num:'5장',title:'내 자동화 시스템 운영하기',sub:'배포 · 유지보수 · 트러블슈팅 · 수익화 연결까지'},
  {num:'부록',title:'막혔을 때 꺼내 쓰는 워크플로우 패턴 30',sub:'상황별 자동화 레퍼런스 · 자주 막히는 순간의 해결 패턴 · 책 독자 전용 콘텐츠',hl:true},
];
const P_DISCUSS_DEF=[
  {title:'n8n × Claude Code 자동화 도서',desc:'기존 강의 콘텐츠를 바탕으로 한 자동화 단행본입니다. 위 목차는 가안이며 저자님 의견을 먼저 듣고 싶습니다.'},
  {title:'Claude Code · Codex · Gemini CLI 관련 도서',desc:'AI 코딩 툴 시장이 빠르게 성장하고 있습니다. 강의에서 쌓아온 Claude Code 경험을 연장선에서 집필 가능한 아이템이 있는지 함께 이야기 나눠보고 싶습니다.'},
  {title:'목차 방향 논의',desc:'위 목차는 어디까지나 가안입니다. 저자님과 함께 처음부터 다시 잡아도 좋습니다.'},
];

function pInitFields(){
  // API 키 복원 (비동기)
  loadApiKey().then(savedKey => {
    const keyEl=document.getElementById('ai-api-key');
    if(keyEl&&savedKey)keyEl.value=savedKey;
  }).catch(function(){});

  const wf=document.getElementById('pwhy-fields');
  P_WHY_DEF.forEach((d,i)=>{
    wf.innerHTML+=`<div style="border:1px solid var(--border);border-radius:6px;padding:.65rem;margin-bottom:.4rem;">
      <div style="display:flex;gap:.35rem;margin-bottom:.35rem;">
        <input type="text" id="pw-num-${i}" value="${d.num}" style="width:76px;" oninput="pRender()">
        <input type="text" id="pw-title-${i}" value="${d.title}" oninput="pRender()">
      </div>
      <textarea id="pw-body-${i}" oninput="pRender()" style="min-height:52px;">${d.body}</textarea>
    </div>`;
  });
  const hf=document.getElementById('phanbit-fields');
  P_HB_DEF.forEach((d,i)=>{
    hf.innerHTML+=`<div style="border:1px solid var(--border);border-radius:6px;padding:.65rem;margin-bottom:.4rem;">
      <div style="display:flex;gap:.35rem;margin-bottom:.35rem;">
        <input type="text" id="ph-num-${i}" value="${d.num}" style="width:96px;" oninput="pRender()">
        <input type="text" id="ph-title-${i}" value="${d.title}" oninput="pRender()">
      </div>
      <textarea id="ph-body-${i}" oninput="pRender()" style="min-height:52px;">${d.body}</textarea>
    </div>`;
  });
  P_DISCUSS_DEF.forEach(d=>pAddDiscuss(d));
  P_TOC_DEF.forEach(d=>pAddToc(d));
  pRender();
}

let pDiscussCnt=0;
function pAddDiscuss(d={}){
  const i=pDiscussCnt++;
  const row=document.createElement('div');
  row.className='discuss-row-p';row.id='pdiscuss-'+i;
  row.innerHTML=`<div style="display:flex;gap:.35rem;margin-bottom:.35rem;align-items:center;">
    <span style="font-size:.7rem;font-weight:700;color:var(--muted);width:18px;flex-shrink:0;">${i+1}</span>
    <input type="text" id="pd-title-${i}" value="${d.title||''}" placeholder="아이템 제목" oninput="pRender()" style="flex:1;">
    <button class="pdel" onclick="pDelDiscuss(${i})">✕</button>
  </div>
  <textarea id="pd-desc-${i}" oninput="pRender()" style="min-height:48px;">${d.desc||''}</textarea>`;
  document.getElementById('pdiscuss-rows').appendChild(row);
  pRender();
}
function pDelDiscuss(i){const el=document.getElementById('pdiscuss-'+i);if(el)el.remove();pRender();}

let pTocCnt=0;
function pAddToc(d={}){
  const i=pTocCnt++;
  const row=document.createElement('div');
  row.className='toc-row-p';row.id='ptoc-'+i;
  row.innerHTML=`<input class="pch-num" type="text" id="ptc-num-${i}" value="${d.num||''}" placeholder="장" oninput="pRender()">
    <input class="pch-title" type="text" id="ptc-title-${i}" value="${d.title||''}" placeholder="제목" oninput="pRender()">
    <input class="pch-sub" type="text" id="ptc-sub-${i}" value="${d.sub||''}" placeholder="소제목" oninput="pRender()">
    <label title="강조" style="display:flex;align-items:center;flex-shrink:0;cursor:pointer;padding:0 2px;">
      <input type="checkbox" id="ptc-hl-${i}" ${d.hl?'checked':''} onchange="pRender()" style="width:14px;height:14px;cursor:pointer;accent-color:#E8401C;">
    </label>
    <button class="pdel" onclick="pDelToc(${i})">✕</button>`;
  document.getElementById('ptoc-rows').appendChild(row);
  pRender();
}
function pDelToc(i){const el=document.getElementById('ptoc-'+i);if(el)el.remove();pRender();}

function pg(id){return(document.getElementById(id)||{value:''}).value||'';}

function pRender(){
  const ac=document.querySelector('input[name=pcolor]:checked')?.value||'#E8401C';
  const author=pg('pf-author')||'저자님';
  const editor=pg('pf-editor')||'담당 편집자';
  const email=pg('pf-email')||'editor@hanbit.co.kr';
  const team=pg('pf-team')||'콘텐츠 1팀';
  const year=pg('pf-year')||'2026';
  const t1=pg('pf-title1')||'저자님의 경험,';
  const t2=pg('pf-title2')||'독자의 시작점이 될 수 있습니다.';
  const hh=pg('pf-hero-head')||'강의를 들은 독자가 책상 위에 펼쳐두고 따라 만드는 책';
  const hd=pg('pf-hero-desc')||'책의 차별점을 설명해주세요.';
  const ch=pg('pf-cta-head')||'부담 없이 한 번 뵙고 싶습니다.';
  const cd=pg('pf-cta-desc')||'저자님이 생각하시는 방향을 먼저 듣고 싶습니다.';

  let whyH='';
  for(let i=0;i<4;i++){
    whyH+=`<div class="pd-why-card" style="border-left-color:${ac};">
      <div class="wc-num" style="color:${ac};">${pg('pw-num-'+i)}</div>
      <p><strong>${pg('pw-title-'+i)}</strong><br>${pg('pw-body-'+i)}</p>
    </div>`;
  }
  let tocH='';
  document.querySelectorAll('.toc-row-p').forEach(row=>{
    const i=row.id.replace('ptoc-','');
    const num=pg('ptc-num-'+i);const title=pg('ptc-title-'+i);const sub=pg('ptc-sub-'+i);
    if(!title)return;
    const hl=document.getElementById('ptc-hl-'+i)?.checked||false;
    tocH+=`<li class="pd-toc-item">
      <div class="pd-toc-num" style="background:${hl?ac:'#0f0f0f'};">${num}</div>
      <div class="pd-toc-body">
        <div class="pd-toc-title">${title}</div>
        <div class="pd-toc-sub">${sub}</div>
      </div>
    </li>`;
  });
  let hbH='';
  for(let i=0;i<4;i++){
    hbH+=`<div class="pd-why-card" style="border-left-color:${ac};">
      <div class="wc-num" style="color:${ac};">${pg('ph-num-'+i)}</div>
      <p><strong>${pg('ph-title-'+i)}</strong><br>${pg('ph-body-'+i)}</p>
    </div>`;
  }
  let discussH='';
  document.querySelectorAll('.discuss-row-p').forEach((row,idx)=>{
    const i=row.id.replace('pdiscuss-','');
    const title=pg('pd-title-'+i);const desc=pg('pd-desc-'+i);
    if(!title&&!desc)return;
    discussH+=`<div class="pd-discuss-item">
      <div class="pd-discuss-num" style="background:${ac};">${idx+1}</div>
      <div class="pd-discuss-body">
        <div class="pd-discuss-title">${title}</div>
        <div class="pd-discuss-desc">${desc.replace(/\n/g,'<br>')}</div>
      </div>
    </div>`;
  });
  const discussSection=discussH?`<div class="pd-section">
    <div class="pd-section-label" style="color:${ac};">함께 논의하고 싶은 것들</div>
    <div class="pd-discuss-list">${discussH}</div>
  </div>`:'';

  document.getElementById('proposal-output').innerHTML=`
  <div class="pd-header">
    <div class="pd-header-left">
      <div class="pd-label" style="color:${ac};">출판 기획 제안서</div>
      <h1>${t1}<br><span style="color:${ac};">${t2}</span></h1>
    </div>
    <div class="pd-header-right">
      <div class="pd-logo">한빛<span>미디어</span></div>
      <div class="pd-logo-sub">${team} · ${year}</div>
    </div>
  </div>
  <div class="pd-hero" style="background:${ac};">
    <div class="pd-hero-tag">Why This Book?</div>
    <h2>${hh.replace(/\n/g,'<br>')}</h2>
    <p class="pd-hero-desc">${hd.replace(/\n/g,'<br>')}</p>
  </div>
  <div class="pd-content">
    <div class="pd-section">
      <div class="pd-section-label" style="color:${ac};">지금 이 책이어야 하는 이유</div>
      <div class="pd-why-grid">${whyH}</div>
    </div>
    <div class="pd-section">
      <div class="pd-section-label" style="color:${ac};">잠정 목차 시안 (저자님과 함께 다듬어 나갑니다)</div>
      <ul class="pd-toc-list">${tocH}</ul>
    </div>
    <div class="pd-section">
      <div class="pd-section-label" style="color:${ac};">한빛미디어와 함께하면 달라지는 것들</div>
      <div class="pd-why-grid">${hbH}</div>
    </div>
    ${discussSection}
    <div class="pd-section">
      <div class="pd-section-label" style="color:${ac};">미팅 제안</div>
      <div class="pd-cta">
        <div class="pd-cta-left">
          <h3>${ch}</h3>
          <p>${cd.replace(/\n/g,'<br>')}</p>
        </div>
        <div class="pd-cta-contact">
          <div class="pd-cta-name">${editor}</div>
          <div class="pd-cta-role">한빛미디어 ${team} 편집자</div>
          <div class="pd-cta-email" style="background:${ac};">${email}</div>
        </div>
      </div>
    </div>
  </div>
  <div class="pd-footer">
    <div class="pd-footer-l">본 제안서의 모든 내용은 저자님과의 협의를 통해 자유롭게 조정될 수 있습니다.</div>
    <div class="pd-footer-r">한빛미디어 × ${author}<br><span style="color:${ac};">www.hanbit.co.kr</span></div>
  </div>`;
}

// index.html 기준 절대 베이스 URL (CSS <link> href에 사용)
// PDF 인쇄 → shared/app.js의 getBaseUrl(), openPrintPopup() 직접 사용

function pPrintPDF() {
  const content = document.getElementById('proposal-output');
  if (!content || !content.innerHTML.trim()) { alert('먼저 내용을 입력해주세요.'); return; }
  const base = getBaseUrl();
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="${base}shared/styles.css">
<link href="${base}libs/pretendard.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet">
<style>
/* 대시보드 레이아웃 해제 */
body { height: auto !important; overflow: visible !important; display: block !important;
  background: #fff !important; margin: 0 !important; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
@page { size: A4; margin: 0; }
@media print {
  .proposal-doc { box-shadow: none !important; margin: 0 !important; width: 100% !important; }
}
</style>
</head>
<body>
${content.outerHTML}
</body>
</html>`;
  openPrintPopup(html);
}

// ── 출판 가이드 PDF 저장 ──
function dlGuidePDF() {
  const root = document.getElementById('guide-page-root');
  if (!root) { alert('가이드 페이지를 찾을 수 없습니다.'); return; }

  const gpNavy  = root.style.getPropertyValue('--gp-navy')  || '#1C3557';
  const gpBlue  = root.style.getPropertyValue('--gp-blue')  || '#2B5BA8';
  const gpBlueLt= root.style.getPropertyValue('--gp-blue-lt')|| '#EBF1FA';

  // guide-page CSS는 index.html 인라인 <style>에 있어 CSSOM으로 동일 문서 접근 가능
  let guideCSS = '';
  const isGuideRule = sel => sel && (sel.includes('guide-page') || sel.includes('gp-'));
  for (const ss of document.styleSheets) {
    try {
      for (const r of ss.cssRules) {
        if (r.selectorText && isGuideRule(r.selectorText)) {
          guideCSS += r.cssText + '\n';
        } else if (r.type === CSSRule.MEDIA_RULE) {
          const inner = [...r.cssRules]
            .filter(cr => cr.selectorText && isGuideRule(cr.selectorText))
            .map(cr => cr.cssText).join('\n');
          if (inner) guideCSS += `@media ${r.conditionText || r.media?.mediaText || ''} { ${inner} }\n`;
        } else if (r.type === CSSRule.KEYFRAMES_RULE && isGuideRule(r.name)) {
          guideCSS += r.cssText + '\n';
        }
      }
    } catch(e) {}
  }

  const base = getBaseUrl();
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="${base}shared/styles.css">
<link href="${base}libs/pretendard.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=IBM+Plex+Sans+KR:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
body { height: auto !important; overflow: visible !important; display: block !important;
  background: #fff !important; margin: 0 !important;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
@page { size: A4; margin: 0; }
@media print {
  html, body { width: 210mm; }
  .guide-page { width: 100% !important; box-shadow: none !important; }
}
${guideCSS}
.guide-page {
  --gp-navy: ${gpNavy};
  --gp-blue: ${gpBlue};
  --gp-blue-lt: ${gpBlueLt};
  width: 794px; max-width: 100%; background: #fff;
  font-family: 'Pretendard','Noto Sans KR','IBM Plex Sans KR',sans-serif; color: #1a1a1a;
}
</style>
</head>
<body>
${root.outerHTML}
</body>
</html>`;

  openPrintPopup(html);
}

// ── 출판 가이드 색상 설정 ──
function setGuideColor(navy, blue, blueLt, dotEl){
  const el = document.getElementById('guide-page-root');
  if(!el) return;
  el.style.setProperty('--gp-navy', navy);
  el.style.setProperty('--gp-blue', blue);
  el.style.setProperty('--gp-blue-lt', blueLt);
  document.querySelectorAll('.gcp').forEach(d=>d.classList.remove('active'));
  if(dotEl) dotEl.classList.add('active');
  const pick = document.getElementById('guide-color-pick');
  if(pick) pick.value = blue;
}
function setGuideColorCustom(hex){
  // 직접 색상 선택: navy는 hex를 어둡게, lt는 밝게
  const el = document.getElementById('guide-page-root');
  if(!el) return;
  el.style.setProperty('--gp-navy', hex);
  el.style.setProperty('--gp-blue', hex);
  el.style.setProperty('--gp-blue-lt', hex+'22');
  document.querySelectorAll('.gcp').forEach(d=>d.classList.remove('active'));
}

// panel3 탭 클릭 시 초기화
document.querySelectorAll('.nav-item').forEach((btn, i) => {
  btn.addEventListener('click', () => {
    if(i === 3 && !window._pInitDone){
      window._pInitDone = true;
      pInitFields();
    }
  });
});
