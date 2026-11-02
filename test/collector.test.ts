import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Report } from '../src/types.js';

const SCRIPT = resolve(import.meta.dirname, '../gh-repo-report.sh');

// A fake `gh` that serves canned responses from files and applies --jq with the real jq.
// A `<endpoint>.err` file makes that endpoint fail with the file's text on stderr.
const GH_STUB = `#!/usr/bin/env bash
shift
path="$1"; shift
jqf=""
while [ $# -gt 0 ]; do
  case "$1" in --jq) jqf="$2"; shift 2 ;; *) shift ;; esac
done
echo "$path" >> "$FIXTURES/calls.log"
key="\${path%%\\?*}"; key="\${key//\\//_}"
if [ -f "$FIXTURES/$key.err" ]; then cat "$FIXTURES/$key.err" >&2; exit 1; fi
if [ ! -f "$FIXTURES/$key.json" ]; then echo "Not Found" >&2; exit 1; fi
if [ -n "$jqf" ]; then jq -rc "$jqf" "$FIXTURES/$key.json"; else cat "$FIXTURES/$key.json"; fi
`;

interface ListedRepo {
  name: string;
  private?: boolean;
  fork?: boolean;
  archived?: boolean;
}

let dir: string;
let fixtures: string;

function put(endpoint: string, body: unknown): void {
  writeFileSync(join(fixtures, `${endpoint.replaceAll('/', '_')}.json`), JSON.stringify(body));
}

function fail(endpoint: string, message: string): void {
  writeFileSync(join(fixtures, `${endpoint.replaceAll('/', '_')}.err`), message);
}

/** Register the repo list plus empty, healthy responses for every repo. */
function setRepos(repos: ListedRepo[]): void {
  put('user', { login: 'example-owner' });
  put(
    'user/repos',
    repos.map((r) => ({
      name: r.name,
      full_name: `example-owner/${r.name}`,
      html_url: `https://github.com/example-owner/${r.name}`,
      private: r.private ?? false,
      fork: r.fork ?? false,
      archived: r.archived ?? false,
      default_branch: 'main',
      extra_field_that_must_not_leak: 'x',
    })),
  );
  for (const { name } of repos) {
    const base = `repos/example-owner/${name}`;
    put(`${base}/branches`, [{ name: 'main' }]);
    put(`${base}/pulls`, []);
    put(`${base}/issues`, []);
    put(`${base}/actions/runs`, { workflow_runs: [] });
    put(`${base}/dependabot/alerts`, []);
    put(`${base}/code-scanning/alerts`, []);
    put(`${base}/secret-scanning/alerts`, []);
  }
}

