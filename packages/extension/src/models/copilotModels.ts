import type { ModelConfigOption } from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString } from '../json';

export interface CopilotModelInfo {
  id: string;
  pickerEnabled: boolean;
  options: ModelConfigOption[];
}

const EFFORT_LABELS: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max'
};

const EFFORT_DESCRIPTIONS: Record<string, string> = {
  none: 'No reasoning applied',
  minimal: 'Minimal reasoning for fastest responses',
  low: 'Faster responses with less reasoning',
  medium: 'Balanced reasoning and speed',
  high: 'Greater reasoning depth but slower',
  xhigh: 'Highest reasoning depth but slowest',
  max: 'Absolute maximum capability with no constraints'
};

function effortLabel(effort: string): string {
  return EFFORT_LABELS[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
}

function defaultEffort(efforts: string[], family: string): string | null {
  const name = family.toLowerCase();
  const preferred = name.startsWith('claude') ? 'high' : 'medium';
  return efforts.includes(preferred) ? preferred : (efforts[0] ?? null);
}

export function tokenLabel(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = Math.floor((tokens / 1_000_000) * 10) / 10;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (tokens > 900_000) return '1M';
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function effortOption(
  capabilities: Record<string, unknown>,
  family: string
): ModelConfigOption | null {
  const efforts = asArray(asRecord(capabilities.supports).reasoning_effort).filter(
    (effort): effort is string => typeof effort === 'string'
  );
  if (efforts.length < 2) return null;
  return {
    key: 'reasoningEffort',
    title: 'Thinking Effort',
    choices: efforts.map((effort) => ({
      value: effort,
      label: effortLabel(effort),
      description: EFFORT_DESCRIPTIONS[effort] ?? null
    })),
    defaultValue: defaultEffort(efforts, family),
    value: null
  };
}

function contextOption(
  model: Record<string, unknown>,
  maxPrompt: number | null
): ModelConfigOption | null {
  const prices = asRecord(asRecord(model.billing).token_prices);
  const standard = asRecord(prices.default);
  const recommended = asNumber(standard.max_prompt_tokens) ?? asNumber(standard.context_max);
  if (recommended === null || maxPrompt === null || recommended >= maxPrompt) return null;
  const longByDefault = prices.long_context === undefined;
  return {
    key: 'contextSize',
    title: 'Context Size',
    choices: [
      {
        value: recommended,
        label: tokenLabel(recommended),
        description: 'Default recommended context size'
      },
      { value: maxPrompt, label: tokenLabel(maxPrompt), description: 'Longer sessions' }
    ],
    defaultValue: longByDefault ? maxPrompt : recommended,
    value: null
  };
}

export function parseCopilotModels(raw: unknown): CopilotModelInfo[] {
  return asArray(raw).flatMap((item) => {
    const model = asRecord(item);
    const id = asString(model.id);
    const capabilities = asRecord(model.capabilities);
    if (!id || capabilities.type !== 'chat') return [];
    const family = asString(capabilities.family) ?? id;
    const maxPrompt = asNumber(asRecord(capabilities.limits).max_prompt_tokens);
    const options = [effortOption(capabilities, family), contextOption(model, maxPrompt)].filter(
      (option): option is ModelConfigOption => option !== null
    );
    return [{ id, pickerEnabled: model.model_picker_enabled === true, options }];
  });
}
