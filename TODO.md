# TODO

- [ ] Confirm the manual Advanced Security items (malware alerts, grouped security updates, automatic dependency submission) at <https://github.com/ravidorr/gh-report/settings/security_analysis>
- [ ] After the baseline PR merges, add `javascript-typescript` to the CodeQL default setup (`gh api -X PATCH repos/ravidorr/gh-report/code-scanning/default-setup`); only `actions` can be configured while `main` has no TypeScript
- [ ] Rotate the `REPORT_TOKEN` secret periodically and keep its scopes to `repo` and `security_events`
- [ ] Show the age of open pull requests on the dashboard
