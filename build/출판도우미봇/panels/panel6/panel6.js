// ── 저자 미팅 자료 렌더링 ──
function meetVal(id){ return (document.getElementById(id)||{}).value||''; }

function meetRender(){
  const type    = meetVal('m-type') || '초기 미팅';
  const agenda  = meetVal('m-agenda');
  const author  = meetVal('m-author') || '저자명';
  const affil   = meetVal('m-affil');
  const career  = meetVal('m-career');
  const books   = meetVal('m-books');
  const influence = meetVal('m-influence');
  const title   = meetVal('m-title') || '도서 제목(안)';
  const sub     = meetVal('m-subtitle');
  const concept = meetVal('m-concept');
  const pages   = meetVal('m-pages');
  const period  = meetVal('m-period');
  const reader  = meetVal('m-reader');
  const date    = meetVal('m-date');
  const editor  = meetVal('m-editor') || '담당 편집자';
  const place   = meetVal('m-place');
  const market  = meetVal('m-market');
  const diff    = meetVal('m-diff');
  const tocRaw  = meetVal('m-toc');
  const royalty = meetVal('m-royalty') || '협의';
  const print_  = meetVal('m-print') || '협의';
  const support = meetVal('m-support');
  const schedule= meetVal('m-schedule');
  const reaction= meetVal('m-reaction');
  const agreement=meetVal('m-agreement');
  const action  = meetVal('m-action');

  const dateStr = date ? new Date(date).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}) : '미팅 일시';

  const tocItems = tocRaw.split('\n').filter(l=>l.trim()).map(l=>{
    const m = l.match(/^(\d+)\.\s*(.*)/);
    return m ? `<li class="md-toc-item"><span class="md-toc-num">${m[1]}</span><span>${m[2]}</span></li>`
             : `<li class="md-toc-item"><span>${l}</span></li>`;
  }).join('');

  const careerItems = career.split('\n').filter(l=>l.trim()).map(l=>`<li style="padding:2px 0;">${l}</li>`).join('');

  const agendaHtml = agenda ? agenda.split('\n').filter(l=>l.trim()).map(l=>`<div class="md-agenda-item">${l}</div>`).join('') : '';

  const ctxCat = (typeof _meetCtxCat !== 'undefined' && _meetCtxCat) ? _meetCtxCat : '';
  const ctxBand = ctxCat ? `<div style="background:#fff8f0;border-left:3px solid #E8401C;padding:6px 12px;font-size:10.5px;color:#666;margin-bottom:0;">📋 기반 제안서: <strong style="color:#E8401C;">${ctxCat}</strong> 시장 분석 기반</div>` : '';

  // 체크리스트 상태
  const mcExp = document.getElementById('mc-exp')?.checked;
  const mcExcl = document.getElementById('mc-excl')?.checked;
  const mcSample = document.getElementById('mc-sample')?.checked;
  const mcTime = document.getElementById('mc-time')?.checked;
  const mcExpNote = (document.getElementById('mc-exp-note')||{}).value||'';
  const mcExclNote = (document.getElementById('mc-excl-note')||{}).value||'';
  const mcSampleNote = (document.getElementById('mc-sample-note')||{}).value||'';
  const mcTimeNote = (document.getElementById('mc-time-note')||{}).value||'';

  function checkItem(checked, label, note) {
    const icon = checked ? '✅' : '⬜';
    return `<div class="md-check-item"><span class="check-icon">${icon}</span><span><strong>${label}</strong>${note ? ' — '+note : ''}</span></div>`;
  }

  const hasFieldNotes = reaction || agreement || action;

  // 새 필드들
  const discuss      = meetVal('m-discuss');
  const questions    = meetVal('m-questions');
  const explore      = meetVal('m-explore');
  const directionShift = meetVal('m-direction-shift');
  const issues       = meetVal('m-issues');
  const editorAssess = meetVal('m-editor-assess');

  const d = {type,agenda,author,affil,career,books,influence,title,sub,concept,pages,period,reader,date,editor,place,market,diff,tocRaw,royalty,print_,support,schedule,reaction,agreement,action,dateStr,tocItems,careerItems,agendaHtml,ctxCat,ctxBand,mcExp,mcExcl,mcSample,mcTime,mcExpNote,mcExclNote,mcSampleNote,mcTimeNote,checkItem,hasFieldNotes,discuss,questions,explore,directionShift,issues,editorAssess};

  if (_meetDocMode === 'summary') {
    _renderMeetSummary(d);
  } else if (_meetDocMode === 'notes') {
    _renderMeetEditorNotes(d);
  } else if (_meetDocMode === 'discuss') {
    _renderMeetDiscuss(d);
  } else {
    _renderMeetPrep(d);
  }
}

