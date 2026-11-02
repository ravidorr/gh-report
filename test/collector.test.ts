import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Report } from '../src/types.js';

const SCRIPT = resolve(import.meta.dirname, '../gh-repo-report.sh');
const STUB = resolve(import.meta.dirname, 'support/gh-stub.sh');

interface ListedRepo {
  name: string;
  private?: boolean;
  fork?: boolean;
  archived?: boolean;
  defaultBranch?: string;
}

const BASE = 'repos/example-owner/pub';

let dir: string;
let fixtures: string;

const fileFor = (endpoint: string, extension: string): string => join(fixtures, `${endpoint.replaceAll('/', '_')}.${extension}`);

function put(endpoint: string, body: unknown): void {
  writeFileSync(fileFor(endpoint, 'json'), JSON.stringify(body));
}

/** Several concatenated JSON documents, like the pages `gh api --paginate` prints. */
function putPages(endpoint: string, ...pages: unknown[]): void {
  writeFileSync(fileFor(endpoint, 'json'), pages.map((page) => JSON.stringify(page)).join('\n'));
}

function fail(endpoint: string, message: string, body?: unknown): void {
  writeFileSync(fileFor(endpoint, 'err'), message);
  if (body !== undefined) {
    writeFileSync(fileFor(endpoint, 'out'), JSON.stringify(body));
  }
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
      default_branch: r.defaultBranch ?? 'main',
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
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`, FIXTURES: fixtures, RETRY_DELAY: '0', ...env },
  });
  return { status: result.status, stderr: result.stderr };
}

const raw = (file = 'out.json'): string => readFileSync(join(dir, file), 'utf8');
const report = (file = 'out.json'): Report => JSON.parse(raw(file)) as Report;
const names = (r: Report): string[] => r.repos.map((repo) => repo.name).sort();
const calls = (): string => readFileSync(join(fixtures, 'calls.log'), 'utf8');
const firstRepo = (): Report['repos'][number] => {
  const [repo] = report().repos;
  if (!repo) {
    throw new Error('the report has no repos');
  }
  return repo;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gh-report-'));
  fixtures = join(dir, 'fixtures');
  mkdirSync(fixtures);
  mkdirSync(join(dir, 'bin'));
  copyFileSync(STUB, join(dir, 'bin', 'gh'));
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
    expect(raw()).not.toContain('hidden');
  });

  it.each(['', 'False', '0', 'no'])('fails closed: INCLUDE_PRIVATE=%j drops private repos', (value) => {
    setRepos(listed);

    run({ INCLUDE_PRIVATE: value });

    expect(names(report())).toEqual(['noisy', 'pub']);
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
    ['newlines', 'noisy\nold'],
  ])('EXCLUDE_REPOS accepts names separated by %s', (_label, value) => {
    setRepos(listed);

    run({ EXCLUDE_REPOS: value, INCLUDE_ARCHIVED: 'true' });

    expect(names(report())).toEqual(['hidden', 'pub']);
  });

  it('EXCLUDE_REPOS matches whole names only, and is case-sensitive', () => {
    setRepos([{ name: 'noisy' }, { name: 'noisy-two' }, { name: 'Pub' }]);

    run({ EXCLUDE_REPOS: 'noisy pub' });

    expect(names(report())).toEqual(['Pub', 'noisy-two']);
  });

  it.each(['', '   ', ' , '])('an empty or blank EXCLUDE_REPOS (%j) excludes nothing', (value) => {
    setRepos([{ name: 'pub' }]);

    run({ EXCLUDE_REPOS: value });

    expect(names(report())).toEqual(['pub']);
  });

  it('keeps only whitelisted fields of each repo', () => {
    setRepos([{ name: 'pub' }]);

    run();

    expect(firstRepo()).not.toHaveProperty('extra_field_that_must_not_leak');
  });

  it('writes a valid empty report, with a warning, when no repo is left', () => {
    setRepos([{ name: 'pub', private: true }]);

    const result = run({ INCLUDE_PRIVATE: 'false' });

    expect(result.status).toBe(0);
    expect(report().repos).toEqual([]);
    expect(result.stderr).toContain('no repositories matched the filters');
  });

  it('writes a valid empty report when the account has no repos at all', () => {
    setRepos([]);

    expect(run().status).toBe(0);
    expect(report().repos).toEqual([]);
  });

  it('aborts, writing nothing, when the repo list cannot be read (bad token)', () => {
    setRepos([{ name: 'pub' }]);
    fail('user/repos', 'gh: Bad credentials (HTTP 401)');

    expect(run().status).not.toBe(0);
    expect(() => raw()).toThrow();
  });
});

describe('report contents', () => {
  it('writes the schema version, whether alert details are included, and a timestamp', () => {
    setRepos([{ name: 'pub' }]);

    run();

    expect(report()).toMatchObject({ schema_version: 1, alert_details: true });
    expect(report().generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('writes counts, pull requests, and issues without pull-request rows', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/branches`, [{ name: 'main' }, { name: 'dev' }]);
    put(`${BASE}/pulls`, [{ number: 3, title: 'A PR', html_url: 'https://x/pull/3', draft: true, body: 'dropped' }]);
    put(`${BASE}/issues`, [
      { number: 1, title: 'Real issue', html_url: 'https://x/issues/1' },
      { number: 3, title: 'A PR', html_url: 'https://x/pull/3', pull_request: {} },
    ]);

    run();
    const repo = firstRepo();

    expect(repo.branches).toEqual({ count: 2, url: 'https://github.com/example-owner/pub/branches' });
    expect(repo.open_prs).toEqual([{ number: 3, title: 'A PR', url: 'https://x/pull/3', draft: true }]);
    expect(repo.open_issues).toEqual([{ number: 1, title: 'Real issue', url: 'https://x/issues/1' }]);
    expect(repo.collection_errors).toEqual([]);
  });

  it('defaults the output path to gh-repo-report.json in the working directory', () => {
    setRepos([{ name: 'pub' }]);

    expect(run({}, []).status).toBe(0);
    expect(names(report('gh-repo-report.json'))).toEqual(['pub']);
  });

  it('asks every endpoint for open items, 100 at a time, following pages', () => {
    setRepos([{ name: 'pub' }]);

    run();
    const log = calls();

    for (const endpoint of ['branches', 'pulls', 'issues', 'actions/runs', 'dependabot/alerts', 'code-scanning/alerts', 'secret-scanning/alerts']) {
      expect(log).toContain(`${BASE}/${endpoint}`);
    }
    for (const endpoint of ['pulls', 'issues', 'dependabot/alerts', 'code-scanning/alerts', 'secret-scanning/alerts']) {
      expect(log).toMatch(new RegExp(`${BASE}/${endpoint}\\?state=open&per_page=100 --paginate`));
    }
    expect(log).toMatch(new RegExp(`${BASE}/branches\\?per_page=100 --paginate`));
  });

  it('collects every page of branches, pull requests, issues, and alerts', () => {
    setRepos([{ name: 'pub' }]);
    putPages(`${BASE}/branches`, [{ name: 'a' }, { name: 'b' }], [{ name: 'c' }]);
    putPages(`${BASE}/pulls`, [{ number: 1, title: 'one', html_url: 'u1', draft: false }], [{ number: 2, title: 'two', html_url: 'u2', draft: false }]);
    putPages(`${BASE}/issues`, [{ number: 5, title: 'five', html_url: 'u5' }], [{ number: 6, title: 'six', html_url: 'u6' }]);
    const alert = (number: number): object => ({ number, html_url: `https://x/${String(number)}`, dependency: { package: { name: 'p', ecosystem: 'npm' } }, security_advisory: {} });
    putPages(`${BASE}/dependabot/alerts`, [alert(1)], [alert(2), alert(3)]);
    putPages(`${BASE}/code-scanning/alerts`, [{ number: 1, html_url: 'c1', rule: {}, tool: {} }], [{ number: 2, html_url: 'c2', rule: {}, tool: {} }]);
    putPages(`${BASE}/secret-scanning/alerts`, [{ number: 1, html_url: 's1' }], [{ number: 2, html_url: 's2' }]);

    run();
    const repo = firstRepo();

    expect(repo.branches.count).toBe(3);
    expect(repo.open_prs.map((p) => p.number)).toEqual([1, 2]);
    expect(repo.open_issues.map((i) => i.number)).toEqual([5, 6]);
    expect(repo.dependabot.alerts.map((a) => a.number)).toEqual([1, 2, 3]);
    expect(repo.code_scanning.alerts).toHaveLength(2);
    expect(repo.secret_scanning.alerts).toHaveLength(2);
  });

  it('treats a 200 response that is not an array as no alerts', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/dependabot/alerts`, {});
    put(`${BASE}/code-scanning/alerts`, null);

    expect(run().status).toBe(0);
    expect(firstRepo().dependabot).toMatchObject({ status: 'ok', alerts: [] });
    expect(firstRepo().code_scanning).toMatchObject({ status: 'ok', alerts: [] });
  });

  it('keeps null fields as null when GitHub omits them', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/dependabot/alerts`, [{ number: 1, html_url: 'https://x/1', security_advisory: {} }]);
    put(`${BASE}/code-scanning/alerts`, [{ number: 2, html_url: 'https://x/2', rule: {}, tool: {} }]);

    expect(run().status).toBe(0);
    expect(firstRepo().dependabot.alerts[0]).toMatchObject({ number: 1, package: null, severity: null });
    expect(firstRepo().code_scanning.alerts[0]).toMatchObject({ number: 2, path: null, summary: null });
  });
});

