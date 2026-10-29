(function (root) {
'use strict';
root.gitSyncInProgress = false;
const status = document.getElementById('git-sync-status');
function show(text, error) {
  status.textContent = text;
  status.style.color = error ? '#e9aa45' : 'var(--text-dim)';
}
root.reportCourseDataConflict = () => {
  show('浏览器与项目文件的课程不同，已保留浏览器内容。请核对后同步，或读取项目文件。', true);
  document.getElementById('load-project-courses').hidden = false;
};
root.loadProjectCourses = async () => {
  if (root.gitSyncInProgress || (root.CourseImages && root.CourseImages.isBusy())) return;
  try {
    // Download the current browser lessons before explicitly switching sources.
    if (root.docContext) root.saveDocumentData();
    const backup = new Blob([JSON.stringify(root.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(backup); const link = document.createElement('a');
    link.href = url; link.download = 'makex-browser-backup-' + Date.now() + '.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  if (root.gitSyncInProgress) return;
  if (root.CourseImages && root.CourseImages.isBusy()) { root.showToast('图片正在处理，请完成后再同步', 'error'); return; }
  const button = document.getElementById('btn-sync');
  root.gitSyncInProgress = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
  button.textContent = '正在同步…';
  show('正在保存课程并同步 GitHub，请稍候…');
  let snapshot;
  try {
    if (root.docContext) root.saveDocumentData(); else root.saveData();
    await root.serverSaveQueue.catch(() => {});
    snapshot = JSON.stringify(root.data);
    const response = await fetch(location.protocol === 'file:' ? 'http://localhost:3456/git-sync' : '/git-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MakeX-Sync': '1' }, body: snapshot
    });
    let result;
    try { result = await response.json(); } catch { throw Error('本地服务器需要更新或重启，课程已保留在浏览器中。'); }
    if (!response.ok || !result.ok) throw Error((result.error || '同步未完成') + (result.backup ? ' 备份：' + result.backup : ''));
    root.courseDataConflict = false;
    document.getElementById('load-project-courses').hidden = true;
    // Save any edits made while the network operation was in progress locally.
    if (root.docContext) root.saveDocumentData();
    const changed = JSON.stringify(root.data) !== snapshot;
    root.localSavePending = changed;
    try { if (changed) localStorage.setItem('makex_pending_save', '1'); else localStorage.removeItem('makex_pending_save'); } catch {}
    show((result.upToDate ? '已与 GitHub 一致' : '已上传 GitHub') + ' · ' + result.commit.slice(0, 7) +
      (changed ? '；同步期间的新修改仍待下次上传。' : '') + (result.updatedCode ? '；程序有更新，请重启本地服务并刷新页面。' : ''));
  } catch (error) {
    try { if (root.docContext) root.saveDocumentData(); } catch {}
    show(error instanceof TypeError ? '无法连接本地服务器。请先运行“启动MakeX.bat”；课程仍保留在浏览器中。' : error.message, true);
  } finally {
    root.gitSyncInProgress = false; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = root.tr('sync');
  }
};
if (root.courseDataConflict) root.reportCourseDataConflict();
})(window);
