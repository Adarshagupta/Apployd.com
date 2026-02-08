#!/usr/bin/env bash
set -euo pipefail

# Apply base Nginx config and reload
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

sudo cp "$SCRIPT_DIR/../nginx/nginx.conf" /etc/nginx/nginx.conf
sudo mkdir -p /opt/apployd/nginx/templates
sudo cp "$SCRIPT_DIR/../nginx/templates/project.conf.tpl" /opt/apployd/nginx/templates/project.conf.tpl

sudo nginx -t
sudo systemctl reload nginx

echo "Nginx config installed."
