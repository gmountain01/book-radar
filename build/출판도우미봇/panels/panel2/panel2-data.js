const AUTHOR_DATA = JSON.parse(document.getElementById('author-json').textContent);

function renderAuthors(list) {
  const count = document.getElementById('authorCount');
  // 통계 계산
  const pubCnt=list.filter(r=>(r.출간여부||'').includes('출간')).length;
  const tagSet=new Set(list.flatMap(r=>(r.태그||'').split(',').map(t=>t.trim()).filter(Boolean)));
  count.innerHTML=`<span style="font-weight:600;color:var(--text);">${list.length}명</span> <span style="color:var(--muted);">/ 출간 ${pubCnt}명 · 미출간 ${list.length-pubCnt}명 · 태그 ${tagSet.size}종</span>`;
  if (!list.length) {
    document.getElementById('authorTable').innerHTML = '<div class="empty">검색 결과 없음</div>';
    return;
  }

  const pubBadge = (v) => {
    if (!v) return '<span style="font-size:.65rem;color:var(--muted);">미확인</span>';
    if (v.includes('출간') || v === 'O') return '<span style="font-size:.65rem;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd);padding:1px 5px;border-radius:3px;font-weight:600;">출간</span>';
    return '<span style="font-size:.65rem;color:var(--muted);">' + v + '</span>';
  };

  const platIcon = (v) => {
    if (!v) return '';
    if (v.includes('유튜브')) return '▶ ';
    if (v.includes('강의')) return '🎓 ';
    if (v.includes('블로그')||v.includes('브런치')) return '✍ ';
    if (v.includes('인스타')) return '📸 ';
    return '';
  };

  const rows = list.map(r => {
    const url = (r.URL || '').split('\n')[0].trim();
    const nameCell = url
      ? `<a href="${url}" target="_blank" style="color:var(--blue);font-weight:600;text-decoration:none;font-size:.85rem;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${r.저자명}</a>`
      : `<span style="font-weight:600;font-size:.85rem;">${r.저자명}</span>`;

    const tags = (r.태그||'').split(',').filter(t=>t.trim()).map(t =>
      `<span style="display:inline-block;font-size:.65rem;background:var(--blue-bg);color:var(--blue);border-radius:3px;padding:1px 5px;margin:1px;">${t.trim()}</span>`
    ).join('');

    const progress = r.최근업데이트 || r.섭외진행 || '';
    const book = r.대표도서 ? `<div style="font-size:.72rem;color:var(--muted);margin-top:2px;">📖 ${r.대표도서}${r.출판사?' ('+r.출판사+')':''}</div>` : '';
    const email = r.이메일 ? `<div style="font-size:.72rem;color:var(--muted);margin-top:1px;">✉ ${r.이메일}</div>` : '';

    return `<tr style="border-top:1px solid var(--border);">
      <td style="padding:.6rem .8rem;vertical-align:top;white-space:nowrap;">
        ${nameCell}
        <div style="font-size:.7rem;color:var(--muted);margin-top:2px;">${platIcon(r.구분)}${r.구분||''}</div>
        ${r.구독자?'<div style="font-family:DM Mono,monospace;font-size:.68rem;color:var(--muted);">👥 '+r.구독자+'</div>':''}
      </td>
      <td style="padding:.6rem .8rem;vertical-align:top;">
        ${tags}
      </td>
      <td style="padding:.6rem .8rem;vertical-align:top;">
        <span style="font-size:.75rem;">${r['전문서/활용서']||''}</span>
      </td>
      <td style="padding:.6rem .8rem;vertical-align:top;">
        ${pubBadge(r.출간여부)}
        ${book}
        ${email}
      </td>
      <td style="padding:.6rem .8rem;vertical-align:top;max-width:220px;">
        <div style="font-size:.75rem;color:var(--text);line-height:1.5;">${progress}</div>
      </td>
      <td style="padding:.6rem .8rem;vertical-align:top;font-size:.72rem;color:var(--muted);">
        <div>${r.담당자||''}</div>
        <button class="cat-action-btn" style="margin-top:.38rem;" onclick="openMeetingFromAuthor('${r.저자명.replace(/'/g,"\\'")}')">📋 미팅</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('authorTable').innerHTML = `
    <div style="overflow-x:auto;">
    <table style="width:100%;min-width:900px;border-collapse:collapse;font-size:.82rem;">
      <colgroup>
        <col style="width:160px;"><col style="width:220px;"><col style="width:90px;">
        <col style="width:200px;"><col style="min-width:180px;"><col style="width:60px;">
      </colgroup>
      <thead>
        <tr style="background:var(--surface2);">
          <th style="padding:.55rem .8rem;text-align:left;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid var(--border);white-space:nowrap;">저자/채널명</th>
          <th style="padding:.55rem .8rem;text-align:left;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid var(--border);">태그</th>
          <th style="padding:.55rem .8rem;text-align:left;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid var(--border);white-space:nowrap;">전문/활용</th>
          <th style="padding:.55rem .8rem;text-align:left;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid var(--border);white-space:nowrap;">출간/도서</th>
          <th style="padding:.55rem .8rem;text-align:left;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid var(--border);">진행현황</th>
          <th style="padding:.55rem .8rem;text-align:left;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid var(--border);white-space:nowrap;">담당</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

function filterAuthors() {
  const q = document.getElementById('authorSearch').value.toLowerCase();
  const kind = document.getElementById('authorKind').value;
  const mgr = document.getElementById('authorManager').value;
  const pub = document.getElementById('authorPub').value;

  const filtered = AUTHOR_DATA.filter(r => {
    const matchQ = !q || (r.저자명||'').toLowerCase().includes(q) || (r.태그||'').toLowerCase().includes(q) || (r.담당자||'').toLowerCase().includes(q);
    const matchKind = !kind || (r['전문서/활용서']||'').includes(kind);
    const matchMgr = !mgr || r.담당자 === mgr;
    const matchPub = !pub || (pub==='미' ? (!r.출간여부||!r.출간여부.includes('출간')) : (r.출간여부||'').includes(pub));
    return matchQ && matchKind && matchMgr && matchPub;
  });
  renderAuthors(filtered);
}

// 초기 렌더링
if (document.getElementById('panel2').classList.contains('active')) {
  renderAuthors(AUTHOR_DATA);
}
