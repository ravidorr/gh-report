#!/usr/bin/env bash
# Collects per-repo branches, open PRs, open issues, latest failed workflow runs,
# and open Dependabot malware alerts for all repos you own. Output: gh-repo-report.json
# Optional env: INCLUDE_PRIVATE, INCLUDE_FORKS, INCLUDE_ARCHIVED (default true each).
# Requires: gh (authenticated), jq. Token scopes: repo, security_events (for Dependabot alerts).
set -euo pipefail

OUT="${1:-gh-repo-report.json}"
OWNER="$(gh api user --jq .login)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

gh api "user/repos?affiliation=owner&per_page=100" --paginate \
  --jq '.[] | {name, full_name, html_url, private, fork, archived, default_branch}' \
  | jq -s --arg priv "${INCLUDE_PRIVATE:-true}" --arg forks "${INCLUDE_FORKS:-true}" --arg arch "${INCLUDE_ARCHIVED:-true}" '
      map(select(($priv == "true") or (.private | not))
        | select(($forks == "true") or (.fork | not))
        | select(($arch == "true") or (.archived | not)))' > "$TMP/repos.json"

echo "Found $(jq length "$TMP/repos.json") repos for $OWNER" >&2

while read -r repo; do
  full="$(jq -r .full_name <<<"$repo")"
  url="$(jq -r .html_url <<<"$repo")"
  echo "Processing $full" >&2

  branches="$(gh api "repos/$full/branches?per_page=100" --paginate --jq '.[].name' 2>/dev/null | jq -R . | jq -s 'length' || echo null)"

  prs="$(gh api "repos/$full/pulls?state=open&per_page=100" --paginate \
    --jq '.[] | {number, title, url: .html_url, draft}' 2>/dev/null | jq -s '.' || echo '[]')"

  issues="$(gh api "repos/$full/issues?state=open&per_page=100" --paginate \
    --jq '.[] | select(.pull_request == null) | {number, title, url: .html_url}' 2>/dev/null | jq -s '.' || echo '[]')"

  # Latest run per workflow; keep only those whose latest run failed.
  if runs_raw="$(gh api "repos/$full/actions/runs?per_page=100" --jq '.workflow_runs' 2>/dev/null)"; then
    failed="$(jq '
      group_by(.workflow_id)
      | map(sort_by(.created_at) | last)
      | map(select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "startup_failure"))
      | map({workflow: .name, conclusion, branch: .head_branch, created_at, url: .html_url})
    ' <<<"$runs_raw")"
  else
    failed='[]'
  fi

  # Dependabot alerts: status ok | disabled | no_permission | error
  # GitHub answers 403 both for "alerts disabled" and for a token without access,
  # so classify by the message text, not the status code.
  message=""
  if alerts_raw="$(gh api "repos/$full/dependabot/alerts?state=open&per_page=100" --paginate 2>"$TMP/err")"; then
    status="ok"
    malware="$(jq -s 'add // []
      | map(select(.security_advisory.classification == "malware")
        | {number, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem,
           summary: .security_advisory.summary, url: .html_url})' <<<"$alerts_raw")"
  else
    message="$(cat "$TMP/err") $(jq -r '.message? // empty' <<<"$alerts_raw" 2>/dev/null || true)"
    malware='[]'
    lower="$(tr '[:upper:]' '[:lower:]' <<<"$message")"
    case "$lower" in
      *"disabled"*) status="disabled" ;;
      *"resource not accessible"*|*"must have admin"*|*"requires authentication"*|*"bad credentials"*|*"saml"*|*"not found"*|*"403"*|*"404"*) status="no_permission" ;;
      *) status="error" ;;
    esac
  fi

  jq -n \
    --argjson repo "$repo" --argjson branches "${branches:-null}" \
    --argjson prs "$prs" --argjson issues "$issues" \
    --argjson failed "$failed" --argjson malware "$malware" \
    --arg status "$status" --arg message "$message" --arg url "$url" '
    $repo + {
      branches: {count: $branches, url: ($url + "/branches")},
      open_prs: $prs,
      open_issues: $issues,
      failed_workflows: $failed,
      dependabot: {status: $status, message: $message, malware_alerts: $malware, url: ($url + "/security/dependabot")}
    }' > "$TMP/$(echo "$full" | tr '/' '_').json"
done < <(jq -c '.[]' "$TMP/repos.json")

jq -s --arg at "$(date -u +%FT%TZ)" '{generated_at: $at, repos: .}' "$TMP"/*_*.json > "$OUT"
echo "Wrote $OUT" >&2
