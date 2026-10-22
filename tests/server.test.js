const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');
async function start(file) {
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    env: { ...process.env, PORT: '0', MAKEX_DATA_FILE: file }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('startup timeout')); }, 5000);
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/port (\d+)/);
      if (match) { clearTimeout(timeout); resolve('http://127.0.0.1:' + match[1]); }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(Error('startup failed ' + code + ': ' + errors)); });
  });
  return { url, async stop() { child.kill(); await once(child, 'exit'); } };
}
test('course loading, updates, validation and durable storage', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makex-test-'));
  const file = path.join(dir, 'courses.json');
  await fs.copyFile(path.join(root, 'makex_data.json'), file);
  let app = await start(file);
  t.after(async () => { if (app) await app.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  let initial;
  await t.test('homepage and recovered course data load', async () => {
    const html = await fetch(app.url);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /MakeX/);
    initial = await (await fetch(app.url + '/data.json')).json();
    assert.equal(initial.explorer.length, 48);
    assert.match(initial.explorer[4].name, /基于Onshape与激光雕刻机的齿轮的制作/);
  });
  const next = structuredClone(initial);
  next.explorer.push({ name: '中文保存测试', subtitle: '重启后保留' });
  await t.test('saved edits are visible to another client and written to disk', async () => {
    const r = await fetch(app.url + '/update', { method: 'POST', body: JSON.stringify(next) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.deepEqual(await (await fetch(app.url + '/data.json')).json(), next);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), next);
  });
  await t.test('invalid requests preserve the last saved data', async () => {
    for (const body of ['{broken', '{}', 'null', '{"inspire":[]}']) {
      assert.equal((await fetch(app.url + '/update', { method: 'POST', body })).status, 400);
    }
    assert.deepEqual(await (await fetch(app.url + '/data.json')).json(), next);
  });
  await t.test('saved edits survive restart', async () => {
    await app.stop(); app = null;
    app = await start(file);
    assert.deepEqual(await (await fetch(app.url + '/data.json')).json(), next);
  });
  await t.test('disk failure is reported without changing in-memory data', async () => {
    await fs.mkdir(file + '.tmp');
    assert.equal((await fetch(app.url + '/update', { method: 'POST', body: JSON.stringify(initial) })).status, 500);
    assert.deepEqual(await (await fetch(app.url + '/data.json')).json(), next);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), next);
  });
});