function run(env: Record<string, string> = {}, args: string[] = ['out.json']): { status: number | null; stderr: string } {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`, FIXTURES: fixtures, ...env },
  });
  return { status: result.status, stderr: result.stderr };
}

function report(file = 'out.json'): Report {
  return JSON.parse(readFileSync(join(dir, file), 'utf8')) as Report;
}

const names = (r: Report): string[] => r.repos.map((repo) => repo.name).sort();
const calls = (): string => readFileSync(join(fixtures, 'calls.log'), 'utf8');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gh-report-'));
  fixtures = join(dir, 'fixtures');
  mkdirSync(fixtures);
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'gh'), GH_STUB);
  chmodSync(join(dir, 'bin', 'gh'), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('repository filters', () => {
  const listed: ListedRepo[] = [
    { name: 'pub' },
    { name: 'hidden', private: true },
    { name: 'forked', fork: true },
    { name: 'old', archived: true },
    { name: 'noisy' },
  ];

  it('by default includes private repos and skips forks and archived repos', () => {
    setRepos(listed);

    expect(run().status).toBe(0);
    expect(names(report())).toEqual(['hidden', 'noisy', 'pub']);
  });

  it('INCLUDE_PRIVATE=false drops private repos and never queries them', () => {
    setRepos(listed);

    expect(run({ INCLUDE_PRIVATE: 'false' }).status).toBe(0);
    expect(names(report())).toEqual(['noisy', 'pub']);
    expect(calls()).not.toContain('example-owner/hidden');
    expect(readFileSync(join(dir, 'out.json'), 'utf8')).not.toContain('hidden');
  });

  it('INCLUDE_FORKS and INCLUDE_ARCHIVED opt those repos back in', () => {
    setRepos(listed);

    run({ INCLUDE_FORKS: 'true', INCLUDE_ARCHIVED: 'true' });

    expect(names(report())).toEqual(['forked', 'hidden', 'noisy', 'old', 'pub']);
  });

  it.each([
    ['commas', 'noisy,old'],
    ['spaces', 'noisy old'],
    ['both', ' noisy, old '],
  ])('EXCLUDE_REPOS accepts names separated by %s', (_label, value) => {
    setRepos(listed);

    run({ EXCLUDE_REPOS: value, INCLUDE_ARCHIVED: 'true' });

    expect(names(report())).toEqual(['hidden', 'pub']);
  });

  it('keeps only whitelisted fields of each repo', () => {
    setRepos([{ name: 'pub' }]);

    run();

    expect(report().repos[0]).not.toHaveProperty('extra_field_that_must_not_leak');
  });
});

describe('report contents', () => {
  it('writes generated_at, counts, pull requests, and issues without pull-request rows', () => {
    setRepos([{ name: 'pub' }]);
    const base = 'repos/example-owner/pub';
    put(`${base}/branches`, [{ name: 'main' }, { name: 'dev' }]);
    put(`${base}/pulls`, [{ number: 3, title: 'A PR', html_url: 'https://x/pull/3', draft: true, body: 'dropped' }]);
    put(`${base}/issues`, [
      { number: 1, title: 'Real issue', html_url: 'https://x/issues/1' },
      { number: 3, title: 'A PR', html_url: 'https://x/pull/3', pull_request: {} },
    ]);

    run();
    const [repo] = report().repos;

    expect(report().generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(repo?.branches).toEqual({ count: 2, url: 'https://github.com/example-owner/pub/branches' });
    expect(repo?.open_prs).toEqual([{ number: 3, title: 'A PR', url: 'https://x/pull/3', draft: true }]);
    expect(repo?.open_issues).toEqual([{ number: 1, title: 'Real issue', url: 'https://x/issues/1' }]);
  });

  it('defaults the output path to gh-repo-report.json in the working directory', () => {
    setRepos([{ name: 'pub' }]);

    expect(run({}, []).status).toBe(0);
    expect(names(report('gh-repo-report.json'))).toEqual(['pub']);
  });

  it('keeps only the latest run per workflow, ignores Dependabot update jobs, and lets a later success clear a failure', () => {
    setRepos([{ name: 'pub' }]);
    const run_ = (id: number, workflow_id: number, conclusion: string, created_at: string, path: string): object => ({
      id,
      workflow_id,
      name: `wf${String(workflow_id)}`,
      conclusion,
      head_branch: 'main',
      created_at,
      path,
      html_url: `https://x/runs/${String(id)}`,
    });
    put('repos/example-owner/pub/actions/runs', {
      workflow_runs: [
        run_(1, 1, 'failure', '2026-01-01T00:00:00Z', '.github/workflows/ci.yml@refs/heads/main'),
        run_(2, 1, 'success', '2026-01-02T00:00:00Z', '.github/workflows/ci.yml@refs/heads/main'),
        run_(3, 2, 'success', '2026-01-01T00:00:00Z', '.github/workflows/pages.yml'),
        run_(4, 2, 'timed_out', '2026-01-03T00:00:00Z', '.github/workflows/pages.yml'),
        run_(5, 3, 'failure', '2026-01-04T00:00:00Z', 'dynamic/dependabot/dependabot-updates'),
        run_(6, 4, 'cancelled', '2026-01-05T00:00:00Z', '.github/workflows/lint.yml'),
        run_(7, 5, 'failure', '2026-01-06T00:00:00Z', '.github/workflows/build.yml'),
      ],
    });

    run();

    expect(report().repos[0]?.failed_workflows).toEqual([
      { workflow: 'wf2', conclusion: 'timed_out', branch: 'main', created_at: '2026-01-03T00:00:00Z', path: '.github/workflows/pages.yml', url: 'https://x/runs/4' },
      { workflow: 'wf5', conclusion: 'failure', branch: 'main', created_at: '2026-01-06T00:00:00Z', path: '.github/workflows/build.yml', url: 'https://x/runs/7' },
    ]);
  });

  it('treats a failing workflow-runs endpoint as no failures', () => {
    setRepos([{ name: 'pub' }]);
    fail('repos/example-owner/pub/actions/runs', 'boom');

    expect(run().status).toBe(0);
    expect(report().repos[0]?.failed_workflows).toEqual([]);
  });

  it('survives failing branch, pull request, and issue endpoints', () => {
    setRepos([{ name: 'pub' }]);
    for (const endpoint of ['branches', 'pulls', 'issues']) {
      fail(`repos/example-owner/pub/${endpoint}`, 'boom');
    }

    const result = run();
    const [repo] = report().repos;

    expect(result.status).toBe(0);
    expect(repo?.branches.count).toBeNull();
    expect(repo?.open_prs).toEqual([]);
    expect(repo?.open_issues).toEqual([]);
  });
});

