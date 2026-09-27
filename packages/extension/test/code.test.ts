import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CodeQuery, CodeResult } from '@pocket-pilot/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CodeService } from '../src/code/codeService';
import { diffBlobs } from '../src/code/diff';
import { codeFolder } from '../src/code/folders';
import { parseNumstat, parseStatus, statusChange } from '../src/code/git';
import { languageResolver } from '../src/code/languages';
import { relativeSegments } from '../src/code/paths';
import { SessionChanges } from '../src/code/sessionChanges';
import { EditingSessions } from '../src/sessions/editingState';

describe('git parsing', () => {
  it.each([
    ['??', 'untracked'],
    ['UU', 'conflicted'],
    ['AA', 'conflicted'],
    ['R ', 'renamed'],
    [' D', 'deleted'],
    ['A ', 'added'],
    ['AM', 'added'],
    [' M', 'modified'],
    ['MM', 'modified']
  ])('maps %j to %s', (code, change) => {
    expect(statusChange(code)).toBe(change);
  });

  it('parses porcelain status relative to the folder prefix', () => {
    const output = ['R  app/new.ts', 'app/old.ts', ' M app/a b.ts', '?? other/x.ts', ''].join('\0');
    expect(parseStatus(output, 'app/')).toEqual([
      { path: 'new.ts', previousPath: 'old.ts', change: 'renamed' },
      { path: 'a b.ts', previousPath: null, change: 'modified' }
    ]);
  });

  it('parses numstat with renames and binaries', () => {
    const output = ['3\t1\ta.ts', '-\t-\timage.png', '2\t0\t', 'old.ts', 'new.ts', ''].join('\0');
    expect([...parseNumstat(output)]).toEqual([
      ['a.ts', { additions: 3, deletions: 1 }],
      ['image.png', { additions: null, deletions: null }],
      ['new.ts', { additions: 2, deletions: 0 }]
    ]);
  });
});

describe('code helpers', () => {
  it.each(['../x', 'a/../../x', '.git/config', 'a/.git/HEAD', 'a\0b', 'a\\b'])(
    'rejects %j',
    (path) => {
      expect(() => relativeSegments(path)).toThrow();
    }
  );

  it.each([
    ['/w/Dockerfile', 'dockerfile'],
    ['/w/src/view.test.tsx', 'typescriptreact'],
    ['/w/types.d.ts', 'typescript-declaration'],
    ['/w/.env.local', 'dotenv'],
    ['/w/config/app.conf', 'ini'],
    ['/w/README', null]
  ])('resolves %s as %s', (path, language) => {
    const resolve = languageResolver(
      [
        { id: 'dockerfile', extensions: [], filenames: ['Dockerfile'], filenamePatterns: [] },
        { id: 'typescriptreact', extensions: ['.tsx'], filenames: [], filenamePatterns: [] },
        { id: 'typescript', extensions: ['.ts'], filenames: [], filenamePatterns: [] },
        {
          id: 'typescript-declaration',
          extensions: ['.d.ts'],
          filenames: [],
          filenamePatterns: []
        },
        { id: 'dotenv', extensions: [], filenames: [], filenamePatterns: ['.env.*'] }
      ],
      { '**/config/*.conf': 'ini' }
    );
    expect(resolve(path)).toBe(language);
  });

  it.each([
    [
      Buffer.from('a\nb\n'),
      Buffer.from('a\nc\n'),
      { kind: 'text', hunks: [{ oldStart: 1, newStart: 1, lines: [' a', '-b', '+c'] }] }
    ],
    [
      'missing' as const,
      Buffer.from('x'),
      { kind: 'text', hunks: [{ oldStart: 1, newStart: 1, lines: ['+x'] }] }
    ],
    [Buffer.from('same'), Buffer.from('same'), { kind: 'text', hunks: [] }],
    [Buffer.from([0, 1]), Buffer.from('x'), { kind: 'binary' }],
    ['tooLarge' as const, Buffer.from('x'), { kind: 'tooLarge' }]
  ])('diffs %#', (before, after, expected) => {
    expect(diffBlobs(before, after)).toEqual(expected);
  });
});

