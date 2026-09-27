import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ModelSettingsFile } from '../src/models/modelSettings';

describe('ModelSettingsFile', () => {
  let folder: string;
  let file: ModelSettingsFile;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'models-'));
    file = new ModelSettingsFile(join(folder, 'chatLanguageModels.json'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('creates the vendor group and removes empty entries', async () => {
    await file.update('copilot/gpt-5', 'reasoningEffort', 'high');
    await file.update('copilot/gpt-5', 'contextSize', 400_000);
    expect(await file.read()).toEqual(
      new Map([['copilot/gpt-5', { reasoningEffort: 'high', contextSize: 400_000 }]])
    );

    await file.update('copilot/gpt-5', 'reasoningEffort', null);
    await file.update('copilot/gpt-5', 'contextSize', null);
    expect(JSON.parse(await readFile(file.path, 'utf8'))).toEqual([
      { name: 'Copilot', vendor: 'copilot', settings: {} }
    ]);
  });

  it('keeps comments and other groups', async () => {
    await writeFile(
      file.path,
      '[\n  // mine\n  { "name": "X", "vendor": "xai", "apiKey": "${input:k}", "settings": {} },\n]\n'
    );
    await file.update('copilot/o3', 'reasoningEffort', 'low');
    const text = await readFile(file.path, 'utf8');
    expect(text).toContain('// mine');
    expect(text).toContain('"vendor": "xai"');
    expect(await file.read()).toEqual(new Map([['copilot/o3', { reasoningEffort: 'low' }]]));
  });

  it.each([['[ { broken'], ['{}']])('refuses to rewrite %s', async (text) => {
    await writeFile(file.path, text);
    await expect(file.update('copilot/o3', 'reasoningEffort', 'low')).rejects.toThrow();
    expect(await readFile(file.path, 'utf8')).toBe(text);
  });
});
