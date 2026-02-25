import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../core/env.js';
import { prisma } from '../core/prisma.js';

interface SecurityIncidentEmailInput {
  incidentId: string;
  organizationId: string;
  projectId: string;
  projectName: string;
  severity: string;
  title: string;
  description: string;
  blockedAt: Date;
}

export class SecurityIncidentEmailNotifier {
  private readonly transporter: Transporter | null;

  private readonly fromAddress: string | null;

  constructor() {
    this.fromAddress = env.SMTP_FROM_EMAIL
      ? env.SMTP_FROM_NAME
        ? `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`
        : env.SMTP_FROM_EMAIL
      : null;

    if (!env.SMTP_HOST || !this.fromAddress) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER
        ? {
            auth: {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            },
          }
        : {}),
    });
  }

  async sendIncidentBlockedEmail(input: SecurityIncidentEmailInput): Promise<void> {
    if (!this.transporter || !this.fromAddress) {
      return;
    }

    const recipients = await this.resolveRecipients(input.organizationId);
    if (!recipients.length) {
      return;
    }

    const securityCenterUrl = new URL('/security-center', env.DASHBOARD_BASE_URL).toString();
    const incidentDetailsUrl = `${securityCenterUrl}?incidentId=${encodeURIComponent(input.incidentId)}`;
    const severityLabel = input.severity.trim().toUpperCase() || 'HIGH';
    const subject = `[Apployd Security] ${severityLabel} incident blocked for ${input.projectName}`;

    const text = [
      `A security incident was detected and automatically blocked for project "${input.projectName}".`,
      '',
      `Incident ID: ${input.incidentId}`,
      `Severity: ${severityLabel}`,
      `Title: ${input.title}`,
      `Description: ${input.description}`,
      `Blocked At: ${input.blockedAt.toISOString()}`,
      '',
      'If you believe this block is incorrect, submit an appeal from Security Center.',
      `Security Center: ${securityCenterUrl}`,
      `Incident Link: ${incidentDetailsUrl}`,
    ].join('\n');

    const html = `
<p>A security incident was detected and automatically blocked for project <strong>${escapeHtml(input.projectName)}</strong>.</p>
<ul>
  <li><strong>Incident ID:</strong> ${escapeHtml(input.incidentId)}</li>
  <li><strong>Severity:</strong> ${escapeHtml(severityLabel)}</li>
  <li><strong>Title:</strong> ${escapeHtml(input.title)}</li>
  <li><strong>Description:</strong> ${escapeHtml(input.description)}</li>
  <li><strong>Blocked At:</strong> ${escapeHtml(input.blockedAt.toISOString())}</li>
</ul>
<p>If you believe this block is incorrect, submit an appeal from Security Center.</p>
<p><a href="${securityCenterUrl}">Open Security Center</a></p>
<p><a href="${incidentDetailsUrl}">Open this incident</a></p>
`;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: this.fromAddress,
      bcc: recipients,
      subject,
      text,
      html,
    });
  }

  private async resolveRecipients(organizationId: string): Promise<string[]> {
    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId,
      },
      select: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    return Array.from(
      new Set(
        members
          .map((member) => member.user.email.trim().toLowerCase())
          .filter((email) => email.length > 0),
      ),
    );
  }
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
