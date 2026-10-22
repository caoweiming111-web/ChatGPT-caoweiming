const http=require('http');const fs=require('fs');const path=require('path');
const PORT=process.env.PORT||3456;
const DIR=__dirname;
const HTML=path.join(DIR,'index.html');
const DATA=path.join(DIR,'makex_data.json');
// CORS 允许 GitHub Pages 访问
const ALLOW_ORIGIN='*';
let data={};
try{if(fs.existsSync(DATA))data=JSON.parse(fs.readFileSync(DATA,'utf8'))}catch(e){}
function saveFile(){try{fs.writeFileSync(DATA,JSON.stringify(data,null,2),'utf8')}catch(e){}}
const sv=http.createServer(function(req,res){
res.setHeader('Access-Control-Allow-Origin',ALLOW_ORIGIN);
res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
res.setHeader('Access-Control-Allow-Headers','Content-Type');
if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
if(req.url==='/data.json'){
res.writeHead(200,{'Content-Type':'application/json;charset=utf-8'});
res.end(JSON.stringify(data));
return
}
if(req.url==='/update'&&req.method==='POST'){
var body='';
req.on('data',function(c){body+=c});
req.on('end',function(){
try{data=JSON.parse(body);saveFile();res.writeHead(200,{'Content-Type':'application/json;charset=utf-8'});res.end('{"ok":true}')}
catch(e){res.writeHead(400);res.end('{"error":"bad json"}')}
});
return
}
try{var html=fs.readFileSync(HTML,'utf8');res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html)}
catch(e){res.writeHead(404);res.end('Not found')}
});
sv.listen(PORT,'0.0.0.0',function(){console.log('MakeX server OK on port '+PORT)});
