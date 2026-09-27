import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const BACKGROUND = [0x1e, 0x1e, 0x2e] as const;
const FOREGROUND = [0xcb, 0xa6, 0xf7] as const;
const SAMPLES = 4;
const CENTER_X = 0.5;
const CENTER_Y = 0.6;
const DOT = 0.075;
const RINGS = [0.2, 0.32];
const RING_WIDTH = 0.06;
const SPREAD = (50 * Math.PI) / 180;
const CORNER = 0.22;

interface Variant {
  file: string;
  size: number;
  rounded: boolean;
  scale: number;
}

const VARIANTS: Variant[] = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.9 }
];

function insideRoundedSquare(x: number, y: number): boolean {
  const dx = Math.max(CORNER - x, x - (1 - CORNER), 0);
  const dy = Math.max(CORNER - y, y - (1 - CORNER), 0);
  return dx * dx + dy * dy <= CORNER * CORNER;
}

function insideGlyph(x: number, y: number): boolean {
  const dx = x - CENTER_X;
  const dy = y - CENTER_Y;
  const distance = Math.hypot(dx, dy);
  if (distance <= DOT) return true;
  if (Math.abs(Math.atan2(dx, -dy)) > SPREAD) return false;
  return RINGS.some((radius) => Math.abs(distance - radius) <= RING_WIDTH / 2);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function coverage(variant: Variant, px: number, py: number): { shape: number; glyph: number } {
  let shape = 0;
  let glyph = 0;
  for (let sample = 0; sample < SAMPLES * SAMPLES; sample += 1) {
    const x = (px + ((sample % SAMPLES) + 0.5) / SAMPLES) / variant.size;
    const y = (py + (Math.floor(sample / SAMPLES) + 0.5) / SAMPLES) / variant.size;
    if (variant.rounded && !insideRoundedSquare(x, y)) continue;
    shape += 1;
    if (insideGlyph(0.5 + (x - 0.5) / variant.scale, 0.5 + (y - 0.5) / variant.scale)) glyph += 1;
  }
  return { shape: shape / SAMPLES ** 2, glyph: glyph / SAMPLES ** 2 };
}

function render(variant: Variant): Buffer {
  const { size } = variant;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py += 1) {
    const offset = py * (size * 4 + 1);
    for (let px = 0; px < size; px += 1) {
      const { shape, glyph } = coverage(variant, px, py);
      const mix = shape > 0 ? glyph / shape : 0;
      const pixel = offset + 1 + px * 4;
      BACKGROUND.forEach((channel, index) => {
        rows[pixel + index] = Math.round(
          channel + ((FOREGROUND[index] ?? channel) - channel) * mix
        );
      });
      rows[pixel + 3] = Math.round(shape * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function arc(radius: number): string {
  const startX = CENTER_X - radius * Math.sin(SPREAD);
  const endX = CENTER_X + radius * Math.sin(SPREAD);
  const y = CENTER_Y - radius * Math.cos(SPREAD);
  return `<path d="M${startX.toFixed(4)} ${y.toFixed(4)}A${radius} ${radius} 0 0 1 ${endX.toFixed(4)} ${y.toFixed(4)}"/>`;
}

function svg(): string {
  const hex = (color: readonly number[]): string =>
    `#${color.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">',
    `<rect width="1" height="1" rx="${CORNER}" fill="${hex(BACKGROUND)}"/>`,
    `<g fill="none" stroke="${hex(FOREGROUND)}" stroke-width="${RING_WIDTH}">${RINGS.map(arc).join('')}</g>`,
    `<circle cx="${CENTER_X}" cy="${CENTER_Y}" r="${DOT}" fill="${hex(FOREGROUND)}"/>`,
    '</svg>',
    ''
  ].join('');
}

const output = join(import.meta.dirname, '..', 'public');

for (const variant of VARIANTS) writeFileSync(join(output, variant.file), render(variant));
writeFileSync(join(output, 'icon.svg'), svg());
