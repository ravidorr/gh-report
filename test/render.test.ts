// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { renderDashboard } from '../src/render.js';
import type { FailedWorkflow, Report } from '../src/types.js';
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

  it('lists the sample Dependabot alert with its package, ecosystem, severity and links', () => {
    expect(rows('dependabot')).toEqual([['example-app', 'left-pad', 'npm', 'high']]);
    expect(hrefs('#dependabot tbody a')).toEqual([`${GH}/example-app`, `${GH}/example-app/security/dependabot/1`]);
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

  it('shows no link for a run that has no branch', () => {
    const failure = { workflow: 'CI', conclusion: 'failure' as const, branch: '', created_at: '2026-01-14T00:00:00Z', url: `${GH}/x/actions/runs/1` };

    renderDashboard(document, makeReport([makeRepo('x', { failed_workflows: [failure] })]), NOW);

    expect(hrefs('#failed tbody a')).toEqual([`${GH}/x`, `${GH}/x/actions/runs/1`, `${GH}/x/actions/runs/1`]);
    expect(rows('failed')[0]?.[2]).toBe('');
  });

  it('keeps "?" cells linked to the same page as real counts', () => {
    const blind = makeRepo('blind', {
      branches: { count: null, url: `${GH}/blind/branches` },
      collection_errors: ['branches', 'pulls', 'issues', 'runs'],
    });

    renderDashboard(document, makeReport([blind]), NOW);

    expect(hrefs('#repos tbody a').slice(0, 4)).toEqual([`${GH}/blind`, `${GH}/blind/pulls`, `${GH}/blind/issues`, `${GH}/blind/actions?query=is%3Afailure`]);
    expect(hrefs('#repos tbody a').at(-1)).toBe(`${GH}/blind/branches`);
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

describe('renderDashboard sorting', () => {
  const header = (table: string, label: string): HTMLButtonElement =>
    must([...document.querySelectorAll<HTMLButtonElement>(`#${table} th button`)].find((b) => b.textContent === label));
  const names = (): string[] => text('#repos tbody td:first-child a');

  it.each([
    ['Open PRs', ['example-lib', 'example-site', 'example-app']],
    ['Dependabot', ['example-lib', 'example-site', 'example-app']],
    ['Secret scanning', ['example-lib', 'example-app', 'example-site']],
    ['Branches', ['example-lib', 'example-site', 'example-app']],
  ])('sorts the repos table by %s, with unreadable values lowest', (label, expected) => {
    renderDashboard(document, sample, NOW);

    header('repos', label).click();

    expect(names()).toEqual(expected);
  });

  it('puts a repo whose branches could not be counted below the others', () => {
    const known = makeRepo('known', { branches: { count: 5, url: `${GH}/known/branches` } });
    const unknown = makeRepo('unknown', { branches: { count: null, url: `${GH}/unknown/branches` }, collection_errors: ['branches'] });

    renderDashboard(document, makeReport([known, unknown]), NOW);
    header('repos', 'Branches').click();

    expect(names()).toEqual(['unknown', 'known']);
  });

  it('sorts the repo column by name, not by the tag next to it', () => {
    const tagged = makeRepo('app', { archived: true });

    renderDashboard(document, makeReport([makeRepo('app2'), tagged]), NOW);
    header('repos', 'Repo').click();

    expect(names()).toEqual(['app', 'app2']);
  });

  it('sorts failed runs by their date, not by the "days ago" text', () => {
    const failure = (created_at: string): FailedWorkflow => ({ workflow: 'CI', conclusion: 'failure', branch: 'main', created_at, url: `${GH}/a/actions/runs/1` });

    renderDashboard(document, makeReport([makeRepo('a', { failed_workflows: [failure('2026-01-14T00:00:00Z'), failure('2025-01-15T00:00:00Z')] })]), NOW);
    header('failed', 'Latest failed run').click();
    header('failed', 'Latest failed run').click();

    expect(text('#failed tbody tr td:last-child a')).toEqual(['1 day ago (2026-01-14)', '12 months ago (2025-01-15)']);
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
    expect(text('#dependabot .data-table-empty')).toEqual(['No open Dependabot alerts.']);
    expect(text('#repos .data-table-empty')).toEqual([]);
  });

  describe('Dependabot alerts table', () => {
    type Alert = Report['repos'][number]['dependabot']['alerts'][number];
    const alert = (repo: string, number: number, extra: Record<string, string | null> = {}): Alert => ({
      number,
      url: `${GH}/${repo}/security/dependabot/${String(number)}`,
      ...extra,
    });
    const repoWith = (name: string, alerts: Alert[], malware: Alert[] = []): Report['repos'][number] =>
      makeRepo(name, {
        dependabot: { status: 'ok', message: '', malware_alerts: malware, alerts, url: `${GH}/${name}/security/dependabot` },
      });
    const header = (label: string): HTMLButtonElement =>
      must([...document.querySelectorAll<HTMLButtonElement>('#dependabot th button')].find((b) => b.textContent === label));
    const severities = (): string[] => rows('dependabot').map((r) => r[3] ?? '');

    it('lists alerts from all repos most severe first, keeping collection order within a severity', () => {
      renderDashboard(
        document,
        makeReport([
          repoWith('a', [alert('a', 1, { package: 'a-low', severity: 'low' }), alert('a', 2, { package: 'a-high', severity: 'high' })]),
          repoWith('b', [
            alert('b', 3, { package: 'b-critical', severity: 'critical' }),
            alert('b', 4, { package: 'b-medium', severity: 'medium' }),
            alert('b', 5, { package: 'b-high', severity: 'high' }),
          ]),
        ]),
        NOW,
      );

      expect(rows('dependabot').map((r) => `${r[0] ?? ''}/${r[1] ?? ''}`)).toEqual(['b/b-critical', 'a/a-high', 'b/b-high', 'b/b-medium', 'a/a-low']);
      expect(hrefs('#dependabot tbody a')).toEqual([
        `${GH}/b`, `${GH}/b/security/dependabot/3`,
        `${GH}/a`, `${GH}/a/security/dependabot/2`,
        `${GH}/b`, `${GH}/b/security/dependabot/5`,
        `${GH}/b`, `${GH}/b/security/dependabot/4`,
        `${GH}/a`, `${GH}/a/security/dependabot/1`,
      ]);
    });

    it('puts alerts with a missing or unknown severity last and copes with missing details', () => {
      renderDashboard(
        document,
        makeReport([
          repoWith('x', [
            alert('x', 1, { package: 'lodash', ecosystem: 'npm', severity: 'low' }),
            alert('x', 2),
            alert('x', 3, { package: 'pip-thing', ecosystem: null, severity: 'weird' }),
          ]),
        ]),
        NOW,
      );

      expect(rows('dependabot')).toEqual([
        ['x', 'lodash', 'npm', 'low'],
        ['x', '#2', '', ''],
        ['x', 'pip-thing', '', 'weird'],
      ]);
    });

    it('sorts by severity, not alphabetically, when the Severity header is clicked', () => {
      renderDashboard(
        document,
        makeReport([
          repoWith('x', [
            alert('x', 1, { severity: 'low' }),
            alert('x', 2, { severity: 'critical' }),
            alert('x', 3, { severity: 'weird' }),
            alert('x', 4, { severity: 'medium' }),
            alert('x', 5, { severity: 'high' }),
          ]),
        ]),
        NOW,
      );

      header('Severity').click();
      expect(severities()).toEqual(['critical', 'high', 'medium', 'low', 'weird']);

      header('Severity').click();
      expect(severities()).toEqual(['weird', 'low', 'medium', 'high', 'critical']);
    });

    it('tags malware from the malware list, which survives hidden alert details, and from the classification', () => {
      const hidden = alert('x', 2);
      renderDashboard(
        document,
        makeReport([
          repoWith(
            'x',
            [alert('x', 1, { package: 'lodash', classification: 'general' }), hidden, alert('x', 3, { package: 'evil', classification: 'malware' }), alert('x', 4)],
            [hidden],
          ),
        ]),
        NOW,
      );

      expect([...document.querySelectorAll('#dependabot tbody tr')].map((tr) => tr.querySelector('.tag')?.textContent ?? null)).toEqual([null, 'malware', 'malware', null]);
      expect(text('#dependabot tbody tr:nth-child(2) td:nth-child(2) a')).toEqual(['#2']);
    });

    it('matches malware by alert number within its own repo only', () => {
      const other = alert('a', 7);
      renderDashboard(document, makeReport([repoWith('a', [other], [other]), repoWith('b', [alert('b', 7)])]), NOW);

      expect([...document.querySelectorAll('#dependabot tbody tr')].map((tr) => tr.querySelector('.tag')?.textContent ?? null)).toEqual(['malware', null]);
    });

    it('shows package names as text, never as markup', () => {
      const hostile = '<img src=x onerror=alert(1)>';
      renderDashboard(document, makeReport([repoWith('x', [alert('x', 1, { package: hostile })])]), NOW);

      expect(text('#dependabot tbody td:nth-child(2) a')).toEqual([hostile]);
      expect(document.querySelector('#dependabot img')).toBeNull();
    });

    it.each([
      ['error', 1, 'No open Dependabot alerts found, but 1 repo could not be checked.'],
      ['no_permission', 2, 'No open Dependabot alerts found, but 2 repos could not be checked.'],
      ['disabled', 0, 'No open Dependabot alerts.'],
    ] as const)('says so when a repo with status %s has no alerts to list', (status, unchecked, expected) => {
      const blind = (name: string): Report['repos'][number] =>
        makeRepo(name, { dependabot: { status, message: '', malware_alerts: [], alerts: [], url: `${GH}/${name}/security/dependabot` } });
      renderDashboard(document, makeReport(unchecked === 2 ? [blind('a'), blind('b')] : [blind('a')]), NOW);

      expect(text('#dependabot .data-table-empty')).toEqual([expected]);
    });
  });

  it('says there are no repos when the report is empty', () => {
    renderDashboard(document, makeReport(), NOW);

    expect(text('#repos .data-table-empty')).toEqual(['No repos.']);
    expect(document.querySelector<HTMLTableCellElement>('#repos .data-table-empty')?.colSpan).toBe(8);
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
