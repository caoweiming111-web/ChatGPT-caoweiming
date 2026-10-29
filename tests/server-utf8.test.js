const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
test('large image saves preserve Chinese captions across UTF-8 chunk boundaries', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makex-utf8-'));
  await fs.copyFile(path.join(__dirname, '../server.js'), path.join(dir, 'server.js'));
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await fs.rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('startup timeout')), 5000);
    child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    child.once('exit', code => { clearTimeout(timeout); reject(Error('server exited: ' + code)); });
  });
  const courses = { inspire: [], explorer: [{ name: '中文课程', images: [{ src: 'data:image/jpeg;base64,' + 'A'.repeat(100000), caption: '步骤说明：机器人结构' }] }], explorer2: [], challenge: [] };
  const bytes = Buffer.from(JSON.stringify(courses));
  const split = bytes.indexOf(Buffer.from('步骤')) + 1;
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/update', method: 'POST', headers: { 'Content-Length': bytes.length, 'Content-Type': 'application/json' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.write(bytes.subarray(0, split));
    setTimeout(() => request.end(bytes.subarray(split)), 20);
  });
  assert.equal(status, 200);
  const saved = await (await fetch('http://127.0.0.1:' + port + '/data.json')).json();
  assert.deepEqual(saved, courses);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'makex_data.json'), 'utf8')), courses);
});
