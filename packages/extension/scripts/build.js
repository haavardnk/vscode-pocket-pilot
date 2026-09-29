import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, context } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes('--watch');
const production = !watch && !process.argv.includes('--dev');

const options = {
  entryPoints: {
    extension: join(root, 'src/extension.ts'),
    uninstall: join(root, 'src/uninstall.ts'),
    tunnelKeeper: join(root, 'src/tunnel/keeperMain.ts')
  },
  outdir: join(root, 'dist'),
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  mainFields: ['module', 'main'],
  alias: { '@xterm/headless': '@xterm/headless/lib-headless/xterm-headless.mjs' },
  external: ['vscode', 'bufferutil', 'utf-8-validate'],
  minify: production,
  sourcemap: production ? false : 'linked',
  legalComments: 'linked',
  logLevel: 'info'
};

async function copyWeb() {
  const target = join(root, 'media/web');
  await rm(target, { recursive: true, force: true });
  await cp(join(root, '../web/dist'), target, { recursive: true });
}

async function copyDocs() {
  for (const name of ['README.md', 'LICENSE']) {
    await cp(join(root, '../..', name), join(root, name));
  }
}

if (watch) {
  const builder = await context(options);
  await builder.watch();
} else {
  await rm(join(root, 'dist'), { recursive: true, force: true });
  await build(options);
  await copyWeb();
  await copyDocs();
}
