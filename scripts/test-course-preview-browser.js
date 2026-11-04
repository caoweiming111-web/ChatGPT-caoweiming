// Real application smoke check with an isolated, disposable course copy.
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {spawn}=require('node:child_process');const {once}=require('node:events');const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const root=path.join(__dirname,'..'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'makex-preview-'));
 let child,browser;
 try{
 for(const file of ['server.js','sync-courses.js','index.html','course-preview.js','school-knowledge.js','course-images.js','git-sync-client.js','makex_data.json'])await fs.copyFile(path.join(root,file),path.join(dir,file));
 await fs.writeFile(path.join(dir,'start.js'),"const http=require('http');const original=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return original.apply(this,args)};require('./server');");
 child=spawn(process.execPath,['start.js'],{cwd:dir,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{let output='';const t=setTimeout(()=>reject(Error('startup timeout')),5000);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/TEST_PORT=(\d+)/);if(m){clearTimeout(t);resolve(m[1])}});child.on('exit',code=>{clearTimeout(t);reject(Error('server exited '+code))})});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // A stale/missing external module must no longer affect the standalone page.
 await page.route('**/course-preview.js',route=>route.fulfill({contentType:'application/javascript',body:'window.CoursePreview={summarize(){throw Error("stale external module")}}'}));
 await page.goto('http://127.0.0.1:'+port);await page.waitForFunction(()=>syncConnected&&window.CoursePreview);
 const response=await page.request.get('http://127.0.0.1:'+port+'/course-preview.js');assert.match(response.headers()['content-type'],/javascript/);
 await page.evaluate(()=>{const cat='explorer',index=data.explorer.findIndex(s=>/超声波传感器与小舵机/.test(s.name));openDocument(cat,Math.max(0,index));Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{window.previewBlob=await items[0].getType('image/png')}},configurable:true})});
 // Exercise the actual button's current-editor extraction and clipboard path.
 await page.locator('[onclick="generateImage()"]').click();await page.waitForFunction(()=>window.previewBlob);
 const clip=await page.evaluate(async()=>{const bitmap=await createImageBitmap(window.previewBlob);return {width:bitmap.width,height:bitmap.height,type:window.previewBlob.type}});
 assert.equal(clip.width,1000);assert.ok(clip.height>800);assert.equal(clip.type,'image/png');
 const all=await page.evaluate(()=>{
 const results=[];
 for(const cat of Object.keys(data))for(let i=0;i<data[cat].length;i++){
 const c=data[cat][i];if(!c.name)continue;
 const decode=html=>{const d=document.createElement('div');d.innerHTML=(html||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(div|p|li)>/gi,'\n');return d.textContent};
 const model=CoursePreview.summarize({...c,objectives:decode(c.objectives),procedure:decode(c.procedure)});
 const cv=CoursePreview.render(model,{code:cat+' · '+(i+1),date:'2026/11/04'},()=>document.createElement('canvas'));
 results.push({height:cv.height,cards:model.steps.length});
 }return results});
 assert.ok(all.length>=46);assert.ok(all.every(x=>x.height>600&&x.height<12000&&x.cards>=1&&x.cards<=4));
 const preview=await page.evaluate(async()=>{const arr=new Uint8Array(await window.previewBlob.arrayBuffer());return Array.from(arr)});
 const out=process.env.PREVIEW_OUTPUT_PATH||path.join(os.tmpdir(),'makex-training-preview.png');await fs.writeFile(out,Buffer.from(preview));
 // Exercise download fallback even when clipboard permission is denied.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{write:async()=>{throw Error('denied')}},configurable:true}));
 await page.locator('#training-preview-dialog header button').click();
 const download=page.waitForEvent('download');await page.locator('[onclick="generateImage()"]').click();assert.match((await download).suggestedFilename(),/^makex_preview_.*\.png$/);
 assert.equal(await page.locator('#training-preview-dialog').evaluate(el=>el.open),true);
 assert.equal(await page.locator('#training-preview-image').isVisible(),true);
 const manualDownload=page.waitForEvent('download');await page.locator('#training-preview-download').click();assert.match((await manualDownload).suggestedFilename(),/\.png$/);
 const cleaned=await page.evaluate(()=>{
 const model=CoursePreview.summarize({name:'AI Camera 视觉巡线',subtitle:'基于 AI Camera 的路径识别与闭环调试',objectives:'知识目标\n① 理解 AI 视觉巡线的原理，能够说出摄像头采集图像、计算偏移、调整纠偏的完整\ufffd\ufffd流程\n② 能够区分视觉巡线和红外单\ufffd\ufffd巡线的差异，了解常见干扰因素\n技能目标\n③ 能够编写 P 巡线程序，排除 -99999 的异常值',procedure:'① 讲解视觉如何完成巡线\nAI Camera 摄像头采集画面，识别黑线和底色的差异\n② 搭建小车并安装 AI Camera\n固定摄像头，保持垂直朝下\n③ 编写巡线程序\n使用 P 巡线，排除 -99999\n④ 测试与调试\n降低基础速度，观察光线干扰'});
 const drawn=[];
 const canvas=CoursePreview.render(model,{code:'Explorer 第一年 · 36',date:'2026/11/04'},()=>{const c=document.createElement('canvas');const ctx=c.getContext('2d');const original=ctx.fillText.bind(ctx);ctx.fillText=function(text,...rest){drawn.push(text);return original(text,...rest)};return c});
 return {model,drawn,png:canvas.toDataURL('image/png').split(',')[1]}
 });
 assert.doesNotMatch(cleaned.drawn.join(''),/[\ufffd\u200b①②③④]/);
 assert.ok(cleaned.model.growth.every(s=>s!=='知识目标'&&s!=='技能目标'));
 assert.ok(cleaned.drawn.some(s=>s.includes('-99999')));
 if(process.env.PREVIEW_CLEAN_OUTPUT_PATH)await fs.writeFile(process.env.PREVIEW_CLEAN_OUTPUT_PATH,Buffer.from(cleaned.png,'base64'));
 console.log('PASS cleaned canvas text removes corrupt glyphs and list markers while retaining code values');
 // Reproduce deleting a corrupted character in the visible objectives, without saving first.
 await page.evaluate(()=>{
 closeTrainingPreview();
 Object.defineProperty(navigator,'clipboard',{value:{write:async()=>{}},configurable:true});
 // Keep unrelated fields clean for this editing regression; uploaded lessons may legitimately contain old corrupt text.
 document.getElementById('doc-name').value='重生成测试课程';
 document.getElementById('doc-subtitle').value='验证当前编辑内容';
 document.getElementById('doc-procedure').textContent='1、执行测试流程';
 document.getElementById('doc-objectives').textContent='知识目标\n① 修改前目标\ufffd\ue123';
 });
 await page.locator('[onclick="generateImage()"]').click();await page.waitForFunction(()=>!previewImageState.busy);
 assert.match(await page.locator('#training-preview-status').innerText(),/无法识别/);
 const oldPreview=await page.locator('#training-preview-image').getAttribute('src');
 await page.locator('#training-preview-dialog header button').click();
 // Edit in place; the prior slot data still contains the old objective until generation saves it.
 await page.locator('#doc-objectives').fill('知识目标\n① 删除乱码后的新目标');
 const live=await page.evaluate(()=>{const before=CoursePreview.render;window.lastModel=null;CoursePreview.render=function(model,...rest){window.lastModel=model;return before(model,...rest)};return data[docContext.cat][docContext.index].objectives});
 assert.match(live,/修改前目标/);
 await page.locator('[onclick="generateImage()"]').click();await page.waitForFunction(()=>!previewImageState.busy);
 const model=await page.evaluate(()=>window.lastModel);
 assert.deepEqual(model.growth,['删除乱码后的新目标']);assert.equal(model.focus,'删除乱码后的新目标');assert.deepEqual(model.warnings,[]);
 assert.doesNotMatch(await page.locator('#training-preview-status').innerText(),/无法识别/);
 assert.notEqual(await page.locator('#training-preview-image').getAttribute('src'),oldPreview);
 assert.match(await page.locator('#training-preview-status').innerText(),/本次生成/);
 console.log('PASS embedded module ignores stale external code, and regeneration uses current edits instead of saved objectives');
 await page.evaluate(()=>{closeTrainingPreview();window.CoursePreview=undefined});
 await page.locator('[onclick="generateImage()"]').click();await page.waitForFunction(()=>!previewImageState.busy);
 assert.match(await page.locator('#training-preview-status').innerText(),/图片组件未加载/);
 assert.equal(await page.locator('#training-preview-download').isDisabled(),true);
 // Standalone HTML execution without a server. Managed browser policy blocks file:// navigation;
 // read the permitted local source and execute it as content instead. This does not validate file:// navigation itself.
 const offline=await browser.newPage();
 // Opaque about:blank origins have no localStorage; supply an in-memory browser store.
 await offline.evaluate(()=>{const values=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}})});
 const standalone=(await fs.readFile(path.join(dir,'index.html'),'utf8')).replace(/<script src="[^"]+"><\/script>/g,'');
 await offline.setContent(standalone);
 for(const file of ['course-preview.js','school-knowledge.js','course-images.js','git-sync-client.js'])await offline.addScriptTag({content:await fs.readFile(path.join(dir,file),'utf8')});
 await offline.evaluate(()=>{openDocument('explorer',0);Object.defineProperty(navigator,'clipboard',{value:{write:async()=>new Promise(()=>{})},configurable:true});CanvasRenderingContext2D.prototype.roundRect=undefined});
 const offlineDownload=offline.waitForEvent('download');await offline.locator('[onclick="generateImage()"]').click();
 await offlineDownload;await offline.waitForFunction(()=>!previewImageState.busy);
 assert.equal(await offline.locator('#training-preview-image').isVisible(),true);
 assert.match(await offline.locator('#training-preview-status').innerText(),/下载|保存/);
 const firstImage=await offline.locator('#training-preview-image').getAttribute('src');
 await offline.locator('#training-preview-dialog header button').click();
 await offline.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{write:async()=>{}},configurable:true}));
 await offline.locator('[onclick="generateImage()"]').click();await offline.waitForFunction(()=>!previewImageState.busy);
 assert.notEqual(await offline.locator('#training-preview-image').getAttribute('src'),firstImage);
 await offline.evaluate(()=>{closeTrainingPreview();window.CoursePreview=undefined});
 await offline.locator('[onclick="generateImage()"]').click();await offline.waitForFunction(()=>!previewImageState.busy);
 assert.match(await offline.locator('#training-preview-status').innerText(),/图片组件未加载/);
 await offline.evaluate(()=>{closeTrainingPreview();showToast('生成成功测试')});
 const toast=await offline.locator('#toast-container').boundingBox();const viewport=offline.viewportSize();assert.ok(toast.y>=0&&toast.y+toast.height<=viewport.height&&toast.x>=0);
 await offline.close();
 assert.deepEqual(errors,[]);console.log('PASS standalone HTML preview, clipboard timeout, explicit download, repeated generation, missing-module errors, older Canvas compatibility');console.log('PASS actual preview button, clipboard PNG, download fallback, served asset and '+all.length+' course layouts; '+out);
 }finally{if(browser)await browser.close();if(child&&child.exitCode===null){child.kill();await once(child,'exit')}await fs.rm(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
