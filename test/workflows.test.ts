import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = (name: string): string => readFileSync(resolve(import.meta.dirname, '../.github/workflows', name), 'utf8');

describe('report workflow', () => {
  const report = workflow('report.yml');

  it('never publishes private repositories to the public Pages site', () => {
    expect(report).toMatch(/^\s+INCLUDE_PRIVATE: "false"$/m);
  });

  it('publishes alert counts only, not alert details', () => {
    expect(report).toMatch(/^\s+ALERT_DETAILS: "false"$/m);
  });

  it('reads the exclude list from a secret, so names appear neither in the source nor in public logs', () => {
    expect(report).toContain('EXCLUDE_REPOS: ${{ secrets.EXCLUDE_REPOS }}');
    expect(report).not.toContain('vars.EXCLUDE_REPOS');
  });

  it('writes the collected data next to the built page and publishes that folder', () => {
    expect(report).toContain('bash gh-repo-report.sh dist/data.json');
    expect(report).toMatch(/upload-pages-artifact@v\d+\n\s+with:\n\s+path: dist/);
  });
});

describe('CI workflow', () => {
  it('feeds Lighthouse the synthetic sample, never real report output', () => {
    expect(workflow('ci.yml')).toContain('cp test/fixtures/data.json dist/data.json');
  });
});
