// Browser-only Git sync feedback checks. Fetch is mocked; no Git/GitHub writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');

const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body style="min-height:2200px">
<button id="btn-sync">同步 GitHub</button><span id="git-sync-status"></span><button id="load-project-courses" hidden></button>
<input id="doc-name" value="本机新课程"><input id="doc-subtitle" value="副标题"><input id="doc-equipment" value="设备">
<div contenteditable id="doc-objectives"><b>本机目标</b></div><div contenteditable id="doc-procedure">步骤</div>
<script>
window.data = {inspire:[],explorer:[{name:'旧课程',objectives:'旧目标',procedure:'旧步骤',extra:'保留字段'}],explorer2:[],challenge:[]};
window.docContext={cat:'explorer',index:0};window.localSavePending=true;window.courseDataConflict=false;
window.nativeSetTimeout=window.setTimeout;window.setTimeout=(callback,delay,...args)=>nativeSetTimeout(callback,window.fastTimers&&(delay===15000||delay===240000)?40:delay,...args);
window.serverSaveQueue=Promise.resolve();window.toasts=[];window.requests=[];window.fetchMode='success';window.statusMode='current';
window.saveData=()=>{if(window.saveFails)throw Error('quota');localStorage.setItem('makex_data',JSON.stringify(data));localSavePending=true;};
window.saveDocumentData=()=>{if(window.saveFails)throw Error('quota');const c=data.explorer[0];['name','subtitle','equipment','objectives','procedure'].forEach(k=>{const e=document.getElementById('doc-'+k);c[k]=k==='objectives'||k==='procedure'?e.innerHTML:e.value;});saveData();};
window.showToast=message=>toasts.push(message);window.tr=()=> '同步 GitHub';window.updateCounts=()=>{};
window.fetch=async(url,options={})=>{
  requests.push({url,body:options.body,headers:options.headers});
  const response=(result,status=200)=>new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});
  if(url.endsWith('/git-sync/status')){
    if(statusMode==='offline')throw TypeError('Failed to fetch');
    if(statusMode==='old')return new Response('<html>old server</html>');
    return response({ok:true,version:'2026-11-04.sync2',directory:'C:\\课程文件夹'});
  }
  if(fetchMode==='auth')return response({ok:false,code:'GITHUB_AUTH_REQUIRED',error:'Git authentication failed',backup:'.makex-backups/example.json'},500);
  if(fetchMode==='invalid')return new Response('<html>old</html>');
  if(fetchMode==='offline')throw TypeError('Failed to fetch');
  if(fetchMode==='timeout')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
  if(fetchMode==='deferred')return new Promise(resolve=>window.completeRequest=()=>resolve(response({ok:true,commit:'1234567abcdef'})));
  if(fetchMode==='setup' && !options.headers['X-MakeX-Confirm-Setup'])return response({code:'SYNC_SETUP_REQUIRED',setup:{remoteCommit:'a'.repeat(40),localCounts:{inspire:0,explorer:37,explorer2:15,challenge:0},remoteCounts:{inspire:0,explorer:36,explorer2:15,challenge:0},repository:'caoweiming111-web/ChatGPT-caoweiming'}},409);
  if(fetchMode==='setup-changed'){
    if(!options.headers['X-MakeX-Confirm-Setup']||options.headers['X-MakeX-Confirm-Setup']==='a'.repeat(40))return response({code:'SYNC_SETUP_REQUIRED',setup:{remoteCommit:options.headers['X-MakeX-Confirm-Setup']?'b'.repeat(40):'a'.repeat(40),localCounts:{explorer:37},remoteCounts:{explorer:38}}},409);
  }
  return response({ok:true,commit:'abcdef123456789',managedRepository:true});
};
</script><script src="/git-sync-client.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/git-sync-client.js' ? 'text/javascript;charset=utf-8' : 'text/html;charset=utf-8');
  res.end(req.url === '/git-sync-client.js' ? fs.readFileSync(path.join(__dirname, '..', 'git-sync-client.js')) : fixture);
});
async function main() {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function fresh(mode = 'success') { await page.goto('http://127.0.0.1:' + server.address().port); await page.evaluate(mode => { fetchMode=mode; }, mode); }
  async function start() { await page.evaluate(() => { window.syncJob=syncToGitHub(); }); }
  async function done() { await page.evaluate(() => syncJob); }
  const message = page.locator('#git-sync-message');
  try {
    await fresh(); await page.evaluate(() => scrollTo(0,1800)); await start(); await done();
    assert.equal(await page.locator('#git-sync-dialog').evaluate(el=>el.open), true);
    assert.match(await message.textContent(), /已上传 GitHub.*abcdef1/);
    assert.match(await message.textContent(), /今后可直接/);
    assert.match(await page.locator('#git-sync-location').textContent(), /当前本地服务目录/);
    assert.equal(await page.locator('#btn-sync').isDisabled(), false);
    assert.equal(await page.evaluate(() => localSavePending), false);
    assert.equal(await page.evaluate(() => JSON.parse(requests.find(r=>r.url==='/git-sync').body).explorer[0].name), '本机新课程');
    console.log('PASS visible progress/success, directory, commit, and click-time editor snapshot');

    await fresh('auth'); await page.evaluate(() => { courseDataConflict=true; document.getElementById('load-project-courses').hidden=false; }); await start(); await done();
    assert.match(await message.textContent(), /GitHub 登录/);
    assert.match(await page.locator('#git-sync-error').textContent(), /GITHUB_AUTH_REQUIRED[\s\S]*example.json/);
    assert.equal(await page.evaluate(() => courseDataConflict && localSavePending), true);
    assert.equal(await page.locator('#load-project-courses').isHidden(), false);
    await page.evaluate(() => document.getElementById('doc-name').value='失败后尚未保存的课程');
    let downloadEvent = page.waitForEvent('download'); await page.locator('#git-sync-backup').click();
    let download = await downloadEvent;
    let backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.explorer[0].name, '失败后尚未保存的课程'); assert.equal(backup.explorer[0].extra, '保留字段');
    console.log('PASS actionable GitHub error/code, conflict protection, and current-course JSON backup');

    await fresh(); await page.evaluate(() => {saveFails=true;document.getElementById('doc-name').value='浏览器已满时的编辑';}); await start(); await done();
    assert.match(await page.locator('#git-sync-error').textContent(), /LOCAL_SAVE_FAILED/);
    assert.equal(await page.evaluate(() => requests.length), 0);
    downloadEvent=page.waitForEvent('download'); await page.locator('#git-sync-backup').click(); download=await downloadEvent;
    backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.explorer[0].name,'浏览器已满时的编辑');
    console.log('PASS backup captures unsaved editor even when browser storage fails; no upload attempted');

    await fresh('deferred'); await start(); await page.waitForFunction(() => typeof completeRequest==='function');
    await page.locator('#git-sync-close').click();
    await page.locator('#doc-name').fill('同步期间新修改');
    await page.evaluate(() => {saveDocumentData();completeRequest();});await done();
    assert.equal(await page.locator('#git-sync-dialog').evaluate(el=>el.open),false);
    assert.equal(await page.evaluate(() => localSavePending && localStorage.getItem('makex_pending_save')==='1'),true);
    assert.equal(await page.evaluate(() => data.explorer[0].name),'同步期间新修改');
    assert.equal(await page.evaluate(() => JSON.parse(requests.find(r=>r.url==='/git-sync').body).explorer[0].name),'本机新课程');
    assert.match(await message.textContent(), /下次上传/);assert.ok(await page.evaluate(() => toasts.length));
    console.log('PASS editable page during upload; later edits remain pending without redrawing the editor');

    await fresh('setup');await start();await page.locator('#git-sync-confirm').waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => requests.filter(r=>r.url==='/git-sync').length),1);
    assert.match(await page.locator('#git-sync-setup').textContent(), /37.*36/);
    await page.evaluate(() => document.getElementById('doc-name').value='确认期间新修改');
    await page.locator('#git-sync-confirm').click();await done();
    const posts=await page.evaluate(() => requests.filter(r=>r.url==='/git-sync'));
    assert.equal(posts.length,2);assert.equal(posts[1].headers['X-MakeX-Confirm-Setup'],'a'.repeat(40));assert.equal(posts[1].body,posts[0].body);
    assert.equal(await page.evaluate(() => localSavePending),true);
    console.log('PASS first ZIP sync shows exact local/remote counts and requires explicit snapshot confirmation');

    await fresh('setup-changed');await start();await page.locator('#git-sync-confirm').waitFor({state:'visible'});await page.locator('#git-sync-confirm').click();
    await page.waitForFunction(()=>document.getElementById('git-sync-error').textContent.includes('b'.repeat(40)));
    assert.equal(await page.evaluate(() => requests.filter(r=>r.url==='/git-sync').length),2);
    await page.locator('#git-sync-close').click();await done();
    assert.equal(await page.evaluate(() => localSavePending),true);
    assert.match(await message.textContent(), /尚未上传/);
    console.log('PASS changed remote requires a new confirmation; cancel does not upload');

    await fresh();await page.evaluate(()=>statusMode='old');await start();await done();
    assert.match(await message.textContent(),/本地服务器仍是旧版/);
    assert.equal(await page.evaluate(()=>requests.some(r=>r.url==='/git-sync')),false);
    await fresh();await page.evaluate(()=>statusMode='offline');await start();await done();
    assert.match(await message.textContent(),/先运行/);
    assert.equal(await page.evaluate(()=>requests.some(r=>r.url==='/git-sync')),false);
    console.log('PASS old/missing server detected before any upload');

    await fresh();await page.evaluate(()=>{fastTimers=true;serverSaveQueue=new Promise(()=>{});});await start();await done();
    assert.match(await page.locator('#git-sync-error').textContent(),/SAVE_QUEUE_TIMEOUT/);
    assert.equal(await page.evaluate(()=>requests.length),0);
    await fresh('timeout');await page.evaluate(()=>fastTimers=true);await start();await done();
    assert.match(await page.locator('#git-sync-title').textContent(),/尚未确认/);
    assert.match(await message.textContent(),/服务器可能仍在处理/);
    assert.equal(await page.evaluate(()=>localSavePending),true);
    console.log('PASS bounded save queue and uncertain-outcome network timeout with backups available');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); server.close(); }
}
main().catch(error => {console.error(error);server.close();process.exitCode=1;});