function _renderMeetPrep(d){
  const {type,author,affil,career,books,influence,title,sub,concept,pages,period,reader,editor,place,market,diff,royalty,print_,support,schedule,reaction,agreement,action,dateStr,tocItems,careerItems,agendaHtml,ctxBand,mcExp,mcExcl,mcSample,mcTime,mcExpNote,mcExclNote,mcSampleNote,mcTimeNote,checkItem,hasFieldNotes} = d;
  const mapQ = encodeURIComponent(place || '');
  const isFileProto = location.protocol === 'file:';
  const mapIframe = place ? (isFileProto
    ? `<div style="margin-top:8px;padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;font-size:.85rem;">📍 ${place} <a href="https://maps.google.com/?q=${mapQ}" target="_blank" style="color:#2563eb;text-decoration:none;margin-left:8px;">지도 열기 ↗</a></div>`
    : `<iframe src="https://maps.google.com/maps?q=${mapQ}&output=embed&z=17&hl=ko" width="100%" height="200" style="border:1px solid #e2e8f0;border-radius:6px;display:block;margin-top:8px;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe><div style="margin-top:5px;font-size:9px;color:#555;display:flex;align-items:center;gap:6px;">📍 <span>${place}</span> <a href="https://maps.google.com/?q=${mapQ}" target="_blank" style="color:#2563eb;text-decoration:none;margin-left:auto;flex-shrink:0;">지도 앱에서 열기 ↗</a></div>`
  ) : '';

  const authorName = author && author !== '저자명' ? author : '저자';
  document.getElementById('meet-doc').innerHTML = `
<div class="md-header">
  <div class="md-header-left">
    <div class="md-sub">Pre-Meeting Brief</div>
    <div class="md-title">저자 사전 안내문</div>
  </div>
  <div class="md-header-right">
    <div>${dateStr}</div>
    <div>${place||'장소 미정'}</div>
    <div>담당: ${editor}</div>
    <div style="margin-top:4px;"><span style="background:#2563eb;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;">${type}</span></div>
  </div>
</div>
${ctxBand}
<div class="md-body">

  <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:11px 15px;margin-bottom:18px;font-size:11.5px;line-height:1.75;border-radius:0 6px 6px 0;color:#1a1a18;">
    안녕하세요, <strong>${authorName}님</strong>.<br>
    이번 미팅에서 함께 나눌 내용을 미리 안내드립니다. 편하게 검토하신 후 궁금한 점은 미팅 때 편하게 말씀해 주세요.
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#2563eb;">미팅 일정</div>
    <div class="md-info-grid">
      <div class="md-info-item"><span class="lbl">유형</span><span class="val">${type}</span></div>
      <div class="md-info-item"><span class="lbl">일시</span><span class="val">${dateStr}</span></div>
      <div class="md-info-item"><span class="lbl">담당 편집자</span><span class="val">${editor}</span></div>
    </div>
    ${mapIframe}
    ${agendaHtml ? `<div style="margin-top:10px;"><div style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;margin-bottom:6px;">AGENDA — 미팅에서 다룰 주제</div>${agendaHtml}</div>` : ''}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">제안 도서 개요</div>
    <div class="md-info-grid">
      <div class="md-info-item" style="grid-column:1/-1;"><span class="lbl">제목(안)</span><span class="val" style="font-size:14px;font-weight:600;">${title}</span></div>
      ${sub ? `<div class="md-info-item" style="grid-column:1/-1;"><span class="lbl">부제</span><span class="val">${sub}</span></div>` : ''}
    </div>
    ${concept ? `<div class="md-concept-box">"${concept}"</div>` : ''}
    <div class="md-info-grid" style="margin-top:6px;">
      <div class="md-info-item"><span class="lbl">대상 독자</span><span class="val">${reader||'—'}</span></div>
      <div class="md-info-item"><span class="lbl">예상 분량</span><span class="val">${pages ? pages+'쪽' : '—'}</span></div>
      <div class="md-info-item"><span class="lbl">집필 기간</span><span class="val">${period||'—'}</span></div>
    </div>
  </div>

  ${market || diff ? `
  <div class="md-block">
    <div class="md-block-title" style="color:#b45309;">이 책이 필요한 이유</div>
    ${market ? `<div class="md-market-box">${market.replace(/\n/g,'<br>')}</div>` : ''}
    ${diff ? `<div class="md-diff-box" style="margin-top:8px;">${diff.replace(/\n/g,'<br>')}</div>` : ''}
  </div>` : ''}

  ${tocItems ? `
  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">함께 검토할 목차 가안</div>
    <div style="font-size:10px;color:#888;margin-bottom:8px;">미팅 전에 한 번 살펴봐 주시면 좋습니다. 수정·추가 의견을 편하게 말씀해 주세요.</div>
    <ul class="md-toc-list">${tocItems}</ul>
  </div>` : ''}

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">출판사 제안 조건</div>
    <div class="md-terms-box">
      <div class="md-terms-grid">
        <div class="md-info-item"><span class="lbl">인세율</span><span class="val">${royalty}</span></div>
        <div class="md-info-item"><span class="lbl">초판 부수</span><span class="val">${print_}</span></div>
      </div>
      ${support ? `<div style="margin-top:6px;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;">마케팅·편집 지원</span><div style="font-size:11px;margin-top:2px;color:#444;">${support.replace(/\n/g,'<br>')}</div></div>` : ''}
      ${schedule ? `<div style="margin-top:6px;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;">원고 일정(안)</span><div style="font-size:11px;margin-top:2px;color:#444;">${schedule}</div></div>` : ''}
    </div>
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#6b21a8;">미팅 전 생각해 오시면 좋을 점</div>
    <div style="font-size:10px;color:#888;margin-bottom:8px;">아래 항목을 미리 생각해 오시면 미팅이 더욱 풍성해집니다.</div>
    <div class="md-check-item"><span class="check-icon">📝</span><span>집필 경험이 있으신가요? (첫 집필 / 기존 저서 수)</span></div>
    <div class="md-check-item"><span class="check-icon">🤝</span><span>현재 다른 출판사와 이야기 중이신 부분이 있으신가요?</span></div>
    <div class="md-check-item"><span class="check-icon">📄</span><span>샘플 챕터(1~2장)를 미리 작성해 보실 수 있으신가요?</span></div>
    <div class="md-check-item"><span class="check-icon">⏰</span><span>월 평균 집필 시간을 어느 정도 확보하실 수 있으신가요?</span></div>
  </div>

</div>
<div class="md-footer">
  <span>한빛미디어 출판기획팀</span>
  <span>${authorName}님 전달용 — 미팅 전 검토 부탁드립니다</span>
</div>`;
}

function _renderMeetDiscuss(d){
  const {type,author,affil,title,editor,place,dateStr,ctxBand,discuss,questions,explore,mcExp,mcExcl,mcSample,mcTime,mcExpNote,mcExclNote,mcSampleNote,mcTimeNote,checkItem} = d;

  function listFromText(text) {
    if (!text) return '';
    const items = text.split('\n').filter(l=>l.trim());
    if (!items.length) return '';
    return items.map((l,i) => {
      const cleaned = l.replace(/^\d+\.\s*/, '').replace(/^[-·]\s*/, '');
      return `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
        <span style="background:#1e3a5f;color:#fff;font-size:8px;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap;flex-shrink:0;">${i+1}</span>
        <span style="font-size:11.5px;">${cleaned}</span>
      </div>`;
    }).join('');
  }

  function bulletFromText(text) {
    if (!text) return '';
    return text.split('\n').filter(l=>l.trim()).map(l => {
      const cleaned = l.replace(/^[-·]\s*/, '');
      return `<div style="padding:3px 0;font-size:11px;color:#333;">• ${cleaned}</div>`;
    }).join('');
  }

  document.getElementById('meet-doc').innerHTML = `
<div class="md-header" style="background:#1e3a5f;">
  <div class="md-header-left">
    <div class="md-sub">On-Site Discussion</div>
    <div class="md-title">미팅 진행 시트</div>
  </div>
  <div class="md-header-right">
    <div>${dateStr}</div>
    <div>${place||'장소 미정'}</div>
    <div>담당: ${editor}</div>
    <div style="margin-top:4px;">
      <span style="background:#c53030;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;">INTERNAL</span>
      <span style="background:#2d3748;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;margin-left:4px;">${type}</span>
    </div>
  </div>
</div>
${ctxBand}
<div class="md-body">

  <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;">
    <div style="font-size:11px;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:2px;">저자</span><strong>${author}</strong>${affil ? ' · <span style="color:#666;">'+affil+'</span>' : ''}</div>
    <div style="font-size:11px;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:2px;">도서(안)</span><strong>${title}</strong></div>
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#2563eb;">핵심 논의 포인트</div>
    ${discuss ? listFromText(discuss) : '<div style="color:#aaa;font-size:11px;padding:6px;">논의 포인트를 입력하면 번호 목록으로 표시됩니다.</div>'}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#b45309;">저자에게 할 질문</div>
    ${questions ? bulletFromText(questions) : '<div style="color:#aaa;font-size:11px;padding:6px;">질문을 입력하면 목록으로 표시됩니다.</div>'}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">탐색할 방향</div>
    ${explore ? bulletFromText(explore) : '<div style="color:#aaa;font-size:11px;padding:6px;">탐색 방향을 입력하면 목록으로 표시됩니다.</div>'}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#6b21a8;">미팅 중 확인 체크리스트</div>
    ${checkItem(mcExp, '집필 경험 있음', mcExpNote)}
    ${checkItem(mcExcl, '타 출판사 미접촉', mcExclNote)}
    ${checkItem(mcSample, '샘플 챕터 제출 가능', mcSampleNote)}
    ${checkItem(mcTime, '집필 시간 확보됨', mcTimeNote)}
  </div>


</div>
<div class="md-footer">
  <span>한빛미디어 출판기획팀 — 내부용</span>
  <span>${editor}</span>
</div>`;
}

function _renderMeetEditorNotes(d){
  const {type,author,affil,title,editor,place,dateStr,ctxBand,reaction,agreement,action,directionShift,issues,editorAssess} = d;

  const emptyPlaceholder = `<div style="padding:10px;text-align:center;color:#bbb;font-size:11px;border:1.5px dashed #e0e0e0;border-radius:6px;">미팅 후 작성해주세요</div>`;

  function textBlock(text) {
    return text ? `<div style="font-size:11.5px;color:#1a1a18;line-height:1.7;">${text.replace(/\n/g,'<br>')}</div>` : emptyPlaceholder;
  }

  document.getElementById('meet-doc').innerHTML = `
<div class="md-header" style="background:#1e3a5f;">
  <div class="md-header-left">
    <div class="md-sub">Editor Notes</div>
    <div class="md-title">편집자 정리 노트</div>
  </div>
  <div class="md-header-right">
    <div>${dateStr}</div>
    <div>${place||'장소 미정'}</div>
    <div>담당: ${editor}</div>
    <div style="margin-top:4px;">
      <span style="background:#c53030;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;">INTERNAL</span>
      <span style="background:#2d3748;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;margin-left:4px;">${type}</span>
    </div>
  </div>
</div>
${ctxBand}
<div class="md-body">

  <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;">
    <div style="font-size:11px;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:2px;">저자</span><strong>${author}</strong>${affil ? ' · <span style="color:#666;">'+affil+'</span>' : ''}</div>
    <div style="font-size:11px;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:2px;">도서(안)</span><strong>${title}</strong></div>
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#2563eb;">논의된 내용</div>
    ${textBlock(reaction)}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#b45309;">방향 변경 / 새로 발견된 사항</div>
    ${textBlock(directionShift)}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#dc2626;">이슈 / 우려사항</div>
    ${textBlock(issues)}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#6b21a8;">편집자 판단·메모 <span style="background:#c53030;color:#fff;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:700;letter-spacing:.05em;margin-left:6px;">INTERNAL</span></div>
    ${textBlock(editorAssess)}
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">합의 사항</div>
    <div style="background:#f0f7ff;border:1px solid #d0e3ff;border-radius:8px;padding:14px 16px;">
      ${textBlock(agreement)}
    </div>
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">다음 단계</div>
    <div style="background:#f0faf0;border:1px solid #c6e6c6;border-radius:8px;padding:14px 16px;">
      ${textBlock(action)}
    </div>
  </div>

</div>
<div class="md-footer">
  <span>한빛미디어 출판기획팀 — 내부용</span>
  <span>${editor}</span>
</div>`;
}

function _renderMeetSummary(d){
  const {type,author,affil,title,sub,concept,pages,period,reader,editor,place,schedule,agreement,action,dateStr,tocItems,reaction,discuss,directionShift} = d;

  const emptyPlaceholder = `<div style="padding:12px;text-align:center;color:#bbb;font-size:11px;border:1.5px dashed #e0e0e0;border-radius:6px;">미팅 후 작성해주세요</div>`;

  // _generatedSummary 우선 사용, 없으면 폼 필드 직접 사용
  const gs = _generatedSummary;
  const isAI = !!gs;

  const aiBadge = isAI ? `<span style="background:#7c3aed;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;margin-left:6px;">✨ AI 자동 생성</span>` : '';

  const openingHtml = isAI && gs.opening ? `<div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:11px 15px;margin-bottom:18px;font-size:11.5px;line-height:1.75;border-radius:0 6px 6px 0;color:#1a1a18;">${gs.opening.replace(/\n/g,'<br>')}</div>` : '';

  const summaryText = isAI && gs.summary ? gs.summary : (reaction || discuss || '');
  const agreementsText = isAI && gs.agreements ? gs.agreements : (agreement || '');
  const nextStepsText = isAI && gs.next_steps ? gs.next_steps : (action || '');
  const closingHtml = isAI && gs.closing ? `<div style="background:#f9fafb;border-left:4px solid #1a6b3c;padding:11px 15px;margin-top:18px;font-size:11.5px;line-height:1.75;border-radius:0 6px 6px 0;color:#1a1a18;">${gs.closing.replace(/\n/g,'<br>')}</div>` : '';

  document.getElementById('meet-doc').innerHTML = `
<div class="md-header">
  <div class="md-header-left">
    <div class="md-sub">Meeting Summary</div>
    <div class="md-title">출판 기획 미팅 결과 요약</div>
  </div>
  <div class="md-header-right">
    <div>${dateStr}</div>
    <div>담당: ${editor}</div>
    <div style="margin-top:4px;"><span style="background:#2563eb;color:#fff;padding:2px 8px;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:.05em;">결과 요약</span>${aiBadge}</div>
  </div>
</div>
<div class="md-body">

  ${openingHtml}

  <div class="md-block">
    <div class="md-block-title" style="color:#2563eb;">미팅 참석자</div>
    <div class="md-info-grid">
      <div class="md-info-item"><span class="lbl">저자</span><span class="val">${author}</span></div>
      <div class="md-info-item"><span class="lbl">소속</span><span class="val">${affil||'—'}</span></div>
      <div class="md-info-item"><span class="lbl">편집자</span><span class="val">${editor}</span></div>
      <div class="md-info-item"><span class="lbl">출판사</span><span class="val">한빛미디어</span></div>
      <div class="md-info-item"><span class="lbl">일시</span><span class="val">${dateStr}</span></div>
      <div class="md-info-item"><span class="lbl">장소</span><span class="val">${place||'—'}</span></div>
    </div>
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">논의 도서</div>
    <div class="md-info-grid">
      <div class="md-info-item" style="grid-column:1/-1;"><span class="lbl">제목(안)</span><span class="val" style="font-size:14px;font-weight:600;">${title}</span></div>
      ${sub ? `<div class="md-info-item" style="grid-column:1/-1;"><span class="lbl">부제</span><span class="val">${sub}</span></div>` : ''}
    </div>
    ${concept ? `<div class="md-concept-box" style="font-style:italic;">"${concept}"</div>` : ''}
    <div class="md-info-grid" style="margin-top:6px;">
      <div class="md-info-item"><span class="lbl">대상 독자</span><span class="val">${reader||'—'}</span></div>
      <div class="md-info-item"><span class="lbl">예상 분량</span><span class="val">${pages ? pages+'쪽' : '—'}</span></div>
      <div class="md-info-item"><span class="lbl">집필 기간</span><span class="val">${period||'—'}</span></div>
    </div>
  </div>

  ${tocItems ? `
  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">함께 검토할 목차 가안</div>
    <ul class="md-toc-list">${tocItems}</ul>
  </div>` : ''}

  <div class="md-block">
    <div class="md-block-title" style="color:#2563eb;">논의 내용 요약</div>
    <div style="background:#f9fafb;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;">
      ${summaryText ? `<div style="font-size:11.5px;color:#1a1a18;line-height:1.7;">${summaryText.replace(/\n/g,'<br>')}</div>` : emptyPlaceholder}
    </div>
  </div>

  ${directionShift ? `
  <div class="md-block">
    <div class="md-block-title" style="color:#b45309;">방향 확정 사항</div>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;">
      <div style="font-size:11.5px;color:#1a1a18;line-height:1.7;">${directionShift.replace(/\n/g,'<br>')}</div>
    </div>
  </div>` : ''}

  <div class="md-block">
    <div class="md-block-title" style="color:#2563eb;">합의 사항</div>
    <div style="background:#f0f7ff;border:1px solid #d0e3ff;border-radius:8px;padding:14px 16px;">
      ${agreementsText ? `<div style="font-size:11.5px;color:#1a1a18;line-height:1.7;">${agreementsText.replace(/\n/g,'<br>')}</div>` : emptyPlaceholder}
    </div>
  </div>

  <div class="md-block">
    <div class="md-block-title" style="color:#1a6b3c;">다음 단계</div>
    <div style="background:#f0faf0;border:1px solid #c6e6c6;border-radius:8px;padding:14px 16px;">
      ${nextStepsText ? `<div style="font-size:11.5px;color:#1a1a18;line-height:1.7;">${nextStepsText.replace(/\n/g,'<br>')}</div>` : emptyPlaceholder}
      ${schedule ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #c6e6c6;"><span style="font-size:9px;font-weight:700;color:#999;letter-spacing:.1em;">원고 일정 제안</span><div style="font-size:11px;margin-top:2px;color:#444;">${schedule}</div></div>` : ''}
    </div>
  </div>

  ${closingHtml}

