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
}
