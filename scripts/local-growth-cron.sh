#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3001}"
STATE_DIR="${STATE_DIR:-/tmp/nichefinder-local-cron}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$STATE_DIR"
cd "$PROJECT_DIR"

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "CRON_SECRET is missing in .env.local"
  exit 1
fi

run_cron() {
  local path="$1"
  local label="$2"
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[$now] starting $label ($path)"
  curl -fsS --max-time 900 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${APP_URL}${path}" \
    > "${STATE_DIR}/${label}-$(date -u +"%Y%m%dT%H%M%SZ").json"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] finished $label"
}

run_once_per_minute() {
  local key="$1"
  local stamp
  stamp="$(date -u +"%Y-%m-%d-%H-%M")"
  local marker="${STATE_DIR}/${key}-${stamp}.done"
  if [[ -f "$marker" ]]; then
    return 1
  fi
  touch "$marker"
  return 0
}

echo "NicheFinder local cron started."
echo "Using ${APP_URL}"
echo "Schedule is UTC: 03 refresh, 04 grow-discover, 05 auto-search + keyword-discovery, 06 grow-tune."

while true; do
  minute="$(date -u +"%H:%M")"

  case "$minute" in
    "03:00")
      if run_once_per_minute "refresh-seeds"; then
        run_cron "/api/cron/refresh-seeds" "refresh-seeds"
      fi
      ;;
    "04:00")
      if run_once_per_minute "grow-discover"; then
        run_cron "/api/cron/grow-discover" "grow-discover"
      fi
      ;;
    "05:00")
      if run_once_per_minute "auto-search"; then
        run_cron "/api/cron/auto-search" "auto-search"
      fi
      if run_once_per_minute "keyword-discovery"; then
        run_cron "/api/cron/keyword-discovery" "keyword-discovery"
      fi
      ;;
    "06:00")
      if run_once_per_minute "grow-tune"; then
        run_cron "/api/cron/grow-tune" "grow-tune"
      fi
      ;;
  esac

  sleep 20
done
