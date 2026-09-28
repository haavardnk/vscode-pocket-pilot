import { markdownText } from '../json';

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

export const DETAIL_LENGTH = 4000;

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return decodeURIComponent(trimmed.slice(trimmed.lastIndexOf('/') + 1));
}

export function plainMessage(value: unknown): string {
  return markdownText(value)
    .replace(
      LINK,
      (_match, label: string, target: string) => label || basename(target.replace(/[?#].*$/, ''))
    )
    .replace(/\$\([\w-]+\)\s*/g, '')
    .trim();
}

export function clip(text: string, length: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}
