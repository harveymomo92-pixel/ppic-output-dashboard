#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${PPIC_DASHBOARD_ENV_FILE:-/root/.config/ppic-output-dashboard/runtime.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${PPIC_ODATA_URL:-}" ]]; then
  echo "PPIC_ODATA_URL is not set; scheduled OData sync cannot run." >&2
  exit 1
fi

cd "$PROJECT_ROOT"
exec node scripts/sync-odata.mjs --source "$PPIC_ODATA_URL"
