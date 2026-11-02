#!/usr/bin/env bash
# Collects per-repo branches, open PRs, open issues, the workflows whose latest run failed, open
# Dependabot alerts (malware flagged separately), open code scanning alerts and open secret
# scanning alerts for all repos you own. Output: gh-repo-report.json (or the path in $1).
#
# This script defines the schema of data.json. Keep it in sync with src/types.ts and src/parse.ts.
#
# Optional env. A variable that is set but empty counts as "not true" (fail closed):
#   INCLUDE_PRIVATE=true     set to "false" for anything published (GitHub Pages is public)
#   INCLUDE_FORKS=false
#   INCLUDE_ARCHIVED=false
#   EXCLUDE_REPOS=""         bare repo names (not owner/name, case-sensitive) to leave out,
#                            separated by commas or spaces
#   ALERT_DETAILS=true       set to "false" for anything published: alerts keep only number and url,
#                            and the error text and workflow file paths are dropped. PR and issue
#                            titles, workflow names and branch names are still included.
#   MAX_ATTEMPTS=3           attempts per API call when GitHub answers with a rate limit or 5xx error
#   RETRY_DELAY=2            seconds to wait after the first failed attempt (doubles are not used:
#                            the wait is attempt number times this value)
# The published workflow (.github/workflows/report.yml) sets INCLUDE_PRIVATE and ALERT_DETAILS to "false".
# Requires: gh (authenticated), jq. Token scopes: repo, security_events (for the alert APIs).
set -euo pipefail

OUT="${1:-gh-repo-report.json}"
OWNER="$(gh api user --jq .login)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

INCLUDE_PRIVATE="${INCLUDE_PRIVATE-true}"
INCLUDE_FORKS="${INCLUDE_FORKS-false}"
INCLUDE_ARCHIVED="${INCLUDE_ARCHIVED-false}"
ALERT_DETAILS="${ALERT_DETAILS-true}"

# A GitHub Actions annotation when running in Actions, a plain line otherwise. Never fatal.
warn() {
  local text
  text="$(tr '\n' ' ' <<<"$*")"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning::$text" >&2; else echo "warning: $text" >&2; fi
}

# gh api wrapper: stdout goes to $TMP/out, stderr to $TMP/err. Retries only when GitHub says to slow
# down or has a server-side problem, so a permission error fails immediately.
call() {
  local attempt=1
  while true; do
    if gh api "$@" >"$TMP/out" 2>"$TMP/err"; then return 0; fi
    if [ "$attempt" -ge "${MAX_ATTEMPTS:-3}" ] ||
      ! grep -qiE 'rate limit|http 429|http 5[0-9]{2}|timed? ?out|connection (reset|refused)' "$TMP/err" "$TMP/out"; then
      return 1
    fi
    sleep $((attempt * ${RETRY_DELAY:-2}))
    attempt=$((attempt + 1))
  done
}

# Map an error message to ok-or-not status: disabled | no_permission | error. Rate limits and server
# errors are "error" (retry later), not "no_permission", so they do not send you chasing token scopes.
# The same rules apply to Dependabot, code scanning and secret scanning.
classify() {
  local lower
  lower="$(tr '[:upper:]' '[:lower:]' <<<"$1")"
  case "$lower" in
    *"rate limit"* | *"http 429"* | *"http 5"[0-9][0-9]*) echo error ;;
    *"disabled"* | *"not enabled"* | *"no analysis found"* | *"advanced security must be enabled"*) echo disabled ;;
    *"resource not accessible"* | *"must have admin"* | *"requires authentication"* | *"bad credentials"* | *"saml"* | *"not found"* | *"http 401"* | *"http 403"* | *"http 404"*) echo no_permission ;;
    *) echo error ;;
  esac
}

