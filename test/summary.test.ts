import { describe, expect, it } from 'vitest';

import { alertCell, attentionScore, computeTotals, sortRepos } from '../src/summary.js';
import { makeRepo } from './helpers.js';

const url = 'https://example.test';
const alert = { number: 1, package: 'p', ecosystem: 'npm', scope: null, severity: 'high', classification: 'general', summary: 's', url };

describe('computeTotals', () => {
  it('sums every counter and counts repos whose Dependabot alerts could be read', () => {
    const busy = makeRepo('busy', {
      open_prs: [{ number: 1, title: 't', url, draft: false }],
      open_issues: [
        { number: 2, title: 't', url },
        { number: 3, title: 't', url },
      ],
      failed_workflows: [{ workflow: 'CI', conclusion: 'failure', branch: 'main', created_at: '2026-01-01T00:00:00Z', path: 'p', url }],
      dependabot: { status: 'ok', message: '', url, alerts: [alert, alert], malware_alerts: [alert] },
      code_scanning: { status: 'ok', message: '', url, alerts: [{ number: 1, rule: 'r', tool: 't', severity: null, path: 'p', summary: 's', url }] },
      secret_scanning: { status: 'ok', message: '', url, alerts: [{ number: 1, secret_type: 'x', validity: null, created_at: 'c', url }] },
    });
    const off = makeRepo('off', { dependabot: { status: 'disabled', message: '', url, alerts: [], malware_alerts: [] } });

    expect(computeTotals([busy, off])).toEqual({
      prs: 1,
      issues: 2,
      failed: 1,
      dependabot: 2,
      malware: 1,
      codeScanning: 1,
      secretScanning: 1,
      checked: 1,
    });
  });

  it('returns zeros for no repos', () => {
    expect(computeTotals([])).toEqual({
      prs: 0,
      issues: 0,
      failed: 0,
      dependabot: 0,
      malware: 0,
      codeScanning: 0,
      secretScanning: 0,
      checked: 0,
    });
  });
});

describe('sortRepos', () => {
  it('orders by attention score, then by name, without mutating the input', () => {
    const issue = { number: 1, title: 't', url };
    const input = [makeRepo('b'), makeRepo('a'), makeRepo('c', { open_issues: [issue] })];

    expect(sortRepos(input).map((r) => r.name)).toEqual(['c', 'a', 'b']);
    expect(input.map((r) => r.name)).toEqual(['b', 'a', 'c']);
    expect(attentionScore(input[2] ?? makeRepo('x'))).toBe(1);
  });
});

describe('alertCell', () => {
  it.each([
    ['ok', 1234, '1,234'],
    ['disabled', 5, '-'],
    ['no_permission', 5, 'Not checked'],
    ['error', 5, 'Not checked'],
  ] as const)('shows %s with count %i as %s', (status, count, text) => {
    expect(alertCell(status, count)).toBe(text);
  });
});
