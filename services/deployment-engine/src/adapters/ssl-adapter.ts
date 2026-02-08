import { env } from '../core/env.js';
import { runCommand } from '../core/run-command.js';

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

    await runCommand(command);
  }
}
