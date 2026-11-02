// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { load } from '../src/load.js';
import { PAGE_HTML, readSample } from './helpers.js';

const NOW = Date.parse('2026-01-15T05:17:00Z');
const lede = (): HTMLElement | null => document.getElementById('lede');
const respond = (body: string, init?: ResponseInit) => (): Promise<Response> => Promise.resolve(new Response(body, init));

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('load', () => {
  it('fetches data.json and renders it', async () => {
    const fetchFn = vi.fn(respond(readSample()));

    await load(document, fetchFn, NOW);

    expect(fetchFn).toHaveBeenCalledWith('data.json');
    expect(lede()?.textContent).toContain('3 repos');
    expect(lede()?.hasAttribute('role')).toBe(false);
    expect(document.getElementById('content')?.hidden).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([
    ['an HTTP error', respond('', { status: 404 }), 'Could not load data.json: HTTP 404'],
    ['a network error', () => Promise.reject(new TypeError('offline')), 'Could not load data.json: offline'],
    ['text that is not JSON', respond('<html>'), 'Could not load data.json: Unexpected token'],
    ['a file from an older collector', respond('{"generated_at":"2026-01-01T00:00:00Z","repos":[]}'), 'Could not load data.json: data.json was written by an older collector'],
    ['JSON of the wrong shape', respond('{"schema_version":1,"alert_details":true,"generated_at":"2026-01-01T00:00:00Z","repos":null}'), 'Could not load data.json: data.json has an unexpected shape: repos should be an array'],
  ])('reports %s in the lede, as an alert, and in the console', async (_label, fetchFn, message) => {
    await load(document, fetchFn, NOW);

    expect(lede()?.textContent).toContain(message);
    expect(lede()?.getAttribute('role')).toBe('alert');
    expect(document.getElementById('content')?.hidden).toBe(true);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('stringifies non-Error rejections', async () => {
    await load(document, vi.fn<typeof fetch>().mockRejectedValue('boom'), NOW);

    expect(lede()?.textContent).toBe('Could not load data.json: boom');
  });

  it('reports a render problem separately from a load problem', async () => {
    document.body.innerHTML = '<p id="lede"></p><p id="stale" hidden></p><div id="content" hidden></div>';

    await load(document, respond(readSample()), NOW);

    expect(lede()?.textContent).toBe('Could not render the report: Missing element #tiles');
    expect(document.getElementById('content')?.hidden).toBe(true);
  });

  it('does not throw when even the lede is missing, and still logs', async () => {
    document.body.innerHTML = '';

    await expect(load(document, () => Promise.reject(new Error('x')), NOW)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
