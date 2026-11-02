// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { load } from '../src/load.js';
import { PAGE_HTML, readSample } from './helpers.js';

const sample = readSample();
const NOW = Date.parse('2026-01-15T05:17:00Z');
const lede = (): string => document.getElementById('lede')?.textContent ?? '';

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
});

describe('load', () => {
  it('fetches data.json and renders it', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(sample)));

    await load(document, fetchFn, NOW);

    expect(fetchFn).toHaveBeenCalledWith('data.json');
    expect(lede()).toContain('3 repos');
  });

  it('reports an HTTP error in the lede', async () => {
    await load(document, () => Promise.resolve(new Response('', { status: 404 })), NOW);

    expect(lede()).toBe('Could not load data.json: HTTP 404');
  });

  it('reports a network error in the lede', async () => {
    await load(document, () => Promise.reject(new TypeError('offline')), NOW);

    expect(lede()).toBe('Could not load data.json: offline');
  });

  it('stringifies non-Error rejections', async () => {
    await load(document, vi.fn<typeof fetch>().mockRejectedValue('boom'), NOW);

    expect(lede()).toBe('Could not load data.json: boom');
  });

  it('does not throw when even the lede is missing', async () => {
    document.body.innerHTML = '';

    await expect(load(document, () => Promise.reject(new Error('x')), NOW)).resolves.toBeUndefined();
  });
});
