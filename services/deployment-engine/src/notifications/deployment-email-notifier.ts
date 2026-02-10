import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../core/env.js';
import { prisma } from '../core/prisma.js';

type DeploymentEmailStatus = 'ready' | 'failed';

interface DeploymentEmailInput {
  organizationId: string;
  projectId: string;
  projectName: string;
  deploymentId: string;
  environment: 'production' | 'preview';
  status: DeploymentEmailStatus;
  domain?: string | null;
  errorMessage?: string | null;
}

export class DeploymentEmailNotifier {
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

  isConfigured(): boolean {
    return this.transporter !== null && this.fromAddress !== null;
  }

  async sendDeploymentStatusEmail(input: DeploymentEmailInput): Promise<void> {
    if (!this.transporter || !this.fromAddress) {
      return;
    }

    const recipients = await this.resolveRecipients(input.organizationId);
    if (!recipients.length) {
      return;
    }

    const deploymentDetailsUrl = new URL(
      `/projects/${input.projectId}/deployments/${input.deploymentId}`,
      env.DASHBOARD_BASE_URL,
    ).toString();
    const publicUrl = resolvePublicUrl(input.domain);
    const environmentLabel = input.environment === 'preview' ? 'Preview' : 'Production';
    const statusLabel = input.status === 'ready' ? 'Ready' : 'Failed';

    const subject = `[Apployd] ${environmentLabel} deployment ${statusLabel}: ${input.projectName}`;
    const text = buildTextTemplate({
      ...input,
      deploymentDetailsUrl,
      publicUrl,
      environmentLabel,
      statusLabel,
    });
    const html = buildHtmlTemplate({
      ...input,
      deploymentDetailsUrl,
      publicUrl,
      environmentLabel,
      statusLabel,
    });

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
        role: { in: ['owner', 'admin', 'developer'] },
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

const resolvePublicUrl = (domain?: string | null): string | null => {
  if (!domain) {
    return null;
  }

  if (/^https?:\/\//i.test(domain)) {
    return domain;
  }

  if (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(domain)) {
    return `http://${domain}`;
  }

  return `https://${domain}`;
};

const buildTextTemplate = (input: DeploymentEmailInput & {
  deploymentDetailsUrl: string;
  publicUrl: string | null;
  environmentLabel: string;
  statusLabel: string;
}): string => {
  const lines = [
    `${input.environmentLabel} deployment ${input.statusLabel.toLowerCase()} for project "${input.projectName}".`,
    '',
    `Project: ${input.projectName}`,
    `Environment: ${input.environmentLabel}`,
    `Status: ${input.statusLabel}`,
    `Deployment ID: ${input.deploymentId}`,
  ];

  if (input.publicUrl) {
    lines.push(`Live URL: ${input.publicUrl}`);
  }

  if (input.errorMessage && input.status === 'failed') {
    lines.push(`Error: ${input.errorMessage}`);
  }

  lines.push(`Deployment details: ${input.deploymentDetailsUrl}`);
  return `${lines.join('\n')}\n`;
};

const buildHtmlTemplate = (input: DeploymentEmailInput & {
  deploymentDetailsUrl: string;
  publicUrl: string | null;
  environmentLabel: string;
  statusLabel: string;
}): string => {
  return `<p>${input.environmentLabel} deployment <strong>${input.statusLabel}</strong> for project <strong>${input.projectName}</strong>.</p>
<ul>
  <li><strong>Deployment ID:</strong> ${input.deploymentId}</li>
  <li><strong>Environment:</strong> ${input.environmentLabel}</li>
  <li><strong>Status:</strong> ${input.statusLabel}</li>
  ${input.publicUrl ? `<li><strong>Live URL:</strong> <a href="${input.publicUrl}">${input.publicUrl}</a></li>` : ''}
  ${input.errorMessage && input.status === 'failed' ? `<li><strong>Error:</strong> ${input.errorMessage}</li>` : ''}
</ul>
<p><a href="${input.deploymentDetailsUrl}">View deployment details in dashboard</a></p>`;
};
