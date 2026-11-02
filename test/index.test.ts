// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { PAGE_HTML, readSample } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('loads and renders the dashboard as soon as the page script runs', async () => {
  document.body.innerHTML = PAGE_HTML;
  const sample = readSample();
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(sample)));

  await import('../src/index.js');

  await vi.waitFor(() => {
    expect(document.getElementById('lede')?.textContent).toContain('3 repos');
  });
});
