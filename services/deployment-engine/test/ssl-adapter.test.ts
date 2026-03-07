import { describe, expect, it, vi } from 'vitest';

const { runHostCommand } = vi.hoisted(() => ({
  runHostCommand: vi.fn(async () => ''),
}));

vi.mock('../src/core/env.js', () => ({
  env: {
    CERTBOT_EMAIL: 'ops@example.com',
  },
}));

vi.mock('../src/core/run-host-command.js', () => ({
  runHostCommand,
}));

import { SslAdapter } from '../src/adapters/ssl-adapter.js';

describe('SslAdapter', () => {
  it('uses webroot certbot mode and prepares the ACME challenge directory', async () => {
    const adapter = new SslAdapter();

    await adapter.ensureCertificate('example.com', ['www.example.com']);

    expect(runHostCommand).toHaveBeenCalledTimes(2);
    expect(runHostCommand).toHaveBeenNthCalledWith(
      1,
      "mkdir -p '/var/www/html/.well-known/acme-challenge'",
    );
    expect(runHostCommand).toHaveBeenNthCalledWith(
      2,
      "certbot certonly --webroot --non-interactive --agree-tos --expand --cert-name 'example.com' --email 'ops@example.com' --webroot-path '/var/www/html' -d 'example.com' -d 'www.example.com'",
    );
  });
});
