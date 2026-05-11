import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function fillRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number, number],
) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      const index = (row * 64 + col) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = color[3];
    }
  }
}

export function createFallbackSkinPng(seedText: string) {
  const seed = seedText
    .split("")
    .reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
  const base: [number, number, number, number] = [
    64 + (seed % 120),
    72 + ((seed * 3) % 110),
    86 + ((seed * 7) % 100),
    255,
  ];
  const dark: [number, number, number, number] = [
    Math.max(16, base[0] - 42),
    Math.max(16, base[1] - 42),
    Math.max(16, base[2] - 42),
    255,
  ];
  const light: [number, number, number, number] = [
    Math.min(235, base[0] + 44),
    Math.min(235, base[1] + 44),
    Math.min(235, base[2] + 44),
    255,
  ];

  const pixels = new Uint8Array(64 * 64 * 4);
  fillRect(pixels, 0, 0, 64, 64, [0, 0, 0, 0]);
  fillRect(pixels, 8, 8, 8, 8, light);
  fillRect(pixels, 16, 8, 8, 8, base);
  fillRect(pixels, 8, 16, 8, 8, base);
  fillRect(pixels, 16, 16, 8, 8, dark);
  fillRect(pixels, 20, 20, 2, 2, [18, 18, 18, 255]);
  fillRect(pixels, 11, 20, 2, 2, [18, 18, 18, 255]);
  fillRect(pixels, 20, 21, 2, 1, [255, 255, 255, 255]);
  fillRect(pixels, 11, 21, 2, 1, [255, 255, 255, 255]);
  fillRect(pixels, 20, 32, 8, 12, base);
  fillRect(pixels, 44, 20, 4, 12, dark);
  fillRect(pixels, 36, 52, 4, 12, dark);

  const raw = Buffer.alloc((64 * 4 + 1) * 64);
  for (let row = 0; row < 64; row += 1) {
    raw[row * (64 * 4 + 1)] = 0;
    Buffer.from(pixels.subarray(row * 64 * 4, (row + 1) * 64 * 4)).copy(
      raw,
      row * (64 * 4 + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
