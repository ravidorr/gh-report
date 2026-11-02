#!/usr/bin/env bash
# Collects per-repo branches, open PRs, open issues, latest failed workflow runs,
# open Dependabot alerts (malware flagged separately), open code scanning alerts and open
# secret scanning alerts for all repos you own. Output: gh-repo-report.json (or the path in $1).
#
# Optional env (all default to the values shown):
#   INCLUDE_PRIVATE=true     set to "false" for anything published (GitHub Pages is public)
#   INCLUDE_FORKS=false
#   INCLUDE_ARCHIVED=false
#   EXCLUDE_REPOS=""         repo names to leave out, separated by commas or spaces
#   ALERT_DETAILS=true       set to "false" for anything published: alerts keep only number and url
#                            (no package names, code paths or secret types), so counts still work
# Requires: gh (authenticated), jq. Token scopes: repo, security_events (for the alert APIs).
set -euo pipefail

OUT="${1:-gh-repo-report.json}"
OWNER="$(gh api user --jq .login)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

EXCLUDE_JSON="$(printf '%s' "${EXCLUDE_REPOS:-}" | tr ', ' '\n' | jq -R . | jq -s 'map(select(length > 0))')"

gh api "user/repos?affiliation=owner&per_page=100" --paginate \
  --jq '.[] | {name, full_name, html_url, private, fork, archived, default_branch}' \
  | jq -s --arg priv "${INCLUDE_PRIVATE:-true}" --arg forks "${INCLUDE_FORKS:-false}" \
      --arg arch "${INCLUDE_ARCHIVED:-false}" --argjson ex "$EXCLUDE_JSON" '
      map(select(($priv == "true") or (.private | not))
        | select(($forks == "true") or (.fork | not))
        | select(($arch == "true") or (.archived | not))
        | select(.name as $n | $ex | index($n) | not))' > "$TMP/repos.json"

echo "Found $(jq length "$TMP/repos.json") repos for $OWNER" >&2

