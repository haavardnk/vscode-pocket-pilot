import {
  applyTerminalPatch,
  SEGMENT_BOLD,
  SEGMENT_UNDERLINE,
  type TerminalLine
} from '@pocket-pilot/protocol';
import { describe, expect, it } from 'vitest';

import { ChatLinks, sameCommand } from '../src/terminals/chatLinks';
import type { Pty, PtyOptions } from '../src/terminals/nodePty';
import { PtySession } from '../src/terminals/ptySession';
import { TerminalScreen } from '../src/terminals/screen';
import { TerminalLog } from '../src/terminals/terminalLog';

const text = (lines: TerminalLine[]): string[] =>
  lines.map((line) => line.map((segment) => segment.text).join(''));

const labels = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `line ${index}`);

const numbered = (count: number): string =>
  labels(count)
    .map((label) => `${label}\r\n`)
    .join('');

async function finished(data: string, maxLines = 5000): Promise<TerminalScreen> {
  const screen = new TerminalScreen(maxLines);
  await screen.write(data);
  await screen.finish();
  return screen;
}

describe('TerminalScreen', () => {
  it('keeps colours and styles as segments', async () => {
    const screen = await finished('\x1b[1;31mred\x1b[0m \x1b[4;38;2;1;2;3mrgb\x1b[0m\r\n');
    expect(screen.lines).toEqual([
      [
        { text: 'red', fg: 1, bg: null, flags: SEGMENT_BOLD },
        { text: ' ', fg: null, bg: null, flags: 0 },
        { text: 'rgb', fg: '#010203', bg: null, flags: SEGMENT_UNDERLINE }
      ]
    ]);
  });

  it.each([
    ['carriage return progress', '10%\r50%\r100%\r\ndone\r\n', ['100%', 'done']],
    ['cursor-up redraws', 'a\r\nb\r\n\x1b[2A\x1b[2Kx\r\n', ['x', 'b']],
    ['wrapped rows', `${'x'.repeat(250)}\r\n`, ['x'.repeat(250)]],
    ['trailing blank rows', 'one\r\n\r\n\r\n', ['one']]
  ])('renders %s', async (_name, data, expected) => {
    expect(text((await finished(data)).lines)).toEqual(expected);
  });

  it('harvests rows that scroll past the viewport while running', async () => {
    const screen = new TerminalScreen(5000);
    await screen.write(numbered(100));
    expect(screen.lines.length).toBeGreaterThan(0);
    expect(text([...screen.lines, ...screen.tail])).toEqual(labels(100));
    screen.dispose();
  });

  it('harvests rows a smaller viewport pushes out', async () => {
    const screen = new TerminalScreen(5000, 80, 6);
    await screen.write(numbered(4));
    expect(screen.lines).toEqual([]);
    screen.resize(40, 2);
    expect(screen.lines.length).toBeGreaterThan(0);
    expect(text([...screen.lines, ...screen.tail])).toEqual(labels(4));
    screen.dispose();
  });

  it.each([
    [5000, 3000, 0],
    [100, 3000, 2900]
  ])('keeps %i lines of %i beyond the scrollback', async (maxLines, count, dropped) => {
    const screen = await finished(numbered(count), maxLines);
    expect(screen.dropped).toBe(dropped);
    expect(screen.total).toBe(count);
    expect(text(screen.lines).at(0)).toBe(`line ${dropped}`);
    expect(text(screen.lines).at(-1)).toBe(`line ${count - 1}`);
  });

  it('shows the alternate screen as the tail', async () => {
    const screen = new TerminalScreen(5000);
    await screen.write('before\r\n\x1b[?1049h\x1b[Htop\r\n');
    expect(screen.alternate).toBe(true);
    expect(text(screen.tail)).toEqual(['top']);
    await screen.write('\x1b[?1049l');
    expect(screen.alternate).toBe(false);
    expect(text(screen.tail)).toEqual(['before']);
    await screen.finish();
    expect(text(screen.lines)).toEqual(['before']);
    expect(screen.tail).toEqual([]);
  });

  it('ignores writes after it is disposed', async () => {
    const screen = new TerminalScreen(5000);
    const pending = screen.write(numbered(2000));
    screen.dispose();
    await pending;
    await screen.write('late\r\n');
    await screen.finish();
    expect(text(screen.lines)).not.toContain('late');
  });
});

