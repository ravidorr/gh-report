import type { CollectionTarget, Report, ScanStatus } from './types.js';

// Runtime check for `data.json`. The collector is bash, runs on its own schedule, and an old file can
// still be deployed, so the page checks what it relies on instead of trusting a type cast. Throws an
// Error that names the offending path.

const SCAN_STATUSES: readonly string[] = ['ok', 'disabled', 'no_permission', 'error'] satisfies ScanStatus[];
const COLLECTION_TARGETS: readonly string[] = ['branches', 'pulls', 'issues', 'runs'] satisfies CollectionTarget[];
const FAILED_CONCLUSIONS: readonly string[] = ['failure', 'timed_out', 'startup_failure'];

type Json = Record<string, unknown>;

function bad(path: string, expected: string): never {
  throw new Error(`data.json has an unexpected shape: ${path} should be ${expected}`);
}

function object(value: unknown, path: string): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : bad(path, 'an object');
}

function array(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : bad(path, 'an array');
}

function string(value: unknown, path: string): string {
  return typeof value === 'string' ? value : bad(path, 'a string');
}

function number(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : bad(path, 'a number');
}

function boolean(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : bad(path, 'true or false');
}

function oneOf(value: unknown, allowed: readonly string[], path: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : bad(path, `one of ${allowed.join(', ')}`);
}

/** Every link on the page points to GitHub; refuse anything else (for example a javascript: URL). */
function githubUrl(value: unknown, path: string): string {
  return typeof value === 'string' && value.startsWith('https://github.com/') ? value : bad(path, 'a https://github.com/ URL');
}

function timestamp(value: unknown, path: string): string {
  const text = string(value, path);
  return Number.isNaN(new Date(text).getTime()) ? bad(path, 'an ISO date') : text;
}

function each<T>(value: unknown, path: string, check: (item: Json, itemPath: string) => T): T[] {
  return array(value, path).map((item, index) => {
    const itemPath = `${path}[${String(index)}]`;
    return check(object(item, itemPath), itemPath);
  });
}

function alerts(value: unknown, path: string): void {
  each(value, path, (alert, alertPath) => {
    number(alert.number, `${alertPath}.number`);
    githubUrl(alert.url, `${alertPath}.url`);
  });
}

function scanBlock(value: unknown, path: string, withMalware = false): void {
  const block = object(value, path);
  oneOf(block.status, SCAN_STATUSES, `${path}.status`);
  string(block.message, `${path}.message`);
  githubUrl(block.url, `${path}.url`);
  alerts(block.alerts, `${path}.alerts`);
  if (withMalware) {
    alerts(block.malware_alerts, `${path}.malware_alerts`);
  }
}

function checkRepo(repo: Json, path: string): void {
  for (const key of ['name', 'full_name', 'default_branch']) {
    string(repo[key], `${path}.${key}`);
  }
  githubUrl(repo.html_url, `${path}.html_url`);
  for (const key of ['private', 'fork', 'archived']) {
    boolean(repo[key], `${path}.${key}`);
  }
  const branches = object(repo.branches, `${path}.branches`);
  if (branches.count !== null) {
    number(branches.count, `${path}.branches.count`);
  }
  githubUrl(branches.url, `${path}.branches.url`);
  array(repo.collection_errors, `${path}.collection_errors`).forEach((target, index) => {
    oneOf(target, COLLECTION_TARGETS, `${path}.collection_errors[${String(index)}]`);
  });
  each(repo.open_prs, `${path}.open_prs`, (pr, prPath) => {
    number(pr.number, `${prPath}.number`);
    string(pr.title, `${prPath}.title`);
    boolean(pr.draft, `${prPath}.draft`);
    githubUrl(pr.url, `${prPath}.url`);
  });
  each(repo.open_issues, `${path}.open_issues`, (issue, issuePath) => {
    number(issue.number, `${issuePath}.number`);
    string(issue.title, `${issuePath}.title`);
    githubUrl(issue.url, `${issuePath}.url`);
  });
  each(repo.failed_workflows, `${path}.failed_workflows`, (run, runPath) => {
    string(run.workflow, `${runPath}.workflow`);
    string(run.branch, `${runPath}.branch`);
    oneOf(run.conclusion, FAILED_CONCLUSIONS, `${runPath}.conclusion`);
    timestamp(run.created_at, `${runPath}.created_at`);
    githubUrl(run.url, `${runPath}.url`);
  });
  scanBlock(repo.dependabot, `${path}.dependabot`, true);
  scanBlock(repo.code_scanning, `${path}.code_scanning`);
  scanBlock(repo.secret_scanning, `${path}.secret_scanning`);
}

/** Validate the parsed JSON of `data.json` and return it typed. Throws a descriptive Error. */
export function parseReport(value: unknown): Report {
  const report = object(value, 'the report');
  if (report.schema_version === undefined) {
    throw new Error('data.json was written by an older collector (no schema_version). Re-run the "Repo report" workflow.');
  }
  if (report.schema_version !== 1) {
    throw new Error(`data.json has schema_version ${JSON.stringify(report.schema_version)}, but this page understands version 1.`);
  }
  boolean(report.alert_details, 'alert_details');
  timestamp(report.generated_at, 'generated_at');
  each(report.repos, 'repos', checkRepo);
  return report as unknown as Report;
}
