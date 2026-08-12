const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'beta');
const SIZE = 1024;
const ICON_FILENAME = 'icon.png';
const SPLASH_FILENAME = 'splash-icon.png';
const ICON_RELATIVE_PATH = './assets/beta/icon.png';
const SPLASH_RELATIVE_PATH = './assets/beta/splash-icon.png';

// Deterministic opaque placeholder color. Engineering-only art so Expo has a
// valid, non-fabricated icon/splash to consume during beta builds — not a
// substitute for real, approved Kinwin brand assets.
const PLACEHOLDER_RGB = [0x1a, 0x12, 0x12];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/** Builds a deterministic, opaque, solid-color square RGB PNG using only Node's stdlib (zlib). */
function buildSolidPng(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const rowBytes = size * 3 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // per-row filter type: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function ensureBetaAssets() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const png = buildSolidPng(SIZE, PLACEHOLDER_RGB);
  writeFileSync(path.join(OUTPUT_DIR, ICON_FILENAME), png);
  writeFileSync(path.join(OUTPUT_DIR, SPLASH_FILENAME), png);
  return { iconPath: path.join(OUTPUT_DIR, ICON_FILENAME), splashPath: path.join(OUTPUT_DIR, SPLASH_FILENAME) };
}

module.exports = {
  OUTPUT_DIR,
  SIZE,
  ICON_RELATIVE_PATH,
  SPLASH_RELATIVE_PATH,
  PLACEHOLDER_RGB,
  crc32,
  buildSolidPng,
  ensureBetaAssets,
};

if (require.main === module) {
  ensureBetaAssets();
  console.log(`Generated deterministic beta assets in ${OUTPUT_DIR}`);
}
