import { describe, expect, it } from 'vitest';

import { repositoryFor } from '../src/git/repository';

describe('repositoryFor', () => {
  it.each([
    [
      'git@github.com:Octo/Hello.git',
      'github.com/octo/hello',
      'Octo/Hello',
      { owner: 'Octo', name: 'Hello' }
    ],
    [
      'https://github.com/octo/hello',
      'github.com/octo/hello',
      'octo/hello',
      { owner: 'octo', name: 'hello' }
    ],
    ['https://gitlab.com/team/app.git', 'gitlab.com/team/app', 'team/app', null],
    [null, 'local/project', 'project', null],
    ['not a url', 'local/project', 'project', null]
  ])('resolves %s', (remote, key, label, github) => {
    expect(repositoryFor(remote, '/work/project')).toEqual({ key, label, github });
  });
});
