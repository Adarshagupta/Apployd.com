#!/bin/bash

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    log_error "Please run as root (use sudo)"
    exit 1
fi

log_info "=========================================="
log_info "Apployd Automated Setup Script"
log_info "=========================================="

# Get the actual user who called sudo
ACTUAL_USER="${SUDO_USER:-$USER}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

log_info "Script directory: $SCRIPT_DIR"
log_info "Running as user: $ACTUAL_USER"

# ==========================================
# 1. Check Prerequisites
# ==========================================
log_info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || {
    log_error "Docker is not installed. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker $ACTUAL_USER
    rm get-docker.sh
}

command -v docker-compose >/dev/null 2>&1 || {
    log_error "Docker Compose is not installed. Installing..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
}

command -v nginx >/dev/null 2>&1 || {
    log_info "Installing Nginx..."
    apt-get update -qq
    apt-get install -y nginx
}

command -v certbot >/dev/null 2>&1 || {
    log_info "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
}

log_info "✓ All prerequisites installed"

# ==========================================
# 2. Load Environment Variables
# ==========================================
log_info "Loading environment variables..."

ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    log_error ".env file not found!"
    log_info "Please create a .env file in $SCRIPT_DIR with the following variables:"
    log_info ""
    log_info "# Domain Configuration"
    log_info "DOMAIN=your-domain.com"
    log_info "EMAIL=your-email@example.com"
    log_info ""
    log_info "# Database (Neon PostgreSQL recommended)"
    log_info "DATABASE_URL=postgresql://user:password@host/database?sslmode=require"
    log_info ""
    log_info "# Required"
    log_info "JWT_SECRET=$(openssl rand -hex 32)"
    log_info "SESSION_SECRET=$(openssl rand -hex 32)"
    log_info "ENCRYPTION_KEY=$(openssl rand -hex 32)"
    log_info ""
    log_info "# Optional Services (leave empty if not using)"
    log_info "STRIPE_SECRET_KEY="
    log_info "STRIPE_WEBHOOK_SECRET="
    log_info "CLOUDFLARE_API_TOKEN="
    log_info "CLOUDFLARE_ZONE_ID="
    log_info "GITHUB_CLIENT_ID="
    log_info "GITHUB_CLIENT_SECRET="
    log_info ""
    log_info "# Redis (default works with docker-compose)"
    log_info "REDIS_URL=redis://redis:6379"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Validate required variables
REQUIRED_VARS=("DOMAIN" "EMAIL" "DATABASE_URL" "JWT_SECRET" "SESSION_SECRET" "ENCRYPTION_KEY")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        log_error "Required variable $var is not set in .env file"
        exit 1
    fi
done

log_info "✓ Environment variables loaded"
log_info "  Domain: $DOMAIN"
log_info "  Email: $EMAIL"

# ==========================================
# 3. Clean up old installations
# ==========================================
log_info "Cleaning up old installation..."

# Stop and remove old containers
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/infra/docker/docker-compose.yml"
if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    cd "$SCRIPT_DIR/infra/docker"
    docker-compose -f "$DOCKER_COMPOSE_FILE" down 2>/dev/null || true
fi

# Remove old nginx configs
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
rm -f /etc/nginx/sites-enabled/$DOMAIN.conf 2>/dev/null || true
rm -f /etc/nginx/sites-available/$DOMAIN.conf 2>/dev/null || true

log_info "✓ Cleanup complete"

# ==========================================
# 4. Create environment files for services
# ==========================================
log_info "Creating environment files..."

# Control plane .env
cat > "$SCRIPT_DIR/apps/control-plane/.env" <<EOF
DATABASE_URL=$DATABASE_URL
REDIS_URL=${REDIS_URL:-redis://redis:6379}
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://$DOMAIN
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-}
CLOUDFLARE_ZONE_ID=${CLOUDFLARE_ZONE_ID:-}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}
EOF

# Dashboard .env
cat > "$SCRIPT_DIR/apps/dashboard/.env.production.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_WS_URL=wss://$DOMAIN/ws
EOF

