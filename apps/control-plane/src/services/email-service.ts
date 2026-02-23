import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';

export interface EmailConfigurationStatus {
  configured: boolean;
  missing: string[];
}

export interface EmailMessageInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export class EmailService {
  private readonly transporter: Transporter | null;

  private readonly fromAddress: string | null;

  private readonly configurationStatus: EmailConfigurationStatus;

  constructor() {
    this.fromAddress = env.SMTP_FROM_EMAIL
      ? env.SMTP_FROM_NAME
        ? `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`
        : env.SMTP_FROM_EMAIL
      : null;

    const missing: string[] = [];
    if (!env.SMTP_HOST) {
      missing.push('SMTP_HOST');
    }
    if (!this.fromAddress) {
      missing.push('SMTP_FROM_EMAIL');
    }

    const hasUser = Boolean(env.SMTP_USER);
    const hasPass = Boolean(env.SMTP_PASS);
    if (hasUser !== hasPass) {
      missing.push('SMTP_USER/SMTP_PASS');
    }

    this.configurationStatus = {
      configured: missing.length === 0,
      missing,
    };

    if (!this.configurationStatus.configured) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(hasUser && hasPass
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
    return this.configurationStatus.configured && this.transporter !== null && this.fromAddress !== null;
  }

  getConfigurationStatus(): EmailConfigurationStatus {
    return {
      configured: this.isConfigured(),
      missing: [...this.configurationStatus.missing],
    };
  }

  async send(input: EmailMessageInput): Promise<void> {
    if (!this.transporter || !this.fromAddress) {
      throw new Error('SMTP is not configured.');
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });
  }
}
