(function (root) {
'use strict';
root.gitSyncInProgress = false;
const status = document.getElementById('git-sync-status');
const categoryNames = { inspire: 'Inspire', explorer: 'Explorer 第一年', explorer2: 'Explorer 第二年', challenge: 'Challenge' };
let feedback, confirmation;
function show(text, error) {
  if (!status) return;
  status.textContent = text;
  status.style.color = error ? '#e9aa45' : 'var(--text-dim)';
}
function captureCourses() {
  // Read the editor too: a full browser store can prevent saveDocumentData from finishing.
  const courses = JSON.parse(JSON.stringify(root.data));
  const context = root.docContext;
  const slot = context && courses[context.cat] && courses[context.cat][context.index];
  if (slot) {
    ['name', 'subtitle', 'equipment', 'objectives', 'procedure'].forEach(key => {
      const editor = document.getElementById('doc-' + key);
      if (editor) slot[key] = key === 'objectives' || key === 'procedure' ? editor.innerHTML : editor.value;
    });
  }
  return courses;
}
function downloadBackup() {
  const backup = new Blob([JSON.stringify(captureCourses(), null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(backup);
  const link = document.createElement('a');
  link.href = url; link.download = 'makex-browser-backup-' + Date.now() + '.json';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ensureFeedback() {
  if (feedback) return feedback;
  const style = document.createElement('style');
  style.textContent = '#git-sync-dialog{margin:auto;width:min(560px,90vw);max-height:85vh;box-sizing:border-box;padding:24px;border:1px solid #476074;border-radius:14px;background:var(--bg2,#14202c);color:var(--text,#e8eaed);font:16px/1.65 sans-serif;overflow:auto}#git-sync-dialog::backdrop{background:#0009}#git-sync-dialog h2{font-size:21px;margin:0 0 12px}#git-sync-dialog p{white-space:pre-line;overflow-wrap:anywhere;margin:12px 0}#git-sync-dialog footer{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}#git-sync-dialog button,#git-sync-open-status{padding:9px 14px;border:1px solid #67818c;border-radius:6px;background:#234653;color:#fff;font:inherit;cursor:pointer}#git-sync-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#git-sync-dialog table{border-collapse:collapse;width:100%;font-size:14px}#git-sync-dialog th,#git-sync-dialog td{padding:6px;text-align:left;border-bottom:1px solid #67818c66}#git-sync-open-status{position:fixed;right:18px;bottom:18px;z-index:10000;font-size:14px;box-shadow:0 3px 16px #0006}#git-sync-dialog [hidden],#git-sync-open-status[hidden]{display:none}';
  document.head.appendChild(style);
  const dialog = document.createElement('dialog');
  dialog.id = 'git-sync-dialog'; dialog.setAttribute('aria-labelledby', 'git-sync-title');
  dialog.innerHTML = '<h2 id="git-sync-title"></h2><p id="git-sync-message" role="status" aria-live="polite"></p><p id="git-sync-location" hidden style="font-size:12px;opacity:.75"></p><div id="git-sync-setup" hidden></div><details id="git-sync-details" hidden><summary>技术信息</summary><pre id="git-sync-error"></pre></details><footer><button type="button" id="git-sync-confirm" hidden>确认使用本机课程并上传</button><button type="button" id="git-sync-backup">下载当前课程备份 JSON</button><button type="button" id="git-sync-close">关闭</button></footer>';
  const reopen = document.createElement('button');
  reopen.type = 'button'; reopen.id = 'git-sync-open-status'; reopen.textContent = '查看 GitHub 同步状态'; reopen.hidden = true;
  document.body.append(dialog, reopen);
  feedback = { dialog, reopen, title: dialog.querySelector('h2'), message: dialog.querySelector('#git-sync-message'), location: dialog.querySelector('#git-sync-location'), setup: dialog.querySelector('#git-sync-setup'), details: dialog.querySelector('details'), error: dialog.querySelector('pre'), confirm: dialog.querySelector('#git-sync-confirm'), close: dialog.querySelector('#git-sync-close') };
  function open() { reopen.hidden = true; if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); } }
  function close() { if (dialog.close) dialog.close(); else { dialog.removeAttribute('open'); closed(); } }
  function closed() {
    reopen.hidden = false;
    if (confirmation) { const resolve = confirmation; confirmation = null; resolve(false); }
  }
  reopen.addEventListener('click', open);
  feedback.close.addEventListener('click', close);
  dialog.addEventListener('close', closed);
  feedback.confirm.addEventListener('click', () => {
    if (!confirmation) return;
    const resolve = confirmation; confirmation = null; feedback.confirm.hidden = true; resolve(true);
  });
  dialog.querySelector('#git-sync-backup').addEventListener('click', () => {
    try { downloadBackup(); if (root.showToast) root.showToast('已开始下载课程备份 JSON'); }
    catch { feedback.message.textContent += '\n备份未能下载，请保持页面打开并重新尝试。'; }
  });
  feedback.open = open;
  return feedback;
}
function display(title, message, options = {}) {
  const ui = ensureFeedback();
  ui.title.textContent = title; ui.message.textContent = message;
  ui.message.style.color = options.error ? '#efbd73' : '';
  ui.details.hidden = !options.details; ui.error.textContent = options.details || '';
  ui.setup.hidden = true; ui.confirm.hidden = true;
  ui.close.textContent = options.pending ? '收起，继续编辑' : '关闭';
  show(message, options.error);
  if (options.open) ui.open();
  if (!ui.dialog.open) ui.reopen.hidden = false;
}
function syncError(code, message, backup) {
  const error = new Error(message); error.code = code; error.backup = backup; return error;
}
function advice(error) {
  const hints = {
    NO_GIT: '请先安装 Git for Windows，安装时启用 Git Credential Manager，然后重新运行“启动MakeX.bat”并重试。',
    NO_REPOSITORY: '请下载并解压最新版程序，重新运行“启动MakeX.bat”。新版会为下载包准备 Git 同步目录。',
    SYNC_CACHE_CONFLICT: '同步目录存在需要核对的内容。请先下载当前课程备份，再查看启动窗口中的说明并重试。',
    CLONE_FAILED: '首次连接仓库未完成。请检查 GitHub 网络连接及启动窗口中的登录提示，再重试。',
    GITHUB_AUTH_REQUIRED: '请在启动窗口中完成 GitHub 登录，使用有此仓库写入权限的账号，然后重试。',
    GITHUB_ACCESS_DENIED: '请确认当前 GitHub 账号有此仓库的访问及写入权限，再重新登录并重试。',
    GITHUB_PUSH_REJECTED: 'GitHub 拒绝了本次上传。请先下载课程备份，再检查仓库分支规则和两边的修改。',
    GIT_NETWORK_FAILED: '请检查电脑能否打开 github.com，网络恢复后重试。',
    SERVER_OUTDATED: '本地服务器仍是旧版，请关闭旧服务器窗口，从最新版完整文件夹运行“启动MakeX.bat”后重试。',
    LOCAL_SERVER_UNAVAILABLE: '无法连接本地服务器，本次尚未上传。请先运行最新版完整文件夹中的“启动MakeX.bat”，然后重试。',
    AUTH_REQUIRED: '请在启动窗口中完成 GitHub 登录，使用有此仓库写入权限的账号，然后重试。',
    AUTH_FAILED: '请在启动窗口中完成 GitHub 登录，使用有此仓库写入权限的账号，然后重试。',
    PERMISSION_DENIED: '请确认当前 GitHub 账号有此仓库的写入权限，再重新登录并重试。',
    NETWORK_ERROR: '请检查电脑能否打开 github.com，然后重试。',
    FETCH_FAILED: '请检查 GitHub 网络连接及启动窗口中的登录提示，再重试。',
    PUSH_FAILED: '请检查 GitHub 网络连接、账号写入权限及启动窗口中的登录提示，再重试。',
    WRONG_ROOT: '请从本程序所在文件夹运行“启动MakeX.bat”，不要使用其他目录中已启动的旧服务。',
    WRONG_REMOTE: '项目连接的仓库不是 ChatGPT-caoweiming。请使用该仓库的最新版下载包，并重新启动。',
    WRONG_BRANCH: '项目需要使用 main 分支。请先在 Git 中切换到 main，或使用 main 分支的最新版下载包。',
    STAGED_CHANGES: 'Git 中还有已暂存的修改，请先处理这些修改，再上传课程。',
    GIT_IN_PROGRESS: 'Git 中还有未结束的合并或其他操作，请先在 Git 中完成，再重试。',
    BUSY: '另一次同步正在进行，请等待它结束后重试。',
    BUSY_IMAGES: '图片仍在处理，请完成后再同步。',
    BAD_DATA: '课程数据未通过校验。请先下载当前课程备份，再检查课程数据。',
    REMOTE_DATA_CHANGED: 'GitHub 上的课程已变化。请先下载当前课程备份，再核对本机和 GitHub 内容，避免覆盖别人的修改。',
    DIVERGED: '本机与 GitHub 都有新的提交。请先下载课程备份，再在 Git 中处理两边的修改。',
    PENDING_CODE_COMMITS: '本机还有未上传的程序修改，请先在 Git 中处理这些提交，再同步课程。',
    LOCAL_CODE_CHANGES: '本机程序文件有修改。请先备份并处理这些修改，再同步课程。',
    NO_IDENTITY: '请在 GitHub Desktop 的设置 → Git 中填写提交姓名与邮箱，再重新同步。',
    LOCAL_SAVE_FAILED: '浏览器保存未完成，此次尚未上传。请立即下载当前课程备份 JSON，释放浏览器空间后重试。',
    SAVE_QUEUE_TIMEOUT: '之前的本地保存仍未响应，此次尚未开始上传。请下载课程备份，重新启动本地服务后重试。',
    INVALID_RESPONSE: '本地服务返回的内容无法识别，请下载最新版程序、关闭旧服务并重新运行“启动MakeX.bat”。',
    RESULT_UNCONFIRMED: '连接中断或等待超时，服务器可能仍在处理。请保持本地服务运行，稍后重试确认结果；重复同步同一份内容不会重复新增课程。'
  };
  return hints[error.code] || '请先下载当前课程备份 JSON，查看启动窗口中的提示后重试。';
}
function markPending(pending) {
  root.localSavePending = pending;
  try { if (pending) localStorage.setItem('makex_pending_save', '1'); else localStorage.removeItem('makex_pending_save'); } catch {}
}
async function waitForSavedQueue() {
  let timer;
  try {
    await Promise.race([
      Promise.resolve(root.serverSaveQueue).catch(() => {}),
      new Promise((_, reject) => { timer = setTimeout(() => reject(syncError('SAVE_QUEUE_TIMEOUT', '等待本地保存超时')), 15000); })
    ]);
  } finally { clearTimeout(timer); }
}
async function checkLocalServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let response;
    try { response = await fetch(location.protocol === 'file:' ? 'http://localhost:3456/git-sync/status' : '/git-sync/status', { cache: 'no-store', signal: controller.signal }); }
    catch { throw syncError('LOCAL_SERVER_UNAVAILABLE', '未连接到本地同步服务'); }
    let result;
    try { result = await response.json(); } catch {}
    if (!response.ok || !result || result.ok !== true || result.version !== '2026-11-04.sync2') {
      throw syncError('SERVER_OUTDATED', '运行中的本地服务器不支持此版本的同步功能');
    }
    const ui = ensureFeedback();
    ui.location.textContent = typeof result.directory === 'string' ? '当前本地服务目录：' + result.directory : '';
    ui.location.hidden = !ui.location.textContent;
  } finally { clearTimeout(timer); }
}
async function sendSnapshot(snapshot, confirmedCommit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const headers = { 'Content-Type': 'application/json', 'X-MakeX-Sync': '1' };
    if (confirmedCommit) headers['X-MakeX-Confirm-Setup'] = confirmedCommit;
    let response;
    try {
      response = await fetch(location.protocol === 'file:' ? 'http://localhost:3456/git-sync' : '/git-sync', {
        method: 'POST', headers, body: snapshot, signal: controller.signal
      });
    } catch { throw syncError('RESULT_UNCONFIRMED', '无法确认 GitHub 同步结果'); }
    let body;
    try { body = await response.text(); }
    catch { throw syncError('RESULT_UNCONFIRMED', '读取同步结果时连接中断'); }
    let result;
    try { result = JSON.parse(body); }
    catch { throw syncError('INVALID_RESPONSE', '本地服务器返回内容无法识别'); }
    if (result && result.code === 'SYNC_SETUP_REQUIRED' && result.setup && /^[a-f0-9]{40}$/i.test(result.setup.remoteCommit)) return result;
    if (!response.ok || !result || !result.ok) throw syncError(result && result.code || 'SYNC_FAILED', result && result.error || '同步未完成', result && result.backup);
    return result;
  } finally { clearTimeout(timer); }
}
function confirmSetup(result, snapshot) {
  display('首次连接 GitHub：请核对课程', '确认后，将用本次点击同步时的本机课程替换 GitHub 中的课程。请核对数量；如需保留 GitHub 的内容，请先取消并下载备份。', { open: true });
  const ui = ensureFeedback(); ui.setup.replaceChildren();
  const table = document.createElement('table');
  const head = document.createElement('tr');
  ['课程模块', '本机课程', 'GitHub 课程'].forEach(text => { const cell = document.createElement('th'); cell.textContent = text; head.appendChild(cell); });
  table.appendChild(head);
  Object.keys(categoryNames).forEach(key => {
    const row = document.createElement('tr');
    [categoryNames[key], result.setup.localCounts && result.setup.localCounts[key], result.setup.remoteCounts && result.setup.remoteCounts[key]].forEach(value => {
      const cell = document.createElement('td'); cell.textContent = value == null ? '未知' : String(value); row.appendChild(cell);
    });
    table.appendChild(row);
  });
  ui.setup.appendChild(table);
  const review = document.createElement('p');
  const remoteLink = document.createElement('a'); remoteLink.textContent = '查看 GitHub 本次将被更新的课程';
  remoteLink.href = 'https://github.com/caoweiming111-web/ChatGPT-caoweiming/blob/' + result.setup.remoteCommit + '/makex_data.json';
  remoteLink.target = '_blank'; remoteLink.rel = 'noopener noreferrer'; remoteLink.style.color = 'var(--cyan,#76e1ef)';
  const localLink = document.createElement('a'); localLink.textContent = '下载本次待上传课程核对'; localLink.style.color = 'var(--cyan,#76e1ef)';
  const reviewUrl = URL.createObjectURL(new Blob([snapshot], { type: 'application/json;charset=utf-8' }));
  localLink.href = reviewUrl; localLink.download = 'makex-pending-upload.json';
  review.append(remoteLink, document.createElement('br'), localLink); ui.setup.appendChild(review); ui.setup.hidden = false;
  ui.details.hidden = false; ui.error.textContent = 'SYNC_SETUP_REQUIRED\n仓库：' + (result.setup.repository || 'caoweiming111-web/ChatGPT-caoweiming') + '\nGitHub 版本：' + result.setup.remoteCommit;
  ui.close.textContent = '暂不上传'; ui.confirm.hidden = false;
  return new Promise(resolve => { confirmation = resolve; }).finally(() => URL.revokeObjectURL(reviewUrl));
}
root.reportCourseDataConflict = () => {
  show('浏览器与项目文件的课程不同，已保留浏览器内容。请核对后同步，或读取项目文件。', true);
  document.getElementById('load-project-courses').hidden = false;
};
root.loadProjectCourses = async () => {
  if (root.gitSyncInProgress || (root.CourseImages && root.CourseImages.isBusy())) return;
  try {
    // Download the current browser lessons before explicitly switching sources.
    downloadBackup();
    const response = await fetch(location.protocol === 'file:' ? 'http://localhost:3456/data.json' : '/data.json', { cache: 'no-store' });
    if (!response.ok) throw Error();
    const courses = await response.json();
    if (!['inspire', 'explorer', 'explorer2', 'challenge'].every(key => Array.isArray(courses[key]))) throw Error();
    // Write storage before switching the visible lesson so quota errors retain it.
    localStorage.setItem('makex_data', JSON.stringify(courses));
    localStorage.removeItem('makex_courses'); localStorage.removeItem('makex_pending_save');
    root.localSavePending = false; root.courseDataConflict = false; root.data = courses;
    root.lastSyncData = JSON.stringify(courses); root.updateCounts();
    if (root.docContext && courses[root.docContext.cat][root.docContext.index]) root.openDocument(root.docContext.cat, root.docContext.index);
    else if (root.docContext) { root.docContext = null; document.getElementById('view-document').classList.remove('active'); root.renderCategory(root.currentCategory); document.getElementById('view-category').classList.add('active'); }
    document.getElementById('load-project-courses').hidden = true;
    show('已读取项目文件，原浏览器课程已下载备份。');
  } catch { show('读取未完成，浏览器课程仍保留。请确认本地服务器正在运行。', true); }
};
root.syncToGitHub = async () => {
  if (root.gitSyncInProgress) { ensureFeedback().open(); return; }
  if (root.CourseImages && root.CourseImages.isBusy()) {
    display('图片尚未处理完成', advice({ code: 'BUSY_IMAGES' }), { error: true, open: true, details: 'BUSY_IMAGES' }); return;
  }
  const button = document.getElementById('btn-sync');
  root.gitSyncInProgress = true; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '正在同步…';
  display('正在同步 GitHub', '正在保存本机课程，请稍候…\n你可以收起此窗口继续编辑，后续的新修改将在下次同步时上传。', { pending: true, open: true });
  try {
    try { if (root.docContext) root.saveDocumentData(); else root.saveData(); }
    catch { throw syncError('LOCAL_SAVE_FAILED', '浏览器未能保存当前课程'); }
    const snapshot = JSON.stringify(captureCourses());
    await waitForSavedQueue();
    await checkLocalServer();
    display('正在同步 GitHub', '正在连接 GitHub 并上传课程，首次连接可能需要一些时间。\n如果启动窗口提示 GitHub 登录，请在该窗口中完成。', { pending: true });
    let result = await sendSnapshot(snapshot);
    while (result.code === 'SYNC_SETUP_REQUIRED') {
      if (!await confirmSetup(result, snapshot)) {
        markPending(true);
        display('已取消本次上传', '本次尚未上传 GitHub。当前课程已保留，你可以下载备份或稍后重新同步。'); return;
      }
      const confirmedCommit = result.setup.remoteCommit;
      display('正在同步 GitHub', '已确认使用本机课程，正在上传 GitHub，请稍候…', { pending: true });
      result = await sendSnapshot(snapshot, confirmedCommit);
    }
    root.courseDataConflict = false;
    document.getElementById('load-project-courses').hidden = true;
    let saveFailed = false;
    try { if (root.docContext) root.saveDocumentData(); } catch { saveFailed = true; }
    const changed = JSON.stringify(captureCourses()) !== snapshot;
    markPending(changed || saveFailed);
    const commit = typeof result.commit === 'string' ? ' · ' + result.commit.slice(0, 7) : '';
    const message = (result.upToDate ? '课程已与 GitHub 一致' : '课程已上传 GitHub') + commit + '。' +
      (result.managedRepository ? '\n已为此下载包配置同步目录，今后可直接点击“同步 GitHub”。' : '') +
      (changed ? '\n同步期间的新修改仍保留，待下次上传。' : '') +
      (saveFailed ? '\n当前编辑内容的浏览器保存未完成，请下载课程备份。' : '') +
      (result.updatedCode ? '\n程序有更新，请重启本地服务并刷新页面。' : '') +
      (result.updateAvailable ? '\nGitHub 程序有新版本，可下载新版来更新本机程序。' : '');
    display('GitHub 同步完成', message);
    if (!ensureFeedback().dialog.open && root.showToast) root.showToast('GitHub 同步完成' + commit);
  } catch (error) {
    markPending(true);
    const uncertain = error.code === 'RESULT_UNCONFIRMED';
    display(uncertain ? '同步结果尚未确认' : 'GitHub 同步未完成', advice(error), {
      error: true, details: (error.code || 'SYNC_FAILED') + '\n' + error.message + (error.backup ? '\n项目文件备份：' + error.backup : '')
    });
    if (!ensureFeedback().dialog.open) ensureFeedback().open();
  } finally {
    root.gitSyncInProgress = false; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = root.tr ? root.tr('sync') : '同步 GitHub';
  }
};
if (root.courseDataConflict) root.reportCourseDataConflict();
})(window);
