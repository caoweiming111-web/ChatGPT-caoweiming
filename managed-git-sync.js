'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const { syncCourses, validCourses, correctRemote, atomicSave, SyncError, findGitExecutable, createGitEnv, classifyGitError } = require('./sync-courses');
const execute = promisify(execFile);
const REPOSITORY = 'caoweiming111-web/ChatGPT-caoweiming';
const URL = 'https://github.com/' + REPOSITORY + '.git';
const CACHE = '.makex-github';
const MARKER = 'makex-managed.json';
const DATA = 'makex_data.json';
async function git(cwd, args, raw = false) {
  const executable = await findGitExecutable();
  try { const { stdout } = await execute(executable, args, { cwd, env: createGitEnv(), timeout: 90000, maxBuffer: 64 * 1024 * 1024, windowsHide: true }); return raw ? stdout : stdout.trim(); }
  catch (error) { throw classifyGitError(error, args[0]); }
}
async function exists(file) { return fs.lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }); }
function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, semantic(value[key])]));
  return value;
}
function counts(courses) { return Object.fromEntries(['inspire', 'explorer', 'explorer2', 'challenge'].map(key => [key, courses[key].length])); }
function parseCourses(contents) {
  let courses;
  try { courses = JSON.parse(String(contents).replace(/^\uFEFF/, '')); } catch {}
  if (!validCourses(courses)) throw new SyncError('BAD_DATA', '课程文件无效，同步已停止；请先检查或恢复 makex_data.json。');
  return courses;
}
function cacheConflict() { return new SyncError('SYNC_CACHE_CONFLICT', '.makex-github 文件夹已有无法识别的内容，同步已停止。请先备份并移走该文件夹后重试；程序不会删除其中的文件。'); }
function validMarker(marker) {
  return marker && marker.version === 1 && marker.repository === REPOSITORY && typeof marker.initialized === 'boolean';
}
async function hasExplicitConnection(cwd) {
  const cache = path.join(cwd, CACHE);
  for (const directory of [cache, path.join(cache, '.git')]) {
    const stat = await fs.lstat(directory).catch(() => null);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return false;
  }
  try {
    const marker = JSON.parse(await fs.readFile(path.join(cache, '.git', MARKER), 'utf8'));
    return Boolean(validMarker(marker) && marker.sourceConnection === 'explicit');
  } catch { return false; }
}

