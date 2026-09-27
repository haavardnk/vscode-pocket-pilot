import * as vscode from 'vscode';

const PROVIDER = 'github';
const SCOPES = ['repo'];

export async function githubToken(): Promise<string | null> {
  const session = await vscode.authentication.getSession(PROVIDER, SCOPES, { silent: true });
  return session?.accessToken ?? null;
}

export async function signInGitHub(): Promise<boolean> {
  const session = await vscode.authentication.getSession(PROVIDER, SCOPES, { createIfNone: true });
  return session !== undefined;
}

export function onDidChangeGitHubSessions(listener: () => void): vscode.Disposable {
  return vscode.authentication.onDidChangeSessions((event) => {
    if (event.provider.id === PROVIDER) listener();
  });
}
