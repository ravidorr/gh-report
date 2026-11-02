# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.1] - 2026-11-02

### Security

- Close three Dependabot alerts in dev tooling (nothing in the deployed page) with npm `overrides` to the patched versions: `minimatch` 11.0.1 (denial of service, used by ESLint), `re2js` 2.8.7 (denial of service, used by markdownlint) and `katex` 0.18.2 (prototype pollution, pulled in by markdownlint). No release of the packages that depend on them allows the fixed versions yet.

## [0.2.0] - 2026-11-02

### Changed

- Move to Node.js 26.13.0, the current LTS (Lithium), from 24.22.2: `.nvmrc`, `engines`, `packageManager` (npm 11.20.0) and `@types/node` 26. Contributors need Node 26.

## [0.1.2] - 2026-11-02

### Changed

- Put `@types/node` back on the 24 line (24.19.2), so the types match the Node 24 the project runs on. Dependabot now ignores `@types/node` major bumps.

## [0.1.1] - 2026-11-02

### Changed

- Bump `@types/node` from 24.19.2 to 26.6.6 (dev dependency).

## [0.1.0] - 2026-11-02

### Added

- Project baseline: strict linters (ESLint, Stylelint, html-validate, markdownlint, ShellCheck), Husky hooks, CI with a 100% coverage gate and Lighthouse, release workflow, Dependabot, and the standard documentation set.
- Dashboard logic as a tested TypeScript module in `src/`, built into one bundle with esbuild.
- Design system (`design-system/`) with tokens, a stat tile, a data table, and a showcase page.
- Dependabot, code scanning, and secret scanning alert counts on the dashboard, with a tile and a column for each.
- `ALERT_DETAILS` environment variable; the workflow sets it to `"false"` so the published data contains only the number and link of each alert, and no error text or workflow file paths.
- `scripts/verify-report.mjs`, a gate that stops an empty or incomplete report from being deployed, a warning on the page when the data is older than 36 hours, and `schema_version` in `data.json` with a runtime check (`src/parse.ts`) in the page.
- Retries (`MAX_ATTEMPTS`, `RETRY_DELAY`) for GitHub rate limits and server errors, and `collection_errors` per repo so failed requests show as "?" instead of 0.
- Collector tests that run `gh-repo-report.sh` against a stubbed `gh`, including the privacy filters.
- `EXCLUDE_REPOS` environment variable (fed from a repository secret) to leave repositories out of the report.

### Changed

- The collector now also reports code scanning and secret scanning alerts, looks at completed runs on the default branch only (cancelled and skipped runs no longer hide a failure), skips Dependabot's own update runs, and skips forks and archived repos by default. Rate limits are no longer reported as missing permissions.
- Settings that are set but empty (`INCLUDE_PRIVATE`, `ALERT_DETAILS`) now fail closed instead of publishing everything.
- The release gate also covers the collector, the page, the design system and the report workflow.
- The page shell, styles, and script moved out of one inline `index.html` into `site/`, `src/`, and `design-system/`.
- The report workflow builds the site before collecting data and deploys `dist/`; `INCLUDE_FORKS` and `INCLUDE_ARCHIVED` are now `"false"`.

### Fixed

- A failing branches, pull requests, or issues API call no longer aborts the whole report; only that field falls back to empty.
- A run with no repositories left after filtering no longer crashes; it writes an empty report.
- The report workflow no longer exposes `REPORT_TOKEN` to `npm ci` and the build, and no longer cancels a run in progress.
