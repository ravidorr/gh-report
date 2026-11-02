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
- `npm run check:generated` is a placeholder that always passes: nothing is generated and committed here

## Rules

- Never commit with `--no-verify`. Fix the cause when a hook fails.
- This repository uses GitHub issues for ticketing.
- Open PRs as drafts. Description: short intro, then bullets of the actual changes. PR titles are plain descriptive text (no ticket key); reference issues with `Closes #N`.
- The Pages site is public. Never remove or change `INCLUDE_PRIVATE: "false"` or `ALERT_DETAILS: "false"` in `.github/workflows/report.yml`, keep `EXCLUDE_REPOS` a secret (never a `vars` variable, which is printed in public logs), and keep `GH_TOKEN` on the collect step only. `test/workflows.test.ts` enforces these. Never commit report output (`data.json`, `gh-repo-report*.json`) or real repository names as fixtures.
- `gh-repo-report.sh` defines the schema of `data.json`: change `src/types.ts` and `src/parse.ts` with it.
- Linters are strict (ESLint, Stylelint, html-validate, markdownlint, ShellCheck). Do not weaken rules to pass.
- UI work uses the tokens and components in `/design-system`. No hard-coded colors or spacing.
- Pin Node via `.nvmrc`; package manager is `npm`. Keep the lockfile committed.
- PRs that change `package.json`, `tsconfig.json`, `src/`, `gh-repo-report.sh`, `site/`, `design-system/`, `scripts/build.mjs`, `scripts/verify-report.mjs`, or `.github/workflows/report.yml` must update `CHANGELOG.md` and increase the version in `package.json`; CI enforces it (the list is `RELEASE_TRIGGER_PATHS` in `.github/workflows/ci.yml` and `.husky/pre-push`, on top of the paths built into `scripts/check-release.mjs`). Docs-only, test-only, and other tooling-only PRs do not.
- Track open work in `TODO.md`.

## Layout

- `gh-repo-report.sh` - collector (bash + `gh` + `jq`), writes the report JSON (path in `$1`; `dist/data.json` in the workflow)
- `src/` - dashboard logic (TypeScript, fully covered by tests)
- `site/` - static page shell (`index.html`, `styles.css`, `favicon.svg`)
- `design-system/` - tokens, components (`components/`), and showcase used by the page
- `scripts/` - build (`build.mjs`), report gate (`verify-report.mjs`), release gate (`check-release.mjs`), coverage summary, HTML lint
- `test/` - Vitest suites, including the collector tests with a stubbed `gh`
- `.husky/` - git hooks: pre-commit (lint-staged), commit-msg, post-commit (lockfile check), pre-push (full suite; refuses pushes to `main`)
- `.github/` - CI, release, daily report and Pages deploy (`report.yml`), dependabot, templates
