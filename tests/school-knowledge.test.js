const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const kb = require('../school-knowledge');
function find(course, id) { return kb.analyze(course).entries.find(entry => entry.id === id); }
test('ultrasound uses round-trip time and cites the actual lesson field', () => {
  const item = find({ name: '测距', procedure: '<p>超声波测距：通过回波时间计算距离。</p>' }, 'ultrasound');
  assert.equal(item.status, 'evidence');
  assert.equal(item.evidenceField, '教学流程');
  assert.match(item.application, /声速×往返时间÷2/);
  assert.match(item.evidence, /通过回波时间/);
  assert.doesNotMatch(item.evidence, /<p>/);
  assert.doesNotMatch(item.application, /距离＝路程÷时间/);
});
test('title-only and equipment-only matches are candidates, not taught knowledge', () => {
  assert.equal(find({ name: '超声波测距' }, 'ultrasound').status, 'candidate');
  assert.equal(find({ name: '设计课', equipment: 'Onshape' }, 'modelling').status, 'candidate');
  assert.equal(kb.analyze({ name: '新课程 32' }).entries.length, 0);
});
test('unrelated details do not promote a title hint to evidence', () => {
  assert.equal(find({ name: '超声波测距', procedure: '介绍比赛纪律和团队分工。' }, 'ultrasound').status, 'candidate');
});
test('generic timing and teamwork do not force subject associations', () => {
  assert.equal(kb.analyze({ name: '比赛介绍', procedure: '遵守规则，安排比赛时间，与队友合作。' }).entries.length, 0);
});
test('sound reflection is not incorrectly matched to light reflection', () => {
  const result = kb.analyze({ procedure: '超声波遇到障碍物反射，通过声速和回波时间测距。' });
  assert.ok(result.entries.some(x => x.id === 'ultrasound'));
  assert.ok(!result.entries.some(x => x.id === 'light'));
});
test('electronics beyond basic school circuits are marked as extensions', () => {
  const result = kb.analyze({ objectives: '三极管和电容组成RC延时电路，探索自激振荡频率。' });
  for (const id of ['transistor', 'capacitor', 'oscillation']) {
    const item = result.entries.find(x => x.id === id);
    assert.ok(item && item.extension);
    assert.match(item.ib, /不声明为 IB 必修/);
  }
});
test('coordinate mapping, proportional line tracking, and geometry match specific topics', () => {
  assert.ok(find({ objectives: '将坐标进行线性映射，先减320，再除以3.2。' }, 'mapping'));
  assert.ok(find({ objectives: '使用比例系数Kp和偏移量控制巡线。' }, 'mapping'));
  assert.ok(find({ procedure: '绘制直径4.2mm的圆孔，比较孔距。' }, 'geometry'));
});
test('changes mark previous results stale without replacing them', () => {
  const course = { name: '电路', procedure: '<p>电源通过开关连接小灯泡。</p>' };
  const result = kb.analyze(course);
  assert.equal(kb.stale(result, course), false);
  assert.equal(kb.stale(result, { ...course, procedure: '<b>电源通过开关连接小灯泡。</b>' }), false);
  assert.equal(kb.stale(result, { ...course, procedure: '新活动' }), true);
  assert.equal(kb.stale({ ...result, version: 'old' }, course), true);
  assert.equal(result.confirmed, false);
});
test('results serialize with course data and exports identify candidates and stale results', () => {
  const course = { name: '超声波测距' };
  course.schoolKnowledge = kb.analyze(course);
  const stored = JSON.parse(JSON.stringify(course));
  assert.equal(kb.stale(stored.schoolKnowledge, stored), false);
  assert.match(kb.exportText(stored.schoolKnowledge, stored), /候选关联/);
  assert.match(kb.exportText(stored.schoolKnowledge, { ...stored, name: '新的课程' }), /待重新提取/);
});
test('HTML attributes and scripts do not create hidden topic matches', () => {
  assert.equal(kb.analyze({ procedure: '<img src="超声波测距"><script>超声波测距</script><p>团队讨论</p>' }).entries.length, 0);
  assert.equal(kb.plain('A&nbsp;&amp;&#x42;'), 'A &B');
});
test('all existing lessons can be analyzed without modifying the original course data', () => {
  const original = fs.readFileSync(require('node:path').join(__dirname, '../makex_data.json'), 'utf8');
  const data = JSON.parse(original.replace(/^\uFEFF/, ''));
  const before = JSON.stringify(data);
  let count = 0;
  for (const rows of Object.values(data)) for (const course of rows) {
    const result = kb.analyze(course);
    assert.ok(Array.isArray(result.entries));
    count++;
  }
  assert.equal(count, 46);
  assert.equal(JSON.stringify(data), before);
});
test('the page keeps valid inline scripts and loads the knowledge module once', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const { Script } = require('node:vm');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.doesNotThrow(() => new Script(match[1]));
  }
  assert.equal((html.match(/<script src="school-knowledge.js"><\/script>/g) || []).length, 1);
});
test('software stability and charging speed are not treated as robot mechanics', () => {
  const result = kb.analyze({ objectives: '优化程序稳定性，观察电容充放电速度和延时时间。' });
  assert.ok(!result.entries.some(x => x.id === 'stability'));
  assert.ok(!result.entries.some(x => x.id === 'motion'));
  assert.ok(!kb.analyze({ procedure: 'Use the command to start a discussion.' }).entries.some(x => x.id === 'measurement'));
});
test('image export omits collapsed panels and empty or ungenerated results', () => {
  const result = kb.analyze({ procedure: '超声波测距利用声速和回波时间计算距离。' });
  assert.deepEqual(kb.imageLines(result, false), []);
  assert.deepEqual(kb.imageLines(null, true), []);
  assert.deepEqual(kb.imageLines({ entries: [] }, true), []);
});
test('expanded image export includes both curricula but not review or stale messages', () => {
  const course = { name: '三极管开关电路' };
  const result = kb.analyze(course);
  result.sourceSnapshot = 'old snapshot';
  result.confirmed = false;
  const text = kb.imageLines(result, true).flat().map(run => run.text).join('\n');
  assert.match(text, /三极管开关与放大/);
  assert.match(text, /公立学校：/);
  assert.match(text, /IB 国际学校：/);
  assert.doesNotMatch(text, /待教师确认|课程已修改|候选关联|教师已确认|重新提取|（拓展）/);
  assert.equal(result.confirmed, false);
});
