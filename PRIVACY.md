# Privacy

Last updated: 2026-11-02

## Data we collect

gh-report collects no data about visitors. It reads repository metadata of the account that owns the access token through the GitHub API: repository names and links (which include the owner's GitHub login), branch counts, the titles of open pull requests and issues (written by their authors), the names and branches of failed workflow runs, and the number and link of each open security alert. Secret values are never stored, and the published data has no package names, alert file paths, secret types, error text or workflow file paths.

## How data is used

The metadata is written to `data.json` and rendered as a dashboard. The published GitHub Pages site is public, so by default only public repositories are included (`INCLUDE_PRIVATE` is `false` in the workflow), and security alerts are reduced to their number and link (`ALERT_DETAILS` is `false`), so package names, file paths and secret types are not published. Anyone can read the published data. Nothing is sold.

## Third parties

GitHub is the only third party (API, Actions and Pages). The dashboard page makes no network calls other than loading its own `data.json`, and it has no analytics or cookies.

## Contact

Questions: open a [GitHub issue](https://github.com/ravidorr/gh-report/issues). For security matters, see [SECURITY.md](./SECURITY.md).
