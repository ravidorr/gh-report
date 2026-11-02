import { describe, expect, it } from 'vitest';

import { alertCell, attentionScore, computeTotals, isNotChecked, sortRepos } from '../src/summary.js';
import type { Repo, ScanStatus } from '../src/types.js';
import { makeRepo } from './helpers.js';

const url = 'https://github.com/example-owner/x';
const dependabotAlert = { number: 1, url, package: 'p', ecosystem: 'npm', scope: null, severity: 'high', classification: 'general', summary: 's' };
const block = (status: ScanStatus): Repo['code_scanning'] => ({ status, message: '', url, alerts: [] });

describe('computeTotals', () => {
  it('sums every counter and counts repos whose data could not be read, per figure', () => {
    const busy = makeRepo('busy', {
      open_prs: [{ number: 1, title: 't', url, draft: false }],
      open_issues: [
        { number: 2, title: 't', url },
        { number: 3, title: 't', url },
      ],
      failed_workflows: [{ workflow: 'CI', conclusion: 'failure', branch: 'main', created_at: '2026-01-01T00:00:00Z', url }],
      dependabot: { ...block('ok'), alerts: [dependabotAlert, dependabotAlert], malware_alerts: [dependabotAlert] },
      code_scanning: { ...block('ok'), alerts: [{ number: 1, url }] },
      secret_scanning: { ...block('ok'), alerts: [{ number: 1, url }] },
    });
    const blind = makeRepo('blind', {
      collection_errors: ['pulls', 'issues', 'runs', 'branches'],
      dependabot: { ...block('no_permission'), malware_alerts: [] },
      code_scanning: block('error'),
      secret_scanning: block('no_permission'),
    });
    const off = makeRepo('off', { dependabot: { ...block('disabled'), malware_alerts: [] }, code_scanning: block('disabled'), secret_scanning: block('disabled') });

    expect(computeTotals([busy, blind, off])).toEqual({
      prs: 1,
      issues: 2,
      failed: 1,
      dependabot: 2,
      malware: 1,
      codeScanning: 1,
      secretScanning: 1,
      notChecked: { prs: 1, issues: 1, failed: 1, dependabot: 1, codeScanning: 1, secretScanning: 1 },
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
      notChecked: { prs: 0, issues: 0, failed: 0, dependabot: 0, codeScanning: 0, secretScanning: 0 },
    });
  });
});

describe('isNotChecked', () => {
  it.each([
    ['ok', false],
    ['disabled', false],
    ['no_permission', true],
    ['error', true],
  ] as const)('%s -> %s', (status, expected) => {
    expect(isNotChecked(status)).toBe(expected);
  });
});

describe('sortRepos', () => {
  it('orders by attention score, then by name, without mutating the input', () => {
    const issue = { number: 1, title: 't', url };
    const input = [makeRepo('b'), makeRepo('a'), makeRepo('c', { open_issues: [issue] })];

    expect(sortRepos(input).map((r) => r.name)).toEqual(['c', 'a', 'b']);
    expect(input.map((r) => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('ranks a repo whose data could not be read above a clean one', () => {
    const unreadable: Repo = makeRepo('z', { collection_errors: ['pulls'], secret_scanning: block('no_permission') });

    expect(attentionScore(unreadable)).toBe(2);
    expect(sortRepos([makeRepo('a'), unreadable]).map((r) => r.name)).toEqual(['z', 'a']);
  });
});

describe('alertCell', () => {
  it.each([
    ['ok', 1234, '1,234'],
    ['disabled', 5, '-'],
    ['no_permission', 5, 'Not checked'],
    ['error', 5, 'Error'],
  ] as const)('shows %s with count %i as %s', (status, count, text) => {
    expect(alertCell(status, count)).toBe(text);
  });
});
