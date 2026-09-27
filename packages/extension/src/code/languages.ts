import { basename } from 'node:path';

import picomatch from 'picomatch';

export interface LanguageContribution {
  id: string;
  extensions: string[];
  filenames: string[];
  filenamePatterns: string[];
}

export type LanguageResolver = (path: string) => string | null;

type Matcher = (path: string) => boolean;

function globMatcher(pattern: string): Matcher {
  const matches = picomatch(pattern, { dot: true, nocase: true });
  return pattern.includes('/') ? matches : (path) => matches(basename(path));
}

export function languageResolver(
  languages: readonly LanguageContribution[],
  associations: Readonly<Record<string, string>>
): LanguageResolver {
  const associated = Object.entries(associations).map(
    ([pattern, id]) => [globMatcher(pattern), id] as const
  );
  const filenames = new Map(
    languages.flatMap((language) =>
      language.filenames.map((name) => [name.toLowerCase(), language.id] as const)
    )
  );
  const patterns = languages.flatMap((language) =>
    language.filenamePatterns.map((pattern) => [globMatcher(pattern), language.id] as const)
  );
  const extensions = languages
    .flatMap((language) =>
      language.extensions.map((extension) => [extension.toLowerCase(), language.id] as const)
    )
    .sort(([a], [b]) => b.length - a.length);
  return (path) => {
    const name = basename(path).toLowerCase();
    return (
      associated.find(([matches]) => matches(path))?.[1] ??
      filenames.get(name) ??
      patterns.find(([matches]) => matches(path))?.[1] ??
      extensions.find(([extension]) => name.endsWith(extension))?.[1] ??
      null
    );
  };
}
