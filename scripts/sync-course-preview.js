// Bundle tested runtime modules so a standalone HTML update never loads stale external logic.
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const file=path.join(root,'index.html');
const original=fs.readFileSync(file,'utf8');let html=original;
for(const [name,id] of [['course-preview','course-preview-runtime'],['git-sync-client','git-sync-runtime']]){
 const source=fs.readFileSync(path.join(root,name+'.js'),'utf8').trimEnd();
 if(/<\/script/i.test(source))throw Error('Runtime source contains an HTML script terminator: '+name);
 const bundle='<script id="'+id+'">\n'+source+'\n</script>';
 const start='<script id="'+id+'">';const external='<script src="'+name+'.js"></script>';
 const from=html.indexOf(start);
 if(from>=0){const end=html.indexOf('</script>',from);if(end<0)throw Error('Missing script terminator');html=html.slice(0,from)+bundle+html.slice(end+9)}
 else if(html.includes(external))html=html.replace(external,()=>bundle);
 else throw Error('Runtime position not found: '+name);
}
if(process.argv.includes('--check')){if(html!==original)throw Error('Run node scripts/sync-course-preview.js to refresh embedded runtimes')}
else if(html!==original)fs.writeFileSync(file,html);
