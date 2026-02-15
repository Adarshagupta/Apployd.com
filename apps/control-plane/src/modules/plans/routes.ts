import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { getPlanEntitlements } from '../../domain/plan-entitlements.js';
import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

export const planRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.get('/plans', async () => {
    const plans = await prisma.plan.findMany({
      orderBy: { priceUsdMonthly: 'asc' },
    });

    return {
      plans: plans.map((plan) => ({
        ...plan,
        entitlements: getPlanEntitlements(plan.code),
      })),
    };
  });

  app.get('/plans/current', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const userId = user.userId;
    const query = z
      .object({
        organizationId: z.string().cuid().optional(),
      })
      .parse(request.query);

    const membership = query.organizationId
      ? await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: query.organizationId,
              userId,
            },
          },
        })
      : await prisma.organizationMember.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        });

    if (!membership) {
      return reply.notFound('No organization found for user');
    }

    if (query.organizationId) {
      try {
        await access.requireOrganizationRole(userId, query.organizationId, 'viewer');
      } catch (error) {
        return reply.forbidden((error as Error).message);
      }
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: membership.organizationId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return { subscription: null };
    }

    return {
      subscription: {
        ...subscription,
        entitlements: getPlanEntitlements(subscription.plan.code),
      },
    };
  });
};
