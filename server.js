const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const DIR = __dirname;
const HTML = path.join(DIR, 'index.html');
// PPT 保存到 E 盘 ppt 文件夹，按模块分类
const PPT_ROOT = 'E:/ppt';
const DATA_FILE = path.join(DIR, 'makex_data.json');

// 模块 key -> 分类文件夹名
const CAT_DIR = {
  inspire: 'Inspire',
  explorer: 'Explorer第一年',
  explorer2: 'Explorer第二年',
  challenge: 'Challenge'
};

function catFolder(cat) {
  const dir = CAT_DIR[cat] || '其他';
  const full = path.join(PPT_ROOT, dir);
  try { fs.mkdirSync(full, { recursive: true }); } catch (e) {}
  return full;
}

// 清理文件名，防止路径穿越
function safeName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

const sv = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = new URL(req.url, 'http://localhost');

  // 课程数据: GET /data.json 读取, POST /update 保存（用于同步到项目文件/Git）
  if (u.pathname === '/data.json' && req.method === 'GET') {
    let d = {};
    try { if (fs.existsSync(DATA_FILE)) d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { d = {}; }
    res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
    res.end(JSON.stringify(d));
    return;
  }
  if (u.pathname === '/update' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' });
        res.end(JSON.stringify({ ok: true, file: DATA_FILE }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json;charset=utf-8' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // 上传 PPT: POST /upload?cat=模块key&name=文件名
  if (req.method === 'POST' && u.pathname === '/upload') {
    const cat = u.searchParams.get('cat') || 'other';
    let name = u.searchParams.get('name') || '';
    if (!name.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: '缺少文件名' })); return; }
    name = safeName(name);
    const dir = catFolder(cat);
    const filePath = path.join(dir, name);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' });
        res.end(JSON.stringify({ ok: true, path: filePath, cat: cat, name: name }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json;charset=utf-8' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // 读取 PPT: GET /ppt/<分类>/<文件名>
  const pptPrefix = '/ppt/';
  if (req.method === 'GET' && u.pathname.indexOf(pptPrefix) === 0) {
    const rel = decodeURIComponent(u.pathname.slice(pptPrefix.length));
    const relPath = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(PPT_ROOT, relPath);
    if (!filePath.startsWith(path.resolve(PPT_ROOT)) && !filePath.startsWith(PPT_ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    try {
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      const types = { '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) { res.writeHead(500); res.end('Error'); }
    return;
  }

  // A single explicit static asset keeps direct-file and server usage aligned.
  if (u.pathname === '/school-knowledge.js' && req.method === 'GET') {
    try {
      const script = fs.readFileSync(path.join(DIR, 'school-knowledge.js'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/javascript;charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(script);
    } catch (e) { res.writeHead(404); res.end('Not found'); }
    return;
  }

  // 首页
  try {
    const html = fs.readFileSync(HTML, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
    res.end(html);
  } catch (e) { res.writeHead(404); res.end('Not found'); }
});

sv.listen(PORT, '0.0.0.0', function () {
  try { fs.mkdirSync(PPT_ROOT, { recursive: true }); } catch (e) {}
  console.log('MakeX server OK on http://localhost:' + PORT);
  console.log('PPT 保存目录: ' + PPT_ROOT);
});
