/* docx2md.js — Word(.docx) → Markdown (브라우저 전용: DOMParser · DecompressionStream · canvas)
   · 문단 스타일 이름으로 [파트] [장] [절] [중] [소] [소소] · 팁 · 박스 · 코너 · 캡션 · 코드를 구분한다.
   · 편집 흔적: 메모(comments)·변경 추적 삭제(w:del)·취소선 글자는 버리고, 변경 추적 삽입(w:ins)은 받아들인다.
   · 도해(Word 도형 그룹)는 SVG 그림 파일로 다시 그린다. */
(function () {
  "use strict";
  const X = s => new DOMParser().parseFromString(s, "application/xml");
  const kids = (el, n) => el ? [...el.children].filter(c => !n || c.nodeName === n) : [];
  const kid = (el, n) => el ? [...el.children].find(c => c.nodeName === n) : undefined;
  const val = (el, n = "w:val") => el ? el.getAttribute(n) : null;
  const all = (el, n) => el ? [...el.getElementsByTagName(n)] : [];
  const pad = n => String(n).padStart(2, "0");
  const num = n => +(+n).toFixed(2);
  const xesc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* zip 풀기: 중앙 디렉터리를 읽고 브라우저 내장 압축 해제를 쓴다 */
  function unzip(buf) {
    const v = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder(), files = {};
    let e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("docx(zip) 형식이 아닙니다.");
    let p = v.getUint32(e + 16, true);
    for (let n = v.getUint16(e + 10, true); n > 0; n--) {
      const nl = v.getUint16(p + 28, true);
      files[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: v.getUint16(p + 10, true), size: v.getUint32(p + 20, true), off: v.getUint32(p + 42, true) };
      p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    return {
      has: n => n in files,
      async bytes(n) {
        const f = files[n], s = f.off + 30 + v.getUint16(f.off + 26, true) + v.getUint16(f.off + 28, true), raw = u8.subarray(s, s + f.size);
        return f.method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      },
      async text(n) { return n in files ? td.decode(await this.bytes(n)) : ""; },
    };
  }

  /* 문단 스타일 이름 → 종류 (위에서부터 먼저 맞는 것) */
  const STYLE = [
    [/코드\s*제목/, "codeTitle"], [/코드|명령어|code/i, "code"],
    [/^(마당|파트|part)(\s*제목)?$/i, "파트"], [/^(장|chapter)(\s*제목)?$/i, "장"], [/^절(\s*제목)?$/, "절"], [/^중(\s*제목)?$/, "중"], [/^소(\s*제목)?$/, "소"], [/^소소(\s*제목)?$/, "소소"],
    [/캡션|caption/i, "캡션"], [/팁|tip/i, "TIP"], [/주의|경고/, "주의"], [/코너|칼럼/, "코너"], [/박스|상자/, "박스"], [/프롬프트/, "요청"],
  ];
  const PLAIN = /^(|normal|list paragraph|body text.*|본문|표준|바탕글|no spacing|default|normal \(web\))$/i;

  /* 도형 */
  const PT = 12700;  // 1pt = 12700 EMU
  const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  const SCHEME = { tx1: "000000", dk1: "000000", bg1: "FFFFFF", lt1: "FFFFFF", tx2: "44546A", dk2: "44546A", bg2: "E7E6E6", lt2: "E7E6E6", accent1: "4472C4", accent2: "ED7D31", accent3: "A5A5A5", accent4: "FFC000", accent5: "5B9BD5", accent6: "70AD47" };
  function color(fill) {
    const c = fill && (kid(fill, "a:srgbClr") || kid(fill, "a:schemeClr") || kid(fill, "a:sysClr") || kid(fill, "a:prstClr"));
    if (!c) return null;
    const hex = c.nodeName === "a:srgbClr" ? val(c, "val") : c.nodeName === "a:schemeClr" ? SCHEME[val(c, "val")] || "000000" : c.nodeName === "a:sysClr" ? val(c, "lastClr") || "000000" : null;
    const a = kid(c, "a:alpha");
    return { c: hex ? "#" + hex : val(c, "val"), o: a ? +val(a, "val") / 100000 : 1 };
  }
  const refColor = (style, n) => { const r = kid(style, n); return r && +val(r, "idx") > 0 ? color(r) : null; };
  function fillOf(spPr, style) {
    if (kid(spPr, "a:noFill")) return null;
    const g = kid(spPr, "a:gradFill");
    return color(kid(spPr, "a:solidFill")) || (g ? color(all(g, "a:gs")[0]) : null) || refColor(style, "a:fillRef");
  }
  function lineOf(spPr, style) {
    const ln = kid(spPr, "a:ln");
    if (!ln) { const c = refColor(style, "a:lnRef"); return c ? { ...c, w: .75 } : null; }
    if (kid(ln, "a:noFill")) return null;
    const c = color(kid(ln, "a:solidFill")) || refColor(style, "a:lnRef") || { c: "#000000", o: 1 };
    return { ...c, w: (+val(ln, "w") || 9525) / PT, dash: val(kid(ln, "a:prstDash"), "val") || "solid", head: val(kid(ln, "a:headEnd"), "type"), tail: val(kid(ln, "a:tailEnd"), "type") };
  }
  const poly = pts => "M" + pts.map(p => num(p[0]) + " " + num(p[1])).join("L") + "Z";
  const arrow = (w, h) => { const k = Math.min(w, h / 2); return [[0, h / 4], [w - k, h / 4], [w - k, 0], [w, h / 2], [w - k, h], [w - k, h * .75], [0, h * .75]]; };
  const arrow2 = (w, h) => { const k = Math.min(w / 2, h / 2); return [[0, h / 2], [k, 0], [k, h / 4], [w - k, h / 4], [w - k, 0], [w, h / 2], [w - k, h], [w - k, h * .75], [k, h * .75], [k, h]]; };
  const GEOM = {
    rect: (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]),
    roundRect: (w, h, a = 16667) => { const r = num(Math.min(w, h) * Math.min(Math.max(a, 0), 50000) / 100000); return `M${r} 0H${num(w - r)}A${r} ${r} 0 0 1 ${num(w)} ${r}V${num(h - r)}A${r} ${r} 0 0 1 ${num(w - r)} ${num(h)}H${r}A${r} ${r} 0 0 1 0 ${num(h - r)}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; },
    ellipse: (w, h) => `M0 ${num(h / 2)}A${num(w / 2)} ${num(h / 2)} 0 1 1 ${num(w)} ${num(h / 2)}A${num(w / 2)} ${num(h / 2)} 0 1 1 0 ${num(h / 2)}Z`,
    diamond: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
    triangle: (w, h) => poly([[w / 2, 0], [w, h], [0, h]]),
    trapezoid: (w, h) => poly([[w * .25, 0], [w * .75, 0], [w, h], [0, h]]),
    parallelogram: (w, h) => poly([[w * .25, 0], [w, 0], [w * .75, h], [0, h]]),
    delay: (w, h) => `M0 0H${num(w - h / 2)}A${num(h / 2)} ${num(h / 2)} 0 0 1 ${num(w - h / 2)} ${num(h)}H0Z`,
    rightArrow: (w, h) => poly(arrow(w, h)), leftArrow: (w, h) => poly(arrow(w, h).map(([x, y]) => [w - x, y])),
    downArrow: (w, h) => poly(arrow(h, w).map(([x, y]) => [y, x])), upArrow: (w, h) => poly(arrow(h, w).map(([x, y]) => [y, h - x])),
    leftRightArrow: (w, h) => poly(arrow2(w, h)), upDownArrow: (w, h) => poly(arrow2(h, w).map(([x, y]) => [y, x])),
  };
  const ALIAS = { round1Rect: "roundRect", round2SameRect: "roundRect", round2DiagRect: "roundRect", wedgeRoundRectCallout: "roundRect", flowChartAlternateProcess: "roundRect", flowChartTerminator: "roundRect",
    flowChartProcess: "rect", foldedCorner: "rect", wedgeRectCallout: "rect", flowChartMagneticDisk: "roundRect", can: "roundRect", cube: "rect", snip1Rect: "rect", flowChartDocument: "rect",
    flowChartConnector: "ellipse", flowChartOr: "ellipse", flowChartSummingJunction: "ellipse", noSmoking: "ellipse", oval: "ellipse", flowChartDecision: "diamond", flowChartDelay: "delay", flowChartInputOutput: "parallelogram" };
  const MATH = { mathPlus: "+", mathEqual: "=", mathMultiply: "×", mathMinus: "−", mathDivide: "÷" };
  function brace(w, h, left) {
    const r = Math.min(w / 2, h / 8), x = v => num(left ? w - v : v), m = h / 2;
    return `M${x(0)} 0Q${x(w / 2)} 0 ${x(w / 2)} ${num(r)}V${num(m - r)}Q${x(w / 2)} ${num(m)} ${x(w)} ${num(m)}Q${x(w / 2)} ${num(m)} ${x(w / 2)} ${num(m + r)}V${num(h - r)}Q${x(w / 2)} ${num(h)} ${x(0)} ${num(h)}`;
  }
  /* 연결선: 경로와 양 끝의 바깥 방향(화살촉용) */
  function conn(prst, w, h, adj) {
    const m = num(w * (adj === undefined ? 50000 : adj) / 100000); w = num(w); h = num(h);
    if (prst === "line" || prst === "straightConnector1") { const l = Math.hypot(w, h) || 1; return { d: `M0 0L${w} ${h}`, s: [0, 0, -w / l, -h / l], e: [w, h, w / l, h / l] }; }
    if (prst === "bentConnector2") return { d: `M0 0H${w}V${h}`, s: [0, 0, -1, 0], e: [w, h, 0, 1] };
    if (/^bentConnector/.test(prst)) return { d: `M0 0H${m}V${h}H${w}`, s: [0, 0, -1, 0], e: [w, h, w >= m ? 1 : -1, 0] };
    if (prst === "curvedConnector2") return { d: `M0 0Q${w} 0 ${w} ${h}`, s: [0, 0, -1, 0], e: [w, h, 0, 1] };
    if (/^curvedConnector/.test(prst)) return { d: `M0 0C${m} 0 ${m} ${h} ${w} ${h}`, s: [0, 0, -1, 0], e: [w, h, 1, 0] };
    return null;
  }
  function custPath(cg, w, h) {
    let d = "";
    for (const p of all(cg, "a:path")) {
      const kx = w / (+val(p, "w") || 1), ky = h / (+val(p, "h") || 1), P = e => all(e, "a:pt").map(q => num(val(q, "x") * kx) + " " + num(val(q, "y") * ky)).join(" ");
      for (const c of p.children) d += c.nodeName === "a:moveTo" ? "M" + P(c) : c.nodeName === "a:lnTo" ? "L" + P(c) : c.nodeName === "a:cubicBezTo" ? "C" + P(c) : c.nodeName === "a:quadBezTo" ? "Q" + P(c) : c.nodeName === "a:close" ? "Z" : "";
    }
    return d;
  }
  function xfrm(pr) {
    const x = kid(pr, "a:xfrm"), o = kid(x, "a:off"), e = kid(x, "a:ext");
    if (!o || !e) return null;
    const co = kid(x, "a:chOff"), ce = kid(x, "a:chExt");
    return { x: +val(o, "x"), y: +val(o, "y"), cx: +val(e, "cx"), cy: +val(e, "cy"), chx: co ? +val(co, "x") : 0, chy: co ? +val(co, "y") : 0, chcx: ce ? +val(ce, "cx") : 0, chcy: ce ? +val(ce, "cy") : 0,
      rot: +val(x, "rot") || 0, fh: val(x, "flipH") === "1", fv: val(x, "flipV") === "1" };
  }

  async function docxToMd(file) {
    const zip = unzip(await file.arrayBuffer());
    const doc = X(await zip.text("word/document.xml")), body = all(doc, "w:body")[0];
    if (!body) throw new Error("Word 문서 본문을 찾지 못했습니다.");
    const report = { 스타일: {}, 모르는스타일: {}, 메모: 0, 삭제: 0, 취소선: 0, 그림: 0, 도해: 0, 못읽은그림: 0 }, assets = {};
    const count = (o, k) => o[k] = (o[k] || 0) + 1;

    const sx = X(await zip.text("word/styles.xml") || "<x/>"), styles = {};
    for (const s of all(sx, "w:style")) styles[val(s, "w:styleId")] = { name: val(kid(s, "w:name")) || "", outline: val(kid(kid(s, "w:pPr"), "w:outlineLvl")) };
    const defSize = +val(all(all(sx, "w:rPrDefault")[0], "w:sz")[0]) / 2 || 10;
    const rels = {};
    for (const r of all(X(await zip.text("word/_rels/document.xml.rels") || "<x/>"), "Relationship")) rels[r.getAttribute("Id")] = r.getAttribute("Target");
    const nx = X(await zip.text("word/numbering.xml") || "<x/>"), abs = {}, nums = {}, counters = {};
    for (const a of all(nx, "w:abstractNum")) abs[val(a, "w:abstractNumId")] = kids(a, "w:lvl").map(l => ({ fmt: val(kid(l, "w:numFmt")) || "decimal", start: +val(kid(l, "w:start")) || 1 }));
    for (const n of all(nx, "w:num")) nums[val(n, "w:numId")] = abs[val(kid(n, "w:abstractNumId"))] || [];
    report.메모 = all(X(await zip.text("word/comments.xml") || "<x/>"), "w:comment").length;
    report.삭제 = all(doc, "w:del").length;
    const sect = kids(body, "w:sectPr").pop(), pg = kid(sect, "w:pgSz"), mar = kid(sect, "w:pgMar");
    const textW = ((+val(pg, "w:w") || 11906) - (+val(mar, "w:left") || 1440) - (+val(mar, "w:right") || 1440)) * 635;  // 판면 폭(EMU)

    const kindOf = (st, pPr) => {
      const name = st.name || "";
      for (const [re, k] of STYLE) if (re.test(name)) return k;
      const h = /^(?:heading|제목|개요)\s*(\d)$/i.exec(name), ol = val(kid(pPr, "w:outlineLvl")) || st.outline;
      if (h) return "#".repeat(+h[1]);
      if (ol !== null && ol !== undefined && +ol < 6) return "#".repeat(+ol + 1);
      if (!PLAIN.test(name)) count(report.모르는스타일, name);
      return "";
    };

    /* Word 수식 → 한 줄 글자: 분수는 (a) / (b), 아래·위 첨자는 _ ^ 로 풀어 쓴다 */
    function math(n) {
      let s = "";
      for (const c of n ? n.children : []) {
        const k = c.nodeName;
        if (k === "m:r") s += kids(c, "m:t").map(t => t.textContent).join("");
        else if (k === "m:f") s += `(${math(kid(c, "m:num"))}) / (${math(kid(c, "m:den"))})`;
        else if (k === "m:sSub") s += math(kid(c, "m:e")) + "_" + math(kid(c, "m:sub"));
        else if (k === "m:sSup") s += math(kid(c, "m:e")) + "^" + math(kid(c, "m:sup"));
        else if (k === "m:rad") s += "√(" + math(kid(c, "m:e")) + ")";
        else if (!/Pr$/.test(k)) s += math(c);
      }
      return s;
    }
    /* 문단 안 글자·그림 모으기 — 삭제·이동 전 내용·메모 표시는 들어가지 않는다 */
    function collect(node, acc) {
      for (const c of node.children) {
        const n = c.nodeName;
        if (n === "w:r") run(c, acc);
        else if (n === "m:oMath" || n === "m:oMathPara") acc.push({ text: math(c) });
        else if (n === "w:hyperlink" || n === "w:ins" || n === "w:moveTo" || n === "w:smartTag" || n === "w:sdt" || n === "w:sdtContent" || n === "w:fldSimple" || n === "w:customXml") collect(c, acc);
      }
      return acc;
    }
    function run(r, acc) {
      const pr = kid(r, "w:rPr"), on = n => { const e = kid(pr, n); return !!e && !/^(0|false|none)$/.test(val(e) || "1"); };
      if (on("w:strike") || on("w:dstrike") || on("w:vanish")) { report.취소선++; return; }
      const va = val(kid(pr, "w:vertAlign")), rs = (styles[val(kid(pr, "w:rStyle"))] || {}).name || "", col = val(kid(pr, "w:color"));
      const f = { b: on("w:b"), sup: va === "superscript" || (/첨자|superscript/i.test(rs) && va !== "subscript"), sub: va === "subscript", size: +val(kid(pr, "w:sz")) / 2 || 0, color: col && col !== "auto" ? col : "" };
      for (const c of r.children) {
        const n = c.nodeName;
        if (n === "w:t") acc.push({ ...f, text: c.textContent });
        else if (n === "w:tab") acc.push({ ...f, text: "\t" });
        else if (n === "w:br" || n === "w:cr") { if (val(c, "w:type") !== "page") acc.push({ br: 1 }); }
        else if (n === "w:noBreakHyphen") acc.push({ ...f, text: "-" });
        else if (n === "w:drawing" || n === "w:pict" || n === "mc:AlternateContent") acc.push({ img: c });
      }
    }
    /* 모은 글자 → 마크다운 한 줄. mode: "md"(서식 유지) · "plain"(제목·캡션) · "code" */
    function lineOf2(acc, mode) {
      const segs = [];
      for (const a of acc) {
        if (a.img) continue;
        const t = a.br ? (mode === "code" ? "\n" : mode === "plain" ? " " : "<br>") : mode === "code" ? a.text.replace(/\t/g, "    ") : a.text.replace(/\t/g, " ");
        const f = a.br || mode !== "md" ? {} : a, l = segs[segs.length - 1];
        if (l && !l.b === !f.b && !l.sup === !f.sup && !l.sub === !f.sub) l.text += t; else segs.push({ text: t, b: f.b, sup: f.sup, sub: f.sub });
      }
      if (mode !== "md") return segs.map(g => g.text).join("");
      return segs.map(g => {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(g.text.replace(/([\\*_`])/g, "\\$1"));
        if (!m[2]) return m[0];
        let core = m[2];
        if (g.b) core = `**${core}**`;
        if (g.sup) core = `<sup>${core}</sup>`; else if (g.sub) core = `<sub>${core}</sub>`;
        return m[1] + core + m[3];
      }).join("");
    }

    /* 그림 */
    let imgN = 0;
    const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp" };
    const blobOf = async rid => {
      const t = rels[rid]; if (!t) return null;
      const path = t.startsWith("/") ? t.slice(1) : "word/" + t, ext = path.split(".").pop().toLowerCase();
      return MIME[ext] && zip.has(path) ? { blob: new Blob([await zip.bytes(path)], { type: MIME[ext] }), ext } : null;
    };
    const urlCache = {};
    const dataUrl = rid => urlCache[rid] || (urlCache[rid] = blobOf(rid).then(b => b && new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b.blob); })));
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = k => { ctx.font = `${k.b ? "700 " : ""}${k.size}px ${FONT}`; return ctx.measureText(k.text).width; };

    /* 도형 안 글: 상자 폭에 맞춰 줄을 나누고 세로 맞춤을 계산한다 */
    function shapeText(tx, bp, w, h, k) {
      const ins = (n, d) => (bp && val(bp, n) !== null ? +val(bp, n) : d) / PT * k;
      const l = ins("lIns", 91440), t = ins("tIns", 45720), r = ins("rIns", 91440), b = ins("bIns", 45720);
      const vert = val(bp, "vert") || "", turned = /270/.test(vert) ? -90 : /^(vert|eaVert|wordArtVert)/.test(vert) ? 90 : 0;
      const bw = turned ? h : w, bh = turned ? w : h, iw = Math.max(1, bw - l - r), wrap = val(bp, "wrap") !== "none";
      const lines = [];
      for (const p of kids(tx, "w:p")) {
        const pPr = kid(p, "w:pPr"), jc = val(kid(pPr, "w:jc")) || "left", pSize = num((+val(kid(kid(pPr, "w:rPr"), "w:sz")) / 2 || defSize) * k);
        let cur = { jc, segs: [], width: 0, size: 0 };
        const flush = () => { if (!cur.size) cur.size = pSize; lines.push(cur); cur = { jc, segs: [], width: 0, size: 0 }; };
        const add = k => {
          const wd = measure(k);
          if (wrap && wd > iw && k.text.trim().length > 1) { for (const c of k.text) add({ ...k, text: c }); return; }
          if (wrap && cur.segs.length && cur.width + measure({ ...k, text: k.text.trimEnd() }) > iw) flush();
          cur.segs.push(k); cur.width += wd; cur.size = Math.max(cur.size, k.size);
        };
        for (const a of collect(p, [])) {
          if (a.br) flush();
          else if (a.text !== undefined) for (const wd of a.text.replace(/\t/g, " ").split(/(?<=\s)/)) if (wd) add({ text: wd, size: a.size ? num(a.size * k) : pSize, b: a.b, c: a.color });
        }
        flush();
      }
      while (lines.length && !lines[lines.length - 1].segs.length) lines.pop();
      if (!lines.length) return "";
      const LH = 1.3, total = lines.reduce((s, ln) => s + ln.size * LH, 0), anchor = val(bp, "anchor") || "t";
      let y = anchor === "ctr" ? (bh - total + t - b) / 2 : anchor === "b" ? bh - b - total : t, out = "";
      for (const ln of lines) {
        const base = y + ln.size; y += ln.size * LH;
        if (!ln.segs.length) continue;
        ln.segs[ln.segs.length - 1].text = ln.segs[ln.segs.length - 1].text.trimEnd();
        const ta = ln.jc === "center" ? "middle" : ln.jc === "right" || ln.jc === "end" ? "end" : "start", x = ta === "middle" ? l + iw / 2 : ta === "end" ? l + iw : l;
        out += `<text x="${num(x)}" y="${num(base)}" text-anchor="${ta}" xml:space="preserve">` + ln.segs.map(g => `<tspan font-size="${g.size}"${g.b ? ' font-weight="700"' : ""}${g.c ? ` fill="#${g.c}"` : ""}>${xesc(g.text)}</tspan>`).join("") + "</text>";
      }
      return turned ? `<g transform="translate(${num(w / 2)} ${num(h / 2)}) rotate(${turned}) translate(${num(-bw / 2)} ${num(-bh / 2)})">${out}</g>` : out;
    }

    /* 도형 그룹 → SVG. 좌표 단위는 pt, 그룹 안 좌표는 m(배율·이동)으로 바꾼다 */
    async function groupSvg(root, cx, cy) {
      const W = cx / PT, H = cy / PT, parts = [];
      async function leaf(c, m) {
        const pic = c.nodeName === "pic:pic", spPr = kid(c, pic ? "pic:spPr" : "wps:spPr"), x = xfrm(spPr);
        if (!x) return;
        const w = x.cx * m.sx, h = x.cy * m.sy, at = `translate(${num(x.x * m.sx + m.tx)} ${num(x.y * m.sy + m.ty)})` + (x.rot ? ` rotate(${num(x.rot / 60000)} ${num(w / 2)} ${num(h / 2)})` : "");
        const open = `<g transform="${at}${x.fh ? ` translate(${num(w)} 0) scale(-1 1)` : ""}${x.fv ? ` translate(0 ${num(h)}) scale(1 -1)` : ""}">`;
        if (pic) { const url = await dataUrl(val(all(c, "a:blip")[0], "r:embed")); if (url) parts.push(`${open}<image href="${url}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="none"/></g>`); return; }
        const geo = kid(spPr, "a:prstGeom"), cg = kid(spPr, "a:custGeom"), prst = val(geo, "prst") || (cg ? "cust" : "rect");
        const gd = all(geo, "a:gd")[0], am = gd && /val\s+(-?\d+)/.exec(val(gd, "fmla") || ""), adj = am ? +am[1] : undefined;
        const style = kid(c, "wps:style"), fill = fillOf(spPr, style), ln = lineOf(spPr, style), tx = all(c, "w:txbxContent")[0], k = m.sx * PT;  // k: 그룹이 줄어든 배율 — 글자·여백·선 굵기도 함께 줄인다
        if (ln) ln.w *= k;
        const paint = f => f ? ` fill="${f.c}"${f.o < 1 ? ` fill-opacity="${f.o}"` : ""}` : ' fill="none"';
        const dash = ln && ln.dash !== "solid" ? ` stroke-dasharray="${/dot/i.test(ln.dash) && !/dash/i.test(ln.dash) ? num(ln.w) + " " + num(ln.w * 2) : num(ln.w * 4) + " " + num(ln.w * 3)}"` : "";
        const stroke = ln ? ` stroke="${ln.c}" stroke-width="${num(ln.w)}"${ln.o < 1 ? ` stroke-opacity="${ln.o}"` : ""}${dash}` : ' stroke="none"';
        const cn = conn(prst, w, h, adj);
        let s = "";
        if (cn) {
          if (ln) {
            s = `<path d="${cn.d}" fill="none"${stroke}/>`;
            const tip = ([px, py, dx, dy], type) => {
              if (!type || type === "none") return;
              const L = Math.max(ln.w * 4, 4.5 * k);
              s += type === "oval" ? `<circle cx="${num(px)}" cy="${num(py)}" r="${num(L / 2)}" fill="${ln.c}"/>`
                : `<path d="${poly([[px, py], [px - dx * L - dy * L * .38, py - dy * L + dx * L * .38], [px - dx * L + dy * L * .38, py - dy * L - dx * L * .38]])}" fill="${ln.c}"/>`;
            };
            tip(cn.s, ln.head); tip(cn.e, ln.tail);
          }
        } else if (prst === "cust") s = `<path d="${custPath(cg, w, h)}"${paint(fill)}${stroke}/>`;
        else if (prst === "leftBrace" || prst === "rightBrace") s = ln ? `<path d="${brace(w, h, prst === "leftBrace")}" fill="none"${stroke}/>` : "";
        else if (MATH[prst]) s = `<text x="${num(w / 2)}" y="${num(h * .82)}" text-anchor="middle" font-size="${num(h)}"${paint(fill || { c: "#000000", o: 1 })}>${MATH[prst]}</text>`;
        else {
          const f = GEOM[ALIAS[prst] || prst];
          if (f) s = `<path d="${f(w, h, adj)}"${paint(fill)}${stroke}/>`;
          else if (!/Arrow/.test(prst) && (fill || ln)) s = `<path d="${GEOM.rect(w, h)}"${paint(fill)}${stroke}/>`;
          const cross = prst === "flowChartOr" ? [[w / 2, 0, w / 2, h], [0, h / 2, w, h / 2]] : prst === "flowChartSummingJunction" ? [[w * .146, h * .146, w * .854, h * .854], [w * .854, h * .146, w * .146, h * .854]] : prst === "noSmoking" ? [[w * .146, h * .146, w * .854, h * .854]] : [];
          for (const [x1, y1, x2, y2] of cross) s += `<path d="M${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}" fill="none"${ln ? stroke : ' stroke="#000" stroke-width=".75"'}/>`;
        }
        if (s) parts.push(open + s + "</g>");
        const t = tx ? shapeText(tx, kid(c, "wps:bodyPr"), w, h, k) : "";
        if (t) parts.push(`<g transform="${at}">${t}</g>`);
      }
      async function tree(node, m) {
        for (const c of node.children) {
          if (c.nodeName === "wpg:grpSp") {
            const g = xfrm(kid(c, "wpg:grpSpPr"));
            if (!g || !g.chcx || !g.chcy) continue;
            const kx = g.cx / g.chcx, ky = g.cy / g.chcy;
            await tree(c, { sx: m.sx * kx, sy: m.sy * ky, tx: m.sx * (g.x - g.chx * kx) + m.tx, ty: m.sy * (g.y - g.chy * ky) + m.ty });
          } else if (c.nodeName === "wps:wsp" || c.nodeName === "pic:pic") await leaf(c, m);
        }
      }
      if (root.nodeName === "wpg:wgp") {
        const g = xfrm(kid(root, "wpg:grpSpPr"));
        const sx = g && g.chcx ? cx / g.chcx / PT : 1 / PT, sy = g && g.chcy ? cy / g.chcy / PT : 1 / PT;
        await tree(root, { sx, sy, tx: g ? -g.chx * sx : 0, ty: g ? -g.chy * sy : 0 });
      } else {
        const x = xfrm(kid(root, "wps:spPr")), sx = x && x.cx ? cx / x.cx / PT : 1 / PT, sy = x && x.cy ? cy / x.cy / PT : 1 / PT;
        await leaf(root, { sx, sy, tx: x ? -x.x * sx : 0, ty: x ? -x.y * sy : 0 });
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(W * 4 / 3)}" height="${num(H * 4 / 3)}" viewBox="0 0 ${num(W)} ${num(H)}" font-family="${FONT}" stroke-linejoin="round">${parts.join("")}</svg>`;
    }
    async function image(el) {
      if (el.nodeName === "mc:AlternateContent") el = kid(el, "mc:Choice") || el;
      const ext = all(el, "wp:extent")[0], cx = +val(ext, "cx") || 0, cy = +val(ext, "cy") || 0, grp = all(el, "wpg:wgp")[0] || all(el, "wps:wsp")[0];
      let name;
      if (grp && cx && cy) { name = `fig-${pad(++imgN)}.svg`; assets[name] = new Blob([await groupSvg(grp, cx, cy)], { type: "image/svg+xml" }); report.도해++; }
      else {
        const blip = all(el, "a:blip")[0], vml = all(el, "v:imagedata")[0], b = await blobOf(blip ? val(blip, "r:embed") : vml ? val(vml, "r:id") : "");
        if (!b) { report.못읽은그림++; return ""; }
        name = `img-${pad(++imgN)}.${b.ext}`; assets[name] = b.blob; report.그림++;
      }
      return `![](${name}){width=${cx ? Math.min(100, Math.round(cx / textW * 100)) : 100}%}`;
    }

    /* 문단 → 블록. g가 같은 이웃 블록은 한 덩어리(목록·박스·코드)로 붙인다 */
    const blocks = [];
    let cornerOpen = false, pending = [];
    const emit = (s, g = null) => blocks.push({ s, g });
    async function para(p) {
      const pPr = kid(p, "w:pPr"), st = styles[val(kid(pPr, "w:pStyle"))] || {}, acc = collect(p, pending);
      pending = [];
      // 문단 기호가 삭제된 문단은 다음 문단과 합쳐지고, 합친 문단은 뒤 문단의 스타일을 따른다(Word에서 변경 내용을 적용한 결과와 같음)
      if (kid(kid(pPr, "w:rPr"), "w:del")) { pending = acc; return; }
      const kind = kindOf(st, pPr);
      const has = acc.some(a => a.text && a.text.trim()), imgs = acc.filter(a => a.img);
      if (kind) count(report.스타일, st.name);
      if (kind === "code") { if (has || (blocks.length && blocks[blocks.length - 1].g === "code")) emit(lineOf2(acc, "code"), "code"); }
      else if (kind === "코너") {
        if (has) { emit("[코너] " + lineOf2(acc, "plain").trim()); cornerOpen = true; }
        else if (cornerOpen && !imgs.length) { emit("[/코너]"); cornerOpen = false; }
      } else if (has) {
        const numPr = kid(pPr, "w:numPr"), numId = val(kid(numPr, "w:numId")), ilvl = +val(kid(numPr, "w:ilvl")) || 0;
        const isList = numPr && numId && numId !== "0", lv = isList && (nums[numId] || [])[ilvl], bullet = !lv || lv.fmt === "bullet" || lv.fmt === "none";
        let n = 0;
        if (isList && !bullet) { const c = counters[numId] || (counters[numId] = []); c[ilvl] = (c[ilvl] || lv.start - 1) + 1; c.length = ilvl + 1; n = c[ilvl]; }
        const text = lineOf2(acc, "plain").replace(/\s+/g, " ").trim(), md = lineOf2(acc, "md").trim();
        if (kind === "codeTitle") emit(text, "codeTitle");
        else if (/^[파장절중소]/.test(kind) && kind !== "주의") { emit(`[${kind}] ${text}`); cornerOpen = false; }
        else if (kind[0] === "#") { emit(`${kind} ${text}`); cornerOpen = false; }
        else if (kind === "캡션") emit("[캡션] " + md);
        else if (kind === "TIP" || kind === "주의" || kind === "요청") emit(`[${kind}] ${md}`);
        else if (kind === "박스") emit((isList ? "- " : "") + md, "box");
        else if (isList) emit("  ".repeat(ilvl) + (bullet ? "- " : n + ". ") + md, "list");
        else emit(md.replace(/^(#{1,6}\s|>|[-+]\s)/, "\\$1").replace(/^(\d{1,3})([.)]\s)/, "$1\\$2"));
      }
      for (const a of imgs) { const s = await image(a.img); if (s) emit(s); }
    }
    async function table(t) {
      const rows = [];
      for (const tr of kids(t, "w:tr")) {
        if (kid(kid(tr, "w:trPr"), "w:del")) continue;
        const row = [];
        for (const tc of kids(tr, "w:tc")) {
          const lines = [];
          for (const p of all(tc, "w:p")) {
            const acc = collect(p, []); let s = lineOf2(acc, "md").trim();
            for (const a of acc) if (a.img) s += (s ? " " : "") + await image(a.img);
            if (s) lines.push((kid(kid(p, "w:pPr"), "w:numPr") ? "• " : "") + s);
          }
          row.push(lines);
          for (let k = +val(kid(kid(tc, "w:tcPr"), "w:gridSpan")) || 1; k > 1; k--) row.push([]);
        }
        rows.push(row);
      }
      if (!rows.some(r => r.some(c => c.length))) return;
      if (rows.length === 1 && rows[0].length === 1) { emit("[박스]\n" + rows[0][0].join("\n")); return; }  // 한 칸짜리 표는 상자로 쓴 것
      const n = Math.max(...rows.map(r => r.length)), line = r => "| " + Array.from({ length: n }, (x, k) => (r[k] || []).join("<br>").replace(/\|/g, "\\|")).join(" | ") + " |";
      emit([line(rows[0]), "|" + " --- |".repeat(n), ...rows.slice(1).map(line)].join("\n"));
    }
    async function walk(node) {
      for (const c of node.children) {
        if (c.nodeName === "w:p") await para(c);
        else if (c.nodeName === "w:tbl") await table(c);
        else if (c.nodeName === "w:sdt") await walk(kid(c, "w:sdtContent") || c);
        else if (c.nodeName === "w:ins" || c.nodeName === "w:moveTo" || c.nodeName === "w:customXml") await walk(c);
      }
    }
    await walk(body);
    if (pending.some(a => a.text && a.text.trim())) emit(lineOf2(pending, "md").trim());

    /* 블록 잇기 */
    let md = "";
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i], prev = blocks[i - 1], next = blocks[i + 1];
      if (b.g === "codeTitle") { if (!next || next.g !== "code") md += `**${b.s}**\n\n`; continue; }
      const first = !prev || prev.g !== b.g || !b.g, last = !next || next.g !== b.g || !b.g;
      if (b.g === "code" && first) md += "````" + (prev && prev.g === "codeTitle" ? " title=" + prev.s : "") + "\n";
      if (b.g === "box" && first) md += "[박스]\n";
      md += b.s;
      if (b.g === "code" && last) md += "\n````";
      md += last ? "\n\n" : "\n";
    }
    return { md: md.trim() + "\n", assets, report };
  }

  window.docxToMd = docxToMd;
})();
