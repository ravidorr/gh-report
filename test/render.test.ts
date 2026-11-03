// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { renderDashboard } from '../src/render.js';
import type { Report } from '../src/types.js';
import { PAGE_HTML, makeReport, makeRepo, must, readSample } from './helpers.js';

const NOW = Date.parse('2026-01-15T05:17:00Z');
const sample = JSON.parse(readSample()) as Report;
const GH = 'https://github.com/example-owner';

const text = (selector: string): string[] => [...document.querySelectorAll(selector)].map((n) => n.textContent);
const rows = (id: string): string[][] => [...document.querySelectorAll(`#${id} tbody tr`)].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
const hrefs = (selector: string): (string | null)[] => [...document.querySelectorAll(selector)].map((a) => a.getAttribute('href'));

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
});

describe('renderDashboard with the sample report', () => {
  beforeEach(() => {
    renderDashboard(document, sample, NOW);
  });

  it('reveals the content only after rendering', () => {
    expect(document.getElementById('content')?.hidden).toBe(false);
  });

  it('writes the lede with the repo count and generation time', () => {
    expect(document.getElementById('lede')?.textContent).toBe('3 repos. Data from Thu, 15 Jan 2026 05:17:00 GMT.');
  });

  it('renders one tile per counter, with a not-checked note where data was unreadable', () => {
    const tiles = [...document.querySelectorAll('#tiles .tile')];

    expect(tiles.map((t) => t.querySelector('.tile-label')?.textContent)).toEqual([
      'Open pull requests',
      'Open issues',
      'Failed workflows',
      'Dependabot alerts',
      'Code scanning alerts',
      'Secret scanning alerts',
    ]);
    expect(tiles.map((t) => t.querySelector('.tile-value')?.textContent)).toEqual(['2', '1', '1', '1', '1', '0']);
    expect(tiles.map((t) => t.querySelector('.tile-sub')?.textContent)).toEqual([
      'across all repos',
      'pull requests excluded',
      'latest run per workflow, 1 not checked',
      '0 malware',
      'open alerts',
      'open alerts, 1 not checked',
    ]);
    expect(tiles.map((t) => t.className)).toEqual([
      'tile ',
      'tile ',
      'tile tile-bad tile-unchecked',
      'tile tile-warn',
      'tile tile-warn',
      'tile tile-zero tile-unchecked',
    ]);
  });

  it('sorts repos by what needs attention and shows unreadable data as such', () => {
    expect(rows('repos')).toEqual([
      ['example-app', '2', '1', '1', '1', '1', '0', '3'],
      ['example-lib', '0', '0', '?', '-', '-', 'Not checked', '1'],
      ['example-site', '0', '0', '0', '0', '0', '0', '1'],
    ]);
  });

  it('lists pull requests and issues with draft markers and their own links', () => {
    expect(text('#prs tbody a')).toEqual(['example-app', '#4 Add feature (draft)', 'example-app', '#5 Fix bug']);
    expect(hrefs('#prs tbody a')).toEqual([`${GH}/example-app`, `${GH}/example-app/pull/4`, `${GH}/example-app`, `${GH}/example-app/pull/5`]);
    expect(text('#issues tbody a')).toEqual(['example-app', '#2 Crash on start']);
    expect(hrefs('#issues tbody a')).toEqual([`${GH}/example-app`, `${GH}/example-app/issues/2`]);
  });

  it('shows failed workflows with their age and a bar scaled to the oldest', () => {
    expect(rows('failed')).toEqual([['example-app', 'CI', 'main', '4 days ago (2026-01-10)']]);
    expect(document.querySelector<HTMLElement>('#failed .bar')?.style.width).toBe('100%');
  });
});

