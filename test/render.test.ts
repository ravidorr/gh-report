// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { renderDashboard } from '../src/render.js';
import type { Report } from '../src/types.js';
import { PAGE_HTML, makeRepo, readSample } from './helpers.js';

const NOW = Date.parse('2026-01-15T05:17:00Z');
const fixture = JSON.parse(readSample()) as Report;

const text = (selector: string): string[] => [...document.querySelectorAll(selector)].map((n) => n.textContent);

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
});

describe('renderDashboard with the sample report', () => {
  beforeEach(() => {
    renderDashboard(document, fixture, NOW);
  });

  it('reveals the content only after rendering', () => {
    expect(document.getElementById('content')?.hidden).toBe(false);
  });

  it('writes the lede with the repo count and generation time', () => {
    expect(document.getElementById('lede')?.textContent).toBe('3 repos. Data from Thu, 15 Jan 2026 05:17:00 GMT.');
  });

  it('renders one tile per counter, toning only non-zero ones', () => {
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
    expect(tiles[2]?.className).toBe('tile tile-bad');
    expect(tiles[5]?.className).toBe('tile tile-zero');
    expect(tiles[3]?.querySelector('.tile-sub')?.textContent).toBe('0 malware, 2 repos checked, 1 not checked');
  });

  it('sorts repos by open items and summarises each alert column', () => {
    const rows = [...document.querySelectorAll('#repos tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));

    expect(rows).toEqual([
      ['example-app', '3', '2', '1', '1', '1', '1', '0'],
      ['example-lib', '1', '0', '0', '0', '-', '-', 'Not checked'],
      ['example-site', '1', '0', '0', '0', '0', '0', '0'],
    ]);
  });

  it('lists pull requests and issues with draft markers', () => {
    expect(text('#prs tbody a')).toEqual(['#4 Add feature (draft)', '#5 Fix bug']);
    expect(text('#issues tbody a')).toEqual(['#2 Crash on start']);
  });

  it('shows failed workflows with their age and a bar scaled to the oldest', () => {
    expect(text('#failed tbody td')).toEqual(['example-app', 'CI', 'main', '4 days (2026-01-10)']);
    expect(document.querySelector<HTMLElement>('#failed .bar')?.style.width).toBe('100%');
  });
});

describe('renderDashboard edge cases', () => {
  it('tags private, fork, and archived repos and tolerates an unknown branch count', () => {
    const repo = makeRepo('hidden', { private: true, fork: true, archived: true, branches: { count: null, url: 'https://example.test/b' } });

    renderDashboard(document, { generated_at: '2026-01-15T05:17:00Z', repos: [repo] }, NOW);

    expect(document.querySelector('#repos .tag')?.textContent).toBe('private, fork, archived');
    expect(document.querySelectorAll('#repos tbody td')[1]?.textContent).toBe('0');
  });

  it('renders empty tables and a scale of at least one day when nothing failed', () => {
    renderDashboard(document, { generated_at: '2026-01-15T05:17:00Z', repos: [] }, NOW);

    expect(document.getElementById('lede')?.textContent).toContain('0 repos');
    expect(document.querySelectorAll('#failed tbody tr')).toHaveLength(0);
  });

  it('gives a fresh failure a visible minimum bar', () => {
    const failure = { workflow: 'CI', conclusion: 'failure', branch: 'main', created_at: '2026-01-15T01:00:00Z', path: 'p', url: 'https://example.test/r' };
    const old = { ...failure, created_at: '2025-01-15T01:00:00Z' };

    renderDashboard(document, { generated_at: '2026-01-15T05:17:00Z', repos: [makeRepo('a', { failed_workflows: [failure, old] })] }, NOW);

    const widths = [...document.querySelectorAll<HTMLElement>('#failed .bar')].map((b) => b.style.width);
    expect(widths).toEqual(['100%', '2%']);
    expect(text('#failed tbody tr:last-child td:last-child')[0]).toContain('today');
  });

  it('throws when the page is missing an expected element', () => {
    document.body.innerHTML = '';

    expect(() => {
      renderDashboard(document, fixture, NOW);
    }).toThrow('Missing element #lede');
  });

  it('keeps the content hidden when rendering fails part-way', () => {
    document.body.innerHTML = '<p id="lede"></p><div id="content" hidden></div>';

    expect(() => {
      renderDashboard(document, fixture, NOW);
    }).toThrow('Missing element #tiles');
    expect(document.getElementById('content')?.hidden).toBe(true);
  });
});