async function managedRepository(cwd, explicitConnection) {
  const cache = path.join(cwd, CACHE);
  if (!await exists(cache)) {
    // Clone in a private temporary directory. Only directories created by this
    // invocation are cleaned up; an existing user directory is never replaced.
    const temporary = await fs.mkdtemp(path.join(cwd, CACHE + '-setup-'));
    try {
      await git(cwd, ['clone', '--no-tags', '--single-branch', '--branch', 'main', '--', URL, temporary]);
      await atomicSave(path.join(temporary, '.git', MARKER), { version: 1, repository: REPOSITORY, initialized: false });
      if (await exists(cache)) throw cacheConflict();
      await fs.rename(temporary, cache);
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  }
  const stat = await fs.lstat(cache);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw cacheConflict();
  const gitDir = path.join(cache, '.git');
  const gitStat = await fs.lstat(gitDir).catch(() => null);
  if (!gitStat || !gitStat.isDirectory() || gitStat.isSymbolicLink()) throw cacheConflict();
  let marker;
  try { marker = JSON.parse(await fs.readFile(path.join(gitDir, MARKER), 'utf8')); } catch { throw cacheConflict(); }
  if (!validMarker(marker)) throw cacheConflict();
  const root = await git(cache, ['rev-parse', '--show-toplevel']);
  if (await fs.realpath(root) !== await fs.realpath(cache)) throw cacheConflict();
  const origin = (await git(cache, ['config', '--get-all', 'remote.origin.url'])).split('\n').filter(Boolean);
  if (origin.length !== 1 || !correctRemote(origin[0])) throw new SyncError('WRONG_REMOTE', '受管同步仓库的 origin 地址不正确；同步已停止，不会改写该地址。');
  const markerPath = path.join(gitDir, MARKER);
  // Only the explicit connect action may select this independent repository
  // for future clicks. It does not authorize replacing remote course data.
  if (explicitConnection && marker.sourceConnection !== 'explicit') {
    marker = { ...marker, sourceConnection: 'explicit' };
    await atomicSave(markerPath, marker);
  }
  return { cache, marker, markerPath };
}

async function syncLocalCourses({ cwd = __dirname, beforeSync, confirmedRemoteCommit, useManagedRepository = false } = {}) {
  const explicitConnection = useManagedRepository === true;
  const useManaged = explicitConnection || await hasExplicitConnection(cwd);
  // A linked worktree has a .git *file*. It is still a real repository and
  // retains its existing safeguards unless a separate connection was chosen.
  if (!useManaged) {
    if (await exists(path.join(cwd, '.git'))) return syncCourses({ cwd, beforeSync });
    let executable;
    try { executable = await findGitExecutable(); } catch (error) { if (error.code !== 'NO_GIT') throw error; }
    try {
      if (executable) {
        await execute(executable, ['rev-parse', '--show-toplevel'], { cwd, env: createGitEnv(), windowsHide: true });
        return syncCourses({ cwd, beforeSync });
      }
    } catch (error) {
      if (!/not a git repository/i.test(String(error.stderr || ''))) throw classifyGitError(error, 'rev-parse');
    }
  }
  const lockPath = path.join(cwd, CACHE + '.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new SyncError('BUSY', '另一个课程同步任务正在运行；请稍候重试。'); throw error; }
  try {
    if (beforeSync) await beforeSync();
    const contents = await fs.readFile(path.join(cwd, DATA));
    let cacheContents = contents;
    const courses = parseCourses(contents);
    await git(cwd, ['--version']);
    const { cache, marker, markerPath } = await managedRepository(cwd, explicitConnection);
    if (!marker.initialized) {
      await git(cache, ['fetch', '--no-tags', 'origin', 'refs/heads/main']);
      const remoteCommit = await git(cache, ['rev-parse', 'FETCH_HEAD']);
      const remoteContents = await git(cache, ['show', remoteCommit + ':' + DATA], true);
      const remoteCourses = parseCourses(remoteContents);
      const identical = JSON.stringify(semantic(courses)) === JSON.stringify(semantic(remoteCourses));
      if (identical) cacheContents = Buffer.from(remoteContents);
      if (!identical && confirmedRemoteCommit !== remoteCommit) {
        const error = new SyncError('SYNC_SETUP_REQUIRED', '首次连接 GitHub：本机课程与 GitHub 不同。请核对双方课程数量，确认后才能将本机课程上传；本机数据已经保存。');
        error.setup = { remoteCommit, localCounts: counts(courses), remoteCounts: counts(remoteCourses), repository: REPOSITORY };
        throw error;
      }
      // An earlier setup attempt may have cloned an older main. Advance that
      // clean baseline before applying this explicitly confirmed snapshot.
      // A divergence or dirty cache still stops here without resetting files.
      const head = await git(cache, ['rev-parse', 'HEAD']);
      if (head !== remoteCommit) await git(cache, ['merge', '--ff-only', '--no-edit', remoteCommit]);
      // A confirmation authorizes exactly the fetched main commit. A later
      // remote advance remains protected by syncCourses and a normal push.
    }
    const temporary = path.join(cache, DATA + '.' + randomUUID() + '.tmp');
    try { await fs.writeFile(temporary, cacheContents); await fs.rename(temporary, path.join(cache, DATA)); }
    finally { await fs.rm(temporary, { force: true }); }
    let result;
    try { result = await syncCourses({ cwd: cache }); }
    catch (error) { if (error.backup) error.backup = CACHE + '/' + error.backup; throw error; }
    if (!marker.initialized) await atomicSave(markerPath, { ...marker, initialized: true });
    // A cache fast-forward updates its Git history, not the program folder the user is running.
    return { ...result, updatedCode: false, updateAvailable: result.updatedCode, managed: true, managedRepository: true };
  } finally { await lock.close(); await fs.rm(lockPath, { force: true }); }
}
module.exports = { syncLocalCourses };
