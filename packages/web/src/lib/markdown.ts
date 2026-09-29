import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import type { Attachment } from 'svelte/attachments';

import { type ChatContext, chatFileHref } from './chatContext';
import { linkifyGitHub } from './github';

const marked = new Marked({ gfm: true, async: false });
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;
const EXTERNAL = /^(?:[a-z][\w+.-]*:|\/\/|#)/i;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
});

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }), {
    FORBID_TAGS: ['style', 'form', 'input'],
    ALLOWED_URI_REGEXP
  });
}

function fileUrl(href: string, baseUri: string | null): URL | null {
  try {
    const url = new URL(href, baseUri ?? undefined);
    return url.protocol === 'file:' ? url : null;
  } catch {
    return null;
  }
}

function linkFiles(node: HTMLElement, chat: ChatContext, baseUri: string | null): void {
  for (const anchor of node.querySelectorAll('a')) {
    const href = anchor.getAttribute('href');
    if (!href || (EXTERNAL.test(href) && !/^file:/i.test(href))) continue;
    const url = fileUrl(href, baseUri);
    if (!url) {
      anchor.replaceWith(...anchor.childNodes);
      continue;
    }
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
    anchor.setAttribute('href', chatFileHref(chat, url));
  }
}

export function markdown(
  text: string,
  chat: ChatContext,
  baseUri: string | null = null
): Attachment<HTMLElement> {
  return (node) => {
    node.innerHTML = renderMarkdown(text);
    linkFiles(node, chat, baseUri);
    if (chat.github) linkifyGitHub(node, chat.github);
  };
}
