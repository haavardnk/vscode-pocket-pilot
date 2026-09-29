import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ToolLink } from '@pocket-pilot/protocol';

import { asArray, asNumber, asRecord, asString, type JsonRecord, markdownText } from '../json';
import { basename } from './partText';

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const SCHEME = /^[a-z][\w+.-]*:/i;
const MAX_LINKS = 50;

interface FileTarget {
  path: string;
  line: number | null;
}

function lineOf(fragment: string | null): number | null {
  const match = /^L?(\d+)/.exec(fragment ?? '');
  return match ? Number(match[1]) : null;
}

function fileHref(target: FileTarget): string {
  const href = pathToFileURL(target.path).href;
  return target.line === null ? href : `${href}#L${target.line}`;
}

function hrefTarget(href: string, base: string | null): FileTarget | null {
  if (href.startsWith('#') || (SCHEME.test(href) && !href.startsWith('file:'))) return null;
  if (!SCHEME.test(href) && base === null) return null;
  try {
    const url = new URL(href, base ?? undefined);
    if (url.protocol !== 'file:') return null;
    return { path: fileURLToPath(url), line: lineOf(decodeURIComponent(url.hash.slice(1))) };
  } catch {
    return null;
  }
}

function uriTarget(value: unknown): FileTarget | null {
  const uri = asRecord(value);
  if ((asString(uri.scheme) ?? 'file') !== 'file') return null;
  const path = asString(uri.fsPath) ?? asString(uri.path);
  return path ? { path, line: lineOf(asString(uri.fragment)) } : null;
}

function locationTarget(value: unknown): FileTarget | null {
  const location = asRecord(value);
  if (location.uri === undefined) return uriTarget(location);
  const target = uriTarget(location.uri);
  const line = asNumber(asRecord(location.range).startLineNumber);
  return target && { path: target.path, line: line ?? target.line };
}

function targetLabel(target: FileTarget): string {
  const name = basename(target.path);
  return target.line === null ? name : `${name}:${target.line}`;
}

function webLink(value: unknown): ToolLink | null {
  const uri = asRecord(value);
  const scheme = asString(uri.scheme);
  const authority = asString(uri.authority);
  if ((scheme !== 'http' && scheme !== 'https') || !authority) return null;
  const path = asString(uri.path) ?? '';
  const query = asString(uri.query);
  return {
    label: `${authority}${path}`.replace(/\/$/, ''),
    uri: `${scheme}://${authority}${path}${query ? `?${query}` : ''}`
  };
}

function resultLink(value: unknown): ToolLink | null {
  const target = locationTarget(value);
  return target ? { label: targetLabel(target), uri: fileHref(target) } : webLink(value);
}

function escapeLabel(label: string): string {
  return label.replace(/[[\]\\]/g, '\\$&');
}

export function markdownBase(markdown: JsonRecord): string | null {
  const target = uriTarget(markdown.baseUri);
  if (!target) return null;
  const href = pathToFileURL(target.path).href;
  return href.endsWith('/') ? href : `${href}/`;
}

export function linkedMessage(value: unknown): string {
  return markdownText(value)
    .replace(LINK, (_match, label: string, href: string) => {
      const target = hrefTarget(href, null);
      const text = label || basename(target?.path ?? href.replace(/[?#].*$/, ''));
      if (!target) return text;
      return `[${label || escapeLabel(text)}](${fileHref(target)})`;
    })
    .replace(/\$\([\w-]+\)\s*/g, '')
    .trim();
}

function referenceTarget(part: JsonRecord): FileTarget | null {
  const reference = asRecord(part.inlineReference);
  return locationTarget(reference) ?? locationTarget(reference.location);
}

export function referenceHref(part: JsonRecord): string | null {
  const target = referenceTarget(part);
  return target && fileHref(target);
}

export function resultLinks(part: JsonRecord): ToolLink[] {
  const seen = new Set<string>();
  const links: ToolLink[] = [];
  for (const raw of asArray(part.resultDetails)) {
    const link = resultLink(raw);
    if (!link || seen.has(link.uri)) continue;
    seen.add(link.uri);
    links.push(link);
    if (links.length === MAX_LINKS) break;
  }
  return links;
}

function textPaths(text: string, base: string | null): string[] {
  return [...text.matchAll(LINK)].flatMap(([, , href = '']) => hrefTarget(href, base)?.path ?? []);
}

function messagePaths(part: JsonRecord): string[] {
  return [part.invocationMessage, part.pastTenseMessage].flatMap((message) =>
    textPaths(markdownText(message), null)
  );
}

function partPaths(part: JsonRecord): string[] {
  switch (part.kind) {
    case undefined:
      return textPaths(markdownText(part.value), markdownBase(part));
    case 'markdownContent':
      return textPaths(markdownText(part.content), markdownBase(asRecord(part.content)));
    case 'inlineReference': {
      const target = referenceTarget(part);
      return target ? [target.path] : [];
    }
    case 'toolInvocationSerialized':
      return [
        ...messagePaths(part),
        ...asArray(part.resultDetails).flatMap((raw) => locationTarget(raw)?.path ?? [])
      ];
    default:
      return [];
  }
}

export function sessionFiles(requests: readonly JsonRecord[]): Set<string> {
  return new Set(
    requests.flatMap((request) =>
      asArray(request.response).flatMap((raw) => partPaths(asRecord(raw)))
    )
  );
}
