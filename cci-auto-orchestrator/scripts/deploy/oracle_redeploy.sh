#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/cci/app"
DATA_DIR="/opt/cci/data"
COMPOSE_FILE="$APP_DIR/deploy/docker-compose.oracle.yml"

mkdir -p "$DATA_DIR/config"
mkdir -p "$DATA_DIR/runtime"
mkdir -p "$DATA_DIR/server-db"
mkdir -p "$DATA_DIR/server-artifacts"
mkdir -p "$DATA_DIR/server-exports"
mkdir -p "$DATA_DIR/server-reports"
mkdir -p "$DATA_DIR/server-uploads"

# First deploy: copy baseline config files into persistent directory.
if [ -z "$(ls -A "$DATA_DIR/config" 2>/dev/null || true)" ]; then
  cp -a "$APP_DIR/config/." "$DATA_DIR/config/"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "docker compose not found"
  exit 1
fi

$COMPOSE_CMD -f "$COMPOSE_FILE" up -d --build

if command -v curl >/dev/null 2>&1; then
  set +e
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${CCI_HOST_PORT:-8000}/auth/login")
  set -e
  echo "health_check_status=$HTTP_CODE"
fi
