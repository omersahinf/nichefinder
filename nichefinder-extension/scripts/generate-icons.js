const fs = require('fs');
const path = require('path');

function createPngIcon(size) {
  const header = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52,
    (size >> 8) & 0xFF, size & 0xFF,
    (size >> 8) & 0xFF, size & 0xFF,
    0x08, 0x02,
    0x00, 0x00, 0x00,
  ]);
  
  const red = [220, 26, 26];
  const white = [255, 255, 255];
  
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0);
    for (let x = 0; x < size; x++) {
      const margin = Math.floor(size * 0.15);
      const isInner = x >= margin && x < size - margin && y >= margin && y < size - margin;
      const color = isInner ? white : red;
      rawData.push(...color);
    }
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  
  const ihdrCrc = crc32(header.slice(12, 24));
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  const png = Buffer.concat([
    header,
    Buffer.from([ihdrCrc >> 24, (ihdrCrc >> 16) & 0xFF, (ihdrCrc >> 8) & 0xFF, ihdrCrc & 0xFF]),
    idatChunk,
    iendChunk
  ]);
  
  return png;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.from([crc >> 24, (crc >> 16) & 0xFF, (crc >> 8) & 0xFF, crc & 0xFF]);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

for (const size of sizes) {
  const png = createPngIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png`);
}