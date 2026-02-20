import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { assertValidHostname } from '../core/domain-validation.js';
import { env } from '../core/env.js';
import { runHostCommand } from '../core/run-host-command.js';

interface ConfigureProxyInput {
  domain: string;
  upstreamHost: string;
  upstreamPort: number;
  upstreamScheme?: 'http' | 'https';
  attackModeEnabled?: boolean;
  /** Additional server_name aliases (custom domains). */
  aliases?: string[];
  /** Internal edge wake path (for example: /api/v1/edge/deployments/<id>/wake). */
  wakePath?: string;
}

interface ConfigureTlsProxyInput extends ConfigureProxyInput {
  certificateDomain?: string;
}

interface ProxyProbeResult {
  httpStatus: string;
  httpsStatus: string;
}

interface UpstreamProbeResult {
  httpStatus: string;
  httpsStatus: string;
  tcpReachable: boolean;
}

type RouteReadinessMode = 'either' | 'http' | 'https';

const isReachableStatus = (status: string): boolean =>
  status !== '000' && status !== '502' && status !== '503' && status !== '504';

export class NginxAdapter {
  async configureProjectProxy(input: ConfigureProxyInput): Promise<void> {
    const domain = assertValidHostname(input.domain, 'domain');
    const aliases = (input.aliases ?? []).map((alias, index) =>
      assertValidHostname(alias, `alias #${index + 1}`),
    );
    const upstreamHost = input.upstreamHost.trim();
    if (!/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+)$/i.test(upstreamHost)) {
      throw new Error(`Invalid upstream host: ${input.upstreamHost}`);
    }
    if (!Number.isInteger(input.upstreamPort) || input.upstreamPort < 1 || input.upstreamPort > 65535) {
      throw new Error(`Invalid upstream port: ${input.upstreamPort}`);
    }
    const upstreamScheme = this.normalizeUpstreamScheme(input.upstreamScheme);

    const configPath = join(env.NGINX_SITES_PATH, `${domain}.conf`);
    const template = this.loadTemplate();
    const upstreamName = this.buildUpstreamName(domain);
    const wakeConfig = this.buildWakeConfig(input.wakePath);
    const attackMode = this.buildAttackModeConfig(domain, input.attackModeEnabled === true);

    const aliasString = aliases.join(' ');

    let rendered = template
      .replaceAll('{{DOMAIN}}', domain)
      .replaceAll('{{ALIASES}}', aliasString)
      .replaceAll('{{UPSTREAM_NAME}}', upstreamName)
      .replaceAll('{{UPSTREAM_SCHEME}}', upstreamScheme)
      .replaceAll('{{UPSTREAM_HOST}}', upstreamHost)
      .replaceAll('{{UPSTREAM_PORT}}', String(input.upstreamPort))
      .replaceAll('{{WAKE_PROXY_DIRECTIVES}}', wakeConfig.proxyDirectives)
      .replaceAll('{{WAKE_FALLBACK_LOCATION}}', wakeConfig.locationBlock)
      .replaceAll('{{ATTACK_MODE_HTTP_DIRECTIVES}}', attackMode.httpDirectives)
      .replaceAll('{{ATTACK_MODE_LOCATION_DIRECTIVES}}', attackMode.locationDirectives);
    // Backward compatibility for template versions that still hardcode http://.
    if (!template.includes('{{UPSTREAM_SCHEME}}')) {
      rendered = rendered.replace(/proxy_pass\s+http:\/\//g, `proxy_pass ${upstreamScheme}://`);
    }
    rendered = this.ensureWakeFallback(rendered, wakeConfig);
    rendered = this.ensureAttackModeFallback(rendered, attackMode);

    writeFileSync(configPath, rendered, { encoding: 'utf8' });

    await runHostCommand('nginx -t');
    await runHostCommand('systemctl reload nginx');
  }

  async configureProjectProxyWithTls(input: ConfigureTlsProxyInput): Promise<void> {
    const domain = assertValidHostname(input.domain, 'domain');
    const aliases = (input.aliases ?? []).map((alias, index) =>
      assertValidHostname(alias, `alias #${index + 1}`),
    );
    const upstreamHost = input.upstreamHost.trim();
    if (!/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+)$/i.test(upstreamHost)) {
      throw new Error(`Invalid upstream host: ${input.upstreamHost}`);
    }
    if (!Number.isInteger(input.upstreamPort) || input.upstreamPort < 1 || input.upstreamPort > 65535) {
      throw new Error(`Invalid upstream port: ${input.upstreamPort}`);
    }
    const upstreamScheme = this.normalizeUpstreamScheme(input.upstreamScheme);

