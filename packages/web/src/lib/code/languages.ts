const ALIASES: Record<string, string> = {
  typescriptreact: 'tsx',
  javascriptreact: 'jsx',
  dockercompose: 'yaml',
  'github-actions-workflow': 'yaml',
  snippets: 'jsonc',
  jade: 'pug',
  plaintext: 'text'
};

const PLAIN = new Set(['text', 'txt', 'plain', 'log']);

function extension(path: string): string | null {
  const name = path.split('/').at(-1) ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

export function resolveLanguage(
  languageId: string | null,
  path: string,
  known: (id: string) => boolean
): string | null {
  const id = languageId ? (ALIASES[languageId] ?? languageId) : null;
  if (id && PLAIN.has(id)) return null;
  if (id && known(id)) return id;
  const fallback = extension(path);
  return fallback && !PLAIN.has(fallback) && known(fallback) ? fallback : null;
}