describe('renderDashboard links and tones', () => {
  const busy = makeRepo('busy', {
    branches: { count: 7, url: `${GH}/busy/branches` },
    open_prs: [{ number: 1, title: 't', url: `${GH}/busy/pull/1`, draft: false }],
    open_issues: [{ number: 2, title: 't', url: `${GH}/busy/issues/2` }],
    failed_workflows: [{ workflow: 'CI', conclusion: 'failure', branch: 'main', created_at: '2026-01-14T00:00:00Z', url: `${GH}/busy/actions/runs/1` }],
    dependabot: { status: 'ok', message: '', url: `${GH}/busy/security/dependabot`, alerts: [{ number: 1, url: `${GH}/busy/security/dependabot/1` }], malware_alerts: [] },
    code_scanning: { status: 'ok', message: '', url: `${GH}/busy/security/code-scanning`, alerts: [{ number: 1, url: `${GH}/busy/security/code-scanning/1` }] },
    secret_scanning: { status: 'ok', message: '', url: `${GH}/busy/security/secret-scanning`, alerts: [{ number: 1, url: `${GH}/busy/security/secret-scanning/1` }] },
  });

  beforeEach(() => {
    renderDashboard(document, makeReport([busy]), NOW);
  });

  it('links every value in the repos table to the right page, with branches last', () => {
    expect(text('#repos thead th').at(-1)).toBe('Branches');
    expect(hrefs('#repos tbody a')).toEqual([
      `${GH}/busy`,
      `${GH}/busy/pulls`,
      `${GH}/busy/issues`,
      `${GH}/busy/actions?query=is%3Afailure`,
      `${GH}/busy/security/dependabot`,
      `${GH}/busy/security/code-scanning`,
      `${GH}/busy/security/secret-scanning`,
      `${GH}/busy/branches`,
    ]);
    expect(document.querySelectorAll('#repos tbody td:not(:has(a))')).toHaveLength(0);
  });

  it('links the repo, workflow, branch and run in the other tables', () => {
    expect(hrefs('#prs tbody a')).toEqual([`${GH}/busy`, `${GH}/busy/pull/1`]);
    expect(hrefs('#issues tbody a')).toEqual([`${GH}/busy`, `${GH}/busy/issues/2`]);
    expect(hrefs('#failed tbody a')).toEqual([`${GH}/busy`, `${GH}/busy/actions/runs/1`, `${GH}/busy/tree/main`, `${GH}/busy/actions/runs/1`]);
  });

  it('keeps slashes in branch names as path separators and escapes the rest', () => {
    const failure = { workflow: 'CI', conclusion: 'failure' as const, branch: 'feature/a b#1', created_at: '2026-01-14T00:00:00Z', url: `${GH}/x/actions/runs/1` };

    renderDashboard(document, makeReport([makeRepo('x', { failed_workflows: [failure] })]), NOW);

    expect(hrefs('#failed tbody a')[2]).toBe(`${GH}/x/tree/feature/a%20b%231`);
  });

  it('sorts the repos table by count, putting unreadable values lowest, and restores the original order', () => {
    renderDashboard(document, sample, NOW);
    const header = (label: string): HTMLButtonElement =>
      must([...document.querySelectorAll<HTMLButtonElement>('#repos th button')].find((b) => b.textContent === label));
    const names = (): string[] => rows('repos').map((r) => must(r[0]));

    header('Failed workflows').click();
    expect(names()).toEqual(['example-lib', 'example-site', 'example-app']);
    header('Failed workflows').click();
    expect(names()).toEqual(['example-app', 'example-site', 'example-lib']);
    header('Failed workflows').click();
    expect(names()).toEqual(['example-app', 'example-lib', 'example-site']);
    header('Repo').click();
    header('Repo').click();
    expect(names()).toEqual(['example-site', 'example-lib', 'example-app']);
  });

  it('tones each column: warnings for PRs, issues, and Dependabot or code alerts; errors for failures and secrets', () => {
    const classes = [...document.querySelectorAll('#repos tbody td')].map((td) => td.className);

    expect(classes).toEqual([
      '',
      'data-table-n data-table-warn',
      'data-table-n data-table-warn',
      'data-table-n data-table-bad',
      'data-table-n data-table-warn',
      'data-table-n data-table-warn',
      'data-table-n data-table-bad',
      'data-table-n data-table-muted',
    ]);
  });
});

describe('renderDashboard with data that could not be read', () => {
  it('shows "?" for requests that failed, never 0, and "Error" for API failures', () => {
    const repo = makeRepo('blind', {
      branches: { count: null, url: `${GH}/blind/branches` },
      collection_errors: ['branches', 'pulls', 'issues', 'runs'],
      dependabot: { status: 'error', message: '', url: `${GH}/blind/security/dependabot`, alerts: [], malware_alerts: [] },
    });

    renderDashboard(document, makeReport([repo]), NOW);

    expect(rows('repos')).toEqual([['blind', '?', '?', '?', 'Error', '0', '0', '?']]);
    expect(text('#repos tbody td.data-table-warn')).toEqual(['?', '?', '?', 'Error']);
  });

  it('adds a not-checked note to the tiles', () => {
    renderDashboard(document, makeReport([makeRepo('a', { collection_errors: ['pulls', 'issues'] })]), NOW);

    expect(text('#tiles .tile-sub').slice(0, 2)).toEqual(['across all repos, 1 not checked', 'pull requests excluded, 1 not checked']);
  });
});

