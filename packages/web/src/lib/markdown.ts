import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import type { Attachment } from 'svelte/attachments';

const marked = new Marked({ gfm: true, async: false });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
});

export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }), {
    FORBID_TAGS: ['style', 'form', 'input']
  });
}

export function markdown(text: string): Attachment<HTMLElement> {
  return (node) => {
    node.innerHTML = renderMarkdown(text);
  };
}
