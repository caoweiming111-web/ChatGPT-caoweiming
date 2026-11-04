/* Training preview: extract course text locally; no external model or invented outcomes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CoursePreview=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Keep blackface text, with explicit CJK, symbol and emoji fallbacks for missing glyphs.
const FONT_FAMILY='"SimHei","黑体","Heiti SC","Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Source Han Sans SC","Noto Sans SC","Segoe UI Symbol","Noto Sans Symbols 2","Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
// Shared with full-lesson exports. Header colors stay separate from the body text.
const styles=Object.freeze({
tech:Object.freeze({background:'#070c18',card:'#0d1424',header:'#111e35',title:'#eff6ff',subtitle:'#b6c7dd',text:'#cbd5e1',muted:'#8da9ca',accent:'#53d9f0',line:'#2b6b8b',step:'#15243a',growth:'#1a2a3f',watermark:'#ffffff',dark:true,headerTitle:'#ffffff',headerSubtitle:'#c0d8ee',headerMeta:'#b6c7dd',badge:'#69e0ed',stepTitle:'#8ce4ee',growthText:'#d5e3f2'}),
paper:Object.freeze({background:'#e9edf2',card:'#ffffff',header:'#eaf0f8',title:'#22324a',subtitle:'#53657b',text:'#3f5066',muted:'#6b7c93',accent:'#2a61a5',line:'#94add0',step:'#f0f4f9',growth:'#edf3fb',watermark:'#1c304d',dark:false,headerTitle:'#22324a',headerSubtitle:'#4c6380',headerMeta:'#53657b',badge:'#2a61a5',stepTitle:'#30557e',growthText:'#3f5066'}),
forest:Object.freeze({background:'#e4eaea',card:'#fffef5',header:'#194e51',title:'#193e43',subtitle:'#496062',text:'#41595b',muted:'#53777a',accent:'#255960',line:'#c4af60',step:'#eef3ed',growth:'#fcf3d6',watermark:'#17383d',dark:false,headerTitle:'#ffffff',headerSubtitle:'#c9e1df',headerMeta:'#d0e2df',badge:'#d8c474',stepTitle:'#25555a',growthText:'#4a5b54'}),
warm:Object.freeze({background:'#eee5d7',card:'#fffaf0',header:'#755441',title:'#4d372b',subtitle:'#7c6553',text:'#68513e',muted:'#91735a',accent:'#9c5a2e',line:'#c59858',step:'#f5ecdf',growth:'#faedcc',watermark:'#4d372b',dark:false,headerTitle:'#fffaf1',headerSubtitle:'#efdfc8',headerMeta:'#edddc6',badge:'#f0cd86',stepTitle:'#805334',growthText:'#68513e'})
});
// Draw last so the same faint mark covers text, cards and attached lesson images.
function drawWatermark(ctx,width,height,options){
if(!(width>0&&height>0))return;
const dark=!!(options&&options.dark);
ctx.save();
try{
ctx.globalCompositeOperation='source-over';ctx.globalAlpha=dark?0.045:0.035;
ctx.fillStyle=options&&options.color||(dark?'#ffffff':'#17383d');
ctx.font='bold 58px '+FONT_FAMILY;ctx.textAlign='center';ctx.textBaseline='middle';
ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
for(let row=0,y=120;y<height+100;row++,y+=280){
for(let x=100+(row%2?180:0);x<width+100;x+=360){
ctx.save();try{ctx.translate(x,y);ctx.rotate(-Math.PI/7);ctx.fillText('Kclub',0,0)}finally{ctx.restore()}
}
}
}finally{ctx.restore()}
}
function wordMarkers(value){return String(value||'').replace(/^[ \t]*[\uf0b7\uf0a7\uf0fc\uf0d8][ \t]*/gm,'')}
function unreadable(ch){
const n=ch.codePointAt(0);
return (n>=0xd800&&n<=0xdfff)||n===0xfffd||n===0xfffc||(n>=0xe000&&n<=0xf8ff)||(n>=0xf0000&&n<=0xffffd)||(n>=0x100000&&n<=0x10fffd)||(n>=0xfdd0&&n<=0xfdef)||(n&0xffff)===0xfffe||(n&0xffff)===0xffff
}
function textWarnings(course){
const count=['name','subtitle','objectives','procedure'].reduce((n,key)=>n+Array.from(wordMarkers(course[key])).filter(unreadable).length,0);
return count?['原文中有 '+count+' 个无法识别的特殊字符，预告已跳过；请核对内容，原课程未修改。']:[]
}
async function prepareFonts(fonts,model){
if(!fonts||typeof fonts.load!=='function')return;
const sample=[model.title,model.subtitle,model.focus,model.intro].concat(model.growth,model.steps.map(s=>s.title+' '+s.body)).join(' ')+'训练预告课堂流程成长收获';
await Promise.all([fonts.load('24px '+FONT_FAMILY,sample),fonts.load('bold 30px '+FONT_FAMILY,sample)])
}
// Clean only the generated copy. Never rewrite the teacher's course data or guess lost characters.
function clean(value){
return Array.from(wordMarkers(value)).filter(ch=>!unreadable(ch)).join('')
.replace(/\r\n?/g,'\n').replace(/[\u2028\u2029]/g,'\n').replace(/\u00a0/g,' ')
.replace(/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,'')
.replace(/^[ \t]*\*+\s+/gm,'').replace(/\*\*(\S(?:[^*]*?\S)?)\*\*(?=$|[\s，。；、:：!?！？）)])/g,'$1').replace(/`([^`\n]+)`/g,'$1').trim()
}
function lines(value){return clean(value).split('\n').map(s=>s.trim()).filter(Boolean)}
const listPrefix=/^(?:(?:第?[一二三四五六七八九十]+|\d{1,2})(?:[、)）]|[.．](?!\d))|[（(](?:\d{1,2}|[一二三四五六七八九十]+)[)）]|[①-⑳])\s*/;
function numbered(s){return listPrefix.test(s)}
function strip(s){return clean(s).replace(/^#{1,6}\s+/,'').replace(/^(?:\*+|[·•●▪■◆◇▶►])\s*/,'').replace(/^[-+]\s+(?!\d)/,'').replace(listPrefix,'').trim()}
function short(s,n){const chars=Array.from(clean(s).replace(/\s+/g,' '));return chars.length>n?chars.slice(0,n-1).join('')+'…':chars.join('')}
function goalHeading(s){return /^(?:(?:课程|教学|学习|训练|知识|技能|能力|情感|态度|素养|实践|实操|认知|创新|拓展|成长|课堂|基本)[\s／/与及、和]*){0,4}(?:目标|流程|收获|步骤|要求)[：:]?$/.test(strip(s))}
function points(text){
const all=lines(text).filter(s=>!goalHeading(s)&&strip(s));
const primary=all.filter(numbered);
const result=(primary.length?primary:all).map(strip);
return Array.from(new Set(result)).filter(Boolean)
}
function cardTitle(s){return strip(s).replace(/^完成/,'').replace(/^在机器人上/,'').replace(/^通过程序来/,'').trim()}
function excerpt(s,limit){
s=clean(s).replace(/^[^：:]{1,8}[：:]\s*/,'');
const clauses=s.split(/[，,；;。]/).map(clean).filter(Boolean);let out='';
for(const clause of clauses){const next=out?out+'，'+clause:clause;if(next.length>limit){if(!out)out=short(clause,limit);break}out=next}
return out
}
function cardBody(group,limit){
const meaningful=group.body.filter(s=>s&&!/^[^：:]{1,8}[：:]$/.test(s));
const chosen=meaningful.length>1?[meaningful[0],meaningful[meaningful.length-1]]:meaningful;
return chosen.map(s=>excerpt(s,limit||34)).join('；')
}
function steps(text){
const all=lines(text).filter(s=>! /^(课程基本流程|教学流程|课堂流程)[：:]?$/.test(s));
const chinese=all.some(s=>/^[一二三四五六七八九十]+[、.．]/.test(s));
const groups=[];let last=0;let nested=false;
for(const s of all){const m=s.match(/^(\d{1,2})(?:[、)）]|[.．](?!\d))/);let heading=chinese?/^[一二三四五六七八九十]+[、.．]/.test(s):numbered(s);
if(!chinese&&m){const num=Number(m[1]);if(num<=last)nested=true;if(nested)heading=false;else last=num}
if(heading||!groups.length)groups.push({title:strip(s),body:[]});else groups[groups.length-1].body.push(strip(s));
}
if(groups.length===1&&!groups[0].body.length)return [{title:short(groups[0].title,32),body:''}];
// Keep the whole sequence represented; adjacent stages share a card for long lessons.
const cards=[];const count=Math.min(4,groups.length);
for(let i=0;i<count;i++){const from=Math.floor(i*groups.length/count),to=Math.floor((i+1)*groups.length/count);const chunk=groups.slice(from,to);cards.push({title:short(chunk.map(g=>cardTitle(g.title)).join(' · '),32),body:chunk.map(g=>cardBody(g,chunk.length>1?20:34)||g.title).join('；')})}
return cards
}
function summarize(course){const goals=points(course.objectives);const cards=steps(course.procedure);return {warnings:textWarnings(course),title:clean(course.name)||'未命名课程',subtitle:short(course.subtitle,100),focus:short(goals[0]||course.subtitle||course.name,100),intro:short(goals.slice(1,3).join('；')||course.subtitle,240),steps:cards.length?cards:[{title:'课堂流程待补充',body:'请在课程中填写教学流程后重新生成。'}],growth:goals.length?goals.slice(0,3).map(s=>short(s,100)):['课程目标待补充，请完善课程后重新生成。']}}
function render(model,meta,createCanvas){
meta=meta||{};
const palette=Object.prototype.hasOwnProperty.call(styles,meta.style)?styles[meta.style]:styles.forest;
const W=1000,pad=56,gap=20,col=(W-pad*2-gap)/2;
const cv=createCanvas();cv.width=W;cv.height=1;let ctx=cv.getContext('2d');
const font=FONT_FAMILY;
function wrap(text,size,width,bold){ctx.font=(bold?'bold ':'')+size+'px '+font;const out=[];for(const para of String(text||'').split('\n')){let line='';for(const ch of Array.from(para)){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line=ch}else line+=ch}if(line)out.push(line)}return out}
const title=wrap(model.title,44,640,true),sub=wrap(model.subtitle,25,640,false);
const headerH=Math.max(184,54+title.length*57+sub.length*38);
const focus=wrap(model.focus,26,W-pad*2,true),intro=wrap(model.intro,24,W-pad*2,false);
const introH=focus.length*40+(intro.length?18+intro.length*39:0);
const cards=model.steps.map((s,i)=>{const title=wrap((i+1)+'  '+s.title,26,col-48,true),body=wrap(s.body,23,col-48,false);return {title,body,height:48+title.length*38+(body.length?12+body.length*36:0)}});
const rows=[];for(let i=0;i<cards.length;i+=2)rows.push(Math.max(cards[i].height,cards[i+1]?cards[i+1].height:0,154));
const growth=model.growth.map(s=>wrap(s,24,W-pad*2-56,false));
const growthH=40+growth.reduce((h,g)=>h+g.length*38+12,0);
const H=Math.ceil(headerH+44+52+introH+40+52+rows.reduce((a,b)=>a+b+gap,0)+20+52+growthH+48);
cv.height=H;ctx=cv.getContext('2d');ctx.textBaseline='top';
function roundedPath(x,y,w,h,r){
ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()
}
function round(x,y,w,h,r,color){roundedPath(x,y,w,h,r);ctx.fillStyle=color;ctx.fill()}
function text(ls,x,y,size,color,bold,lineH){ctx.font=(bold?'bold ':'')+size+'px '+font;ctx.fillStyle=color;for(const line of ls){ctx.fillText(line,x,y);y+=lineH}return y}
ctx.fillStyle=palette.background;ctx.fillRect(0,0,W,H);round(8,8,W-16,H-16,32,palette.card);
ctx.save();roundedPath(8,8,W-16,H-16,32);ctx.clip();ctx.fillStyle=palette.header;ctx.fillRect(8,8,W-16,headerH);ctx.restore();
let y=text(title,pad,48,44,palette.headerTitle,true,57);text(sub,pad,y+12,25,palette.headerSubtitle,false,38);
ctx.textAlign='right';text(['训练预告'],W-pad,52,25,palette.badge,false,36);text([meta.code],W-pad,97,19,palette.headerMeta,false,29);text(['生成于 '+meta.date],W-pad,128,18,palette.headerMeta,false,28);ctx.textAlign='left';
function section(n,label,y){text([n],pad,y+3,24,palette.muted,true,32);ctx.fillStyle=palette.line;ctx.fillRect(pad,y+35,28,2);text([label],pad+48,y,30,palette.title,true,42);return y+54}
y=section('01','训练内容',headerH+44);y=text(focus,pad,y,26,palette.accent,true,40);if(intro.length)y=text(intro,pad,y+18,24,palette.text,false,39);
y=section('02','课堂流程',y+40);
for(let row=0;row<rows.length;row++){for(let j=0;j<2;j++){const card=cards[row*2+j];if(!card)continue;const x=pad+j*(col+gap);round(x,y,col,rows[row],18,palette.step);const yy=text(card.title,x+24,y+24,26,palette.stepTitle,true,38);text(card.body,x+24,yy+12,23,palette.subtitle,false,36)}y+=rows[row]+gap}
y=section('03','成长收获',y+20);round(pad,y,W-pad*2,growthH,18,palette.growth);let gy=y+24;for(const g of growth)gy=text(g,pad+28,gy,24,palette.growthText,false,38)+12;
drawWatermark(ctx,W,H,{dark:palette.dark,color:palette.watermark});
return cv
}
return {summarize,steps,points,render,prepareFonts,styles,drawWatermark,fontFamily:FONT_FAMILY};
});
