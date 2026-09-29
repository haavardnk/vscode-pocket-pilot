import { join } from 'node:path';

import { build } from 'esbuild';

export async function bundleKeeper(folder: string): Promise<string> {
  const outfile = join(folder, 'tunnelKeeper.cjs');
  await build({
    entryPoints: [join(import.meta.dirname, '../src/tunnel/keeperMain.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'silent'
  });
  return outfile;
}
