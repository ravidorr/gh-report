# Stat tile

A headline number with a label and a caption. Add `tile-bad` or `tile-warn` to tint the number. Leave the tint off when the value is zero; `tile-zero` is a plain marker class with no styles of its own. Add `tile-unchecked` when some of the data behind the number could not be read: it turns the caption into a warning.

```html
<div class="tile tile-warn">
  <span class="tile-label">Dependabot alerts</span>
  <b class="tile-value">3</b>
  <span class="tile-sub">0 malware</span>
</div>
```
