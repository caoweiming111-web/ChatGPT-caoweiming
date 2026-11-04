const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const { syncLocalCourses } = require('../managed-git-sync');
const URL = 'https://github.com/caoweiming111-web/ChatGPT-caoweiming.git';
const base = () => ({ inspire: [], explorer: [{ name: '原始课程' }], explorer2: [], challenge: [] });
async function git(cwd, ...args) { return (await execute('git', args, { cwd })).stdout.trim(); }
async function write(cwd, data) { await fs.writeFile(path.join(cwd, 'makex_data.json'), JSON.stringify(data, null, 2) + '\n'); }
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makex-managed-test-'));
  const remote = path.join(dir, 'remote.git'); const seed = path.join(dir, 'seed'); const local = path.join(dir, 'zip'); const other = path.join(dir, 'other');
  const saved = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  process.env.GIT_CONFIG_GLOBAL = path.join(dir, 'global-git-config'); process.env.GIT_CONFIG_NOSYSTEM = '1';
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.mkdir(local); await fs.mkdir(seed);
  await git(dir, 'config', '--global', 'user.name', 'Managed Sync Test'); await git(dir, 'config', '--global', 'user.email', 'sync@example.invalid');
  // The production URL remains fixed. Only this isolated test Git config
  // rewrites its transport to a real, temporary bare repository.
  await git(dir, 'config', '--global', 'url.' + remote + '.insteadOf', URL);
  await git(dir, 'init', '--bare', '--initial-branch=main', remote);
  await git(seed, 'init', '--initial-branch=main');
  await write(seed, base()); await write(local, base());
  await fs.writeFile(path.join(seed, 'code.txt'), 'remote program');
  await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'initial');
  await git(seed, 'remote', 'add', 'origin', URL); await git(seed, 'push', 'origin', 'main');
  await git(dir, 'clone', remote, other);
  return { dir, remote, seed, local, other };
}
async function updateRemote(other, courses) {
  await write(other, courses); await git(other, 'add', 'makex_data.json'); await git(other, 'commit', '-m', 'remote courses'); await git(other, 'push', 'origin', 'main');
}
async function setupError(options) {
  let result;
  await assert.rejects(syncLocalCourses(options), error => { result = error; return error.code === 'SYNC_SETUP_REQUIRED'; });
  return result;
}
test('ZIP with semantically equal data establishes a baseline without changing source bytes or making commits', async t => {
  const { local, remote } = await fixture(t); const initial = await git(remote, 'rev-parse', 'main');
  const raw = '\uFEFF' + JSON.stringify({ challenge: [], explorer2: [], explorer: base().explorer, inspire: [] }, null, 4) + '\r\n';
  await fs.writeFile(path.join(local, 'makex_data.json'), raw);
  const result = await syncLocalCourses({ cwd: local });
  assert.equal(result.ok, true); assert.equal(result.managed, true); assert.equal(result.upToDate, true);
  assert.equal(await git(remote, 'rev-parse', 'main'), initial);
  assert.equal(await fs.readFile(path.join(local, 'makex_data.json'), 'utf8'), raw);
  assert.equal(JSON.parse(await fs.readFile(path.join(local, '.makex-github/.git/makex-managed.json'), 'utf8')).initialized, true);
  await assert.rejects(fs.stat(path.join(local, '.git')), { code: 'ENOENT' });
});
test('different first-use data is saved locally but never uploaded without explicit confirmation', async t => {
  const { local, remote } = await fixture(t); const initial = await git(remote, 'rev-parse', 'main');
  const mine = base(); mine.explorer.push({ name: '本机新课' }); let saved = false;
  const error = await setupError({ cwd: local, beforeSync: async () => { saved = true; await write(local, mine); } });
  assert.equal(saved, true); assert.equal(error.setup.remoteCommit, initial);
  assert.equal(error.setup.localCounts.explorer, 2); assert.equal(error.setup.remoteCounts.explorer, 1);
  assert.equal(await git(remote, 'rev-parse', 'main'), initial);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(local, 'makex_data.json'), 'utf8')), mine);
  assert.equal(JSON.parse(await fs.readFile(path.join(local, '.makex-github/.git/makex-managed.json'), 'utf8')).initialized, false);
});
test('confirming the displayed main SHA uploads only the exact local course data through real Git', async t => {
  const { local, remote } = await fixture(t); const mine = base(); mine.explorer.push({ name: '已确认的新课', images: ['data:image/png;base64,AAA'] });
  await write(local, mine); await fs.writeFile(path.join(local, 'code.txt'), 'user program'); await fs.writeFile(path.join(local, 'private.txt'), 'private');
  const before = await fs.readFile(path.join(local, 'makex_data.json')); const pending = await setupError({ cwd: local });
  const result = await syncLocalCourses({ cwd: local, confirmedRemoteCommit: pending.setup.remoteCommit });
  assert.equal(result.ok, true); assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), mine);
  assert.equal(await git(remote, 'show', 'main:code.txt'), 'remote program');
  assert.equal(await git(remote, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'main'), 'makex_data.json');
  assert.deepEqual(await fs.readFile(path.join(local, 'makex_data.json')), before);
  assert.equal(await fs.readFile(path.join(local, 'private.txt'), 'utf8'), 'private');
  const again = await syncLocalCourses({ cwd: local }); assert.equal(again.commit, result.commit); assert.equal(again.upToDate, true);
});
test('a remote advance invalidates first-use confirmation and requires confirmation of the new SHA', async t => {
  const { local, other, remote } = await fixture(t); const mine = base(); mine.explorer.push({ name: '本地版本' }); await write(local, mine);
  const pending = await setupError({ cwd: local }); const theirs = base(); theirs.explorer.push({ name: '远端新增' }); await updateRemote(other, theirs);
  const current = await git(remote, 'rev-parse', 'main');
  const renewed = await setupError({ cwd: local, confirmedRemoteCommit: pending.setup.remoteCommit });
  assert.equal(renewed.setup.remoteCommit, current); assert.equal(renewed.setup.remoteCounts.explorer, 2);
  assert.equal(await git(remote, 'rev-parse', 'main'), current);
  await syncLocalCourses({ cwd: local, confirmedRemoteCommit: current });
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), mine);
});
test('after baseline establishment, simultaneous remote course changes remain protected by the existing core', async t => {
  const { local, other, remote } = await fixture(t); await syncLocalCourses({ cwd: local });
  const mine = base(); mine.explorer.push({ name: '本机保留' }); await write(local, mine);
  const theirs = base(); theirs.explorer.push({ name: 'GitHub 保留' }); await updateRemote(other, theirs);
  const initial = await git(remote, 'rev-parse', 'main');
  await assert.rejects(syncLocalCourses({ cwd: local, confirmedRemoteCommit: initial }), { code: 'REMOTE_DATA_CHANGED' });
  assert.equal(await git(remote, 'rev-parse', 'main'), initial);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(local, 'makex_data.json'), 'utf8')), mine);
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), theirs);
  assert.ok((await fs.readdir(path.join(local, '.makex-github/.git/makex-course-backups'))).length > 0);
});
test('an unknown cache directory is never adopted, removed, or overwritten', async t => {
  const { local, remote } = await fixture(t); const initial = await git(remote, 'rev-parse', 'main');
  await fs.mkdir(path.join(local, '.makex-github')); await fs.writeFile(path.join(local, '.makex-github/user.txt'), 'keep me');
  await assert.rejects(syncLocalCourses({ cwd: local }), { code: 'SYNC_CACHE_CONFLICT' });
  assert.equal(await fs.readFile(path.join(local, '.makex-github/user.txt'), 'utf8'), 'keep me');
  assert.equal(await git(remote, 'rev-parse', 'main'), initial);
});
test('a ZIP mutex prevents a second process from saving or removing somebody else’s lock', async t => {
  const { local } = await fixture(t); const lock = path.join(local, '.makex-github.lock'); await fs.writeFile(lock, 'existing');
  let saved = false;
  await assert.rejects(syncLocalCourses({ cwd: local, beforeSync: async () => { saved = true; } }), { code: 'BUSY' });
  assert.equal(saved, false); assert.equal(await fs.readFile(lock, 'utf8'), 'existing');
});
test('linked worktrees with a .git file use original repository safeguards rather than ZIP setup', async t => {
  const { dir, seed } = await fixture(t); const worktree = path.join(dir, 'worktree');
  await git(seed, 'branch', '-m', 'source'); await git(seed, 'worktree', 'add', '-b', 'main', worktree, 'HEAD');
  assert.equal((await fs.stat(path.join(worktree, '.git'))).isFile(), true);
  const result = await syncLocalCourses({ cwd: worktree }); assert.equal(result.ok, true); assert.equal(result.managed, undefined);
  await assert.rejects(fs.stat(path.join(worktree, '.makex-github')), { code: 'ENOENT' });
  await git(worktree, 'switch', '-c', 'do-not-upload');
  await assert.rejects(syncLocalCourses({ cwd: worktree }), { code: 'WRONG_BRANCH' });
});


test('managed cache code updates do not claim that the running program folder was updated', async t => {
  const { local, other } = await fixture(t);
  await fs.writeFile(path.join(local, 'program.txt'), 'user running program');
  await syncLocalCourses({ cwd: local });
  await fs.writeFile(path.join(other, 'code.txt'), 'new remote program'); await git(other, 'add', 'code.txt'); await git(other, 'commit', '-m', 'program update'); await git(other, 'push', 'origin', 'main');
  const mine = base(); mine.explorer.push({ name: 'new local lesson' }); await write(local, mine);
  const result = await syncLocalCourses({ cwd: local });
  assert.equal(result.ok, true); assert.equal(result.updatedCode, false); assert.equal(result.updateAvailable, true);
  assert.equal(await fs.readFile(path.join(local, 'program.txt'), 'utf8'), 'user running program');
});
