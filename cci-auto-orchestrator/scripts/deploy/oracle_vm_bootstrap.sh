#!/usr/bin/env bash
set -euo pipefail

# Oracle Linux / Ubuntu 계열 공통 설치 시도
if command -v dnf >/dev/null 2>&1; then
  sudo dnf -y update
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"

sudo mkdir -p /opt/cci/app /opt/cci/data
sudo mkdir -p /opt/cci/data/config
sudo mkdir -p /opt/cci/data/runtime
sudo mkdir -p /opt/cci/data/server-db
sudo mkdir -p /opt/cci/data/server-artifacts
sudo mkdir -p /opt/cci/data/server-exports
sudo mkdir -p /opt/cci/data/server-reports
sudo mkdir -p /opt/cci/data/server-uploads
sudo chown -R "$USER":"$USER" /opt/cci

echo "bootstrap_done=true"
echo "next_steps=register_github_secrets_and_run_workflow"
