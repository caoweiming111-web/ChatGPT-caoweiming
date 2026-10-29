'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const execute = promisify(execFile);
const REPOSITORY = 'caoweiming111-web/ChatGPT-caoweiming';
const DATA = 'makex_data.json';
class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function validCourses(data) {
  return data && typeof data === 'object' && !Array.isArray(data) &&
    ['inspire', 'explorer', 'explorer2', 'challenge'].every(key => Array.isArray(data[key]) &&
      data[key].every(course => course && typeof course === 'object' && !Array.isArray(course)));
}
function correctRemote(value) {
  const remote = String(value || '').trim();
  return /^https:\/\/github\.com\/caoweiming111-web\/ChatGPT-caoweiming(?:\.git)?\/?$/i.test(remote) ||
    /^git@github\.com:caoweiming111-web\/ChatGPT-caoweiming(?:\.git)?$/i.test(remote) ||
    /^ssh:\/\/git@github\.com\/caoweiming111-web\/ChatGPT-caoweiming(?:\.git)?$/i.test(remote);
}
async function atomicSave(file, data) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8'); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function syncCourses({ cwd = __dirname, beforeSync } = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' };
  // Existing credentials/managers are reused. Never embed a token or change Git identity.
  async function git(args, codes = [0]) {
    try {
      const r = await execute('git', args, { cwd, env, timeout: 90000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      return { code: 0, stdout: r.stdout.trim() };
    } catch (error) {
      if (codes.includes(error.code)) return { code: error.code, stdout: String(error.stdout || '').trim() };
      const fail = new SyncError('GIT_FAILED', 'Git 操作失败，请检查本地 Git、GitHub 登录和网络；课程文件仍保留在本地。');
      fail.stage = args[0]; throw fail;
    }
  }
  try { await git(['--version']); }
  catch { throw new SyncError('NO_GIT', '未找到 Git，请先安装 Git for Windows，或通过 GitHub Desktop 安装并配置 Git。'); }
  let root;
  try { root = (await git(['rev-parse', '--show-toplevel'])).stdout; }
  catch { throw new SyncError('NO_REPOSITORY', '此文件夹不是 Git 仓库。请先用 GitHub Desktop 克隆 ChatGPT-caoweiming，再将备份的 makex_data.json 放入该文件夹。下载 ZIP 不包含 Git 仓库信息。'); }
  if (await fs.realpath(root) !== await fs.realpath(cwd)) throw new SyncError('WRONG_ROOT', '请从 ChatGPT-caoweiming 项目根目录运行同步。');
  const gitDir = path.resolve(cwd, (await git(['rev-parse', '--git-dir'])).stdout);
  let lock;
  try { lock = await fs.open(path.join(gitDir, 'makex-course-sync.lock'), 'wx'); }
  catch { throw new SyncError('BUSY', '另一个课程同步任务正在运行；如果上次任务意外中断，请确认没有同步进程后删除 .git/makex-course-sync.lock。'); }
  let backup;
  try {
    if (beforeSync) await beforeSync();
    const origin = (await git(['config', '--get-all', 'remote.origin.url'], [0, 1])).stdout.split('\n').filter(Boolean);
    const pushUrls = (await git(['config', '--get-all', 'remote.origin.pushurl'], [0, 1])).stdout.split('\n').filter(Boolean);
    if (origin.length !== 1 || !correctRemote(origin[0]) || pushUrls.length > 1 || pushUrls.some(url => !correctRemote(url))) {
      throw new SyncError('WRONG_REMOTE', '同步已停止：origin 必须指向 https://github.com/' + REPOSITORY + '.git。不会自动改写旧仓库地址。请先备份本地课程，再在正确仓库中操作。');
    }
    const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1])).stdout;
    if (branch !== 'main') throw new SyncError('WRONG_BRANCH', '请在 ChatGPT-caoweiming 的 main 分支操作；当前分支不会被自动切换。');
    if ((await git(['diff', '--cached', '--quiet'], [0, 1])).code !== 0) throw new SyncError('STAGED_CHANGES', 'Git 暂存区已有改动。请先处理现有提交，再同步课程；不会把其他文件一起提交。');
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']) {
      if (await fs.stat(path.join(gitDir, marker)).then(() => true, () => false)) throw new SyncError('GIT_IN_PROGRESS', 'Git 正在合并或变基，请先处理当前操作。');
    }
    let courses;
    try { courses = JSON.parse((await fs.readFile(path.join(cwd, DATA), 'utf8')).replace(/^\uFEFF/, '')); }
    catch { throw new SyncError('BAD_DATA', '课程文件不是有效 JSON，同步已停止，请先恢复或修复课程文件。'); }
    if (!validCourses(courses)) throw new SyncError('BAD_DATA', '课程文件结构无效，同步已停止。');
    const backupDir = path.join(gitDir, 'makex-course-backups');
    await fs.mkdir(backupDir, { recursive: true });
    backup = path.join(backupDir, Date.now() + '-' + randomUUID() + '.json');
    await fs.copyFile(path.join(cwd, DATA), backup);
    const head = (await git(['rev-parse', 'HEAD'])).stdout;
    let remote;
    try {
      await git(['fetch', '--no-tags', 'origin', 'refs/heads/main']);
      remote = (await git(['rev-parse', 'FETCH_HEAD'])).stdout;
    } catch { throw new SyncError('FETCH_FAILED', '无法读取 GitHub 的 main 分支。请检查网络和 GitHub 登录；本地课程已保存并备份，未上传。'); }
    if (remote !== head && (await git(['merge-base', '--is-ancestor', remote, head], [0, 1])).code === 0) {
      const pendingFiles = (await git(['log', '--format=', '--name-only', remote + '..' + head])).stdout.split('\n').filter(Boolean);
      if (pendingFiles.some(file => file !== DATA)) throw new SyncError('PENDING_CODE_COMMITS', '本地还有未上传的程序提交，请先处理这些提交，再使用课程同步。');
    }
    let updatedCode = false;
    if (remote !== head && (await git(['merge-base', '--is-ancestor', remote, head], [0, 1])).code !== 0) {
      if ((await git(['merge-base', '--is-ancestor', head, remote], [0, 1])).code !== 0) {
        throw new SyncError('DIVERGED', '本地与 GitHub 的提交历史已分叉，请先人工合并。双方内容均保留，不会强制推送。');
      }
      const dataChanged = (await git(['diff', '--quiet', head, remote, '--', DATA], [0, 1])).code !== 0;
      if (dataChanged) {
        let remoteCourses;
        try { remoteCourses = JSON.parse((await git(['show', remote + ':' + DATA])).stdout.replace(/^\uFEFF/, '')); } catch {}
        if (JSON.stringify(remoteCourses) !== JSON.stringify(courses)) throw new SyncError('REMOTE_DATA_CHANGED', 'GitHub 上的课程也有更新。同步已停止，本地课程已备份到 .git/makex-course-backups；请先合并两份课程，避免覆盖。');
      }
      if ((await git(['diff', '--quiet', '--', '.', ':(exclude)' + DATA], [0, 1])).code !== 0) {
        throw new SyncError('LOCAL_CODE_CHANGES', 'GitHub 有新版本，且本地程序文件也有改动。请先处理代码更新；课程数据仍保留。');
      }
      // Temporarily restore only this backed-up file for a safe fast-forward.
      // The finally block restores local lessons even when Git refuses the update.
      try {
        await git(['restore', '--worktree', '--source=HEAD', '--', DATA]);
        await git(['merge', '--ff-only', '--no-edit', remote]);
        updatedCode = true;
      } finally { await fs.copyFile(backup, path.join(cwd, DATA)); }
    }
    const tracked = (await git(['ls-files', '--error-unmatch', '--', DATA], [0, 1])).code === 0;
    const changed = !tracked || (await git(['diff', '--quiet', '--', DATA], [0, 1])).code !== 0;
    if (changed) {
      try { await git(['var', 'GIT_AUTHOR_IDENT']); }
      catch { throw new SyncError('NO_IDENTITY', '请先在 GitHub Desktop 或 Git 中设置提交姓名与邮箱，再重试。'); }
      try {
        await git(['add', '-f', '--', DATA]);
        await git(['commit', '--only', '-m', 'Sync course data', '--', DATA]);
      } catch (error) {
        await git(['reset', '--quiet', 'HEAD', '--', DATA]).catch(() => {});
        throw new SyncError('COMMIT_FAILED', '本地提交未完成。请检查 Git 提交身份或提交钩子；课程和备份仍保留。');
      }
    }
    const commit = (await git(['rev-parse', 'HEAD'])).stdout;
    if (commit !== remote) {
      try { await git(['push', '--porcelain', 'origin', 'HEAD:refs/heads/main']); }
      catch { throw new SyncError('PUSH_FAILED', '上传未成功，本地提交已保留。请检查 GitHub 登录、网络或远端新提交后重试；不会强制覆盖远端。'); }
    }
    return { ok: true, commit, changed, updatedCode, upToDate: commit === remote,
      repository: REPOSITORY, branch: 'main' };
  } catch (error) {
    if (backup) error.backup = '.git/makex-course-backups';
    throw error;
  } finally { await lock.close(); await fs.rm(path.join(gitDir, 'makex-course-sync.lock'), { force: true }); }
}
module.exports = { syncCourses, validCourses, correctRemote, atomicSave, SyncError };
if (require.main === module) {
  syncCourses().then(result => {
    console.log(result.upToDate ? '课程已经与 GitHub 一致。' : '课程已上传到 GitHub。');
    console.log('https://github.com/' + REPOSITORY + '/tree/main');
    console.log('Commit: ' + result.commit.slice(0, 7));
  }).catch(error => { console.error(error.message); if (error.backup) console.error('备份目录：' + error.backup); process.exitCode = 1; });
}
