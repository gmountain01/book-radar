// Run: node scripts/test_author_search.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const elements = Object.fromEntries(['p24Content','p24-list-results','p24-filter-count','p24-track-results'].map(id => [id, {innerHTML:'',textContent:''}]));
const scripts = [], notices = [], timers = new Map();
let nextTimer = 0;
const ctx = {
  console, document: {
    getElementById: id => elements[id] || null,
    createElement: () => ({setAttribute(){},remove(){this.removed=true;}}),
    head: {appendChild: s => scripts.push(s)}
  },
  setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},
  clearTimeout(id){timers.delete(id);},
  escHtml: s => String(s), isInBoard: () => false,
  showToast: s => notices.push(s)
};
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['shared/router.js','panels/panel24/panel24.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
}
ctx._AUTHORS_DATA = {authors:[{name:'테스트',pubs:['출판사'],books:[{title:'테스트 도서',bestRank:1,days:1}],count:1,bestRank:1,totalDays:1}],totalBooks:1};
vm.runInContext('PanelRegistry.onActivate(24)',ctx);
const original = elements.p24Content.innerHTML;
ctx.p24_onSearch('없는검색어',true);
assert.equal(timers.size,0,'IME composition must not trigger rendering');
ctx.p24_onSearch('없는검색어',false);
const flush = () => {const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
flush();
assert.equal(elements.p24Content.innerHTML,original,'Search controls must retain their DOM');
assert(elements['p24-list-results'].innerHTML.includes('검색 결과 없음'));
ctx.p24_onSearch('테스트');flush();
assert(elements['p24-list-results'].innerHTML.includes('테스트 도서'));
ctx.p24_onTopicFilter('없는주제');
assert(elements.p24Content.innerHTML.includes('p24_onSearch'));
assert(elements.p24Content.innerHTML.includes('검색 결과 없음'));
ctx.p24_onTopicFilter('');
ctx.p24_trackSearch('테스트');
let sharedError;
ctx.loadYes24Archive(error=>{sharedError=error;});
assert.equal(scripts.length,1,'Concurrent consumers must share one script');
scripts[0].onerror();
assert(sharedError);
assert(scripts[0].removed);
assert(notices.at(-1).includes('다시 시도'));
ctx.p24_trackSearch('테스트');
assert.equal(scripts.length,2,'Failed request must be retryable');
ctx._YES24_ARCHIVE={snapshots:{'2026-09-01':[{title:'테스트 도서',author:'테스트',rank:1}]}};
scripts[1].onload();
assert(elements['p24-track-results'].innerHTML.includes('테스트 도서'),'Recovery must rebuild valid search index');
ctx.loadYes24Archive(()=>{});
assert.equal(scripts.length,2,'Loaded data must be reused');
delete ctx._YES24_ARCHIVE;
let timedOut=false;
ctx.loadYes24Archive(error=>{timedOut=!!error;});flush();
assert(timedOut && scripts[2].removed);
ctx.loadYes24Archive(()=>{});
assert.equal(scripts.length,4,'Timeout must be retryable');
scripts[3].onerror();
console.log('PASS: retained search controls, IME, empty filters, shared loading, error recovery, cache reuse, timeout retry');
