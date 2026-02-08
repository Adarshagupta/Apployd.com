import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

const inviteSchema = z.object({
  organizationId: z.string().cuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'developer', 'viewer']),
});

export const teamRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.get('/teams/:organizationId/members', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z
      .object({ organizationId: z.string().cuid() })
      .parse(request.params);

    try {
      await access.requireOrganizationRole(user.userId, params.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: params.organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { members };
  });

  app.post('/teams/invite', { preHandler: [app.authenticate] }, async (request, reply) => {
    const reqUser = request.user as { userId: string; email: string };
    const body = inviteSchema.parse(request.body);

    try {
      await access.requireOrganizationRole(reqUser.userId, body.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      return reply.notFound('User not found. Ask them to sign up first.');
    }

    const member = await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: body.organizationId,
          userId: user.id,
        },
      },
      update: { role: body.role },
      create: {
        organizationId: body.organizationId,
        userId: user.id,
        role: body.role,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return reply.code(201).send({ member });
  });
};
