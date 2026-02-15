#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)

cd "$ROOT_DIR"

required_env_files=(
  "apps/control-plane/.env"
  "services/deployment-engine/.env"
  "apps/dashboard/.env.local"
)

for file in "${required_env_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required environment file: $file"
    echo "Create it manually or run: bash infra/scripts/generate-production-env.sh --help"
    exit 1
  fi
done

npm install
npm --workspace apps/control-plane run prisma:generate
npm --workspace apps/control-plane exec prisma migrate deploy
npm --workspace packages/shared run build
npm --workspace apps/control-plane run build
npm --workspace services/deployment-engine run build
npm --workspace apps/dashboard run build

compose_services=(
  redis
  control-plane
  deployment-engine
  dashboard
  prometheus
  grafana
  node-exporter
)

if [[ "${DEPLOY_WITH_NGINX_CONTAINER:-false}" == "true" ]]; then
  compose_services+=(nginx)
fi

docker compose -f infra/docker/docker-compose.yml up -d --build "${compose_services[@]}"

echo "Apployd stack deployed."
