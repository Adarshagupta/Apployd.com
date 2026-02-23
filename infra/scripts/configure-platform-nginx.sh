#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

usage() {
  cat <<'EOF'
Configure Nginx reverse proxy for dashboard + API on a single public domain.

Usage:
  bash infra/scripts/configure-platform-nginx.sh \
    --domain apployd.com \
    --dashboard-upstream http://127.0.0.1:3000 \
    --api-upstream http://127.0.0.1:4000

Required:
  --domain               Public domain for dashboard and API

Optional:
  --dashboard-upstream   Dashboard upstream URL (default: http://127.0.0.1:3000)
  --api-upstream         Control-plane upstream URL (default: http://127.0.0.1:4000)
EOF
}

DOMAIN=""
DASHBOARD_UPSTREAM="http://127.0.0.1:3000"
API_UPSTREAM="http://127.0.0.1:4000"
DEFAULT_404_SOURCE="$SCRIPT_DIR/../nginx/default-404.html"
DEFAULT_404_TARGET_DIR="/var/www/apployd"
DEFAULT_404_TARGET_FILE="$DEFAULT_404_TARGET_DIR/default-404.html"
LETSENCRYPT_DIR_BASE="/etc/letsencrypt/live"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --dashboard-upstream)
      DASHBOARD_UPSTREAM="${2:-}"
      shift 2
      ;;
    --api-upstream)
      API_UPSTREAM="${2:-}"
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

if [[ -z "$DOMAIN" ]]; then
  echo "Missing required flag: --domain"
  usage
  exit 1
fi

SSL_CERT_PATH="$LETSENCRYPT_DIR_BASE/$DOMAIN/fullchain.pem"
SSL_KEY_PATH="$LETSENCRYPT_DIR_BASE/$DOMAIN/privkey.pem"
HAS_TLS_CERT=false
if [[ -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
  HAS_TLS_CERT=true
fi

if [[ ! -f "$DEFAULT_404_SOURCE" ]]; then
  echo "Missing default 404 template: $DEFAULT_404_SOURCE"
  exit 1
fi

sudo mkdir -p "$DEFAULT_404_TARGET_DIR"
sudo cp "$DEFAULT_404_SOURCE" "$DEFAULT_404_TARGET_FILE"

TMP_FILE=$(mktemp)
cat >"$TMP_FILE" <<EOF
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  server_tokens off;
  root $DEFAULT_404_TARGET_DIR;

  add_header X-Robots-Tag "noindex, nofollow" always;

  error_page 404 /default-404.html;
  location = /default-404.html {
    internal;
    add_header Cache-Control "no-store" always;
  }

  location / {
    return 404;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  client_max_body_size 50m;
  server_tokens off;

  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass $API_UPSTREAM;
  }

  location /ws/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 300;
    proxy_send_timeout 300;
    proxy_pass $API_UPSTREAM;
  }

  location / {
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass $DASHBOARD_UPSTREAM;
  }
}
EOF

if [[ "$HAS_TLS_CERT" == "true" ]]; then
  cat >>"$TMP_FILE" <<EOF
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name $DOMAIN;
  client_max_body_size 50m;
  server_tokens off;

  ssl_certificate $SSL_CERT_PATH;
  ssl_certificate_key $SSL_KEY_PATH;

  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass $API_UPSTREAM;
  }

  location /ws/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 300;
    proxy_send_timeout 300;
    proxy_pass $API_UPSTREAM;
  }

  location / {
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass $DASHBOARD_UPSTREAM;
  }
}
EOF
fi

sudo cp "$TMP_FILE" /etc/nginx/conf.d/apployd-platform.conf
rm -f "$TMP_FILE"

sudo nginx -t
sudo systemctl reload nginx

echo "Configured /etc/nginx/conf.d/apployd-platform.conf for $DOMAIN"
if [[ "$HAS_TLS_CERT" == "true" ]]; then
  echo "TLS certificate found for $DOMAIN; generated both HTTP and HTTPS server blocks."
else
  echo "Next step (TLS): sudo certbot --nginx -d $DOMAIN"
fi
