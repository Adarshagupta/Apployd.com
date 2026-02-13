import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { assertValidHostname } from '../core/domain-validation.js';
import { env } from '../core/env.js';
import { runHostCommand } from '../core/run-host-command.js';

interface ConfigureProxyInput {
  domain: string;
  upstreamHost: string;
  upstreamPort: number;
  /** Additional server_name aliases (custom domains). */
  aliases?: string[];
}

interface ProxyProbeResult {
  httpStatus: string;
  httpsStatus: string;
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

    const configPath = join(env.NGINX_SITES_PATH, `${domain}.conf`);
    const template = this.loadTemplate();

    const aliasString = aliases.join(' ');

    const rendered = template
      .replaceAll('{{DOMAIN}}', domain)
      .replaceAll('{{ALIASES}}', aliasString)
      .replaceAll('{{UPSTREAM_HOST}}', upstreamHost)
      .replaceAll('{{UPSTREAM_PORT}}', String(input.upstreamPort));

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

  private loadTemplate(): string {
    if (env.NGINX_TEMPLATE_PATH) {
      try {
        return readFileSync(env.NGINX_TEMPLATE_PATH, 'utf8');
      } catch {
        // Fall through to default template
      }
    }
    
    return [
      'server {',
      '    listen 80;',
      '    server_name {{DOMAIN}} {{ALIASES}};',
      '    location / {',
      '        proxy_pass http://{{UPSTREAM_HOST}}:{{UPSTREAM_PORT}};',
      '        proxy_http_version 1.1;',
      '        proxy_set_header Upgrade $http_upgrade;',
      '        proxy_set_header Connection "upgrade";',
      '        proxy_set_header Host $host;',
      '    }',
      '}',
    ].join('\n');
  }

  private async probeRoute(domain: string): Promise<ProxyProbeResult> {
    const probeScript = [
      `HTTP_CODE="000"`,
      `HTTPS_CODE="000"`,
      `if command -v curl >/dev/null 2>&1; then`,
      `  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -H "Host: ${domain}" http://127.0.0.1/ || echo 000)`,
      `  HTTPS_CODE=$(curl -k -sS -o /dev/null -w "%{http_code}" --resolve "${domain}:443:127.0.0.1" "https://${domain}/" || echo 000)`,
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
}
