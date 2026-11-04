const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {once}=require('node:events');const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const exec=promisify(execFile);
test('launcher reuses only the current directory and current server, and never silently opens an old service',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'makex-launch-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const checker=path.join(dir,'check-local-server.js');await fs.copyFile(path.join(__dirname,'../check-local-server.js'),checker);
 let mode='same';const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(mode==='old'){res.end('<html>old service</html>');return}res.end(JSON.stringify({version:'2026-11-04.sync2',directory:mode==='other'?path.join(dir,'other'):dir}))});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const run=async()=>{try{await exec(process.execPath,[checker],{env:{...process.env,PORT:String(port)}});return 0}catch(error){return error.code}};
 assert.equal(await run(),0);mode='old';assert.equal(await run(),2);mode='other';assert.equal(await run(),2);
 await new Promise(resolve=>server.close(resolve));assert.equal(await run(),1);
});
