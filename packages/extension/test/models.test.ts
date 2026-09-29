import { describe, expect, it } from 'vitest';

import { buildModels, type ChatModelInfo } from '../src/models/catalog';
import { parseCopilotModels, tokenLabel } from '../src/models/copilotModels';

interface CatalogEntry {
  family?: string;
  efforts?: string[];
  maxPrompt?: number;
  recommended?: number;
  longContext?: boolean;
  type?: string;
  vision?: boolean;
}

function entry(id: string, spec: CatalogEntry): unknown {
  const prices: Record<string, unknown> = {};
  if (spec.recommended !== undefined) prices.default = { max_prompt_tokens: spec.recommended };
  if (spec.longContext) prices.long_context = {};
  return {
    id,
    name: id,
    model_picker_enabled: true,
    capabilities: {
      family: spec.family ?? id,
      type: spec.type ?? 'chat',
      limits: { max_prompt_tokens: spec.maxPrompt },
      supports: { reasoning_effort: spec.efforts, vision: spec.vision }
    },
    billing: { token_prices: prices }
  };
}

function chat(id: string, vendor = 'copilot'): ChatModelInfo {
  return { id, vendor, family: id, name: id.toUpperCase(), maxInputTokens: 1000 };
}

describe('copilot models', () => {
  it.each([
    [999, '999'],
    [128_000, '128K'],
    [950_000, '1M'],
    [1_000_000, '1M'],
    [1_500_000, '1.5M']
  ])('labels %i tokens', (tokens, label) => {
    expect(tokenLabel(tokens)).toBe(label);
  });

  it.each([
    ['claude-x', ['low', 'medium', 'high'], 'high'],
    ['gpt-x', ['low', 'medium', 'high'], 'medium'],
    ['gpt-x', ['low', 'xhigh'], 'low']
  ])('defaults %s effort', (family, efforts, expected) => {
    const [model] = parseCopilotModels([entry('m', { family, efforts })]);
    const option = model?.options.find((candidate) => candidate.key === 'reasoningEffort');
    expect(option?.defaultValue).toBe(expected);
  });

  it('labels effort levels', () => {
    const [model] = parseCopilotModels([entry('m', { efforts: ['xhigh', 'max', 'turbo'] })]);
    expect(model?.options[0]?.choices.map((choice) => choice.label)).toEqual([
      'Extra High',
      'Max',
      'Turbo'
    ]);
  });

  it.each([
    [{ recommended: 200_000, maxPrompt: 1_000_000, longContext: true }, 200_000],
    [{ recommended: 200_000, maxPrompt: 1_000_000 }, 1_000_000],
    [{ recommended: 1_000_000, maxPrompt: 1_000_000 }, null]
  ])('offers context size %#', (spec, expected) => {
    const [model] = parseCopilotModels([entry('m', spec)]);
    const option = model?.options.find((candidate) => candidate.key === 'contextSize');
    expect(option?.defaultValue ?? null).toBe(expected);
  });

  it('skips non-chat models and single effort levels', () => {
    const models = parseCopilotModels([
      entry('embed', { type: 'embeddings' }),
      entry('m', { efforts: ['medium'] })
    ]);
    expect(models).toEqual([{ id: 'm', pickerEnabled: true, vision: false, options: [] }]);
  });

  it('reports vision only for Copilot catalog models', () => {
    const copilot = parseCopilotModels([entry('eye', { vision: true }), entry('text', {})]);
    const models = buildModels(
      [chat('eye'), chat('text'), chat('byok', 'other')],
      copilot,
      new Map()
    );
    expect(models.map((model) => [model.id, model.vision])).toEqual([
      ['other/byok', null],
      ['copilot/eye', true],
      ['copilot/text', false]
    ]);
  });

  it('merges saved values and drops hidden and Copilot CLI models', () => {
    const copilot = parseCopilotModels([
      entry('a', { efforts: ['low', 'high'] }),
      { ...(entry('hidden', {}) as object), model_picker_enabled: false }
    ]);
    const models = buildModels(
      [chat('b', 'other'), chat('a'), chat('a'), chat('hidden'), chat('a', 'copilotcli')],
      copilot,
      new Map([['copilot/a', { reasoningEffort: 'high' }]])
    );
    expect(models.map((model) => [model.id, model.options.map((option) => option.value)])).toEqual([
      ['copilot/a', ['high']],
      ['other/b', []]
    ]);
  });
});
