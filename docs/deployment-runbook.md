# Deployment Runbook

## Prerequisites

- Ubuntu 22.04 host(s)
- DNS zone managed in Cloudflare
- Stripe account with recurring prices
- Docker, Node 20, Nginx, certbot installed

## First-time setup

1. `bash infra/scripts/deploy-ubuntu.sh --public-domain apployd.com --base-domain apployd.com --preview-base-domain apployd.com --preview-domain-style project --certbot-email ops@apployd.com --cloudflare-api-token <token> --cloudflare-zone-id <zone-id> --with-provision --with-falco --run-certbot`
2. Verify generated env files:
   - `apps/control-plane/.env`
   - `services/deployment-engine/.env`
   - `apps/dashboard/.env.local`
3. Ensure DNS records point to server:
   - `apployd.com`
   - `*.apployd.com`
   - `*.preview.apployd.com` (only if using a separate preview base domain)
4. Stack deploy uses host Nginx by default. Set `DEPLOY_WITH_NGINX_CONTAINER=true` only if you intentionally want the Docker Nginx service.

## Post-deploy checks

- API health: `GET /health`
- Control metrics: `GET /metrics`
- Engine metrics: `GET :9102/metrics`
- Grafana dashboard reachable on configured port
- Stripe webhook endpoint receiving events
- Falco running: `sudo systemctl status falco --no-pager`
- Falco alerts stream: `sudo journalctl -u falco -f`

## Project configuration checklist

Before a team launches its first application deployment from the dashboard, verify the project configuration matches the runtime:

- Select the correct service type: `web_service`, `python`, or `static_site`
- Set `rootDirectory` for monorepos such as `apps/web`, `apps/api`, or `backend`
- Add required environment variables before the first production deploy
- Confirm the application binds to `0.0.0.0:$PORT`

### Node web services

- Common values: root `apps/api`, build `npm run build`, start `npm run start:prod`, port `3000`
- Auto-detection prefers `start:prod`, `start`, `serve`, `package.json` main, then compiled entries like `dist/server.js`
- Reject dev-mode commands such as `npm run dev`, `nodemon`, `tsx watch`, and `next dev`

### Python services

- Common values: root `backend`, build `python manage.py collectstatic --noinput`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`, port `3000`
- Dependency install supports `requirements.txt`, `Pipfile`, `pyproject.toml`, and `setup.py`
- Auto-detection covers Django, Flask, FastAPI, `wsgi.py`, `asgi.py`, then `main.py` or `app.py`

### Frontend / static sites

- Common values: root `apps/web`, build `npm run build`, output `dist`, port `3000`
- Do not provide a start command; nginx serves the built output with SPA fallback
- Use `web_service` instead when the app needs SSR, API routes, or a persistent Node server

## Common incidents

- Build failure: inspect deployment logs and image build command.
- Certificate failure: validate DNS propagation and certbot rate limits.
- Quota rejection: check subscription pool and project allocation caps.
- Past due billing: verify card/payment method on Stripe customer.
- Suspicious network behavior: review Falco alerts and isolate offending deployment container.
