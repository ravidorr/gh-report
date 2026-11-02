import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Repo } from '../src/types.js';

/** Raw text of the synthetic sample report (also used by Lighthouse in CI). */
export function readSample(): string {
  return readFileSync(resolve(import.meta.dirname, 'fixtures/data.json'), 'utf8');
}

/** A healthy repo with every feature enabled and nothing open. Names are synthetic on purpose. */
export function makeRepo(name: string, overrides: Partial<Repo> = {}): Repo {
  const url = `https://github.com/example-owner/${name}`;
  return {
    name,
    full_name: `example-owner/${name}`,
    html_url: url,
    private: false,
    fork: false,
    archived: false,
    default_branch: 'main',
    branches: { count: 1, url: `${url}/branches` },
    open_prs: [],
    open_issues: [],
    failed_workflows: [],
    dependabot: { status: 'ok', message: '', malware_alerts: [], alerts: [], url: `${url}/security/dependabot` },
    code_scanning: { status: 'ok', message: '', alerts: [], url: `${url}/security/code-scanning` },
    secret_scanning: { status: 'ok', message: '', alerts: [], url: `${url}/security/secret-scanning` },
    ...overrides,
  };
}

/** Page skeleton with the ids the dashboard renders into. */
export const PAGE_HTML = `
  <p id="lede"></p>
  <div id="content" hidden>
    <div id="tiles"></div>
    <table id="repos"></table>
    <table id="prs"></table>
    <table id="issues"></table>
    <table id="failed"></table>
  </div>`;
