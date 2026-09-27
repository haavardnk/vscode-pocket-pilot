import { createHighlighterCore, stringifyTokenStyle } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import frappe from 'shiki/themes/catppuccin-frappe.mjs';
import latte from 'shiki/themes/catppuccin-latte.mjs';
import macchiato from 'shiki/themes/catppuccin-macchiato.mjs';
import mocha from 'shiki/themes/catppuccin-mocha.mjs';

import type { Highlighted, HighlightRequest, HighlightResponse, Token } from './highlight';
import { resolveLanguage } from './languages';

const MAX_CHARS = 256_000;
const MAX_LINES = 5_000;
const THEMES = {
  latte: 'catppuccin-latte',
  frappe: 'catppuccin-frappe',
  macchiato: 'catppuccin-macchiato',
  mocha: 'catppuccin-mocha'
};

const highlighter = createHighlighterCore({
  themes: [latte, frappe, macchiato, mocha],
  langs: [],
  engine: createJavaScriptRegexEngine({ forgiving: true })
});

function isBundled(id: string): id is keyof typeof bundledLanguages {
  return Object.hasOwn(bundledLanguages, id);
}

async function highlight(request: HighlightRequest): Promise<Highlighted | null> {
  if (request.code.length > MAX_CHARS || request.code.split('\n').length > MAX_LINES) return null;
  const language = resolveLanguage(request.languageId, request.path, isBundled);
  if (!language || !isBundled(language)) return null;
  const core = await highlighter;
  await core.loadLanguage(bundledLanguages[language]);
  const { tokens } = core.codeToTokens(request.code, {
    lang: language,
    themes: THEMES,
    defaultColor: false
  });
  const styles: string[] = [];
  const indexes = new Map<string, number>();
  const lines = tokens.map((line) =>
    line.map((token): Token => {
      const style = token.htmlStyle ? stringifyTokenStyle(token.htmlStyle) : '';
      let index = indexes.get(style);
      if (index === undefined) {
        index = styles.length;
        styles.push(style);
        indexes.set(style, index);
      }
      return [token.content, index];
    })
  );
  return { styles, lines };
}

addEventListener('message', (event: MessageEvent<HighlightRequest>) => {
  const { id } = event.data;
  void highlight(event.data)
    .catch(() => null)
    .then((result) => postMessage({ id, result } satisfies HighlightResponse));
});
