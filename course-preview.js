/* Training preview: extract course text locally; no external model or invented outcomes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CoursePreview=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function clean(value){return String(value||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim()}
function lines(value){return clean(value).split('\n').map(s=>s.trim()).filter(Boolean)}
function strip(s){return s.replace(/^(?:\*+|[·•●]|(?:第?[一二三四五六七八九十]+|\d{1,2})[、.．)）])\s*/,'').trim()}
function short(s,n){s=clean(s).replace(/\s+/g,' ');return s.length>n?s.slice(0,n-1)+'…':s}
function points(text){const all=lines(text).filter(s=>! /^(课程目标|教学目标|学习目标|课程基本流程|教学流程|课堂流程)[：:]?$/.test(s));const numbered=all.filter(s=>/^(?:[一二三四五六七八九十]+[、.．)）]|\d{1,2}(?:[、)）]|[.．](?!\d)))/.test(s));return (numbered.length?numbered:all.filter(s=>!/^\*\*/.test(s))).map(strip).filter(Boolean)}
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
for(const s of all){const m=s.match(/^(\d{1,2})(?:[、)）]|[.．](?!\d))/);let heading=chinese?/^[一二三四五六七八九十]+[、.．]/.test(s):!!m;
if(!chinese&&m){const num=Number(m[1]);if(num<=last)nested=true;if(nested)heading=false;else last=num}
if(heading||!groups.length)groups.push({title:strip(s),body:[]});else groups[groups.length-1].body.push(strip(s));
}
if(groups.length===1&&!groups[0].body.length)return [{title:short(groups[0].title,32),body:''}];
// Keep the whole sequence represented; adjacent stages share a card for long lessons.
const cards=[];const count=Math.min(4,groups.length);
for(let i=0;i<count;i++){const from=Math.floor(i*groups.length/count),to=Math.floor((i+1)*groups.length/count);const chunk=groups.slice(from,to);cards.push({title:short(chunk.map(g=>cardTitle(g.title)).join(' · '),32),body:chunk.map(g=>cardBody(g,chunk.length>1?20:34)||g.title).join('；')})}
return cards
}
function summarize(course){const goals=points(course.objectives);const cards=steps(course.procedure);return {title:clean(course.name)||'未命名课程',subtitle:short(course.subtitle,100),focus:short(goals[0]||course.subtitle||course.name,100),intro:short(goals.slice(1,3).join('；')||course.subtitle,240),steps:cards.length?cards:[{title:'课堂流程待补充',body:'请在课程中填写教学流程后重新生成。'}],growth:goals.length?goals.slice(0,3).map(s=>short(s,100)):['课程目标待补充，请完善课程后重新生成。']}}
function render(model,meta,createCanvas){
const W=1000,pad=56,gap=20,col=(W-pad*2-gap)/2;
const cv=createCanvas();cv.width=W;cv.height=1;let ctx=cv.getContext('2d');
const font='"Microsoft YaHei","PingFang SC",sans-serif';
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
function round(x,y,w,h,r,color){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill()}
function text(ls,x,y,size,color,bold,lineH){ctx.font=(bold?'bold ':'')+size+'px '+font;ctx.fillStyle=color;for(const line of ls){ctx.fillText(line,x,y);y+=lineH}return y}
ctx.fillStyle='#e4eaea';ctx.fillRect(0,0,W,H);round(8,8,W-16,H-16,32,'#fffef5');
ctx.save();ctx.beginPath();ctx.roundRect(8,8,W-16,H-16,32);ctx.clip();ctx.fillStyle='#194e51';ctx.fillRect(8,8,W-16,headerH);ctx.restore();
let y=text(title,pad,48,44,'#ffffff',true,57);text(sub,pad,y+12,25,'#c9e1df',false,38);
ctx.textAlign='right';text(['训练预告'],W-pad,52,25,'#d8c474',false,36);text([meta.code],W-pad,97,19,'#d0e2df',false,29);text(['生成于 '+meta.date],W-pad,128,18,'#d0e2df',false,28);ctx.textAlign='left';
function section(n,label,y){text([n],pad,y+3,24,'#53777a',true,32);ctx.fillStyle='#c4af60';ctx.fillRect(pad,y+35,28,2);text([label],pad+48,y,30,'#193e43',true,42);return y+54}
y=section('01','训练内容',headerH+44);y=text(focus,pad,y,26,'#255960',true,40);if(intro.length)y=text(intro,pad,y+18,24,'#41595b',false,39);
y=section('02','课堂流程',y+40);
for(let row=0;row<rows.length;row++){for(let j=0;j<2;j++){const card=cards[row*2+j];if(!card)continue;const x=pad+j*(col+gap);round(x,y,col,rows[row],18,'#eef3ed');const yy=text(card.title,x+24,y+24,26,'#25555a',true,38);text(card.body,x+24,yy+12,23,'#496062',false,36)}y+=rows[row]+gap}
y=section('03','成长收获',y+20);round(pad,y,W-pad*2,growthH,18,'#fcf3d6');let gy=y+24;for(const g of growth)gy=text(g,pad+28,gy,24,'#4a5b54',false,38)+12;
return cv
}
return {summarize,steps,points,render};
});
