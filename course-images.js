/* Per-course images are normalized to compact, embedded JPEGs for portable saves. */
(function (root) {
'use strict';
const MAX_FILES = 12;
const MAX_BYTES = 10 * 1024 * 1024;
function accepted(file) { return /^(image\/png|image\/jpeg|image\/webp)$/i.test(file.type || '') && file.size <= MAX_BYTES; }
function embedded(src) { return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(String(src || '')); }
function load(src) {
  return new Promise((resolve, reject) => {
    if (!embedded(src)) { reject(Error('图片数据无效')); return; }
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(Error('图片无法读取，请重新插入')); image.src = src;
  });
}
async function compress(file) {
  if (!accepted(file)) throw Error('请选择不超过 10 MB 的 PNG、JPG 或 WebP 图片');
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    let src;
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      src = canvas.toDataURL('image/jpeg', 0.86);
      if (src.length <= 500000) break;
      scale *= 0.75;
    }
    if (!src || src.length > 500000) throw Error('图片过大，请缩小后再插入');
    return { id: crypto.randomUUID(), name: file.name || '粘贴图片', src, width: canvas.width, height: canvas.height, caption: '' };
  } finally { bitmap.close(); }
}
async function prepareExport(images, maxWidth) {
  return Promise.all((Array.isArray(images) ? images : []).map(async item => {
    const image = await load(item.src);
    const scale = Math.min(1, maxWidth / image.naturalWidth, 720 / image.naturalHeight);
    return { image, width: Math.max(1, image.naturalWidth * scale), height: Math.max(1, image.naturalHeight * scale), caption: String(item.caption || '') };
  }));
}
const api = { accepted, embedded, compress, prepareExport, MAX_FILES };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.CourseImages = api;
if (typeof document === 'undefined') return;
const list = document.getElementById('course-image-list');
const zone = document.getElementById('course-image-zone');
const chooser = document.getElementById('course-image-files');
const button = document.getElementById('course-image-select');
let busy = false;
api.isBusy = () => busy;
function current() { return root.docContext ? root.data[root.docContext.cat][root.docContext.index] : null; }
function message(text) { root.showToast(text, 'error'); }
function save() { root.saveDocumentData(); }
function persist(slot, next) {
  if (!['inspire', 'explorer', 'explorer2', 'challenge'].some(key => (root.data[key] || []).includes(slot))) {
    message('原课程已移除，未插入图片'); return false;
  }
  const previous = slot.images;
  slot.images = next;
  try {
    if (current() === slot) save(); else root.saveData();
    return true;
  } catch (error) {
    slot.images = previous;
    message('浏览器空间不足，未保存此次图片修改。请先备份课程数据，再减少图片数量。');
    return false;
  }
}
function node(tag, className, text) {
  const el = document.createElement(tag); if (className) el.className = className;
  if (text !== undefined) el.textContent = text; return el;
}
function render() {
  list.replaceChildren();
  const slot = current();
  const images = slot && Array.isArray(slot.images) ? slot.images : [];
  document.getElementById('course-image-count').textContent = images.length ? images.length + ' 张图片' : '';
  images.forEach((item, index) => {
    const card = node('figure', 'course-image-card');
    const preview = node('img'); if (embedded(item.src)) preview.src = item.src;
    preview.alt = item.caption || item.name || '课程图片'; preview.loading = 'lazy';
    const label = node('label', '', '图片说明');
    const caption = node('textarea'); caption.rows = 2; caption.maxLength = 500;
    caption.placeholder = '可填写搭建步骤、结构说明或观察结果'; caption.value = item.caption || '';
    caption.setAttribute('aria-label', '第 ' + (index + 1) + ' 张图片说明');
    let previousCaption = caption.value;
    caption.addEventListener('input', () => { item.caption = caption.value; });
    caption.addEventListener('change', () => {
      try { save(); previousCaption = caption.value; preview.alt = caption.value || item.name || '课程图片'; }
      catch { item.caption = previousCaption; caption.value = previousCaption; message('说明未保存，请减少图片后重试'); }
    });
    label.append(caption);
    const actions = node('div', 'course-image-actions');
    for (const [text, offset] of [['上移', -1], ['下移', 1]]) {
      const move = node('button', 'btn-secondary', text); move.type = 'button';
      move.disabled = index + offset < 0 || index + offset >= images.length;
      move.addEventListener('click', () => {
        const next = images.slice(); [next[index], next[index + offset]] = [next[index + offset], next[index]];
        if (persist(slot, next)) render();
      }); actions.append(move);
    }
    const remove = node('button', 'btn-secondary', '删除图片'); remove.type = 'button';
    remove.addEventListener('click', () => {
      if (!confirm('删除这张课程图片？')) return;
      if (persist(slot, images.filter((_, i) => i !== index))) render();
    }); actions.append(remove);
    card.append(preview, label, actions); list.append(card);
  });
}
root.renderCourseImages = render;
async function addFiles(files) {
  const slot = current(); if (!slot || !files.length) return;
  if (busy) { message('图片正在插入，请稍候'); return; }
  const old = Array.isArray(slot.images) ? slot.images : [];
  if (old.length + files.length > MAX_FILES) { message('每节课最多插入 12 张图片，请分课整理'); return; }
  if (!files.every(accepted)) { message('请选择不超过 10 MB 的 PNG、JPG 或 WebP 图片'); return; }
  busy = true; button.disabled = true; zone.setAttribute('aria-busy', 'true');
  document.getElementById('course-image-progress').textContent = '正在处理图片…';
  try {
    save();
    const added = [];
    for (const file of files) added.push(await compress(file));
    // Re-read the array: the user may have reordered/deleted pictures while decoding.
    const latest = Array.isArray(slot.images) ? slot.images : [];
    if (persist(slot, latest.concat(added)) && current() === slot) render();
  } catch (error) { message(error.name === 'QuotaExceededError' ? '浏览器空间不足，请减少图片后重试' : (error.message || '图片读取失败，请换一张图片')); }
  finally { busy = false; button.disabled = false; chooser.value = ''; zone.setAttribute('aria-busy', 'false'); document.getElementById('course-image-progress').textContent = ''; }
}
button.addEventListener('click', () => chooser.click());
chooser.addEventListener('change', () => addFiles(Array.from(chooser.files)));
zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-over'); addFiles(Array.from(event.dataTransfer.files)); });
zone.addEventListener('paste', event => {
  const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  if (files.length) { event.preventDefault(); addFiles(files); }
});
})(typeof window === 'undefined' ? globalThis : window);
