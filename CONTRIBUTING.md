# Contributing

## Setup

```bash
nvm install && nvm use
npm install
```

Also needed on your PATH: `bash`, `jq`, and `shellcheck` (`brew install shellcheck`); the collector tests and the pre-push hook use them.

## Workflow

1. Branch from `main`.
2. Make changes. Hooks run lint-staged (ESLint, Stylelint, html-validate, markdownlint on the staged files) on commit, and the full lint (including ShellCheck), typecheck, coverage, and release gate on push, which also refuses pushes to `main`. Never bypass them.
3. Commit subjects are at least 15 characters. This repository uses GitHub issues, so no ticket key is required.
4. If the PR changes a release-relevant path (see Release policy), update `CHANGELOG.md` and increase the version in `package.json`.
5. Open a **draft** PR with a short intro and bullets. Add `Closes #<issue>` only when it resolves an issue.

## Standards

- Strict ESLint, Stylelint, html-validate, markdownlint, and ShellCheck must pass.
- Test coverage must be 100% (lines, functions, branches, statements). It is enforced on push and in CI; never lower the thresholds.
- UI changes use `/design-system` tokens and components.
- See [AGENTS.md](./AGENTS.md) for the full rule list.

## Release policy

When a PR or push to `main` changes `package.json`, `tsconfig.json`, `src/`, `gh-repo-report.sh`, `site/`, `design-system/`, `scripts/build.mjs`, `scripts/verify-report.mjs`, or `.github/workflows/report.yml` (plus the few other paths built into `scripts/check-release.mjs`, such as `lib/` and `bin/`), CI runs the release gate (except for Dependabot PRs): the package version must increase (SemVer) and `CHANGELOG.md` must have a non-empty section for that version. PRs that only touch docs, tests, or other workflows and tooling do not need a bump. Tagged releases (`vX.Y.Z`) must match `package.json` and have non-empty notes extracted from the changelog.
