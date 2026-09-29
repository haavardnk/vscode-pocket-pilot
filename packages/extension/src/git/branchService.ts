import {
  type BranchCommand,
  branchNameError,
  type BranchQuery,
  type BranchResult,
  type Command
} from '@pocket-pilot/protocol';
import * as vscode from 'vscode';

import type { CodeFolder } from '../code/folders';
import { isInside } from '../code/paths';
import { branchList, gitErrorMessage, type SwitchTarget, switchTarget } from './branches';
import type { GitRepository } from './gitState';
import type { GitStatusSource } from './gitStatus';

const FETCH_TIMEOUT_MS = 25_000;

type CheckoutCommand = Extract<BranchCommand, { kind: 'checkoutBranch' }>;

export function isBranchCommand(command: Command): command is BranchCommand {
  return (
    command.kind === 'checkoutBranch' ||
    command.kind === 'createBranch' ||
    command.kind === 'fetchBranches'
  );
}

async function listBranches(repository: GitRepository): Promise<BranchResult> {
  const refs = await repository.getBranches({ remote: true, sort: 'committerdate' });
  return branchList(refs, repository.state, repository.rootUri.fsPath);
}

function unsavedFiles(root: string): number {
  return vscode.workspace.textDocuments.filter(
    (document) =>
      document.isDirty && document.uri.scheme === 'file' && isInside(root, document.uri.fsPath)
  ).length;
}

async function switchTo(repository: GitRepository, target: SwitchTarget): Promise<void> {
  if (target.kind === 'local') {
    await repository.checkout(target.name);
    return;
  }
  await repository.createBranch(target.name, true, target.upstream);
  await repository.setBranchUpstream(target.name, target.upstream);
}

async function checkout(repository: GitRepository, command: CheckoutCommand): Promise<void> {
  const target = switchTarget(await listBranches(repository), command.name, command.remote);
  if (!target) return;
  const unsaved = unsavedFiles(repository.rootUri.fsPath);
  if (unsaved > 0) {
    throw new Error(
      `Save or discard ${unsaved} unsaved ${unsaved === 1 ? 'file' : 'files'} in VS Code first`
    );
  }
  if (!command.stash) {
    await switchTo(repository, target);
    return;
  }
  const message = `Pocket Pilot: before ${target.name}`;
  await repository.createStash({ message, includeUntracked: true });
  try {
    await switchTo(repository, target);
  } catch (error) {
    throw new Error(`${gitErrorMessage(error)} Your changes are in the stash "${message}".`, {
      cause: error
    });
  }
}

async function create(repository: GitRepository, name: string): Promise<void> {
  const invalid = branchNameError(name);
  if (invalid) throw new Error(invalid);
  await repository.createBranch(name, true);
}

async function fetchAll(repository: GitRepository): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          'Fetching is taking too long. VS Code may be asking for credentials on the desktop.'
        )
      );
    }, FETCH_TIMEOUT_MS);
  });
  try {
    await Promise.race([repository.fetch({ all: true, prune: true }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class BranchService {
  constructor(
    private readonly folders: () => readonly CodeFolder[],
    private readonly git: GitStatusSource
  ) {}

  list(query: BranchQuery): Promise<BranchResult> {
    return listBranches(this.repository(query.folderId));
  }

  async run(command: BranchCommand): Promise<void> {
    const repository = this.repository(command.folderId);
    try {
      if (command.kind === 'fetchBranches') await fetchAll(repository);
      else if (command.kind === 'createBranch') await create(repository, command.name);
      else await checkout(repository, command);
    } catch (error) {
      throw new Error(gitErrorMessage(error), { cause: error });
    }
  }

  private repository(folderId: string): GitRepository {
    const folder = this.folders().find((candidate) => candidate.id === folderId);
    if (!folder) throw new Error('Workspace folder is no longer open');
    const repository = this.git.repositoryFor(folder.root);
    if (!repository) throw new Error('This folder is not a Git repository');
    return repository;
  }
}
