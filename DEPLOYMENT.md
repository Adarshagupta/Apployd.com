# Apployd - Quick Start Deployment Guide

## One-Command Installation

This guide will help you deploy Apployd to a fresh Ubuntu server in minutes with a single command.

## Prerequisites

- **Ubuntu 20.04 or 22.04** server (GCP, AWS, DigitalOcean, etc.)
- **Root access** or sudo privileges
- **Domain name** pointing to your server's IP
- **Ports open**: 80 (HTTP), 443 (HTTPS)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Apployd.git
cd Apployd
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your values
nano .env
```

**Required Configuration:**

```bash
# Your domain (must point to this server)
DOMAIN=apployd.com

# Your email for SSL certificates
EMAIL=your-email@example.com

# Database URL (Neon PostgreSQL recommended)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# Generate these secrets (run three times):
# openssl rand -hex 32
JWT_SECRET=<paste-output-here>
SESSION_SECRET=<paste-output-here>
ENCRYPTION_KEY=<paste-output-here>
```

**Optional Services** (leave empty if not using):

- Stripe keys (for billing)
- Cloudflare API (for DNS automation)
- GitHub OAuth (for GitHub login)

### 3. Run Setup Script

```bash
# Make executable
chmod +x setup.sh

# Run as root
sudo bash setup.sh
```

The script will:

- ✅ Install Docker, Docker Compose, Nginx, Certbot
- ✅ Build all Docker images
- ✅ Setup PostgreSQL database & run migrations
- ✅ Configure Nginx reverse proxy
- ✅ Obtain SSL certificates from Let's Encrypt
- ✅ Start all services
- ✅ Verify installation

**Duration**: 10-15 minutes depending on your server specs.

### 4. Access Your Platform

Once complete, visit:

- **Dashboard**: https://your-domain.com
- **API**: https://your-domain.com/api
- **Health Check**: https://your-domain.com/health

## Configuring Projects Before Deployment

After the platform is online, configure each customer project in the dashboard before triggering the first deployment. The minimum fields are:

- **Service type**: `Web Service`, `Python`, or `Static Site`
- **Repository URL + branch**: the Git source Apployd should build
- **Root directory**: required for monorepos such as `apps/web` or `backend`
- **Build / start settings**: runtime-specific commands described below
- **Port + environment variables**: the container must boot with the correct `PORT` and secrets

### Node.js Web Services

Choose **Web Service** for APIs, SSR apps, and full-stack Node services that need a long-running server process.

- Typical root directory: `apps/api`
- Typical build command: `npm run build`
- Typical start command: `npm run start:prod`
- Typical port: `3000`

Apployd can auto-detect production startup when you do not provide a start command. It prefers `start:prod`, then `start`, `serve`, the `main` field in `package.json`, and finally compiled entrypoints such as `dist/server.js`.

Important runtime rules:

- Your app must listen on `0.0.0.0:$PORT`
- Do not use dev commands such as `npm run dev`, `nodemon`, `tsx watch`, or `next dev`
- If the project lives in a monorepo, set **Root directory** to the app folder instead of the repo root

### Python Services

Choose **Python** for Django, Flask, FastAPI, and other WSGI or ASGI applications.

- Typical root directory: `backend`
- Optional build command: `python manage.py collectstatic --noinput`
- Typical start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Typical port: `3000`

Dependency detection supports:

- `requirements.txt`
- `Pipfile`
- `pyproject.toml`
- `setup.py`

If no explicit start command is provided, Apployd auto-detects Django `manage.py`, Flask `app.py`, FastAPI `main.py`, `wsgi.py`, `asgi.py`, then falls back to `main.py` or `app.py`.

Important runtime rules:

- Bind the web server to `0.0.0.0:$PORT`
- Use the build command only for setup tasks such as asset collection or code generation
- Put secrets like `DATABASE_URL`, `DJANGO_SECRET_KEY`, and API keys into dashboard environment variables instead of the repo

### Frontend / Static Sites

Choose **Static Site** for React, Vue, Vite, Astro, and exported Next.js projects that produce files instead of a long-running server.

- Typical root directory: `apps/web`
- Typical build command: `npm run build`
- Typical output directory: `dist` (or `build` / `out`)
- Typical port: `3000`

Static sites do not need a start command. Apployd builds the assets and serves the output directory with nginx using SPA fallback to `index.html`.

Use **Web Service** instead of **Static Site** when:

- the app requires server-side rendering at runtime
- the app exposes backend API routes from the same process
- the app needs a persistent Node server after build

## Services & Architecture

The platform runs 9 Docker containers:

| Service           | Port          | Description                   |
| ----------------- | ------------- | ----------------------------- |
| Dashboard         | 3000          | Next.js frontend              |
| Control Plane     | 4000          | Node.js API server            |
| Deployment Engine | 9102          | Container orchestration       |
| Redis             | internal only | Cache & queue                 |
| Prometheus        | 9090          | Metrics collection            |
| Alertmanager      | 9093          | Alert routing & deduplication |
| Grafana           | 3001          | Monitoring dashboards         |
| Node Exporter     | 9100          | System metrics                |
| cAdvisor          | internal only | Container-level metrics       |

## Useful Commands

```bash
# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f control-plane

