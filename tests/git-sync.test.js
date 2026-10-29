const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { syncCourses, correctRemote } = require('../sync-courses');
const URL = 'https://github.com/caoweiming111-web/ChatGPT-caoweiming.git';
const base = () => ({ inspire: [], explorer: [{ name: '原始课程' }], explorer2: [], challenge: [] });
async function git(cwd, ...args) { return (await exec('git', args, { cwd })).stdout.trim(); }
async function write(cwd, data) { await fs.writeFile(path.join(cwd, 'makex_data.json'), JSON.stringify(data)); }
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makex-sync-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git'); const local = path.join(dir, 'local'); const other = path.join(dir, 'other');
  await fs.mkdir(local); await git(dir, 'init', '--bare', '--initial-branch=main', remote);
  await git(local, 'init', '--initial-branch=main');
  await git(local, 'config', 'user.name', 'Sync Test'); await git(local, 'config', 'user.email', 'sync@example.invalid');
  await write(local, base()); await fs.writeFile(path.join(local, 'code.txt'), 'initial');
  await git(local, 'add', '.'); await git(local, 'commit', '-m', 'initial');
  await git(local, 'remote', 'add', 'origin', URL);
  // Real Git transports, commits and pushes, routed to a local bare repository.
  await git(local, 'config', 'url.' + remote + '.insteadOf', URL);
  await git(local, 'push', 'origin', 'main');
  await git(dir, 'clone', remote, other);
  await git(other, 'config', 'user.name', 'Other Test'); await git(other, 'config', 'user.email', 'other@example.invalid');
  return { dir, local, other, remote };
}
async function remoteCommit(other, file, contents) {
  await fs.writeFile(path.join(other, file), contents); await git(other, 'add', file);
  await git(other, 'commit', '-m', 'remote update'); await git(other, 'push', 'origin', 'main');
}
test('remote identity permits only the intended repository, without embedded credentials', () => {
  assert.ok(correctRemote(URL)); assert.ok(correctRemote('git@github.com:caoweiming111-web/ChatGPT-caoweiming.git'));
  for (const remote of ['https://user:password@github.com/caoweiming111-web/ChatGPT-caoweiming.git', 'https://github.com/caoweiming111-web/makex.git', 'https://github.com.evil.test/caoweiming111-web/ChatGPT-caoweiming.git']) assert.equal(correctRemote(remote), false);
});
test('uploads new lessons, embedded pictures and knowledge, but excludes unrelated files; repeats safely', async t => {
  const { local, remote } = await fixture(t);
  const courses = base(); courses.explorer.push({ name: '新增中文课', images: [{ src: 'data:image/png;base64,AAAA', caption: '结构说明' }], schoolKnowledge: { confirmed: true } });
  await write(local, courses); await fs.writeFile(path.join(local, 'code.txt'), 'unsaved local code');
  const result = await syncCourses({ cwd: local }); assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), courses);
  assert.equal(await git(remote, 'show', 'main:code.txt'), 'initial');
  assert.equal(await fs.readFile(path.join(local, 'code.txt'), 'utf8'), 'unsaved local code');
  assert.equal((await fs.readdir(path.join(local, '.git/makex-course-backups'))).length, 1);
  const again = await syncCourses({ cwd: local }); assert.equal(again.commit, result.commit); assert.equal(again.upToDate, true);
});
test('fast-forwards remote code updates while preserving local course edits', async t => {
  const { local, other, remote } = await fixture(t);
  const courses = base(); courses.explorer.push({ name: '本地新课' }); await write(local, courses);
  await remoteCommit(other, 'code.txt', 'new code');
  const result = await syncCourses({ cwd: local }); assert.equal(result.updatedCode, true);
  assert.equal(await fs.readFile(path.join(local, 'code.txt'), 'utf8'), 'new code');
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), courses);
});
test('remote course conflict preserves both versions and creates a local backup', async t => {
  const { local, other, remote } = await fixture(t);
  const mine = base(); mine.explorer.push({ name: '本地新课' }); await write(local, mine);
  const theirs = base(); theirs.explorer.push({ name: '远端新课' });
  await remoteCommit(other, 'makex_data.json', JSON.stringify(theirs));
  const before = await git(remote, 'rev-parse', 'main');
  await assert.rejects(syncCourses({ cwd: local }), { code: 'REMOTE_DATA_CHANGED' });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(local, 'makex_data.json'), 'utf8')), mine);
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), theirs);
  assert.equal(await git(remote, 'rev-parse', 'main'), before);
  assert.equal((await fs.readdir(path.join(local, '.git/makex-course-backups'))).length, 1);
});
test('rejects old repositories, wrong branches, and existing staged changes', async t => {
  const { local } = await fixture(t);
  await git(local, 'remote', 'set-url', 'origin', 'https://github.com/caoweiming111-web/makex.git');
  await assert.rejects(syncCourses({ cwd: local }), { code: 'WRONG_REMOTE' });
  await git(local, 'remote', 'set-url', 'origin', URL); await git(local, 'switch', '-c', 'master');
  await assert.rejects(syncCourses({ cwd: local }), { code: 'WRONG_BRANCH' });
  await git(local, 'switch', 'main'); await fs.writeFile(path.join(local, 'code.txt'), 'staged code'); await git(local, 'add', 'code.txt');
  await assert.rejects(syncCourses({ cwd: local }), { code: 'STAGED_CHANGES' });
  assert.equal(await git(local, 'diff', '--cached', '--name-only'), 'code.txt');
});
test('does not push unrelated local code commits', async t => {
  const { local, remote } = await fixture(t); const before = await git(remote, 'rev-parse', 'main');
  await fs.writeFile(path.join(local, 'code.txt'), 'local code commit'); await git(local, 'add', 'code.txt'); await git(local, 'commit', '-m', 'code change');
  await assert.rejects(syncCourses({ cwd: local }), { code: 'PENDING_CODE_COMMITS' });
  assert.equal(await git(remote, 'rev-parse', 'main'), before);
});
test('failed fast-forward restores the exact local course file', async t => {
  const { local, other } = await fixture(t); const mine = base(); mine.explorer.push({ name: '保留这节课' }); await write(local, mine);
  await remoteCommit(other, 'new-file.txt', 'remote tracked'); await fs.writeFile(path.join(local, 'new-file.txt'), 'local untracked');
  await assert.rejects(syncCourses({ cwd: local }));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(local, 'makex_data.json'), 'utf8')), mine);
  assert.equal(await fs.readFile(path.join(local, 'new-file.txt'), 'utf8'), 'local untracked');
});
test('push failure keeps local commit and retries without duplicate commits', async t => {
  const { local, remote } = await fixture(t); const mine = base(); mine.explorer.push({ name: '待上传课程' }); await write(local, mine);
  const hook = path.join(remote, 'hooks/pre-receive'); await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  await assert.rejects(syncCourses({ cwd: local }), { code: 'PUSH_FAILED' });
  const commit = await git(local, 'rev-parse', 'HEAD'); await fs.rm(hook);
  const retry = await syncCourses({ cwd: local }); assert.equal(retry.commit, commit);
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), mine);
});
test('detects an existing synchronization lock and never removes someone else’s lock', async t => {
  const { local } = await fixture(t); const lock = path.join(local, '.git/makex-course-sync.lock'); await fs.writeFile(lock, 'existing');
  await assert.rejects(syncCourses({ cwd: local }), { code: 'BUSY' });
  assert.equal(await fs.readFile(lock, 'utf8'), 'existing');
});
test('explains ZIP downloads without Git metadata and preserves their files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makex-zip-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); await write(dir, base());
  await assert.rejects(syncCourses({ cwd: dir }), { code: 'NO_REPOSITORY' });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'makex_data.json'), 'utf8')), base());
});
test('adds a previously untracked course file even when an old ignore rule excludes it', async t => {
  const { local, remote } = await fixture(t);
  await git(local, 'rm', 'makex_data.json'); await git(local, 'commit', '-m', 'remove old data'); await git(local, 'push', 'origin', 'main');
  await fs.writeFile(path.join(local, '.gitignore'), 'makex_data.json\n');
  const courses = base(); courses.explorer.push({ name: '首次上传的数据' }); await write(local, courses);
  const result = await syncCourses({ cwd: local }); assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(await git(remote, 'show', 'main:makex_data.json')), courses);
});
test('legacy batch scripts contain no embedded credentials or hardcoded personal project directory', async () => {
  for (const name of ['push-to-github.bat', 'push-to-github-token.bat', '推送到GitHub.bat', '启动MakeX.bat', 'start-server.bat']) {
    const script = await fs.readFile(path.join(__dirname, '..', name), 'utf8');
    assert.doesNotMatch(script, /https:\/\/[^/\s]+@github\.com|git\s+push[^\r\n]*master|git\s+config\s+user|C:\\Users\\/i);
  }
});
