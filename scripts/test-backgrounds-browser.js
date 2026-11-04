// Real Chromium regression with in-memory courses; never writes project course data.
// Run explicitly with: node scripts/test-backgrounds-browser.js
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const styles = ['tech', 'paper', 'forest', 'warm'];
const artifactDir = process.env.BACKGROUND_SCREENSHOT_DIR;
const lesson = (name, theme) => ({
  name, theme, subtitle: '从观察路径到合作调试', equipment: 'AI Camera、小车、黑色胶带',
  objectives: '<p>理解摄像头采集图像、计算偏移和调整方向的过程。</p><p>通过合作测试，练习表达和分工。</p>',
  procedure: '<p>1、认识视觉巡线</p><p>观察摄像头拍摄的黑线和背景，讨论路径识别的原理。</p><p>2、搭建并安装摄像头</p><p>让摄像头垂直朝下，固定在小车正上方。</p><p>3、编写巡线程序</p><p>使用 P 巡线控制转向，排除 -99999 的异常值。</p><p>4、测试与合作调试</p><p>降低基础速度，测试转弯与不同光照条件，记录结果。</p>',
  ppts: [], marker: 'preserved'
});
let courses = {
  inspire: [lesson('认识结构', '启蒙主题')],
  explorer: [lesson('AI Camera 视觉巡线', '视觉主题'), lesson('路径合作', '视觉主题')],
  explorer2: [lesson('第二年课程', '进阶主题')],
  challenge: [lesson('挑战课程', '挑战主题')]
};
let updates = 0;
const server = http.createServer(async (req, res) => {
  try {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route === '/data.json') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(courses)); return;
    }
    if (route === '/update' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      courses = JSON.parse(body); updates++;
      res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return;
    }
    const file = route === '/' ? 'index.html' : route.slice(1);
    if (!['index.html', 'course-preview.js', 'school-knowledge.js', 'course-images.js', 'git-sync-client.js'].includes(file)) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript;charset=utf-8');
    res.end(await fs.readFile(path.join(root, file)));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});