</div>
<div class="md-footer">
  <span>한빛미디어 출판기획팀</span>
  <span>${author !== '저자명' ? author+'님 제출용' : '저자 제출용'}</span>
</div>`;
}

async function generateMeetingSummary(){
  const author   = meetVal('m-author') || '저자명';
  const title    = meetVal('m-title') || '도서 제목(안)';
  const date     = meetVal('m-date');
  const dateStr  = date ? new Date(date).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}) : '미팅 일시';
  const reaction = meetVal('m-reaction');
  const agreement= meetVal('m-agreement');
  const action   = meetVal('m-action');
  const dirShift = meetVal('m-direction-shift');
  const discuss  = meetVal('m-discuss');

  // API 키 확인
  let apiKey = '';
  try { apiKey = (await loadApiKey()).trim(); } catch(e) {}

  if (apiKey) {
    // AI 경로
    const btn = document.querySelector('.meet-section[data-modes="summary"] button');
    if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }
    try {
      const prompt = `당신은 IT 도서 편집자입니다. 저자에게 발송할 미팅 결과 요약을 작성하세요.

[글쓰기 원칙]
- 편집자가 저자에게 메일 쓰듯이 정중하면서도 따뜻하게. 관료적 문장 금지.
- "~하겠습니다", "~드리겠습니다" 남발하지 말고 간결하게.
- 합의 사항은 명확히, 다음 단계는 구체적 날짜/행동으로.


