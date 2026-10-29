const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { once } = require('node:events');
const exec = promisify(execFile);
async function git(cwd, ...args) { return (await exec('git', args, { cwd })).stdout.trim(); }
async function request(port, { body, headers = {}, method = 'POST' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: '/git-sync', headers: { 'Content-Type': 'application/json', 'X-MakeX-Sync': '1', ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, body: text, headers: res.headers }));
    }); req.on('error', reject); req.end(body);
  });
}
test('local-only Git HTTP endpoint saves, backs up and uploads actual course payloads', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makex-git-http-'));
  const app = path.join(dir, 'app'); const remote = path.join(dir, 'remote.git'); await fs.mkdir(app);
  for (const name of ['server.js', 'sync-courses.js']) await fs.copyFile(path.join(__dirname, '..', name), path.join(app, name));
  const original = { inspire: [], explorer: [{ name: '原课程' }], explorer2: [], challenge: [] };
  await fs.writeFile(path.join(app, 'makex_data.json'), JSON.stringify(original));
  await git(dir, 'init', '--bare', '--initial-branch=main', remote); await git(app, 'init', '--initial-branch=main');
  await git(app, 'config', 'user.name', 'HTTP Test'); await git(app, 'config', 'user.email', 'http@example.invalid');
  await git(app, 'add', '.'); await git(app, 'commit', '-m', 'initial');
  const target = 'https://github.com/caoweiming111-web/ChatGPT-caoweiming.git';
  await git(app, 'remote', 'add', 'origin', target); await git(app, 'config', 'url.' + remote + '.insteadOf', target); await git(app, 'push', 'origin', 'main');
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening'); const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } await fs.rm(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('startup timeout')), 5000); child.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); child.once('exit', code => { clearTimeout(timeout); reject(Error('server exit: ' + code)); }); });
  await t.test('rejects foreign websites, missing action header and rebinding hosts', async () => {
    const before = await git(remote, 'rev-parse', 'main');
    for (const headers of [{ Origin: 'https://evil.example' }, { Host: 'evil.example:' + port }, { 'X-MakeX-Sync': '' }]) {
      assert.equal((await request(port, { body: JSON.stringify(original), headers })).status, 403);
    }
    assert.equal((await request(port, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403);
    const allowed = await request(port, { method: 'OPTIONS', headers: { Origin: 'null' } }); assert.equal(allowed.status, 204); assert.equal(allowed.headers['access-control-allow-origin'], 'null');
    assert.equal(await git(remote, 'rev-parse', 'main'), before);
  });
  await t.test('rejects invalid data before touching the saved file', async () => {
    for (const body of ['broken', '{}', 'null']) assert.equal((await request(port, { body })).status, 400);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(app, 'makex_data.json'), 'utf8')), original);
  });
  const changed = structuredClone(original); changed.explorer.push({ name: '新增课程', images: [{ src: 'data:image/png;base64,AAAA', caption: '中文配图' }] });
  await t.test('uploads browser edits and embedded pictures with a pre-save backup', async () => {
    const r = await request(port, { body: JSON.stringify(changed), headers: { Origin: 'http://localhost:' + port } }); assert.equal(r.status, 200); assert.equal(JSON.parse(r.body).ok, true);
    assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), changed);
    const backups = await fs.readdir(path.join(app, '.makex-backups')); assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(app, '.makex-backups', backups[0]), 'utf8')), original);
    assert.equal(await git(app, 'show', '--format=', '--name-only', 'HEAD'), 'makex_data.json');
  });
  await t.test('Git lock prevents a second process from modifying the course file', async () => {
    const lock = path.join(app, '.git/makex-course-sync.lock'); await fs.writeFile(lock, 'external');
    const r = await request(port, { body: JSON.stringify(original) }); assert.equal(r.status, 409); assert.equal(JSON.parse(r.body).code, 'BUSY');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(app, 'makex_data.json'), 'utf8')), changed);
    assert.equal(await fs.readFile(lock, 'utf8'), 'external'); await fs.rm(lock);
  });
});
