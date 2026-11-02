import { formatNumber } from './format.js';
import type { Repo, ScanStatus } from './types.js';

export interface Totals {
  prs: number;
  issues: number;
  failed: number;
  dependabot: number;
  malware: number;
  codeScanning: number;
  secretScanning: number;
  /** Repos whose Dependabot alerts could be read. */
  checked: number;
}

function sum(repos: Repo[], pick: (repo: Repo) => number): number {
  return repos.reduce((total, repo) => total + pick(repo), 0);
}

export function computeTotals(repos: Repo[]): Totals {
  return {
    prs: sum(repos, (r) => r.open_prs.length),
    issues: sum(repos, (r) => r.open_issues.length),
    failed: sum(repos, (r) => r.failed_workflows.length),
    dependabot: sum(repos, (r) => r.dependabot.alerts.length),
    malware: sum(repos, (r) => r.dependabot.malware_alerts.length),
    codeScanning: sum(repos, (r) => r.code_scanning.alerts.length),
    secretScanning: sum(repos, (r) => r.secret_scanning.alerts.length),
    checked: repos.filter((r) => r.dependabot.status === 'ok').length,
  };
}

/** Number of things that need attention in a repo; drives the sort order. */
export function attentionScore(repo: Repo): number {
  return (
    repo.open_prs.length +
    repo.open_issues.length +
    repo.failed_workflows.length +
    repo.dependabot.alerts.length +
    repo.code_scanning.alerts.length +
    repo.secret_scanning.alerts.length
  );
}

/** Most open items first, then alphabetical. Does not mutate the input. */
export function sortRepos(repos: Repo[]): Repo[] {
  return repos.slice().sort((a, b) => attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name));
}

/** What to show in an alert-count cell: the count, "-" when the feature is off, or "Not checked". */
export function alertCell(status: ScanStatus, count: number): string {
  if (status === 'ok') {
    return formatNumber(count);
  }
  return status === 'disabled' ? '-' : 'Not checked';
}
