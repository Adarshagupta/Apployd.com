import { createHash, randomInt } from 'crypto';

import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

import { EmailService } from './email-service.js';

const CODE_KEY_PREFIX = 'apployd:projects:delete-otp:code:';
const ATTEMPT_KEY_PREFIX = 'apployd:projects:delete-otp:attempts:';
const COOLDOWN_KEY_PREFIX = 'apployd:projects:delete-otp:cooldown:';

export class ProjectDeleteOtpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ProjectDeleteOtpError';
  }
}

interface SendDeleteOtpInput {
  projectId: string;
  projectName: string;
  userId: string;
  email: string;
  name?: string | null;
}

export interface ProjectDeleteOtpDispatchResult {
  expiresInMinutes: number;
  devCode?: string;
}

export class ProjectDeleteOtpService {
  private readonly email = new EmailService();

  canDispatchCodes(): boolean {
    return this.email.isConfigured() || env.NODE_ENV !== 'production';
  }

  async sendCode(input: SendDeleteOtpInput): Promise<ProjectDeleteOtpDispatchResult> {
    if (!this.canDispatchCodes()) {
      throw new ProjectDeleteOtpError('Email OTP is not configured on this server.', 503);
    }

    const cooldownReserved = await redis.set(
      this.cooldownKey(input.projectId, input.userId),
      '1',
      'NX',
      'EX',
      env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    );

    if (!cooldownReserved) {
      throw new ProjectDeleteOtpError(
        `Please wait ${env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`,
        429,
      );
    }

    const code = this.generateCode();
    await redis.set(
      this.codeKey(input.projectId, input.userId),
      this.hashCode(input.projectId, input.userId, code),
      'EX',
      this.ttlSeconds(),
    );
    await redis.del(this.attemptKey(input.projectId, input.userId));

    try {
      const templateInput = {
        code,
        expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
        projectName: input.projectName,
        ...(input.name !== undefined ? { recipientName: input.name } : {}),
      };

      await this.email.send({
        to: input.email,
        subject: `Confirm deletion of ${input.projectName}`,
        text: buildDeleteOtpText(templateInput),
        html: buildDeleteOtpHtml(templateInput),
      });
      return {
        expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
      };
    } catch (error) {
      if (env.NODE_ENV === 'production') {
        throw new ProjectDeleteOtpError(
          'Unable to send delete confirmation code right now. Please try again.',
          503,
        );
      }

      console.warn('Delete OTP dispatch failed, returning development code.', error);
      return {
        expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
        devCode: code,
      };
    }
  }

  async verifyCode(input: { projectId: string; userId: string; code: string }): Promise<boolean> {
    const attempts = Number(
      (await redis.get(this.attemptKey(input.projectId, input.userId))) ?? '0',
    );
    if (attempts >= env.EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new ProjectDeleteOtpError(
        'Too many invalid OTP attempts. Request a new code.',
        429,
      );
    }

    const storedHash = await redis.get(this.codeKey(input.projectId, input.userId));
    if (!storedHash) {
      return false;
    }

    const submittedHash = this.hashCode(input.projectId, input.userId, input.code);
    if (storedHash !== submittedHash) {
      const totalAttempts = await redis.incr(this.attemptKey(input.projectId, input.userId));
      if (totalAttempts === 1) {
        await redis.expire(this.attemptKey(input.projectId, input.userId), this.ttlSeconds());
      }
      return false;
    }

    await redis.del(
      this.codeKey(input.projectId, input.userId),
      this.attemptKey(input.projectId, input.userId),
      this.cooldownKey(input.projectId, input.userId),
    );
    return true;
  }

  private codeKey(projectId: string, userId: string): string {
    return `${CODE_KEY_PREFIX}${projectId}:${userId}`;
  }

  private attemptKey(projectId: string, userId: string): string {
    return `${ATTEMPT_KEY_PREFIX}${projectId}:${userId}`;
  }

  private cooldownKey(projectId: string, userId: string): string {
    return `${COOLDOWN_KEY_PREFIX}${projectId}:${userId}`;
  }

  private ttlSeconds(): number {
    return env.EMAIL_VERIFICATION_TTL_MINUTES * 60;
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashCode(projectId: string, userId: string, code: string): string {
    return createHash('sha256')
      .update(`${projectId}:${userId}:${code}`)
      .digest('hex');
  }
}

const buildDeleteOtpText = (input: {
  code: string;
  expiresInMinutes: number;
  projectName: string;
  recipientName?: string | null;
}): string => {
  const greeting = input.recipientName?.trim().length
    ? `Hi ${input.recipientName.trim()},`
    : 'Hi,';

  return `${greeting}

Use this one-time code to delete the project "${input.projectName}":

${input.code}

This code expires in ${input.expiresInMinutes} minutes.
If you did not request this action, you can ignore this email.
`;
};

const buildDeleteOtpHtml = (input: {
  code: string;
  expiresInMinutes: number;
  projectName: string;
  recipientName?: string | null;
}): string => {
  const greeting = input.recipientName?.trim().length
    ? `Hi ${escapeHtml(input.recipientName.trim())},`
    : 'Hi,';
  const projectName = escapeHtml(input.projectName);

  return `<p>${greeting}</p>
<p>Use this one-time code to delete the project "<strong>${projectName}</strong>":</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0;">${input.code}</p>
<p>This code expires in ${input.expiresInMinutes} minutes.</p>
<p>If you did not request this action, you can ignore this email.</p>`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
