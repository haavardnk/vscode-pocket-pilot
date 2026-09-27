import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { LOOPBACK } from '../cluster/sharedState';
import { HOOK_PATH } from '../server/tunnelTraffic';
import { readOptional, writeAtomic } from '../storage/sharedFile';

export const HOOK_HEADER = 'x-pocket-pilot-hook';

const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
const TIMEOUT_SECONDS = 5;

export function hookFilePath(home: string): string {
  return join(home, '.copilot', 'hooks', 'pocket-pilot.json');
}

export function hookFileContent(port: number, secret: string): string {
  const url = `http://${LOOPBACK}:${port}${HOOK_PATH}`;
  const headers = `-H 'content-type: application/json' -H '${HOOK_HEADER}: ${secret}'`;
  const unix = `curl -s -m 3 -o /dev/null ${headers} --data-binary @- ${url} || true`;
  const windows = `$input | curl.exe -s -m 3 -o NUL ${headers} --data-binary '@-' ${url}; exit 0`;
  const hook = {
    type: 'command',
    command: unix,
    osx: unix,
    linux: unix,
    windows,
    timeout: TIMEOUT_SECONDS
  };
  return `${JSON.stringify({ hooks: Object.fromEntries(EVENTS.map((event) => [event, [hook]])) }, null, 2)}\n`;
}

export async function installHooks(file: string, content: string): Promise<void> {
  if ((await readOptional(file)) === content) return;
  await writeAtomic(file, content);
}

export async function removeHooks(file: string): Promise<void> {
  await rm(file, { force: true });
}
