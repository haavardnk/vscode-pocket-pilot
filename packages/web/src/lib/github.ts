import type { GitStatus, Repository, WindowState } from '@pocket-pilot/protocol';

import { shortCommit } from './git';

export type GitHubRepository = NonNullable<Repository['github']>;

export type GitHubLinkKind = 'repository' | 'branch' | 'commit' | 'pullRequests';

export interface GitHubLink {
  kind: GitHubLinkKind;
  label: string;
  detail: string;
  href: string;
}

const ORIGIN = 'origin';
const REFERENCE =
  /(?<![\w#&/.-])(?:#(\d+)|(?=[0-9a-f]{0,39}[a-f])(?=[0-9a-f]{0,39}\d)[0-9a-f]{7,40})(?![\w-])(?!\.\w)/g;
const COMMIT = /^(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}$/;

export function repositoryUrl(github: GitHubRepository): string {
  return `https://github.com/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.name)}`;
}

export function githubLinks(github: GitHubRepository, git: GitStatus | null): GitHubLink[] {
  const base = repositoryUrl(github);
  const upstream = git?.upstream?.remote === ORIGIN ? git.upstream : null;
  const commit = git?.commit && (!git.branch || upstream?.ahead === 0) ? git.commit : null;
  const links: GitHubLink[] = [
    {
      kind: 'repository',
      label: 'Repository',
      detail: `${github.owner}/${github.name}`,
      href: base
    }
  ];
  if (upstream) {
    links.push({
      kind: 'branch',
      label: 'Branch',
      detail: upstream.branch,
      href: `${base}/tree/${upstream.branch.split('/').map(encodeURIComponent).join('/')}`
    });
  }
  if (commit) {
    links.push({
      kind: 'commit',
      label: 'Commit',
      detail: shortCommit(commit),
      href: `${base}/commit/${commit}`
    });
  }
  links.push({
    kind: 'pullRequests',
    label: 'Pull requests',
    detail: upstream ? `From ${upstream.branch}` : 'All open',
    href: upstream
      ? `${base}/pulls?q=${encodeURIComponent(`is:pr head:${upstream.branch}`)}`
      : `${base}/pulls`
  });
  return links;
}

export function windowGitHub(window: WindowState): GitHubRepository | null {
  const [only, ...rest] = window.repositories.flatMap((repository) =>
    repository.github ? [repository.github] : []
  );
  return only && rest.length === 0 ? only : null;
}

function anchor(text: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  return link;
}

function linkText(node: Text, base: string): void {
  const text = node.data;
  if (node.parentElement?.closest('code')) {
    if (COMMIT.test(text)) node.replaceWith(anchor(text, `${base}/commit/${text}`));
    return;
  }
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of text.matchAll(REFERENCE)) {
    const [reference, issue] = match;
    const href = issue ? `${base}/issues/${issue}` : `${base}/commit/${reference}`;
    fragment.append(text.slice(last, match.index), anchor(reference, href));
    last = match.index + reference.length;
  }
  if (last === 0) return;
  fragment.append(text.slice(last));
  node.replaceWith(fragment);
}

export function linkifyGitHub(root: HTMLElement, github: GitHubRepository): void {
  const base = repositoryUrl(github);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('a, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) nodes.push(node);
  }
  for (const node of nodes) linkText(node, base);
}
