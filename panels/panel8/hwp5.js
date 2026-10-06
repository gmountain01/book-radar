/* HWP 5.x 본문 추출 — 의존성: XLSX.CFB(libs/xlsx.full.min.js), 브라우저 DecompressionStream.
 * 문단 텍스트만 순서대로 뽑는다(표 셀 문단 포함). 서식·이미지·각주 번호는 버린다.
 * 개요 문단은 Markdown 제목으로, 글머리 기호는 '- '로 바꾼다. 표는 셀 문단을 순서대로 늘어놓는다(표 구조는 버림).
 * 포맷 근거: 한컴 공개 HWP 5.0 문서 형식(레코드 헤더 tag 10bit·level 10bit·size 12bit, PARA_TEXT=67). */
(function (root) {
  'use strict';
  const HWPTAG_PARA_SHAPE = 25, HWPTAG_STYLE = 26, HWPTAG_PARA_HEADER = 66, HWPTAG_PARA_TEXT = 67;

  /** 스타일 이름 → 제목 수준(0 [파트] ~ 5 [소소]), 아니면 -1.
   *  출판사 서식은 스타일 이름이 '[장]'·'장제목'·'중제목'처럼 수준을 말해 준다. HWP·HWPX·DOCX 공용.
   *  'Heading 1'·'제목 1'처럼 숫자만 있는 이름은 수준을 알 수 없어 -1(워드 기본 제목은 mammoth가 처리). */
  function styleLevel(name) {
    const s = String(name || '').toLowerCase().replace(/[\[\]()\s_.\-·0-9]/g, '').replace(/(제목|타이틀|title|heading)$/, '');
    const lv = { '파트': 0, 'part': 0, '장': 1, 'chapter': 1, '절': 2, '중': 3, '소': 4, '소소': 5 }[s];
    return lv === undefined ? -1 : lv;
  }
  // 제어 문자: 1글자짜리(0,10,13,24~31) 외에는 8 WCHAR(16바이트)를 차지한다
  const ONE_WCHAR = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

  // Chrome은 압축 끝 뒤에 남은 바이트를 오류로 던진다(HWP 섹션에 흔함) — 그때까지 풀린 데이터만 쓴다
  async function inflateRaw(bytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); total += value.length;
      }
    } catch (e) {
      if (!total) throw e;
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  function paraText(bytes, off, size) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + off, size);
    let out = '';
    for (let i = 0; i + 1 < size;) {
      const c = view.getUint16(i, true);
      if (c < 32) {
        if (c === 10) out += '\n';
        else if (c === 9) out += '\t'; // 탭은 8 WCHAR 인라인 제어지만 공백으로 살린다
        i += ONE_WCHAR.has(c) ? 2 : 16;
        continue;
      }
      out += String.fromCharCode(c);
      i += 2;
    }
    return out;
  }

  function* records(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let p = 0; p + 4 <= bytes.length;) {
      const h = dv.getUint32(p, true);
      const tag = h & 0x3ff, level = (h >>> 10) & 0x3ff;
      let size = h >>> 20;
      p += 4;
      if (size === 0xfff) { size = dv.getUint32(p, true); p += 4; }
      yield { tag, level, off: p, size };
      p += size;
    }
  }

  async function extractParagraphs(arrayBuffer) {
    const XLSX = root.XLSX;
    if (!XLSX || !XLSX.CFB) throw new Error('XLSX.CFB(libs/xlsx.full.min.js)가 필요합니다');
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 해제(DecompressionStream)를 지원하지 않습니다');
    const cfb = XLSX.CFB.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const header = XLSX.CFB.find(cfb, 'Root Entry/FileHeader');
    if (!header) throw new Error('HWP 5.x 파일이 아닙니다 (FileHeader 없음)');
    const flags = new DataView(Uint8Array.from(header.content).buffer).getUint32(36, true);
    if (flags & 0x2) throw new Error('암호가 걸린 HWP 파일은 읽을 수 없습니다');
    if (flags & 0x4) throw new Error('배포용 HWP 파일은 읽을 수 없습니다 — 한글에서 HWPX나 DOCX로 저장해 주세요');
    const compressed = !!(flags & 0x1);
    const stream = async name => {
      const entry = XLSX.CFB.find(cfb, 'Root Entry/' + name);
      if (!entry) return null;
      const bytes = Uint8Array.from(entry.content);
      return compressed ? inflateRaw(bytes) : bytes;
    };
    // 문단 모양(PARA_SHAPE) 속성1: bit 23~24 = 제목 종류(1=개요), bit 25~27 = 수준(0~6)
    // → 개요 문단은 Markdown 제목(#~######)으로. 스타일 이름이 출판사마다 달라도 동작한다.
    // 스타일(STYLE) 이름이 수준을 말하면 그것이 우선 — 개요 설정 없이 스타일만 입힌 원고도 읽는다
    const outlineLevel = [], styleLv = [];
    const docInfo = await stream('DocInfo');
    if (docInfo) {
      const dv = new DataView(docInfo.buffer, docInfo.byteOffset, docInfo.byteLength);
      const wstr = p => { const n = dv.getUint16(p, true); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(p + 2 + i * 2, true)); return [s, p + 2 + n * 2]; };
      for (const r of records(docInfo)) {
        if (r.tag === HWPTAG_PARA_SHAPE) {
          const a = dv.getUint32(r.off, true);
          outlineLevel.push(((a >>> 23) & 3) === 1 ? (a >>> 25) & 7 : -1);
        } else if (r.tag === HWPTAG_STYLE) { // 한글 이름, 영문 이름
          try {
            const [ko, p] = wstr(r.off), [en] = wstr(p);
            if (p + 2 > r.off + r.size) throw new RangeError('STYLE 레코드 잘림');
            styleLv.push(styleLevel(ko) >= 0 ? styleLevel(ko) : styleLevel(en));
          } catch (e) { styleLv.push(-1); } // DocInfo가 일부만 풀린 경우 — 스타일 수준 없이 계속(개요 수준은 그대로)
        }
      }
    }
    let styled = false;
    const paras = [];
    for (let s = 0; ; s++) {
      const bytes = await stream('BodyText/Section' + s);
      if (!bytes) break;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let level = -1;
      for (const r of records(bytes)) {
        if (r.tag === HWPTAG_PARA_HEADER) { // +8 문단 모양 ID, +10 스타일 ID
          const sl = styleLv[dv.getUint8(r.off + 10)] ?? -1;
          if (sl >= 0) styled = true;
          level = sl >= 0 ? sl : outlineLevel[dv.getUint16(r.off + 8, true)] ?? -1;
        }
        if (r.tag !== HWPTAG_PARA_TEXT) continue;
        let t = paraText(bytes, r.off, r.size).replace(/\s+$/, '');
        if (level >= 0 && t.trim()) t = '#'.repeat(Math.min(level + 1, 6)) + ' ' + t.trim();
        else t = t.replace(/^(\s*)[•·▪◦●○■□]\s*/, '$1- ');
        paras.push(t);
      }
    }
    if (!paras.length) throw new Error('HWP 본문을 찾지 못했습니다');
    paras.depthIsLevel = styled; // 이름으로 수준을 정했으면 # 개수 = 수준+1 ([파트] #, [장] ## …)
    return paras;
  }

  root.P8Hwp5 = { extractParagraphs, styleLevel };
})(typeof window !== 'undefined' ? window : globalThis);