// Measure composited text/background contrast, including translucent theme headers.
async function contrast(page, selector) {
  return page.locator(selector).first().evaluate(el => {
    const rgba = value => {
      const values = value.match(/[\d.]+/g).map(Number);
      return [values[0], values[1], values[2], values.length === 4 ? values[3] : 1];
    };
    const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
    const ancestors = []; for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
    let bg = [255, 255, 255, 1];
    for (const node of ancestors) bg = over(rgba(getComputedStyle(node).backgroundColor), bg);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const luminance = color => color.slice(0, 3).map(x => {
      x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function main() {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => syncConnected && window.CoursePreview && data.explorer.length === 2);
    await page.evaluate(() => {
      openCategory('explorer'); setThemeColor('explorer', '视觉主题', '#c44250');
    });
    await page.evaluate(() => serverSaveQueue);
    const initialUpdates = updates;
    await page.evaluate(() => {
      openDocument('explorer', 0);
      document.getElementById('doc-objectives').innerHTML += '<p>尚未保存的课堂目标。</p>';
      window.__objectivesNode = document.getElementById('doc-objectives');
      window.__procedureNode = document.getElementById('doc-procedure');
      window.__objectivesHTML = __objectivesNode.innerHTML;
      window.__procedureHTML = __procedureNode.innerHTML;
      window.__savedCourses = JSON.stringify(data);
      window.__themeHeader = document.querySelector('.theme-header');
    });
    await page.locator('#btn-background').click();
    assert.equal(await page.locator('#background-settings-dialog').evaluate(el => el.open), true);
    assert.deepEqual(await page.locator('#page-style-select option').evaluateAll(options => options.map(x => x.value)), styles);
    assert.deepEqual(await page.locator('#export-style-select option').evaluateAll(options => options.map(x => x.value)), ['original', ...styles]);
    const backgrounds = new Set();
    for (const style of styles) {
      await page.locator('#page-style-select').selectOption(style);
      // Existing editors animate their colors; assess the settled palette.
      await page.waitForFunction(() => getComputedStyle(document.getElementById('doc-objectives')).color === getComputedStyle(document.body).color);
      const result = await page.evaluate(() => ({
        style: document.documentElement.dataset.pageStyle,
        stored: localStorage.getItem('makex_page_style'),
        exported: localStorage.getItem('makex_export_style') || 'original',
        background: getComputedStyle(document.body).backgroundColor,
        sameEditor: __objectivesNode === document.getElementById('doc-objectives') && __procedureNode === document.getElementById('doc-procedure'),
        sameHTML: __objectivesHTML === __objectivesNode.innerHTML && __procedureHTML === __procedureNode.innerHTML,
        sameData: __savedCourses === JSON.stringify(data),
        sameHeader: __themeHeader === document.querySelector('.theme-header'),
        theme: getThemeColor('explorer', '视觉主题')
      }));
      assert.equal(result.style, style); assert.equal(result.stored, style);
      assert.equal(result.exported, 'original', 'page selection must not change export selection');
      assert.equal(result.sameEditor, true, 'style switch must retain editor nodes');
      assert.equal(result.sameHTML, true, 'style switch must retain unsaved rich text');
      assert.equal(result.sameData, true, 'background settings must not alter course data');
      assert.equal(result.sameHeader, true, 'style switch must not redraw theme editors');
      assert.equal(result.theme, '#c44250'); backgrounds.add(result.background);
      assert.ok(await contrast(page, '#doc-objectives') >= 4.5, style + ' editor text contrast');
      assert.ok(await contrast(page, '.theme-header .th-text') >= 4.5, style + ' theme title contrast');
      assert.ok(await contrast(page, '#page-style-select') >= 4.5, style + ' select text contrast');
    }
    assert.equal(backgrounds.size, 4, 'all four page backgrounds must visibly differ');
    assert.equal(updates, initialUpdates, 'background changes must not save course edits');
    await page.locator('#export-style-select').selectOption('paper');
    assert.equal(await page.evaluate(() => localStorage.getItem('makex_export_style')), 'paper');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.pageStyle), 'warm');
    if (artifactDir) {
      await fs.mkdir(artifactDir, { recursive: true });
      await page.screenshot({ path: path.join(artifactDir, 'background-desktop.png') });
    }
    await page.locator('.background-settings-close').click();
    assert.equal(await page.locator('#background-settings-dialog').evaluate(el => el.open), false);
    // Save intentionally before reloading; selecting backgrounds itself must not save.
    await page.evaluate(() => saveDocumentData()); await page.evaluate(() => serverSaveQueue);
    await page.reload(); await page.waitForFunction(() => syncConnected && window.CoursePreview);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.pageStyle), 'warm');
    await page.locator('#btn-background').click();
    assert.equal(await page.locator('#page-style-select').inputValue(), 'warm');
    assert.equal(await page.locator('#export-style-select').inputValue(), 'paper');
    await page.locator('.background-settings-close').click();
    await page.evaluate(() => { openCategory('explorer'); openDocument('explorer', 0); });
    assert.equal(await page.evaluate(() => getThemeColor('explorer', '视觉主题')), '#c44250');
    assert.match(await page.locator('#doc-objectives').innerText(), /尚未保存的课堂目标/);
    console.log('PASS independent page/export controls, four visible page styles, editor preservation, contrast and refresh persistence');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#btn-background').click();
    for (const style of styles) {
      await page.locator('#page-style-select').selectOption(style);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.background-settings-close')).color === getComputedStyle(document.body).color);
      const bounds = await page.evaluate(() => {
        const dialog = document.getElementById('background-settings-dialog');
        const visible = ['#btn-background', '#background-settings-dialog', '#page-style-select', '#export-style-select', '.background-settings-close'];
        return {
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          dialogScrollWidth: dialog.scrollWidth, dialogWidth: dialog.clientWidth,
          rects: visible.map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { selector, left: r.left, right: r.right }; })
        };
      });
      assert.ok(bounds.scrollWidth <= bounds.width + 1, style + ' mobile page must not overflow horizontally');
      assert.ok(bounds.dialogScrollWidth <= bounds.dialogWidth + 1, style + ' mobile dialog must not overflow');
      for (const rect of bounds.rects) assert.ok(rect.left >= -1 && rect.right <= bounds.width + 1, style + ' mobile bounds: ' + JSON.stringify(rect));
      assert.ok(await contrast(page, '#page-style-select') >= 4.5, style + ' mobile control contrast');
      assert.ok(await contrast(page, '.background-settings-close') >= 4.5, style + ' mobile close-button contrast');
      if (artifactDir) {
        await fs.mkdir(artifactDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactDir, 'background-mobile-' + style + '.png') });
      }
    }
    await page.locator('.background-settings-close').click();
    await page.setViewportSize({ width: 1280, height: 960 });
    console.log('PASS 390px controls and dialog bounds in every page style');

    // Capture actual drawing operations on the final PNG canvas, including transforms.
    await page.evaluate(() => {
      const ids = new WeakMap(); let nextID = 0;
      const id = canvas => { if (!ids.has(canvas)) ids.set(canvas, ++nextID); return ids.get(canvas); };
      window.__canvasLog = []; window.__lastPNG = null; window.__lastClipboardBlob = null;
      const text = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(value, x, y, ...rest) {
        const m = this.getTransform();
        __canvasLog.push({ op: 'text', canvas: id(this.canvas), text: String(value), alpha: this.globalAlpha,
          x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, font: this.font });
        return text.call(this, value, x, y, ...rest);
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        __canvasLog.push({ op: 'drawImage', canvas: id(this.canvas) }); return draw.apply(this, args);
      };
      const blob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, ...rest) {
        window.__lastPNG = { canvas: id(this), width: this.width, height: this.height };
        return blob.call(this, callback, ...rest);
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        write: async items => { window.__lastClipboardBlob = await items[0].getType('image/png'); }
      } });
    });
    const hashes = { preview: new Map(), full: new Map() };
    const fullBackgrounds = new Map();
    for (const style of ['original', ...styles]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('#btn-background').click();
      await page.locator('#export-style-select').selectOption(style);
      await page.locator('.background-settings-close').click();
      for (const kind of ['preview', 'full']) {
        await page.evaluate(() => { __canvasLog.length = 0; __lastClipboardBlob = null; __lastPNG = null; });
        await page.locator(kind === 'preview' ? '[onclick="generateImage()"]' : '[onclick="generateFullDocumentImage()"]').click();
        await page.waitForFunction(() => window.__lastClipboardBlob && window.__lastPNG);
        const result = await page.evaluate(async includePNG => {
          const meta = __lastPNG; const log = __canvasLog.slice(); const blob = __lastClipboardBlob;
          const bytes = await blob.arrayBuffer(); const image = await createImageBitmap(blob);
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join('');
          const sample = new OffscreenCanvas(1, 1).getContext('2d');
          sample.drawImage(image, 5, image.height - 10, 1, 1, 0, 0, 1, 1);
          const result = { meta, log, hash, background: Array.from(sample.getImageData(0, 0, 1, 1).data), size: blob.size, type: blob.type, width: image.width, height: image.height, signature: Array.from(new Uint8Array(bytes).slice(0, 8)) };
          if (includePNG) result.base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
          image.close(); return result;
        }, !!artifactDir);
        assert.equal(result.type, 'image/png'); assert.ok(result.size > 2000);
        assert.deepEqual(result.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(result.width, kind === 'preview' ? 1000 : 800);
        assert.equal(result.height, result.meta.height); assert.ok(result.height > 600 && result.height < 12000);
        assert.doesNotMatch(result.log.filter(x => x.op === 'text').map(x => x.text).join('\n'), /MAKX/);
        assert.ok(result.log.some(x => x.text === 'AI Camera 视觉巡线' && x.alpha > 0.5), kind + ' must retain the course title');
        const finalOps = result.log.filter(x => x.canvas === result.meta.canvas);
        const marks = finalOps.filter(x => x.op === 'text' && x.text === 'Kclub' && x.alpha > 0 && x.alpha <= 0.08);
        assert.ok(marks.length >= 3, kind + '/' + style + ' needs faint repeated Kclub on its final canvas');
        const visible = marks.filter(x => x.x >= 0 && x.x <= result.width && x.y >= 0 && x.y <= result.height);
        assert.ok(visible.some(x => x.y <= result.height * 0.3), kind + '/' + style + ' top watermark coverage');
        assert.ok(visible.some(x => x.y >= result.height * 0.7), kind + '/' + style + ' bottom watermark coverage');
        if (kind === 'full') {
          assert.ok(result.log.some(x => x.text === 'Kclub' && x.alpha >= 0.9), 'full lesson brand must be Kclub');
          const cropAt = finalOps.findLastIndex(x => x.op === 'drawImage');
          assert.ok(cropAt >= 0, 'full lesson fixture must exercise the final crop');
          assert.ok(finalOps.slice(cropAt + 1).some(x => x.text === 'Kclub' && x.alpha <= 0.08), 'watermark must be applied after the final crop');
        } else {
          assert.equal(await page.locator('#training-preview-image').isVisible(), true);
          assert.match(await page.locator('#training-preview-status').innerText(), /生成|复制/);
          await page.locator('#training-preview-dialog header button').click();
        }
        hashes[kind].set(style, result.hash);
        if (kind === 'full') fullBackgrounds.set(style, result.background);
        if (artifactDir) await fs.writeFile(path.join(artifactDir, kind + '-' + style + '.png'), Buffer.from(result.base64, 'base64'));
      }
    }
    for (const kind of ['preview', 'full']) {
      assert.equal(new Set(styles.map(style => hashes[kind].get(style))).size, 4, kind + ' presets must produce four different PNGs');
      if (kind === 'preview') assert.equal(hashes[kind].get('original'), hashes[kind].get('forest'), 'original preview must retain its forest palette');
    }
    // Original full lessons retain each category's accent; the tech background is shared.
    assert.deepEqual(fullBackgrounds.get('original'), fullBackgrounds.get('tech'));
    console.log('PASS ten actual PNG exports, four palettes, original-style defaults, Kclub brand and faint full-height post-crop watermarks');

    // Exceed the old 8000px allocation, then check the actual cropped export bottom.
    await page.evaluate(() => {
      document.getElementById('doc-procedure').innerHTML = Array.from({ length: 430 }, (_, i) => '<p>第 ' + (i + 1) + ' 项课堂记录：观察路径，调整小车并与同伴交流。</p>').join('') + '<p>长课程结尾标记</p>';
      __canvasLog.length = 0; __lastClipboardBlob = null; __lastPNG = null;
    });
    await page.locator('[onclick="generateFullDocumentImage()"]').click();
    await page.waitForFunction(() => window.__lastClipboardBlob && window.__lastPNG);
    const long = await page.evaluate(async includePNG => {
      const result = { meta: __lastPNG, log: __canvasLog.slice(), size: __lastClipboardBlob.size };
      if (includePNG) result.base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(__lastClipboardBlob); });
      return result;
    }, !!artifactDir);
    assert.ok(long.meta.height > 8000 && long.meta.height < 20000, 'long lesson must exceed the old allocation');
    assert.ok(long.size > 10000);
    const lastText = long.log.find(x => x.text === '长课程结尾标记' && x.alpha > 0.5);
    assert.ok(lastText && lastText.y < long.meta.height - 20, 'long lesson final text must fit in the actual PNG');
    const longFinal = long.log.filter(x => x.canvas === long.meta.canvas);
    const cropAt = longFinal.findLastIndex(x => x.op === 'drawImage');
    assert.ok(cropAt >= 0, 'long lesson must exercise final cropping');
    const bottomMarks = longFinal.slice(cropAt + 1).filter(x => x.text === 'Kclub' && x.alpha > 0 && x.alpha <= 0.08 && x.x >= 0 && x.x <= long.meta.width && x.y >= long.meta.height * 0.95 && x.y <= long.meta.height);
    assert.ok(bottomMarks.length, 'post-crop watermarks must reach the last 5% of a long PNG');
    if (artifactDir) await fs.writeFile(path.join(artifactDir, 'full-long-warm.png'), Buffer.from(long.base64, 'base64'));
    console.log('PASS ' + long.meta.height + 'px full lesson retains final text and faint watermarks through its bottom 5%');

    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async () => { throw Error('permission denied'); } } }));
    for (const kind of ['preview', 'full']) {
      const downloading = page.waitForEvent('download');
      await page.locator(kind === 'preview' ? '[onclick="generateImage()"]' : '[onclick="generateFullDocumentImage()"]').click();
      const download = await downloading;
      assert.match(download.suggestedFilename(), /\.png$/);
      if (kind === 'preview') {
        await page.waitForFunction(() => !previewImageState.busy);
        assert.match(await page.locator('#training-preview-status').innerText(), /下载|保存/);
        await page.locator('#training-preview-dialog header button').click();
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS clipboard denial downloads both image types; no browser errors and no project course writes');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