    const certDomain = input.certificateDomain
      ? assertValidHostname(input.certificateDomain, 'certificateDomain')
      : domain;
    const certPath = `/etc/letsencrypt/live/${certDomain}/fullchain.pem`;
    const keyPath = `/etc/letsencrypt/live/${certDomain}/privkey.pem`;

    const configPath = join(env.NGINX_SITES_PATH, `${domain}.conf`);
    const aliasString = aliases.join(' ');
    const upstreamName = this.buildUpstreamName(domain);
    const wakeConfig = this.buildWakeConfig(input.wakePath);
    const attackMode = this.buildAttackModeConfig(domain, input.attackModeEnabled === true);
    let rendered = this.buildTlsTemplate()
      .replaceAll('{{DOMAIN}}', domain)
      .replaceAll('{{ALIASES}}', aliasString)
      .replaceAll('{{UPSTREAM_NAME}}', upstreamName)
      .replaceAll('{{UPSTREAM_SCHEME}}', upstreamScheme)
      .replaceAll('{{UPSTREAM_HOST}}', upstreamHost)
      .replaceAll('{{UPSTREAM_PORT}}', String(input.upstreamPort))
      .replaceAll('{{SSL_CERT_PATH}}', certPath)
      .replaceAll('{{SSL_KEY_PATH}}', keyPath)
      .replaceAll('{{WAKE_PROXY_DIRECTIVES}}', wakeConfig.proxyDirectives)
      .replaceAll('{{WAKE_FALLBACK_LOCATION}}', wakeConfig.locationBlock)
      .replaceAll('{{ATTACK_MODE_HTTP_DIRECTIVES}}', attackMode.httpDirectives)
      .replaceAll('{{ATTACK_MODE_LOCATION_DIRECTIVES}}', attackMode.locationDirectives);
    rendered = rendered.replace(/proxy_pass\s+http:\/\//g, `proxy_pass ${upstreamScheme}://`);
    rendered = this.ensureWakeFallback(rendered, wakeConfig);
    rendered = this.ensureAttackModeFallback(rendered, attackMode);

    writeFileSync(configPath, rendered, { encoding: 'utf8' });

    await runHostCommand('nginx -t');
    await runHostCommand('systemctl reload nginx');
  }