describe('TerminalLog', () => {
  it('streams patches that rebuild the full detail', async () => {
    const log = new TerminalLog(() => undefined);
    log.start({ id: 'e1', command: 'ls', cwd: '~/w', startedAt: 1 });
    await log.write('e1', 'a.ts\r\n');
    const detail = log.detail('t1');
    await log.write('e1', numbered(60));
    const first = log.patch();
    expect(first?.executions.map((execution) => execution.id)).toEqual(['e1']);
    if (first) applyTerminalPatch(detail, first);
    expect(log.patch()).toBeNull();
    log.end('e1', 0, 2, 'ls -la');
    await log.finish('e1');
    log.start({ id: 'e2', command: 'npm test', cwd: null, startedAt: 3 });
    log.link('e2', 's1', 'c1');
    await log.write('e2', '\x1b[32mok\x1b[0m\r\n');
    const patch = log.patch();
    if (patch) applyTerminalPatch(detail, patch);
    expect(detail).toEqual(log.detail('t1'));
    expect(detail.stream).toBeNull();
    expect(log.running?.id).toBe('e2');
    expect(log.lastExitCode).toBe(0);
    log.dispose();
  });

  it('drops the oldest finished executions past the budget', () => {
    const log = new TerminalLog(() => undefined);
    const detail = log.detail('t1');
    for (let index = 0; index < 52; index++) {
      log.start({ id: `e${index}`, command: 'true', cwd: null, startedAt: index });
      log.end(`e${index}`, 0, index, '');
    }
    const patch = log.patch();
    if (patch) applyTerminalPatch(detail, patch);
    expect(detail.dropped).toBe(2);
    expect(detail.executions.map((execution) => execution.id).at(0)).toBe('e2');
    expect(detail).toEqual(log.detail('t1'));
    log.dispose();
  });

  it('streams the whole screen of an owned terminal', async () => {
    const log = new TerminalLog(() => undefined, true);
    await log.writeStream('$ ');
    const detail = log.detail('t1');
    expect(text(detail.stream?.tail ?? [])).toEqual(['$']);
    await log.writeStream(`ls\r\n${numbered(60)}$ `);
    const first = log.patch();
    if (first) applyTerminalPatch(detail, first);
    expect(log.patch()).toBeNull();
    log.resizeStream(40, 10);
    const resized = log.patch();
    if (resized) applyTerminalPatch(detail, resized);
    expect(detail).toEqual(log.detail('t1'));
    expect(text([...(detail.stream?.lines ?? []), ...(detail.stream?.tail ?? [])])).toEqual([
      '$ ls',
      ...labels(60),
      '$'
    ]);
    log.dispose();
  });
});

describe('PtySession', () => {
  function fake() {
    const calls: unknown[][] = [];
    const listeners: { data?: (data: string) => void; exit?: (code: number) => void } = {};
    const pty: Pty = {
      onData: (listener) => {
        listeners.data = listener;
        return { dispose: () => delete listeners.data };
      },
      onExit: (listener) => {
        listeners.exit = (exitCode) => listener({ exitCode });
        return { dispose: () => delete listeners.exit };
      },
      write: (data) => calls.push(['write', data]),
      resize: (cols, rows) => calls.push(['resize', cols, rows]),
      kill: () => calls.push(['kill'])
    };
    const events: unknown[][] = [];
    const launch = { name: 'zsh', file: '/bin/zsh', args: ['-l'], env: { TERM: 'xterm-256color' } };
    const session = new PtySession(
      (file: string, args: string[], options: PtyOptions) => {
        calls.push(['spawn', file, args, options]);
        return pty;
      },
      launch,
      '/w',
      { data: (data) => events.push(['data', data]), exit: (code) => events.push(['exit', code]) }
    );
    return { session, calls, events, listeners };
  }

  it('runs the shell until it exits', () => {
    const { session, calls, events, listeners } = fake();
    session.start(100, 30);
    session.start(100, 30);
    listeners.data?.('hi');
    session.input('ls\r');
    session.resize(120, 40);
    listeners.exit?.(3);
    session.input('late');
    session.kill();
    expect(calls).toEqual([
      [
        'spawn',
        '/bin/zsh',
        ['-l'],
        { name: 'xterm-256color', cols: 100, rows: 30, cwd: '/w', env: { TERM: 'xterm-256color' } }
      ],
      ['write', 'ls\r'],
      ['resize', 120, 40]
    ]);
    expect(events).toEqual([
      ['data', 'hi'],
      ['exit', 3]
    ]);
    expect(listeners).toEqual({});
  });

  it('kills the shell once and stops listening', () => {
    const { session, calls, events, listeners } = fake();
    session.start(80, 24);
    session.kill();
    session.kill();
    expect(calls.map((call) => call[0])).toEqual(['spawn', 'kill']);
    expect(listeners).toEqual({});
    expect(events).toEqual([]);
  });
});

describe('sameCommand', () => {
  it.each([
    ['npm test', 'npm  test', true],
    ['cd /w && npm test', 'npm test', true],
    ['npm test', 'npm test -- --watch', true],
    ['npm test', 'npm run build', false],
    ['', 'npm test', false]
  ])('matches %j with %j: %s', (expected, executed, same) => {
    expect(sameCommand(expected, executed)).toBe(same);
  });
});

describe('ChatLinks', () => {
  const call = { sessionId: 's1', callId: 'c1' };
  const ref = { terminalId: 't1', executionId: 'e1' };
  const link = { ...call, ...ref };

  it.each([
    ['the hook arrives first', true, 1000, link],
    ['the execution arrives first', false, 1000, link],
    ['the hook expired', true, 61_000, null],
    ['the execution expired', false, 61_000, null]
  ])('links when %s', (_name, hookFirst, gap, expected) => {
    const links = new ChatLinks();
    if (hookFirst) expect(links.expect(call, 'npm test', 0)).toBeNull();
    else expect(links.executed(ref, 'npm test', 0)).toBeNull();
    const second = hookFirst
      ? links.executed(ref, 'npm test', gap)
      : links.expect(call, 'npm test', gap);
    expect(second).toEqual(expected);
    expect(links.ref('c1')).toEqual(expected ? ref : null);
  });

  it('claims executions from the transcript and forgets closed terminals', () => {
    const links = new ChatLinks();
    links.executed(ref, 'npm test', 100);
    expect(links.claim(call, 'npm test', 200)).toBeNull();
    expect(links.claim(call, 'npm test', 50)).toEqual(link);
    expect(links.claim({ ...call, callId: 'c2' }, 'npm test', 50)).toBeNull();
    links.forget('t1');
    expect(links.ref('c1')).toBeNull();
  });
});