describe('security alerts', () => {
  it('maps Dependabot, code scanning, and secret scanning alerts and flags malware', () => {
    setRepos([{ name: 'pub' }]);
    const base = 'repos/example-owner/pub';
    const advisory = (classification: string): object => ({ severity: 'high', classification, summary: 'Advisory' });
    put(`${base}/dependabot/alerts`, [
      { number: 1, html_url: 'https://x/d/1', dependency: { package: { name: 'lib', ecosystem: 'npm' }, scope: 'runtime' }, security_advisory: advisory('general') },
      { number: 2, html_url: 'https://x/d/2', dependency: { package: { name: 'evil', ecosystem: 'npm' }, scope: 'runtime' }, security_advisory: advisory('malware') },
    ]);
    put(`${base}/code-scanning/alerts`, [
      { number: 7, html_url: 'https://x/c/7', rule: { id: 'js/x', security_severity_level: 'critical', description: 'Bad' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/a.ts' } } },
      { number: 8, html_url: 'https://x/c/8', rule: { id: 'js/y', severity: 'warning', name: 'Name only' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/b.ts' } } },
    ]);
    put(`${base}/secret-scanning/alerts`, [
      { number: 9, html_url: 'https://x/s/9', secret_type: 'token', secret_type_display_name: 'Example Token', validity: 'active', created_at: '2026-01-01T00:00:00Z', secret: 'must-never-be-stored' },
    ]);

    run();
    const [repo] = report().repos;

    expect(repo?.dependabot.status).toBe('ok');
    expect(repo?.dependabot.alerts.map((a) => [a.package, a.classification])).toEqual([
      ['lib', 'general'],
      ['evil', 'malware'],
    ]);
    expect(repo?.dependabot.malware_alerts).toEqual([{ number: 2, package: 'evil', ecosystem: 'npm', summary: 'Advisory', url: 'https://x/d/2' }]);
    expect(repo?.code_scanning.alerts.map((a) => [a.rule, a.severity, a.summary])).toEqual([
      ['js/x', 'critical', 'Bad'],
      ['js/y', 'warning', 'Name only'],
    ]);
    expect(repo?.secret_scanning.alerts).toEqual([
      { number: 9, secret_type: 'Example Token', validity: 'active', created_at: '2026-01-01T00:00:00Z', url: 'https://x/s/9' },
    ]);
    expect(readFileSync(join(dir, 'out.json'), 'utf8')).not.toContain('must-never-be-stored');
  });

  it('ALERT_DETAILS=false keeps only the number and url of each alert', () => {
    setRepos([{ name: 'pub' }]);
    const base = 'repos/example-owner/pub';
    put(`${base}/dependabot/alerts`, [
      { number: 2, html_url: 'https://x/d/2', dependency: { package: { name: 'evil', ecosystem: 'npm' }, scope: 'runtime' }, security_advisory: { severity: 'high', classification: 'malware', summary: 'Advisory' } },
    ]);
    put(`${base}/code-scanning/alerts`, [
      { number: 7, html_url: 'https://x/c/7', rule: { id: 'js/x', description: 'Bad' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/a.ts' } } },
    ]);
    put(`${base}/secret-scanning/alerts`, [{ number: 9, html_url: 'https://x/s/9', secret_type_display_name: 'Example Token', created_at: '2026-01-01T00:00:00Z' }]);

    run({ ALERT_DETAILS: 'false' });
    const [repo] = report().repos;

    expect(repo?.dependabot.alerts).toEqual([{ number: 2, url: 'https://x/d/2' }]);
    expect(repo?.dependabot.malware_alerts).toEqual([{ number: 2, url: 'https://x/d/2' }]);
    expect(repo?.code_scanning.alerts).toEqual([{ number: 7, url: 'https://x/c/7' }]);
    expect(repo?.secret_scanning.alerts).toEqual([{ number: 9, url: 'https://x/s/9' }]);
    expect(readFileSync(join(dir, 'out.json'), 'utf8')).not.toMatch(/evil|src\/a\.ts|Example Token/);
  });

  it.each([
    ['Dependabot alerts are disabled for this repository.', 'disabled'],
    ['Resource not accessible by integration (HTTP 403)', 'no_permission'],
    ['Bad credentials', 'no_permission'],
    ['HTTP 500: server error', 'error'],
  ])('classifies the Dependabot failure "%s" as %s', (message, status) => {
    setRepos([{ name: 'pub' }]);
    fail('repos/example-owner/pub/dependabot/alerts', message);

    run();
    const dependabot = report().repos[0]?.dependabot;

    expect(dependabot?.status).toBe(status);
    expect(dependabot?.message).toContain(message);
    expect(dependabot?.alerts).toEqual([]);
    expect(dependabot?.malware_alerts).toEqual([]);
  });

  it.each([
    ['no analysis found', 'disabled'],
    ['Advanced Security must be enabled for this repository to use code scanning.', 'disabled'],
    ['Resource not accessible by integration (HTTP 403)', 'no_permission'],
    ['HTTP 500', 'error'],
  ])('classifies the code scanning failure "%s" as %s', (message, status) => {
    setRepos([{ name: 'pub' }]);
    fail('repos/example-owner/pub/code-scanning/alerts', message);

    run();

    expect(report().repos[0]?.code_scanning.status).toBe(status);
  });

  it.each([
    ['Secret scanning is disabled on this repository.', 'disabled'],
    ['HTTP 404: Not Found', 'no_permission'],
    ['HTTP 500', 'error'],
  ])('classifies the secret scanning failure "%s" as %s', (message, status) => {
    setRepos([{ name: 'pub' }]);
    fail('repos/example-owner/pub/secret-scanning/alerts', message);

    run();

    expect(report().repos[0]?.secret_scanning.status).toBe(status);
  });
});
