import { errorMessage } from '../errors';
import { parseJson } from '../json';
import { KEEPER_TIMING, runKeeper } from './keeper';
import { KEEPER_CONFIG, keeperConfigSchema } from './keeperRecord';

function report(message: string): void {
  process.stderr.write(`${new Date().toISOString()} ${message}\n`);
}

const config = keeperConfigSchema.safeParse(parseJson(process.env[KEEPER_CONFIG] ?? ''));
const token = process.env.TUNNEL_TOKEN ?? '';
delete process.env[KEEPER_CONFIG];
delete process.env.ELECTRON_RUN_AS_NODE;

if (!config.success) {
  report('Tunnel keeper started without a valid configuration');
  process.exit(1);
}

const { hostname, ...rest } = config.data;
const abort = new AbortController();
process.once('SIGTERM', () => abort.abort());
process.once('SIGINT', () => abort.abort());

runKeeper({
  ...rest,
  pid: process.pid,
  named: hostname && token ? { hostname, token } : null,
  timing: KEEPER_TIMING,
  signal: abort.signal,
  report
}).then(
  () => process.exit(0),
  (error: unknown) => {
    report(`Tunnel keeper failed: ${errorMessage(error)}`);
    process.exit(1);
  }
);
