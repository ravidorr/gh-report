import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  steps?: Step[];
  'timeout-minutes'?: number;
}
interface Workflow {
  permissions?: Record<string, string>;
  concurrency?: { 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
}

const read = (path: string): string => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');
const workflow = (name: string): Workflow => parse(read(`.github/workflows/${name}`)) as Workflow;
const steps = (job: Job): Step[] => job.steps ?? [];
function jobOf(wf: Workflow, name: string): Job {
  const found = wf.jobs[name];
  if (!found) {
    throw new Error(`Missing job ${name}`);
  }
  return found;
}

describe('report workflow', () => {
  const report = workflow('report.yml');
  const build = jobOf(report, 'build');
  const collect = steps(build).find((step) => step.run?.includes('gh-repo-report.sh'));

  it('never publishes private repositories, alert details, or forks to the public Pages site', () => {
    expect(collect?.env).toMatchObject({ INCLUDE_PRIVATE: 'false', ALERT_DETAILS: 'false', INCLUDE_FORKS: 'false', INCLUDE_ARCHIVED: 'false' });
  });

  it('reads the exclude list from a secret, so names appear neither in the source nor in public logs', () => {
    expect(collect?.env?.EXCLUDE_REPOS).toBe('${{ secrets.EXCLUDE_REPOS }}');
    expect(read('.github/workflows/report.yml')).not.toContain('vars.');
  });

  it('exposes the token to the collect step only, not to the job, install, or build', () => {
    expect(build.env).toBeUndefined();
    const holders = steps(build).filter((step) => step.env && 'GH_TOKEN' in step.env);

    expect(holders).toEqual([collect]);
    expect(collect?.env?.GH_TOKEN).toBe('${{ secrets.REPORT_TOKEN }}');
    expect(JSON.stringify(report.jobs.deploy)).not.toContain('REPORT_TOKEN');
  });

  it('builds, collects, verifies, then publishes the dist folder, in that order', () => {
    const order = steps(build).map((step) => step.run ?? step.uses ?? '');
    const at = (needle: string): number => order.findIndex((entry) => entry.includes(needle));

    expect(at('npm run build')).toBeLessThan(at('gh-repo-report.sh dist/data.json'));
    expect(at('gh-repo-report.sh dist/data.json')).toBeLessThan(at('verify-report.mjs dist/data.json'));
    expect(at('verify-report.mjs dist/data.json')).toBeLessThan(at('upload-pages-artifact'));
    expect(steps(build).find((step) => step.uses?.startsWith('actions/upload-pages-artifact'))).toMatchObject({ with: { path: 'dist' } });
  });

  it('does not cancel a run in progress and has timeouts, so failures are never silent or endless', () => {
    expect(report.concurrency?.['cancel-in-progress']).toBe(false);
    expect(build['timeout-minutes']).toBeGreaterThan(0);
    expect(report.jobs.deploy?.['timeout-minutes']).toBeGreaterThan(0);
  });
});

describe('CI workflow', () => {
  const ci = workflow('ci.yml');

  it('feeds Lighthouse the synthetic sample, never real report output', () => {
    expect(JSON.stringify(ci.jobs.lighthouse)).toContain('cp test/fixtures/data.json dist/data.json');
  });

  it('grants pull-request write access to the quality job only', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
    expect(ci.jobs.quality?.permissions).toMatchObject({ 'pull-requests': 'write' });
    expect(ci.jobs.lighthouse?.permissions).toBeUndefined();
  });

  it('runs the release gate with the same trigger paths as the pre-push hook', () => {
    const gate = steps(jobOf(ci, 'quality')).find((step) => step.run?.includes('check-release.mjs'));
    const paths = gate?.env?.RELEASE_TRIGGER_PATHS ?? '';

    expect(paths).toContain('gh-repo-report.sh');
    expect(read('.husky/pre-push')).toContain(`RELEASE_TRIGGER_PATHS=${paths} `);
  });
});
