/* Conservative review policy. Original project code; not an automatic rewriter. */
(function(root) {
  'use strict';
  const STYLE = new Set(['단어반복','이중수동','중복군더더기','접속사중복','한자남용',
    'AI투','번역체','일본식표현','수동태과용','윤문필요','문체불일치','문단연결불량']);
  const SPELL = new Set(['오탈자','맞춤법','띄어쓰기','외래어표기오류','불필요한공백']);
  const LABELS = { correction:'수정 권장', review:'문맥 확인 필요', style:'선택적 윤문' };
  function proseOnly(text) {
    // Preserve line boundaries; quoted examples and code do not establish body style.
    return String(text || '').replace(/```[\s\S]*?```/g, '\n')
      .replace(/`[^`\n]*`/g, '').replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g, '')
      .split('\n').filter(line => !/^\s*(?:>|#{1,6}\s|\||(?:그림|표)\s*\d)/.test(line)).join('\n');
  }
  function classify(issue, pageText) {
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
    return { level, label:LABELS[level], reason };
  }
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
      return {common:strings(data.common), documents:maps(data.documents), terms:strings(data.terms), documentTerms:maps(data.documentTerms)};
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
  root.P8Review = {classify, proseOnly, signature, occurrence, empty, parse, allowed, termsFor, labels:LABELS};
})(typeof window === 'undefined' ? globalThis : window);
