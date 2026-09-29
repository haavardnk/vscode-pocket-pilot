import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTargets } from '../src/windows/openTargets';
import { expandRoot, scanRoots } from '../src/windows/projectRoots';
import { MAX_RECENT, parseRecents } from '../src/windows/recentFolders';

describe('recent folders', () => {
  it('keeps local folders and workspaces in order', () => {
    const raw = {
      workspaces: [
        { folderUri: { scheme: 'file', path: '/Users/me/Git/app' } },
        { folderUri: { scheme: 'vscode-remote', authority: 'ssh', path: '/srv/app' } },
        {
          workspace: {
            id: 'w',
            configPath: { scheme: 'file', path: '/Users/me/all.code-workspace' }
          }
        },
        { label: 'broken' },
        { folderUri: { scheme: 'file', authority: 'server', path: '/share/docs' } }
      ],
      files: []
    };
    expect(parseRecents(raw)).toEqual([
      { authority: '', path: '/Users/me/Git/app', kind: 'folder' },
      { authority: '', path: '/Users/me/all.code-workspace', kind: 'workspace' },
      { authority: 'server', path: '/share/docs', kind: 'folder' }
    ]);
  });

  it.each([undefined, null, 'recent', { workspaces: 'none' }])('ignores %s', (raw) => {
    expect(parseRecents(raw)).toEqual([]);
  });

  it('caps the list', () => {
    const workspaces = Array.from({ length: MAX_RECENT + 5 }, (_, index) => ({
      folderUri: { scheme: 'file', path: `/p/${index}` }
    }));
    expect(parseRecents({ workspaces })).toHaveLength(MAX_RECENT);
  });
});

describe('project roots', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pp-roots-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function repo(path: string, gitFile = false): Promise<void> {
    await mkdir(join(root, path), { recursive: true });
    if (gitFile) await writeFile(join(root, path, '.git'), 'gitdir: ../.git/worktrees/x');
    else await mkdir(join(root, path, '.git'));
  }

  it.each([
    ['~', '/home/me'],
    ['~/Git', '/home/me/Git'],
    ['/abs/Git', '/abs/Git'],
    ['relative/Git', null],
    ['  ', null]
  ])('expands %s', (input, expected) => {
    expect(expandRoot(input, '/home/me')).toBe(expected);
  });

  it('finds repositories up to two levels deep', async () => {
    await repo('app');
    await repo('app/packages/inner');
    await repo('group/lib');
    await repo('group/worktree', true);
    await repo('a/b/too-deep');
    await repo('.hidden/repo');
    await repo('node_modules/pkg');
    await mkdir(join(root, 'plain'));
    await symlink(join(root, 'group'), join(root, 'linked'));
    const found = await scanRoots([root, root, join(root, 'missing')], '/home/me');
    expect(found.sort()).toEqual(
      ['app', 'group/lib', 'group/worktree'].map((path) => join(root, path))
    );
  });
});

describe('open targets', () => {
  it('names, shortens, dedupes and sorts', () => {
    const result = openTargets(
      [
        { id: 'file:///home/me/b', fsPath: '/home/me/b', kind: 'folder' },
        {
          id: 'file:///home/me/all.code-workspace',
          fsPath: '/home/me/all.code-workspace',
          kind: 'workspace'
        },
        { id: 'file:///home/me/b', fsPath: '/home/me/b', kind: 'folder' }
      ],
      [
        { id: 'file:///srv/z', fsPath: '/srv/z', kind: 'folder' },
        { id: 'file:///home/me/b', fsPath: '/home/me/b', kind: 'folder' },
        { id: 'file:///home/me/Git/a', fsPath: '/home/me/Git/a', kind: 'folder' },
        { id: 'file:///srv/a', fsPath: '/srv/a', kind: 'folder' }
      ],
      '/home/me'
    );
    expect(result).toEqual({
      kind: 'openTargets',
      recent: [
        { id: 'file:///home/me/b', name: 'b', path: '~/b', kind: 'folder' },
        {
          id: 'file:///home/me/all.code-workspace',
          name: 'all',
          path: '~/all.code-workspace',
          kind: 'workspace'
        }
      ],
      projects: [
        { id: 'file:///srv/a', name: 'a', path: '/srv/a', kind: 'folder' },
        { id: 'file:///home/me/Git/a', name: 'a', path: '~/Git/a', kind: 'folder' },
        { id: 'file:///srv/z', name: 'z', path: '/srv/z', kind: 'folder' }
      ]
    });
  });
});
