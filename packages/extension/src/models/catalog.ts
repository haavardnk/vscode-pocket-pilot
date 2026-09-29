import type { Model } from '@pocket-pilot/protocol';

import type { CopilotModelInfo } from './copilotModels';
import type { ModelSettings } from './modelSettings';

const COPILOT_CLI_VENDOR = 'copilotcli';

export interface ChatModelInfo {
  id: string;
  vendor: string;
  family: string;
  name: string;
  maxInputTokens: number;
}

export function buildModels(
  chatModels: ChatModelInfo[],
  copilotModels: CopilotModelInfo[],
  settings: ModelSettings
): Model[] {
  const copilot = new Map(copilotModels.map((info) => [info.id, info]));
  const seen = new Set<string>();
  return chatModels
    .flatMap((chat) => {
      const id = `${chat.vendor}/${chat.id}`;
      const info = chat.vendor === 'copilot' ? copilot.get(chat.id) : undefined;
      if (chat.vendor === COPILOT_CLI_VENDOR || seen.has(id) || info?.pickerEnabled === false)
        return [];
      seen.add(id);
      const values = settings.get(id) ?? {};
      return [
        {
          id,
          vendor: chat.vendor,
          family: chat.family,
          name: chat.name,
          maxInputTokens: chat.maxInputTokens > 0 ? chat.maxInputTokens : null,
          vision: info?.vision ?? null,
          options: (info?.options ?? []).map((option) => ({
            ...option,
            value: values[option.key] ?? null
          }))
        }
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
