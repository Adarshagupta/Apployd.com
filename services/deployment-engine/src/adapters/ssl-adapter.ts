import { assertValidHostname } from '../core/domain-validation.js';
import { env } from '../core/env.js';
import { runHostCommand } from '../core/run-host-command.js';

const shellEscape = (value: string): string =>
  `'${value.replace(/'/g, `'\"'\"'`)}'`;

export class SslAdapter {
  /**
   * Provision (or expand) an SSL certificate for the primary domain and
   * any additional custom domain aliases.
   */
  async ensureCertificate(domain: string, aliases: string[] = []): Promise<void> {
    if (!env.CERTBOT_EMAIL) {
      throw new Error('CERTBOT_EMAIL is not configured.');
    }

    const allDomains = Array.from(
      new Set([
        assertValidHostname(domain, 'domain'),
        ...aliases.map((alias, index) => assertValidHostname(alias, `alias #${index + 1}`)),
      ]),
    );
    const certificateDomain = allDomains[0]!;
    const domainFlags = allDomains.map((d) => `-d ${shellEscape(d)}`).join(' ');
    const webrootPath = '/var/www/html';

    const command = [
      'certbot certonly --webroot',
      '--non-interactive',
      '--agree-tos',
      '--expand',
      `--cert-name ${shellEscape(certificateDomain)}`,
      `--email ${shellEscape(env.CERTBOT_EMAIL)}`,
      `--webroot-path ${shellEscape(webrootPath)}`,
      domainFlags,
    ].join(' ');

    await runHostCommand(`mkdir -p ${shellEscape(`${webrootPath}/.well-known/acme-challenge`)}`);
    await runHostCommand(command);
  }
}
