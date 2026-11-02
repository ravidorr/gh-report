# gh-report - Agent Guide

Canonical instructions for AI coding agents. `CLAUDE.md` and `GEMINI.md` point here; edit this file only.

## Project

A daily GitHub Action that collects branches, open pull requests, open issues, failed workflows and security alerts for your repositories, then publishes them as a static dashboard on GitHub Pages.

## Commands

- Install: `npm install`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Coverage: `npm run test:coverage` (100% lines, functions, branches, statements; mandatory on push and in CI)
- Build: `npm run build` (writes the deployable site to `dist/`)

## Rules

- Never commit with `--no-verify`. Fix the cause when a hook fails.
- This repository uses GitHub issues for ticketing.
- Open PRs as drafts. Description: short intro, then bullets of the actual changes. PR titles are plain descriptive text (no ticket key); reference issues with `Closes #N`.
- The Pages site is public: never remove the `INCLUDE_PRIVATE: "false"` setting in `.github/workflows/report.yml`, and never commit report output (`data.json`, `gh-repo-report*.json`) or real repository names as fixtures.
- Linters are strict (ESLint, Stylelint, html-validate, markdownlint, ShellCheck). Do not weaken rules to pass.
- UI work uses the tokens and components in `/design-system`. No hard-coded colors or spacing.
- Pin Node via `.nvmrc`; package manager is `npm`. Keep the lockfile committed.
- PRs that change `src/`, `package.json`, or `tsconfig.json` update `CHANGELOG.md` and bump the version (one SemVer bump per PR). Docs-only, test-only, and tooling-only PRs do not.
- Track open work in `TODO.md`.

## Layout

- `gh-repo-report.sh` - collector (bash + `gh` + `jq`), writes the report JSON (path in `$1`; `dist/data.json` in the workflow)
- `src/` - dashboard logic (TypeScript, fully covered by tests)
- `site/` - static page shell (`index.html`, `styles.css`)
- `design-system/` - tokens, components (`components/`), and showcase used by the page
- `scripts/` - build (`build.mjs`), release gate (`check-release.mjs`), coverage summary, HTML lint
- `test/` - Vitest suites, including the collector tests with a stubbed `gh`
- `.husky/` - git hooks (pre-commit fast, pre-push broad)
- `.github/` - CI, release, daily report and Pages deploy (`report.yml`), dependabot, templates
