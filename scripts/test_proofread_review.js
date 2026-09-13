'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function(sandbox) {
  const policy = sandbox.P8Review;
  const typo = {type:'오탈자',source:'surface',ruleId:'typo:1',found:'을를',page:1,start:1};
  assert.equal(policy.classify(typo,'책을를 읽었다.').level, 'correction');
  assert.equal(policy.classify({...typo,start:2}, '"책을를"은 잘못된 예시다.').level,'review');
  assert.equal(policy.classify({type:'맞춤법',source:'surface',ruleId:'맞춤법:됬',found:'됬',start:0},'됬다는 잘못된 표기다.').level,'correction');
  assert.equal(policy.classify({...typo,source:'ai'}).level, 'review');
  assert.equal(policy.classify(typo,'책을 읽었다.').level, 'review');
  for (const type of ['문체불일치','이중수동','중복군더더기','윤문필요','번역체'])
    assert.equal(policy.classify({type,severity:'high'}).level,'style');
  const settings=policy.empty(), once=new Set();
  settings.documents.bookA=[policy.signature(typo)];
  assert(policy.allowed(typo,settings,'bookA',once));
  assert(!policy.allowed(typo,settings,'bookB',once));
  assert(!policy.allowed({...typo,ruleId:'different'},settings,'bookA',once));
  once.add(policy.occurrence(typo));
  assert(policy.allowed(typo,settings,'bookB',once));
  assert(!policy.allowed({...typo,start:9},settings,'bookB',once));
  settings.terms=['파이토치'];
  assert(policy.allowed({type:'맞춤법',found:'파이토치'},settings,'bookB',new Set()));
  assert(!policy.allowed({type:'사실오류',found:'파이토치'},settings,'bookB',new Set()));
  assert(!policy.allowed({type:'맞춤법',found:'파이토치 오류'},settings,'bookB',new Set()));
  for (const raw of ['null','{','[]','{"documents":{"x":null},"terms":4}']) assert(policy.parse(raw).terms);
  const prose=policy.proseOnly('본문이다.\n> 안녕하세요.\n```\n코드입니다.\n```\n“인용해요.”\n표 1 예시입니다.');
  assert(prose.includes('본문이다.'));assert(!/안녕하세요|코드입니다|인용해요|예시입니다/.test(prose));

  // Instrument only the VM copy: production script does not expose mutable state.
  let code=fs.readFileSync(path.join(__dirname,'../panels/panel8/panel8.js'),'utf8');
  const end=code.lastIndexOf('})();');
  code=code.slice(0,end)+`window.__reviewTest={checkSurface,_checkStyleConsistency,getCtx,p8_filterByTypes,p8_applyFilters,
    filters(){return {currentSev,activeResolvedFilter};},
    staleFilters(){currentSev='high';activeResolvedFilter='resolved';},
    set(issues){allIssues=issues;currentFileKey='test-book';resolvedIndices.clear();_ignoredOnce.clear();_reviewSettings=P8Review.empty();},
    resolve(i){resolvedIndices.add(i);},corrections:_getCorrections};\n`+code.slice(end);
  vm.runInContext(code,sandbox);
  const test=sandbox.__reviewTest;
  for (const word of ['차이가','나이가','고양이가','종이가','어린이가','먹이가','높이가','길이가','사이가','철수가이']) {
    const text=word+' 달라 보이는 이유를 지금부터 자세하게 설명하겠습니다.';
    assert(!test.checkSurface({pages:[{page:1,text}]}).some(i=>i.type==='오탈자' && /이가|가이/.test(i.found)),word+' must not be a particle typo');
  }
  const duplicate='늦잠을 잔 학생이가 서둘러 교실로 들어왔다.';
  for (const word of ['사과와','결과와','학과와']) {
    const text=word+' 관련된 내용을 자세하게 정리해서 설명합니다.';
    assert(!test.checkSurface({pages:[{page:1,text}]}).some(i=>i.type==='오탈자' && i.found==='과와'),word+' is a normal noun and particle');
  }
  assert(test.checkSurface({pages:[{page:1,text:duplicate}]}).some(i=>i.found==='이가'),'Keep clear subject particle errors');
  const duplicateObject='이 책을를 처음부터 끝까지 차분하게 읽어보세요.';
  const objectIssue=test.checkSurface({pages:[{page:1,text:duplicateObject}]}).find(i=>i.found==='을를');
  assert(objectIssue.suggestion.startsWith('→ "을"'),'Replacement must not duplicate preceding noun');
  // Persistent DOM stubs let the real card handler and list rendering run together.
  const originalGet=sandbox.document.getElementById;
  const elements=new Map();
  sandbox.document.getElementById=id=>{if(!elements.has(id)) elements.set(id,originalGet(id));return elements.get(id);};
  const element=id=>sandbox.document.getElementById(id);
  test.set([
    {...typo,review:{level:'correction'},suggestion:'을'},
    {...typo,start:8,source:'ai',severity:'low',review:{level:'review'},suggestion:'를'},
    {type:'오탈자',found:'예시',start:12,severity:'medium',review:{level:'style'},suggestion:'예'}
  ]);
  element('p8_reviewMode').value='correction';element('p8_searchInp').value='검색에 없는 문구';
  test.staleFilters();test.p8_filterByTypes(['오탈자']);
  assert.equal(element('p8_reviewMode').value,'all');assert.equal(element('p8_searchInp').value,'');
  assert.equal(test.filters().currentSev,'all');assert.equal(test.filters().activeResolvedFilter,null);
  assert.equal(element('p8_resultCount').textContent,'3건 표시');
  assert(element('p8_catGrid').innerHTML.includes('3건'));
  sandbox.p8_allowIssue(0,'once');
  assert.equal(element('p8_resultCount').textContent,'2건 표시');
  assert(element('p8_catGrid').innerHTML.includes('2건'),'Card counts must update after ignoring an issue');
  sandbox.document.getElementById=originalGet;
  const mixed=Array.from({length:3},(_,n)=>({page:n+1,text:'필자는 과거에 실험했다. 독자는 결과를 확인한다. 필자는 사례를 봤다. 독자는 원리를 이해한다. '.repeat(5)}));
  const styleIssues=[];test._checkStyleConsistency({pages:mixed},styleIssues);
  assert(!styleIssues.some(i=>/시제 혼용|인칭 혼용/.test(i.description)));
  const positives=['이 책을를 처음부터 끝까지 차분히 읽어보세요.','사과와과 배를 곁들여 아침으로 다 같이 먹었다.'];
  for (const text of positives) {
    const hits=test.checkSurface({pages:[{page:1,text}]});
    assert(hits.some(i=>policy.classify(i,text).level==='correction'));
  }
  const accepted={...typo,suggestion:'을'};test.set([accepted]);test.resolve(0);
  assert.equal(test.corrections().length,1);
  sandbox.p8_allowIssue(0,'document');assert.equal(test.corrections().length,0,'An ignored issue must never rewrite the manuscript');
  test.set([{...accepted,start:1},{...accepted,start:9}]);test.resolve(0);
  sandbox.p8_allowIssue(1,'once');assert.equal(test.corrections().length,0,'Global replacement must not overwrite an excluded duplicate');
  assert(test.getCtx('처음 오류 다음 오류','오류',3,9).before.includes('다음'));
  assert(sandbox.FULL_RULES_MD.includes('사용 비율만으로 수정 대상을 정하지 않는다'));
  assert.equal(sandbox.EsHangul.hasBatchim('책'),true);
  assert.equal(sandbox.EsHangul.hasBatchim('사과'),false);
  assert.equal(sandbox.EsHangul.josa('서울','으로/로'),'서울로');
  console.log('PASS: review levels, source location, scoped exceptions, corrupt storage, dictionary scope, prose regions, mixed tense/person, genuine typos, ignored export, es-hangul');
};
