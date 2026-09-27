import {
  SEGMENT_BOLD,
  SEGMENT_DIM,
  SEGMENT_INVERSE,
  SEGMENT_ITALIC,
  SEGMENT_STRIKETHROUGH,
  SEGMENT_UNDERLINE,
  type TerminalColor
} from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { colorValue, segmentStyle } from '../src/lib/terminal/ansi';

describe('colorValue', () => {
  it.each<[TerminalColor, string | null]>([
    [null, null],
    [1, 'var(--terminal-1)'],
    [15, 'var(--terminal-15)'],
    [16, 'rgb(0 0 0)'],
    [196, 'rgb(255 0 0)'],
    [110, 'rgb(135 175 215)'],
    [231, 'rgb(255 255 255)'],
    [232, 'rgb(8 8 8)'],
    [255, 'rgb(238 238 238)'],
    ['#12ab9f', '#12ab9f']
  ])('maps %s', (color, expected) => {
    expect(colorValue(color)).toBe(expected);
  });
});

describe('segmentStyle', () => {
  it.each([
    [{ fg: null, bg: null, flags: 0 }, ''],
    [{ fg: 2, bg: '#000000', flags: 0 }, 'color:var(--terminal-2);background-color:#000000'],
    [
      { fg: null, bg: null, flags: SEGMENT_INVERSE },
      'color:var(--color-base-100);background-color:var(--color-base-content)'
    ],
    [
      { fg: 1, bg: 4, flags: SEGMENT_INVERSE },
      'color:var(--terminal-4);background-color:var(--terminal-1)'
    ],
    [
      {
        fg: null,
        bg: null,
        flags:
          SEGMENT_BOLD | SEGMENT_DIM | SEGMENT_ITALIC | SEGMENT_UNDERLINE | SEGMENT_STRIKETHROUGH
      },
      'font-weight:700;opacity:0.6;font-style:italic;text-decoration-line:underline line-through'
    ]
  ])('styles %o', (fields, expected) => {
    expect(segmentStyle({ text: 'x', ...fields })).toBe(expected);
  });
});
