# Design System

Single source of truth for the dashboard's look.

## Structure

- `tokens.css` - color, spacing, type, radius, shadow tokens (CSS custom properties, light and dark)
- `components/` - plain HTML/CSS components, one folder each with a `component.css` and a usage example in its README
  - `stat-tile/` - headline number with label and caption
  - `data-table/` - dense table with a sticky header
- `index.html` and `showcase.css` - static showcase of tokens and components

## Rules

- No hard-coded colors, spacing, or font sizes outside `tokens.css` (Stylelint rejects bare hex values for color properties).
- New component: add its CSS and README under `components/` (one folder per component), show it on `index.html`, and use tokens only.
- Must meet WCAG 2.1 AA contrast in light and dark.
- Changing a token is a visible change: note it in `CHANGELOG.md` (the release gate does not enforce this for `design-system/`).

## Viewing

`npm run build` copies this folder to `dist/design-system/`, so the showcase is served next to the dashboard. Or open `index.html` in a browser. There is no Storybook or other component-workshop tool.