# Deployment engine .env
cat > "$SCRIPT_DIR/services/deployment-engine/.env" <<EOF
DATABASE_URL=$DATABASE_URL
REDIS_URL=${REDIS_URL:-redis://redis:6379}
NODE_ENV=production
PROMETHEUS_PORT=9102
EOF

log_info "✓ Environment files created"

# ==========================================
# 5. Build Docker images
# ==========================================
log_info "Building Docker images (this may take 10-15 minutes)..."

DOCKER_COMPOSE_FILE="$SCRIPT_DIR/infra/docker/docker-compose.yml"

if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
    log_error "docker-compose.yml not found at $DOCKER_COMPOSE_FILE"
    exit 1
fi

cd "$SCRIPT_DIR/infra/docker"

# Clean up old images to save space
docker system prune -f --volumes 2>/dev/null || true

# Build with docker-compose
docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache

log_info "✓ Docker images built"

# ==========================================
# 6. Start Redis first (needed for migrations)
# ==========================================
log_info "Starting Redis..."

cd "$SCRIPT_DIR/infra/docker"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d redis

# Wait for Redis
sleep 5

log_info "✓ Redis started"

# ==========================================
# 7. Run database migrations
# ==========================================
log_info "Running database migrations..."

cd "$SCRIPT_DIR/infra/docker"

# Generate Prisma client and run migrations
docker-compose -f "$DOCKER_COMPOSE_FILE" run --rm control-plane sh -c "npx prisma migrate deploy && npx prisma db push --skip-generate" || {
    log_warn "Migration failed, trying db push..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" run --rm control-plane npx prisma db push --force-reset --skip-generate
}

log_info "✓ Database migrations complete"

# ==========================================
# 8. Start all services
# ==========================================
log_info "Starting all services..."

cd "$SCRIPT_DIR/infra/docker"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# Wait for services to be ready
log_info "Waiting for services to start..."
sleep 10

# Check if services are running
if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Up"; then
    log_info "✓ All services started"
else
    log_error "Some services failed to start. Check logs with: cd infra/docker && docker-compose logs"
    exit 1
fi

# ==========================================
# 9. Setup Nginx
# ==========================================
log_info "Configuring Nginx..."

# Create nginx config
cat > /etc/nginx/sites-available/$DOMAIN.conf <<'NGINXCONF'
upstream dashboard {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream control_plane {
    server 127.0.0.1:4000;
    keepalive 32;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=general_limit:10m rate=50r/s;

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    
    # ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;
    
    # SSL configuration (will be added by certbot)
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Logging
    access_log /var/log/nginx/DOMAIN_PLACEHOLDER-access.log;
    error_log /var/log/nginx/DOMAIN_PLACEHOLDER-error.log;
    
    # Max body size for deployments
    client_max_body_size 100M;
    
    # Health check endpoint
    location /health {
        limit_req zone=general_limit burst=20 nodelay;
        proxy_pass http://control_plane/health;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        access_log off;
    }
    
    # API endpoints
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://control_plane;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # WebSocket endpoint
    location /ws {
        proxy_pass http://control_plane;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    
    # Metrics endpoint (restrict in production)
    location /metrics {
        proxy_pass http://control_plane/metrics;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        allow 127.0.0.1;
        deny all;
    }
    
    # Dashboard (Next.js frontend)
    location / {
        limit_req zone=general_limit burst=50 nodelay;
        proxy_pass http://dashboard;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
}
NGINXCONF

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN.conf

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN.conf /etc/nginx/sites-enabled/$DOMAIN.conf

# Test nginx config
nginx -t || {
    log_error "Nginx configuration test failed"
    exit 1
}

log_info "✓ Nginx configured"

# ==========================================
# 10. Setup SSL with Let's Encrypt
# ==========================================
log_info "Setting up SSL certificates..."

# Check if certificate already exists
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Stop nginx temporarily
    systemctl stop nginx
    
    # Get certificate
    certbot certonly --standalone \
        -d "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --preferred-challenges http || {
        log_error "Failed to obtain SSL certificate"
        log_info "Make sure:"
        log_info "  1. DNS for $DOMAIN points to this server"
        log_info "  2. Ports 80 and 443 are open"
        log_info "  3. No other service is using port 80"
        exit 1
    }
    
    log_info "✓ SSL certificate obtained"
else
    log_info "✓ SSL certificate already exists"
fi

# Setup auto-renewal
(crontab -l 2>/dev/null | grep -v certbot; echo "0 0,12 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -

# ==========================================
# 11. Start Nginx
# ==========================================
log_info "Starting Nginx..."

systemctl enable nginx
systemctl restart nginx

log_info "✓ Nginx started"

# ==========================================
# 12. Verify Installation
# ==========================================
log_info "Verifying installation..."

sleep 5

cd "$SCRIPT_DIR/infra/docker"

# Check Docker containers
log_info "Docker containers status:"
docker-compose -f "$DOCKER_COMPOSE_FILE" ps

# Test endpoints
log_info "Testing endpoints..."

# Test health endpoint
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health)
if [ "$HEALTH_STATUS" = "200" ]; then
    log_info "✓ Control plane health check: OK"
else
    log_warn "Control plane health check failed (status: $HEALTH_STATUS)"
fi

# Test dashboard
DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$DASHBOARD_STATUS" = "200" ]; then
    log_info "✓ Dashboard responding: OK"
else
    log_warn "Dashboard not responding (status: $DASHBOARD_STATUS)"
fi

# Test HTTPS endpoint
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/health 2>/dev/null || echo "000")
if [ "$HTTPS_STATUS" = "200" ]; then
    log_info "✓ HTTPS endpoint: OK"
else
    log_warn "HTTPS endpoint not responding (status: $HTTPS_STATUS)"
    log_warn "This may take a few minutes for DNS to propagate"
fi

# ==========================================
# 13. Final Instructions
# ==========================================
echo ""
log_info "=========================================="
log_info "✓ Installation Complete!"
log_info "=========================================="
echo ""
log_info "Your Apployd platform is now running:"
log_info "  • Dashboard: https://$DOMAIN"
log_info "  • API: https://$DOMAIN/api"
log_info "  • Health: https://$DOMAIN/health"
echo ""
log_info "Monitoring:"
log_info "  • Grafana: http://$(hostname -I | awk '{print $1}'):3001"
log_info "  • Prometheus: http://$(hostname -I | awk '{print $1}'):9090"
echo ""
log_info "Useful commands:"
log_info "  • View logs: cd infra/docker && docker-compose logs -f"
log_info "  • Restart services: cd infra/docker && docker-compose restart"
log_info "  • Stop all: cd infra/docker && docker-compose down"
log_info "  • Check status: cd infra/docker && docker-compose ps"
echo ""
log_info "If you encounter issues:"
log_info "  1. Check logs: cd infra/docker && docker-compose logs"
log_info "  2. Check nginx: sudo systemctl status nginx"
log_info "  3. Check nginx logs: sudo tail -f /var/log/nginx/error.log"
echo ""
log_warn "Next steps:"
log_info "  1. Visit https://$DOMAIN to access your platform"
log_info "  2. Create your first admin account"
log_info "  3. Configure your organization settings"
echo ""
log_info "=========================================="
