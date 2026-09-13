/* Korean editorial heuristics, not AI authorship detection. See AI_문체_교정_참고.md. */
(function(root) {
  'use strict';
  const TYPE = '상투적표현';
  const rules = [
    {id:'opening',label:'같은 문장 연결어 반복',pattern:/^(또한|더욱이|나아가|결론적으로|요약하자면)(?=[\s,])/,key:m=>m[1],
      suggestion:'각 문장이 앞 문장에 정보를 더하는지 확인하고, 불필요한 연결어만 줄일지 검토하세요.'},
    {id:'contrast',label:'대조 문형 반복',pattern:/단순(?:히|한)\s+[^.!?\n]{1,90}?(?:아니라|넘어)/,key:()=> 'contrast',
      suggestion:'각 문단에서 대조가 필요한지 확인하고, 일부 결론을 직접 서술할지 검토하세요.'},
    {id:'importance',label:'추상적인 중요성 강조 반복',pattern:/(?:중요한|핵심적인|중추적인)\s+역할을\s+(?:수행|담당|한다|합니다)/,key:()=> 'importance',
      suggestion:'반복되는 역할 설명을 확인하세요. 원고에 근거가 있는 기능만 구체적으로 쓰고 새 수치나 성과는 추가하지 마세요.'}
  ];
  const mask = text => text.replace(/[^\r\n]/g,' ');
  function prose(text) {
    return text.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*'/g,mask)
      .replace(/^.*(?:https?:\/\/|\|).*$/gm,mask)
      .replace(/^\s*(?:#{1,6}\s|>|[-*•]\s|\d+[.)]\s|\[\d+\]|(?:그림|표|주|각주)\s*\d).*$/gm,mask);
  }
  function check(extracted) {
    const issues=[];
    for(const page of extracted.pages || []) {
      if(typeof page.text!=='string') continue;
      const masked=prose(page.text), sentences=[];
      for(const m of masked.matchAll(/[^.!?\n]+[.!?]?/g)) {
        const leading=m[0].length-m[0].trimStart().length;
        const text=m[0].trim();
        // In PDF extraction, incomplete wrapped lines are not sentence evidence.
        if(text.length<12 || text.length>500 || !/[.!?]$/.test(text)) continue;
        sentences.push({text,start:m.index+leading});
      }
      for(const rule of rules) {
        let lastEnd=-1;
        for(let n=0;n<sentences.length;n++) {
          const first=sentences[n];
          if(first.start<=lastEnd) continue;
          const match=first.text.match(rule.pattern);
          if(!match) continue;
          const key=rule.key(match);
          // Bounded local window; frequency is only a review candidate, not an error verdict.
          const window=sentences.slice(n,n+5).filter(s=>s.start-first.start<=1800);
          const hits=window.filter(s=>{const m=s.text.match(rule.pattern);return m && rule.key(m)===key;});
          if(hits.length<3 || hits.length/window.length<0.6 || new Set(hits.map(s=>s.text)).size<3) continue;
          lastEnd=hits[hits.length-1].start;
          const locations=hits.map(s=>({page:page.page,start:s.start,found:page.text.slice(s.start,s.start+s.text.length)}));
          issues.push({type:TYPE,source:'surface',ruleId:'ko-style:'+rule.id,severity:'low',page:page.page,
            start:first.start,found:locations[0].found,suggestion:rule.suggestion,noAutoReplace:true,relatedLocations:locations,
            description:`${rule.label}: 인접 본문 ${window.length}문장 중 ${hits.length}문장. 의도적인 반복이면 유지하세요.`});
        }
      }
    }
    return issues;
  }
  root.P8KoreanStyle={check,prose,TYPE};
})(typeof window==='undefined'?globalThis:window);
