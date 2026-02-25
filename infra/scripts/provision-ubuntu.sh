#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

usage() {
  cat <<'EOF'
Provision Ubuntu host dependencies for Apployd.

Usage:
  bash infra/scripts/provision-ubuntu.sh [--with-falco|--without-falco]

Options:
  --with-falco     Install and enable Falco runtime security (default)
  --without-falco  Skip Falco installation
EOF
}

WITH_FALCO=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-falco)
      WITH_FALCO=true
      shift
      ;;
    --without-falco)
      WITH_FALCO=false
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

# Provision Ubuntu 22.04 host for Apployd
sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  nginx \
  certbot \
  python3-certbot-nginx \
  ufw \
  git

# Docker
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Node.js 20
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo systemctl enable docker
sudo systemctl start docker
sudo systemctl enable nginx
sudo systemctl start nginx

# Host hardening
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

if [[ "$WITH_FALCO" == "true" ]]; then
  bash "$SCRIPT_DIR/install-falco.sh"
fi

echo "Provisioning complete."
