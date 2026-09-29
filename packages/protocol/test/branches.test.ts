import { describe, expect, it } from 'vitest';

import { branchNameError } from '../src';

describe('branchNameError', () => {
  it.each(['main', 'feat/web-2', 'user/fix_1.2', 'release/v1.0'])('accepts %s', (name) => {
    expect(branchNameError(name)).toBeNull();
  });

  it.each([
    '',
    'HEAD',
    '@',
    'has space',
    'a~1',
    'a^',
    'a:b',
    'a?',
    'a*',
    'a[b',
    'a\\b',
    'tab\there',
    '-rf',
    'a..b',
    'a@{1}',
    'a.',
    '/a',
    'a/',
    'a//b',
    '.hidden',
    'a/.b',
    'a.lock',
    'a.lock/b',
    'x'.repeat(256)
  ])('rejects %j', (name) => {
    expect(branchNameError(name)).not.toBeNull();
  });
});
