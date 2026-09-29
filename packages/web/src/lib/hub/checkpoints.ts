import type { PermissionLevel, RequestView } from '@pocket-pilot/protocol';

export interface RestoreImpact {
  messages: number;
  files: number;
}

export interface MessageEdit {
  request: RequestView;
  modeId: string | null;
  modelId: string | null;
  permission: PermissionLevel;
}

export function restoreImpact(requests: readonly RequestView[], index: number): RestoreImpact {
  const removed = requests.slice(index);
  const paths = removed.flatMap((request) => request.editedPaths);
  return { messages: removed.length, files: new Set(paths).size };
}

export function removalText({ messages, files }: RestoreImpact): string {
  const later = messages - 1;
  const removed =
    later === 0
      ? 'this message'
      : `this and ${later} later ${later === 1 ? 'message' : 'messages'}`;
  if (files === 0) return `Removes ${removed}.`;
  return `Removes ${removed} and undoes edits to ${files === 1 ? '1 file' : `${files} files`}.`;
}
