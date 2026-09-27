import * as vscode from 'vscode';

import { asArray, asRecord, asString } from '../json';
import { type LanguageContribution, type LanguageResolver, languageResolver } from './languages';

function strings(value: unknown): string[] {
  return asArray(value).filter((item) => typeof item === 'string');
}

function contributions(): LanguageContribution[] {
  return vscode.extensions.all.flatMap((extension) =>
    asArray(asRecord(asRecord(extension.packageJSON).contributes).languages).flatMap((raw) => {
      const language = asRecord(raw);
      const id = asString(language.id);
      if (!id) return [];
      return [
        {
          id,
          extensions: strings(language.extensions),
          filenames: strings(language.filenames),
          filenamePatterns: strings(language.filenamePatterns)
        }
      ];
    })
  );
}

function associations(): Record<string, string> {
  const configured = asRecord(vscode.workspace.getConfiguration('files').get('associations'));
  return Object.fromEntries(
    Object.entries(configured).flatMap(([pattern, id]) =>
      typeof id === 'string' ? [[pattern, id]] : []
    )
  );
}

export class LanguageIndex implements vscode.Disposable {
  private resolver: LanguageResolver = languageResolver(contributions(), associations());
  private readonly subscriptions = [
    vscode.extensions.onDidChange(() => this.rebuild()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('files.associations')) this.rebuild();
    })
  ];

  resolve(path: string): string | null {
    return this.resolver(path);
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private rebuild(): void {
    this.resolver = languageResolver(contributions(), associations());
  }
}
