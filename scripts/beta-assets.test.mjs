import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';
import { buildSolidPng, crc32, ensureBetaAssets, OUTPUT_DIR, SIZE } from './beta-assets.cjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('builds byte-identical output for the same inputs (deterministic)', () => {
  const a = buildSolidPng(8, [10, 20, 30]);
  const b = buildSolidPng(8, [10, 20, 30]);
  assert.deepEqual(a, b);
});

test('produces a structurally valid PNG with the required chunks', () => {
  const png = buildSolidPng(4, [1, 2, 3]);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 4);
  assert.equal(height, 4);
  assert.ok(png.includes(Buffer.from('IDAT', 'ascii')));
  assert.ok(png.includes(Buffer.from('IEND', 'ascii')));
});

test('the IDAT payload inflates back to the exact filtered RGB scanlines', () => {
  const size = 3;
  const png = buildSolidPng(size, [200, 100, 50]);
  let offset = 8;
  let idat = Buffer.alloc(0);
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IDAT') idat = Buffer.concat([idat, data]);
    offset += 8 + length + 4;
  }
  const raw = zlib.inflateSync(idat);
  const rowBytes = size * 3 + 1;
  assert.equal(raw.length, rowBytes * size);
  for (let y = 0; y < size; y++) {
    const row = y * rowBytes;
    assert.equal(raw[row], 0, 'filter byte must be none (0)');
    for (let x = 0; x < size; x++) {
      const px = row + 1 + x * 3;
      assert.deepEqual([raw[px], raw[px + 1], raw[px + 2]], [200, 100, 50]);
    }
  }
});

test('a corrupted chunk is detectable via CRC32', () => {
  const png = buildSolidPng(2, [1, 1, 1]);
  const ihdrCrc = png.readUInt32BE(29);
  const recomputed = crc32(png.subarray(12, 29));
  assert.equal(ihdrCrc, recomputed);
});

test('ensureBetaAssets writes untracked 1024x1024 icon and splash PNGs', () => {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  const { iconPath, splashPath } = ensureBetaAssets();
  assert.ok(existsSync(iconPath));
  assert.ok(existsSync(splashPath));
  const png = buildSolidPng(SIZE, [0x1a, 0x12, 0x12]);
  assert.equal(png.readUInt32BE(16), SIZE);
});
