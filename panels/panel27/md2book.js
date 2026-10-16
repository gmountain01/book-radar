/* md2book.js — Markdown 원고 → 책 템플릿 HTML (브라우저·node 공용, 의존성 없음)
   제목 단계를 정하는 순서: ① 줄 머리 태그 [파트] [장] [절] [중] [소] [소소]  ② 제목 문구(첫째 마당, PART 2, 3장, 1-2, STEP 1)  ③ # 개수(상대 깊이)
   원고의 HTML은 그대로 통과시키지 않는다(<br> <sup> <sub> <small> <u> <mark>만 허용). */
(function (root) {
  "use strict";
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pad = n => String(n).padStart(2, "0");
  const ORD = ["첫", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];

  /* 줄 머리 태그 → 종류. 화면 버튼 이름([확인], [정보] …)과 겹치는 낱말은 일부러 뺐다 */
  const TAGS = {};
  const def = (kind, names) => names.split(" ").forEach(n => TAGS[n] = kind);
  def("lv0", "파트 마당 PART"); def("lv1", "장 CHAPTER"); def("lv2", "절"); def("lv3", "중 중제목"); def("lv4", "소 소제목"); def("lv5", "소소 소소제목");
  def("trouble", "증상"); def("apply", "바꿔쓰기 응용");
  def("tip", "TIP 팁 이지스팁 NOTE 참고"); def("warn", "주의 경고 WARNING CAUTION IMPORTANT");
  def("request", "요청 프롬프트 요청프롬프트 PROMPT"); def("voice", "한마디 선생님한마디"); def("check", "체크 CHECK 체크리스트");
  def("box", "박스 상자 BOX"); def("corner", "코너 칼럼"); def("cornerEnd", "/코너 /칼럼");
  def("cap", "캡션"); def("meta", "장정보"); def("sub", "부제"); def("body", "본문"); def("newpage", "새쪽 쪽나눔");
  const tagOf = s => {
    const m = /^\s*\[(!?[^\[\]\n]{1,14})\]\s*(.*)$/.exec(s || "");
    if (!m) return null;
    const name = m[1].replace(/^!/, "").trim(), kind = TAGS[name.replace(/\s+/g, "").toUpperCase()];
    return kind ? { kind, name, rest: m[2] } : null;
  };

  /* 제목 문구로 단계를 알아보는 규칙 (태그도 # 도 없을 때, 또는 # 깊이의 기준점을 잡을 때) */
  const RX = [
    new RegExp(`^(?:(?:${ORD.join("|")})째\\s*마당|(?:PART|파트)\\s*\\d+|제\\s*\\d+\\s*(?:부|편))(?=$|[\\s.:·\\-–—])`, "i"),
    /^(?:(?:CHAPTER|챕터)\s*\d+|제?\s*\d+\s*장)(?=$|[\s.:·\-–—])/i,
    /^(?:\d+\s*[-.]\s*\d+(?![-.\d])(?=\s)|제?\s*\d+\s*절(?=$|[\s.:]))/,
  ];
  const STEP = /^(?:STEP|스텝)\s*0*(\d+)\s*[.:·\-–—]?\s*(.*)$/i;
  const SEP = "\\s*[.:·\\-–—]?\\s*";

  /* 제목에서 번호와 이름을 떼어 낸다 */
  function parseHead(lv, text) {
    const t = text.trim(); let m;
    if (lv === 0) {
      if ((m = new RegExp(`^(${ORD.join("|")})째\\s*마당${SEP}(.*)$`).exec(t))) return { kind: "마당", no: pad(ORD.indexOf(m[1]) + 1), label: m[1] + "째 마당", title: m[2] || t };
      if ((m = new RegExp(`^(?:PART|파트)\\s*0*(\\d+)${SEP}(.*)$`, "i").exec(t)) || (m = /^제?\s*0*(\d+)\s*(?:부|편|마당)(?=$|[\s.:])\s*[.:]?\s*(.*)$/.exec(t)) || (m = /^0*(\d{1,2})[.)]?\s+(.*)$/.exec(t)))
        return { kind: "PART", no: pad(m[1]), label: "PART " + pad(m[1]), title: m[2] || t };
      return { kind: "PART", no: "", label: "", title: t };
    }
    if (lv === 1) {
      if ((m = new RegExp(`^(?:CHAPTER|챕터)\\s*0*(\\d+)${SEP}(.*)$`, "i").exec(t)) || (m = /^제?\s*0*(\d+)\s*장(?=$|[\s.:·\-–—])\s*[.:·\-–—]?\s*(.*)$/.exec(t)) || (m = /^0*(\d{1,3})[.)]?\s+(.*)$/.exec(t)))
        return { no: m[1], title: m[2] || t };
      return { no: "", title: t };
    }
    if (lv === 2) {
      if ((m = /^(\d+\s*[-.]\s*\d+)(?![-.\d])\s*(.*)$/.exec(t))) return { no: m[1].replace(/\s+/g, ""), title: m[2] || t };
      if ((m = /^제?\s*(\d+)\s*절(?=$|[\s.:])\s*[.:]?\s*(.*)$/.exec(t))) return { no: m[1], title: m[2] || t };
    }
    return { no: "", title: t };
  }

  /* 글줄 안 서식: 굵게·기울임·코드·링크·그림. 원고의 HTML은 모두 글자로 바꾼 뒤 허용 태그만 되살린다 */
  function inline(src) {
    const keep = [];
    const stash = h => { keep.push(h); return "" + (keep.length - 1) + ""; };
    let s = String(src).replace(/\\([\\`*_{}\[\]()#+\-.!|~>^=])/g, (m, c) => stash(esc(c)));
    s = s.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (m, t, c) => stash("<code>" + esc(c.trim()) + "</code>"));
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;.*?&quot;)?\s*\)(?:\{[^}]*\})?/g, (m, alt, url) => stash(`<img src="${url}" alt="${alt}">`));
    s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;.*?&quot;)?\s*\)/g, (m, t, url) => /^(https?:|mailto:|#)/i.test(url) ? stash(`<a href="${url}">`) + t + stash("</a>") : t);
    s = s.replace(/&lt;(\/?)(sup|sub|small|u|mark)&gt;/gi, (m, c, t) => `<${c}${t.toLowerCase()}>`).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, "<strong>$2</strong>");
    s = s.replace(/(^|[^\w*])([*_])(?=\S)([^*_]+?)(?<=\S)\2(?![\w*])/g, "$1<em>$3</em>");
    s = s.replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, "<del>$1</del>");
    s = s.replace(/ {2,}\n|\\\n/g, "<br>").replace(/\n/g, " ");
    while (//.test(s)) s = s.replace(/(\d+)/g, (m, i) => keep[i]);
    return s;
  }
  /* 제목처럼 서식 없이 쓰는 자리: 마크다운 표시를 걷어 낸 글자만 */
  const plain = s => inline(s).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

  const R = {
    fence: /^ {0,3}(`{3,}|~{3,})\s*(.*)$/, atx: /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/, hr: /^ {0,3}([-*_])(?: *\1){2,} *$/,
    li: /^( *)([-*+]|\d{1,3}[.)])\s+(.*)$/, quote: /^ {0,3}>\s?(.*)$/, sep: /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/,
    img: /^\s*(?:!\[[^\]]*\]\([^)]*\)(?:\{[^}]*\})?\s*)+$/, setext: /^ {0,3}(=+|-+)\s*$/, comment: /^\s*<!--(.*?)-->\s*$/,
  };
  const HEADKIND = /^(lv\d|trouble|apply)$/;

  /* 책 전체 차례: '차례'·'목차'·'CONTENTS' 한 줄 뒤의 장·절 목록. 원고의 쪽 번호(…… 23)는 버리고 조판 결과로 다시 단다 */
  const TOCW = /^\s*(?:#{1,6}\s+)?(?:[-*+]\s+)?(?:\*\*|__)?\s*(목\s*차|차\s*례|(?:table\s+of\s+)?contents)\s*(?:\*\*|__)?\s*#*\s*$/i;
  const TOCPG = /(?:\s*(?:[.·…‥・ㆍ_\-–—]\s*){2,}|\s{2,}|\s+[-–—]\s*|\s+p\.\s*)(?:\d{1,4}|[ivxlc]{1,6})\s*$|\s*[.·…‥・ㆍ]{3,}\s*$/i;
  const TAILNO = /\s+\d{1,4}$/;  // 공백 한 칸 뒤 쪽 번호: 차례 항목 절반 이상에 있고 떼어야 본문 제목과 더 맞을 때만('GPT 4'·'장제목 1' 보호)
  const nt = s => plain(s).replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();       // 맞대 볼 제목 글자
  const nn = s => String(s || "").toLowerCase().replace(/\d+/g, d => +d).replace(/[^0-9a-z가-힣]+/g, "-");  // 1.1 = 1-1, 01 = 1

  /* 1단계: 줄 → 블록 */
  function tokenize(md) {
    const L = String(md).replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
    const out = [], fm = {};
    let i = 0;
    if (L[0] === "---") {
      const e = L.indexOf("---", 1);
      if (e > 0) { for (const s of L.slice(1, e)) { const m = /^([\w가-힣]+)\s*:\s*(.*)$/.exec(s); if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, ""); } i = e + 1; }
    }
    const blank = s => s === undefined || !s.trim();
    const tableAt = k => L[k].includes("|") && L[k + 1] !== undefined && L[k + 1].includes("|") && L[k + 1].includes("-") && R.sep.test(L[k + 1]);
    const starts = k => { const s = L[k]; return blank(s) || (TOCW.test(s) && !!tocAt(k)) || R.fence.test(s) || R.atx.test(s) || R.hr.test(s) || R.li.test(s) || R.quote.test(s) || !!tagOf(s) || tableAt(k) || R.img.test(s) || R.comment.test(s); };
    const head = (depth, text) => { const g = tagOf(text); return g && HEADKIND.test(g.kind) ? { t: "h", depth, kind: g.kind, text: g.rest } : { t: "h", depth, text }; };
    const para = (first, body) => {
      const buf = [first];
      while (i < L.length) {
        if (R.setext.test(L[i]) && !body) { out.push(head(L[i].trim()[0] === "=" ? 1 : 2, buf.join(" "))); i++; return; }
        if (starts(i)) break;
        buf.push(L[i++]);
      }
      out.push({ t: "p", lines: buf, body });
    };
    const boxOf = (g, lines) => ({ t: "box", kind: g.kind, name: g.name, first: g.rest, lines });
    /* 차례 줄 뒤의 항목을 모은다. 끝: 첫 항목이나 이미 모은 장·절 항목이 다시 나옴(본문 시작) · 태그 줄·[새쪽] · 문장 같은 줄 · (항목이 # 아닌데) # 제목 · 코드·표·그림 등.
       차례로 인정: 항목 2개 이상이 구조 문구(마당·장·절)이거나 뒤 본문의 제목 줄과 같아야 한다(본문 속 '### 목차' 소제목+목록은 그대로 본문) */
    const tocAt = k => {
      const w = TOCW.exec(L[k])[1], ents = [], seen = new Set(); let first = null, end = k + 1;
      for (let j = k + 1; j < L.length && ents.length < 500; j++) {
        const s = L[j];
        if (blank(s) || /^\s*\d{1,4}\s*$/.test(s)) continue;
        if (R.fence.test(s) || R.hr.test(s) || R.quote.test(s) || R.img.test(s) || R.comment.test(s) || tagOf(s) || tableAt(j) || /^\s*\\newpage\s*$/.test(s)) break;
        const a = R.atx.exec(s);
        if (a && first && !first.atx) break;
        const m = /^( *)(?:([-*+•·▪◦])\s+|(\d{1,3}[.)])\s+)?(.*)$/.exec(a ? a[2] : s);
        const t0 = plain(m[4]).trim(); let t = t0.replace(TOCPG, "").trim(); const pg = t !== t0;
        if (!t) continue;
        if (m[3] && !RX.some(r => r.test(t))) t = m[3] + " " + t;
        const key = nt(t), pat = RX.findIndex(r => r.test(t));
        if (first && (key === first.key || (pat >= 0 && seen.has(key)))) break;
        if (pat < 0 && !pg && (t.length > 60 || /[.。]$/.test(t) || (/[!?]$/.test(t) && t.length > 40))) break;
        const e = { ind: a ? (a[1].length - 1) * 2 : m[1].length, t, pat, key, pg, atx: !!a };
        if (!first) first = e;
        seen.add(key); if (!pg) seen.add(nt(t.replace(TAILNO, "")));
        ents.push(e); end = j + 1;
      }
      if (ents.length < 2) return null;
      const body = new Set([...L.slice(0, k), ...L.slice(end)].map(s => { const g = tagOf(s), a = R.atx.exec(s); return nt(g ? g.rest : a ? a[2] : s); }));  // 차례 밖 줄(제목 후보)
      const tail = ents.filter(e => !e.pg && TAILNO.test(e.t)), bare = e => nt(e.t.replace(TAILNO, ""));
      if (tail.length * 2 >= ents.length && tail.filter(e => body.has(bare(e))).length > tail.filter(e => body.has(e.key)).length)  // 떼어야 본문 제목과 더 맞을 때만
        for (const e of tail) { e.t = e.t.replace(TAILNO, ""); e.key = nt(e.t); e.pat = RX.findIndex(r => r.test(e.t)); }
      if (ents.filter(e => e.pat >= 0 || body.has(e.key)).length < 2) return null;
      return { t: "toc", word: /[가-힣]/.test(w) ? w.replace(/\s+/g, "") : w.replace(/\s+/g, " "), ents, end };
    };

    while (i < L.length) {
      const s = L[i]; let m, g;
      if (blank(s)) { i++; continue; }
      if ((m = R.comment.exec(s))) { if (/pagebreak|새쪽|쪽나눔/i.test(m[1])) out.push({ t: "newpage" }); i++; continue; }
      if (TOCW.test(s) && (g = tocAt(i))) { out.push(g); i = g.end; continue; }
      if ((m = R.fence.exec(s))) {
        const close = new RegExp("^ {0,3}" + m[1][0] + "{" + m[1].length + ",}\\s*$"), buf = [];
        for (i++; i < L.length && !close.test(L[i]); i++) buf.push(L[i]);
        i++; out.push({ t: "code", info: m[2].trim(), text: buf.join("\n") }); continue;
      }
      if ((m = R.atx.exec(s))) { out.push(head(m[1].length, m[2])); i++; continue; }
      if (R.hr.test(s)) { i++; continue; }
      if (/^\s*\\newpage\s*$/.test(s)) { out.push({ t: "newpage" }); i++; continue; }
      if (tableAt(i)) {
        const rows = [L[i]], align = L[i + 1];
        for (i += 2; i < L.length && !blank(L[i]) && L[i].includes("|"); i++) rows.push(L[i]);
        out.push({ t: "table", rows, align }); continue;
      }
      if (R.quote.test(s)) {
        const buf = [];
        while (i < L.length && (m = R.quote.exec(L[i]))) { buf.push(m[1]); i++; }
        g = tagOf(buf[0]);
        out.push(g && !HEADKIND.test(g.kind) && !/^(newpage|corner|cornerEnd|cap|meta|sub|body)$/.test(g.kind) ? boxOf(g, buf.slice(1).filter(x => x.trim())) : { t: "quote", lines: buf });
        continue;
      }
      if ((g = tagOf(s))) {
        i++;
        if (HEADKIND.test(g.kind)) { out.push({ t: "h", depth: 0, kind: g.kind, text: g.rest }); continue; }
        if (g.kind === "newpage" || g.kind === "cornerEnd") { out.push({ t: g.kind }); continue; }
        if (/^(corner|cap|meta|sub)$/.test(g.kind)) { out.push({ t: g.kind, text: g.rest, name: g.name }); continue; }
        if (g.kind === "body") { para(g.rest, true); continue; }
        const buf = [];
        while (i < L.length && !blank(L[i]) && !tagOf(L[i]) && !R.atx.test(L[i]) && !R.fence.test(L[i])) buf.push(L[i++]);
        out.push(boxOf(g, buf)); continue;
      }
      if (R.li.test(s)) {
        const buf = [];
        while (i < L.length) {
          if (blank(L[i])) { const n = L[i + 1]; if (n !== undefined && (R.li.test(n) || /^ {2,}\S/.test(n))) { i++; continue; } break; }
          if (!R.li.test(L[i]) && (R.atx.test(L[i]) || R.fence.test(L[i]) || tagOf(L[i]) || tableAt(i))) break;
          buf.push(L[i++]);
        }
        out.push({ t: "list", lines: buf }); continue;
      }
      if (R.img.test(s)) { out.push({ t: "fig", src: s }); i++; continue; }
      i++; para(s, false);
    }
    return { toks: out, fm };
  }

  /* 2단계: 제목마다 단계(0 파트 · 1 장 · 2 절 · 3 중 · 4 소 · 5 소소)를 정한다 */
  function resolve(toks) {
    let hs = toks.filter(b => b.t === "h");
    if (!hs.length) {  // 태그도 # 도 없는 글(txt): 한 줄짜리 짧은 문단 가운데 제목 문구로 시작하는 것만 제목으로 본다
      for (const b of toks) {
        if (b.t !== "p" || b.body || b.lines.length !== 1) continue;
        const t = b.lines[0].trim();
        if (t.length > 80 || /[.?!。,;]$/.test(t)) continue;
        if (RX.some(r => r.test(t)) || STEP.test(t)) { b.t = "h"; b.depth = 0; b.text = t; }
      }
      hs = toks.filter(b => b.t === "h");
    }
    for (const h of hs) {
      const t = h.text.trim();
      if (h.kind) { if (h.kind.startsWith("lv")) h.lv = +h.kind[2]; else { h.lv = 3; h.cls = h.kind; } h.fixed = true; }
      else if (STEP.test(t)) { h.lv = 3; h.cls = "step"; }
      else { const k = RX.findIndex(r => r.test(t)); if (k >= 0) { h.lv = k; h.fixed = true; } }
    }
    // # 깊이만 있는 제목: 같은 깊이에서 이미 단계가 정해진 제목을 기준점으로 삼고, 없으면 가장 얕은 깊이를 장으로 본다
    const depths = [...new Set(hs.filter(h => h.depth).map(h => h.depth))].sort((a, b) => a - b), rank = d => depths.indexOf(d);
    const anchors = depths.map(d => {
      const votes = {}; let best = null;
      for (const h of hs) if (h.depth === d && h.fixed) { votes[h.lv] = (votes[h.lv] || 0) + 1; if (best === null || votes[h.lv] > votes[best]) best = h.lv; }
      return best;
    });
    for (const h of hs) {
      if (h.lv !== undefined) continue;
      let a = -1;
      for (let r = rank(h.depth); r >= 0; r--) if (anchors[r] !== null && anchors[r] !== undefined) { a = r; break; }
      if (a < 0) a = anchors.findIndex(x => x !== null && x !== undefined);
      h.lv = Math.max(0, Math.min(5, a < 0 ? 1 + rank(h.depth) : anchors[a] + rank(h.depth) - a));
    }
  }

  /* 목록 줄 → 들여쓰기 트리 */
  function listTree(lines) {
    const tree = [], stack = []; let cur = null;
    for (const s of lines) {
      const m = R.li.exec(s);
      if (!m) { if (cur) R.img.test(s) ? cur.figs.push(s) : cur.text += "\n" + s.trim(); continue; }
      cur = { ind: m[1].length, ord: /\d/.test(m[2]), n: parseInt(m[2]), text: m[3], kids: [], figs: [] };
      while (stack.length && stack[stack.length - 1].ind >= cur.ind) stack.pop();
      (stack.length ? stack[stack.length - 1].kids : tree).push(cur);
      stack.push(cur);
    }
    return tree;
  }
  const ulHtml = (items, attr = "") => `<ul${attr}>${items.map(it => `<li>${inline((it.ord ? it.n + ". " : "") + it.text)}${it.kids.length ? ulHtml(it.kids) : ""}</li>`).join("")}</ul>`;
  const cells = s => { let t = s.trim(); if (t.startsWith("|")) t = t.slice(1); if (/(^|[^\\])\|$/.test(t)) t = t.slice(0, -1); return t.split(/(?<!\\)\|/).map(c => c.trim()); };
  /* 상자 안 본문: '- '로 시작하는 줄은 목록, 나머지는 줄마다 한 문단 */
  function boxBody(lines) {
    let h = "", li = [];
    const flush = () => { if (li.length) { h += `<ul>${li.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`; li = []; } };
    for (const s of lines) { const m = /^\s*[-*+]\s+(.*)$/.exec(s); if (m) li.push(m[1]); else if (s.trim()) { flush(); h += `<p>${inline(s.trim())}</p>`; } }
    flush(); return h;
  }
  const figsOf = s => [...s.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)(?:\{([^}]*)\})?/g)].map(m => {
    const w = /width\s*=\s*([\d.]+)\s*(mm|%|px)?/.exec(m[3] || "");
    return { alt: m[1], src: m[2], width: w ? w[1] + (w[2] || "mm") : "" };
  });
  const metaHtml = meta => !meta.length ? "" : `<dl class="meta"${meta.length !== 5 ? ` style="grid-template-columns:repeat(${meta.length},1fr)"` : ""}>` + meta.map(([k, v]) =>
    `<div class="m"><dt>${esc(k)}</dt><dd>${/^[★☆]+$/.test(v) ? `<span class="stars">${[...v].map(c => `<i${c === "★" ? ' class="on"' : ""}>★</i>`).join("")}</span>` : inline(v)}</dd></div>`).join("") + "</dl>";

  /* 3단계: 블록 → 템플릿 HTML */
  function mdToBook(md, opts = {}) {
    const { toks, fm } = tokenize(md);
    resolve(toks);
    const out = [], outline = [], stats = { 파트: 0, 장: 0, 절: 0, 중: 0, 소: 0, 소소: 0, 팁: 0, 주의: 0, 박스: 0, 코너: 0, 그림: 0, 표: 0, 코드: 0 };
    let part = null, partLabel = "", ch = null, lead = false, corner = false, np = false;
    const push = h => out.push(h);
    const cls = (...c) => { const a = c.filter(Boolean); if (corner) a.push("in-corner"); if (np) { a.push("newpage"); np = false; } return a.length ? ` class="${a.join(" ")}"` : ""; };
    const heads = [], hasToc = toks.some(b => b.t === "toc");  // 차례 항목의 쪽 번호를 찾아 줄 본문 제목들
    const mark = (lv, no, title) => { outline.push({ lv, no, title }); heads.push({ lv, no, title, sel: `[data-oi="${outline.length - 1}"]` }); return ` data-oi="${outline.length - 1}"`; };
    const tk = (lv, title) => { if (!hasToc) return ""; heads.push({ lv, no: "", title: plain(title), sel: `[data-tk="${heads.length}"]` }); return ` data-tk="${heads.length - 1}"`; };  // 중·소·소소(차례가 있을 때만 표시)
    const tocHtml = b => {  // 단계: 문구(마당·장·절) > 목록 들여쓰기 > 본문에서 찾은 제목의 단계 > 장. 들여 쓴 항목은 부모보다 한 단계 아래, 앞 장과 번호가 같은 '4장 요약'은 절
      const stack = []; let prevCh = null, ptr = 0;
      const find = e => {  // 같은 제목(번호가 둘 다 있으면 번호도 같아야), 또는 번호까지 붙은 제목 전체. 앞에서 찾은 곳 다음부터 먼저 본다
        const raw = nt(e.t), t = nt(e.info.title);
        const ok = h => { const x = nt(h.title); return x === raw || (x === t && !(e.no && h.no && nn(e.no) !== nn(h.no))); };
        let k = heads.findIndex((h, i) => i >= ptr && ok(h)); if (k < 0) k = heads.findIndex(ok);
        if (k >= 0) ptr = k + 1;
        return heads[k];
      };
      const set = (e, lv) => { e.lv = lv; e.info = lv <= 2 ? parseHead(lv, e.t) : { no: "", title: e.t }; e.no = lv === 0 ? e.info.label : e.info.no; };
      for (const e of b.ents) {
        while (stack.length && stack[stack.length - 1].ind >= e.ind) stack.pop();
        const par = stack[stack.length - 1];
        let lv = e.pat >= 0 ? e.pat : par ? par.lv + 1 : 1;
        if (par && lv <= par.lv) lv = par.lv + 1;
        set(e, Math.min(3, lv));
        if (e.lv === 1 && e.info.no && nn(e.info.no) === prevCh) set(e, 2), e.info = { no: "", title: e.t }, e.no = "";
        e.h = find(e);
        if (e.pat < 0 && !par && e.h && e.h.lv !== e.lv) set(e, Math.min(3, e.h.lv));  // 번호 없는 줄은 본문 제목의 단계를 따른다
        if (e.lv === 1) prevCh = nn(e.info.no);
        stack.push({ ind: e.ind, lv: e.lv });
      }
      const rows = b.ents.map((e, i) => {
        const keep = e.lv <= 1 && b.ents[i + 1] && b.ents[i + 1].lv > e.lv;  // 마당·장 줄은 딸린 첫 줄과 같은 쪽에
        return `<div class="btoc-row l${e.lv}${keep ? " keep" : ""}"${e.h ? ` data-ref="${esc(e.h.sel)}"` : ""}><span class="btoc-no">${esc(e.no)}</span><span class="btoc-t">${esc(e.info.title)}</span><span class="btoc-ld"></span><span class="btoc-pg"></span></div>`;
      });
      return `<div class="btoc-title">${/[가-힣]/.test(b.word) ? '<span class="btoc-lbl">CONTENTS</span>' : ""}<b>${esc(b.word)}</b></div>\n` + rows.join("\n");
    };
    const closeCorner = () => { if (!corner) return; corner = false; const k = out.length - 1; if (typeof out[k] === "string") out[k] = out[k].replace("in-corner", "in-corner corner-end"); };
    const flushPart = () => {
      if (!part) return;
      const p = part; part = null;
      push(`<div class="part-src"${p.oi} data-kind="${p.kind}" data-no="${esc(p.no)}" data-label="${esc(p.label)}" data-title="${esc(plain(p.title))}" data-sub="${esc(plain(p.sub))}">${p.desc.map(d => `<p>${inline(d)}</p>`).join("")}</div>`);
    };
    const startCh = h => {
      closeCorner(); flushPart();
      const c = ch = { no: h.no, title: h.title, meta: [] }, label = [partLabel, "CHAPTER"].filter(Boolean).join(" · ");
      stats.장++; lead = true;
      const oi = mark(1, c.no, plain(c.title));
      push({ toString: () => `<div class="ch-head"${oi} data-ch="${esc(c.no)}" data-title="${esc(plain(c.title))}"><div class="ch-no">${esc(c.no)}</div><div class="ch-text"><div class="ch-label">${esc(label)}</div><div class="ch-big">${esc(c.no)}</div><h1>${inline(c.title)}</h1></div>${metaHtml(c.meta)}</div>` });
    };
    const needCh = () => { flushPart(); if (!ch) startCh({ no: "", title: fm.title || opts.title || "" }); };

    for (let ti = 0; ti < toks.length; ti++) {
      const b = toks[ti];
      if (b.t === "h") {
        if (!b.text.trim()) continue;
        const info = parseHead(b.lv, b.text);
        if (b.lv === 0) { closeCorner(); flushPart(); ch = null; lead = false; stats.파트++; partLabel = info.label; part = { ...info, sub: "", desc: [], oi: mark(0, info.label, plain(info.title)) }; continue; }
        if (b.lv === 1) { startCh(info); continue; }
        needCh(); closeCorner(); lead = false;
        if (b.lv === 2) { stats.절++; push(`<h2${cls()}${mark(2, info.no, plain(info.title))}${info.no ? ` data-n="${esc(info.no)}"` : ""}>${esc(plain(info.title))}</h2>`); }
        else if (b.lv === 3) {
          stats.중++;
          const m = b.cls === "step" && STEP.exec(b.text.trim());
          push(m ? `<h3${cls("step")}${tk(3, m[2])}><span class="step-meta"><span class="step-no"><small>STEP</small> <b>${m[1]}</b></span></span><span class="step-title">${esc(plain(m[2]))}</span></h3>` : `<h3${cls(b.cls)}${tk(3, b.text)}>${esc(plain(b.text))}</h3>`);
        } else if (b.lv === 4) { stats.소++; push(`<h4${cls()}${tk(4, b.text)}>${esc(plain(b.text))}</h4>`); }
        else { stats.소소++; push(`<h5${cls()}${tk(5, b.text)}>${esc(plain(b.text))}</h5>`); }
        continue;
      }
      if (b.t === "toc") { closeCorner(); flushPart(); lead = false; push({ toString: () => tocHtml(b) }); continue; }  // 차례: 장·통계·outline에 넣지 않는다
      if (b.t === "sub") { if (part) part.sub = b.text; continue; }
      if (b.t === "newpage") { np = true; continue; }
      if (b.t === "cornerEnd") { closeCorner(); continue; }
      if (part) {  // 파트 도비라 영역: 소개글만 받고, 장 목록 줄은 실제 장에서 다시 만들므로 버린다
        if (b.t === "p") { const t = b.lines.join("\n"); if (!RX[1].test(t.trim())) part.desc.push(t); continue; }
        if (b.t === "list") continue;
      }
      needCh();
      if (b.t === "meta") { for (const kv of b.text.split("|")) { const m = /^\s*([^:：]+)[:：]\s*(.*)$/.exec(kv); if (m) ch.meta.push([m[1].trim(), m[2].trim()]); } continue; }
      if (b.t === "p") {
        const t = b.lines.join("\n");
        if (lead && !b.body && b.lines.length === 1 && RX[2].test(t.trim())) {  // 장 도입부의 절 목록
          const last = out[out.length - 1];
          if (last && last.toc) last.toc.push(t.trim()); else { const toc = [t.trim()]; push({ toc, toString: () => `<ul class="toc">${toc.map(x => `<li>${inline(x)}</li>`).join("")}</ul>` }); }
          continue;
        }
        push(`<p${cls(lead && "lead")}>${inline(t)}</p>`); continue;
      }
      if (b.t === "fig") {
        for (const f of figsOf(b.src)) { stats.그림++; push(`<figure${cls(/\.svg$/i.test(f.src) && "dia")}><img src="${esc(f.src)}" alt="${esc(f.alt)}"${f.width ? ` style="width:${f.width}"` : ""}></figure>`); }
        continue;
      }
      if (b.t === "cap") {
        if (!b.text.trim()) continue;
        const k = out.length - 1;
        if (typeof out[k] === "string" && out[k].startsWith("<figure") && !out[k].includes("<figcaption")) out[k] = out[k].replace("</figure>", `<figcaption class="cap">${inline(b.text)}</figcaption></figure>`);
        else push(`<p${cls("cap", /^(fig|table)$/.test((toks[ti + 1] || {}).t) && "keep")}>${inline(b.text)}</p>`);  // 그림·표 앞 캡션은 그 블록과 같은 쪽에
        continue;
      }
      if (b.t === "list") {
        const tree = listTree(b.lines);
        for (let k = 0; k < tree.length;) {
          if (tree[k].ord) {  // 번호 목록 → 진행 단계(번호는 원고에 적힌 그대로)
            const it = tree[k++];
            push(`<p${cls("act")} data-n="${it.n}">${inline(it.text)}</p>`);
            if (it.kids.length) push(ulHtml(it.kids, cls("in-act")));
            for (const s of it.figs) for (const f of figsOf(s)) { stats.그림++; push(`<figure${cls()}><img src="${esc(f.src)}" alt="${esc(f.alt)}"${f.width ? ` style="width:${f.width}"` : ""}></figure>`); }
            continue;
          }
          const grp = [];
          while (k < tree.length && !tree[k].ord) grp.push(tree[k++]);
          const chk = grp.every(it => /^\[[ xX]\]\s+/.test(it.text));
          if (chk) grp.forEach(it => it.text = it.text.replace(/^\[[ xX]\]\s+/, ""));
          push(ulHtml(grp, cls(chk && "checklist")));
        }
        continue;
      }
      if (b.t === "table") {
        const rows = b.rows.map(cells), n = rows[0].length;
        const al = cells(b.align).map(c => /^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : "");
        const row = (r, tag) => "<tr>" + Array.from({ length: n }, (x, k) => `<${tag}${al[k] ? ` style="text-align:${al[k]}"` : ""}>${inline(r[k] || "")}</${tag}>`).join("") + "</tr>";
        stats.표++;
        push(`<table${cls("tbl")}>${rows[0].some(c => c) ? `<thead>${row(rows[0], "th")}</thead>` : ""}<tbody>${rows.slice(1).map(r => row(r, "td")).join("")}</tbody></table>`);
        continue;
      }
      if (b.t === "code") {
        if (TAGS[b.info.split(/\s+/)[0].toUpperCase()] === "request") { push(`<div${cls("request")}><div class="request-bar"><span>요청 프롬프트</span><span>그대로 입력</span></div><p>${b.text.split("\n").map(esc).join("<br>")}</p></div>`); continue; }
        const t = /title=(.*)$/.exec(b.info);
        stats.코드++;
        if (t) push(`<p${cls("code-t", "keep")}>${esc(t[1].replace(/^["']|["']$/g, ""))}</p>`);
        push(`<pre${cls("code")}>${esc(b.text)}</pre>`);
        continue;
      }
      if (b.t === "quote") { push(`<blockquote${cls()}>${b.lines.join("\n").split(/\n\s*\n/).map(p => `<p>${inline(p)}</p>`).join("")}</blockquote>`); continue; }
      if (b.t === "corner") {
        closeCorner(); corner = true; stats.코너++;
        const m = /^\[([^\]]+)\]\s*(.*)$/.exec(b.text.trim());
        push(`<div${cls("corner-h")}><em class="lbl">${esc(m ? m[1] : b.name)}</em><span>${inline(m ? m[2] : b.text)}</span></div>`);
        continue;
      }
      if (b.t === "box") {
        const title = b.lines.length ? b.first : "", body = b.lines.length ? b.lines : [b.first];
        if (b.kind === "tip" || b.kind === "warn") {
          stats[b.kind === "tip" ? "팁" : "주의"]++;
          const lbl = b.kind === "warn" ? "주의" : /^(NOTE|참고)$/i.test(b.name) ? "참고" : "TIP";
          push(`<div${cls(b.kind)} data-lbl="${lbl}"><b>${esc(plain(title))}</b>${boxBody(body)}</div>`);
        } else if (b.kind === "voice") push(`<div${cls("voice")}><b>${esc(b.name)}</b>${boxBody([b.first, ...b.lines])}</div>`);
        else if (b.kind === "request") push(`<div${cls("request")}><div class="request-bar"><span>요청 프롬프트</span><span>그대로 입력</span></div><p>${[b.first, ...b.lines].filter(x => x.trim()).map(x => inline(x.trim())).join("<br>")}</p></div>`);
        else if (b.kind === "check") push(`<ul${cls("checklist")}>${[b.first, ...b.lines].map(x => x.replace(/^\s*[-*+]\s+/, "").replace(/^\[[ xX]\]\s+/, "").trim()).filter(Boolean).map(x => `<li>${inline(x)}</li>`).join("")}</ul>`);
        else { stats.박스++; push(`<div${cls("box")}>${title ? `<b>${esc(plain(title))}</b>` : ""}${boxBody(body)}</div>`); }
        continue;
      }
    }
    closeCorner(); flushPart();
    return { html: out.join("\n"), outline, stats, title: fm.title || (outline.find(o => o.lv === 1 && o.title) || outline[0] || {}).title || opts.title || "" };
  }

  root.mdToBook = mdToBook;
  if (typeof module !== "undefined" && module.exports) module.exports = { mdToBook, inline, parseHead };
})(typeof window !== "undefined" ? window : globalThis);
