const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const DIR = __dirname;
const HTML = path.join(DIR, 'index.html');
// PPT 保存到 E 盘 ppt 文件夹，按模块分类
const PPT_ROOT = 'E:/ppt';
const DATA_FILE = path.join(DIR, 'makex_data.json');
const { syncCourses, validCourses, atomicSave } = require('./sync-courses');
let courseSyncBusy = false;
let dataWriteQueue = Promise.resolve();

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

function localSyncRequest(req) {
  const address = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  const port = String(sv.address().port);
  const hosts = ['localhost:' + port, '127.0.0.1:' + port, '[::1]:' + port];
  if (!hosts.includes(String(req.headers.host || '').toLowerCase())) return false;
  const origin = req.headers.origin;
  return !origin || origin === 'null' || hosts.some(host => origin === 'http://' + host);
}
const sv = http.createServer(function (req, res) {
  // Git is a local desktop action. Do not expose repository operations to LAN
  // clients, arbitrary websites, or DNS-rebinding hosts.
  if ((req.url || '').split('?')[0] === '/git-sync') {
    if (!localSyncRequest(req)) { res.writeHead(403); res.end('Local access only'); return; }
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-MakeX-Sync');
      res.writeHead(204); res.end(); return;
    }
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json;charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'POST' || req.headers['x-makex-sync'] !== '1' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      reply(403, { error: '请从本地 MakeX 页面点击同步按钮。' }); return;
    }
    if (courseSyncBusy) { reply(409, { error: '课程正在同步，请稍候。', code: 'BUSY' }); return; }
    courseSyncBusy = true;
    req.setEncoding('utf8');
    let body = ''; let bytes = 0; let ended = false; let processing = false;
    const release = () => { if (!ended) { ended = true; courseSyncBusy = false; } };
    req.on('aborted', () => { if (!processing) release(); }); req.on('error', () => { if (!processing) release(); });
    req.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes <= 32 * 1024 * 1024) body += chunk; });
    req.on('end', async () => {
      processing = true;
      let localBackup;
      try {
        if (bytes > 32 * 1024 * 1024) { reply(413, { error: '课程数据过大，请先拆分或减少图片。' }); return; }
        let courses;
        try { courses = JSON.parse(body); } catch { reply(400, { error: '课程数据格式错误。' }); return; }
        if (!validCourses(courses)) { reply(400, { error: '课程数据结构不完整。' }); return; }
        const saveIncoming = async () => {
          await dataWriteQueue.catch(() => {});
          const backupDir = path.join(DIR, '.makex-backups');
          await fs.promises.mkdir(backupDir, { recursive: true });
          if (fs.existsSync(DATA_FILE)) {
            await fs.promises.copyFile(DATA_FILE, path.join(backupDir, 'before-sync-' + Date.now() + '-' + require('node:crypto').randomUUID() + '.json'));
            localBackup = '.makex-backups';
          }
          await atomicSave(DATA_FILE, courses);
        };
        let result;
        try { result = await syncCourses({ cwd: DIR, beforeSync: saveIncoming }); }
        catch (error) {
          // ZIP users can still save lessons even before setting up Git.
          if (error.code === 'NO_REPOSITORY' || error.code === 'NO_GIT') await saveIncoming();
          throw error;
        }
        reply(200, result);
      } catch (error) {
        reply(['REMOTE_DATA_CHANGED', 'DIVERGED', 'BUSY'].includes(error.code) ? 409 : 500,
          { error: error.code ? error.message : '同步未完成，课程仍保留在本地。', code: error.code || 'SAVE_FAILED', backup: error.backup || localBackup });
      } finally { release(); }
    });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = new URL(req.url, 'http://localhost');

  // 课程数据: GET /data.json 读取, POST /update 保存（用于同步到项目文件/Git）
  if (u.pathname === '/data.json' && req.method === 'GET') {
    if (courseSyncBusy) { res.writeHead(503); res.end('Sync in progress'); return; }
    let d = {};
    try { if (fs.existsSync(DATA_FILE)) d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { d = {}; }
    res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
    res.end(JSON.stringify(d));
    return;
  }
  if (u.pathname === '/update' && req.method === 'POST') {
    if (courseSyncBusy) { res.writeHead(409); res.end('Sync in progress'); return; }
    req.setEncoding('utf8');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        if (courseSyncBusy) { res.writeHead(409); res.end('Sync in progress'); return; }
        const write = dataWriteQueue.catch(() => {}).then(() => atomicSave(DATA_FILE, parsed));
        dataWriteQueue = write;
        await write;
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
  if (['/school-knowledge.js', '/course-images.js', '/git-sync-client.js'].includes(u.pathname) && req.method === 'GET') {
    try {
      const script = fs.readFileSync(path.join(DIR, u.pathname.slice(1)), 'utf8');
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
