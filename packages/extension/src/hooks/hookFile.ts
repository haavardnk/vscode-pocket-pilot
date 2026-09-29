import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { LOOPBACK } from '../cluster/sharedState';
import { HOOK_PATH } from '../server/tunnelTraffic';
import { readOptional, writeAtomic } from '../storage/sharedFile';

export const HOOK_HEADER = 'x-pocket-pilot-hook';

const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
const TIMEOUT_SECONDS = 5;

export interface HookInstall {
  hookFile: string;
  headersFile: string;
  port: number;
  secret: string;
}

export function hookFilePath(home: string): string {
  return join(home, '.copilot', 'hooks', 'pocket-pilot.json');
}

export function hookHeadersPath(storage: string): string {
  return join(storage, 'hook-headers');
}

function hookFileContent(port: number, headersFile: string): string {
  const url = `http://${LOOPBACK}:${port}${HOOK_PATH}`;
  const sh = `'@${headersFile.replaceAll("'", "'\\''")}'`;
  const powershell = `'@${headersFile.replaceAll("'", "''")}'`;
  const type = `-H 'content-type: application/json'`;
  const unix = `curl -s -m 3 -o /dev/null ${type} -H ${sh} --data-binary @- ${url} || true`;
  const windows = `$input | curl.exe -s -m 3 -o NUL ${type} -H ${powershell} --data-binary '@-' ${url}; exit 0`;
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

async function writeChanged(file: string, content: string): Promise<void> {
  if ((await readOptional(file)) === content) return;
  await writeAtomic(file, content);
}

export async function installHooks(install: HookInstall): Promise<void> {
  await writeChanged(install.headersFile, `${HOOK_HEADER}: ${install.secret}\n`);
  await writeChanged(install.hookFile, hookFileContent(install.port, install.headersFile));
}

export async function removeHooks(file: string): Promise<void> {
  await rm(file, { force: true });
}
