/* ============================================================
   panel28.js — 병기 중복 찾기
   원고에서 한글·영어 병기(한글(English) · 한글<sup>English</sup> · English(한글))를 찾아
   용어별 첫 병기 위치, 첫 병기에서 개념을 풀이했는지(규칙 추정), 다시 병기한 곳을 보여 준다.
   원고 읽기는 교정 도우미의 P8Extract를 그대로 쓴다. AI 호출 없음.
   ============================================================ */
(function () {
'use strict';

const NOT_TERM = /^(?:p|pp|v|ver|fig|figure|table|e\.g|i\.e|etc|ex|no|vs|ms|kb|mb|gb|tb|px|kg|km|cm|mm|fps|hz)\b|\bet al\b|\d{4}$/i; // (p. 12)·(v2.0)·(ms)·(Kim et al., 2020) 같은 괄호는 병기가 아니다
const LANG = /^(?:영어|독일어|프랑스어|이탈리아어|스페인어|라틴어|그리스어|일본어|중국어|러시아어|포르투갈어|네덜란드어)$/; // Plato(영어)는 병기가 아니라 언어 표시
const STOP = /^(?:위한|대한|통한|같은|또한|다만|바로|흔히|이런|그런|저런|어떤|모든|각각|우리|이때|특히|하는|되는|있는|없는|라는|또는|혹은|그리고|따라서|하지만|그러나|반면|즉|및|등|이|그|저|한|두|예)$/; // 용어의 일부가 아닌 낱말
const PARTICLE_END = /[은는이가을를의에로와과도한된인할며고서]$/;
const DEF_END = /(?:이다|입니다|이에요|예요|(?:것|단위|기술|방법|모델|개념|과정|기법|구조|방식|도구|체계|분야|원리|현상)다|(?:말|뜻|의미|가리|일컫|지칭|정의)[가-힣]{1,3}다)[.!?]?["”’)]*\s*$/;
const HEAD_TAGS = ['파트', '장', '절', '중', '소', '소소'];
const norm = s => s.toLowerCase().replace(/[\s\-]+/g, ' ').trim();

/** 괄호 앞 한글 용어. 굵은 글씨·따옴표·낫표 안이면 그 범위, 앞에서 같은 영어로 병기한 표기로 끝나면 그 표기, 아니면 영어 낱말 수만큼 앞 어절을 거슬러 간다.
 *  ponytail: 어절 수 추정이라 '현재와 미래 인공지능(AI)'처럼 약어 앞에서는 더 잡히고 '관성의 법칙'은 뒤 어절만 잡힌다(묶는 기준은 영어라 중복 판정에는 영향 없음). 정확한 범위가 필요하면 형태소 분석. */
function koTerm(before, en, known) {
  const bold = before.match(/(?:\*\*|__)([^*_]+)(?:\*\*|__)\s?$/);
  if (bold) return bold[1].trim();
  const text = before.replace(/[*_]+$/, '').trimEnd();
  if (known && text.replace(/\s/g, '').endsWith(known.replace(/\s/g, ''))) return known;
  let open = text.match(/[‘“《「『〈\uDB80\uDC54]([^‘“《「『〈’”》」』〉]{1,40})$/u);
  if (!open) for (const q of ['"', "'"]) { // 여는 따옴표와 닫는 따옴표가 같은 글자면 홀수 번째가 여는 쪽
    const i = text.lastIndexOf(q);
    if (i >= 0 && text.length - i <= 41 && text.split(q).length % 2 === 0) open = [, text.slice(i + 1)];
  }
  if (open && /[가-힣]/.test(open[1])) return open[1].trim();
  const first = en.split(',')[0].trim(), parts = first.split(/[\s\-]+/);
  const n = Math.min(5, parts.length === 1 && /^[A-Z]{2,}$/.test(first) ? first.length : parts.length);
  const words = text.split(/\s+/), out = [];
  while (words.length && out.length < n) {
    let w = words.pop();
    if (out.length) { if (!/^[가-힣A-Za-z0-9][가-힣A-Za-z0-9·\-]*$/.test(w) || STOP.test(w) || (w.length > 2 ? PARTICLE_END.test(w) : /[은는을를]$/.test(w))) break; } // '지도 학습'·'사고 사슬'의 두 글자 앞 어절은 살린다
    else w = w.replace(/^.*[^가-힣A-Za-z0-9·\-]/, ''); // 괄호·문장부호 뒤부터
    out.unshift(w);
  }
  return out.join(' ');
}

/** [a,b)가 든 문장의 범위 */
function sentBounds(line, a, b) {
  let s = 0, m; const reS = /[.!?]["”’)]*\s+/g;
  while ((m = reS.exec(line)) && m.index + m[0].length <= a) s = m.index + m[0].length;
  const mE = /[.!?]["”’)]*(?=\s|$)/.exec(line.slice(b));
  return [s, mE ? b + mE.index + mE[0].length : line.length];
}

/** 첫 병기에서 개념을 풀이했는지 — 풀이 꼴을 찾으면 그 이름, 없으면 ''.
 *  ponytail: 문장 꼴만 본다(같은 문장 + 다음 문장). 풀이가 두세 문장 뒤에 오거나 꼴이 다르면 놓친다 — 정확도가 필요하면 '설명 없음' 카드만 AI에 묻는 단계 추가. */
function defCue(sent, bRel, next, ko) {
  const after = sent.slice(bRel).replace(/^[*_"'”’》」』〉]+/, '');
  if (/^\s?(?:이다|입니다|이에요|예요)[.!?]?\s*$/.test(after)) return '「…이 ~이다」 꼴';
  if (/^\s?(?:이?라고도?|이?라)\s*(?:한다|합니다|해요|부른다|부릅니다|불러요|불린다|불립니다)/.test(after)) return '「~(이)라고 한다」 꼴';
  if (/^\s?(?:이?란|[은는])[\s,]/.test(after) && DEF_END.test(sent)) return '「~은/는(란) … 이다」 꼴';
  if (/(?:^|[\s,])(?:즉|다시 말해|쉽게 말해|말하자면),?\s/.test(after)) return '같은 문장의 풀이 표현(즉·다시 말해)';
  if (next) {
    if (/^(?:즉|다시 말해|쉽게 말해|말하자면)[\s,]/.test(next)) return '다음 문장의 풀이 표현(즉·다시 말해)';
    const subj = /^(?:이는|이것은)[\s,]/.test(next) || (ko && next.startsWith(ko) && /^(?:이?란|[은는])[\s,]/.test(next.slice(ko.length)));
    if (subj && DEF_END.test(next)) return '다음 문장에서 풀이';
  }
  return '';
}

/** pages: [{page, text, bodyPageNum}] → { terms, stats, fenceBroken }
 *  opts.glued: 위첨자를 구분 못 하는 형식(PDF·HWP)에서 괄호 없이 붙어 나온 영어(환각Hallucination)도 병기로 본다 */
function findParallel(pages, opts) {
  opts = opts || {};
  const terms = [], byKey = new Map(), path = [];
  let fence = false;
  for (const p of pages) {
    const lines = String(p.text || '').split('\n');
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li];
      if (!opts.noFence && /^\s*(```|~~~)/.test(raw)) { fence = !fence; continue; }
      if (fence || !raw.trim()) continue;
      const hm = raw.match(/^(#{1,6})\s+(.*)/) || raw.match(/^\[(파트|장|절|중|소|소소)\]\s*(.*)/);
      if (hm) { const d = hm[1][0] === '#' ? hm[1].length : HEAD_TAGS.indexOf(hm[1]) + 1; path.length = d; path[d - 1] = hm[2].replace(/<\/?su[pb]>/g, ' ').trim(); }
      const line = raw.replace(/`[^`]*`/g, m => ' '.repeat(m.length)).replace(/（/g, '(').replace(/）/g, ')'); // 인라인 코드는 위치만 남기고 가린다 · 전각 괄호는 반각으로
      const found = [];
      const add = (before, en, b, glued) => {
        const keys = en.split(',').map(norm).filter(k => /[a-z]{2}/.test(k));
        const known = keys.map(k => byKey.get(k)).find(Boolean) || found.find(f => f.keys.some(k => keys.includes(k))); // 앞 줄들 + 같은 줄에서 먼저 찾은 것
        const ko = koTerm(before, en, known && known.ko);
        if (!/[가-힣]/.test(ko) || (glued && known && ko !== known.ko)) return; // 이미 병기한 영어가 다른 낱말에 붙어 나오면(포함해LLM) 병기가 아니라 띄어쓰기가 사라진 것
        const a = before.lastIndexOf(ko.split(' ')[0]);
        found.push({ a: a < 0 ? before.length : a, b, ko, en, keys, glued });
      };
      let m;
      const reA = /(?:\(|<sup>)\s*([A-Za-z][A-Za-z0-9 .,\-\/&+'’]*?)\s*(?:\)|<\/sup>|(?:[:;]|,\s*(?=[^A-Za-z\s])| 등)[^()<>]{0,60}\))/g; // 한글(English) · 한글<sup>English</sup> · 한글(English, 풀이)
      while ((m = reA.exec(line))) {
        const en = m[1], before = line.slice(0, m.index);
        if (!/[A-Za-z]{2}/.test(en) || NOT_TERM.test(en) || !/[가-힣](?:\*\*|__)?\s?$/.test(before)) continue;
        add(before, en, m.index + m[0].length, false);
      }
      if (opts.glued) { // 한글English — 위첨자 원어가 괄호 없이 붙어 추출된 꼴
        const reG = /(?<=[가-힣])([A-Za-z][A-Za-z\-]+(?: [A-Z][A-Za-z\-]*)*(?:, [A-Z][A-Za-z\-]*(?: [A-Z][A-Za-z\-]*)*(?=[가-힣]))?)(?![A-Za-z(])/g; // 쉼표 뒤 원어·약어는 바로 조사가 붙을 때만(목표Goal, LLM, 도구Tool 같은 나열과 구분)
        while ((m = reG.exec(line))) {
          const before = line.slice(0, m.index);
          const last = before.split(/\s+/).pop();
          if (!STOP.test(last) && !/^(?:따라|경우)$/.test(last) && !(last.length > 2 && /[은는가을를의에볼된할한]$/.test(last))) add(before, m[1], m.index + m[0].length, true); // '다만LLM'은 병기가 아니라 띄어쓰기가 사라진 것
        }
      }
      const reB = /([A-Za-z][A-Za-z0-9.+#\-]*(?: [A-Za-z][A-Za-z0-9.+#\-]*){0,3})\(([가-힣][가-힣 ·]{1,24})\)/g; // English(한글)
      while ((m = reB.exec(line))) {
        if (!/[A-Za-z]{2}/.test(m[1]) || LANG.test(m[2].trim())) continue;
        found.push({ a: m.index, b: m.index + m[0].length, ko: m[2].trim(), en: m[1], keys: [norm(m[1])] });
      }
      found.sort((x, y) => x.a - y.a);
      for (const f of found) {
        const [s, e] = sentBounds(line, f.a, f.b);
        let next = line.slice(e).trim();
        if (!next) for (let k = li + 1; k < lines.length && !next; k++) next = lines[k].trim();
        if (next) next = next.slice(0, sentBounds(next, 0, 0)[1]);
        const occ = { page: p.page, bodyPage: p.bodyPageNum || null, path: path.filter(Boolean).slice(-2).join(' › '), ko: f.ko, en: f.en,
          sent: line.slice(s, e), a: f.a - s, b: f.b - s, inHeading: !!hm, glued: !!f.glued, cue: hm ? '' : defCue(line.slice(s, e), f.b - s, next, f.ko) };
        let t = f.keys.map(k => byKey.get(k)).find(Boolean);
        if (!t) { t = { ko: f.ko, en: f.en, occ: [] }; terms.push(t); }
        f.keys.forEach(k => byKey.set(k, t));
        t.occ.push(occ);
      }
    }
  }
  if (fence) return Object.assign(findParallel(pages, { ...opts, noFence: true }), { fenceBroken: true }); // 코드 블록이 닫히지 않은 원고: 뒤 본문을 통째로 버리지 않도록 코드 블록 구분 없이 다시 찾는다
  // 제목 속 병기는 첫 병기·중복으로 세지 않는다(제목에 한 번, 본문 첫 등장에 한 번은 흔한 편집 방침)
  for (const t of terms) {
    const body = t.occ.filter(o => !o.inHeading);
    t.first = body[0] || t.occ[0];
    t.dups = body.slice(1);
    t.heads = t.occ.filter(o => o.inHeading && o !== t.first);
    t.ko = t.first.ko; t.en = t.first.en;
    t.judged = !t.first.inHeading;
    t.defined = !!t.first.cue;
    t.dups.forEach(o => { o.variant = norm(o.ko) !== norm(t.ko); });
  }
  return { terms, stats: {
    terms: terms.length,
    dupTerms: terms.filter(t => t.dups.length).length,
    dups: terms.reduce((n, t) => n + t.dups.length, 0),
    undefinedFirst: terms.filter(t => t.judged && !t.defined).length } };
}

if (typeof document === 'undefined') { module.exports = { findParallel }; return; } // node 테스트

/* ── 화면 ───────────────────────────────────────────── */
const root = document.getElementById('panel28');
if (!root) return;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const S = { file: null, res: null, isPdf: false, note: '', filter: 'all', q: '' };

root.innerHTML = `
<div class="p28-wrap">
  <div class="p28-header">
    <h2>병기 중복 찾기</h2>
    <p>원고에서 <b>한글(English)</b>처럼 한글과 영어를 함께 적은 곳을 모두 찾아, 용어마다 <b>처음 병기한 곳</b>과 그 자리에서 <b>개념을 풀이했는지</b>, 그리고 <b>다시 병기한 곳</b>을 알려 줍니다. 원고는 이 컴퓨터 안에서만 읽고 AI에 보내지 않습니다.</p>
  </div>
  <div class="p28-card">
    <input type="file" id="p28_file" class="p28-sr" accept=".md,.txt,.docx,.hwp,.hwpx,.pdf,.doc" aria-label="원고 파일 고르기">
    <label class="p28-drop" id="p28_drop" for="p28_file">
      <span class="p28-drop-icon" aria-hidden="true">🔁</span>
      <span class="p28-drop-main">원고 파일을 끌어 놓거나 눌러서 고르세요</span>
      <span class="p28-drop-sub">MD · TXT · DOCX · HWP · HWPX · PDF</span>
    </label>
    <div class="p28-fileline" id="p28_fileline" hidden></div>
  </div>
  <div id="p28_out"></div>
</div>`;

const drop = $('p28_drop');
$('p28_file').addEventListener('change', e => { load(e.target.files[0]); e.target.value = ''; });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files[0]); });

async function load(file) {
  if (!file) return;
  if (typeof window.P8Extract !== 'function') { alert('원고 읽기 기능(교정 도우미)을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.'); return; }
  $('p28_out').innerHTML = '<p class="p28-empty">원고 읽는 중…</p>';
  let ex;
  try { ex = await window.P8Extract(file, { review: true }); } // review: 위첨자 원어를 <sup>로 남긴다
  catch (e) { S.res = null; $('p28_out').innerHTML = ''; $('p28_fileline').hidden = true; drop.hidden = false; alert('파일 읽기 오류:\n' + e.message); return; }
  const ext = file.name.split('.').pop().toLowerCase(), glued = /^(pdf|hwp|hwpx|doc)$/.test(ext);
  const res = findParallel(ex.pages, { glued });
  Object.assign(S, { file, res, isPdf: ext === 'pdf', filter: 'all', q: '',
    note: (glued ? `${ext.toUpperCase()}는 위첨자를 구분하지 못합니다. 괄호 없이 한글에 붙어 나온 영어(예: 환각Hallucination)를 위첨자 병기로 어림해 함께 찾았으니 '위첨자 추정' 표시가 있는 줄은 원고와 대조하세요. ` : '')
      + (res.fenceBroken ? '코드 블록 표시(```)가 닫히지 않아 코드 블록 구분 없이 찾았습니다 — 코드 속 괄호가 섞여 있을 수 있습니다.' : '') });
  drop.hidden = true;
  const fl = $('p28_fileline'); fl.hidden = false;
  fl.innerHTML = `<span class="p28-file-icon">📄</span><span class="p28-file-name"><b>${esc(file.name)}</b><small>${ex.pages.length}쪽${S.isPdf ? '' : '(약 1,500자를 한 쪽으로 어림)'}</small></span><label class="p28-btn" for="p28_file">다른 파일</label>`;
  render();
}

const pgNo = o => (S.isPdf ? '' : '약 ') + o.page;
function locHtml(o, tag) { // 꼬리표 · 쪽(어느 페이지) · 제목 경로(어느 부분)
  const segs = o.path ? o.path.split(' › ') : [];
  return `<div class="p28-loc"><span class="p28-tag">${tag}</span><b class="p28-page">${pgNo(o)}쪽</b>`
    + (o.glued ? '<span class="p28-guess" title="괄호 없이 한글에 붙어 나온 영어를 위첨자 병기로 어림했습니다. 원고와 대조하세요.">위첨자 추정</span>' : '')
    + (S.isPdf && o.bodyPage ? `<small class="p28-print">인쇄 쪽번호 ${esc(o.bodyPage)}</small>` : '')
    + (segs.length ? `<small class="p28-path" title="${esc(o.path)}">${segs.slice(0, -1).map(s => esc(s) + ' › ').join('')}<b>${esc(segs[segs.length - 1])}</b></small>` : '') + '</div>';
}
function snipHtml(o) {
  const clean = s => esc(s).replace(/&lt;(\/?)sup&gt;/g, '<$1sup>').replace(/\*\*|__/g, '');
  let pre = o.sent.slice(0, o.a), post = o.sent.slice(o.b);
  if (o.inHeading) pre = pre.replace(/^#{1,6}\s+/, ''); // 제목 줄의 # 표시는 보여 주지 않는다
  if (pre.length > 90) pre = '…' + pre.slice(-80);
  if (post.length > 110) post = post.slice(0, 100) + '…';
  return `<p class="p28-snip">${clean(pre)}<mark>${clean(o.sent.slice(o.a, o.b))}</mark>${clean(post)}</p>`;
}
function rowHtml(o, kind, tag, extra) { // kind: first · dup · head (카드의 has-dup과 이름이 겹치지 않게 p28-row와 함께 쓴다)
  return `<li class="p28-row ${kind}">${locHtml(o, tag)}<div class="p28-body">${snipHtml(o)}${extra || ''}</div></li>`;
}
function termHtml(t) {
  const def = !t.judged ? '<p class="p28-def na">제목에만 있는 병기라 개념 설명은 판단하지 않았습니다.</p>'
    : t.defined ? `<p class="p28-def ok"><i aria-hidden="true">✓</i>개념 설명 있음(추정) — ${esc(t.first.cue)}</p>`
    : '<p class="p28-def no"><i aria-hidden="true">✕</i>개념 설명 없음(추정) — 같은 문장·다음 문장에서 풀이하는 꼴을 찾지 못했습니다.</p>';
  const pages = [...new Set(t.dups.map(o => o.page))]; // 닫힌 카드에서도 '어디'가 보이도록 중복이 있는 쪽을 적는다
  const dupBadge = t.dups.length ? `<em class="red">중복 ${t.dups.length}곳<span> · ${S.isPdf ? '' : '약 '}${pages.slice(0, 6).join('·')}${pages.length > 6 ? '…' : ''}쪽</span></em>` : '<em>중복 없음</em>';
  const defBadge = !t.judged ? '<em>제목에만 있음</em>' : t.defined ? '<em>✓ 설명 있음</em>' : '<em class="yellow">✕ 설명 없음</em>';
  let n = 0; // 나온 순서대로: 첫 병기 → 중복 1 → 중복 2 (제목 속 병기도 제자리에)
  const rows = t.occ.map(o => o === t.first ? rowHtml(o, 'first', '첫 병기', def)
    : o.inHeading ? rowHtml(o, 'head', '제목')
    : rowHtml(o, 'dup', `중복 ${++n}`, o.variant ? `<p class="p28-alert"><i aria-hidden="true">⚠</i>첫 병기와 한글 표기가 다릅니다 <b>${esc(t.ko)}</b> ↔ <b>${esc(o.ko)}</b></p>` : ''));
  return `<details class="p28-term${t.dups.length ? ' has-dup' : ''}"${t.dups.length || (S.filter === 'undef' && t.judged && !t.defined) ? ' open' : ''}>
    <summary><span class="p28-name"><span class="p28-ko">${esc(t.ko)}</span><span class="p28-en">${esc(t.en)}</span></span>
      <span class="p28-badges"><span class="p28-where">첫 병기 ${pgNo(t.first)}쪽</span>${defBadge}${dupBadge}</span></summary>
    <ol class="p28-occ">${rows.join('')}</ol></details>`;
}

function filtered() {
  const q = S.q.trim().toLowerCase();
  return S.res.terms.filter(t => (S.filter === 'dup' ? t.dups.length : S.filter === 'undef' ? t.judged && !t.defined : true)
    && (!q || t.ko.toLowerCase().includes(q) || t.en.toLowerCase().includes(q)));
}

function render() {
  const out = $('p28_out'), r = S.res;
  if (!r) { out.innerHTML = ''; return; }
  if (!r.terms.length) { out.innerHTML = `<p class="p28-empty">한글·영어 병기를 찾지 못했습니다.${S.note ? '<br>' + esc(S.note) : ''}</p>`; return; }
  const list = filtered();
  const chip = (k, label, n) => `<button class="p28-chip${S.filter === k ? ' on' : ''}" aria-pressed="${S.filter === k}" onclick="p28_filter('${k}')">${label} <b>${n}</b></button>`;
  out.innerHTML = `
    <div class="p28-tiles">
      <div class="p28-tile lead ${r.stats.dups ? 'red' : 'green'}"><b>${r.stats.dups}</b><span><strong>${r.stats.dups ? '중복 병기 · 지울 후보' : '중복 병기 없음'}</strong>${r.stats.dups ? `용어 ${r.stats.dupTerms}개에서 다시 병기했습니다` : '같은 용어를 다시 병기한 곳이 없습니다'}</span></div>
      <div class="p28-tile"><b>${r.stats.terms}</b><span>병기한 용어</span></div>
      <div class="p28-tile${r.stats.undefinedFirst ? ' yellow' : ''}"><b>${r.stats.undefinedFirst}</b><span>첫 병기에 설명 없음(추정)</span></div>
    </div>
    ${S.note ? `<p class="p28-warn"><i aria-hidden="true">⚠</i>${esc(S.note)}</p>` : ''}
    <div class="p28-toolbar">
      ${chip('all', '전체', r.stats.terms)}${chip('dup', '중복 있음', r.stats.dupTerms)}${chip('undef', '첫 병기 설명 없음', r.stats.undefinedFirst)}
      <input type="search" id="p28_q" placeholder="용어 찾기" aria-label="용어 찾기" value="${esc(S.q)}" oninput="p28_search(this.value)">
    </div>
    <p class="p28-note">개념 설명 여부는 문장 꼴(「~란 …이다」·「~라고 한다」·즉·다시 말해)로 어림한 값입니다. 제목 속 병기는 중복으로 세지 않습니다.</p>
    <div id="p28_list">${list.map(termHtml).join('') || '<p class="p28-empty">조건에 맞는 용어가 없습니다.</p>'}</div>`;
}

window.p28_filter = k => { S.filter = k; render(); };
window.p28_search = v => { // 입력 칸을 다시 그리면 커서를 잃으므로 목록만 바꾼다
  S.q = v; const list = filtered();
  $('p28_list').innerHTML = list.map(termHtml).join('') || '<p class="p28-empty">조건에 맞는 용어가 없습니다.</p>';
};
})();