describe('renderDashboard staleness warning', () => {
  const stale = (): HTMLElement => document.getElementById('stale') ?? document.body;

  it('stays hidden for fresh data', () => {
    renderDashboard(document, makeReport(), NOW);

    expect(stale().hidden).toBe(true);
    expect(stale().textContent).toBe('');
  });

  it('stays hidden at the 36 hour limit', () => {
    renderDashboard(document, makeReport(), NOW + 36 * 3_600_000);

    expect(stale().hidden).toBe(true);
  });

  it.each([
    [NOW + 37 * 3_600_000, '1 day old'],
    [NOW + 10 * 86_400_000, '10 days old'],
  ])('warns when the data is older than 36 hours (%i)', (now, age) => {
    renderDashboard(document, makeReport(), now);

    expect(stale().hidden).toBe(false);
    expect(stale().textContent).toContain(age);
    expect(stale().textContent).toContain('Repo report');
  });

  it('warns when the age cannot be determined', () => {
    renderDashboard(document, makeReport([], { generated_at: 'garbage' }), NOW);

    expect(stale().hidden).toBe(false);
    expect(stale().textContent).toContain('of unknown age');
  });
});

describe('renderDashboard edge cases', () => {
  it('tags private, fork, and archived repos', () => {
    renderDashboard(document, makeReport([makeRepo('hidden', { private: true, fork: true, archived: true })]), NOW);

    expect(document.querySelector('#repos .tag')?.textContent).toBe('private, fork, archived');
  });

  it('says so in each table that has nothing to list', () => {
    renderDashboard(document, makeReport([makeRepo('quiet')]), NOW);

    expect(text('#prs .data-table-empty')).toEqual(['No open pull requests.']);
    expect(text('#issues .data-table-empty')).toEqual(['No open issues.']);
    expect(text('#failed .data-table-empty')).toEqual(['No failed workflows.']);
    expect(text('#repos .data-table-empty')).toEqual([]);
  });

  it('says there are no repos when the report is empty', () => {
    renderDashboard(document, makeReport(), NOW);

    expect(text('#repos .data-table-empty')).toEqual(['No repos.']);
  });

  it('renders empty tables and a scale of at least one day when nothing failed', () => {
    renderDashboard(document, makeReport(), NOW);

    expect(document.getElementById('lede')?.textContent).toContain('0 repos');
    expect(document.querySelectorAll('#failed tbody a')).toHaveLength(0);
  });

  it('gives a fresh failure a visible minimum bar', () => {
    const failure = { workflow: 'CI', conclusion: 'failure' as const, branch: 'main', created_at: '2026-01-15T01:00:00Z', url: `${GH}/a/actions/runs/1` };
    const old = { ...failure, created_at: '2025-01-15T01:00:00Z' };

    renderDashboard(document, makeReport([makeRepo('a', { failed_workflows: [failure, old] })]), NOW);

    expect([...document.querySelectorAll<HTMLElement>('#failed .bar')].map((b) => b.style.width)).toEqual(['100%', '2%']);
    expect(text('#failed tbody tr:last-child td:last-child')[0]).toContain('today ago');
  });

  it('keeps text from GitHub inert: titles, branch and repo names never become markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const repo = makeRepo('<b>x</b>', {
      open_prs: [{ number: 1, title: hostile, url: `${GH}/a/pull/1`, draft: false }],
      open_issues: [{ number: 2, title: '"><script>alert(1)</script>', url: `${GH}/a/issues/2` }],
      failed_workflows: [{ workflow: '<i>wf</i>', conclusion: 'failure', branch: '"><svg onload=alert(1)>', created_at: '2026-01-14T00:00:00Z', url: `${GH}/a/actions/runs/1` }],
    });

    renderDashboard(document, makeReport([repo]), NOW);

    expect(document.querySelector('img, svg, script, #repos b, #failed i')).toBeNull();
    expect(text('#prs tbody a')).toEqual(['<b>x</b>', `#1 ${hostile}`]);
    expect(text('#repos tbody a')[0]).toBe('<b>x</b>');
  });

  it('refuses to render a link that does not point to https', () => {
    const repo = makeRepo('a', { html_url: 'javascript:alert(1)' });

    expect(() => {
      renderDashboard(document, makeReport([repo]), NOW);
    }).toThrow('non-https');
    expect(document.getElementById('content')?.hidden).toBe(true);
  });

  it('throws when the page is missing an expected element', () => {
    document.body.innerHTML = '';

    expect(() => {
      renderDashboard(document, sample, NOW);
    }).toThrow('Missing element #lede');
  });

  it('keeps the content hidden when rendering fails part-way', () => {
    document.body.innerHTML = '<p id="lede"></p><p id="stale" hidden></p><div id="content" hidden></div>';

    expect(() => {
      renderDashboard(document, sample, NOW);
    }).toThrow('Missing element #tiles');
    expect(document.getElementById('content')?.hidden).toBe(true);
  });
});
