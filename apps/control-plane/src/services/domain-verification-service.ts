import dns from 'node:dns/promises';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

export interface VerificationResult {
  verified: boolean;
  method: 'cname' | 'txt';
  detail: string;
}

/**
 * Verifies that a custom domain's DNS is correctly configured.
 *
 * Supports two verification methods:
 * 1. CNAME – user points `custom.example.com` CNAME → `<project>.<org>.<BASE_DOMAIN>`
 * 2. TXT   – user adds a TXT record `_apployd-verify.<domain>` with the verification token
 *
 * CNAME is the primary method because it also routes traffic.
 */
export class DomainVerificationService {
  /**
   * Check whether the CNAME for `domain` resolves to the expected target.
   */
  async verifyCname(domain: string, expectedTarget: string): Promise<VerificationResult> {
    try {
      const records = await dns.resolveCname(domain);
      const normalised = records.map((r) => r.replace(/\.$/, '').toLowerCase());
      const target = expectedTarget.toLowerCase();

      if (normalised.includes(target)) {
        return { verified: true, method: 'cname', detail: `CNAME resolves to ${target}` };
      }

      return {
        verified: false,
        method: 'cname',
        detail: `CNAME resolves to [${normalised.join(', ')}], expected ${target}`,
      };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENODATA' || code === 'ENOTFOUND') {
        return { verified: false, method: 'cname', detail: 'No CNAME record found' };
      }
      return { verified: false, method: 'cname', detail: `DNS lookup error: ${code ?? err}` };
    }
  }

  /**
   * Check whether the TXT record `_apployd-verify.<domain>` contains the expected token.
   */
  async verifyTxt(domain: string, expectedToken: string): Promise<VerificationResult> {
    try {
      const records = await dns.resolveTxt(`_apployd-verify.${domain}`);
      const flat = records.flat().map((r) => r.trim());

      if (flat.includes(expectedToken)) {
        return { verified: true, method: 'txt', detail: 'TXT verification token matched' };
      }

      return {
        verified: false,
        method: 'txt',
        detail: `TXT records found but token not matched`,
      };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENODATA' || code === 'ENOTFOUND') {
        return { verified: false, method: 'txt', detail: 'No TXT record found' };
      }
      return { verified: false, method: 'txt', detail: `DNS lookup error: ${code ?? err}` };
    }
  }

  /**
   * Run both CNAME and TXT verification. CNAME takes priority.
   * Updates the database record on success.
   */
  async verify(domainId: string): Promise<VerificationResult> {
    const record = await prisma.customDomain.findUniqueOrThrow({
      where: { id: domainId },
      include: {
        project: {
          include: { organization: true },
        },
      },
    });

    const cnameTarget = record.cnameTarget;

    // Try CNAME first (preferred — routes traffic AND proves ownership)
    const cnameResult = await this.verifyCname(record.domain, cnameTarget);
    if (cnameResult.verified) {
      await prisma.customDomain.update({
        where: { id: domainId },
        data: { status: 'active', verifiedAt: new Date() },
      });
      return cnameResult;
    }

    // Fallback: TXT record verification
    const txtResult = await this.verifyTxt(record.domain, record.verificationToken);
    if (txtResult.verified) {
      await prisma.customDomain.update({
        where: { id: domainId },
        data: { status: 'active', verifiedAt: new Date() },
      });
      return txtResult;
    }

    // Neither verified — update status to failed if it was previously something else
    if (record.status !== 'pending_verification') {
      await prisma.customDomain.update({
        where: { id: domainId },
        data: { status: 'failed' },
      });
    }

    return cnameResult; // Return CNAME result as primary feedback
  }

  /**
   * Build the expected CNAME target for a project.
   * e.g. `my-project.my-org.apployd.app`
   */
  static buildCnameTarget(projectSlug: string, orgSlug: string): string {
    return `${projectSlug}.${orgSlug}.${env.BASE_DOMAIN}`;
  }
}
