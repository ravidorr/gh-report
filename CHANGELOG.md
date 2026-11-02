# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-02

### Added

- Project baseline: strict linters (ESLint, Stylelint, html-validate, markdownlint, ShellCheck), Husky hooks, CI with a 100% coverage gate and Lighthouse, release workflow, Dependabot, and the standard documentation set.
- Dashboard logic as a tested TypeScript module in `src/`, built into one bundle with esbuild.
- Design system (`design-system/`) with tokens, a stat tile, a data table, and a showcase page.
- Dependabot, code scanning, and secret scanning alert counts on the dashboard, with a tile and a column for each.
- `ALERT_DETAILS` environment variable; the workflow sets it to `"false"` so the published data contains only the number and link of each alert.
- Collector tests that run `gh-repo-report.sh` against a stubbed `gh`, including the privacy filters.
- `EXCLUDE_REPOS` environment variable (fed from a repository secret) to leave repositories out of the report.

### Changed

- The collector now also reports code scanning and secret scanning alerts, skips Dependabot's own update runs when looking for failed workflows, and skips forks and archived repos by default.
- The page shell, styles, and script moved out of one inline `index.html` into `site/`, `src/`, and `design-system/`.
- The report workflow builds the site before collecting data and deploys `dist/`; `INCLUDE_FORKS` and `INCLUDE_ARCHIVED` are now `"false"`.

### Fixed

- A failing branches, pull requests, or issues API call no longer aborts the whole report; only that field falls back to empty.
