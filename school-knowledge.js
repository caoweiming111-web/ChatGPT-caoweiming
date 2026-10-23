/* Fixed, inspectable topic associations. These are teaching references, not an
 * official IB syllabus or a claim that a particular school teaches a set year. */
(function (root) {
'use strict';
const VERSION = '1.0.0';
const SOURCES = [
  { title: '教育部：义务教育课程方案和课程标准（2022 年版）', url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html' },
  { title: 'IB PYP 课程框架', url: 'https://www.ibo.org/programmes/primary-years-programme/curriculum/' },
  { title: 'IB MYP Mathematics', url: 'https://www.ibo.org/programmes/middle-years-programme/curriculum/mathematics/' },
  { title: 'IB MYP Sciences', url: 'https://www.ibo.org/programmes/middle-years-programme/curriculum/sciences/' }
];
// Each group must match; alternatives within a group are separated by |.
// Public/IB descriptions deliberately avoid unverified chapter/year assignments.
const RULES = [
  ['ultrasound', '超声波测距与声音的反射', ['超声波', '测距|回波|声速|反射'],
    '根据发射与接收回波的时间测距：距离＝声速×往返时间÷2。除以 2 是因为声波往返一次；计算前统一单位。',
    '初中物理：声的传播与反射、速度与路程的关系；小学科学可作声音现象观察。',
    'MYP 科学：声音、波与测量的主题关联；PYP 可作声音探究。公式推导属于进阶应用。'],
  ['motion', '速度、路程与时间', ['速度|声速|转速', '路程|距离|时间|每秒|每分钟', '小车|机器人|车轮|行驶|直线|声速|运动'],
    '比较运动快慢，使用路程＝速度×时间；转速与直线速度不是同一物理量，不能直接互换。',
    '小学数学：速度、时间、路程的数量关系；初中物理：机械运动与速度。',
    'PYP 数学：测量与数量关系；MYP 数学／科学：变量关系与运动测量。'],
  ['light', '光的反射与吸收', ['反射|吸收', '光|颜色传感器|黑色|白色'],
    '用不同表面的反射光强判断颜色或线路；比较传感器读数，观察环境光的影响。',
    '小学科学：光与物体表面的现象；初中物理：光的反射。',
    'PYP 科学探究：光与材料；MYP 科学：光及其与物质的相互作用。'],
  ['angles', '角度与方向', ['角度|偏航角|90°|180°|直角|垂直|平行'],
    '用角度描述转向或零件关系，辨认直角、平行与垂直；区分目标角度和实际转动。',
    '小学数学：角、平行与垂直；初中数学：几何中的角与方向。',
    'PYP 数学：空间与形状、测量；MYP 数学：几何中的角度与空间关系。'],
  ['signed', '正负数与数值比较', ['负数|正数|正负|负值|偏移量.{0,30}-100|-100.{0,30}100'],
    '以零为基准，用正负表示两侧方向，比较偏差大小；偏差的方向与大小需要分别理解。',
    '小学数学：负数的初步认识；初中数学：有理数、数轴与大小比较。',
    'PYP 数学：数与数量关系的延伸；MYP 数学：数及其运算。'],
  ['coordinates', '坐标与位置', ['坐标|X轴|Y轴|X 轴|Y 轴'],
    '用坐标描述目标位置，识别原点与轴方向；屏幕坐标的方向可能不同于数学课堂的坐标。',
    '小学数学：位置表示；初中数学：平面直角坐标系。',
    'PYP 数学：位置与空间；MYP 数学：坐标几何。'],
  ['mapping', '比例与线性关系', ['坐标|数值|偏移量', '线性映射|映射计算|比例系数|Kp|除以.{0,4}3.2'],
    '通过缩放与平移转换数值区间，或按偏差的比例调节输出；可用代数式表示对应关系。',
    '小学数学：比例的基础；初中数学：代数式、函数与一次关系的应用。',
    'MYP 数学：代数、函数与数学建模；完整控制算法属于工程拓展。'],
  ['transmission', '传动中的比与数量关系', ['传动比|齿数|带轮|同步带', '传动比|齿数|周长|直径|转速'],
    '比较齿数、轮径、转速与位移；具体关系应按实际传动结构和是否打滑来判断。',
    '小学数学：比、圆的周长；初中数学／物理：比例关系与机械运动的应用。',
    'PYP 数学：测量与数量关系；MYP 数学／科学：比例建模与运动系统。'],
  ['modelling', '二维设计与三维建模', ['Onshape|三维建模|二维绘图|激光雕刻'],
    '建模活动可关联图形、位置与测量；若教案只提到软件名称，需补充具体绘图任务后确认。',
    '小学／初中数学：图形与几何的应用；软件操作本身不作为数学知识点。',
    'PYP 数学空间探究／MYP 数学几何建模的候选主题；具体关联以实际设计活动为准。'],
  ['numbers', '整数、小数与数值表示', ['整数|小数|浮点'],
    '区分整数和小数的数值意义；编程中的字符串、浮点存储类型属于信息科技，不能等同于数学数系。',
    '小学数学：整数、小数与数的表示；程序数据类型另属信息科技内容。',
    'PYP 数学／MYP 数学：数与数值表示；编程数据类型不标为数学必修。'],
  ['geometry', '平面图形与立体结构', ['直径|半径|圆柱|长方形|矩形|圆孔|三维|二维'],
    '在建模、开孔和装配中辨认图形与立体，使用直径、半径及长宽高描述结构。',
    '小学数学：图形与几何；初中数学：几何图形与空间关系。',
    'PYP 数学：空间与形状；MYP 数学：几何与空间推理。'],
  ['measurement', '长度测量、单位与尺寸', ['测量|测绘|尺寸|孔距|毫米|厘米|[0-9]\\s*(?:mm|cm)\\b'],
    '读取与比较长度、孔距和零件尺寸，统一单位后再设计、加工和检验。',
    '小学数学：长度测量与单位换算；小学科学／初中物理：测量活动。',
    'PYP 数学：测量；MYP 数学／科学：量的表达与测量。'],
  ['symmetry', '对称与结构布局', ['对称|中心线'],
    '利用对称或中心线安排孔位和零件，检查两侧的位置关系。',
    '小学数学：轴对称；初中数学：图形的对称与变换。',
    'PYP 数学：空间与形状；MYP 数学：几何变换。'],
  ['stability', '重心、支撑与稳定性', ['重心|倾倒|受力|支撑面|结构稳定|底盘稳定|站立.{0,8}稳'],
    '通过改变零件位置和支撑布局，观察倾倒、受力和稳定性的变化；不自动推导力矩公式。',
    '小学科学：力与结构的观察；初中物理：重力及力的作用的应用。',
    'PYP 科学探究：力与结构；MYP 科学：力、运动与系统。'],
  ['friction', '摩擦与接触', ['摩擦|打滑|防滑'],
    '比较材料、接触方式与抓取或传动效果，观察摩擦对滑动的影响。',
    '小学科学：摩擦现象；初中物理：摩擦力及其应用。',
    'PYP 科学探究：力与材料；MYP 科学：力与运动。'],
  ['circuit', '简单电路与通断', ['电路|电源|电池', '开关|LED|小灯泡|闭合|断路|导线'],
    '识别电源、导线、用电器和开关，检查闭合回路，利用通断现象排查连接。',
    '小学科学：简单电路；初中物理：电路组成与电流路径。',
    'PYP 科学探究：电与能量；MYP 科学：电路与电能的主题关联。'],
  ['ohm', '电压、电流、电阻的关系', ['欧姆定律|U\\s*=\\s*I\\s*[×*·]?\\s*R'],
    '对适用元件使用 U＝IR，统一 V、A、Ω；LED 和三极管不能直接当作定值电阻套用。',
    '初中物理：电流、电压、电阻与欧姆定律；不是小学基础公式。',
    'MYP 科学：电路测量与物理量关系的参考关联，具体内容由学校安排。'],
  ['series', '串联与并联', ['电路|电流|电压|LED|灯泡', '串联|并联'],
    '辨认支路和连接方式，比较断开一个支路对其他用电器的影响。',
    '小学科学：电路连接的观察；初中物理：串并联及电流、电压规律。',
    'PYP 科学探究：电路连接；MYP 科学：电路结构与实验探究。'],
  ['heat', '加热、温度与材料变化', ['焊锡|焊接|热缩管|打印', '温度|高温|熔化|融化|加热'],
    '观察加热对材料形态和加工效果的影响，区分温度读数与加热时长。',
    '小学科学：温度与材料变化；初中物理：热现象，熔化需以实际活动为依据。',
    'PYP 科学探究：材料与变化；MYP 科学：物质与能量。'],
  ['investigation', '实验比较与误差', ['误差|控制变量|多次测量|记录数据|实验对比|实验比较'],
    '记录、比较实验结果，查找测量或加工差异的来源；有数据时再选择图表或统计方法。',
    '小学科学：观察、记录与比较；初中科学／物理：实验探究与测量误差。',
    'PYP：探究与证据；MYP 科学：探究设计、处理与评价实验结果。'],
  ['transistor', '三极管开关与放大（拓展）', ['三极管|S8050'],
    '基础关联是闭合电路与电流控制；三极管的截止、饱和和放大机制单独作为电子工程拓展。',
    '基础关联：小学科学／初中物理的电路；器件内部机制不列为义务教育必学条目。',
    '基础关联：PYP 电路探究／MYP 科学电路主题；三极管机制不声明为 IB 必修。', true],
  ['capacitor', '电容与 RC 延时（拓展）', ['电容|RC延时|RC 延时'],
    '观察充放电与延时现象；电容、RC 定量计算属于进阶电子学，不默认使用初中必修公式。',
    '基础关联：初中物理电能与电路；电容与 RC 定量分析作为拓展。',
    '基础关联：MYP 科学能量与电路探究；电容、RC 分析不声明为 IB 必修。', true],
  ['oscillation', '周期变化与振荡电路（拓展）', ['振荡|闪烁', '电容|三极管|周期|频率'],
    '观察闪烁周期、比较快慢；完整自激振荡电路原理作为工程拓展，不等同于初中波动课程。',
    '基础关联：时间测量与重复规律；自激振荡器设计属于拓展。',
    '基础关联：PYP 模式探究／MYP 科学周期现象；具体振荡器电路不声明为 IB 必修。', true]
].map(row => ({ id: row[0], title: row[1], groups: row[2], application: row[3], publicSchool: row[4], ib: row[5], extension: !!row[6] }));
function plain(value) {
  return String(value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/\s+/g, ' ').trim();
}
const FIELDS = ['name', 'subtitle', 'equipment', 'objectives', 'procedure'];
const LABELS = { name: '课程名称', subtitle: '副标题', equipment: '器材', objectives: '教学目标', procedure: '教学流程' };
function courseText(course) { return Object.fromEntries(FIELDS.map(key => [key, plain(course[key])])); }
function snapshot(course) { return JSON.stringify(courseText(course)); }
function matches(rule, text) { return rule.groups.every(group => new RegExp(group, 'i').test(text)); }
function excerpt(rule, text) {
  const match = new RegExp(rule.groups[0], 'i').exec(text);
  const start = Math.max(0, (match ? match.index : 0) - 30);
  return (start ? '…' : '') + text.slice(start, start + 160) + (text.length > start + 160 ? '…' : '');
}
function analyze(course) {
  const fields = courseText(course);
  const hasDetails = !!(fields.objectives || fields.procedure);
  const entries = [];
  for (const rule of RULES) {
    // A title or equipment alone is never evidence that an activity was taught.
    const detailField = ['objectives', 'procedure'].find(key => matches(rule, fields[key]));
    const hintField = ['name', 'subtitle', 'equipment'].find(key => matches(rule, fields[key]));
    if (!detailField && !hintField) continue;
    const field = detailField || hintField;
    entries.push({ ...rule, groups: undefined, status: detailField ? 'evidence' : 'candidate',
      evidenceField: LABELS[field], evidence: excerpt(rule, fields[field]) });
  }
  return { version: VERSION, sourceSnapshot: snapshot(course), generatedAt: new Date().toISOString(),
    confirmed: false, hasDetails, entries };
}
function stale(result, course) { return result.version !== VERSION || result.sourceSnapshot !== snapshot(course); }
function exportText(result, course) {
  if (!result || !Array.isArray(result.entries)) return '';
  const lines = ['学校知识点（学科主题参考，非官方逐条对标）', stale(result, course) ? '课程已修改，以下结果待重新提取。' : result.confirmed ? '教师已确认' : '待教师确认'];
  for (const item of result.entries) {
    lines.push('\n' + item.title + ' · ' + (item.extension ? '进阶拓展' : '基础关联') + ' · ' + (item.status === 'evidence' ? '有教案依据' : '候选关联'),
      '原文（' + item.evidenceField + '）：' + item.evidence, '应用说明：' + item.application,
      '公立学校：' + item.publicSchool, 'IB：' + item.ib);
  }
  if (!result.entries.length) lines.push('暂无可靠匹配，请补充教学目标或具体活动。');
  return lines.join('\n');
}
const api = { VERSION, SOURCES, RULES, plain, analyze, snapshot, stale, exportText };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SchoolKnowledge = api;
if (typeof document === 'undefined') return;
function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
}
function editorCourse() {
  const value = {};
  FIELDS.forEach(key => {
    const node = document.getElementById('doc-' + key);
    value[key] = node.isContentEditable ? node.innerHTML : node.value;
  });
  return value;
}
function currentSlot() { return root.docContext ? root.data[root.docContext.cat][root.docContext.index] : null; }
function refresh(reset) {
  const slot = currentSlot(); if (!slot) return;
  const body = document.getElementById('school-knowledge-content');
  const toggle = document.getElementById('school-knowledge-toggle');
  if (reset) { body.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.textContent = body.hidden ? '学校知识点 ▸ 展开' : '学校知识点 ▾ 收起';
  const result = slot.schoolKnowledge;
  const valid = result && Array.isArray(result.entries);
  const outdated = valid && stale(result, editorCourse());
  document.getElementById('school-knowledge-generate').textContent = valid ? '重新提取知识点' : '提取知识点';
  const status = document.getElementById('school-knowledge-status');
  status.textContent = !valid ? '尚未提取' : outdated ? '课程已修改，请重新提取' : result.confirmed ? '教师已确认 · ' + result.entries.length + ' 项' : '待教师确认 · ' + result.entries.length + ' 项';
  status.className = 'school-knowledge-status' + (outdated ? ' is-stale' : '');
  const confirm = document.getElementById('school-knowledge-confirm');
  confirm.hidden = !valid || !result.entries.length;
  confirm.disabled = outdated || !!(valid && result.confirmed);
  confirm.textContent = valid && result.confirmed && !outdated ? '已确认' : '确认并保存';
  body.replaceChildren();
  body.append(element('p', 'school-knowledge-note', '根据教案匹配公立学校（中国大陆小学／初中）与 IB PYP／MYP 的相关主题。以下为教学参考，非官方章节或固定年级对标；进阶内容单独标注。结果随课程保存，课程内容改变后需重新提取。'));
  if (!valid) {
    body.append(element('p', 'school-knowledge-empty', '写好教学目标和流程后，点击“提取知识点”。只有名称或器材时，只能给出候选关联。'));
    return;
  }
  if (outdated) body.append(element('p', 'school-knowledge-warning', '以下为上次结果，尚未随最新课程更新。重新提取后需要再次确认。'));
  if (!result.hasDetails) body.append(element('p', 'school-knowledge-warning', '缺少教学目标或流程。候选关联仅供备课参考，请补充实际活动后重新提取。'));
  if (!result.entries.length) body.append(element('p', 'school-knowledge-empty', '暂无可靠匹配。请补充具体教学活动；不必为每节课强行关联知识点。'));
  result.entries.forEach(item => {
    const card = element('article', 'school-knowledge-card');
    card.append(element('h4', '', item.title));
    card.append(element('p', 'school-knowledge-badge', (item.extension ? '进阶拓展' : '基础关联') + ' · ' + (item.status === 'evidence' ? '有教案依据' : '候选关联，需确认')));
    card.append(element('blockquote', '', item.evidenceField + '原文：“' + item.evidence + '”'));
    card.append(element('p', '', '应用说明：' + item.application));
    const columns = element('div', 'school-knowledge-columns');
    [['公立学校', item.publicSchool], ['IB 国际学校', item.ib]].forEach(pair => {
      const col = element('div'); col.append(element('h5', '', pair[0]), element('p', '', pair[1])); columns.append(col);
    });
    card.append(columns); body.append(card);
  });
  const sources = element('details', 'school-knowledge-sources');
  sources.append(element('summary', '', '课程框架参考与使用说明'));
  sources.append(element('p', '', '本地知识库版本 ' + VERSION + '。主题关联由本项目整理，尚未完成官方指南逐条核验；学校实际教学顺序可能不同。'));
  SOURCES.forEach(source => {
    const p = element('p'); const link = element('a', '', source.title);
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; p.append(link); sources.append(p);
  });
  body.append(sources);
}
root.refreshSchoolKnowledge = refresh;
document.getElementById('school-knowledge-toggle').addEventListener('click', () => {
  const body = document.getElementById('school-knowledge-content'); body.hidden = !body.hidden;
  document.getElementById('school-knowledge-toggle').setAttribute('aria-expanded', String(!body.hidden)); refresh(false);
});
document.getElementById('school-knowledge-generate').addEventListener('click', () => {
  const slot = currentSlot(); if (!slot) return;
  slot.schoolKnowledge = analyze(editorCourse());
  root.saveDocumentData();
  document.getElementById('school-knowledge-content').hidden = false;
  document.getElementById('school-knowledge-toggle').setAttribute('aria-expanded', 'true'); refresh(false);
});
document.getElementById('school-knowledge-confirm').addEventListener('click', () => {
  const slot = currentSlot(); if (!slot || !slot.schoolKnowledge || stale(slot.schoolKnowledge, editorCourse())) return;
  slot.schoolKnowledge.confirmed = true; root.saveDocumentData(); refresh(false);
});
document.getElementById('view-document').addEventListener('input', event => {
  if (FIELDS.some(key => event.target.id === 'doc-' + key)) refresh(false);
});
})(typeof window === 'undefined' ? globalThis : window);
