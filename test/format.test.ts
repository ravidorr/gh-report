import { describe, expect, it } from 'vitest';

import { ageDays, ageText, formatNumber } from '../src/format.js';

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});

describe('ageDays', () => {
  const now = Date.parse('2026-01-15T00:00:00Z');

  it('counts whole days', () => {
    expect(ageDays('2026-01-10T12:00:00Z', now)).toBe(4);
  });

  it.each([
    ['23h59m old is still day 0', '2026-01-14T00:01:00Z', 0],
    ['exactly 24h old is 1', '2026-01-14T00:00:00Z', 1],
    ['an offset timestamp is compared by instant', '2026-01-14T05:00:00+05:00', 1],
  ])('%s', (_label, iso, days) => {
    expect(ageDays(iso, now)).toBe(days);
  });

  it('never returns a negative age for timestamps in the future', () => {
    expect(ageDays('2026-02-01T00:00:00Z', now)).toBe(0);
  });

  it('returns 0 instead of NaN for an invalid date', () => {
    expect(ageDays('garbage', now)).toBe(0);
  });
});

describe('ageText', () => {
  it.each([
    [0, 'today'],
    [1, '1 day'],
    [2, '2 days'],
    [29, '29 days'],
    [59, '59 days'],
    [60, '2 months'],
    [89, '3 months'],
    [100, '3 months'],
  ])('formats %i days as %s', (days, text) => {
    expect(ageText(days)).toBe(text);
  });
});
