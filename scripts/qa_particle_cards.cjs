const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(/\/(?:api-keys|naver-speller-key)\.js$/.test(url.pathname)) return route.fulfill({contentType:'text/javascript',body:''});
   return url.hostname==='127.0.0.1' ? route.continue() : route.abort();
  });
  await page.goto('http://127.0.0.1:8766/index.html');await page.locator('#tab8').click();
  await page.locator('#p8_fileInput').setInputFiles({name:'particle-qa.txt',mimeType:'text/plain',buffer:Buffer.from('차이가 생기는 이유를 자세하게 설명하는 글입니다.\n고양이가 종이가 놓인 책상 옆에서 잠을 자고 있습니다.\n사과와 배를 함께 준비해서 손님들에게 나누어 주었습니다.\n늦잠을 잔 학생이가 서둘러 교실로 들어왔다.\n이 책을를 처음부터 끝까지 차분하게 읽어보세요.\n')});
  await page.locator('#p8_btnStart').click();await page.locator('#p8_resultPanel').waitFor({state:'visible'});
  await page.locator('#p8_reviewMode').selectOption('style');
  await page.locator('#p8_searchInp').fill('없는검색문구');
  const card=page.locator('#p8_catGrid [data-cat-idx]').filter({hasText:'오탈자·표기'});
  const count=Number((await card.locator('.cat-count').innerText()).match(/\d+/)[0]);
  assert(count>=2);await card.click();
  assert.equal(await page.locator('#p8_reviewMode').inputValue(),'all');
  assert.equal(await page.locator('#p8_searchInp').inputValue(),'');
  assert.equal(await page.locator('#p8_resultCount').innerText(),count+'건 표시');
  await page.getByRole('button',{name:'이번 항목 제외',exact:true}).first().click();
  assert.equal(await card.locator('.cat-count').innerText(),(count-1)+'건');
  assert.equal(await page.locator('#p8_resultCount').innerText(),(count-1)+'건 표시');
  assert.deepEqual(errors,[]);
  console.log('PASS browser: uploaded particle manuscript, category click clears filters, card/list counts match, ignored counts update, no JS errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
