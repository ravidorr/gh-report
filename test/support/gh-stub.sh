#!/usr/bin/env bash
# A fake `gh` for the collector tests. It serves canned responses from $FIXTURES and applies --jq with
# the real jq (once per JSON document, like `gh api --paginate --jq`). Every call is logged with its
# full arguments to $FIXTURES/calls.log.
#
# Fixture files, named after the endpoint path without its query ("/" becomes "_"):
#   <key>.json     response body (may hold several concatenated documents to imitate pages)
#   <key>.err      make the call fail; the file is printed on stderr
#   <key>.out      printed on stdout when the call fails (gh prints the API error body there)
#   <key>.partial  printed on stdout, then the call fails (a page was received before the failure)
#   <key>.flaky    a number N: the first N calls fail with an HTTP 502 error, later ones succeed
shift
path="$1"
shift
args="$*"
jqf=""
while [ $# -gt 0 ]; do
  case "$1" in
    --jq)
      jqf="$2"
      shift 2
      ;;
    *) shift ;;
  esac
done
echo "$path $args" >>"$FIXTURES/calls.log"
key="${path%%\?*}"
key="${key//\//_}"

if [ -f "$FIXTURES/$key.flaky" ]; then
  limit="$(cat "$FIXTURES/$key.flaky")"
  done_so_far="$(cat "$FIXTURES/$key.count" 2>/dev/null || echo 0)"
  if [ "$done_so_far" -lt "$limit" ]; then
    echo $((done_so_far + 1)) >"$FIXTURES/$key.count"
    echo "gh: Bad Gateway (HTTP 502)" >&2
    exit 1
  fi
fi
if [ -f "$FIXTURES/$key.partial" ]; then
  cat "$FIXTURES/$key.partial"
  echo "gh: connection reset" >&2
  exit 1
fi
if [ -f "$FIXTURES/$key.err" ]; then
  if [ -f "$FIXTURES/$key.out" ]; then cat "$FIXTURES/$key.out"; fi
  cat "$FIXTURES/$key.err" >&2
  exit 1
fi
if [ ! -f "$FIXTURES/$key.json" ]; then
  echo "gh: Not Found (HTTP 404)" >&2
  exit 1
fi
if [ -n "$jqf" ]; then jq -rc "$jqf" "$FIXTURES/$key.json"; else cat "$FIXTURES/$key.json"; fi
