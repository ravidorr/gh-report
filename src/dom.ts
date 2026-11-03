export type Content = Node | string;
/** What a column is sorted by: numbers numerically, strings alphabetically. Defaults to the cell's text. */
export type SortValue = string | number;
export type Cell = readonly [content: Content | readonly Content[], className?: string, sortValue?: SortValue];
export type HeadCell = readonly [label: string, className?: string];

// Only these properties can be set through `el`. Never add `innerHTML` or an `on*` handler: every
// string on the page comes from GitHub (PR titles, branch names) and must stay inert text.
type BaseProps<K extends keyof HTMLElementTagNameMap> = Partial<Pick<HTMLElementTagNameMap[K], 'className' | 'textContent'>>;
type LinkProps = Partial<Pick<HTMLAnchorElement, 'href' | 'target' | 'rel'>>;
export type ElementProps<K extends keyof HTMLElementTagNameMap> = K extends 'a' ? BaseProps<K> & LinkProps : BaseProps<K>;

/** Create an element, assign the given properties, and append the children (arrays are flattened). */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: ElementProps<K> = {} as ElementProps<K>,
  ...children: (Content | readonly Content[])[]
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  Object.assign(element, props);
  for (const child of children.flat()) {
    element.append(child);
  }
  return element;
}

/** An external link that opens in a new tab. Only https links are allowed. */
export function link(doc: Document, text: string, href: string): HTMLAnchorElement {
  if (!href.startsWith('https://')) {
    throw new Error(`Refusing to link to a non-https URL: ${href}`);
  }
  return el(doc, 'a', { textContent: text, href, target: '_blank', rel: 'noopener' });
}

type SortDirection = 'ascending' | 'descending' | 'none';

/** Clicking a header cycles through these: A-Z, then Z-A, then back to the original order. */
const NEXT_DIRECTION: Record<SortDirection, SortDirection> = { none: 'ascending', ascending: 'descending', descending: 'none' };

interface SortableRow {
  row: HTMLTableRowElement;
  keys: readonly (SortValue | null)[];
}

function compareValues(a: SortValue | null | undefined, b: SortValue | null | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Make every header a button that sorts the body rows. The original order is kept so "none" can restore it. */
function makeSortable(headers: readonly HTMLTableCellElement[], body: HTMLTableSectionElement, entries: readonly SortableRow[]): void {
  headers.forEach((header, column) => {
    header.setAttribute('aria-sort', 'none');
    header.querySelector('button')?.addEventListener('click', () => {
      const next = NEXT_DIRECTION[header.getAttribute('aria-sort') as SortDirection];
      for (const other of headers) {
        other.setAttribute('aria-sort', 'none');
      }
      header.setAttribute('aria-sort', next);
      const factor = next === 'descending' ? -1 : 1;
      const ordered = entries.slice();
      if (next !== 'none') {
        // Array.prototype.sort is stable, so equal values keep their original relative order.
        ordered.sort((a, b) => factor * compareValues(a.keys[column], b.keys[column]));
      }
      body.replaceChildren(...ordered.map((entry) => entry.row));
    });
  });
}

/**
 * Replace the contents of the `<table>` with the given id by a header row and body rows. Each header is a
 * button that sorts the column A-Z, Z-A, then back to the original order. With no rows, a single
 * `emptyMessage` row spans the table, so an empty table reads as "nothing here" and not as a failure.
 */
export function renderTable(
  doc: Document,
  id: string,
  head: readonly HeadCell[],
  rows: readonly (readonly Cell[])[],
  emptyMessage: string,
): void {
  const table = doc.getElementById(id);
  if (!table) {
    throw new Error(`Missing table #${id}`);
  }
  rows.forEach((cells, index) => {
    if (cells.length !== head.length) {
      throw new Error(`Table #${id}: row ${String(index)} has ${String(cells.length)} cells, expected ${String(head.length)}`);
    }
  });
  const headers = head.map(([label, className]) => {
    const button = el(doc, 'button', { className: 'data-table-sort', textContent: label });
    button.type = 'button';
    return el(doc, 'th', { className: className ?? '' }, button);
  });
  const entries = rows.map((cells): SortableRow => {
    const built = cells.map(([content, className, sortValue]) => {
      const td = el(doc, 'td', { className: className ?? '' }, content);
      return { td, key: sortValue ?? td.textContent };
    });
    return { row: el(doc, 'tr', {}, built.map(({ td }) => td)), keys: built.map(({ key }) => key) };
  });
  const body = el(doc, 'tbody', {}, entries.map((entry) => entry.row));
  if (!entries.length) {
    const empty = el(doc, 'td', { className: 'data-table-empty', textContent: emptyMessage });
    empty.colSpan = head.length;
    body.append(el(doc, 'tr', {}, empty));
  }
  makeSortable(headers, body, entries);
  table.replaceChildren(el(doc, 'thead', {}, el(doc, 'tr', {}, headers)), body);
}
