# Data table

A dense table with a sticky header. The header only sticks inside a scrolling parent with a fixed height (the dashboard uses `.box`). Put `data-table-n` on numeric cells and one of `data-table-muted`, `data-table-warn`, or `data-table-bad` to set the tone.

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
