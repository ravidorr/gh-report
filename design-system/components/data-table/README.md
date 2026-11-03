# Data table

A dense table with a sticky header. The header only sticks inside a scrolling parent with a fixed height (the dashboard uses `.box`). Put `data-table-n` on numeric cells and one of `data-table-muted`, `data-table-warn`, or `data-table-bad` to set the tone.

Tables built with `renderTable` have sortable headers. Each `th` holds a `.data-table-sort` button, and `aria-sort` on the `th` (`none`, `ascending`, `descending`) shows the arrow. Clicking cycles ascending, descending, original order. A cell sorts by its text unless it passes a sort key (numbers compare numerically). With no rows, the table shows one `.data-table-empty` message row and plain header text.

The markup below is the static structure; `renderTable` adds the sort buttons.

```html
<table class="data-table">
  <thead>
    <tr><th>Repo</th><th class="data-table-n">Open PRs</th></tr>
  </thead>
  <tbody>
    <tr><td>example-app</td><td class="data-table-n data-table-warn">2</td></tr>
  </tbody>
</table>
```
