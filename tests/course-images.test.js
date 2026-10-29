const { test } = require('node:test');
const assert = require('node:assert/strict');
const images = require('../course-images');
test('course images accept supported raster formats within the size limit', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(images.accepted({ type, size: 1024 }), true);
  assert.equal(images.accepted({ type: 'image/svg+xml', size: 100 }), false);
  assert.equal(images.accepted({ type: 'image/jpeg', size: 11 * 1024 * 1024 }), false);
  assert.equal(images.accepted({ type: 'application/pdf', size: 100 }), false);
});
test('export only accepts embedded raster images, never URLs or active content', () => {
  assert.equal(images.embedded('data:image/jpeg;base64,/9j/4AAQ='), true);
  assert.equal(images.embedded('data:image/png;base64,iVBORw0='), true);
  for (const src of ['https://example.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,AA==', 'file:///photo.png']) {
    assert.equal(images.embedded(src), false);
  }
});
test('legacy courses without images export an empty gallery', async () => {
  assert.deepEqual(await images.prepareExport(undefined, 680), []);
  assert.deepEqual(await images.prepareExport([], 680), []);
});
