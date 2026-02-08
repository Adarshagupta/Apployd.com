#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

usage() {
  cat <<'EOF'
Provision and deploy Apployd on Ubuntu with configurable domain settings.

Usage:
  bash infra/scripts/deploy-ubuntu.sh \
    --public-domain plurihub.sylicaai.com \
    --base-domain sylicaai.com \
    --preview-base-domain preview.sylicaai.com \
    --certbot-email ops@sylicaai.com \
    --with-provision \
    --run-certbot

Required flags:
  --public-domain         Public dashboard domain (for example: plurihub.sylicaai.com)
  --certbot-email         Email used by certbot

Optional flags:
  --base-domain           Base domain for production deployment URLs
  --preview-base-domain   Base domain for preview deployment URLs
  --api-base-url          API base URL override
  --dashboard-base-url    Dashboard base URL override
  --database-url          PostgreSQL connection URL override
  --redis-url             Redis connection URL override
  --default-region        Engine/control-plane region (default: fsn1)
  --jwt-secret            JWT secret override
  --encryption-key        Encryption key override
  --cloudflare-api-token  Cloudflare API token override
  --cloudflare-zone-id    Cloudflare zone ID override
  --with-provision        Run host package provisioning first
  --run-certbot           Run certbot for public domain after Nginx config
EOF
}

PUBLIC_DOMAIN=""
BASE_DOMAIN=""
PREVIEW_BASE_DOMAIN=""
API_BASE_URL=""
DASHBOARD_BASE_URL=""
CERTBOT_EMAIL=""
DATABASE_URL=""
REDIS_URL=""
DEFAULT_REGION=""
JWT_SECRET_VALUE=""
ENCRYPTION_KEY_VALUE=""
CLOUDFLARE_API_TOKEN_VALUE=""
CLOUDFLARE_ZONE_ID_VALUE=""
WITH_PROVISION=false
RUN_CERTBOT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-domain)
      PUBLIC_DOMAIN="${2:-}"
      shift 2
      ;;
    --base-domain)
      BASE_DOMAIN="${2:-}"
      shift 2
      ;;
    --preview-base-domain)
      PREVIEW_BASE_DOMAIN="${2:-}"
      shift 2
      ;;
    --api-base-url)
      API_BASE_URL="${2:-}"
      shift 2
      ;;
    --dashboard-base-url)
      DASHBOARD_BASE_URL="${2:-}"
      shift 2
      ;;
    --certbot-email)
      CERTBOT_EMAIL="${2:-}"
      shift 2
      ;;
    --database-url)
      DATABASE_URL="${2:-}"
      shift 2
      ;;
    --redis-url)
      REDIS_URL="${2:-}"
      shift 2
      ;;
    --default-region)
      DEFAULT_REGION="${2:-}"
      shift 2
      ;;
    --jwt-secret)
      JWT_SECRET_VALUE="${2:-}"
      shift 2
      ;;
    --encryption-key)
      ENCRYPTION_KEY_VALUE="${2:-}"
      shift 2
      ;;
    --cloudflare-api-token)
      CLOUDFLARE_API_TOKEN_VALUE="${2:-}"
      shift 2
      ;;
    --cloudflare-zone-id)
      CLOUDFLARE_ZONE_ID_VALUE="${2:-}"
      shift 2
      ;;
    --with-provision)
      WITH_PROVISION=true
      shift
      ;;
    --run-certbot)
      RUN_CERTBOT=true
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

if [[ -z "$PUBLIC_DOMAIN" ]]; then
  echo "Missing required flag: --public-domain"
  usage
  exit 1
fi

if [[ -z "$CERTBOT_EMAIL" ]]; then
  echo "Missing required flag: --certbot-email"
  usage
  exit 1
fi

if [[ "$WITH_PROVISION" == "true" ]]; then
  bash "$SCRIPT_DIR/provision-ubuntu.sh"
fi

bash "$SCRIPT_DIR/configure-nginx.sh"
bash "$SCRIPT_DIR/configure-platform-nginx.sh" --domain "$PUBLIC_DOMAIN"

if [[ "$RUN_CERTBOT" == "true" ]]; then
  sudo certbot --nginx --non-interactive --agree-tos --redirect --email "$CERTBOT_EMAIL" -d "$PUBLIC_DOMAIN"
fi

env_args=(
  --public-domain "$PUBLIC_DOMAIN"
  --certbot-email "$CERTBOT_EMAIL"
)

if [[ -n "$BASE_DOMAIN" ]]; then
  env_args+=(--base-domain "$BASE_DOMAIN")
fi

if [[ -n "$PREVIEW_BASE_DOMAIN" ]]; then
  env_args+=(--preview-base-domain "$PREVIEW_BASE_DOMAIN")
fi

if [[ -n "$API_BASE_URL" ]]; then
  env_args+=(--api-base-url "$API_BASE_URL")
fi

if [[ -n "$DASHBOARD_BASE_URL" ]]; then
  env_args+=(--dashboard-base-url "$DASHBOARD_BASE_URL")
fi

if [[ -n "$DATABASE_URL" ]]; then
  env_args+=(--database-url "$DATABASE_URL")
fi

if [[ -n "$REDIS_URL" ]]; then
  env_args+=(--redis-url "$REDIS_URL")
fi

if [[ -n "$DEFAULT_REGION" ]]; then
  env_args+=(--default-region "$DEFAULT_REGION")
fi

if [[ -n "$JWT_SECRET_VALUE" ]]; then
  env_args+=(--jwt-secret "$JWT_SECRET_VALUE")
fi

if [[ -n "$ENCRYPTION_KEY_VALUE" ]]; then
  env_args+=(--encryption-key "$ENCRYPTION_KEY_VALUE")
fi

if [[ -n "$CLOUDFLARE_API_TOKEN_VALUE" ]]; then
  env_args+=(--cloudflare-api-token "$CLOUDFLARE_API_TOKEN_VALUE")
fi

if [[ -n "$CLOUDFLARE_ZONE_ID_VALUE" ]]; then
  env_args+=(--cloudflare-zone-id "$CLOUDFLARE_ZONE_ID_VALUE")
fi

bash "$SCRIPT_DIR/generate-production-env.sh" "${env_args[@]}"
bash "$SCRIPT_DIR/deploy-stack.sh"

echo
echo "Ubuntu deploy flow completed."
echo "Public domain: $PUBLIC_DOMAIN"
echo "Use the generated env files to adjust BASE_DOMAIN and PREVIEW_BASE_DOMAIN as needed."
