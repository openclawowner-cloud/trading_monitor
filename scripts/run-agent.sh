#!/usr/bin/env bash
set -euo pipefail

TELEMETRY_ROOT="${1:-}"
AGENT_OUT_DIR="${2:-}"
PYTHON_BIN="${3:-python3}"
SCRIPT_PATH="${4:-}"
shift 4 || true

if [[ -z "${SCRIPT_PATH}" ]]; then
  echo "run-agent.sh: missing script path" >&2
  exit 2
fi

export TELEMETRY_ROOT
export AGENT_OUT_DIR
export PYTHONUNBUFFERED=1

# If this Python belongs to a venv, prepend its site-packages.
PY_SITE="$("${PYTHON_BIN}" -c 'import site; s=site.getsitepackages(); print(s[0] if s else "")' 2>/dev/null || true)"
if [[ -n "${PY_SITE}" ]]; then
  if [[ -n "${PYTHONPATH:-}" ]]; then
    export PYTHONPATH="${PY_SITE}:${PYTHONPATH}"
  else
    export PYTHONPATH="${PY_SITE}"
  fi
fi

exec "${PYTHON_BIN}" "${SCRIPT_PATH}" "$@"
