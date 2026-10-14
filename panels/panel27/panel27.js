/* ============================================================
   panel27.js — 원고 조판 보기
   원고(docx · md · txt)를 책 지면으로 조판해 펼침면으로 보여 준다.
   조판 화면(book.html)은 쪽·제목에 전역 CSS를 쓰므로 iframe으로 분리한다.
   ============================================================ */
(function () {
  const root = document.getElementById('panel27');
  if (!root) return;
  const ver = (document.currentScript && document.currentScript.src.split('?')[1]) || '';  // index.html의 ?v= 를 이어 준다
  function init() {  // 처음 열 때만 불러온다(올린 원고는 다른 메뉴에 다녀와도 유지)
    if (!root.firstChild) root.innerHTML = '<iframe title="원고 조판 보기" src="panels/panel27/book.html' + (ver ? '?' + ver : '') + '"></iframe>';
  }
  if (typeof PanelRegistry !== 'undefined') PanelRegistry.register(27, { onActivate: init });
})();
