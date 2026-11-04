// Keep standalone index.html in sync with the canonical, testable preview module.
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const file=path.join(root,'index.html');
const source=fs.readFileSync(path.join(root,'course-preview.js'),'utf8').trimEnd();
if(/<\/script/i.test(source))throw Error('Preview source contains an HTML script terminator');
const bundle='<script id="course-preview-runtime">\n'+source+'\n</script>';
const html=fs.readFileSync(file,'utf8');
const pattern=/<script id="course-preview-runtime">[\s\S]*?<\/script>|<script src="course-preview\.js"><\/script>/;
if(!pattern.test(html))throw Error('Preview runtime position not found');
const updated=html.replace(pattern,()=>bundle);
if(process.argv.includes('--check')){if(updated!==html)throw Error('Run node scripts/sync-course-preview.js to refresh the embedded preview runtime')}
else if(updated!==html)fs.writeFileSync(file,updated);
