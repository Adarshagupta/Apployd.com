#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/../.." && pwd)

usage() {
  cat <<'EOF'
Generate production env files for Ubuntu/GCP deployments.

Usage:
  bash infra/scripts/generate-production-env.sh \
    --public-domain sylicaai.com \
    --base-domain sylicaai.com \
    --preview-base-domain sylicaai.com \
    --preview-domain-style project \
    --certbot-email ops@sylicaai.com

Required flags:
  --public-domain         Public dashboard domain (for example: sylicaai.com)
  --certbot-email         Email used by certbot

Optional flags:
  --base-domain           Base domain for production deployment URLs (default: public domain)
  --preview-base-domain   Base domain for preview deployment URLs (default: base domain)
  --preview-domain-style  Preview hostname style: project | project_ref (default: project)
  --api-base-url          API base URL (default: https://<public-domain>)
  --dashboard-base-url    Dashboard base URL (default: https://<public-domain>)
  --database-url          PostgreSQL connection URL (default: postgresql://postgres:postgres@postgres:5432/apployd)
  --redis-url             Redis connection URL (default: redis://redis:6379)
  --default-region        Default scheduler region (default: fsn1)
  --jwt-secret            JWT secret (auto-generated if omitted)
  --encryption-key        32+ char secret for AES encryption (auto-generated if omitted)
  --cloudflare-api-token  Cloudflare API token (overrides CLOUDFLARE_API_TOKEN env)
  --cloudflare-zone-id    Cloudflare zone ID (overrides CLOUDFLARE_ZONE_ID env)

Runtime secrets are sourced from env vars when present:
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  SMTP_HOST
  SMTP_PORT
  SMTP_SECURE
  SMTP_USER
  SMTP_PASS
  SMTP_FROM_EMAIL
  SMTP_FROM_NAME
  EMAIL_VERIFICATION_TTL_MINUTES
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS
  EMAIL_VERIFICATION_MAX_ATTEMPTS
  GITHUB_CLIENT_ID
  GITHUB_CLIENT_SECRET
  GITHUB_WEBHOOK_SECRET
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ZONE_ID
EOF
}

PUBLIC_DOMAIN=""
BASE_DOMAIN=""
PREVIEW_BASE_DOMAIN=""
PREVIEW_DOMAIN_STYLE="project"
API_BASE_URL=""
DASHBOARD_BASE_URL=""
CERTBOT_EMAIL=""
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/apployd"
REDIS_URL="redis://redis:6379"
DEFAULT_REGION="fsn1"
JWT_SECRET_VALUE=""
ENCRYPTION_KEY_VALUE=""
CLOUDFLARE_API_TOKEN_VALUE="${CLOUDFLARE_API_TOKEN:-replace}"
CLOUDFLARE_ZONE_ID_VALUE="${CLOUDFLARE_ZONE_ID:-replace}"

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
    --preview-domain-style)
      PREVIEW_DOMAIN_STYLE="${2:-}"
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

if [[ -z "$BASE_DOMAIN" ]]; then
  BASE_DOMAIN="$PUBLIC_DOMAIN"
fi

if [[ -z "$PREVIEW_BASE_DOMAIN" ]]; then
  PREVIEW_BASE_DOMAIN="$BASE_DOMAIN"
fi

if [[ "$PREVIEW_DOMAIN_STYLE" != "project" && "$PREVIEW_DOMAIN_STYLE" != "project_ref" ]]; then
  echo "Invalid --preview-domain-style value: $PREVIEW_DOMAIN_STYLE"
  echo "Allowed values: project, project_ref"
  exit 1
fi

if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="https://${PUBLIC_DOMAIN}"
fi

if [[ -z "$DASHBOARD_BASE_URL" ]]; then
  DASHBOARD_BASE_URL="https://${PUBLIC_DOMAIN}"
fi

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

if [[ -z "$JWT_SECRET_VALUE" ]]; then
  JWT_SECRET_VALUE="$(generate_secret)"
fi

if [[ -z "$ENCRYPTION_KEY_VALUE" ]]; then
  ENCRYPTION_KEY_VALUE="$(generate_secret)"
fi

STRIPE_SECRET_KEY_VALUE="${STRIPE_SECRET_KEY:-sk_test_replace}"
STRIPE_WEBHOOK_SECRET_VALUE="${STRIPE_WEBHOOK_SECRET:-whsec_replace}"
SMTP_HOST_VALUE="${SMTP_HOST:-}"
SMTP_PORT_VALUE="${SMTP_PORT:-587}"
SMTP_SECURE_VALUE="${SMTP_SECURE:-false}"
SMTP_USER_VALUE="${SMTP_USER:-}"
SMTP_PASS_VALUE="${SMTP_PASS:-}"
SMTP_FROM_EMAIL_VALUE="${SMTP_FROM_EMAIL:-}"
SMTP_FROM_NAME_VALUE="${SMTP_FROM_NAME:-Apployd}"
EMAIL_VERIFICATION_TTL_MINUTES_VALUE="${EMAIL_VERIFICATION_TTL_MINUTES:-10}"
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS_VALUE="${EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS:-60}"
EMAIL_VERIFICATION_MAX_ATTEMPTS_VALUE="${EMAIL_VERIFICATION_MAX_ATTEMPTS:-5}"
GITHUB_CLIENT_ID_VALUE="${GITHUB_CLIENT_ID:-}"
GITHUB_CLIENT_SECRET_VALUE="${GITHUB_CLIENT_SECRET:-}"
GITHUB_WEBHOOK_SECRET_VALUE="${GITHUB_WEBHOOK_SECRET:-}"

CONTROL_PLANE_ENV="$ROOT_DIR/apps/control-plane/.env"
ENGINE_ENV="$ROOT_DIR/services/deployment-engine/.env"
DASHBOARD_ENV="$ROOT_DIR/apps/dashboard/.env.local"

cat >"$CONTROL_PLANE_ENV" <<EOF
NODE_ENV=production
PORT=4000
API_BASE_URL=$API_BASE_URL
JWT_SECRET=$JWT_SECRET_VALUE
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY_VALUE
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET_VALUE
SMTP_HOST=$SMTP_HOST_VALUE
SMTP_PORT=$SMTP_PORT_VALUE
SMTP_SECURE=$SMTP_SECURE_VALUE
SMTP_USER=$SMTP_USER_VALUE
SMTP_PASS=$SMTP_PASS_VALUE
SMTP_FROM_EMAIL=$SMTP_FROM_EMAIL_VALUE
SMTP_FROM_NAME=$SMTP_FROM_NAME_VALUE
EMAIL_VERIFICATION_TTL_MINUTES=$EMAIL_VERIFICATION_TTL_MINUTES_VALUE
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=$EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS_VALUE
EMAIL_VERIFICATION_MAX_ATTEMPTS=$EMAIL_VERIFICATION_MAX_ATTEMPTS_VALUE
GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID_VALUE
GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET_VALUE
GITHUB_OAUTH_REDIRECT_URI=${API_BASE_URL%/}/api/v1/integrations/github/callback
GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET_VALUE
DASHBOARD_BASE_URL=$DASHBOARD_BASE_URL
ENCRYPTION_KEY=$ENCRYPTION_KEY_VALUE
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_VALUE
CLOUDFLARE_ZONE_ID=$CLOUDFLARE_ZONE_ID_VALUE
BASE_DOMAIN=$BASE_DOMAIN
PREVIEW_BASE_DOMAIN=$PREVIEW_BASE_DOMAIN
PREVIEW_DOMAIN_STYLE=$PREVIEW_DOMAIN_STYLE
DEFAULT_REGION=$DEFAULT_REGION
AUTO_PROVISION_DEV_SERVER=false
EOF

cat >"$ENGINE_ENV" <<EOF
NODE_ENV=production
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
DASHBOARD_BASE_URL=$DASHBOARD_BASE_URL
BASE_DOMAIN=$BASE_DOMAIN
PREVIEW_BASE_DOMAIN=$PREVIEW_BASE_DOMAIN
PREVIEW_DOMAIN_STYLE=$PREVIEW_DOMAIN_STYLE
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_VALUE
CLOUDFLARE_ZONE_ID=$CLOUDFLARE_ZONE_ID_VALUE
SMTP_HOST=$SMTP_HOST_VALUE
SMTP_PORT=$SMTP_PORT_VALUE
SMTP_SECURE=$SMTP_SECURE_VALUE
SMTP_USER=$SMTP_USER_VALUE
SMTP_PASS=$SMTP_PASS_VALUE
SMTP_FROM_EMAIL=$SMTP_FROM_EMAIL_VALUE
SMTP_FROM_NAME=$SMTP_FROM_NAME_VALUE
DOCKER_HOST=unix:///var/run/docker.sock
NGINX_SITES_PATH=/etc/nginx/sites-enabled
NGINX_TEMPLATE_PATH=/opt/apployd/nginx/templates/project.conf.tpl
CERTBOT_EMAIL=$CERTBOT_EMAIL
ENGINE_REGION=$DEFAULT_REGION
ENGINE_METRICS_PORT=9102
ENGINE_LOCAL_MODE=false
EOF

cat >"$DASHBOARD_ENV" <<EOF
NEXT_PUBLIC_API_URL=${API_BASE_URL%/}/api/v1
EOF

echo "Generated:"
echo "  - $CONTROL_PLANE_ENV"
echo "  - $ENGINE_ENV"
echo "  - $DASHBOARD_ENV"
echo
echo "Public domain: $PUBLIC_DOMAIN"
echo "Production deployment domain base: $BASE_DOMAIN"
echo "Preview deployment domain base: $PREVIEW_BASE_DOMAIN"
echo "Preview deployment domain style: $PREVIEW_DOMAIN_STYLE"
echo
echo "Important: point DNS records/wildcards to this host:"
echo "  - $PUBLIC_DOMAIN"
echo "  - *.$BASE_DOMAIN"
if [[ "$PREVIEW_BASE_DOMAIN" != "$BASE_DOMAIN" ]]; then
  echo "  - *.$PREVIEW_BASE_DOMAIN"
fi
