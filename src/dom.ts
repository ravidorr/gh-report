export type Content = Node | string;
export type Cell = readonly [content: Content | readonly Content[], className?: string];
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

/** Replace the contents of the `<table>` with the given id by a header row and body rows. */
export function renderTable(doc: Document, id: string, head: readonly HeadCell[], rows: readonly (readonly Cell[])[]): void {
  const table = doc.getElementById(id);
  if (!table) {
    throw new Error(`Missing table #${id}`);
  }
  rows.forEach((cells, index) => {
    if (cells.length !== head.length) {
      throw new Error(`Table #${id}: row ${String(index)} has ${String(cells.length)} cells, expected ${String(head.length)}`);
    }
  });
  table.replaceChildren(
    el(
      doc,
      'thead',
      {},
      el(
        doc,
        'tr',
        {},
        head.map(([label, className]) => el(doc, 'th', { textContent: label, className: className ?? '' })),
      ),
    ),
    el(
      doc,
      'tbody',
      {},
      rows.map((cells) =>
        el(
          doc,
          'tr',
          {},
          cells.map(([content, className]) => el(doc, 'td', { className: className ?? '' }, content)),
        ),
      ),
    ),
  );
}
