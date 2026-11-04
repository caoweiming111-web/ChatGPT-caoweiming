// Real Chromium regression: disposable HTTP server and in-memory courses only.
// Run explicitly with: node scripts/test-theme-colors-browser.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const course = (name, theme) => ({ name, theme, subtitle: '', equipment: '', objectives: '认识结构', procedure: '1、搭建\n观察结构', ppts: [], marker: 'preserved' });
let courses = {
  inspire: [course('启蒙课程', '启蒙主题')],
  explorer: [course('视觉第一课', '视觉主题'), course('视觉第二课', '视觉主题'), course('机械第一课', '机械主题'), course('机械第二课', '机械主题')],
  explorer2: [course('第二年视觉课程', '视觉主题')],
  challenge: [course('挑战课程', '挑战主题')]
};
const originalCourses = structuredClone(courses);
let updates = 0;
const server = http.createServer(async (req, res) => {
  try {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route === '/data.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(courses)); return; }
    if (route === '/update' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      courses = JSON.parse(body); updates++;
      res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return;
    }
    const name = route === '/' ? 'index.html' : route.slice(1);
    if (!['index.html', 'course-preview.js', 'school-knowledge.js', 'course-images.js', 'git-sync-client.js'].includes(name)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript;charset=utf-8');
    res.end(fs.readFileSync(path.join(root, name)));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});

async function main() {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => syncConnected && data.explorer.length === 4);
    assert.equal(await page.evaluate(() => typeof setThemeColor), 'function', 'theme color implementation is required');
    const header = name => page.locator('.theme-header[data-theme=' + JSON.stringify(name) + ']');
    const flush = () => page.evaluate(() => serverSaveQueue);
    await page.evaluate(() => openCategory('explorer'));
    assert.equal(await page.locator('.th-color-picker').count(), 2);
    assert.equal(await page.locator('.th-color-reset').count(), 2);
    assert.equal(await header('视觉主题').locator('.th-color-picker').inputValue(), '#2979ff');

    await header('视觉主题').evaluate(el => { window.originalColorHeader = el; });
    await header('视觉主题').locator('.th-color-picker').focus();
    await header('视觉主题').locator('.th-color-picker').fill('#c44250');
    await flush();
    assert.equal(await header('视觉主题').evaluate(el => el === window.originalColorHeader), true, 'changing color must not replace the active DOM');
    const colored = await page.evaluate(() => ({ first: data.explorer.filter(s => s.theme === '视觉主题'), second: data.explorer.filter(s => s.theme === '机械主题'), otherYear: data.explorer2[0], stored: JSON.parse(localStorage.getItem('makex_data')) }));
    assert.ok(colored.first.every(s => s.themeColor === '#c44250' && s.marker === 'preserved'));
    assert.ok(colored.second.every(s => !s.themeColor)); assert.ok(!colored.otherYear.themeColor);
    assert.ok(colored.stored.explorer.filter(s => s.theme === '视觉主题').every(s => s.themeColor === '#c44250'));
    assert.ok(courses.explorer.filter(s => s.theme === '视觉主题').every(s => s.themeColor === '#c44250'));
    const noPoll = await page.evaluate(() => {
      const original = window.fetch; let requests = 0;
      window.fetch = (...args) => { requests++; return original(...args); };
      pollData(); window.fetch = original; return requests;
    });
    assert.equal(noPoll, 0, 'polling must pause while the native color input is focused');
    assert.equal(await header('视觉主题').evaluate(el => el === window.originalColorHeader), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.theme-header')).borderLeftColor === 'rgb(196, 66, 80)');
    const border = await header('视觉主题').evaluate(el => getComputedStyle(el).borderLeftColor);
    assert.equal(border, 'rgb(196, 66, 80)', 'theme accent must visibly use the chosen color');
    await header('视觉主题').locator('.th-color-picker').blur();
    assert.equal(await page.evaluate(() => setThemeColor('explorer', '视觉主题', 'red; background:url(bad)')), false);
    assert.equal(await page.evaluate(() => getThemeColor('explorer', '视觉主题')), '#c44250');
    const rejectedSave = await page.evaluate(() => {
      const save = window.saveData;
      window.saveData = () => { throw new Error('simulated local storage failure'); };
      try { return setThemeColor('explorer', '视觉主题', '#654321'); }
      finally { window.saveData = save; }
    });
    assert.equal(rejectedSave, false, 'failed local persistence must report failure');
    assert.equal(await page.evaluate(() => getThemeColor('explorer', '视觉主题')), '#c44250');
    assert.equal(await header('视觉主题').locator('.th-color-picker').inputValue(), '#c44250');
    assert.ok((await page.evaluate(() => data.explorer.filter(s => s.theme === '视觉主题'))).every(s => s.themeColor === '#c44250'));
    await header('视觉主题').locator('.th-color-picker').evaluate(el => { el.focus(); el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.evaluate(() => getThemeColor('explorer', '视觉主题')), '#c44250', 'input previews must not mutate saved data');
    await header('视觉主题').locator('.th-color-picker').blur();
    assert.equal(await header('视觉主题').locator('.th-color-picker').inputValue(), '#c44250', 'cancelled preview must restore saved color');
    console.log('PASS group/category isolation, visible accent, local/server persistence and focused picker polling protection');
    console.log('PASS invalid color rejection, failed-save rollback and cancelled color preview');

    await page.reload(); await page.waitForFunction(() => syncConnected && data.explorer[0].themeColor === '#c44250');
    await page.evaluate(() => openCategory('explorer'));
    assert.equal(await header('视觉主题').locator('.th-color-picker').inputValue(), '#c44250');
    await page.evaluate(() => { goHome(); openCategory('explorer2'); });
    assert.equal(await header('视觉主题').locator('.th-color-picker').inputValue(), '#2979ff');
    await header('视觉主题').locator('.th-color-picker').fill('#247348'); await flush();
    await page.evaluate(() => { goHome(); openCategory('explorer'); });
    assert.equal(await header('视觉主题').locator('.th-color-picker').inputValue(), '#c44250');
    await page.evaluate(() => setThemeColor('explorer', '机械主题', '#365eb8')); await flush();
    const title = header('视觉主题').locator('.th-text');
    await title.focus(); await title.dispatchEvent('compositionstart'); await title.fill('新视觉主题'); await title.dispatchEvent('compositionend');
    assert.equal(await title.evaluate(el => document.activeElement === el), true);
    const editorPoll = await page.evaluate(() => {
      const original = window.fetch; let requests = 0;
      window.fetch = (...args) => { requests++; return original(...args); };
      pollData(); window.fetch = original;
      return { requests, text: document.activeElement.textContent };
    });
    assert.deepEqual(editorPoll, { requests: 0, text: '新视觉主题' }, 'polling must preserve an unfinished Chinese theme edit');
    // Use one real pointer gesture, without Playwright locator retries hiding a detached picker.
    const firstPicker = header('视觉主题').locator('.th-color-picker');
    await firstPicker.evaluate(el => {
      window.pickerBeforeRename = el; window.renamePickerClicks = 0;
      el.addEventListener('click', event => { event.preventDefault(); window.renamePickerClicks++; });
    });
    const pickerBox = await firstPicker.boundingBox();
    await page.mouse.click(pickerBox.x + pickerBox.width / 2, pickerBox.y + pickerBox.height / 2);
    await flush();
    assert.equal(await page.evaluate(() => window.renamePickerClicks), 1, 'first click after a Chinese rename must reach the color picker');
    assert.equal(await header('新视觉主题').locator('.th-color-picker').evaluate(el => el === window.pickerBeforeRename && el.isConnected), true);
    await header('新视觉主题').locator('.th-color-picker').fill('#c44250'); await flush();
    assert.equal(await header('新视觉主题').locator('.th-color-picker').inputValue(), '#c44250');
    await header('新视觉主题').locator('.th-add').click(); await flush();
    const added = await page.evaluate(() => data.explorer.filter(s => s.theme === '新视觉主题'));
    assert.equal(added.length, 3); assert.ok(added.every(s => s.themeColor === '#c44250'));
    if (process.env.THEME_COLOR_SCREENSHOT_PATH) {
      fs.mkdirSync(path.dirname(process.env.THEME_COLOR_SCREENSHOT_PATH), { recursive: true });
      await page.screenshot({ path: process.env.THEME_COLOR_SCREENSHOT_PATH, fullPage: true });
    }
    console.log('PASS reload persistence, Explorer year isolation, IME rename and new-course inheritance');

    // Drag a complete theme to reorder it; its color should travel with its courses.
    const themeDrag = await page.evaluateHandle(() => new DataTransfer());
    await header('机械主题').dispatchEvent('dragstart', { dataTransfer: themeDrag });
    await header('新视觉主题').dispatchEvent('drop', { dataTransfer: themeDrag });
    await header('机械主题').dispatchEvent('dragend');
    await themeDrag.dispose(); await flush();
    assert.equal(await page.evaluate(() => data.explorer[0].theme), '机械主题', 'theme drag must really change group order');
    assert.equal(await page.evaluate(() => getThemeColor('explorer', '新视觉主题')), '#c44250');
    assert.equal(await header('新视觉主题').locator('.th-color-picker').inputValue(), '#c44250');

    // Drag one course across themes; it must inherit the destination rather than recolor that theme.
    const sourceIndex = await page.evaluate(() => data.explorer.findIndex(s => s.theme === '新视觉主题'));
    const targetIndex = await page.evaluate(() => data.explorer.findIndex(s => s.theme === '机械主题'));
    const movedName = await page.evaluate(index => data.explorer[index].name, sourceIndex);
    const courseDrag = await page.evaluateHandle(() => new DataTransfer());
    await page.locator('.slot-row[data-index="' + sourceIndex + '"]').dispatchEvent('dragstart', { dataTransfer: courseDrag });
    await page.locator('.slot-row[data-index="' + targetIndex + '"]').dispatchEvent('drop', { dataTransfer: courseDrag });
    await courseDrag.dispose(); await flush();
    const moved = await page.evaluate(name => data.explorer.find(s => s.name === name), movedName);
    assert.equal(moved.theme, '机械主题'); assert.equal(moved.themeColor, '#365eb8');
    assert.equal(await page.evaluate(() => getThemeColor('explorer', '机械主题')), '#365eb8');

    // Deleting a theme merges its courses into the receiving theme and uses that theme's color.
    page.once('dialog', dialog => dialog.accept());
    await header('新视觉主题').locator('.th-del').click(); await flush();
    assert.equal(await header('新视觉主题').count(), 0);
    const merged = await page.evaluate(() => data.explorer);
    assert.ok(merged.every(s => s.theme === '机械主题' && s.themeColor === '#365eb8'));
    assert.equal(await page.evaluate(() => getThemeColor('explorer2', '视觉主题')), '#247348');
    console.log('PASS theme reordering, course drag inheritance and theme-delete color adoption');

    // Reset affects only the selected theme and removes persisted override fields.
    await header('机械主题').locator('.th-color-reset').click(); await flush();
    assert.ok((await page.evaluate(() => data.explorer)).every(s => !Object.prototype.hasOwnProperty.call(s, 'themeColor')));
    assert.equal(await header('机械主题').locator('.th-color-picker').inputValue(), '#2979ff');
    assert.equal(await page.evaluate(() => getThemeColor('explorer2', '视觉主题')), '#247348');
    await page.reload(); await page.waitForFunction(() => syncConnected);
    await page.evaluate(() => openCategory('explorer'));
    assert.equal(await header('机械主题').locator('.th-color-picker').inputValue(), '#2979ff');

    // Renaming into an existing theme adopts that existing group's color.
    const savedExplorer = await page.evaluate(() => structuredClone(data.explorer));
    await page.evaluate(() => {
      data.explorer.push({ name: '改名合并测试课程', theme: '合并源主题', themeColor: '#aa2244', marker: 'preserved' });
      setThemeColor('explorer', '机械主题', '#226688'); renderCategory('explorer');
    }); await flush();
    const mergeEditor = header('合并源主题').locator('.th-text');
    await mergeEditor.fill('机械主题'); await mergeEditor.press('Enter'); await flush();
    assert.equal(await header('机械主题').count(), 1);
    assert.ok((await page.evaluate(() => data.explorer)).every(s => s.theme === '机械主题' && s.themeColor === '#226688'));
    await page.evaluate(saved => { data.explorer = saved; saveData(); renderCategory('explorer'); }, savedExplorer); await flush();

    // The same controls and persistence work in all course modules.
    for (const [category, theme] of [['inspire', '启蒙主题'], ['challenge', '挑战主题']]) {
      await page.evaluate(category => { goHome(); openCategory(category); }, category);
      assert.equal(await header(theme).locator('.th-color-picker').inputValue(), '#2979ff');
      await header(theme).locator('.th-color-picker').fill('#8844aa'); await flush();
      assert.equal(await page.evaluate(({ category, theme }) => getThemeColor(category, theme), { category, theme }), '#8844aa');
      await header(theme).locator('.th-color-reset').click(); await flush();
      assert.ok((await page.evaluate(category => data[category], category)).every(s => !Object.prototype.hasOwnProperty.call(s, 'themeColor')));
    }
    await page.evaluate(() => { goHome(); openCategory('explorer'); });
    console.log('PASS rename-to-existing-group color adoption and all four module controls');

    // Even extreme chosen colors must leave labels readable in light and dark appearance.
    for (const appearance of ['dark', 'light']) {
      await page.evaluate(appearance => applyTheme(appearance), appearance);
      for (const color of ['#000000', '#ffffff']) {
        await page.evaluate(color => setThemeColor('explorer', '机械主题', color), color); await flush();
        const style = await header('机械主题').locator('.th-text').evaluate(el => {
          const parse = value => (value.match(/[\d.]+/g) || []).map(Number);
          const text = parse(getComputedStyle(el).color);
          const background = parse(getComputedStyle(el.closest('.theme-header')).backgroundColor);
          const page = parse(getComputedStyle(document.body).backgroundColor);
          const alpha = background.length > 3 ? background[3] : 1;
          const blended = background.slice(0, 3).map((value, index) => value * alpha + page[index] * (1 - alpha));
          const luminance = rgb => rgb.slice(0, 3).map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
          const a = luminance(text), b = luminance(blended);
          return { opacity: getComputedStyle(el).opacity, visible: !!el.getClientRects().length, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
        assert.equal(style.visible, true); assert.notEqual(style.opacity, '0');
        assert.ok(style.contrast >= 3, appearance + ' labels need legible contrast even for ' + color + ': ' + style.contrast);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { applyTheme('dark'); setThemeColor('explorer', '机械主题', '#8f55cf'); }); await flush();
    const overflow = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(overflow.actual <= overflow.viewport, '390px page must not overflow horizontally: ' + JSON.stringify(overflow));
    await page.setViewportSize({ width: 1280, height: 900 });
    const finalCourses = await page.evaluate(() => data);
    for (const [category, originals] of Object.entries(originalCourses)) {
      for (const original of originals) {
        const current = finalCourses[category].find(item => item.name === original.name);
        assert.ok(current, 'color and theme operations must preserve existing courses');
        const withoutTheme = ({ theme, themeColor, ...rest }) => rest;
        assert.deepEqual(withoutTheme(current), withoutTheme(original), 'course text and other payload fields must remain unchanged');
      }
    }
    assert.ok(updates > 0); assert.deepEqual(errors, []);
    console.log('PASS reset persistence, dark/light themes, 390px layout and no browser exceptions');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
