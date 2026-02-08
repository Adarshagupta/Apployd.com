import { randomBytes } from 'crypto';

import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
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

  app.post('/auth/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) {
      return reply.conflict('Email already in use');
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

    const token = app.jwt.sign({
      userId: result.user.id,
      email: result.user.email,
    });

    return reply.code(201).send({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: result.organization,
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.unauthorized('Invalid email or password');
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