while read -r repo; do
  full="$(jq -r .full_name <<<"$repo")"
  url="$(jq -r .html_url <<<"$repo")"
  echo "Processing $full" >&2

  # A failing endpoint must degrade only its own field: assign the fallback instead of appending it
  # to partial output, which would produce two JSON values and abort the whole report.
  branches="$(gh api "repos/$full/branches?per_page=100" --paginate --jq '.[].name' 2>/dev/null | jq -R . | jq -s 'length')" || branches=null

  prs="$(gh api "repos/$full/pulls?state=open&per_page=100" --paginate \
    --jq '.[] | {number, title, url: .html_url, draft}' 2>/dev/null | jq -s '.')" || prs='[]'

  issues="$(gh api "repos/$full/issues?state=open&per_page=100" --paginate \
    --jq '.[] | select(.pull_request == null) | {number, title, url: .html_url}' 2>/dev/null | jq -s '.')" || issues='[]'

  # Latest run per workflow; keep only those whose latest run failed. Dependabot's own "Update" jobs
  # (path dynamic/dependabot/...) are skipped: they exit 1 whenever any alert in a batch cannot be
  # fixed, even when they opened PRs, so they say nothing about the repo's CI. Other runs are kept,
  # including Pages deployments and CodeQL. A later green run of the same workflow clears a failure.
  if runs_raw="$(gh api "repos/$full/actions/runs?per_page=100" --jq '.workflow_runs' 2>/dev/null)"; then
    failed="$(jq '
      map(select((.path // "") | startswith("dynamic/dependabot/") | not))
      | group_by(.workflow_id)
      | map(sort_by(.created_at) | last)
      | map(select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "startup_failure"))
      | map({workflow: .name, conclusion, branch: .head_branch, created_at, path: ((.path // "") | sub("@.*"; "")), url: .html_url})
    ' <<<"$runs_raw")"
  else
    failed='[]'
  fi

  # Dependabot alerts: status ok | disabled | no_permission | error
  # GitHub answers 403 both for "alerts disabled" and for a token without access,
  # so classify by the message text, not the status code.
  message=""
  dep_alerts='[]'
  if alerts_raw="$(gh api "repos/$full/dependabot/alerts?state=open&per_page=100" --paginate 2>"$TMP/err")"; then
    status="ok"
    dep_alerts="$(jq -s 'add // []
      | map({number, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem,
             scope: .dependency.scope, severity: .security_advisory.severity,
             classification: .security_advisory.classification,
             summary: .security_advisory.summary, url: .html_url})' <<<"$alerts_raw")"
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

  # Code scanning alerts: status ok | disabled | no_permission | error
  cs_alerts='[]'; cs_status="ok"; cs_message=""
  if cs_raw="$(gh api "repos/$full/code-scanning/alerts?state=open&per_page=100" --paginate 2>"$TMP/err")"; then
    cs_alerts="$(jq -s 'add // []
      | map({number, rule: .rule.id, tool: .tool.name,
             severity: (.rule.security_severity_level // .rule.severity),
             path: .most_recent_instance.location.path,
             summary: (.rule.description // .rule.name), url: .html_url})' <<<"$cs_raw")"
  else
    cs_message="$(cat "$TMP/err") $(jq -r '.message? // empty' <<<"$cs_raw" 2>/dev/null || true)"
    lower="$(tr '[:upper:]' '[:lower:]' <<<"$cs_message")"
    case "$lower" in
      *"no analysis found"*|*"not enabled"*|*"disabled"*|*"advanced security must be enabled"*) cs_status="disabled" ;;
      *"resource not accessible"*|*"must have admin"*|*"requires authentication"*|*"bad credentials"*|*"saml"*|*"403"*) cs_status="no_permission" ;;
      *) cs_status="error" ;;
    esac
  fi

  # Secret scanning alerts: status ok | disabled | no_permission | error. Never stores the secret itself.
  ss_alerts='[]'; ss_status="ok"; ss_message=""
  if ss_raw="$(gh api "repos/$full/secret-scanning/alerts?state=open&per_page=100" --paginate 2>"$TMP/err")"; then
    ss_alerts="$(jq -s 'add // []
      | map({number, secret_type: (.secret_type_display_name // .secret_type),
             validity, created_at, url: .html_url})' <<<"$ss_raw")"
  else
    ss_message="$(cat "$TMP/err") $(jq -r '.message? // empty' <<<"$ss_raw" 2>/dev/null || true)"
    lower="$(tr '[:upper:]' '[:lower:]' <<<"$ss_message")"
    case "$lower" in
      *"disabled"*|*"not enabled"*|*"advanced security must be enabled"*) ss_status="disabled" ;;
      *"resource not accessible"*|*"must have admin"*|*"requires authentication"*|*"bad credentials"*|*"saml"*|*"403"*|*"404"*) ss_status="no_permission" ;;
      *) ss_status="error" ;;
    esac
  fi

  jq -n \
    --argjson repo "$repo" --argjson branches "${branches:-null}" \
    --argjson prs "$prs" --argjson issues "$issues" \
    --argjson failed "$failed" --argjson malware "$malware" --argjson dep_alerts "$dep_alerts" \
    --argjson cs_alerts "$cs_alerts" --arg cs_status "$cs_status" --arg cs_message "$cs_message" \
    --argjson ss_alerts "$ss_alerts" --arg ss_status "$ss_status" --arg ss_message "$ss_message" \
    --arg status "$status" --arg message "$message" --arg url "$url" \
    --arg details "${ALERT_DETAILS:-true}" '
    def slim: if $details == "true" then . else map({number, url}) end;
    $repo + {
      branches: {count: $branches, url: ($url + "/branches")},
      open_prs: $prs,
      open_issues: $issues,
      failed_workflows: $failed,
      dependabot: {status: $status, message: $message, malware_alerts: ($malware | slim), alerts: ($dep_alerts | slim), url: ($url + "/security/dependabot")},
      code_scanning: {status: $cs_status, message: $cs_message, alerts: ($cs_alerts | slim), url: ($url + "/security/code-scanning")},
      secret_scanning: {status: $ss_status, message: $ss_message, alerts: ($ss_alerts | slim), url: ($url + "/security/secret-scanning")}
    }' > "$TMP/$(echo "$full" | tr '/' '_').json"
done < <(jq -c '.[]' "$TMP/repos.json")

jq -s --arg at "$(date -u +%FT%TZ)" '{generated_at: $at, repos: .}' "$TMP"/*_*.json > "$OUT"
echo "Wrote $OUT" >&2
