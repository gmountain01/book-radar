const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(/\/(?:api-keys|naver-speller-key)\.js$/.test(u.pathname))return r.fulfill({contentType:'text/javascript',body:''});
   return u.hostname==='127.0.0.1'?r.continue():r.abort();
  });
  await page.goto('http://127.0.0.1:8766/index.html');await page.locator('#tab8').click();
  await page.locator('#p8_fileInput').setInputFiles({name:'cached-110.txt',mimeType:'text/plain',buffer:Buffer.from('캐시 복원 회귀 검사를 위한 테스트 원고입니다.')});
  await page.evaluate(()=>{
   const f=document.getElementById('p8_fileInput').files[0];
   const fileKey=`${f.name}__${f.size}__${f.lastModified}`;
   const issues=Array.from({length:110},(_,i)=>({type:i<94?'비문':'윤문필요',source:'ai',severity:'medium',page:1,found:`검토문구${i}번`,suggestion:`수정문구${i}번`}));
   const text=issues.map(i=>i.found).join('\n');
   localStorage.setItem('pf_v3_'+fileKey,JSON.stringify({cachedAt:Date.now(),fileKey,filename:f.name,aiWasRun:true,
    extracted:{filename:f.name,total_pages:1,toc:[],isPdfFile:false,pages:[{page:1,text}]},surfaceIssues:[],structuralIssues:[],linguisticIssues:issues}));
   document.getElementById('p8_reviewMode').value='correction';
   document.getElementById('p8_searchInp').value='이전 검색';
   p8_setSev(document.querySelector('.sev-btn[data-sev="medium"]'));
  });
  await page.locator('#p8_btnStart').click();await page.locator('#p8_resultPanel').waitFor({state:'visible'});
  assert((await page.locator('#p8_step4-detail').innerText()).includes('캐시'),'Must actually use the cache');
  assert.equal(await page.locator('#p8_reviewMode').inputValue(),'all');
  assert.equal(await page.locator('#p8_searchInp').inputValue(),'');
  assert.equal(await page.locator('#p8_resultCount').innerText(),'110건 표시');
  assert.equal(await page.locator('#p8_issuesList .issue-card').count(),110);
  await page.getByRole('button',{name:'이번 항목 제외',exact:true}).first().click();
  assert.equal(await page.locator('#p8_issuesList .issue-card').count(),109);
  assert((await page.locator('#p8_reviewInfo').innerText()).includes('수정 권장 0 · 문맥 확인 93 · 선택적 윤문 16 · 허용/제외 1'));
  await page.locator('#p8_reviewMode').selectOption('correction');
  await page.locator('.sev-btn[data-sev="medium"]').click();
  assert.equal(await page.locator('#p8_resultCount').innerText(),'0건 표시');
  await page.getByRole('button',{name:'필터 해제 · 전체 109건 보기',exact:true}).click();
  assert.equal(await page.locator('#p8_issuesList .issue-card').count(),109);
  assert.deepEqual(errors,[]);
  const performanceResult=await page.evaluate(()=>{
   const first=document.querySelector('#p8_issuesList .issue-card');
   const start=performance.now();
   for(let i=0;i<20;i++)p8_applyFilters();
   return {elapsedMs:Math.round((performance.now()-start)*10)/10,sameNode:first===document.querySelector('#p8_issuesList .issue-card')};
  });
  assert(performanceResult.sameNode,'Unchanged results must preserve DOM nodes');
  await page.locator('#p8_issuesList .btn-resolve').first().click();
  await page.evaluate(()=>p8_applyFilters());
  assert.equal(await page.locator('#p8_issuesList .btn-resolve').first().innerText(),'해결됨','HTML reuse must preserve changed resolve state');
  await page.locator('#p8_issuesList .issue-card').last().scrollIntoViewIfNeeded();
  assert(await page.locator('#p8_issuesList .issue-card').last().isVisible(),'Last proposal remains accessible');
  console.log('PERF: 20 unchanged filters on 109 visible proposals:',performanceResult.elapsedMs,'ms');
  console.log('PASS cached 110 proposals: real cache restore resets stale filters, 110 rendered, ignored ->109, screenshot counts 0/93/16/1 reproduced, empty filter recovery renders all 109');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
