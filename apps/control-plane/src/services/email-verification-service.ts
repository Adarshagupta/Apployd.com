import { createHash, randomInt } from 'crypto';

import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

import { EmailService } from './email-service.js';

const CODE_KEY_PREFIX = 'apployd:auth:email-verification:code:';
const ATTEMPT_KEY_PREFIX = 'apployd:auth:email-verification:attempts:';
const COOLDOWN_KEY_PREFIX = 'apployd:auth:email-verification:cooldown:';

export class EmailVerificationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'EmailVerificationError';
  }
}

export interface VerificationDispatchResult {
  expiresInMinutes: number;
  devCode?: string;
}

interface SendCodeInput {
  userId: string;
  email: string;
  name?: string | null;
  bypassCooldown?: boolean;
}

export class EmailVerificationService {
  private readonly email = new EmailService();

  canDispatchCodes(): boolean {
    return this.email.isConfigured() || env.NODE_ENV !== 'production';
  }

  async sendCode(input: SendCodeInput): Promise<VerificationDispatchResult> {
    if (!this.canDispatchCodes()) {
      throw new EmailVerificationError('Email verification service is not configured.', 503);
    }

    if (!input.bypassCooldown) {
      const cooldownReserved = await redis.set(
        this.cooldownKey(input.userId),
        '1',
        'NX',
        'EX',
        env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      );

      if (!cooldownReserved) {
        throw new EmailVerificationError(
          `Please wait ${env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
          429,
        );
      }
    } else {
      await redis.set(
        this.cooldownKey(input.userId),
        '1',
        'EX',
        env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      );
    }

    const code = this.generateCode();
    await redis.set(this.codeKey(input.userId), this.hashCode(input.userId, code), 'EX', this.ttlSeconds());
    await redis.del(this.attemptKey(input.userId));

    try {
      await this.email.send({
        to: input.email,
        subject: 'Your Apployd verification code',
        text: buildVerificationText({
          code,
          expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
          recipientName: input.name,
        }),
        html: buildVerificationHtml({
          code,
          expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
          recipientName: input.name,
        }),
      });
      return {
        expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
      };
    } catch (error) {
      if (env.NODE_ENV === 'production') {
        throw new EmailVerificationError(
          'Unable to send verification email right now. Please try again shortly.',
          503,
        );
      }

      console.warn('Email dispatch failed, returning development verification code.', error);
      return {
        expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
        devCode: code,
      };
    }
  }

  async verifyCode(userId: string, submittedCode: string): Promise<boolean> {
    const attempts = Number((await redis.get(this.attemptKey(userId))) ?? '0');
    if (attempts >= env.EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new EmailVerificationError(
        'Too many invalid attempts. Request a new verification code.',
        429,
      );
    }

    const storedHash = await redis.get(this.codeKey(userId));
    if (!storedHash) {
      return false;
    }

    const submittedHash = this.hashCode(userId, submittedCode);
    if (storedHash !== submittedHash) {
      const totalAttempts = await redis.incr(this.attemptKey(userId));
      if (totalAttempts === 1) {
        await redis.expire(this.attemptKey(userId), this.ttlSeconds());
      }
      return false;
    }

    await redis.del(this.codeKey(userId), this.attemptKey(userId), this.cooldownKey(userId));
    return true;
  }

  private codeKey(userId: string): string {
    return `${CODE_KEY_PREFIX}${userId}`;
  }

  private attemptKey(userId: string): string {
    return `${ATTEMPT_KEY_PREFIX}${userId}`;
  }

  private cooldownKey(userId: string): string {
    return `${COOLDOWN_KEY_PREFIX}${userId}`;
  }

  private ttlSeconds(): number {
    return env.EMAIL_VERIFICATION_TTL_MINUTES * 60;
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashCode(userId: string, code: string): string {
    return createHash('sha256')
      .update(`${userId}:${code}`)
      .digest('hex');
  }
}

const buildVerificationText = (input: {
  code: string;
  expiresInMinutes: number;
  recipientName?: string | null | undefined;
}): string => {
  const greeting = input.recipientName?.trim().length ? `Hi ${input.recipientName.trim()},` : 'Hi,';
  return `${greeting}

Your Apployd verification code is: ${input.code}

This code expires in ${input.expiresInMinutes} minutes.
If you did not request this, you can ignore this email.
`;
};

const buildVerificationHtml = (input: {
  code: string;
  expiresInMinutes: number;
  recipientName?: string | null | undefined;
}): string => {
  const greeting = input.recipientName?.trim().length ? `Hi ${input.recipientName.trim()},` : 'Hi,';
  return `<p>${greeting}</p>
<p>Your Apployd verification code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0;">${input.code}</p>
<p>This code expires in ${input.expiresInMinutes} minutes.</p>
<p>If you did not request this, you can ignore this email.</p>`;
};
