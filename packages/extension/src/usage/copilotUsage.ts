import type { CopilotUsage } from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import { parseEntitlements } from './entitlements';
import type { UsageReader } from './usageFeed';

const ENTITLEMENTS_URL = 'https://api.github.com/copilot_internal/user';
const PROVIDER = 'github';
const ENTERPRISE_PROVIDER = 'github-enterprise';
const ACCESS_SCOPES = ['user:email'];
const SCOPE_SETS = [ACCESS_SCOPES, ['read:user'], ['read:user', 'user:email', 'repo', 'workflow']];
const TIMEOUT_MS = 10_000;

export class CopilotUsageReader implements UsageReader {
  private requested = false;

  async read(): Promise<CopilotUsage> {
    const provider = vscode.workspace
      .getConfiguration('github.copilot.advanced')
      .get<string>('authProvider');
    if (provider === ENTERPRISE_PROVIDER) {
      return {
        state: 'unavailable',
        reason: 'Copilot usage is only available for github.com accounts'
      };
    }
    const session = await this.session();
    if (!session) return { state: 'needsAccess' };
    const response = await fetch(ENTITLEMENTS_URL, {
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        accept: 'application/json',
        'user-agent': 'pocket-pilot'
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (response.status === 401) {
      return { state: 'unavailable', reason: 'GitHub rejected the VS Code sign-in' };
    }
    if (response.status === 404) {
      return { state: 'unavailable', reason: 'No Copilot plan on this GitHub account' };
    }
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return parseEntitlements(await response.json(), Date.now());
  }

  onDidChangeAccess(listener: () => void): vscode.Disposable {
    return vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === PROVIDER) listener();
    });
  }

  private async session(): Promise<vscode.AuthenticationSession | undefined> {
    for (const scopes of SCOPE_SETS) {
      const session = await vscode.authentication.getSession(PROVIDER, scopes, { silent: true });
      if (session) return session;
    }
    if (this.requested) return undefined;
    this.requested = true;
    return vscode.authentication.getSession(PROVIDER, ACCESS_SCOPES, { createIfNone: false });
  }
}
