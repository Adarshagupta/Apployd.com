# Apployd Roadmap

## Phase 1: MVP (Single Server)

- Fastify control plane with JWT auth and org/project/deployment APIs.
- Docker-based deployment engine + Redis queue.
- Nginx per-project dynamic reverse proxy with WebSocket forwarding.
- Stripe subscription checkout + webhook handling.
- Resource pooling and per-project 50% allocation cap.
- Free-tier auto-sleep (15 min inactivity) and wake endpoint.
- Next.js dashboard with core deployment, usage, logs, billing, team pages.
- Prometheus metrics + Grafana dashboard.

## Phase 2: Multi-server

- Multiple Hetzner servers in scheduler pool.
- Placement strategy by region, health, and headroom.
- Drain mode + live workload migration path.
- Shared log and metric aggregation pipeline.
- API-driven DNS routing updates across nodes.
- Active/passive control plane failover.

## Phase 3: Enterprise

- SSO/SAML + advanced RBAC (custom roles, scoped tokens).
- Dedicated resource pools and private networking options.
- Compliance controls (SOC2 evidence automation, retention policies).
- SLA alerting and incident workflows.
- Kubernetes adapter for deployment engine backend.
- Global multi-region failover with data residency options.