# Restart services
docker-compose restart

# Stop all services
docker-compose down

# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View nginx logs
sudo tail -f /var/log/nginx/error.log

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## Database Management

```bash
# Access Prisma Studio (database GUI)
cd apps/control-plane
npx prisma studio

# Run migrations
docker-compose run --rm control-plane npx prisma migrate deploy

# Reset database (⚠️ deletes all data)
docker-compose run --rm control-plane npx prisma migrate reset
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Check disk space
df -h

# Clean up Docker
docker system prune -f
```

### SSL certificate failed

```bash
# Verify DNS points to server
dig +short your-domain.com

# Check ports are open
sudo netstat -tlnp | grep -E ':(80|443)'

# Manually get certificate
sudo certbot certonly --standalone -d your-domain.com
```

### Nginx 502 errors

```bash
# Check if containers are running
docker-compose ps

# Test backend directly
curl http://localhost:4000/health
curl http://localhost:3000

# Check nginx config
sudo nginx -t
```

### Database connection issues

```bash
# Test database connection
docker-compose run --rm control-plane node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect().then(() => console.log('✓ Connected')).catch(console.error);
"
```

## Getting Started with Neon Database

If you don't have a PostgreSQL database:

1. Go to [neon.tech](https://neon.tech)
2. Sign up (free tier available)
3. Create a new project
4. Copy the connection string
5. Add `?sslmode=require` to the end
6. Paste into .env as DATABASE_URL

## Monitoring

Access monitoring dashboards:

- **Grafana**: http://your-server-ip:3001
  - Default login: admin / admin
  - Dashboards: `Apployd Overview`, `Apployd Platform Ops`
- **Prometheus**: http://your-server-ip:9090
  - Recording rules: `infra/monitoring/prometheus/rules/apployd-recording-rules.yml`
  - Alert rules: `infra/monitoring/prometheus/rules/apployd-alerts.yml`
- **Alertmanager**: http://your-server-ip:9093
  - Routing config: `infra/monitoring/alertmanager/alertmanager.yml`
  - Set your Slack webhook + PagerDuty integration key in that file before production use.

## Team Invite Email Ops

Team invites now support delivery timeline, resend, bounce/complaint handling, reminder emails, and auto-expiry cleanup.

Set these control-plane env vars:

```bash
# Optional. Leave empty to allow inviting any email domain.
# Example to restrict: INVITE_ALLOWED_EMAIL_DOMAINS=company.com,partner.io
INVITE_ALLOWED_EMAIL_DOMAINS=
INVITE_WEBHOOK_TOKEN=replace-with-random-secret
INVITE_REMINDER_ENABLED=true
INVITE_REMINDER_DELAY_HOURS=24
INVITE_REMINDER_INTERVAL_HOURS=24
INVITE_MAX_REMINDERS=2
INVITE_MAINTENANCE_INTERVAL_SECONDS=300
```

Webhook endpoint (for SES/SendGrid or custom mail event bridge):

```bash
POST /api/v1/teams/invites/email/webhook
Header: x-invite-webhook-token: <INVITE_WEBHOOK_TOKEN>
```

Resend invite endpoint (admin/owner):

```bash
POST /api/v1/teams/invites/:inviteId/resend
```

## Updating the Platform

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
sudo bash setup.sh
```

## Security Recommendations

### Production Checklist

- [ ] Change default Grafana password
- [ ] Restrict Prometheus/Grafana to VPN or IP whitelist
- [ ] Enable firewall (ufw) and only allow 80, 443, 22
- [ ] Keep Redis internal-only (no public `6379` port mapping)
- [ ] Setup automated backups for database
- [ ] Enable Docker log rotation
- [ ] Setup monitoring alerts
- [ ] Enable Falco runtime detection (`bash infra/scripts/install-falco.sh`)
- [ ] Review Falco alerts (`sudo journalctl -u falco -f`)

### Firewall Setup

```bash
# Enable UFW firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

## Backup & Restore

### Backup Database

```bash
# Backup to SQL file
docker-compose exec control-plane npx prisma db pull

# Or using pg_dump (if using local postgres)
pg_dump $DATABASE_URL > backup.sql
```

### Restore Database

```bash
# Restore from SQL file
psql $DATABASE_URL < backup.sql
```

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify DNS configuration
3. Ensure ports 80/443 are accessible
4. Check disk space: `df -h`
5. Review nginx logs: `sudo tail -f /var/log/nginx/error.log`

## License

[Your License Here]
