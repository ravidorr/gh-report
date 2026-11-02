# gh-report

[![CI](https://github.com/ravidorr/gh-report/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidorr/gh-report/actions/workflows/ci.yml) [![Release](https://github.com/ravidorr/gh-report/actions/workflows/release.yml/badge.svg)](https://github.com/ravidorr/gh-report/actions/workflows/release.yml)

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ravidorr/gh-report/pulls) [![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/ravidorr/gh-report/graphs/commit-activity) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A daily GitHub Action that collects branches, open pull requests, open issues, failed workflows and security alerts for your repositories, then publishes them as a static dashboard on GitHub Pages.

**[View the live report](https://ravidorr.github.io/gh-report/)** (refreshed daily at 05:17 UTC).

## How it works

1. `gh-repo-report.sh` (bash, `gh` and `jq`) reads every repository you own and writes `data.json`: branch counts, open PRs and issues, the workflows whose latest completed run on the default branch failed (among the repo's last 100 completed runs, ignoring cancelled runs and Dependabot update runs), and open Dependabot, code scanning and secret scanning alerts. Secret values are never stored.
2. `npm run build` bundles the page from `site/`, `src/` and `design-system/` into `dist/`.
3. The `Repo report` workflow runs both daily at 05:17 UTC (and on demand). `scripts/verify-report.mjs` then checks the data, and only a complete report is deployed to GitHub Pages. If any request failed, the report is empty, or the token cannot read an alert API for more than 20% of the repos, the run fails and the last good site stays up. Set `ALLOW_EMPTY_REPORT=true` in the verify step if an empty report is intended.
4. A failed or unreadable figure is never shown as 0: the page shows `?`, "Not checked" or "Error", counts them on the tiles, and warns when the data is more than 36 hours old.

## Setup

1. Create a token: GitHub > Settings > Developer settings > Personal access tokens (classic) with scopes `repo` and `security_events`. Fine-grained tokens also work if they have read access to contents, pull requests, issues, actions, Dependabot alerts, code scanning alerts and secret scanning alerts on all repos.
2. Repo > Settings > Secrets and variables > Actions > New repository secret: name `REPORT_TOKEN`, value the token.
3. Repo > Settings > Pages > Source: GitHub Actions.
4. Optional: add a repository secret `EXCLUDE_REPOS` with repo names to leave out, separated by commas or spaces. Use a secret, not a variable: variables are printed in plain text in public workflow logs, secrets are masked.
5. Actions tab > "Repo report" > Run workflow. The page URL appears in the deploy job.

## Privacy of the published page

The Pages site is public. The workflow sets `INCLUDE_PRIVATE: "false"`, so private repositories, their names and their alerts are not published, and a test fails if that line is removed. Set it to `"true"` only if you accept publishing private repository names. The workflow also sets `ALERT_DETAILS: "false"`, so the published `data.json` keeps only the number and link of each alert, never package names, alert file paths, secret types, error text or workflow file paths. The page does publish public repository names, the titles of open pull requests and issues, and the names of failed workflows and their branches. Forks and archived repositories are skipped unless `INCLUDE_FORKS` or `INCLUDE_ARCHIVED` is `"true"`.

## Run it locally

```bash
nvm install && nvm use
npm install
npm run build
INCLUDE_PRIVATE=false bash gh-repo-report.sh dist/data.json
python3 -m http.server -d dist
```

Requires Node.js 24.22.2 or a later 24.x (pinned in `.nvmrc`), an authenticated `gh`, `jq`, `bash`, and `python3` for the local server. Linting and the pre-push hook also need `shellcheck` (`brew install shellcheck`). Open `http://localhost:8000`. The collector's environment variables are documented at the top of `gh-repo-report.sh`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run lint` | Run ESLint, Stylelint, html-validate, markdownlint, and ShellCheck |
| `npm run typecheck` | Type-check `src/`, the TypeScript tests, and `vitest.config.ts` |
| `npm test` | Run tests, including the collector against a stubbed `gh` |
| `npm run test:coverage` | Run tests with the mandatory 100% coverage gate (measures `src/`; the collector and `scripts/` are covered by behaviour tests) |
| `npm run build` | Build the deployable site into `dist/` |

## Documentation

- [Contributing](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)
- [Security](./SECURITY.md)
- [Privacy](./PRIVACY.md)
- [Support](./SUPPORT.md)
- [Design system](./design-system/README.md)
- [Agent guide](./AGENTS.md)

## License

See [LICENSE](./LICENSE).