[저자]: ${author}
[도서(안)]: ${title}
[미팅 일시]: ${dateStr}

[현장 논의 내용]: ${reaction || '(없음)'}
[합의 사항]: ${agreement || '(없음)'}
[다음 단계]: ${action || '(없음)'}
[방향 변경]: ${dirShift || '(없음)'}
[논의 포인트]: ${discuss || '(없음)'}

아래 JSON 형식으로만 응답하세요:
{
  "opening": "안부 인사 + 미팅 감사 인사 (2~3문장)",
  "summary": "핵심 논의 내용 요약 (3~5문장)",
  "agreements": "합의된 주요 사항 (bullet points, \\n으로 구분)",
  "next_steps": "다음 단계 액션 아이템 (bullet points, \\n으로 구분)",
  "closing": "마무리 인사 (1~2문장)"
}`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:1500,
          system: typeof _cachedSystem==='function'?_cachedSystem(PUBLISHING_PERSONA||''):undefined,
          messages:[{role:'user',content:prompt}]
        })
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error('API 오류 ' + resp.status + ': ' + (errData.error?.message || ''));
      }
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        _generatedSummary = JSON.parse(jsonMatch[0]);
        showToast('미팅 결과 요약이 AI로 생성되었습니다.', 'green');
      } else {
        throw new Error('AI 응답에서 JSON을 찾을 수 없습니다');
      }
    } catch(e) {
      console.error('AI summary error:', e);
      showToast('AI 생성 실패. 규칙 기반으로 생성합니다.', 'yellow');
      _generateRuleBasedSummary(author, title, dateStr, reaction, agreement, action, dirShift, discuss);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ 요약 자동 생성'; }
    }
  } else {
    // 규칙 기반 경로
    _generateRuleBasedSummary(author, title, dateStr, reaction, agreement, action, dirShift, discuss);
    showToast('규칙 기반으로 미팅 결과 요약을 생성했습니다. (API 키 설정 시 AI 생성 가능)', 'green');
  }
  meetRender();
}

function _generateRuleBasedSummary(author, title, dateStr, reaction, agreement, action, dirShift, discuss) {
  const authorName = author && author !== '저자명' ? author : '저자';

  const opening = `${authorName}님, 안녕하세요.\n${dateStr}에 진행한 『${title}』 관련 미팅에 참석해 주셔서 감사합니다. 함께 나눈 이야기를 아래와 같이 정리해 드립니다.`;

  let summaryParts = [];
  if (reaction) summaryParts.push(reaction);
  if (discuss) summaryParts.push(discuss);
  if (dirShift) summaryParts.push('방향 확정: ' + dirShift);
  const summary = summaryParts.join('\n') || '미팅에서 논의된 내용을 정리 중입니다.';

  const agreements = agreement || '합의 사항을 정리 중입니다.';
  const next_steps = action || '다음 단계를 정리 중입니다.';

  const closing = `궁금하신 점이나 추가 논의가 필요한 사항이 있으시면 언제든 편하게 말씀해 주세요.\n감사합니다.`;

  _generatedSummary = { opening, summary, agreements, next_steps, closing };
}

function meetReset(){
  ['m-author','m-affil','m-career','m-books','m-influence',
   'm-type','m-title','m-subtitle','m-concept','m-pages','m-period','m-reader',
   'm-date','m-editor','m-place','m-agenda',
   'm-market','m-diff','m-toc',
   'm-royalty','m-print','m-support','m-schedule',
   'm-reaction','m-agreement','m-action',
   'm-discuss','m-questions','m-explore',
   'm-direction-shift','m-issues','m-editor-assess'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value = el.tagName==='SELECT' ? el.options[0].value : '';
  });
  ['mc-exp','mc-excl','mc-sample','mc-time'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.checked=false;
  });
  ['mc-exp-note','mc-excl-note','mc-sample-note','mc-time-note'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value='';
  });
  _generatedSummary = null;
  meetRender();
}

function meetDownloadPdf() {
  const docEl = document.getElementById('meet-doc');
  if (!docEl) return;

  const author   = meetVal('m-author') || '저자';
  const title    = meetVal('m-title')  || '도서제목';
  const modeLabel = {'brief':'사전안내','discuss':'미팅진행','notes':'편집자정리','summary':'미팅결과요약'}[_meetDocMode] || '미팅자료';
  const docTitle = `${modeLabel}_${author}_${title}`;

  const base = getBaseUrl();

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${docTitle.replace(/[<>&"]/g, '')}</title>
<link rel="stylesheet" href="${base}shared/styles.css">
<link rel="stylesheet" href="${base}panels/panel6/panel6.css">
<link href="${base}libs/pretendard.min.css" rel="stylesheet">
<style>
/* 대시보드 레이아웃 해제 */
body { height: auto !important; overflow: visible !important; display: block !important;
  background: #e8e6e1 !important; padding: 24px !important; margin: 0 !important; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
@page { size: A4; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .meet-doc { box-shadow: none !important; margin: 0 !important; width: 210mm !important; }
  iframe { display: none !important; }
}
</style>
</head>
<body>
${docEl.outerHTML}
</body>
</html>`;

  openPrintPopup(html);
}

