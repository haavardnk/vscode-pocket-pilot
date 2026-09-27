import {
  SEGMENT_BOLD,
  SEGMENT_DIM,
  SEGMENT_INVERSE,
  SEGMENT_ITALIC,
  SEGMENT_STRIKETHROUGH,
  SEGMENT_UNDERLINE,
  type TerminalColor,
  type TerminalSegment
} from '@pocket-pilot/protocol';

const CUBE = [0, 95, 135, 175, 215, 255];

export function colorValue(color: TerminalColor): string | null {
  if (color === null) return null;
  if (typeof color === 'string') return color;
  if (color < 16) return `var(--terminal-${color})`;
  if (color >= 232) {
    const level = 8 + (color - 232) * 10;
    return `rgb(${level} ${level} ${level})`;
  }
  const index = color - 16;
  return `rgb(${CUBE[Math.floor(index / 36)]} ${CUBE[Math.floor(index / 6) % 6]} ${CUBE[index % 6]})`;
}

export function segmentStyle(segment: TerminalSegment): string {
  const has = (flag: number): boolean => (segment.flags & flag) !== 0;
  const inverse = has(SEGMENT_INVERSE);
  const fg = inverse ? (colorValue(segment.bg) ?? 'var(--color-base-100)') : colorValue(segment.fg);
  const bg = inverse
    ? (colorValue(segment.fg) ?? 'var(--color-base-content)')
    : colorValue(segment.bg);
  const lines = [
    has(SEGMENT_UNDERLINE) && 'underline',
    has(SEGMENT_STRIKETHROUGH) && 'line-through'
  ]
    .filter(Boolean)
    .join(' ');
  return [
    fg && `color:${fg}`,
    bg && `background-color:${bg}`,
    has(SEGMENT_BOLD) && 'font-weight:700',
    has(SEGMENT_DIM) && 'opacity:0.6',
    has(SEGMENT_ITALIC) && 'font-style:italic',
    lines && `text-decoration-line:${lines}`
  ]
    .filter(Boolean)
    .join(';');
}
