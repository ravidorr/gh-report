# TODO

- [ ] Rotate the `REPORT_TOKEN` secret periodically and keep its scopes to `repo` and `security_events`
- [ ] Show the age of open pull requests on the dashboard
- [ ] Failed-workflow detection reads only the 100 most recent completed runs on the default branch (the collector warns when more exist); query each workflow's latest run instead
- [ ] One repo with an unexpected API response still aborts the whole collector run (loud, and the last good site stays up); mark that repo as an error and continue
