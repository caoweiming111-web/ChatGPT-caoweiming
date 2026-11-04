const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize,steps}=require('../course-preview');
test('preview extracts objectives and ordered stages without inventing outcomes',()=>{
 const model=summarize({name:'点亮光世界',subtitle:'从点亮 LED 到点阵协作',objectives:'课程目标\n1、连接 LED 电路\n** 认识正负极\n2、编写灯光程序\n3、合作完成点阵',procedure:'1、认识闭合电路\n用电池连接 LED\n2、灯光传信\n用闪烁传递信息\n3、创意灯效\n设计流水灯\n4、点阵协作\n合作拼出图形'});
 assert.equal(model.title,'点亮光世界');assert.equal(model.steps.length,4);
 assert.deepEqual(model.growth,['连接 LED 电路','编写灯光程序','合作完成点阵']);
 assert.equal(model.steps[1].title,'灯光传信');assert.equal(model.steps[1].body,'用闪烁传递信息');
});
test('Chinese top-level sections take precedence over numbered substeps',()=>{
 const result=steps('一、搭建\n1.安装电机\n2.安装轮子\n二、编程\n1.初始化\n2.前进');
 assert.equal(result.length,2);assert.equal(result[1].title,'编程');assert.match(result[1].body,/初始化/);
});
test('long sequences include later stages and missing fields stay explicit',()=>{
 const result=steps(Array.from({length:8},(_,i)=>(i+1)+'、阶段'+(i+1)+'\n实践'+(i+1)).join('\n'));
 assert.equal(result.length,4);assert.match(result[3].title,/阶段8/);
 const empty=summarize({});assert.match(empty.growth[0],/待补充/);assert.match(empty.steps[0].title,/待补充/);
});
test('decimal quantities are not mistaken for numbered lesson stages',()=>{
 assert.equal(steps('1、装配\n1.5A 舵机\n2、调试').length,2);
});

test('numeric content after a Chinese list separator remains an objective',()=>{
 const model=summarize({objectives:'1、基础小车装配\n2、1.5A小舵机安装\n3、2026赛项认知'});
 assert.equal(model.growth.length,3);assert.match(model.growth[1],/1.5A/);
});
