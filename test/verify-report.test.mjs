import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findProblems } from '../scripts/verify-report.mjs';

const SCRIPT = resolve(import.meta.dirname, '../scripts/verify-report.mjs');

const block = (status = 'ok') => ({ status, message: '', alerts: [], url: 'https://github.com/o/r' });
const repo = (name, overrides = {}) => ({
  full_name: `o/${name}`,
  collection_errors: [],
  dependabot: block(),
  code_scanning: block(),
  secret_scanning: block(),
  ...overrides,
});

describe('findProblems', () => {
  it('accepts a complete report, including features that are simply disabled', () => {
    const report = { repos: [repo('a'), repo('b', { code_scanning: block('disabled') })] };

    expect(findProblems(report)).toEqual([]);
  });

  it('rejects an empty report unless it is explicitly allowed', () => {
    expect(findProblems({ repos: [] })).toEqual([expect.stringContaining('no repositories')]);
    expect(findProblems({}, {})).toHaveLength(1);
    expect(findProblems({ repos: [] }, { ALLOW_EMPTY_REPORT: 'true' })).toEqual([]);
  });

  it('reports failed requests and API errors per repo', () => {
    const report = { repos: [repo('a', { collection_errors: ['pulls', 'runs'] }), repo('b', { secret_scanning: block('error') })] };

    expect(findProblems(report)).toEqual(['o/a: these requests failed: pulls, runs', 'o/b: the secret_scanning API returned an error']);
  });

  it('flags a token that cannot read an alert API for too many repos', () => {
    const blind = (name) => repo(name, { dependabot: block('no_permission') });

    expect(findProblems({ repos: [blind('a'), repo('b'), repo('c'), repo('d'), repo('e')] })).toEqual([]);
    expect(findProblems({ repos: [blind('a'), blind('b'), repo('c'), repo('d'), repo('e')] })).toEqual([
      '2 of 5 repos have no permission for dependabot: check the token scopes',
    ]);
  });

  it('lets the threshold be changed', () => {
    const report = { repos: [repo('a', { dependabot: block('no_permission') }), repo('b')] };

    expect(findProblems(report, { MAX_NOT_CHECKED_SHARE: '0.5' })).toEqual([]);
    expect(findProblems(report, { MAX_NOT_CHECKED_SHARE: '0.4' })).toHaveLength(1);
  });
});

describe('command line', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'verify-report-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (report, env = {}) => {
    const file = join(dir, 'data.json');
    writeFileSync(file, JSON.stringify(report));
    return spawnSync('node', [SCRIPT, file], { encoding: 'utf8', env: { ...process.env, ...env } });
  };

  it('exits 0 for a complete report', () => {
    const result = run({ repos: [repo('a')] });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('looks complete');
  });

  it('exits 1 with GitHub Actions error annotations for a problem report', () => {
    const result = run({ repos: [repo('a', { collection_errors: ['pulls'] })] });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::o/a: these requests failed: pulls');
    expect(result.stderr).toContain('not publishing');
  });
});
