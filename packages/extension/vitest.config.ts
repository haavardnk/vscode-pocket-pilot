import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@xterm\/headless$/,
        replacement: '@xterm/headless/lib-headless/xterm-headless.mjs'
      }
    ]
  },
  test: {
    include: ['test/**/*.test.ts']
  }
});
