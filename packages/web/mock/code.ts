import type {
  CodeQuery,
  CodeResult,
  DiffHunk,
  EditState,
  FileChange,
  FileContent,
  GitChange,
  SessionChange,
  TreeEntry
} from '@pocket-pilot/protocol';

interface MockFile {
  language: string | null;
  content: FileContent;
}

interface MockFolder {
  windowId: string;
  id: string;
  root: string;
  files: Record<string, MockFile>;
  ignored: string[];
  changes: GitChange[];
  diffs: Record<string, DiffHunk[]>;
}

interface MockEdit {
  path: string;
  folderId: string;
  relativePath: string;
  change: SessionChange['change'];
  baseline: SessionChange['baseline'];
  hunks: DiffHunk[];
}

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const APP = `<script lang="ts">
  import SessionList from './lib/components/SessionList.svelte';
  import Composer from './lib/components/Composer.svelte';

  let draft = $state('');
</script>

<main class="flex flex-col gap-4">
  <SessionList />
  <Composer bind:value={draft} />
</main>
`;

const ROUTING = `export type Route = { name: 'chats' } | { name: 'code' };

export function parseRoute(hash: string): Route {
  return hash === '#/code' ? { name: 'code' } : { name: 'chats' };
}
`;

const APP_HUNKS: DiffHunk[] = [
  {
    oldStart: 1,
    newStart: 1,
    lines: [
      ' <script lang="ts">',
      "   import SessionList from './lib/components/SessionList.svelte';",
      "+  import Composer from './lib/components/Composer.svelte';",
      ' ',
      "-  let draft = '';",
      "+  let draft = $state('');",
      ' </script>'
    ]
  },
  {
    oldStart: 8,
    newStart: 9,
    lines: ['   <SessionList />', '+  <Composer bind:value={draft} />', ' </main>']
  }
];

const ROUTING_HUNKS: DiffHunk[] = [
  {
    oldStart: 1,
    newStart: 1,
    lines: [
      "-export type Route = { name: 'chats' };",
      "+export type Route = { name: 'chats' } | { name: 'code' };",
      ' ',
      ' export function parseRoute(hash: string): Route {'
    ]
  }
];

const NOTES_HUNKS: DiffHunk[] = [
  { oldStart: 1, newStart: 1, lines: ['+# Notes', '+', '+Try the code viewer.'] }
];

function text(language: string | null, value: string): MockFile {
  return { language, content: { kind: 'text', text: value } };
}

function counts(hunks: DiffHunk[]): { additions: number; deletions: number } {
  const lines = hunks.flatMap((hunk) => hunk.lines);
  return {
    additions: lines.filter((line) => line.startsWith('+')).length,
    deletions: lines.filter((line) => line.startsWith('-')).length
  };
}

function gitChange(path: string, change: FileChange, hunks: DiffHunk[]): GitChange {
  return { path, previousPath: null, change, ...counts(hunks) };
}

function folders(): MockFolder[] {
  return [
    {
      windowId: 'w1',
      id: 'f1',
      root: '/repo',
      files: {
        'README.md': text(
          'markdown',
          '# Pocket Pilot\n\nMonitor and steer VS Code chat agents from your phone.\n'
        ),
        'package.json': text(
          'json',
          '{\n  "name": "pocket-pilot",\n  "private": true,\n  "workspaces": ["packages/*"]\n}\n'
        ),
        'docs/icon.png': {
          language: null,
          content: { kind: 'image', mime: 'image/png', data: PIXEL }
        },
        'docs/notes.md': text('markdown', '# Notes\n\nTry the code viewer.\n'),
        'packages/web/src/App.svelte': text('svelte', APP),
        'packages/web/src/lib/routing.ts': text('typescript', ROUTING),
        'packages/extension/src/extension.ts': text(
          'typescript',
          "import * as vscode from 'vscode';\n\nexport function activate(context: vscode.ExtensionContext): void {\n  context.subscriptions.push(vscode.window.createOutputChannel('Pocket Pilot'));\n}\n"
        ),
        'node_modules/.package-lock.json': text('json', '{}\n')
      },
      ignored: ['node_modules'],
      changes: [
        gitChange('docs/notes.md', 'untracked', NOTES_HUNKS),
        gitChange('packages/web/src/App.svelte', 'modified', APP_HUNKS),
        gitChange('packages/web/src/lib/routing.ts', 'modified', ROUTING_HUNKS)
      ],
      diffs: {
        'docs/notes.md': NOTES_HUNKS,
        'packages/web/src/App.svelte': APP_HUNKS,
        'packages/web/src/lib/routing.ts': ROUTING_HUNKS
      }
    },
    {
      windowId: 'w2',
      id: 'f2',
      root: '/immich-edit',
      files: {
        'Cargo.toml': text('toml', '[package]\nname = "raw-pipeline"\nedition = "2024"\n'),
        'src/lib.rs': text(
          'rust',
          'pub fn demosaic(input: &[u16]) -> Vec<u16> {\n    input.to_vec()\n}\n'
        )
      },
      ignored: [],
      changes: [],
      diffs: {}
    }
  ];
}

