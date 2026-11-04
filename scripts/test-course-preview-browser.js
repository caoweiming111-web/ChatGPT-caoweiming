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
 const download=page.waitForEvent('download');await page.locator('[onclick="generateImage()"]').click();assert.match((await download).suggestedFilename(),/^makex_preview_.*\.png$/);
 assert.deepEqual(errors,[]);console.log('PASS actual preview button, clipboard PNG, download fallback, served asset and '+all.length+' course layouts; '+out);
 }finally{if(browser)await browser.close();if(child&&child.exitCode===null){child.kill();await once(child,'exit')}await fs.rm(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
