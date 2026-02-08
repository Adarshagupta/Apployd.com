# Database Schema (PostgreSQL)

Source of truth: `apps/control-plane/prisma/schema.prisma`.

## Core tables

- `users`: account identity, auth credentials, optional OAuth binding.
  - indexes: `email` unique, `(oauth_provider, oauth_subject)`.
- `organizations`: tenant boundary.
  - indexes: `slug` unique, `owner_id`.
- `organization_members`: many-to-many users to organizations with role.
  - unique: `(organization_id, user_id)`.

## Project and runtime tables

- `projects`: app metadata + resource allocation (RAM/CPU/bandwidth).
  - unique: `(organization_id, slug)`.
  - indexes: `(organization_id, created_at)`, `(organization_id, sleep_enabled)`.
- `servers`: host inventory and reserved capacity counters.
  - indexes: `(status, region)`.
- `deployments`: deployment lifecycle and status transitions.
  - includes `capacity_reserved` to prevent double-decrement on rollback.
  - indexes: `(project_id, created_at)`, `(server_id, status)`, `(status, created_at)`.
- `containers`: running/sleeping unit mapped to server and project.
  - indexes: `(project_id, status)`, `(server_id, status)`, `(sleep_status, last_request_at)`.

## Billing tables

- `plans`: product catalog and included resources.
- `subscriptions`: active plan and organization-level resource pool.
  - indexes: `(organization_id, status)`, `(current_period_end)`.
- `usage_records`: time-series usage for overage billing.
  - indexes: `(organization_id, recorded_at)`, `(subscription_id, metric_type, recorded_at)`.
- `invoices`: Stripe invoice synchronization.
  - indexes: `(subscription_id, created_at)`, `(status, due_at)`.

## Observability and security tables

- `logs`: centralized logs linked to project/deployment/container.
- `metrics`: numeric time-series metrics per project/container/server.
- `audit_logs`: immutable audit trail of user actions.
- `project_secrets`: encrypted env vars at rest (AES-256-GCM fields).
- `webhook_events`: idempotency ledger for external webhook processing.

## Notes

- All IDs use `cuid()` for API-safe distributed generation.
- Referential integrity uses cascading deletes where tenant cleanup is required.
- Unique constraints prevent duplicate slug/secret/member collisions.
