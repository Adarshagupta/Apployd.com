import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';

export interface EmailMessageInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export class EmailService {
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
