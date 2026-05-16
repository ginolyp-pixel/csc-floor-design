#!/usr/bin/env bash
# Deploy script for csc-floor-design on VPS.
# Run from /opt/csc-floor-design after `git pull`, or call directly.
set -euo pipefail

APP_DIR="/opt/csc-floor-design"
APP_NAME="csc-designer"

cd "$APP_DIR"

echo "==> Pulling latest from origin/main"
git fetch --quiet origin main
git reset --hard origin/main

echo "==> Installing production deps"
npm ci --silent

echo "==> Building client bundle"
npm run build --silent

echo "==> Restarting PM2 process: $APP_NAME"
# `startOrReload` always re-reads ecosystem.config.cjs from scratch, so newly-
# added env vars (DATA_DIR etc.) propagate to the process. Plain `pm2 restart
# --update-env` only refreshes existing keys, not new ones.
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "==> Done. Health:"
sleep 2
curl -fsS http://127.0.0.1:3001/api/health || echo "  (health check failed)"
echo
