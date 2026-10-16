/* ============================================================
   panel27.js — 원고 조판 보기
   원고(docx · hwpx · hwp · md · txt)를 책 지면으로 조판해 펼침면으로 보여 준다.
   조판 화면(book.html)은 쪽·제목에 전역 CSS를 쓰므로 iframe으로 분리한다.
   ============================================================ */
(function () {
  const root = document.getElementById('panel27');
  if (!root) return;
  const ver = (document.currentScript && document.currentScript.src.split('?')[1]) || '';  // index.html의 ?v= 를 이어 준다
  function init() {  // 처음 열 때만 불러온다(올린 원고는 다른 메뉴에 다녀와도 유지)
    if (!root.firstChild) root.innerHTML = '<iframe title="원고 조판 보기" src="panels/panel27/book.html' + (ver ? '?' + ver : '') + '"></iframe>';
  }
  // book.html이 HWP·HWPX를 넘기면 교정 도우미의 원고 읽기(제목 → #)로 Markdown을 만들어 돌려준다
  window.addEventListener('message', async function (e) {
    const d = e.data, f = root.querySelector('iframe');
    if (!f || e.source !== f.contentWindow || !d || d.type !== 'p27-extract') return;
    let r;
    try {
      if (typeof window.P8Extract !== 'function') throw new Error('원고 읽기 기능(교정 도우미)을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
      const ex = await window.P8Extract(d.file, { tables: true });
      r = { md: ex.pages.map(p => p.text).join('\n\n') };
    } catch (err) { r = { error: err.message }; }
    e.source.postMessage(Object.assign({ type: 'p27-extracted', id: d.id }, r), '*');
  });
  if (typeof PanelRegistry !== 'undefined') PanelRegistry.register(27, { onActivate: init });
})();