  async waitForRouteReady(
    domainInput: string,
    onLog?: (line: string) => void,
    timeoutSeconds = 30,
    mode: RouteReadinessMode = 'either',
  ): Promise<ProxyProbeResult> {
    const domain = assertValidHostname(domainInput, 'domain');
    const maxAttempts = Math.max(1, timeoutSeconds);
    let last: ProxyProbeResult = { httpStatus: '000', httpsStatus: '000' };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const probe = await this.probeRoute(domain);
      last = probe;

      const httpReachable = isReachableStatus(probe.httpStatus);
      const httpsReachable = isReachableStatus(probe.httpsStatus);
      const routeReady = mode === 'http'
        ? httpReachable
        : mode === 'https'
          ? httpsReachable
          : (httpReachable || httpsReachable);

      if (routeReady) {
        return probe;
      }

      if (attempt === 1 || attempt % 5 === 0 || attempt === maxAttempts) {
        onLog?.(
          `Route check: waiting for ${domain} (${mode}) (attempt ${attempt}/${maxAttempts}, http=${probe.httpStatus}, https=${probe.httpsStatus})`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return last;
  }

  async waitForUpstreamReachable(
    upstreamHost: string,
    upstreamPort: number,
    onLog?: (line: string) => void,
    timeoutSeconds = 20,
  ): Promise<UpstreamProbeResult> {
    const host = upstreamHost.trim();
    if (!/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+)$/i.test(host)) {
      throw new Error(`Invalid upstream host: ${upstreamHost}`);
    }
    if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
      throw new Error(`Invalid upstream port: ${upstreamPort}`);
    }

    const maxAttempts = Math.max(1, timeoutSeconds);
    let last: UpstreamProbeResult = { httpStatus: '000', httpsStatus: '000', tcpReachable: false };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const probe = await this.probeUpstream(host, upstreamPort);
      last = probe;

      const httpReachable = isReachableStatus(probe.httpStatus);
      const httpsReachable = isReachableStatus(probe.httpsStatus);
      if (httpReachable || httpsReachable) {
        return probe;
      }

      if (attempt === 1 || attempt % 5 === 0 || attempt === maxAttempts) {
        onLog?.(
          `Upstream check: waiting for ${host}:${upstreamPort} (attempt ${attempt}/${maxAttempts}, http=${probe.httpStatus}, https=${probe.httpsStatus}, tcp=${probe.tcpReachable ? 'ok' : 'down'})`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return last;
  }

  private loadTemplate(): string {
    if (env.NGINX_TEMPLATE_PATH) {
      try {
        return readFileSync(env.NGINX_TEMPLATE_PATH, 'utf8');
      } catch {
        // Fall through to default template
      }
    }
    
    return [
      '{{ATTACK_MODE_HTTP_DIRECTIVES}}',
      'server {',
      '    listen 80;',
      '    server_name {{DOMAIN}} {{ALIASES}};',
      '    server_tokens off;',
      '    add_header X-Frame-Options "SAMEORIGIN" always;',
      '    add_header X-Content-Type-Options "nosniff" always;',
      '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
      '    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;',
      '    add_header Cross-Origin-Opener-Policy "same-origin" always;',
      '    location / {',
      '        proxy_http_version 1.1;',
      '        proxy_set_header Upgrade $http_upgrade;',
      '        proxy_set_header Connection "upgrade";',
      '        proxy_set_header Host $host;',
      '{{ATTACK_MODE_LOCATION_DIRECTIVES}}',
      '{{WAKE_PROXY_DIRECTIVES}}',
      '        proxy_pass {{UPSTREAM_SCHEME}}://{{UPSTREAM_HOST}}:{{UPSTREAM_PORT}};',
      '    }',
      '{{WAKE_FALLBACK_LOCATION}}',
      '}',
    ].join('\n');
  }

  private buildTlsTemplate(): string {
    return [
      '{{ATTACK_MODE_HTTP_DIRECTIVES}}',
      'upstream {{UPSTREAM_NAME}} {',
      '  server {{UPSTREAM_HOST}}:{{UPSTREAM_PORT}};',
      '  keepalive 64;',
      '}',
      '',
      'server {',
      '  listen 80;',
      '  server_name {{DOMAIN}} {{ALIASES}};',
      '  server_tokens off;',
      '  add_header X-Frame-Options "SAMEORIGIN" always;',
      '  add_header X-Content-Type-Options "nosniff" always;',
      '  add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
      '  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;',
      '  add_header Cross-Origin-Opener-Policy "same-origin" always;',
      '',
      '  location /.well-known/acme-challenge/ {',
      '    root /var/www/html;',
      '  }',
      '',
      '  location /healthz {',
      "    access_log off;",
      "    return 200 'ok';",
      '  }',
      '',
      '  location / {',
      '    set $apployd_forwarded_proto $scheme;',
      '    if ($http_x_forwarded_proto ~* "^https$") {',
      '      set $apployd_forwarded_proto https;',
      '    }',
      '    if ($apployd_forwarded_proto != "https") {',
      '      return 301 https://$host$request_uri;',
      '    }',
      '    proxy_http_version 1.1;',
      '    proxy_set_header Upgrade $http_upgrade;',
      '    proxy_set_header Connection $connection_upgrade;',
      '    proxy_set_header Host $host;',
      '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '    proxy_set_header X-Forwarded-Proto $apployd_forwarded_proto;',
      '    proxy_read_timeout 300;',
      '    proxy_send_timeout 300;',
      '    proxy_pass {{UPSTREAM_SCHEME}}://{{UPSTREAM_NAME}};',
      '  }',
      '}',
      '',
      'server {',
      '  listen 443 ssl http2;',
      '  server_name {{DOMAIN}} {{ALIASES}};',
      '  server_tokens off;',
      '  add_header X-Frame-Options "SAMEORIGIN" always;',
      '  add_header X-Content-Type-Options "nosniff" always;',
      '  add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
      '  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;',
      '  add_header Cross-Origin-Opener-Policy "same-origin" always;',
      '  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;',
      '',
      '  ssl_certificate {{SSL_CERT_PATH}};',
      '  ssl_certificate_key {{SSL_KEY_PATH}};',
      '',
      '  location /healthz {',
      "    access_log off;",
      "    return 200 'ok';",
      '  }',
      '',
      '  location / {',
      '    proxy_http_version 1.1;',
      '    proxy_set_header Upgrade $http_upgrade;',
      '    proxy_set_header Connection $connection_upgrade;',
      '    proxy_set_header Host $host;',
      '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '    proxy_set_header X-Forwarded-Proto $scheme;',
      '    proxy_read_timeout 300;',
      '    proxy_send_timeout 300;',
      '{{ATTACK_MODE_LOCATION_DIRECTIVES}}',
      '{{WAKE_PROXY_DIRECTIVES}}',
      '    proxy_pass {{UPSTREAM_SCHEME}}://{{UPSTREAM_NAME}};',
      '  }',
      '{{WAKE_FALLBACK_LOCATION}}',
      '}',
    ].join('\n');
  }

  private async probeRoute(domain: string): Promise<ProxyProbeResult> {
    const probeScript = [
      `HTTP_CODE="000"`,
      `HTTPS_CODE="000"`,
      `if command -v curl >/dev/null 2>&1; then`,
      `  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -H "Host: ${domain}" http://127.0.0.1/ || true)`,
      `  [ -z "$HTTP_CODE" ] && HTTP_CODE=000`,
      `  HTTPS_CODE=$(curl -k -sS -o /dev/null -w "%{http_code}" --resolve "${domain}:443:127.0.0.1" "https://${domain}/" || true)`,
      `  [ -z "$HTTPS_CODE" ] && HTTPS_CODE=000`,
      `elif command -v wget >/dev/null 2>&1; then`,
      `  wget -q -T 3 -O /dev/null --header="Host: ${domain}" http://127.0.0.1/ && HTTP_CODE=200 || HTTP_CODE=000`,
      `  wget -q -T 3 -O /dev/null --header="Host: ${domain}" --no-check-certificate "https://127.0.0.1/" && HTTPS_CODE=200 || HTTPS_CODE=000`,
      `fi`,
      `echo "\${HTTP_CODE} \${HTTPS_CODE}"`,
    ].join('\n');

    try {
      const raw = await runHostCommand(probeScript);
      const [httpStatus = '000', httpsStatus = '000'] = raw.trim().split(/\s+/);
      return {
        httpStatus,
        httpsStatus,
      };
    } catch {
      return {
        httpStatus: '000',
        httpsStatus: '000',
      };
    }
  }

  private async probeUpstream(host: string, port: number): Promise<UpstreamProbeResult> {
    const probeScript = [
      `HTTP_CODE="000"`,
      `HTTPS_CODE="000"`,
      `TCP_OK="0"`,
      `if command -v curl >/dev/null 2>&1; then`,
      `  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 "http://${host}:${port}/" || true)`,
      `  [ -z "$HTTP_CODE" ] && HTTP_CODE=000`,
      `  HTTPS_CODE=$(curl -k -sS -o /dev/null -w "%{http_code}" --max-time 2 "https://${host}:${port}/" || true)`,
      `  [ -z "$HTTPS_CODE" ] && HTTPS_CODE=000`,
      `elif command -v wget >/dev/null 2>&1; then`,
      `  wget -q -T 2 -O /dev/null "http://${host}:${port}/" && HTTP_CODE=200 || HTTP_CODE=000`,
      `  wget -q -T 2 -O /dev/null --no-check-certificate "https://${host}:${port}/" && HTTPS_CODE=200 || HTTPS_CODE=000`,
      `fi`,
      `if command -v nc >/dev/null 2>&1; then`,
      `  nc -z -w2 ${host} ${port} && TCP_OK=1 || TCP_OK=0`,
      `fi`,
      `echo "\${HTTP_CODE} \${HTTPS_CODE} \${TCP_OK}"`,
    ].join('\n');

    try {
      const raw = await runHostCommand(probeScript);
      const [httpStatus = '000', httpsStatus = '000', tcpRaw = '0'] = raw.trim().split(/\s+/);
      return {
        httpStatus,
        httpsStatus,
        tcpReachable: tcpRaw === '1',
      };
    } catch {
      return {
        httpStatus: '000',
        httpsStatus: '000',
        tcpReachable: false,
      };
    }
  }

  async getNginxErrorLogTail(lines = 60): Promise<string> {
    const safeLines = Math.max(1, Math.min(500, Math.trunc(lines) || 60));
    try {
      return await runHostCommand(`tail -n ${safeLines} /var/log/nginx/error.log 2>/dev/null || true`);
    } catch {
      return '';
    }
  }

  private buildWakeConfig(wakePathInput?: string): {
    proxyDirectives: string;
    locationBlock: string;
    wakeLocationBlock: string;
    errorLocationBlock: string;
  } {
    const wakeInternalLocation = '/_apployd_wake';
    const fallbackHtml = this.escapeNginxHeaderValue(this.buildEdgeErrorHtml());
    const errorLocationBlock = [
      '  location = /_apployd_error_fallback {',
      '    internal;',
      '    default_type text/html;',
      '    add_header Cache-Control "no-store, no-cache, must-revalidate" always;',
      `    return 503 "${fallbackHtml}";`,
      '  }',
    ].join('\n');

    const wakeEnabled =
      env.EDGE_WAKE_ENABLED &&
      typeof wakePathInput === 'string' &&
      wakePathInput.trim().length > 0;
    if (!wakeEnabled) {
      return {
        proxyDirectives: [
          'proxy_intercept_errors on;',
          'error_page 502 503 504 =503 /_apployd_error_fallback;',
        ]
          .map((line) => `        ${line}`)
          .join('\n'),
        locationBlock: errorLocationBlock,
        wakeLocationBlock: '',
        errorLocationBlock,
      };
    }

    const wakePath = wakePathInput!.trim().startsWith('/')
      ? wakePathInput!.trim()
      : `/${wakePathInput!.trim()}`;
    const controlPlaneBase = env.CONTROL_PLANE_INTERNAL_URL.replace(/\/+$/, '');
    const wakeUrl = `${controlPlaneBase}${wakePath}`;
    const token = this.escapeNginxHeaderValue(env.EDGE_WAKE_TOKEN ?? '');

    const proxyDirectives = [
      'proxy_intercept_errors on;',
      `error_page 502 503 504 = ${wakeInternalLocation};`,
    ]
      .map((line) => `        ${line}`)
      .join('\n');

    const wakeLocationBlock = [
      `  location = ${wakeInternalLocation} {`,
      '    internal;',
      '    proxy_http_version 1.1;',
      '    proxy_method GET;',
      '    proxy_pass_request_body off;',
      '    proxy_set_header Content-Length "";',
      '    proxy_set_header Host $host;',
      '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '    proxy_set_header X-Forwarded-Proto $scheme;',
      `    proxy_set_header X-Apployd-Edge-Token "${token}";`,
      '    proxy_set_header X-Apployd-Original-Uri $request_uri;',
      '    proxy_set_header X-Apployd-Original-Method $request_method;',
      '    proxy_set_header X-Apployd-Upstream-Status $upstream_status;',
      '    proxy_intercept_errors on;',
      '    error_page 500 502 503 504 =503 /_apployd_error_fallback;',
      `    proxy_pass ${wakeUrl};`,
      '  }',
    ].join('\n');

    return {
      proxyDirectives,
      locationBlock: `${wakeLocationBlock}\n\n${errorLocationBlock}`,
      wakeLocationBlock,
      errorLocationBlock,
    };
  }

  private ensureWakeFallback(
    renderedConfig: string,
    wakeConfig: {
      proxyDirectives: string;
      locationBlock: string;
      wakeLocationBlock: string;
      errorLocationBlock: string;
    },
  ): string {
    if (!wakeConfig.proxyDirectives) {
      return renderedConfig;
    }

    let rendered = renderedConfig
      .replaceAll('error_page 502 503 504 = @apployd_wake;', 'error_page 502 503 504 = /_apployd_wake;')
      .replaceAll('location @apployd_wake {', 'location = /_apployd_wake {');

    if (!rendered.includes('proxy_intercept_errors on;')) {
      const proxyPassLine = rendered.match(/^(\s*)proxy_pass\s+[^\n;]+;$/m);
      if (proxyPassLine && proxyPassLine.index !== undefined) {
        const indent = proxyPassLine[1] ?? '';
        const normalizedDirectives = wakeConfig.proxyDirectives
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => `${indent}${line}`)
          .join('\n');

        rendered =
          rendered.slice(0, proxyPassLine.index) +
          `${normalizedDirectives}\n` +
          rendered.slice(proxyPassLine.index);
      }
    }

    const blocksToAppend: string[] = [];
    const hasWakeLocation =
      rendered.includes('location = /_apployd_wake {') || rendered.includes('location @apployd_wake {');
    if (wakeConfig.wakeLocationBlock && !hasWakeLocation) {
      blocksToAppend.push(wakeConfig.wakeLocationBlock);
    }
    if (!rendered.includes('/_apployd_error_fallback')) {
      blocksToAppend.push(wakeConfig.errorLocationBlock);
    }

    if (blocksToAppend.length > 0) {
      const lastBraceIndex = rendered.lastIndexOf('}');
      if (lastBraceIndex > 0) {
        rendered =
          `${rendered.slice(0, lastBraceIndex).trimEnd()}\n\n` +
          `${blocksToAppend.join('\n\n')}\n` +
          `${rendered.slice(lastBraceIndex)}`;
      }
    }

    return rendered;
  }

  private buildAttackModeConfig(
    domain: string,
    enabled: boolean,
  ): {
    enabled: boolean;
    httpDirectives: string;
    locationDirectives: string;
  } {
    if (!enabled) {
      return {
        enabled: false,
        httpDirectives: '',
        locationDirectives: '',
      };
    }

    const normalizedPrefix = this.buildUpstreamName(domain).replace(/_upstream$/, '') || 'project';
    const suffix = this.shortDomainHash(domain);
    const prefix = `${normalizedPrefix.slice(0, 24)}_${suffix}`;
    const requestZone = `${prefix}_req`;
    const connectionZone = `${prefix}_conn`;
    const httpDirectives = [
      `limit_req_zone $binary_remote_addr zone=${requestZone}:10m rate=15r/s;`,
      `limit_conn_zone $binary_remote_addr zone=${connectionZone}:10m;`,
    ].join('\n');

    const locationDirectives = [
      `limit_req zone=${requestZone} burst=30 nodelay;`,
      `limit_conn ${connectionZone} 20;`,
      'limit_req_status 429;',
      'limit_conn_status 429;',
    ]
      .map((line) => `        ${line}`)
      .join('\n');

    return {
      enabled: true,
      httpDirectives,
      locationDirectives,
    };
  }

  private ensureAttackModeFallback(
    renderedConfig: string,
    attackMode: {
      enabled: boolean;
      httpDirectives: string;
      locationDirectives: string;
    },
  ): string {
    if (!attackMode.enabled) {
      return renderedConfig
        .replaceAll('{{ATTACK_MODE_HTTP_DIRECTIVES}}', '')
        .replaceAll('{{ATTACK_MODE_LOCATION_DIRECTIVES}}', '');
    }

    let rendered = renderedConfig
      .replaceAll('{{ATTACK_MODE_HTTP_DIRECTIVES}}', attackMode.httpDirectives)
      .replaceAll('{{ATTACK_MODE_LOCATION_DIRECTIVES}}', attackMode.locationDirectives);

    if (!rendered.includes('limit_req_zone $binary_remote_addr')) {
      rendered = `${attackMode.httpDirectives}\n${rendered}`;
    }

    if (!rendered.includes('limit_req zone=')) {
      const locationMatch = rendered.match(/location\s+\/\s*\{/);
      if (locationMatch && locationMatch.index !== undefined) {
        const insertionPoint = locationMatch.index + locationMatch[0].length;
        rendered =
          `${rendered.slice(0, insertionPoint)}\n` +
          `${attackMode.locationDirectives}\n` +
          `${rendered.slice(insertionPoint)}`;
      }
    }

    return rendered;
  }

  private buildEdgeErrorHtml(): string {
    return (
      "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Temporarily unavailable</title><style>body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:24px}main{max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,.07)}h1{margin:0 0 10px;font-size:20px}p{margin:0;color:#334155;line-height:1.5}a{display:inline-block;margin-top:16px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:10px;color:#0f172a;text-decoration:none}a:hover{background:#f1f5f9}</style></head><body><main><h1>Temporarily unavailable</h1><p>This service is waking up or restarting. Please try again in a few seconds.</p><a href='javascript:location.reload()'>Retry</a></main></body></html>"
    );
  }

  private escapeNginxHeaderValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/\r/g, '')
      .replace(/\n/g, '');
  }

  private normalizeUpstreamScheme(scheme?: 'http' | 'https'): 'http' | 'https' {
    return scheme === 'https' ? 'https' : 'http';
  }

  private buildUpstreamName(domain: string): string {
    const normalized = domain
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const short = normalized.slice(0, 40);
    return `${short || 'project'}_upstream`;
  }

  private shortDomainHash(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0').slice(0, 6);
  }
}
