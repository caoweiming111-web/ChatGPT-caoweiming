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

test('preview strips corrupt characters and circled list markers, keeping real objectives',()=>{
 const model=summarize({name:'AI Camera 视觉巡线',subtitle:'路径\u200b识别',objectives:'知识目标\n① 理解 AI 视觉巡线的原理，掌握完整\ufffd\ufffd流程\n② 能够区分视觉巡线和红外单\ufffd\ufffd巡线的差异\n技能目标\n③ 能够编写 P 巡线程序',procedure:'① 讲解视觉巡线\n清理\ufffd\ufffd干扰物\n② 编写巡线程序\n排除 -99999 的情况'});
 assert.equal(model.focus,'理解 AI 视觉巡线的原理，掌握完整流程');
 assert.equal(model.growth.length,3);assert.equal(model.steps.length,2);
 assert.ok(model.steps[1].body.includes('-99999'));
 assert.doesNotMatch(JSON.stringify(model),/[\ufffd\u200b①②③]/);
 assert.ok(!model.growth.includes('知识目标'));
});
test('section labels and Markdown bullets do not become learning outcomes',()=>{
 const model=summarize({objectives:'课程目标\n1.知识认知目标\n** 理解 **AI** 的基本含义\n2.实操技能目标\n• 编写 `P` 巡线程序\n3.创新拓展目标\n- 设计灯光方案'});
 assert.deepEqual(model.growth,['理解 AI 的基本含义','编写 P 巡线程序','设计灯光方案']);
});
test('cleanup preserves programming values, dimensions, units, and valid Unicode',()=>{
 const model=summarize({objectives:'（1）设置 P = 0.5，排除 -99999\n（2）安装 M4×8mm 螺丝，转动 90°\n（3）设置速度 50%，电流 1.5A，比较 a <= b',name:'机器人 🤖'});
 assert.deepEqual(model.growth,['设置 P = 0.5，排除 -99999','安装 M4×8mm 螺丝，转动 90°','设置速度 50%，电流 1.5A，比较 a <= b']);assert.equal(model.title,'机器人 🤖');
 const emoji=summarize({subtitle:'字'.repeat(98)+'🤖机器人'}).subtitle;assert.doesNotMatch(emoji,/\ufffd/);assert.ok(Array.from(emoji).every(ch=>ch.length===2||!/[\ud800-\udfff]/.test(ch)));
});

test('cleaning does not invent replacements or modify source objects',()=>{
 const source={name:'A\ud800课',objectives:'知识目标\n① 执行 x ** 2，使用 a*b\n② 校验编\ufffd程结果'};
 const snapshot=JSON.stringify(source),model=summarize(source);
 assert.equal(JSON.stringify(source),snapshot);assert.equal(model.title,'A课');
 assert.equal(model.growth[0],'执行 x ** 2，使用 a*b');assert.equal(model.growth[1],'校验编程结果');
});
