// Explicit browser regression checks: node scripts/test-editor-browser.js
// Requires Playwright and Chromium; does not modify the real course data or use Git.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const course = (name, theme) => ({ name, theme, subtitle: '', equipment: '', objectives: '', procedure: '', ppts: [] });
let courses = {
  inspire: [course('第一课', '主题甲'), course('第二课', '主题甲'), course('第三课', '主题乙')],
  explorer: [course('探索课', '探索主题')], explorer2: [], challenge: []
};
const server = http.createServer(async (req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  if (route === '/data.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(courses)); return;
  }
  if (route === '/update' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    courses = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}'); return;
  }
  const name = route === '/' ? 'index.html' : route.slice(1);
  if (!['index.html', 'course-preview.js', 'school-knowledge.js', 'course-images.js', 'git-sync-client.js'].includes(name)) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript;charset=utf-8');
  res.end(fs.readFileSync(path.join(root, name)));
});

async function selectText(page, editorId, text) {
  await page.evaluate(({ editorId, text }) => {
    const editor = document.getElementById(editorId);
    editor.focus();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = []; let node; let contents = '';
    while ((node = walker.nextNode())) { nodes.push({ node, offset: contents.length }); contents += node.textContent; }
    const start = contents.indexOf(text);
    if (start === -1) throw Error('Selection text missing: ' + text);
    const end = start + text.length;
    const a = nodes.find(item => start >= item.offset && start < item.offset + item.node.length);
    const b = nodes.find(item => end > item.offset && end <= item.offset + item.node.length);
    const range = document.createRange();
    range.setStart(a.node, start - a.offset); range.setEnd(b.node, end - b.offset);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    syncRichSelection();
  }, { editorId, text });
}

async function paste(page, editorId, plain, html, selectAll = true) {
  await page.evaluate(({ editorId, plain, html, selectAll }) => {
    const editor = document.getElementById(editorId);
    editor.focus();
    if (selectAll) {
      const selection = getSelection(); const range = document.createRange();
      range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
    }
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', plain); clipboardData.setData('text/html', html);
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }, { editorId, plain, html, selectAll });
}