async function generateMeetingWithAI() {
  const apiKey = (await loadApiKey()).trim();
  if (!apiKey) { showToast('API 키가 없습니다.', 'red'); return; }

  const bookTitle = (document.getElementById('m-title')?.value || '').trim();
  if (!bookTitle) { showToast('도서 제목(안)을 먼저 입력해주세요.', 'red'); return; }

  const btn = document.getElementById('meet-ai-btn');
  if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }

  const gv = id => (document.getElementById(id)||{}).value||'';
  const author   = gv('m-author');
  const influence= gv('m-influence');
  const books    = gv('m-books');
  const concept  = gv('m-concept') || gv('pf-concept');
  const diff     = gv('m-diff') || gv('pf-diff');
  const reader   = gv('m-reader') || gv('pf-reader-core');
  const existingToc = gv('m-toc');
  const market   = gv('m-market');

  let analysisCtx = '';
  const activeCat = (typeof _propSelectedCat!=='undefined'&&_propSelectedCat) || _meetCtxCat || '';
  if (activeCat && typeof analysisData !== 'undefined') {
    const cd = analysisData.find(x => x.cat === activeCat);
    if (cd) {
      const totalPop = cd.lecture.reduce((s,l)=>s+(l.pop||0),0);
      analysisCtx = `분야: ${cd.cat}, 경쟁서: ${cd.comp.length}권, 강의수요: 총 ${totalPop.toLocaleString()}명 수강`;
    }
  }

  const prompt = `당신은 10년 경력의 IT 도서 편집자입니다. 저자 미팅 준비 자료를 작성하세요.

[글쓰기 원칙]
- 편집자 동료에게 브리핑하듯 간결하고 핵심적으로. 형식적인 수식 금지.
- 질문은 저자가 편하게 답할 수 있도록 구체적이되 개방적으로.
- 아젠다는 실제 미팅에서 바로 꺼낼 수 있는 현실적인 내용.


[기획 정보]
도서 제목(안): ${bookTitle}
${author ? '저자: '+author : ''}
${influence ? '저자 영향력: '+influence : ''}
${books ? '기존 저서: '+books : ''}
${concept ? '도서 콘셉트: '+concept : ''}
${reader ? '대상 독자: '+reader : ''}
${diff ? '차별화 포인트: '+diff : ''}
${existingToc ? '목차(가안):\n'+existingToc : ''}
${market ? '시장 현황: '+market : ''}
${analysisCtx ? '분석 데이터: '+analysisCtx : ''}

아래 JSON 형식으로만 응답하세요. 한국어로 작성하세요.

{
  "subtitle": "부제 (30자 이내)",
  "concept": "이 책의 핵심 가치를 한 문장으로 — 저자님께 설명할 수 있는 콘셉트",
  "pages": "예상 분량 숫자",
  "period": "집필 기간",
  "reader": "대상 독자 — 직군과 수준 구체적으로",
  "market": "시장 근거 2-3줄 — 경쟁서 현황과 강의 수요 수치 포함. 없으면 일반적으로 추정",
  "diff": "경쟁 도서 대비 차별화 포인트 2문장",
  "toc": "주요 목차 — 7~9개 장, '1. 제목\\n2. 제목' 형식",
  "agenda": "미팅 아젠다 5~6개 항목, '1. 항목\\n2. 항목' 형식",
  "support": "출판사 편집·마케팅 지원 내용 2-3가지",
  "schedule": "원고 제출 일정 제안 (샘플챕터 + 전고)",
  "memo": "편집자가 미팅 전 추가 확인해야 할 사항 2-3가지"
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: typeof _cachedSystem==='function'?_cachedSystem(PUBLISHING_PERSONA||''):undefined, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.error?.message||`HTTP ${resp.status}`); }
    const res = await resp.json();
    const m = res.content[0].text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON 응답을 받지 못했습니다.');
    const r = JSON.parse(m[0]);
    const sv = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    sv('m-subtitle', r.subtitle);
    sv('m-concept', r.concept);
    sv('m-pages', r.pages);
    sv('m-period', r.period);
    sv('m-reader', r.reader);
    sv('m-market', r.market);
    sv('m-diff', r.diff);
    sv('m-toc', r.toc);
    sv('m-agenda', r.agenda);
    sv('m-support', r.support);
    sv('m-schedule', r.schedule);
    meetRender();
    showToast('✨ AI가 저자 미팅 자료를 완성했습니다! 내용을 검토 후 수정하세요.', 'green');
  } catch (err) {
    showToast(`AI 생성 실패: ${err.message}`, 'red');
    console.error('generateMeetingWithAI error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ AI 자동 완성'; }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 저자 미팅 자료 — 컨텍스트 진입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let _meetCtxAuthor = '';
let _meetCtxCat = '';
let _meetDocMode = 'brief'; // 'brief' | 'discuss' | 'notes' | 'summary'
let _generatedSummary = null; // { opening, summary, agreements, next_steps, closing } | null
function setMeetDocMode(mode) {
  _meetDocMode = mode;
  // 탭 버튼 active 처리
  document.querySelectorAll('.meet-mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('meet-mode-' + mode)?.classList.add('active');
  // 힌트 텍스트
  document.querySelectorAll('.meet-mode-hint').forEach(h => h.style.display = 'none');
  const hintEl = document.getElementById('meet-mode-hint-' + mode);
  if (hintEl) hintEl.style.display = '';
  // 왼쪽 폼 섹션 show/hide
  document.querySelectorAll('.meet-form-body .meet-section[data-modes]').forEach(sec => {
    const modes = sec.getAttribute('data-modes').split(',');
    sec.style.display = modes.includes(mode) ? '' : 'none';
  });
  // 액션바 AI 버튼: brief 모드에서만 표시
  const aiBtn = document.getElementById('meet-ai-btn');
  if (aiBtn) aiBtn.style.display = mode === 'brief' ? '' : 'none';
  // 기본값 채우기 (빈 필드만)
  meetInitDefaults(mode);
  // 미리보기 렌더링
  meetRender();
}

function meetInitDefaults(mode) {
  const dflt = (id, val) => {
    const el = document.getElementById(id);
    if (el && !el.value.trim()) el.value = val;
  };
  if (mode === 'brief') {
    dflt('m-place', '서울 서대문구 연희로2길 62');
    dflt('m-title', '가제: 미정');
    dflt('m-agenda',
      '1. 시장 현황 및 출판 기회 공유\n2. 제안 도서 방향 함께 논의\n3. 저자님 관심 분야 및 집필 여건 확인\n4. 목차 가안 함께 검토\n5. 출판 조건 및 향후 일정 협의');
  } else if (mode === 'discuss') {
    dflt('m-discuss',
      '1. 저자님의 이 분야 독보적 경험과 강점 확인\n2. 제안 도서 방향을 함께 구체화\n3. 목차 가안 피드백 및 개선 방향 논의\n4. 집필 여건(시간·일정) 실질 확인\n5. 출판 조건 및 계약 방향 협의');
    dflt('m-questions',
      '- 현재 이 주제로 다른 집필 계획이 있으신가요?\n- 독자에게 가장 강조하고 싶은 핵심 메시지는 무엇인가요?\n- 샘플 챕터 제출이 언제쯤 가능하실 것 같으신가요?\n- 집필에 월 몇 시간 정도 투자 가능하신지요?\n- 목차에서 가장 자신 있는 파트와 보완이 필요한 파트가 있다면?');
    dflt('m-explore',
      '- 시리즈 확장 가능성 (2권, 실습편 등)\n- 독자층 확장 방향 (입문자 → 실무자 등)\n- 콘텐츠 포맷 변형 (워크북, 강의 연계)\n- 주제 심화 또는 인접 분야 연계');
  }
  // notes, summary: 빈 상태로 시작 (미팅 중 실시간 기록 / 자동 생성)
}

function openMeetingFromAuthor(authorName) {
  const r = (typeof AUTHOR_DATA !== 'undefined' ? AUTHOR_DATA : []).find(x => x.저자명 === authorName);
  if (!r) return;
  switchTab(6, document.getElementById('tab6'));
  const sv = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  sv('m-author', r.저자명);
  // 구분(플랫폼)을 소속/직함으로 활용
  if (r.구분) sv('m-affil', r.구분);
  // 대표도서 있으면 경력에 반영
  if (r.대표도서) {
    const careerLine = `저서: 『${r.대표도서}』${r.출판사 ? ` (${r.출판사})` : ''}`;
    sv('m-career', careerLine);
  }
  sv('m-editor', r.담당자);
  _meetCtxAuthor = r.저자명;
  updateMeetCtxBar();
  meetRender();
  showToast(`👤 "${r.저자명}" 저자 정보를 불러왔습니다. 책 정보를 채워주세요.`, 'green');
}

function openMeetingFromProposal() {
  switchTab(6, document.getElementById('tab6'));
  const gv = id => (document.getElementById(id) || {}).value || '';
  const sv = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };

  // 기본 정보
  const author = gv('pf-author');
  sv('m-author', author);
  sv('m-editor', gv('pf-editor'));

  // 도서 제목: pf-title(panel5) → pf-title2(panel3 헤더) → 카테고리 기반 제안
  const planTitle = gv('pf-title') || gv('pf-title2');
  const cat = window._lastCatName || (typeof _propSelectedCat !== 'undefined' ? _propSelectedCat : '') || '';
  if (planTitle) {
    sv('m-title', planTitle);
  } else if (cat) {
    const d = typeof analysisData !== 'undefined' ? analysisData.find(x => x.cat === cat) : null;
    const titleMap = { gap: `${cat} 완벽 가이드`, behind: `${cat} 실전 입문`, leading: `${cat} 심화 마스터`, 'plan-only': `${cat} 기초부터 시작` };
    sv('m-title', titleMap[d?.status] || `${cat} 실전 가이드`);
  }

  // 대상 독자: READER why 카드(pw-body-2)
  const readerFromWhy = gv('pw-body-2');
  const readerFromPlan = gv('pf-reader-core');
  sv('m-reader', readerFromPlan || readerFromWhy);

  // 차별화: pf-diff
  sv('m-diff', gv('pf-diff'));

  // 한줄 콘셉트
  sv('m-concept', gv('pf-concept'));

  // 시장 근거: analysisData에서 추출
  const activeCat = cat;
  if (activeCat && typeof analysisData !== 'undefined') {
    const cd = analysisData.find(x => x.cat === activeCat);
    if (cd) {
      const compTop = cd.comp[0];
      const compAge = compTop?.year ? new Date().getFullYear() - parseInt(compTop.year) : 0;
      const totalPop = cd.lecture.reduce((s,l)=>s+(l.pop||0), 0);
      const marketText = [
        `경쟁서 ${cd.comp.length}권 출간 / 우리 도서 ${cd.mine.length}권`,
        compTop ? `최신 경쟁서: "${compTop.title}"(${compTop.pub}, ${compTop.year}년)${compAge>=3?' → '+compAge+'년 경과':''}` : '',
        totalPop > 0 ? `강의 수강생 총 ${totalPop.toLocaleString()}명 (${cd.lecture.length}개 강의)` : ''
      ].filter(Boolean).join('\n');
      sv('m-market', marketText);
    }
  }

  // 목차: ptoc-rows에서 추출
  const tocRows = document.querySelectorAll('#ptoc-rows .toc-row-p');
  if (tocRows.length) {
    const tocLines = Array.from(tocRows).map(row => {
      const rowId = row.id.replace('ptoc-', '');
      const num = (document.getElementById(`ptc-num-${rowId}`) || {}).value || '';
      const title = (document.getElementById(`ptc-title-${rowId}`) || {}).value || '';
      return num && title ? `${num}. ${title}` : (title || '');
    }).filter(Boolean);
    if (tocLines.length) sv('m-toc', tocLines.join('\n'));
  }

  if (cat) _meetCtxCat = cat;
  if (author) _meetCtxAuthor = author;
  updateMeetCtxBar();
  meetRender();
  showToast(`📝 제안서 정보를 미팅 자료로 불러왔습니다.${author ? '' : ' 저자명을 입력해주세요.'}`, 'green');
}

function updateMeetCtxBar() {
  const el = document.getElementById('meet-ctx-content');
  if (!el) return;
  const hasA = !!_meetCtxAuthor;
  const hasC = !!_meetCtxCat;
  if (!hasA && !hasC) {
    el.innerHTML = `
      <div class="meet-ctx-hint">어떤 저자와의 미팅인가요? —
        <a onclick="switchTab(2,document.getElementById('tab2'))">저자풀</a>에서 저자를 고르거나
        <a onclick="switchTab(3,document.getElementById('tab3'))">저자 제안서 탭</a>에서 넘어오세요.</div>
      <div class="meet-ctx-btns">
        <button class="meet-ctx-link-btn" onclick="switchTab(2,document.getElementById('tab2'))">👤 저자풀에서 선택 ↗</button>
        <button class="meet-ctx-link-btn" onclick="switchTab(3,document.getElementById('tab3'))">📝 제안서에서 가져오기 ↗</button>
      </div>`;
  } else {
    const tags = [];
    if (hasA) tags.push(`<span class="meet-ctx-tag">👤 ${_meetCtxAuthor}<button class="ctag-del" onclick="_meetCtxAuthor='';updateMeetCtxBar();" title="저자 연결 해제">×</button></span>`);
    if (hasC) tags.push(`<span class="meet-ctx-tag">📚 ${_meetCtxCat}<button class="ctag-del" onclick="_meetCtxCat='';updateMeetCtxBar();" title="카테고리 연결 해제">×</button></span>`);
    if (!hasA) tags.push(`<button class="meet-ctx-link-btn" onclick="switchTab(2,document.getElementById('tab2'))">👤 저자 선택 ↗</button>`);
    if (!hasC) tags.push(`<button class="meet-ctx-link-btn" onclick="switchTab(3,document.getElementById('tab3'))">📚 카테고리 연결 ↗</button>`);
    el.innerHTML = `<div class="meet-ctx-tags">${tags.join('')}</div>`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 사전 설정 마법사
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let _wizAction = null; // 'proposal-full' | 'proposal-ai' | 'meeting'
let _wizCat = '';

function _wizRow(status, label, value) {
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  return `<div class="ai-wiz-row ${status}">
    <span class="ic">${icon}</span>
    <div class="info"><div class="lbl">${label}</div><div class="val">${value}</div></div>
  </div>`;
}

function showConfirmModal(title, bodyHtml, onConfirm) {
  document.getElementById('_aiConfirmModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = '_aiConfirmModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <h3 style="margin:0 0 16px;font-size:16px;color:var(--text)">${title}</h3>
      <div>${bodyHtml}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button onclick="document.getElementById('_aiConfirmModal').remove()"
                style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:var(--surface);cursor:pointer;color:var(--text);font-family:inherit">취소</button>
        <button id="_aiConfirmBtn"
                style="padding:8px 16px;border:none;border-radius:6px;background:#6366f1;color:#fff;cursor:pointer;font-family:inherit">AI 생성 시작</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_aiConfirmBtn').onclick = () => {
    overlay.remove();
    onConfirm();
  };
}

function confirmAndGenerateProposal() {
  const author = document.getElementById('pf-author')?.value || '미입력';
  const cat = (typeof _propSelectedCat !== 'undefined' && _propSelectedCat) || window._lastCatName || '미선택';
  const editor = document.getElementById('pf-editor')?.value || '미입력';
  showConfirmModal(
    'AI 저자 제안서 생성',
    `<div style="margin:12px 0;font-size:14px;color:var(--text)">
       <div style="margin-bottom:6px"><b>저자:</b> ${author}</div>
       <div style="margin-bottom:6px"><b>카테고리:</b> ${cat}</div>
       <div><b>담당 편집자:</b> ${editor}</div>
     </div>
     <p style="color:var(--muted);font-size:13px;margin-top:14px">위 정보를 바탕으로 AI가 저자 제안서를 생성합니다.<br>계속하시겠습니까?</p>`,
    () => openAIProposalWizard(window._lastCatName || '', true)
  );
}

async function openAIProposalWizard(catName, aiOnly) {
  _wizAction = aiOnly ? 'proposal-ai' : 'proposal-full';
  _wizCat = catName;

  const apiKey = (document.getElementById('ai-api-key')?.value || '').trim() || await loadApiKey();
  const d = typeof analysisData !== 'undefined' ? analysisData.find(x => x.cat === catName) : null;
  const totalPop = d ? d.lecture.reduce((s, l) => s + (l.pop || 0), 0) : 0;

  const hasCat = !!d;
  const hasKey = !!apiKey;
  const canStart = hasCat && hasKey;

  document.getElementById('ai-wiz-title').textContent = '✨ AI 저자 제안서 생성 — 사전 확인';

  const keySection = !hasKey ? `
    <div class="ai-wiz-key-row">
      <label>API 키 입력 (필수)</label>
      <input class="ai-wiz-key-input" type="password" id="wiz-api-key" placeholder="sk-ant-..." autocomplete="off"
        oninput="const v=this.value.trim();if(v){saveApiKey(v);const el=document.getElementById('ai-api-key');if(el)el.value=v;}document.getElementById('ai-wiz-start').disabled=!v||!${hasCat};">
    </div>` : '';

  const notice = !hasCat
    ? `<div class="ai-wiz-notice">⚠️ 분석 탭의 카테고리 행에서 ✨ AI 버튼을 클릭해야 시장 데이터가 연동됩니다.</div>`
    : !hasKey
    ? `<div class="ai-wiz-notice">⚠️ API 키를 입력하면 생성 버튼이 활성화됩니다.</div>`
    : '';

  document.getElementById('ai-wiz-body').innerHTML = `
    <div class="ai-wiz-sec">
      <div class="ai-wiz-sec-title">재료 확인</div>
      <div class="ai-wiz-rows">
        ${_wizRow(hasCat ? 'ok' : 'err', '선택 카테고리',
          hasCat ? catName : '분석 탭에서 카테고리 ✨ AI 버튼으로 진입하세요')}
        ${hasCat ? _wizRow('ok', '시장 데이터',
          `경쟁 ${d.comp.length}권 · 우리 ${d.mine.length}권 · 강의 ${d.lecture.length}개 (수강생 ${totalPop.toLocaleString()}명)`) : ''}
        ${_wizRow(hasKey ? 'ok' : 'err', 'Anthropic API 키',
          hasKey ? '저장된 키 사용' : '아래에서 입력 (필수)')}
      </div>
      ${keySection}
      ${notice}
    </div>
    <div class="ai-wiz-sec">
      <div class="ai-wiz-sec-title">AI가 채울 항목</div>
      <div class="ai-wiz-gen-list">
        <div class="ai-wiz-gen-item">헤더 타이틀 2줄 (저자 분야 + 핵심 메시지)</div>
        <div class="ai-wiz-gen-item">Why This Book? — 출간 필요성 2~3문장</div>
        <div class="ai-wiz-gen-item">시장 근거 4가지 (MARKET · TIMING · READER · OSMU)</div>
        <div class="ai-wiz-gen-item">한빛미디어 강점 4가지 (DIST · MKT · EDIT · DATA)</div>
        <div class="ai-wiz-gen-item">미팅 제안 멘트</div>
      </div>
    </div>`;

  document.getElementById('ai-wiz-start').disabled = !canStart;
  document.getElementById('ai-wiz-modal').style.display = 'flex';
}

async function openAIMeetingWizard() {
  _wizAction = 'meeting';
  _wizCat = '';

  const apiKey = (await loadApiKey()).trim();
  const bookTitle = (document.getElementById('m-title')?.value || '').trim();
  const author = (document.getElementById('m-author')?.value || '').trim();
  const catCtx = _meetCtxCat || window._lastCatName || '';
  const hasKey = !!apiKey;
  const hasTitle = !!bookTitle;
  const canStart = hasKey && hasTitle;

  document.getElementById('ai-wiz-title').textContent = '✨ AI 미팅 자료 자동 완성 — 사전 확인';

  const notices = [];
  if (!hasTitle) notices.push('도서 제목(안)을 먼저 입력해야 생성할 수 있습니다.');
  else if (!hasKey) notices.push('API 키가 없습니다. AI 생성 시 사전 확인 창에서 입력해주세요.');
  else if (!author) notices.push('저자명이 없으면 일반적인 내용으로 생성됩니다.');
  else if (!catCtx) notices.push('저자풀에서 저자를 선택하거나 저자 제안서 탭에서 넘어오면 시장 데이터가 연동됩니다.');

  document.getElementById('ai-wiz-body').innerHTML = `
    <div class="ai-wiz-sec">
      <div class="ai-wiz-sec-title">입력 확인</div>
      <div class="ai-wiz-rows">
        ${_wizRow(hasTitle ? 'ok' : 'err', '도서 제목(안)',
          hasTitle ? `"${bookTitle}"` : '미팅 자료 탭에서 도서 제목을 먼저 입력하세요 (필수)')}
        ${_wizRow(author ? 'ok' : 'warn', '저자명',
          author ? author : '미입력 — 저자풀 탭에서 저자를 선택하면 자동으로 채워집니다')}
        ${_wizRow(catCtx ? 'ok' : 'warn', '시장 데이터 연동',
          catCtx ? `"${catCtx}" 카테고리 데이터 활용` : '없음 — 저자 제안서 탭에서 넘어오면 자동 연결됩니다')}
        ${_wizRow(hasKey ? 'ok' : 'err', 'Anthropic API 키',
          hasKey ? '저장된 키 사용' : '아래에서 입력하세요 (필수)')}
      </div>
      ${notices.length ? `<div class="ai-wiz-notice">⚠️ ${notices[0]}</div>` : ''}
    </div>
    <div class="ai-wiz-sec">
      <div class="ai-wiz-sec-title">AI가 채울 항목</div>
      <div class="ai-wiz-gen-list">
        <div class="ai-wiz-gen-item">부제 및 한줄 콘셉트</div>
        <div class="ai-wiz-gen-item">예상 분량 및 집필 기간</div>
        <div class="ai-wiz-gen-item">대상 독자층</div>
        <div class="ai-wiz-gen-item">시장 근거 및 차별화 포인트</div>
        <div class="ai-wiz-gen-item">주요 목차 구성(안) 7~9개 장</div>
        <div class="ai-wiz-gen-item">미팅 아젠다 5~6개 항목</div>
        <div class="ai-wiz-gen-item">출판사 편집·마케팅 지원 내용</div>
        <div class="ai-wiz-gen-item">원고 제출 일정 제안</div>
      </div>
    </div>`;

  document.getElementById('ai-wiz-start').disabled = !canStart;
  document.getElementById('ai-wiz-modal').style.display = 'flex';
}

function closeAIWizard() {
  document.getElementById('ai-wiz-modal').style.display = 'none';
  _wizAction = null;
  _wizCat = '';
}

function runAIWizard() {
  const action = _wizAction;
  const cat = _wizCat;
  closeAIWizard();
  if (action === 'proposal-full') {
    openProposalFromCat(cat, true);
  } else if (action === 'proposal-ai') {
    generateProposalWithAI(cat);
  } else if (action === 'meeting') {
    generateMeetingWithAI();
  }
}

// ── 헤더 높이 동적 측정 ──────────────────────────────────────────
function updateHdrHeight() {
  const hdr = document.querySelector('.hdr');
  if (!hdr) return;
  const h = hdr.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--hdr-h', h + 'px');
}
window.addEventListener('load', () => {
  updateHdrHeight();
  const hdr = document.querySelector('.hdr');
  if (hdr && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateHdrHeight).observe(hdr);
  }
});
window.addEventListener('resize', updateHdrHeight);
// 탭 전환 시에도 재측정 + panel6 진입 시 렌더링/컨텍스트 바 초기화 (단일 래핑)
const _origSwitchTab6 = window.switchTab;
window.switchTab = function(i, btn) {
  if (typeof _origSwitchTab6 === 'function') _origSwitchTab6(i, btn);
  requestAnimationFrame(updateHdrHeight);
  if (i === 6) { setMeetDocMode('brief'); updateMeetCtxBar(); }
};
// ─────────────────────────────────────────────────────────────────
