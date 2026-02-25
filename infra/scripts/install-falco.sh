#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
RULES_SOURCE="$SCRIPT_DIR/../falco/rules.d/apployd_rules.yaml"
RULES_TARGET_DIR="/etc/falco/rules.d"
RULES_TARGET_FILE="$RULES_TARGET_DIR/apployd_rules.yaml"

usage() {
  cat <<'EOF'
Install and configure Falco on Ubuntu for Apployd runtime threat detection.

Usage:
  bash infra/scripts/install-falco.sh [--version <falco-version>]

Options:
  --version  Install a specific Falco package version (optional)
EOF
}

FALCO_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      FALCO_VERSION="${2:-}"
      shift 2
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

if [[ ! -f "$RULES_SOURCE" ]]; then
  echo "Falco rules file not found: $RULES_SOURCE"
  exit 1
fi

echo "Installing Falco package repository..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo apt-get install -y "linux-headers-$(uname -r)" || true

if [[ ! -f /usr/share/keyrings/falco-archive-keyring.gpg ]]; then
  curl -fsSL https://falco.org/repo/falcosecurity-packages.asc \
    | sudo gpg --dearmor -o /usr/share/keyrings/falco-archive-keyring.gpg
fi

echo "deb [signed-by=/usr/share/keyrings/falco-archive-keyring.gpg] https://download.falco.org/packages/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/falcosecurity.list >/dev/null

sudo apt-get update

if [[ -n "$FALCO_VERSION" ]]; then
  echo "Installing Falco version: $FALCO_VERSION"
  sudo apt-get install -y "falco=${FALCO_VERSION}" falcoctl || sudo apt-get install -y "falco=${FALCO_VERSION}" || sudo apt-get install -y falco
else
  sudo apt-get install -y falco falcoctl || sudo apt-get install -y falco
fi

echo "Installing Apployd Falco rules..."
sudo mkdir -p "$RULES_TARGET_DIR"
sudo cp "$RULES_SOURCE" "$RULES_TARGET_FILE"
sudo chmod 644 "$RULES_TARGET_FILE"

echo "Enabling Falco service..."
sudo systemctl daemon-reload
sudo systemctl enable falco
sudo systemctl restart falco

if ! sudo systemctl is-active --quiet falco; then
  echo "Falco service failed to start."
  sudo systemctl --no-pager --full status falco || true
  exit 1
fi

echo "Falco installed and running."
echo "Rules file: $RULES_TARGET_FILE"
echo "Check alerts with: sudo journalctl -u falco -f"
