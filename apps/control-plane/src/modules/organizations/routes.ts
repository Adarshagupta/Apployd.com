import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const createOrgSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
});

export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/organizations', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      organizations: memberships.map((membership) => ({
        ...membership.organization,
        role: membership.role,
      })),
    };
  });

  app.post('/organizations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = createOrgSchema.parse(request.body);

    const freePlan = await prisma.plan.findUnique({ where: { code: 'free' } });
    if (!freePlan) {
      return reply.badRequest('Default plans not seeded');
    }

    const organization = await prisma.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        ownerId: user.userId,
        memberships: {
          create: {
            userId: user.userId,
            role: 'owner',
          },
        },
        subscriptions: {
          create: {
            planId: freePlan.id,
            stripeCustomerId: `free_${body.slug}_${Date.now()}`,
            stripeSubscriptionId: `free_${body.slug}_${Date.now()}`,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)),
            poolRamMb: freePlan.includedRamMb,
            poolCpuMillicores: freePlan.includedCpuMillicore,
            poolBandwidthGb: freePlan.includedBandwidthGb,
            overageEnabled: false,
          },
        },
      },
    });

    return reply.code(201).send({ organization });
  });
};
