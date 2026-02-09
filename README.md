# Apployd

Apployd is a SaaS backend hosting platform focused on affordability, container isolation, WebSocket support, and pooled subscription resources.

## What is implemented

- Control Plane API (`Fastify + TypeScript`) for auth, orgs, projects, deployments, billing, logs, metrics, teams, secrets, and audit logs.
- Deployment Engine worker (`Node + TypeScript`) that consumes deployment jobs and automates build/run/routing/SSL.
- Deployment idempotency for create-deploy requests (`Idempotency-Key`) and Stripe webhook deduplication (`webhook_events`).
- PostgreSQL schema (Prisma) covering users, organizations, projects, deployments, servers, containers, plans, subscriptions, usage, invoices, logs, metrics, and audit data.
- Next.js + Tailwind dashboard with pages for login/signup/projects/deploy/usage/billing/logs/settings/team and live deployment event streaming.
- Detailed per-project usage accounting with BigInt-safe aggregation (CPU/RAM/bandwidth/requests), utilization percentages, and daily breakdown endpoints.
- Nginx templates with WebSocket proxying + rate limiting.
- Prometheus + Grafana observability stack.
- CI/CD workflows for validate/build/test and manual production deploy.

## Architecture Decisions and Trade-offs

1. Control plane and deployment engine are separated.
   - Why: keeps API latency predictable and isolates long-running build/deploy workloads.
   - Trade-off: queue + worker coordination adds operational complexity.

2. Docker on bare-metal (Hetzner) for MVP.
   - Why: lower cost and simpler than full Kubernetes initially.
   - Trade-off: fewer built-in orchestration features until Phase 2/3.

3. Resource pooling at organization level.
   - Why: users can run unlimited projects while staying in a predictable subscription budget.
   - Trade-off: requires strict allocation validation and good usage visibility.

4. Fastify + strict TypeScript.
   - Why: high performance API with compile-time safety.
   - Trade-off: more upfront typing/validation work.

5. Prisma for schema and DB access.
   - Why: fast iteration with relational integrity.
   - Trade-off: migration discipline is mandatory as the model grows.

## Folder Structure

```text
apployd/
  apps/
    control-plane/        # Fastify REST + WS API
    dashboard/            # Next.js frontend
  services/
    deployment-engine/    # Queue consumer + deploy pipeline
  packages/
    shared/               # Shared TS contracts
  infra/
    docker/               # Docker Compose stack
    nginx/                # Nginx base config + vhost template
    monitoring/           # Prometheus + Grafana
    scripts/              # Provision/deploy scripts
  docs/
    api/openapi.yaml
    architecture.md
    database.md
    roadmap.md
  .github/workflows/
```

## Key Flows

### Deployment Flow

1. `POST /api/v1/deployments`
2. Quota validation + server selection
3. Queue push (`Redis`)
4. Engine builds image, runs constrained container, writes Nginx config, issues SSL
5. Deployment marked `ready`
6. Live progress over WebSocket (`/ws/deployments/:deploymentId?token=<jwt>`)

Important:
- `BASE_DOMAIN` controls generated deployment hostnames (for example `project.org.BASE_DOMAIN`).
- `PREVIEW_BASE_DOMAIN` controls preview deployment hostnames.
- `PREVIEW_DOMAIN_STYLE` controls preview hostname pattern:
  - `project`: `<project>.<PREVIEW_BASE_DOMAIN>` (recommended for `sylicaai.com`)
  - `project_ref`: `<project>-<ref>-<hash>.<organization>.<PREVIEW_BASE_DOMAIN>`
- Deploy API supports optional `domain` override per request for custom hostnames.
- Control plane now rejects deploy requests when no active deployment-engine worker heartbeat is present.
- `ENGINE_LOCAL_MODE=true` enables local Docker-only deployment flow (skips DNS/Nginx/SSL automation and serves via `localhost:<port>`).
- `ENGINE_METRICS_PORT` controls the engine `/metrics` port (change it if `9102` is already in use).
- `DOCKER_HOST` must match your local Docker runtime (Windows Docker Desktop usually needs `npipe:////./pipe/docker_engine`).

