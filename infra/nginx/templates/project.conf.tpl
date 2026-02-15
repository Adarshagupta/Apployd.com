upstream {{UPSTREAM_NAME}} {
  server {{UPSTREAM_HOST}}:{{UPSTREAM_PORT}};
  keepalive 64;
}

server {
  listen 80;
  server_name {{DOMAIN}} {{ALIASES}};
  server_tokens off;

  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Cross-Origin-Opener-Policy "same-origin" always;

  location /healthz {
    access_log off;
    return 200 'ok';
  }

  location / {
    limit_req zone=api_rate_limit;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300;
    proxy_send_timeout 300;
    proxy_pass {{UPSTREAM_SCHEME}}://{{UPSTREAM_NAME}};
  }
}
