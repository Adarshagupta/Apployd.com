# Security Model

## Runtime Isolation

- Per-project containers with explicit CPU and memory caps.
- Containers run as non-root (`uid:gid 1001:1001`).
- Read-only root filesystem enabled by default.
- Isolated Docker network (`apployd-net`) for east-west traffic.

## API Security

- JWT authentication for all protected endpoints.
- RBAC enforced by organization membership role.
- Deployment WebSocket stream enforces JWT token and org membership before subscription.
- Sensitive actions logged into `audit_logs`.

## Secret Management

- Secrets stored in `project_secrets` as AES-256-GCM ciphertext.
- Runtime deployment merges decrypted secrets into env just before queueing.
- Secret reveal endpoint restricted to admin+.

## Network Security

- Nginx rate limiting and WebSocket-aware proxy setup.
- Baseline response hardening headers on routed domains:
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
  - `Strict-Transport-Security` (TLS vhosts)
- Cloudflare proxy records to mask origin and add DDoS/WAF layer.
- UFW baseline rules via `infra/scripts/provision-ubuntu.sh`.

## Supply Chain Guardrails

- Deployment requests reject repository URLs that target local/private hosts by default
  (`localhost`, RFC1918 IP ranges, loopback/link-local/internal names).
- Override for trusted private Git infrastructure with:
  - `ALLOW_PRIVATE_GIT_HOSTS=true`

## Billing Risk Controls

- Stripe webhooks update subscription status.
- Webhook idempotency is enforced through `webhook_events` unique provider/event keys.
- Failed payments transition subscription to `past_due`.
- Usage records retained for invoice and overage reconciliation.