describe('code queries', () => {
  let root: string;
  let workspace: string;
  let editing: string;
  let service: CodeService;
  const folder = (): ReturnType<typeof codeFolder> => codeFolder('demo', workspace);
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: workspace, encoding: 'utf8' });
  const query = <K extends CodeQuery['kind']>(
    value: CodeQuery & { kind: K }
  ): Promise<Extract<CodeResult, { kind: K }>> =>
    service.query(value) as Promise<Extract<CodeResult, { kind: K }>>;
  const target = { windowId: 'w' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pocket-pilot-code-'));
    workspace = join(root, 'demo');
    editing = join(root, 'editing');
    await mkdir(join(workspace, 'src'), { recursive: true });
    await writeFile(join(workspace, 'src', 'a.ts'), 'one\ntwo\nthree\n');
    await writeFile(join(workspace, 'README.md'), '# Demo\n');
    await writeFile(join(workspace, '.gitignore'), 'dist/\n*.log\n');
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    await writeFile(join(workspace, 'src', 'a.ts'), 'one\n2\nthree\n');
    await writeFile(join(workspace, 'src', 'new.ts'), 'fresh\n');
    git('mv', 'README.md', 'DOCS.md');
    await mkdir(join(workspace, 'dist'));
    await writeFile(join(workspace, 'app.log'), 'log');
    await writeFile(join(workspace, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]));
    await symlink(root, join(workspace, 'escape'));
    await mkdir(join(editing, 's1', 'contents'), { recursive: true });
    await writeFile(join(editing, 's1', 'contents', 'aaaaaaa'), 'one\ntwo\nthree\n');
    await writeFile(
      join(editing, 's1', 'state.json'),
      JSON.stringify({
        version: 2,
        initialFileContents: [],
        timeline: {},
        recentSnapshot: {
          entries: [
            {
              resource: `file://${join(workspace, 'src', 'a.ts')}`,
              languageId: 'typescript',
              originalHash: 'aaaaaaa',
              currentHash: 'bbbbbbb',
              state: 0,
              snapshotUri: '',
              telemetryInfo: {}
            }
          ]
        }
      })
    );
    const folders = (): ReturnType<typeof codeFolder>[] => [folder()];
    const language = (path: string): string | null => (path.endsWith('.ts') ? 'typescript' : null);
    service = new CodeService({
      folders,
      language,
      sessions: new SessionChanges({
        folders,
        language,
        editing: new EditingSessions(editing),
        editedPaths: (sessionId) =>
          Promise.resolve(
            sessionId === 's1'
              ? [
                  join(workspace, 'src', 'a.ts'),
                  join(workspace, 'src', 'new.ts'),
                  join(root, 'notes.md')
                ]
              : null
          ),
        home: root
      })
    });
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('lists a folder with ignore and change markers', async () => {
    const tree = await query({ kind: 'tree', ...target, folderId: folder().id, path: '' });
    expect(
      tree.entries.map(({ name, directory, ignored, change }) => [name, directory, ignored, change])
    ).toEqual([
      ['dist', true, true, null],
      ['escape', true, false, 'untracked'],
      ['src', true, false, 'modified'],
      ['.gitignore', false, false, null],
      ['app.log', false, true, null],
      ['DOCS.md', false, false, 'renamed'],
      ['pixel.png', false, false, 'untracked']
    ]);
  });

  it('reads text and image files', async () => {
    const file = await query({ kind: 'file', ...target, folderId: folder().id, path: 'src/a.ts' });
    expect(file).toMatchObject({
      language: 'typescript',
      change: 'modified',
      content: { kind: 'text', text: 'one\n2\nthree\n' }
    });
    const image = await query({
      kind: 'file',
      ...target,
      folderId: folder().id,
      path: 'pixel.png'
    });
    expect(image.content).toEqual({ kind: 'image', mime: 'image/png', data: 'iVBORwA=' });
  });

  it.each(['escape/editing/s1/state.json', '../editing/s1/state.json', '.git/config'])(
    'refuses %s',
    async (path) => {
      await expect(
        query({ kind: 'file', ...target, folderId: folder().id, path })
      ).rejects.toThrow();
    }
  );

  it('lists and diffs git changes', async () => {
    const changes = await query({ kind: 'gitChanges', ...target, folderId: folder().id });
    expect(changes).toMatchObject({ repository: true, branch: 'main', truncated: false });
    expect(changes.files).toEqual([
      { path: 'DOCS.md', previousPath: 'README.md', change: 'renamed', additions: 0, deletions: 0 },
      { path: 'escape', previousPath: null, change: 'untracked', additions: null, deletions: null },
      {
        path: 'pixel.png',
        previousPath: null,
        change: 'untracked',
        additions: null,
        deletions: null
      },
      { path: 'src/a.ts', previousPath: null, change: 'modified', additions: 1, deletions: 1 },
      { path: 'src/new.ts', previousPath: null, change: 'untracked', additions: 1, deletions: 0 }
    ]);
    const diff = await query({
      kind: 'gitDiff',
      ...target,
      folderId: folder().id,
      path: 'src/a.ts'
    });
    expect(diff.diff).toEqual({
      kind: 'text',
      hunks: [{ oldStart: 1, newStart: 1, lines: [' one', '-two', '+2', ' three'] }]
    });
  });

  it('merges recorded and logged session edits', async () => {
    const result = await query({ kind: 'sessionChanges', ...target, sessionId: 's1' });
    expect(
      result.files.map(({ label, change, state, baseline, additions, deletions }) => [
        label,
        change,
        state,
        baseline,
        additions,
        deletions
      ])
    ).toEqual([
      ['~/notes.md', 'deleted', 'pending', 'none', null, null],
      ['src/a.ts', 'modified', 'pending', 'session', 1, 1],
      ['src/new.ts', 'added', 'pending', 'commit', 1, 0]
    ]);
    await expect(
      query({ kind: 'sessionDiff', ...target, sessionId: 's1', path: join(workspace, 'DOCS.md') })
    ).rejects.toThrow('File is not part of this chat');
    await expect(query({ kind: 'sessionChanges', ...target, sessionId: 'nope' })).rejects.toThrow(
      'Unknown session'
    );
  });
});
