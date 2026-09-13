'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',style:{},scrollTop:0,handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(k,fn){this.handlers[k]=fn;},querySelectorAll(){return [];},querySelector(){return null;}});return elements.get(id);}
let pinned=null;const timers=new Map();let timerId=0;
const c={console,document:{getElementById:el},PanelRegistry:{register(){}},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},isInBoard(){return false;},addToPlanningBoard(item){pinned=item;},showToast(){}};c.window=c;vm.createContext(c);
const root=path.join(__dirname,'..');
for(const file of ['data/rss/feeds.js','data/rss/archive.js','panels/panel23/panel23.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
const list=el('p23_feedList'),count=()=> (list.innerHTML.match(/class="p23-feed-card"/g)||[]).length;
assert.equal(count(),50);
const total=parseInt(el('p23_resultCount').textContent);assert(total>50);
assert(list.innerHTML.includes('p23_feedPage(1)'));
c.p23_feedPage(1);assert.equal(count(),50);assert(list.innerHTML.includes('p23_pinFeedItem(50)'));
c.p23_pinFeedItem(50);assert(pinned);assert(list.innerHTML.includes(pinned.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')));
c.p23_feedPage(Math.ceil(total/50)-1);assert.equal(count(),total%50||50);
c.p23_pinFeedItem(total-1);const last=pinned.title;
const search=el('p23_search');search.value=last;search.handlers.input({isComposing:true});assert.equal(timers.size,0);
search.handlers.compositionend({});assert.equal(timers.size,1);for(const fn of timers.values()){timers.clear();fn();}
assert(count()>0 && count()<=50,'Search must reach articles beyond the first page');
search.value='__no_matching_article_90873__';search.handlers.input({});for(const fn of timers.values()){timers.clear();fn();}assert.equal(count(),0);assert(list.innerHTML.includes('검색 결과 없음'));
search.value='';search.handlers.input({});for(const fn of timers.values()){timers.clear();fn();}assert.equal(count(),50);assert.equal(parseInt(el('p23_resultCount').textContent),total);
console.log('PASS: market feed '+total+' articles; 50 cards/page; pagination, pin indices, full-data search, IME, empty results, reset');
