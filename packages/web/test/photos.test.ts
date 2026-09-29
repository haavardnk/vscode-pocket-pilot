import { describe, expect, it } from 'vitest';

import { fitSize } from '../src/lib/photos/prepare';

describe('photo size', () => {
  it.each([
    [640, 480, 640, 480],
    [4032, 3024, 1024, 768],
    [3024, 4032, 768, 1024],
    [8000, 1000, 2048, 256],
    [1170, 2532, 768, 1662],
    [100_000, 1, 2048, 1]
  ])('fits %ix%i into %ix%i', (width, height, fitWidth, fitHeight) => {
    expect(fitSize(width, height)).toEqual({ width: fitWidth, height: fitHeight });
  });
});
