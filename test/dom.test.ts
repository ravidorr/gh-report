// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { el, link, renderTable } from '../src/dom.js';
import { must } from './helpers.js';

describe('el', () => {
  it('assigns props and appends strings, nodes, and nested arrays', () => {
    const inner = document.createElement('i');
    const node = el(document, 'p', { className: 'x' }, 'a', [inner, 'b']);

    expect(node.className).toBe('x');
    expect(node.innerHTML).toBe('a<i></i>b');
  });

  it('works without props or children', () => {
    expect(el(document, 'div').outerHTML).toBe('<div></div>');
  });

  it('keeps hostile text inert: it is text, never markup', () => {
    const node = el(document, 'p', { textContent: '<img src=x onerror=alert(1)>' }, '<script>alert(1)</script>');

    expect(node.querySelector('img, script')).toBeNull();
    expect(node.textContent).toBe('<img src=x onerror=alert(1)><script>alert(1)</script>');
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

  it.each(['javascript:alert(1)', 'http://example.test/', 'data:text/html,x', '/relative'])('refuses %s', (href) => {
    expect(() => link(document, 'x', href)).toThrow('non-https');
  });
});

describe('renderTable', () => {
  it('renders a head and body, defaulting class names to empty', () => {
    document.body.innerHTML = '<table id="t"></table>';

    renderTable(document, 't', [['A'], ['B', 'n']], [[['1'], ['2', 'n']]], 'Nothing.');

    expect(document.getElementById('t')?.innerHTML).toBe(
      '<thead><tr><th class="" aria-sort="none"><button class="data-table-sort" type="button">A</button></th>' +
        '<th class="n" aria-sort="none"><button class="data-table-sort" type="button">B</button></th></tr></thead>' +
        '<tbody><tr><td class="">1</td><td class="n">2</td></tr></tbody>',
    );
  });

  it('throws a clear error when the table is missing', () => {
    document.body.innerHTML = '';

    expect(() => {
      renderTable(document, 'nope', [], [], 'Nothing.');
    }).toThrow('Missing table #nope');
  });

  it('throws when a row has a different number of cells than the header', () => {
    document.body.innerHTML = '<table id="t"></table>';

    expect(() => {
      renderTable(document, 't', [['A'], ['B']], [[['1'], ['2']], [['only one']]], 'Nothing.');
    }).toThrow('Table #t: row 1 has 1 cells, expected 2');
  });
});

describe('renderTable empty state', () => {
  it('shows one message row spanning every column when there are no rows', () => {
    document.body.innerHTML = '<table id="t"></table>';

    renderTable(document, 't', [['A'], ['B'], ['C']], [], 'No things.');

    const cells = document.querySelectorAll<HTMLTableCellElement>('#t tbody td');
    expect(cells).toHaveLength(1);
    expect(cells[0]?.textContent).toBe('No things.');
    expect(cells[0]?.colSpan).toBe(3);
    expect(cells[0]?.className).toBe('data-table-empty');
  });

  it('renders plain header text, with nothing to click, so the message cannot be sorted away', () => {
    document.body.innerHTML = '<table id="t"></table>';

    renderTable(document, 't', [['A'], ['B', 'n']], [], 'No things.');

    expect(document.querySelector('#t button')).toBeNull();
    expect(document.getElementById('t')?.querySelector('thead')?.innerHTML).toBe('<tr><th class="">A</th><th class="n">B</th></tr>');
    expect(document.querySelector('#t tbody')?.textContent).toBe('No things.');
  });

  it('shows no message when there are rows', () => {
    document.body.innerHTML = '<table id="t"></table>';

    renderTable(document, 't', [['A']], [[['1']]], 'No things.');

    expect(document.querySelector('#t .data-table-empty')).toBeNull();
  });
});

describe('renderTable sorting', () => {
  const column = (): string[] => [...document.querySelectorAll('#t tbody tr td:first-child')].map((td) => td.textContent);
  const header = (index: number): HTMLElement => must(document.querySelectorAll<HTMLElement>('#t th')[index]);
  const click = (index: number): void => {
    must(header(index).querySelector('button')).click();
  };

  beforeEach(() => {
    document.body.innerHTML = '<table id="t"></table>';
    renderTable(document, 't', [['Name'], ['Count']], [
      [['b'], ['1', '', 10]],
      [['A'], ['2', '', 9]],
      [['c'], ['3', '', 100]],
      [['a10'], ['4']],
      [['a9'], ['5']],
    ], 'Nothing.');
  });

  it('cycles A-Z, Z-A and back to the original order', () => {
    expect(column()).toEqual(['b', 'A', 'c', 'a10', 'a9']);

    click(0);
    expect(column()).toEqual(['A', 'a9', 'a10', 'b', 'c']);
    expect(header(0).getAttribute('aria-sort')).toBe('ascending');

    click(0);
    expect(column()).toEqual(['c', 'b', 'a10', 'a9', 'A']);
    expect(header(0).getAttribute('aria-sort')).toBe('descending');

    click(0);
    expect(column()).toEqual(['b', 'A', 'c', 'a10', 'a9']);
    expect(header(0).getAttribute('aria-sort')).toBe('none');
  });

  it('sorts by the given sort value, numerically for numbers, and by the cell text for the rest', () => {
    click(1);

    // 9, 10 and 100 are numbers; the texts "4" and "5" sort before them as numeric-aware strings.
    expect(column()).toEqual(['a10', 'a9', 'A', 'b', 'c']);
  });

  it('keeps one active column: sorting another resets the first', () => {
    click(0);
    click(1);

    expect(header(0).getAttribute('aria-sort')).toBe('none');
    expect(header(1).getAttribute('aria-sort')).toBe('ascending');
  });

  it('keeps equal values in their original order', () => {
    renderTable(document, 't', [['Name']], [[['b', '', 1]], [['a', '', 1]], [['c', '', 0]]], 'Nothing.');

    click(0);

    expect(column()).toEqual(['c', 'b', 'a']);
  });

  it('compares numbers by value: decimals and negatives, which text order would get wrong', () => {
    renderTable(document, 't', [['Name']], [[['a', '', 1.5]], [['b', '', 1.25]], [['c', '', -1]], [['d', '', 0]]], 'Nothing.');

    click(0);

    expect(column()).toEqual(['c', 'd', 'b', 'a']);
  });

  it('keeps equal values in their original order when descending too', () => {
    renderTable(document, 't', [['Name']], [[['b', '', 1]], [['a', '', 1]], [['c', '', 0]]], 'Nothing.');

    click(0);
    click(0);

    expect(column()).toEqual(['b', 'a', 'c']);
  });

  it('orders the rows by the newly clicked column, not on top of the previous sort', () => {
    click(0);
    click(1);

    expect(column()).toEqual(['a10', 'a9', 'A', 'b', 'c']);
    click(0);
    expect(header(0).getAttribute('aria-sort')).toBe('ascending');
    expect(column()).toEqual(['A', 'a9', 'a10', 'b', 'c']);
  });
});
