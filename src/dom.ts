export type Content = Node | string;
export type Cell = readonly [content: Content | Content[], className?: string];
export type HeadCell = readonly [label: string, className?: string];

export interface ElementProps {
  className?: string;
  textContent?: string;
  href?: string;
  target?: string;
  rel?: string;
}

/** Create an element, assign the given properties, and append the children (arrays are flattened). */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: ElementProps = {},
  ...children: (Content | Content[])[]
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  Object.assign(element, props);
  for (const child of children.flat()) {
    element.append(child);
  }
  return element;
}

/** An external link that opens in a new tab. */
export function link(doc: Document, text: string, href: string): HTMLAnchorElement {
  return el(doc, 'a', { textContent: text, href, target: '_blank', rel: 'noopener' });
}

/** Replace the contents of the `<table>` with the given id by a header row and body rows. */
export function renderTable(doc: Document, id: string, head: HeadCell[], rows: Cell[][]): void {
  const table = doc.getElementById(id);
  if (!table) {
    throw new Error(`Missing table #${id}`);
  }
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