### Resource Rules

- Pool defined by current subscription (`RAM`, `CPU`, `bandwidth`).
- Any single project must remain `<= 50%` of each pool.
- Aggregate allocation cannot exceed pool.
- Free tier defaults to sleep-enabled project mode.

### Free Tier Sleep

- Idle detection window: `15 minutes`.
- Sleep sweep runs every minute.
- Wake endpoint: `POST /api/v1/deployments/:deploymentId/wake`.
- Target cold start objective: `<15 seconds`.

## Security Controls

- Non-root containers (`--user 1001:1001`).
- Container read-only filesystem (`--read-only`).
- API JWT auth + org-role checks (`owner/admin/developer/viewer`).
- Deployment WebSocket requires JWT token + organization membership authorization.
- Secrets encrypted at rest (AES-256-GCM in `project_secrets`).
- Audit trail (`audit_logs`) for sensitive actions.
- UFW + Nginx edge hardening scripts for host setup.

## Observability

- Prometheus metrics:
  - Control plane HTTP request rate/latency
  - Deployment engine success/failure/duration
- Usage API:
  - `GET /api/v1/projects?organizationId=<id>` now includes per-project usage snapshots.
  - `GET /api/v1/usage/projects?organizationId=<id>` returns detailed usage for all projects.
  - `GET /api/v1/usage/projects/:projectId` returns project-level totals + daily series.
- Grafana dashboard: `infra/monitoring/grafana/dashboards/apployd-overview.json`
- Centralized application logs table (`logs`).

## Setup (Local)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env templates:
   - `apps/control-plane/.env.example` -> `.env`
   - `services/deployment-engine/.env.example` -> `.env`
   - `apps/dashboard/.env.example` -> `.env.local`
   - local scheduler bootstrap is enabled by default via `AUTO_PROVISION_DEV_SERVER=true` in control-plane env
3. Start local stack:
   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d
   npm run dev
   ```
4. Generate Prisma client / migrate DB:
   ```bash
   npm --workspace apps/control-plane run prisma:generate
   npm --workspace apps/control-plane run prisma:migrate
   ```

## API and Design Docs

- API spec: `docs/api/openapi.yaml`
- Architecture: `docs/architecture.md`
- Database model: `docs/database.md`
- Roadmap: `docs/roadmap.md`

## Deployment to Ubuntu 22.04 (GCP/Hetzner)

Use the domain-driven script so URLs are not hardcoded:

```bash
bash infra/scripts/deploy-ubuntu.sh \
  --public-domain sylicaai.com \
  --base-domain sylicaai.com \
  --preview-base-domain sylicaai.com \
  --preview-domain-style project \
  --certbot-email ops@sylicaai.com \
  --cloudflare-api-token <your-cloudflare-token> \
  --cloudflare-zone-id <your-cloudflare-zone-id> \
  --with-provision \
  --run-certbot
```

This script:
- provisions Ubuntu dependencies (optional flag),
- configures base Nginx + platform reverse proxy,
- generates production env files for control-plane, engine, and dashboard,
- deploys the Docker stack.
- uses host Nginx by default (Docker Nginx service is skipped unless `DEPLOY_WITH_NGINX_CONTAINER=true`).

DNS records to create:
- `sylicaai.com` -> your server public IP
- `*.sylicaai.com` -> your server public IP
- `*.preview.sylicaai.com` -> your server public IP (only if preview base differs)

Generated deployment URL patterns:
- Production: `<project>.<organization>.<BASE_DOMAIN>`
- Preview (`PREVIEW_DOMAIN_STYLE=project`): `<project>.<PREVIEW_BASE_DOMAIN>`
- Preview (`PREVIEW_DOMAIN_STYLE=project_ref`): `<project>-<ref>-<hash>.<organization>.<PREVIEW_BASE_DOMAIN>`

## Phased Plan

- Phase 1 (MVP): single-server production stack.
- Phase 2: multi-server scheduling, load balancing, failover.
- Phase 3: enterprise-grade controls, dedicated pools, K8s adapter.

See `docs/roadmap.md` for details.
