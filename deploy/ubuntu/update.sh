#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/trading-monitor"
BRANCH="main"
SERVICE_NAME="trading-monitor"

echo "[update] cd ${APP_DIR}"
cd "${APP_DIR}"

echo "[update] fetching ${BRANCH}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "[update] installing node deps"
npm ci

echo "[update] ensuring linux runner executable"
chmod +x scripts/run-agent.sh || true

echo "[update] restarting ${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "[update] health check"
sleep 2
curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null

echo "[update] done"
