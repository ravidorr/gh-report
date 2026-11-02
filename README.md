# GitHub repo report

Daily GitHub Action collects branches, open PRs, open issues, failed workflows and Dependabot
malware alerts for your repos, then publishes a static page with GitHub Pages.

## Setup

1. Create a repo (for example `ravidorr/gh-report`) and push these files to `main`.
2. Create a token: GitHub > Settings > Developer settings > Personal access tokens (classic)
   with scopes `repo` and `security_events`. Fine-grained tokens also work if they have
   read access to contents, pull requests, issues, actions and Dependabot alerts on all repos.
3. Repo > Settings > Secrets and variables > Actions > New repository secret:
   name `REPORT_TOKEN`, value the token.
4. Repo > Settings > Pages > Source: GitHub Actions.
5. Actions tab > "Repo report" > Run workflow. The page URL appears in the deploy job.

## Notes

- The Pages site is public. `INCLUDE_PRIVATE` in `.github/workflows/report.yml` is `"false"`,
  so private repos are not published. Set it to `"true"` only if you accept that.
- Runs daily at 05:17 UTC and on demand.
- To test locally: `INCLUDE_PRIVATE=false bash gh-repo-report.sh site/data.json`, then serve `site/`
  with `python3 -m http.server -d site`.
