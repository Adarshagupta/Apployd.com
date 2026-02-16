import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/env.js', () => ({
  env: {
    NGINX_SITES_PATH: '/etc/nginx/sites-enabled',
    NGINX_TEMPLATE_PATH: undefined,
    CONTROL_PLANE_INTERNAL_URL: 'http://127.0.0.1:4000',
    EDGE_WAKE_TOKEN: 'edge-token',
    EDGE_WAKE_ENABLED: true,
  },
}));

vi.mock('../src/core/run-host-command.js', () => ({
  runHostCommand: vi.fn(async () => ''),
}));

import { NginxAdapter } from '../src/adapters/nginx-adapter.js';

describe('NginxAdapter wake fallback config', () => {
  it('uses an internal URI location for wake fallback so proxy_pass can include a path', () => {
    const adapter = new NginxAdapter() as any;
    const wakeConfig = adapter.buildWakeConfig('/api/v1/edge/deployments/test-deployment/wake');

    expect(wakeConfig.proxyDirectives).toContain('error_page 502 503 504 = /_apployd_wake;');
    expect(wakeConfig.wakeLocationBlock).toContain('location = /_apployd_wake {');
    expect(wakeConfig.wakeLocationBlock).toContain(
      'proxy_pass http://127.0.0.1:4000/api/v1/edge/deployments/test-deployment/wake;',
    );
  });

  it('rewrites legacy named wake fallback location blocks', () => {
    const adapter = new NginxAdapter() as any;
    const legacyConfig = [
      'server {',
      '  location / {',
      '    proxy_intercept_errors on;',
      '    error_page 502 503 504 = @apployd_wake;',
      '    proxy_pass http://demo_upstream;',
      '  }',
      '',
      '  location @apployd_wake {',
      '    internal;',
      '    proxy_pass http://127.0.0.1:4000/api/v1/edge/deployments/test/wake;',
      '  }',
      '}',
    ].join('\n');

    const normalized = adapter.ensureWakeFallback(legacyConfig, {
      proxyDirectives: [
        '        proxy_intercept_errors on;',
        '        error_page 502 503 504 = /_apployd_wake;',
      ].join('\n'),
      locationBlock: '',
      wakeLocationBlock: '',
      errorLocationBlock: '',
    });

    expect(normalized).toContain('error_page 502 503 504 = /_apployd_wake;');
    expect(normalized).toContain('location = /_apployd_wake {');
    expect(normalized).not.toContain('error_page 502 503 504 = @apployd_wake;');
    expect(normalized).not.toContain('location @apployd_wake {');
  });

  it('renders attack mode directives with rate limit and connection caps', () => {
    const adapter = new NginxAdapter() as any;
    const config = adapter.buildAttackModeConfig('demo.example.com', true);

    expect(config.enabled).toBe(true);
    expect(config.httpDirectives).toContain('limit_req_zone $binary_remote_addr');
    expect(config.httpDirectives).toContain('limit_conn_zone $binary_remote_addr');
    expect(config.locationDirectives).toContain('limit_req zone=');
    expect(config.locationDirectives).toContain('limit_conn');
    expect(config.locationDirectives).toContain('limit_req_status 429;');
  });

  it('keeps templates clean when attack mode is disabled', () => {
    const adapter = new NginxAdapter() as any;
    const normalized = adapter.ensureAttackModeFallback(
      [
        '{{ATTACK_MODE_HTTP_DIRECTIVES}}',
        'server {',
        '  location / {',
        '{{ATTACK_MODE_LOCATION_DIRECTIVES}}',
        '    proxy_pass http://demo_upstream;',
        '  }',
        '}',
      ].join('\n'),
      {
        enabled: false,
        httpDirectives: '',
        locationDirectives: '',
      },
    );

    expect(normalized).not.toContain('{{ATTACK_MODE_HTTP_DIRECTIVES}}');
    expect(normalized).not.toContain('{{ATTACK_MODE_LOCATION_DIRECTIVES}}');
    expect(normalized).toContain('proxy_pass http://demo_upstream;');
  });
});
