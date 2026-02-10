import { env } from '../core/env.js';
import { runHostCommand } from '../core/run-host-command.js';

export class SslAdapter {
  /**
   * Provision (or expand) an SSL certificate for the primary domain and
   * any additional custom domain aliases.
   */
  async ensureCertificate(domain: string, aliases: string[] = []): Promise<void> {
    const allDomains = [domain, ...aliases];
    const domainFlags = allDomains.map((d) => `-d ${d}`).join(' ');

    const command = [
      'certbot --nginx',
      '--non-interactive',
      '--agree-tos',
      '--expand',
      `--email ${env.CERTBOT_EMAIL}`,
      domainFlags,
    ].join(' ');

    await runHostCommand(command);
  }
}