# scan <endpoint> <jq object mapper> <page url>: prints {status, message, alerts, url} for one alert API.
# status is ok | disabled | no_permission | error. Never stores the secret itself.
scan() {
  local status=ok message="" alerts='[]'
  if call "$1?state=open&per_page=100" --paginate; then
    # --paginate without --jq prints one JSON array per page; slurp and concatenate them.
    alerts="$(jq -s "add // [] | if type == \"array\" then . else [] end | map($2)" <"$TMP/out")"
  else
    message="$(tr '\n' ' ' <"$TMP/err") $(jq -r '.message? // empty' <"$TMP/out" 2>/dev/null || true)"
    status="$(classify "$message")"
    if [ "$status" = error ]; then warn "$full: $1 failed: $message"; fi
  fi
  jq -n --arg status "$status" --arg message "$message" --argjson alerts "$alerts" --arg url "$3" \
    '{status: $status, message: $message, alerts: $alerts, url: $url}'
}

DEPENDABOT_MAP='{number, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem,
  scope: .dependency.scope, severity: .security_advisory.severity,
  classification: .security_advisory.classification, summary: .security_advisory.summary, url: .html_url}'
CODE_SCANNING_MAP='{number, rule: .rule.id, tool: .tool.name,
  severity: (.rule.security_severity_level // .rule.severity),
  path: .most_recent_instance.location.path, summary: (.rule.description // .rule.name), url: .html_url}'
SECRET_SCANNING_MAP='{number, secret_type: (.secret_type_display_name // .secret_type), validity, created_at, url: .html_url}'

EXCLUDE_JSON="$(printf '%s' "${EXCLUDE_REPOS:-}" | tr ', ' '\n' | jq -R . | jq -s 'map(select(length > 0))')"

gh api "user/repos?affiliation=owner&per_page=100" --paginate \
  --jq '.[] | {name, full_name, html_url, private, fork, archived, default_branch}' |
  jq -s --arg priv "$INCLUDE_PRIVATE" --arg forks "$INCLUDE_FORKS" \
    --arg arch "$INCLUDE_ARCHIVED" --argjson ex "$EXCLUDE_JSON" '
      map(select(($priv == "true") or (.private | not))
        | select(($forks == "true") or (.fork | not))
        | select(($arch == "true") or (.archived | not))
        | select(.name as $n | $ex | index($n) | not))' >"$TMP/repos.json"

echo "Found $(jq length "$TMP/repos.json") repos for $OWNER" >&2
if [ "$(jq length "$TMP/repos.json")" -eq 0 ]; then
  warn "no repositories matched the filters (INCLUDE_PRIVATE, INCLUDE_FORKS, INCLUDE_ARCHIVED, EXCLUDE_REPOS)"
fi

count=0
while read -r repo; do
  count=$((count + 1))
  full="$(jq -r .full_name <<<"$repo")"
  url="$(jq -r .html_url <<<"$repo")"
  default_branch="$(jq -r .default_branch <<<"$repo")"
  echo "Processing $full" >&2

  # Names of the requests that failed. A failed request must not look like "nothing found", so the
  # page shows these as not checked instead of 0.
  errors='[]'
  note_error() {
    errors="$(jq -c --arg e "$1" '. + [$e]' <<<"$errors")"
    warn "$full: $1 request failed: $(cat "$TMP/err")"
  }

  # A failing endpoint degrades only its own field: assign the fallback instead of appending it to
  # partial output, which would produce two JSON values and abort the whole report.
  if call "repos/$full/branches?per_page=100" --paginate --jq '.[].name'; then
    branches="$(jq -R . <"$TMP/out" | jq -s 'length')"
  else
    branches=null
    note_error branches
  fi

  if call "repos/$full/pulls?state=open&per_page=100" --paginate \
    --jq '.[] | {number, title, url: .html_url, draft}'; then
    prs="$(jq -s '.' <"$TMP/out")"
  else
    prs='[]'
    note_error pulls
  fi

  if call "repos/$full/issues?state=open&per_page=100" --paginate \
    --jq '.[] | select(.pull_request == null) | {number, title, url: .html_url}'; then
    issues="$(jq -s '.' <"$TMP/out")"
  else
    issues='[]'
    note_error issues
  fi

  # Workflows whose latest run failed, among the 100 most recent completed runs on the default branch
  # (one page; older workflows can fall outside that window, which is reported as a warning).
  # Cancelled, skipped and neutral runs say nothing about health, so they never clear a failure.
  # Dependabot's own "Update" jobs (path dynamic/dependabot/...) are skipped: they exit 1 whenever any
  # alert in a batch cannot be fixed, even when they opened PRs. Other runs are kept, including Pages
  # deployments and CodeQL. A later green run of the same workflow clears a failure.
  encoded_branch="$(jq -rn --arg b "$default_branch" '$b | @uri')"
  if call "repos/$full/actions/runs?per_page=100&status=completed&exclude_pull_requests=true&branch=$encoded_branch"; then
    if jq -e '(.total_count // 0) > (.workflow_runs | length)' <"$TMP/out" >/dev/null; then
      warn "$full: more than 100 completed runs on $default_branch; failures of older workflows may be missing"
    fi
    failed="$(jq '
      .workflow_runs
      | map(select((.path // "") | startswith("dynamic/dependabot/") | not)
          | select(.conclusion | IN("success", "failure", "timed_out", "startup_failure")))
      | group_by(.workflow_id)
      | map(sort_by(.created_at) | last)
      | map(select(.conclusion != "success"))
      | map({workflow: (.name // ""), conclusion, branch: (.head_branch // ""), created_at,
             path: ((.path // "") | sub("@.*"; "")),  # strip the @ref GitHub adds to reusable-workflow paths
             url: .html_url})
    ' <"$TMP/out")"
  else
    failed='[]'
    note_error runs
  fi

  dependabot="$(scan "repos/$full/dependabot/alerts" "$DEPENDABOT_MAP" "$url/security/dependabot")"
  code_scanning="$(scan "repos/$full/code-scanning/alerts" "$CODE_SCANNING_MAP" "$url/security/code-scanning")"
  secret_scanning="$(scan "repos/$full/secret-scanning/alerts" "$SECRET_SCANNING_MAP" "$url/security/secret-scanning")"

  jq -n \
    --argjson repo "$repo" --argjson branches "$branches" --argjson errors "$errors" \
    --argjson prs "$prs" --argjson issues "$issues" --argjson failed "$failed" \
    --argjson dep "$dependabot" --argjson cs "$code_scanning" --argjson ss "$secret_scanning" \
    --arg url "$url" --arg details "$ALERT_DETAILS" '
    def slim: if $details == "true" then . else map({number, url}) end;
    def clean: if $details == "true" then . else .message = "" end;
    $repo + {
      branches: {count: $branches, url: ($url + "/branches")},
      collection_errors: $errors,
      open_prs: $prs,
      open_issues: $issues,
      failed_workflows: ($failed | if $details == "true" then . else map(del(.path)) end),
      dependabot: ($dep
        | .malware_alerts = (.alerts | map(select(.classification == "malware") | {number, package, ecosystem, summary, url}))
        | .alerts |= slim | .malware_alerts |= slim | clean),
      code_scanning: ($cs | .alerts |= slim | clean),
      secret_scanning: ($ss | .alerts |= slim | clean)
    }' >"$TMP/repo-$count.json"
done < <(jq -c '.[]' "$TMP/repos.json")

shopt -s nullglob
files=("$TMP"/repo-*.json)
shopt -u nullglob
if [ "${#files[@]}" -gt 0 ]; then jq -s . "${files[@]}" >"$TMP/all.json"; else echo '[]' >"$TMP/all.json"; fi

jq -n --slurpfile repos "$TMP/all.json" --arg at "$(date -u +%FT%TZ)" --arg details "$ALERT_DETAILS" \
  '{schema_version: 1, alert_details: ($details == "true"), generated_at: $at, repos: $repos[0]}' >"$OUT"
echo "Wrote $OUT" >&2
