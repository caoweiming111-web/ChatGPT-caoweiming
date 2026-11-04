const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const themeSource = html.slice(html.indexOf('function bindThemeEditor('), html.indexOf('function renderCategory('));
const pollingSource = html.slice(html.indexOf('function isCategoryEditing('), html.indexOf('var data = loadData();'));

function themeFixture() {
  const calls = { saves: 0, renders: 0, blur: 0 };
  const insertions = [];
  const context = vm.createContext({
    tr: key => key,
    document: { execCommand(command, ui, text) { insertions.push({ command, text }); return true; } },
    saveData: () => calls.saves++,
    renderCategory: () => calls.renders++,
    showToast() {}
  });
  vm.runInContext(themeSource, context);
  const events = {};
  const editor = {
    textContent: '主题一', parentElement: { draggable: true },
    addEventListener(name, callback) { events[name] = callback; },
    emit(name, event = {}) { events[name]?.call(this, event); },
    blur() { calls.blur++; this.emit('blur'); }
  };
  const courses = [{ theme: '主题一' }, { theme: '主题二' }, { theme: '主题一' }];
  context.bindThemeEditor(editor, 'inspire', courses, '主题一');
  return { editor, courses, calls, insertions };
}

test('Chinese theme composition stays editable until an explicit Enter or blur', () => {
  const { editor, courses, calls } = themeFixture();
  editor.emit('focus');
  assert.equal(editor.parentElement.draggable, false);
  editor.emit('compositionstart');
  editor.textContent = '新主题';
  editor.emit('keydown', { key: 'Enter', isComposing: false, preventDefault() { assert.fail('IME Enter must not commit'); } });
  editor.emit('compositionend');
  editor.emit('keydown', { key: 'Enter', keyCode: 229, preventDefault() { assert.fail('IME key must not commit'); } });
  assert.deepEqual(calls, { saves: 0, renders: 0, blur: 0 });
  assert.equal(courses[0].theme, '主题一');
  let prevented = false;
  editor.emit('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(editor.parentElement.draggable, true);
  assert.deepEqual(courses.map(course => course.theme), ['新主题', '主题二', '新主题']);
  assert.deepEqual(calls, { saves: 1, renders: 1, blur: 1 });
});

test('leaving an unchanged theme does not redraw the category', () => {
  const { editor, calls } = themeFixture();
  editor.emit('blur');
  assert.equal(calls.saves, 0);
  assert.equal(calls.renders, 0);
});

test('theme paste uses literal single-line text and discards clipboard HTML', () => {
  const { editor, calls, insertions } = themeFixture();
  let prevented = false;
  editor.emit('paste', {
    preventDefault() { prevented = true; },
    clipboardData: { getData(type) {
      assert.equal(type, 'text/plain');
      return '新主题\r\n第二行\t第三行\u2028第四行\u00a0<b>文字</b>';
    } }
  });
  assert.equal(prevented, true);
  assert.deepEqual(insertions, [{ command: 'insertText', text: '新主题 第二行 第三行 第四行 <b>文字</b>' }]);
  assert.deepEqual(calls, { saves: 0, renders: 0, blur: 0 });
});

test('theme editor prevents mobile line breaks without interrupting composition', () => {
  const { editor } = themeFixture();
  let prevented = 0;
  for (const inputType of ['insertParagraph', 'insertLineBreak']) {
    editor.emit('beforeinput', { inputType, preventDefault() { prevented++; } });
  }
  assert.equal(prevented, 2);
  editor.emit('compositionstart');
  editor.emit('beforeinput', { inputType: 'insertParagraph', preventDefault() { assert.fail('composition must not be interrupted'); } });
});

function pollingFixture() {
  let active = null;
  let resolveFetch;
  const calls = { fetches: 0, renders: 0, writes: 0 };
  const local = { inspire: [{ theme: '本地' }] };
  const remote = { inspire: [{ theme: '远端' }] };
  const context = vm.createContext({
    window: {}, courseDataConflict: false, docContext: null, localSavePending: false,
    localSaveRevision: 0, initialDataChecked: true, localDataOnStartup: null,
    location: { protocol: 'http:' }, currentCategory: 'inspire', lastSyncData: null,
    data: local, STORAGE_KEY: 'makex_data',
    document: {
      get activeElement() { return active; },
      getElementById(id) {
        if (id === 'slot-container') return { contains: element => element === active };
        return { classList: { contains: () => id === 'view-category' } };
      }
    },
    localStorage: { setItem() { calls.writes++; } },
    updateCounts() {}, updateConnectionStatus() {},
    renderCategory() { calls.renders++; },
    fetch() { calls.fetches++; return new Promise(resolve => { resolveFetch = resolve; }); }
  });
  vm.runInContext(pollingSource, context);
  return {
    context, calls, local, remote,
    edit(className) { active = className ? { classList: { contains: name => name === className } } : null; },
    respond() { resolveFetch({ ok: true, json: async () => remote }); }
  };
}

for (const field of ['th-text', 'slot-input']) {
  test(`polling does not replace a focused ${field}, including an already pending response`, async () => {
    const fixture = pollingFixture();
    fixture.edit(field);
    fixture.context.pollData();
    assert.equal(fixture.calls.fetches, 0);
    fixture.edit(null);
    fixture.context.pollData();
    assert.equal(fixture.calls.fetches, 1);
    fixture.edit(field);
    fixture.respond();
    await new Promise(setImmediate);
    assert.equal(fixture.context.data, fixture.local);
    assert.equal(fixture.calls.renders, 0);
    assert.equal(fixture.calls.writes, 0);
    fixture.edit(null);
    fixture.context.pollData();
    fixture.respond();
    await new Promise(setImmediate);
    assert.equal(fixture.context.data, fixture.remote);
    assert.equal(fixture.calls.renders, 1);
    assert.equal(fixture.calls.writes, 1);
  });
}