const EDITS: Record<string, MockEdit[]> = {
  s1: [
    {
      path: '/repo/packages/web/src/App.svelte',
      folderId: 'f1',
      relativePath: 'packages/web/src/App.svelte',
      change: 'modified',
      baseline: 'session',
      hunks: APP_HUNKS
    },
    {
      path: '/repo/packages/web/src/lib/routing.ts',
      folderId: 'f1',
      relativePath: 'packages/web/src/lib/routing.ts',
      change: 'modified',
      baseline: 'commit',
      hunks: ROUTING_HUNKS
    }
  ]
};

export class MockCode {
  private folders = folders();
  private states = new Map<string, EditState>();

  reset(): void {
    this.folders = folders();
    this.states.clear();
  }

  decide(sessionId: string, path: string | null, decision: 'keep' | 'undo'): void {
    const edits = EDITS[sessionId] ?? [];
    const targets =
      path === null
        ? edits.filter((edit) => this.stateOf(sessionId, edit) === 'pending')
        : edits.filter((edit) => edit.path === path);
    if (targets.length === 0) throw new Error('File is not part of this chat');
    for (const edit of targets)
      this.states.set(`${sessionId}:${edit.path}`, decision === 'keep' ? 'kept' : 'undone');
  }

  query(query: CodeQuery): CodeResult {
    if (query.kind === 'sessionChanges')
      return {
        kind: 'sessionChanges',
        files: (EDITS[query.sessionId] ?? []).map((edit) =>
          this.sessionChange(query.sessionId, edit)
        )
      };
    if (query.kind === 'sessionDiff') {
      const edit = EDITS[query.sessionId]?.find((candidate) => candidate.path === query.path);
      if (!edit) throw new Error('File is not part of this chat');
      const undone = this.stateOf(query.sessionId, edit) === 'undone';
      return {
        kind: 'sessionDiff',
        language:
          this.folder(query.windowId, edit.folderId).files[edit.relativePath]?.language ?? null,
        file: this.sessionChange(query.sessionId, edit),
        diff: { kind: 'text', hunks: undone ? [] : edit.hunks }
      };
    }
    const folder = this.folder(query.windowId, query.folderId);
    if (query.kind === 'tree')
      return { kind: 'tree', entries: this.entries(folder, query.path), truncated: false };
    if (query.kind === 'gitChanges')
      return {
        kind: 'gitChanges',
        repository: true,
        branch: 'main',
        truncated: false,
        files: folder.changes
      };
    const change = folder.changes.find((candidate) => candidate.path === query.path) ?? null;
    const file = folder.files[query.path];
    if (query.kind === 'gitDiff')
      return {
        kind: 'gitDiff',
        language: file?.language ?? null,
        file: change,
        diff: { kind: 'text', hunks: folder.diffs[query.path] ?? [] }
      };
    if (!file)
      return { kind: 'file', language: null, size: 0, change: null, content: { kind: 'missing' } };
    return {
      kind: 'file',
      language: file.language,
      size: file.content.kind === 'text' ? file.content.text.length : 70,
      change: change?.change ?? null,
      content: file.content
    };
  }

  private folder(windowId: string, folderId: string): MockFolder {
    const folder = this.folders.find(
      (candidate) => candidate.windowId === windowId && candidate.id === folderId
    );
    if (!folder) throw new Error('Folder is no longer open');
    return folder;
  }

  private stateOf(sessionId: string, edit: MockEdit): EditState {
    return this.states.get(`${sessionId}:${edit.path}`) ?? 'pending';
  }

  private sessionChange(sessionId: string, edit: MockEdit): SessionChange {
    const { hunks, path, folderId, relativePath, change, baseline } = edit;
    return {
      path,
      label: relativePath,
      folderId,
      relativePath,
      change,
      baseline,
      state: this.stateOf(sessionId, edit),
      ...counts(hunks)
    };
  }

  private entries(folder: MockFolder, path: string): TreeEntry[] {
    const prefix = path ? `${path}/` : '';
    const entries = new Map<string, TreeEntry>();
    for (const file of Object.keys(folder.files).filter((candidate) =>
      candidate.startsWith(prefix)
    )) {
      const [name = '', ...rest] = file.slice(prefix.length).split('/');
      const child = `${prefix}${name}`;
      const kinds = new Set(
        folder.changes
          .filter((change) => change.path === child || change.path.startsWith(`${child}/`))
          .map((change) => change.change)
      );
      entries.set(name, {
        name,
        directory: rest.length > 0,
        ignored: folder.ignored.some(
          (ignored) => child === ignored || child.startsWith(`${ignored}/`)
        ),
        change: kinds.size > 1 ? 'modified' : ([...kinds][0] ?? null)
      });
    }
    return [...entries.values()].sort(
      (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)
    );
  }
}
