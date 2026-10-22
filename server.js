const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3456;
const HTML = path.join(__dirname, 'index.html');
const DATA = process.env.MAKEX_DATA_FILE || path.join(__dirname, 'makex_data.json');
const categories = ['inspire', 'explorer', 'explorer2', 'challenge'];
function validData(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    categories.every(key => Array.isArray(value[key]) && value[key].every(
      course => course && typeof course === 'object' && !Array.isArray(course)));
}
let data = { inspire: [], explorer: [], explorer2: [], challenge: [] };
try {
  if (fs.existsSync(DATA)) {
    data = JSON.parse(fs.readFileSync(DATA, 'utf8').replace(/^\uFEFF/, ''));
    if (!data.explorer2) data.explorer2 = [];
    if (!validData(data)) throw new Error('Invalid course structure');
  }
} catch (error) {
  console.error('Cannot load course data:', error.message);
  process.exit(1);
}
const sv = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  function json(status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json;charset=utf-8' });
    res.end(JSON.stringify(value));
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url === '/data.json' && req.method === 'GET') { json(200, data); return; }
  if (req.url === '/update' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let next;
      try { next = JSON.parse(body); }
      catch { json(400, { error: 'bad json' }); return; }
      if (!validData(next)) { json(400, { error: 'invalid course data' }); return; }
      const temporary = DATA + '.tmp';
      try {
        fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8');
        fs.renameSync(temporary, DATA);
        data = next;
        json(200, { ok: true });
      } catch (error) {
        console.error('Cannot save course data:', error.message);
        try { fs.unlinkSync(temporary); } catch {}
        json(500, { error: 'cannot save course data' });
      }
    });
    return;
  }
  try {
    const html = fs.readFileSync(HTML, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(html);
  } catch { res.writeHead(404); res.end('Not found'); }
});
sv.listen(PORT, '0.0.0.0', () => console.log('MakeX server OK on port ' + sv.address().port));
