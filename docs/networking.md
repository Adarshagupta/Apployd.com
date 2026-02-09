# Networking and Routing

## Edge Layer

- Cloudflare handles DNS, TLS edge, WAF, and DDoS filtering.
- Wildcard DNS expected: `*.<base-domain>` -> ingress/public IP.
- Nginx serves as reverse proxy and WebSocket gateway.

## Dynamic Domain Assignment

- Production domain format: `<project-slug>.<org-slug>.<base-domain>`.
- Preview domain format (`PREVIEW_DOMAIN_STYLE=project`): `<project-slug>.<preview-base-domain>`.
- Preview domain format (`PREVIEW_DOMAIN_STYLE=project_ref`): `<project-slug>-<ref>-<hash>.<org-slug>.<preview-base-domain>`.
- Control plane stores domain in `deployments.domain`.
- Deployment engine writes/upserts Nginx vhost using template:
  - `infra/nginx/templates/project.conf.tpl`

## WebSocket Forwarding

Nginx template includes:

- `proxy_set_header Upgrade $http_upgrade`
- `proxy_set_header Connection $connection_upgrade`
- `proxy_http_version 1.1`
- increased read/send timeouts

This supports socket.io/native WS backends.

## Rate Limiting

- Global zone in `infra/nginx/nginx.conf`:
  - `limit_req_zone $binary_remote_addr zone=api_rate_limit:20m rate=20r/s;`
- Per-site enforcement in project template:
  - `limit_req zone=api_rate_limit;` (strict cap, no burst window)

## SSL Automation

- Deployment engine runs certbot for new domains.
- Certificates stored at `/etc/letsencrypt`.
- Nginx reload happens after config test (`nginx -t`).

## Security Notes

- Lock down host firewall to `22`, `80`, `443`.
- Disable direct container exposure except explicit routed ports.
- Prefer Cloudflare proxy mode (`proxied: true`) for public records.
