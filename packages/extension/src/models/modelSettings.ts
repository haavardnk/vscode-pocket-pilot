import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';

import type { ConfigValue, ModelConfigKey } from '@pocket-pilot/protocol';
import { applyEdits, type JSONPath, modify, parse, type ParseError } from 'jsonc-parser';

import { asArray, asRecord, asString } from '../json';

export type ModelSettings = Map<string, Partial<Record<ModelConfigKey, ConfigValue>>>;

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } };

function parseStrict(text: string): unknown {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) throw new Error('chatLanguageModels.json is not valid JSON');
  return value;
}

function splitModelId(modelId: string): { vendor: string; id: string } {
  const slash = modelId.indexOf('/');
  return slash < 0
    ? { vendor: 'copilot', id: modelId }
    : { vendor: modelId.slice(0, slash), id: modelId.slice(slash + 1) };
}

export class ModelSettingsFile {
  private writing: Promise<void> = Promise.resolve();

  constructor(readonly path: string) {}

  async read(): Promise<ModelSettings> {
    const text = await this.readText();
    const settings: ModelSettings = new Map();
    for (const raw of asArray(text ? parseStrict(text) : [])) {
      const group = asRecord(raw);
      const vendor = asString(group.vendor);
      if (!vendor) continue;
      for (const [id, values] of Object.entries(asRecord(group.settings))) {
        const entry = asRecord(values);
        const picked: Partial<Record<ModelConfigKey, ConfigValue>> = {};
        for (const key of ['reasoningEffort', 'contextSize'] as const) {
          const value = entry[key];
          if (typeof value === 'string' || typeof value === 'number') picked[key] = value;
        }
        settings.set(`${vendor}/${id}`, picked);
      }
    }
    return settings;
  }

  update(modelId: string, key: ModelConfigKey, value: ConfigValue | null): Promise<void> {
    const next = this.writing.then(() => this.write(modelId, key, value));
    this.writing = next.catch(() => undefined);
    return next;
  }

  private async write(
    modelId: string,
    key: ModelConfigKey,
    value: ConfigValue | null
  ): Promise<void> {
    const { vendor, id } = splitModelId(modelId);
    let text = (await this.readText()) ?? '[]';
    const groups = parseStrict(text);
    if (!Array.isArray(groups)) throw new Error('chatLanguageModels.json must contain an array');
    let index = groups.findIndex((group) => asRecord(group).vendor === vendor);
    if (index < 0) {
      if (value === null) return;
      const name = vendor === 'copilot' ? 'Copilot' : vendor;
      text = applyEdits(
        text,
        modify(text, [groups.length], { name, vendor, settings: {} }, FORMAT)
      );
      index = groups.length;
    }
    const settingsPath: JSONPath = [index, 'settings', id];
    const current = asRecord(asRecord(asRecord(groups[index]).settings)[id]);
    const remaining = Object.keys(current).filter((name) => name !== key);
    const edit =
      value === null && remaining.length === 0
        ? modify(text, settingsPath, undefined, FORMAT)
        : modify(text, [...settingsPath, key], value ?? undefined, FORMAT);
    await this.replace(applyEdits(text, edit));
  }

  private async readText(): Promise<string | null> {
    try {
      return await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async replace(text: string): Promise<void> {
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
      await rename(temporary, this.path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
