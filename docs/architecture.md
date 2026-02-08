# Apployd Architecture

## High-level

```mermaid
flowchart LR
  User[Developer] --> Dashboard[Next.js Dashboard]
  Dashboard --> API[Control Plane API\nFastify + TypeScript]
  API --> Postgres[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> Stripe[Stripe Billing]
  API --> Queue[Deploy Queue]
  Queue --> Engine[Deployment Engine Worker]
  Engine --> Docker[Docker Hosts]
  Engine --> Nginx[Nginx Reverse Proxy]
  Engine --> CF[Cloudflare DNS/Proxy]
  Nginx --> Apps[Project Containers]
  Prom[Prometheus] --> API
  Prom --> Engine
  Grafana --> Prom
```

## Deployment Pipeline

```mermaid
sequenceDiagram
  participant U as User
  participant CP as Control Plane
  participant DB as PostgreSQL
  participant Q as Redis Queue
  participant DE as Deployment Engine
  participant DK as Docker Host
  participant NX as Nginx
  participant SSL as Let's Encrypt

  U->>CP: POST /deployments
  CP->>DB: Check quota + create deployment(queued)
  CP->>Q: enqueue deployment payload
  DE->>Q: consume payload
  DE->>DB: status=building
  DE->>DK: clone repo + docker build
  DE->>DB: status=deploying
  DE->>DK: docker run with CPU/RAM limits
  DE->>NX: write site config + reload
  DE->>SSL: certbot issue cert
  DE->>DB: status=ready + domain + container
  CP-->>U: WebSocket events + live URL
```

## Resource Pooling Rules

- Subscription defines total pool: RAM, CPU, bandwidth.
- Each project can allocate at most 50% of each pool.
- Sum(project allocations) cannot exceed pool.
- Free plan projects default to auto-sleep (15 minutes idle).
- Wake endpoint targets cold-start under 15 seconds.

## Reliability Hardening

- Deployment API supports `Idempotency-Key` to prevent duplicate deploy execution.
- Deployment worker uses Redis lock per deployment id to avoid concurrent duplicate processing.
- Stripe webhook events are deduplicated in `webhook_events` before state mutation.

## Scaling Path

- Phase 1: single server, one Docker host + one Nginx.
- Phase 2: multiple servers, scheduler chooses healthiest capacity candidate.
- Phase 3: enterprise controls (regional failover, dedicated nodes, SOC2 hardening).
- Kubernetes-ready path: deployment engine adapters can be replaced by K8s adapter while API contracts remain stable.
