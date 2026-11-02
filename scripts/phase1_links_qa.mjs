const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage();
const feed=await (await page.request.get('http://127.0.0.1:8000/api/hackathons?limit=100')).json();
const event=feed.data.at(-1);
for(const path of [`/events/${event._id}?q=nonmatching`,`/?id=${event._id}&q=nonmatching`]){
 await page.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle'});
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');
 assert.equal(new URL(page.url()).pathname,'/');
 assert.equal(new URL(page.url()).searchParams.has('id'),false);
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.getByRole('dialog').count(),0);
}
await browser.close();console.log('Legacy path/id details outside current search open, close and remain closed after reload: PASS');
