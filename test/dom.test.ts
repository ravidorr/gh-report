// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { el, link, renderTable } from '../src/dom.js';

describe('el', () => {
  it('assigns props and appends strings, nodes, and nested arrays', () => {
    const inner = document.createElement('i');
    const node = el(document, 'p', { className: 'x', textContent: '' }, 'a', [inner, 'b']);

    expect(node.className).toBe('x');
    expect(node.innerHTML).toBe('a<i></i>b');
  });

  it('works without props or children', () => {
    expect(el(document, 'div').outerHTML).toBe('<div></div>');
  });
});

describe('link', () => {
  it('opens in a new tab without leaking the opener', () => {
    const a = link(document, 'text', 'https://example.test/');

    expect(a.textContent).toBe('text');
    expect(a.getAttribute('href')).toBe('https://example.test/');
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener');
  });
});

describe('renderTable', () => {
  it('renders a head and body, defaulting class names to empty', () => {
    document.body.innerHTML = '<table id="t"></table>';

    renderTable(document, 't', [['A'], ['B', 'n']], [[['1'], ['2', 'n']]]);

    expect(document.getElementById('t')?.innerHTML).toBe(
      '<thead><tr><th class="">A</th><th class="n">B</th></tr></thead><tbody><tr><td class="">1</td><td class="n">2</td></tr></tbody>',
    );
  });

  it('throws a clear error when the table is missing', () => {
    document.body.innerHTML = '';

    expect(() => {
      renderTable(document, 'nope', [], []);
    }).toThrow('Missing table #nope');
  });
});
