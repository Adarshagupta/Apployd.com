import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { env } from '../core/env.js';
import { runCommand } from '../core/run-command.js';

interface ConfigureProxyInput {
  domain: string;
  upstreamHost: string;
  upstreamPort: number;
  /** Additional server_name aliases (custom domains). */
  aliases?: string[];
}

export class NginxAdapter {
  async configureProjectProxy(input: ConfigureProxyInput): Promise<void> {
    const configPath = join(env.NGINX_SITES_PATH, `${input.domain}.conf`);
    const template = this.loadTemplate();

    const aliasString = (input.aliases ?? []).join(' ');

    const rendered = template
      .replaceAll('{{DOMAIN}}', input.domain)
      .replaceAll('{{ALIASES}}', aliasString)
      .replaceAll('{{UPSTREAM_HOST}}', input.upstreamHost)
      .replaceAll('{{UPSTREAM_PORT}}', String(input.upstreamPort));

    writeFileSync(configPath, rendered, { encoding: 'utf8' });

    await runCommand('nginx -t');
    await runCommand('systemctl reload nginx');
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
    ].join('\\n');
    }
  }
}
