upstream {{UPSTREAM_NAME}} {
  server {{UPSTREAM_HOST}}:{{UPSTREAM_PORT}};
  keepalive 64;
}

server {
  listen 80;
  server_name {{DOMAIN}} {{ALIASES}};

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
