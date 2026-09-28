import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CodeQuery, CodeResult, RequestView, SessionDetail } from '@pocket-pilot/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CodeService } from '../src/code/codeService';
import { diffBlobs } from '../src/code/diff';
import { EditChanges } from '../src/code/editChanges';
import { type Blob, readBlob } from '../src/code/files';
import { codeFolder } from '../src/code/folders';
import { parseNumstat, parseStatus, statusChange } from '../src/code/git';
import { languageResolver } from '../src/code/languages';
import { relativeSegments } from '../src/code/paths';
import { SessionChanges } from '../src/code/sessionChanges';
import { EditingSessions } from '../src/sessions/editingState';
import { LiveEdits } from '../src/sessions/liveEdits';

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
  let live: LiveEdits;
  let edits: EditChanges;
  let detail: SessionDetail;
  const fileUri = (fsPath: string): { scheme: string; fsPath: string } => ({
    scheme: 'file',
    fsPath
  });
  const view = (id: string, message: string, timestamp: number, paths: string[]): RequestView => ({
    id,
    timestamp,
    message,
    modelId: null,
    state: 'complete',
    error: null,
    parts: paths.map((path) => ({
      kind: 'edit',
      path,
      stopId: null,
      callId: null,
      additions: null,
      deletions: null
    }))
  });
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
    detail = {
      id: 's1',
      title: 'Demo',
      status: 'idle',
      modelId: null,
      modeId: null,
      permission: 'default',
      totalRequests: 2,
      editedFiles: 3,
      todos: null,
      requests: [
        view('r1', 'Change a', 1_700_000_000_000, []),
        view('r2', 'Document it', 1_700_000_060_000, [join(workspace, 'DOCS.md')])
      ],
      queued: []
    };
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
        timeline: {
          checkpoints: [
            { checkpointId: 'k0', requestId: 'r1', epoch: 1, label: '' },
            { checkpointId: 'k1', requestId: 'r1', undoStopId: 'u1', epoch: 2, label: '' },
            { checkpointId: 'k2', requestId: 'r1', undoStopId: 'u2', epoch: 3, label: '' },
            { checkpointId: 'k3', requestId: 'r2', epoch: 5, label: '' }
          ],
          operations: [
            {
              type: 'textEdit',
              uri: fileUri(join(workspace, 'src', 'a.ts')),
              requestId: 'r1',
              epoch: 2,
              edits: [
                {
                  text: '2',
                  range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 4 }
                }
              ]
            },
            {
              type: 'create',
              uri: fileUri(join(workspace, 'src', 'new.ts')),
              requestId: 'r1',
              epoch: 3,
              initialContent: ''
            },
            {
              type: 'textEdit',
              uri: fileUri(join(workspace, 'src', 'new.ts')),
              requestId: 'r1',
              epoch: 4,
              edits: [
                {
                  text: 'fresh\n',
                  range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
                }
              ]
            }
          ],
          fileBaselines: [
            [
              'a::r1',
              {
                uri: fileUri(join(workspace, 'src', 'a.ts')),
                requestId: 'r1',
                content: 'one\ntwo\nthree\n',
                epoch: 1
              }
            ]
          ]
        },
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
    const current = async (path: string): Promise<Blob> => (await readBlob(path)).blob;
    live = new LiveEdits(current);
    const sessions = new EditingSessions(editing);
    edits = new EditChanges(sessions, live);
    service = new CodeService({
      folders,
      language,
      sessions: new SessionChanges({
        folders,
        language,
        editing: sessions,
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
        detail: (sessionId) => Promise.resolve(sessionId === 's1' ? detail : null),
        current,
        live,
        edits,
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

  it('scopes changes to one request', async () => {
    const r1 = await query({ kind: 'requestChanges', ...target, sessionId: 's1', requestId: 'r1' });
    expect(
      r1.files.map(({ label, change, baseline, additions, deletions }) => [
        label,
        change,
        baseline,
        additions,
        deletions
      ])
    ).toEqual([
      ['src/a.ts', 'modified', 'request', 1, 1],
      ['src/new.ts', 'added', 'request', 1, 0]
    ]);
    const r2 = await query({ kind: 'requestChanges', ...target, sessionId: 's1', requestId: 'r2' });
    expect(r2.files.map(({ label, baseline }) => [label, baseline])).toEqual([['DOCS.md', 'none']]);
    await expect(
      query({
        kind: 'requestDiff',
        ...target,
        sessionId: 's1',
        requestId: 'r1',
        path: join(workspace, 'DOCS.md')
      })
    ).rejects.toThrow('File is not part of this request');
    await expect(
      query({ kind: 'requestChanges', ...target, sessionId: 's1', requestId: 'r9' })
    ).rejects.toThrow('Unknown request');
  });

  it('diffs the latest request from hook snapshots', async () => {
    const docs = join(workspace, 'DOCS.md');
    const at = detail.requests[1]?.timestamp ?? 0;
    await live.hook({ kind: 'prompt', sessionId: 's1', at, prompt: 'Document it' });
    await live.hook({
      kind: 'toolStart',
      sessionId: 's1',
      at: at + 10,
      callId: 'c1',
      toolName: 'replace_string_in_file',
      paths: [docs],
      command: null
    });
    await writeFile(docs, '# Demo\nMore\n');
    const result = await query({
      kind: 'requestDiff',
      ...target,
      sessionId: 's1',
      requestId: 'r2',
      path: docs
    });
    expect([result.file.baseline, result.file.additions, result.file.deletions]).toEqual([
      'request',
      1,
      0
    ]);
    const edit = await query({
      kind: 'editDiff',
      ...target,
      sessionId: 's1',
      requestId: 'r2',
      path: docs,
      stopId: 'u9',
      callId: 'c1'
    });
    expect([edit.file.baseline, edit.file.additions, edit.file.deletions]).toEqual(['edit', 1, 0]);
  });

  it.each([
    ['a logged stop', 'r1', 'src/a.ts', 'u1', null, ['edit', 1, 1]],
    ['a created file', 'r1', 'src/new.ts', 'u2', null, ['edit', 1, 0]],
    ['an unknown edit', 'r1', 'src/a.ts', 'u9', 'c9', ['request', 1, 1]]
  ])('diffs %s', async (_, requestId, file, stopId, callId, expected) => {
    const result = await query({
      kind: 'editDiff',
      ...target,
      sessionId: 's1',
      requestId,
      path: join(workspace, file),
      stopId,
      callId
    });
    expect([result.file.baseline, result.file.additions, result.file.deletions]).toEqual(expected);
  });

  it('counts the lines of each edit in a chat', async () => {
    const part = (path: string, stopId: string | null) => ({
      kind: 'edit' as const,
      path: join(workspace, path),
      stopId,
      callId: null,
      additions: null,
      deletions: null
    });
    const decorated = await edits.decorate({
      ...detail,
      requests: [
        {
          ...view('r1', 'Change a', 1_700_000_000_000, []),
          parts: [part('src/a.ts', 'u1'), part('src/new.ts', 'u2'), part('src/a.ts', null)]
        }
      ]
    });
    expect(
      decorated.requests[0]?.parts.map((edit) =>
        edit.kind === 'edit' ? [edit.additions, edit.deletions] : null
      )
    ).toEqual([
      [1, 1],
      [1, 0],
      [null, null]
    ]);
  });
});
