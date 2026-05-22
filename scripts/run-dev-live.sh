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

cd "$PROJECT_ROOT"
exec npm run dev -- --hostname 0.0.0.0 --port 3000
