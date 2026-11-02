import { formatNumber } from './format.js';
import type { Repo, ScanStatus } from './types.js';

/** Counts of repos whose data could not be read, per figure. They are never counted as zero. */
export interface NotChecked {
  prs: number;
  issues: number;
  failed: number;
  dependabot: number;
  codeScanning: number;
  secretScanning: number;
}

export interface Totals {
  prs: number;
  issues: number;
  failed: number;
  /** All open Dependabot alerts. `malware` is a subset of these, not additional ones. */
  dependabot: number;
  malware: number;
  codeScanning: number;
  secretScanning: number;
  notChecked: NotChecked;
}

/** "disabled" is a known state of a repo; anything else that is not "ok" means the data is missing. */
export function isNotChecked(status: ScanStatus): boolean {
  return status !== 'ok' && status !== 'disabled';
}

function sum(repos: Repo[], pick: (repo: Repo) => number): number {
  return repos.reduce((total, repo) => total + pick(repo), 0);
}

function countWhere(repos: Repo[], test: (repo: Repo) => boolean): number {
  return repos.filter(test).length;
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
    notChecked: {
      prs: countWhere(repos, (r) => r.collection_errors.includes('pulls')),
      issues: countWhere(repos, (r) => r.collection_errors.includes('issues')),
      failed: countWhere(repos, (r) => r.collection_errors.includes('runs')),
      dependabot: countWhere(repos, (r) => isNotChecked(r.dependabot.status)),
      codeScanning: countWhere(repos, (r) => isNotChecked(r.code_scanning.status)),
      secretScanning: countWhere(repos, (r) => isNotChecked(r.secret_scanning.status)),
    },
  };
}

/** Number of things that need attention in a repo (open items and unreadable data); drives the sort order. */
export function attentionScore(repo: Repo): number {
  const unreadable = [repo.dependabot, repo.code_scanning, repo.secret_scanning].filter((block) => isNotChecked(block.status)).length;
  return (
    repo.open_prs.length +
    repo.open_issues.length +
    repo.failed_workflows.length +
    repo.dependabot.alerts.length +
    repo.code_scanning.alerts.length +
    repo.secret_scanning.alerts.length +
    repo.collection_errors.length +
    unreadable
  );
}

/** Most open items first, then alphabetical. Does not mutate the input. */
export function sortRepos(repos: Repo[]): Repo[] {
  return repos.slice().sort((a, b) => attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name));
}

/**
 * What to show in an alert-count cell: the count, "-" when the feature is off, "Not checked" when the
 * token could not read it, or "Error" when GitHub's API failed.
 */
export function alertCell(status: ScanStatus, count: number): string {
  if (status === 'ok') {
    return formatNumber(count);
  }
  if (status === 'disabled') {
    return '-';
  }
  return status === 'no_permission' ? 'Not checked' : 'Error';
}