async function main() {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => syncConnected && data.inspire.length === 3);
    await page.evaluate(() => openCategory('inspire'));

    const theme = page.locator('.th-text').first();
    await theme.focus();
    await theme.dispatchEvent('compositionstart');
    await theme.fill('中文新主题');
    await theme.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
    await theme.dispatchEvent('compositionend', { data: '题' });
    assert.equal(await theme.evaluate(el => document.activeElement === el), true, 'IME confirmation must keep theme editing focused');
    await page.evaluate(() => pollData());
    assert.equal(await theme.textContent(), '中文新主题', 'polling must preserve the theme draft');
    assert.equal(await theme.evaluate(el => document.activeElement === el), true);
    await theme.press('Enter');
    assert.deepEqual(await page.evaluate(() => data.inspire.map(item => item.theme)), ['中文新主题', '中文新主题', '主题乙']);
    const otherTheme = page.locator('.th-text').nth(1);
    await otherTheme.evaluate(el => {
      el.focus();
      const range = document.createRange(); range.selectNodeContents(el);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', '粘贴\r\n主题\t标题');
      clipboardData.setData('text/html', '<b style="color:red">粘贴<br>主题 标题</b>');
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    });
    assert.equal(await otherTheme.textContent(), '粘贴 主题 标题');
    assert.equal(await otherTheme.locator('b,span,br').count(), 0);
    assert.equal(await otherTheme.evaluate(el => document.activeElement === el), true);
    await otherTheme.press('Enter');
    console.log('PASS theme IME focus, polling protection, and correct group rename');

    await page.evaluate(() => openDocument('inspire', 0));
    for (const id of ['doc-objectives', 'doc-procedure']) {
      await paste(page, id, '第一行\n第二行', '<div style="font: bold 48px Times; color:red;background:yellow">第一行</div><div>第二行</div>');
      const pasted = await page.locator('#' + id).evaluate(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node; const styles = [];
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim()) continue;
          const style = getComputedStyle(node.parentElement);
          styles.push({ size: style.fontSize, weight: style.fontWeight, family: style.fontFamily });
        }
        return { text: el.innerText, html: el.innerHTML, styles };
      });
      assert.equal(pasted.text.trim(), '第一行\n第二行');
      assert.ok(!/Times|yellow|48px|<img|<script/i.test(pasted.html));
      assert.ok(pasted.styles.length > 0 && pasted.styles.every(style => style.size === '14px' && Number(style.weight) === 400));
      const exported = await page.evaluate(id => {
        const context = document.createElement('canvas').getContext('2d');
        const calls = [];
        const draw = { font: '', fillStyle: '', textBaseline: '', measureText: text => context.measureText(text), fillText() { calls.push(this.fillStyle); } };
        const runs = extractRichLines(id);
        drawRichLines(layoutRichLines(runs, 500, context), 0, 0, 500, '#333333', draw);
        return { runs: runs.flat(), colors: calls };
      }, id);
      assert.ok(exported.runs.length && exported.runs.every(run => !run.color), 'default text must export with semantic default color');
      assert.ok(exported.colors.length && exported.colors.every(color => color === '#333333'), 'default text must draw in the export fallback color, not the dark-theme foreground');
    }
    console.log('PASS plain-text paste removes source styling and preserves line breaks in both editors');

    const toolbar = page.locator('.rich-toolbar[data-editor="doc-objectives"]');
    await selectText(page, 'doc-objectives', '第一行');
    await toolbar.locator('[data-rich-action="bold"]').click();
    await selectText(page, 'doc-objectives', '第一行');
    await toolbar.locator('[data-rich-size-input]').fill('24');
    await toolbar.locator('[data-rich-size-input]').press('Enter');
    await selectText(page, 'doc-objectives', '第一行');
    await toolbar.locator('[data-rich-color]').fill('#d12b31');
    const runs = await page.evaluate(() => extractRichLines('doc-objectives').flat());
    const selected = runs.filter(run => run.text.includes('第一行'));
    assert.ok(selected.some(run => run.bold && run.size === 24), 'selected text must retain size and bold together: ' + JSON.stringify(runs));
    assert.ok(selected.some(run => /209.*43.*49|#d12b31/i.test(run.color)), 'selected text color must reach export extraction');
    assert.ok(runs.filter(run => run.text.includes('第二行')).every(run => !run.bold && run.size === 14), 'unselected text must keep its formatting');

    const stored = await page.evaluate(async () => {
      saveDocumentData(); await serverSaveQueue;
      const html = document.getElementById('doc-objectives').innerHTML;
      closeDocument(); openDocument('inspire', 0);
      return { html, reopened: document.getElementById('doc-objectives').innerHTML, local: JSON.parse(localStorage.getItem('makex_data')).inspire[0].objectives };
    });
    assert.equal(stored.reopened, stored.html); assert.equal(stored.local, stored.html); assert.equal(courses.inspire[0].objectives, stored.html);
    console.log('PASS selection formatting, local/server save, and reopen persistence');

    const drawn = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d');
      const calls = [];
      const draw = { font: '', fillStyle: '', textBaseline: '', measureText: text => context.measureText(text), fillText(text) { calls.push({ text, color: this.fillStyle, font: this.font }); } };
      const layout = layoutRichLines(extractRichLines('doc-objectives'), 500, context);
      drawRichLines(layout, 0, 0, 500, '#333333', draw);
      return calls;
    });
    assert.ok(drawn.some(call => /209.*43.*49|#d12b31/i.test(call.color) && /bold 24px/.test(call.font)), 'PNG drawing must retain selected color, size and weight');
    await selectText(page, 'doc-objectives', '第一行');
    await toolbar.locator('[data-rich-action="size-up"]').click();
    await toolbar.locator('[data-rich-action="size-up"]').click();
    let styled = await page.evaluate(() => extractRichLines('doc-objectives').flat().filter(run => run.text.includes('第一行')));
    assert.ok(styled.some(run => run.bold && run.size === 28), 'successive size clicks must preserve existing styles and selection');
    await toolbar.locator('[data-rich-action="bold"]').click();
    styled = await page.evaluate(() => extractRichLines('doc-objectives').flat().filter(run => run.text.includes('第一行')));
    assert.ok(styled.every(run => !run.bold && run.size === 28), 'bold must toggle off without resetting font size');

    await page.evaluate(() => {
      const editor = document.getElementById('doc-objectives'); editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor);
      getSelection().removeAllRanges(); getSelection().addRange(range); syncRichSelection();
    });
    await toolbar.locator('[data-rich-size-input]').fill('18');
    await toolbar.locator('[data-rich-size-input]').press('Enter');
    await toolbar.locator('[data-rich-color]').fill('#2855bb');
    const unified = await page.evaluate(() => extractRichLines('doc-objectives').flat());
    assert.ok(unified.length && unified.every(run => run.size === 18 && /40.*85.*187|#2855bb/i.test(run.color)), 'one selection spanning multiple source styles must use one chosen style');
    console.log('PASS successive formatting, bold-off, and mixed-style selection');

    await page.evaluate(() => {
      document.getElementById('doc-procedure').innerHTML = '<span style="font-size:40px;font-weight:700;color:#aa0000">前文字后</span>';
    });
    await selectText(page, 'doc-procedure', '文字');
    await paste(page, 'doc-procedure', '统一\n文本', '<span style="font-size:56px;font-weight:bold;color:blue">统一<br>文本</span>', false);
    const interior = await page.evaluate(() => extractRichLines('doc-procedure').flat());
    assert.ok(interior.filter(run => /统一|文本/.test(run.text)).every(run => run.size === 14 && !run.bold && !run.color), 'paste inside formatted text must reset pasted formatting');
    assert.ok(interior.filter(run => /前|后/.test(run.text)).every(run => run.size === 40 && run.bold), 'paste must preserve surrounding formatting');
    await page.locator('#doc-procedure').press('Control+z');
    assert.equal(await page.locator('#doc-procedure').innerText(), '前文字后', 'native undo must restore the text replaced by paste');
    await page.locator('#doc-procedure').press('Control+Shift+z');
    assert.equal(await page.locator('#doc-procedure').innerText(), '前统一\n文本后', 'native redo must restore the normalized pasted text');
    const redone = await page.evaluate(() => extractRichLines('doc-procedure').flat());
    assert.ok(redone.filter(run => /统一|文本/.test(run.text)).every(run => run.size === 14 && !run.bold && !run.color));
    await page.locator('#doc-procedure').press('Control+z');
    console.log('PASS paste within formatted text, surrounding styles, and native undo/redo');

    await page.evaluate(() => {
      const editor = document.getElementById('doc-procedure'); editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(range); syncRichSelection();
    });
    const procedureToolbar = page.locator('.rich-toolbar[data-editor="doc-procedure"]');
    await procedureToolbar.locator('[data-rich-action="bold"]').click();
    const wholeBox = await page.evaluate(() => extractRichLines('doc-procedure').flat());
    assert.ok(wholeBox.length && wholeBox.every(run => !run.bold && run.size === 40), 'a collapsed selection must apply bold-off to the whole text box');
    await procedureToolbar.locator('[data-rich-action="bold"]').click();
    assert.ok((await page.evaluate(() => extractRichLines('doc-procedure').flat())).every(run => run.bold), 'repeated whole-box bold must toggle on');
    await page.locator('#doc-procedure').press('Control+z');
    assert.ok((await page.evaluate(() => extractRichLines('doc-procedure').flat())).every(run => !run.bold && run.size === 40), 'formatting undo must restore prior weight without changing size');
    await page.locator('#doc-procedure').press('Control+Shift+z');
    assert.ok((await page.evaluate(() => extractRichLines('doc-procedure').flat())).every(run => run.bold && run.size === 40), 'formatting redo must restore weight and size');
    console.log('PASS whole-box formatting, repeated bold toggles, and formatting undo/redo');
    assert.deepEqual(errors, []);
    if (process.env.EDITOR_SCREENSHOT_DIR) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('#doc-objectives').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.EDITOR_SCREENSHOT_DIR, 'makex-editor-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#doc-objectives').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.EDITOR_SCREENSHOT_DIR, 'makex-editor-mobile.png') });
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      assert.ok(overflow.width <= overflow.viewport, 'mobile editor must not overflow horizontally: ' + JSON.stringify(overflow));
    }
    console.log('PASS PNG text drawing retains color, font size, and bold; no browser errors');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
