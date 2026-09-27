import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/protocol', 'packages/extension', 'packages/web']
  }
});
