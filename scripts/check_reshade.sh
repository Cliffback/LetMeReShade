#!/usr/bin/env bash
# Check if a new ReShade version is available.
# Usage: ./check_reshade.sh 6.6.1
# Exit codes: 0 up-to-date, 1 update available, 2 error

set -euo pipefail

CURRENT="${1:-}"
if [[ -z "$CURRENT" ]]; then
  echo "Usage: $0 <current_version>"
  exit 2
fi

fetch() {
  curl -fsSL --max-time 20 "https://reshade.me/"
}

get_latest() {
  local html
  html="$(fetch || true)"
  [[ -z "$html" ]] && return 1

  if [[ "$html" =~ Download[[:space:]]+ReShade[[:space:]]+([0-9]+\.[0-9]+\.[0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

LATEST="$(get_latest || true)"
if [[ -z "$LATEST" ]]; then
  echo "Could not determine latest ReShade version."
  exit 2
fi

CMP="$(python3 - <<PY
def norm(v):
    p=v.split('.')
    return list(map(int,(p+[0,0])[:3]))
a=norm("$LATEST"); b=norm("$CURRENT")
print((a>b)-(a<b))
PY
)"

if [[ "$CMP" -gt 0 ]]; then
  echo "New ReShade version available: $LATEST (you have $CURRENT)"
  echo "Download: https://reshade.me/"
  exit 1
elif [[ "$CMP" -eq 0 ]]; then
  echo "You are up-to-date: $CURRENT"
  exit 0
else
  echo "Your version ($CURRENT) is newer than site ($LATEST)."
  exit 0
fi
