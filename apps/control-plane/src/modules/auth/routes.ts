import { randomBytes } from 'crypto';

import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { EmailVerificationError, EmailVerificationService } from '../../services/email-verification-service.js';
import { GitHubService } from '../../services/github-service.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(120),
  organizationName: z.string().min(2).max(120),
  organizationSlug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const githubLoginQuerySchema = z.object({
  next: z.string().optional(),
});

const githubExchangeSchema = z.object({
  code: z.string().min(24).max(128),
});

const githubExchangePayloadSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().cuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
  redirectTo: z.string().optional(),
});

const OAUTH_STATE_PREFIX = 'apployd:oauth:github:';
const LOGIN_RESULT_PREFIX = 'apployd:oauth:github:login:';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const github = new GitHubService();
  const emailVerification = new EmailVerificationService();

  app.post('/auth/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
      },
    });
    if (existingUser) {
      if (existingUser.emailVerifiedAt) {
        return reply.conflict('Email already in use');
      }

      try {
        const resend = await emailVerification.sendCode({
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        });
        return reply.code(202).send({
          verificationRequired: true,
          email: existingUser.email,
          message: 'Account exists but email is not verified. A new code has been sent.',
          expiresInMinutes: resend.expiresInMinutes,
          ...(resend.devCode ? { devCode: resend.devCode } : {}),
        });
      } catch (error) {
        if (error instanceof EmailVerificationError) {
          return reply.code(error.statusCode).send({
            message: error.message,
          });
        }
        throw error;
      }
    }

    if (!emailVerification.canDispatchCodes()) {
      return reply.serviceUnavailable('Email verification service is not configured.');
    }

    const freePlan = await prisma.plan.findUnique({ where: { code: 'free' } });
    if (!freePlan) {
      return reply.badRequest('Default plans not seeded');
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash: hashPassword(body.password),
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: body.organizationName,
          slug: body.organizationSlug,
          ownerId: user.id,
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'owner',
        },
      });

      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          planId: freePlan.id,
          stripeCustomerId: `free_${organization.id}`,
          stripeSubscriptionId: `free_${organization.id}`,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          poolRamMb: freePlan.includedRamMb,
          poolCpuMillicores: freePlan.includedCpuMillicore,
          poolBandwidthGb: freePlan.includedBandwidthGb,
          overageEnabled: false,
        },
      });

      return { user, organization };
    });

    try {
      const dispatch = await emailVerification.sendCode({
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        bypassCooldown: true,
      });

      return reply.code(202).send({
        verificationRequired: true,
        email: result.user.email,
        message: 'We sent a verification code to your email.',
        expiresInMinutes: dispatch.expiresInMinutes,
        ...(dispatch.devCode ? { devCode: dispatch.devCode } : {}),
      });
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        app.log.error(
          {
            userId: result.user.id,
            email: result.user.email,
            error: error.message,
          },
          'Signup created but verification email could not be delivered',
        );
        return reply.code(202).send({
          verificationRequired: true,
          email: result.user.email,
          message: 'Account created. Unable to send verification code right now, please request a new code.',
          emailDeliveryFailed: true,
        });
      }
      throw error;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.unauthorized('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      try {
        await emailVerification.sendCode({
          userId: user.id,
          email: user.email,
          name: user.name,
        });
      } catch (error) {
        if (!(error instanceof EmailVerificationError)) {
          app.log.warn({ error }, 'Failed to auto-send verification code on login');
        }
      }

      return reply.code(403).send({
        message: 'Please verify your email before signing in.',
        verificationRequired: true,
        email: user.email,
      });
    }

    const token = app.jwt.sign({ userId: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  });

  app.post('/auth/verify-email', async (request, reply) => {
    const body = verifyEmailSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return reply.unauthorized('Invalid or expired verification code.');
    }

    if (!user.emailVerifiedAt) {
      try {
        const valid = await emailVerification.verifyCode(user.id, body.code);
        if (!valid) {
          return reply.unauthorized('Invalid or expired verification code.');
        }
      } catch (error) {
        if (error instanceof EmailVerificationError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    const token = app.jwt.sign({ userId: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      verified: true,
    };
  });

  app.post('/auth/resend-verification-code', async (request, reply) => {
    const body = resendVerificationSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return {
        success: true,
        message: 'If an account exists for that email, a verification code has been sent.',
      };
    }

    if (user.emailVerifiedAt) {
      return {
        success: true,
        message: 'Email is already verified.',
      };
    }

    try {
      const resend = await emailVerification.sendCode({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
      return {
        success: true,
        message: 'Verification code sent.',
        expiresInMinutes: resend.expiresInMinutes,
        ...(resend.devCode ? { devCode: resend.devCode } : {}),
      };
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  app.get('/auth/github/login-url', async (request, reply) => {
    if (!github.isConfigured()) {
      return reply.serviceUnavailable('GitHub OAuth is not configured on the server.');
    }

    const query = githubLoginQuerySchema.parse(request.query);
    const state = randomBytes(24).toString('hex');
    const redirectTo = safeRedirectPath(query.next, '/overview');

    await redis.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify({
        mode: 'login',
        redirectTo,
      }),
      'EX',
      60 * 10,
    );

    return {
      url: github.getAuthorizeUrl(state),
    };
  });

  app.post('/auth/github/exchange', async (request, reply) => {
    const body = githubExchangeSchema.parse(request.body);
    const key = `${LOGIN_RESULT_PREFIX}${body.code}`;
    const stored = await redis.get(key);
    await redis.del(key);

    if (!stored) {
      return reply.unauthorized('GitHub login code is invalid or expired.');
    }

    try {
      const payload = githubExchangePayloadSchema.parse(JSON.parse(stored));
      return payload;
    } catch {
      return reply.unauthorized('GitHub login code is invalid.');
    }
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    const userRecord = await prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    return { user: userRecord };
  });
};

const safeRedirectPath = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  return fallback;
};
