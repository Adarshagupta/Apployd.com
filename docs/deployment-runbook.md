# Deployment Runbook

## Prerequisites

- Ubuntu 22.04 host(s)
- DNS zone managed in Cloudflare
- Stripe account with recurring prices
- Docker, Node 20, Nginx, certbot installed

## First-time setup

1. `bash infra/scripts/deploy-ubuntu.sh --public-domain sylicaai.com --base-domain sylicaai.com --preview-base-domain sylicaai.com --preview-domain-style project --certbot-email ops@sylicaai.com --cloudflare-api-token <token> --cloudflare-zone-id <zone-id> --with-provision --run-certbot`
2. Verify generated env files:
   - `apps/control-plane/.env`
   - `services/deployment-engine/.env`
   - `apps/dashboard/.env.local`
3. Ensure DNS records point to server:
   - `sylicaai.com`
   - `*.sylicaai.com`
   - `*.preview.sylicaai.com` (only if using a separate preview base domain)
4. Stack deploy uses host Nginx by default. Set `DEPLOY_WITH_NGINX_CONTAINER=true` only if you intentionally want the Docker Nginx service.

## Post-deploy checks

- API health: `GET /health`
- Control metrics: `GET /metrics`
- Engine metrics: `GET :9102/metrics`
- Grafana dashboard reachable on configured port
- Stripe webhook endpoint receiving events

## Common incidents

- Build failure: inspect deployment logs and image build command.
- Certificate failure: validate DNS propagation and certbot rate limits.
- Quota rejection: check subscription pool and project allocation caps.
- Past due billing: verify card/payment method on Stripe customer.