describe('failed workflows', () => {
  const runRecord = (id: number, workflowId: number, conclusion: string | null, createdAt: string, path = `.github/workflows/w${String(workflowId)}.yml`): object => ({
    id,
    workflow_id: workflowId,
    name: `wf${String(workflowId)}`,
    conclusion,
    head_branch: 'main',
    created_at: createdAt,
    path,
    html_url: `https://x/runs/${String(id)}`,
  });

  it('keeps the latest run per workflow, ignores Dependabot updates, and lets a later success clear a failure', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/actions/runs`, {
      workflow_runs: [
        runRecord(1, 1, 'failure', '2026-01-01T00:00:00Z', '.github/workflows/ci.yml@refs/heads/main'),
        runRecord(2, 1, 'success', '2026-01-02T00:00:00Z', '.github/workflows/ci.yml@refs/heads/main'),
        runRecord(3, 2, 'success', '2026-01-01T00:00:00Z'),
        runRecord(4, 2, 'timed_out', '2026-01-03T00:00:00Z'),
        runRecord(5, 3, 'failure', '2026-01-04T00:00:00Z', 'dynamic/dependabot/dependabot-updates'),
        runRecord(7, 5, 'failure', '2026-01-06T00:00:00Z'),
      ],
    });

    run();

    expect(firstRepo().failed_workflows).toEqual([
      { workflow: 'wf2', conclusion: 'timed_out', branch: 'main', created_at: '2026-01-03T00:00:00Z', path: '.github/workflows/w2.yml', url: 'https://x/runs/4' },
      { workflow: 'wf5', conclusion: 'failure', branch: 'main', created_at: '2026-01-06T00:00:00Z', path: '.github/workflows/w5.yml', url: 'https://x/runs/7' },
    ]);
  });

  it('does not let a cancelled, skipped, or unfinished run hide an earlier failure', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/actions/runs`, {
      workflow_runs: [
        runRecord(1, 1, 'failure', '2026-01-01T00:00:00Z'),
        runRecord(2, 1, 'cancelled', '2026-01-02T00:00:00Z'),
        runRecord(3, 1, 'skipped', '2026-01-03T00:00:00Z'),
        runRecord(4, 1, null, '2026-01-04T00:00:00Z'),
        runRecord(5, 4, 'cancelled', '2026-01-05T00:00:00Z'),
      ],
    });

    run();

    expect(firstRepo().failed_workflows.map((f) => f.workflow)).toEqual(['wf1']);
  });

  it('only looks at completed runs on the default branch, not pull requests, and encodes the branch name', () => {
    setRepos([{ name: 'pub', defaultBranch: 'release/1.0' }]);

    run();

    expect(calls()).toContain(`${BASE}/actions/runs?per_page=100&status=completed&exclude_pull_requests=true&branch=release%2F1.0`);
  });

  it('warns when more runs exist than the one page that was read', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/actions/runs`, { total_count: 250, workflow_runs: [runRecord(1, 1, 'success', '2026-01-01T00:00:00Z')] });

    expect(run().stderr).toContain('more than 100 completed runs');
  });
});

describe('failing requests', () => {
  it('records failed branch, pull request, issue, and run requests instead of reporting zero', () => {
    setRepos([{ name: 'pub' }]);
    for (const endpoint of ['branches', 'pulls', 'issues', 'actions/runs']) {
      fail(`${BASE}/${endpoint}`, 'gh: Server Error (HTTP 500)');
    }

    const result = run({ MAX_ATTEMPTS: '1' });
    const repo = firstRepo();

    expect(result.status).toBe(0);
    expect(repo.branches.count).toBeNull();
    expect(repo.open_prs).toEqual([]);
    expect(repo.open_issues).toEqual([]);
    expect(repo.failed_workflows).toEqual([]);
    expect(repo.collection_errors).toEqual(['branches', 'pulls', 'issues', 'runs']);
    expect(result.stderr).toContain('example-owner/pub: pulls request failed');
  });

  it('uses GitHub Actions annotations for warnings when running in Actions', () => {
    setRepos([{ name: 'pub' }]);
    fail(`${BASE}/pulls`, 'gh: Server Error (HTTP 500)');

    expect(run({ MAX_ATTEMPTS: '1', GITHUB_ACTIONS: 'true' }).stderr).toContain('::warning::example-owner/pub: pulls request failed');
  });

  it('drops pages received before a failure instead of producing invalid JSON', () => {
    setRepos([{ name: 'pub' }]);
    writeFileSync(fileFor(`${BASE}/pulls`, 'partial'), '{"number":1,"title":"t","url":"u","draft":false}\n');

    const result = run({ MAX_ATTEMPTS: '1' });

    expect(result.status).toBe(0);
    expect(firstRepo().open_prs).toEqual([]);
    expect(firstRepo().collection_errors).toEqual(['pulls']);
  });

  it('retries rate limits and server errors, then succeeds', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/pulls`, [{ number: 9, title: 'late', html_url: 'u', draft: false }]);
    writeFileSync(fileFor(`${BASE}/pulls`, 'flaky'), '2');

    run();

    expect(firstRepo().open_prs.map((p) => p.number)).toEqual([9]);
    expect(firstRepo().collection_errors).toEqual([]);
    expect(calls().split('\n').filter((line) => line.startsWith(`${BASE}/pulls`))).toHaveLength(3);
  });

  it('gives up after MAX_ATTEMPTS', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/pulls`, []);
    writeFileSync(fileFor(`${BASE}/pulls`, 'flaky'), '5');

    run({ MAX_ATTEMPTS: '2' });

    expect(firstRepo().collection_errors).toEqual(['pulls']);
    expect(calls().split('\n').filter((line) => line.startsWith(`${BASE}/pulls`))).toHaveLength(2);
  });

  it('does not retry permission errors', () => {
    setRepos([{ name: 'pub' }]);
    fail(`${BASE}/dependabot/alerts`, 'gh: Resource not accessible by integration (HTTP 403)');

    run();

    expect(calls().split('\n').filter((line) => line.startsWith(`${BASE}/dependabot/alerts`))).toHaveLength(1);
  });
});

describe('security alerts', () => {
  const alertEndpoints = ['dependabot/alerts', 'code-scanning/alerts', 'secret-scanning/alerts'] as const;
  const blockOf = (repo: Report['repos'][number], endpoint: (typeof alertEndpoints)[number]): { status: string; message: string; alerts: unknown[] } =>
    endpoint === 'dependabot/alerts' ? repo.dependabot : endpoint === 'code-scanning/alerts' ? repo.code_scanning : repo.secret_scanning;

  it('maps Dependabot, code scanning, and secret scanning alerts and flags malware', () => {
    setRepos([{ name: 'pub' }]);
    const advisory = (classification: string): object => ({ severity: 'high', classification, summary: 'Advisory' });
    put(`${BASE}/dependabot/alerts`, [
      { number: 1, html_url: 'https://x/d/1', dependency: { package: { name: 'lib', ecosystem: 'npm' }, scope: 'runtime' }, security_advisory: advisory('general') },
      { number: 2, html_url: 'https://x/d/2', dependency: { package: { name: 'evil', ecosystem: 'npm' }, scope: 'runtime' }, security_advisory: advisory('malware') },
    ]);
    put(`${BASE}/code-scanning/alerts`, [
      { number: 7, html_url: 'https://x/c/7', rule: { id: 'js/x', security_severity_level: 'critical', description: 'Bad' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/a.ts' } } },
      { number: 8, html_url: 'https://x/c/8', rule: { id: 'js/y', severity: 'warning', name: 'Name only' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/b.ts' } } },
    ]);
    put(`${BASE}/secret-scanning/alerts`, [
      { number: 9, html_url: 'https://x/s/9', secret_type: 'token', secret_type_display_name: 'Example Token', validity: 'active', created_at: '2026-01-01T00:00:00Z', secret: 'must-never-be-stored' },
    ]);

    run();
    const repo = firstRepo();

    expect(repo.dependabot.status).toBe('ok');
    expect(repo.dependabot.alerts.map((a) => [a.package, a.classification])).toEqual([
      ['lib', 'general'],
      ['evil', 'malware'],
    ]);
    expect(repo.dependabot.malware_alerts).toEqual([{ number: 2, package: 'evil', ecosystem: 'npm', summary: 'Advisory', url: 'https://x/d/2' }]);
    expect(repo.code_scanning.alerts.map((a) => [a.rule, a.severity, a.summary])).toEqual([
      ['js/x', 'critical', 'Bad'],
      ['js/y', 'warning', 'Name only'],
    ]);
    expect(repo.secret_scanning.alerts).toEqual([
      { number: 9, secret_type: 'Example Token', validity: 'active', created_at: '2026-01-01T00:00:00Z', url: 'https://x/s/9' },
    ]);
    expect(raw()).not.toContain('must-never-be-stored');
  });

  describe.each(alertEndpoints)('classifying a failing %s request', (endpoint) => {
    it.each([
      ['Dependabot alerts are disabled for this repository.', 'disabled'],
      ['no analysis found', 'disabled'],
      ['Advanced Security must be enabled for this repository to use code scanning.', 'disabled'],
      ['Secret scanning is not enabled on this repository.', 'disabled'],
      ['Resource not accessible by integration (HTTP 403)', 'no_permission'],
      ['Bad credentials', 'no_permission'],
      ['Must have admin rights to Repository.', 'no_permission'],
      ['Requires authentication', 'no_permission'],
      ['SAML enforcement: authorize the token', 'no_permission'],
      ['gh: Not Found (HTTP 404)', 'no_permission'],
      ['gh: API rate limit exceeded (HTTP 403)', 'error'],
      ['You have exceeded a secondary rate limit (HTTP 403)', 'error'],
      ['HTTP 429: too many requests', 'error'],
      ['HTTP 500: server error', 'error'],
      ['something unexpected', 'error'],
    ])('"%s" is %s', (message, status) => {
      setRepos([{ name: 'pub' }]);
      fail(`${BASE}/${endpoint}`, message);

      run({ MAX_ATTEMPTS: '1' });
      const block = blockOf(firstRepo(), endpoint);

      expect(block.status).toBe(status);
      expect(block.message).toContain(message);
      expect(block.alerts).toEqual([]);
    });

    it('reads the reason from the JSON error body that gh prints on stdout', () => {
      setRepos([{ name: 'pub' }]);
      fail(`${BASE}/${endpoint}`, 'gh: HTTP 403', { message: 'Dependabot alerts are disabled for this repository.' });

      run();

      expect(blockOf(firstRepo(), endpoint).status).toBe('disabled');
    });
  });
});

describe('ALERT_DETAILS=false', () => {
  it('keeps only the number and url of each alert and of each malware alert', () => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/dependabot/alerts`, [
      { number: 2, html_url: 'https://x/d/2', dependency: { package: { name: 'evil', ecosystem: 'npm' }, scope: 'runtime' }, security_advisory: { severity: 'high', classification: 'malware', summary: 'Advisory' } },
    ]);
    put(`${BASE}/code-scanning/alerts`, [
      { number: 7, html_url: 'https://x/c/7', rule: { id: 'js/x', description: 'Bad' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/a.ts' } } },
    ]);
    put(`${BASE}/secret-scanning/alerts`, [{ number: 9, html_url: 'https://x/s/9', secret_type_display_name: 'Example Token', created_at: '2026-01-01T00:00:00Z' }]);

    run({ ALERT_DETAILS: 'false' });
    const repo = firstRepo();

    expect(report().alert_details).toBe(false);
    expect(repo.dependabot.alerts).toEqual([{ number: 2, url: 'https://x/d/2' }]);
    expect(repo.dependabot.malware_alerts).toEqual([{ number: 2, url: 'https://x/d/2' }]);
    expect(repo.code_scanning.alerts).toEqual([{ number: 7, url: 'https://x/c/7' }]);
    expect(repo.secret_scanning.alerts).toEqual([{ number: 9, url: 'https://x/s/9' }]);
    expect(raw()).not.toMatch(/evil|src\/a\.ts|Example Token/);
  });

  it('also drops error text and workflow file paths from the published data', () => {
    setRepos([{ name: 'pub' }]);
    fail(`${BASE}/dependabot/alerts`, 'gh: Resource not accessible for example-owner/pub (HTTP 403)');
    put(`${BASE}/actions/runs`, {
      workflow_runs: [{ id: 1, workflow_id: 1, name: 'CI', conclusion: 'failure', head_branch: 'main', created_at: '2026-01-01T00:00:00Z', path: '.github/workflows/secret-name.yml', html_url: 'https://x/1' }],
    });

    run({ ALERT_DETAILS: 'false' });
    const repo = firstRepo();

    expect(repo.dependabot).toMatchObject({ status: 'no_permission', message: '' });
    expect(repo.failed_workflows).toEqual([{ workflow: 'CI', conclusion: 'failure', branch: 'main', created_at: '2026-01-01T00:00:00Z', url: 'https://x/1' }]);
    expect(raw()).not.toContain('secret-name');
    expect(raw()).not.toContain('not accessible');
  });

  it.each(['', 'False', '0'])('fails closed: ALERT_DETAILS=%j also hides details', (value) => {
    setRepos([{ name: 'pub' }]);
    put(`${BASE}/code-scanning/alerts`, [{ number: 7, html_url: 'https://x/c/7', rule: { id: 'js/x' }, tool: { name: 'CodeQL' }, most_recent_instance: { location: { path: 'src/a.ts' } } }]);

    run({ ALERT_DETAILS: value });

    expect(firstRepo().code_scanning.alerts).toEqual([{ number: 7, url: 'https://x/c/7' }]);
  });
});
