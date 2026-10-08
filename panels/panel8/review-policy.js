/* Conservative review policy. Original project code; not an automatic rewriter. */
(function(root) {
  'use strict';
  const STYLE = new Set(['단어반복','이중수동','중복군더더기','접속사중복','한자남용',
    'AI투','번역체','일본식표현','수동태과용','윤문필요','문체불일치','문단연결불량']);
  const SPELL = new Set(['오탈자','맞춤법','띄어쓰기','외래어표기오류','불필요한공백']);
  const LABELS = { correction:'수정 권장', review:'문맥 확인 필요', style:'선택적 윤문', layout:'조판·추출 확인', extract:'추출 영향' };
  // PDF 조판 경계(page.joins, panel8 ①)와 겹치는 지적의 분류(②). 근거가 공백·인접에 있는 유형만 본다 — 글자 자체가 근거인
  // 오탈자·맞춤법·문장 단위 지적은 경계에 걸쳐도 그대로 둔다. 위치를 하나로 정할 수 없으면 분류를 바꾸지 않는다.
  const EDGE_TYPES = new Set(['띄어쓰기','불필요한공백','단어반복']);
  const EDGE_LEVELS = new Set(['layout','extract']);
  const KIND_KO = { gap:'조각 간격으로 넣은 공백', sp:'줄 연결 때 넣은 공백', none:'줄을 공백 없이 붙인 자리', ws:'PDF 공백 조각' };
  function edgeOf(issue, pageText, joins) {
    if (!Array.isArray(joins) || !joins.length || !EDGE_TYPES.has(issue.type) || !issue.found || typeof pageText !== 'string') return null;
    const found = issue.found, len = found.length;
    let spans = [];
    if (Number.isInteger(issue.start) && pageText.slice(issue.start, issue.start + len) === found) spans = [[issue.start, issue.start + len]];
    else { let i = pageText.indexOf(found); while (i >= 0 && spans.length < 50) { spans.push([i, i + len]); i = pageText.indexOf(found, i + 1); } }
    if (!spans.length) return null;
    const hits = ([a, b]) => joins.filter(j => j.kind === 'none' ? (j.pos > a && j.pos < b) : (j.pos >= a && j.pos < b));
    const hs = spans.map(hits);
    if (spans.length > 1) { // 같은 문구가 여러 곳: 전부 경계에 걸칠 때만 확인 대상, 아니면 판정 보류(분류 유지)
      if (hs.every(h => h.length)) return { level:'layout', reason:'같은 문구가 여러 곳에 있고 모두 PDF 줄 연결·공백 삽입 지점에 걸칩니다. 조판 때문인지 원문을 확인하세요.' };
      return hs.some(h => h.length) ? { ambiguous:true } : null;
    }
    const h = hs[0];
    if (!h.length) return null;
    const kinds = [...new Set(h.map(j => j.kind))];
    // 확정 근거가 있는 경우만 '추출 영향': 지적한 겹친 공백이 줄 연결 때 프로그램이 넣은 공백을 포함할 때
    if (issue.type === '불필요한공백' && h.some(j => j.kind === 'sp')) return { level:'extract', reason:'겹친 공백 중 하나는 PDF 줄 연결 때 프로그램이 넣은 것입니다. 원고 오류로 세지 않습니다(확인용으로 표시).' };
    return { level:'layout', reason:'PDF ' + kinds.map(k => KIND_KO[k] || k).join('·') + '에 걸친 지적입니다. 조판 줄바꿈·추출 때문인지 원문을 확인하세요.' };
  }
  function proseOnly(text) {
    // Preserve line boundaries; quoted examples and code do not establish body style.
    return String(text || '').replace(/```[\s\S]*?```/g, '\n')
      .replace(/`[^`\n]*`/g, '').replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g, '')
      .split('\n').filter(line => !/^\s*(?:>|#{1,6}\s|\||(?:그림|표)\s*\d)/.test(line)).join('\n');
  }
  function classify(issue, pageText, joins) {
    let level = STYLE.has(issue.type) ? 'style' : 'review';
    let reason = level === 'style' ? '문체·표현 선택에 관한 제안입니다.' : '문맥과 원문을 확인한 뒤 판단하세요.';
    if (issue.source === 'surface' && issue.ruleId && (issue.type === '오탈자' || ['맞춤법:됬','맞춤법:촛점','맞춤법:안됀다','맞춤법:그럴려고','맞춤법:버틸려고','맞춤법:덮히다'].includes(issue.ruleId))) {
      level = 'correction'; reason = '명시적인 오타 규칙에 일치합니다. 원문을 확인하세요.';
    }
    if (typeof pageText === 'string' && issue.found && !pageText.includes(issue.found)) {
      level = 'review'; reason = '추출된 원문에서 같은 문구를 찾지 못했습니다. 조판 원문 확인이 필요합니다.';
    }
    if (level === 'correction' && typeof pageText === 'string' && issue.found) {
      const offset = Number.isInteger(issue.start) ? issue.start : pageText.indexOf(issue.found);
      const masked = pageText.replace(/```[\s\S]*?```|`[^`\n]*`|“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g, x => ' '.repeat(x.length));
      if (offset >= 0 && masked.slice(offset,offset + issue.found.length) !== issue.found) {
        level = 'review'; reason = '인용·코드 안의 표현입니다. 예시인지 실제 오류인지 확인하세요.';
      }
    }
    const e = edgeOf(issue, pageText, joins);
    if (e && e.level) return { level:e.level, label:LABELS[e.level], reason:e.reason, edge:e.level };
    if (e && e.ambiguous) reason += ' 같은 문구 일부가 PDF 줄 연결 지점에 걸쳐 있어 위치를 특정하지 못했습니다.';
    return { level, label:LABELS[level], reason, edge:e && e.ambiguous ? 'ambiguous' : null };
  }
  const isEdgeLevel = level => EDGE_LEVELS.has(level);
  const ruleKey = issue => String(issue.ruleId || issue.type || 'unknown');
  const signature = issue => JSON.stringify([ruleKey(issue), String(issue.found || '')]);
  const occurrence = issue => JSON.stringify([signature(issue), issue.page, issue.start ?? issue.reviewId ?? null]);
  function empty() { return { common:[], documents:{}, terms:[], documentTerms:{} }; }
  function parse(raw) {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return empty();
      const strings = x => Array.isArray(x) ? x.filter(v => typeof v === 'string').slice(0,500) : [];
      const maps = x => Object.fromEntries(Object.entries(x && typeof x === 'object' && !Array.isArray(x) ? x : {})
        .slice(0,100).map(([key,value]) => [key,strings(value)]));
      // 원고별 허용·용어는 파일 이름으로 묶는다. 예전 버전은 '이름__크기__수정시각'으로 묶어 원고를 고쳐 올리면 허용이 사라졌다 → 이름 키로 합친다
      const byName = m => { const out = {}; for (const [k, v] of Object.entries(m)) { const name = k.replace(/__\d+__\d+$/, ''); out[name] = [...new Set((out[name] || []).concat(v))]; } return out; };
      return {common:strings(data.common), documents:byName(maps(data.documents)), terms:strings(data.terms), documentTerms:byName(maps(data.documentTerms))};
    } catch (_) { return empty(); }
  }
  function termsFor(settings, file) {
    return [...new Set(settings.terms.concat(Object.hasOwn(settings.documentTerms,file) ? settings.documentTerms[file] : []))];
  }
  function allowed(issue, settings, file, once) {
    if (once.has(occurrence(issue))) return true;
    const key = signature(issue);
    if (settings.common.includes(key) || (Object.hasOwn(settings.documents,file) && settings.documents[file].includes(key))) return true;
    // A dictionary entry never hides a factual, grammatical or whole-sentence issue.
    return SPELL.has(issue.type) && termsFor(settings,file).includes(String(issue.found || '').trim());
  }
  root.P8Review = {classify, proseOnly, signature, occurrence, empty, parse, allowed, termsFor, labels:LABELS, edgeOf, isEdgeLevel};
})(typeof window === 'undefined' ? globalThis : window);
