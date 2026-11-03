export type Content = Node | string;
/**
 * The key a cell sorts by. Two numbers compare numerically; any other pair compares as case-insensitive,
 * numeric-aware text. Keep one kind per column. Defaults to the cell's text content.
 */
export type SortValue = string | number;
/** `[content, className?, sortValue?]`. */
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

/** Clicking a header cycles through these: ascending, descending, then back to the original order. */
const NEXT_DIRECTION: Record<SortDirection, SortDirection> = { none: 'ascending', ascending: 'descending', descending: 'none' };

interface SortableColumn {
  header: HTMLTableCellElement;
  button: HTMLButtonElement;
  direction: SortDirection;
}

interface SortableRow {
  row: HTMLTableRowElement;
  keys: readonly SortValue[];
}

function compareValues(a: SortValue | undefined, b: SortValue | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function setDirection(column: SortableColumn, direction: SortDirection): void {
  column.direction = direction;
  column.header.setAttribute('aria-sort', direction);
}

/** Wire each header button to sort the body rows. The original order is kept in `entries`, so "none" can restore it. */
function makeSortable(columns: readonly SortableColumn[], body: HTMLTableSectionElement, entries: readonly SortableRow[]): void {
  columns.forEach((column, index) => {
    setDirection(column, 'none');
    column.button.addEventListener('click', () => {
      const next = NEXT_DIRECTION[column.direction];
      for (const other of columns) {
        setDirection(other, 'none');
      }
      setDirection(column, next);
      const factor = next === 'descending' ? -1 : 1;
      // toSorted is stable, so equal values keep their original relative order.
      const ordered = next === 'none' ? entries : entries.toSorted((a, b) => factor * compareValues(a.keys[index], b.keys[index]));
      body.replaceChildren(...ordered.map((entry) => entry.row));
    });
  });
}

/**
 * Replace the contents of the `<table>` with the given id by a header row and body rows. A row needs one
 * cell per header (it throws otherwise); a cell's optional third element is the key its column sorts by.
 * With rows, each header is a button that sorts its column ascending, descending, then back to the
 * original order. With no rows, a single `emptyMessage` row spans the table and the headers are plain
 * text, so an empty table reads as "nothing here" and not as a failure.
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
    table.replaceChildren(
      el(doc, 'thead', {}, el(doc, 'tr', {}, head.map(([label, className]) => el(doc, 'th', { className: className ?? '', textContent: label })))),
      body,
    );
    return;
  }
  const columns = head.map(([label, className]): SortableColumn => {
    const button = el(doc, 'button', { className: 'data-table-sort', textContent: label });
    button.type = 'button';
    return { header: el(doc, 'th', { className: className ?? '' }, button), button, direction: 'none' };
  });
  makeSortable(columns, body, entries);
  table.replaceChildren(el(doc, 'thead', {}, el(doc, 'tr', {}, columns.map((column) => column.header))), body);
}
