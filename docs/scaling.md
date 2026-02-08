# Scaling and Failover Design

## Current (MVP)

- Single control plane instance.
- Single deployment worker.
- Single Nginx edge host.
- PostgreSQL + Redis as shared state.

## Multi-server expansion (next)

- Add server records in `servers` table with capacity counters.
- Scheduler selects healthy candidate with highest weighted headroom.
- Deployment engine remains stateless; scale workers horizontally.
- Nginx can run per host + central edge, or distributed edge with Anycast/Cloudflare.

## Load balancing

- Control plane instances behind L4/L7 load balancer.
- Sticky sessions not required (JWT stateless).
- Redis used as event bus/queue across instances.

## Failover strategy

- Health probes for control plane and engine workers.
- Promote standby DB with streaming replication (Phase 2+).
- Mark failing servers as `draining`/`offline` and avoid new placements.

## Kubernetes readiness

- Keep deployment contract abstract (`DeploymentPipeline` adapter pattern).
- Replace Docker adapter with K8s adapter:
  - image build step (Kaniko/BuildKit)
  - pod deployment
  - ingress automation
  - HPA integration

This allows incremental migration without rewriting API surfaces.
