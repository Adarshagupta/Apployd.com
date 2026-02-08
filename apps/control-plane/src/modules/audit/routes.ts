import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.get('/audit', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { timestamp: 'desc' },
      take: query.limit,
    });

    return { auditLogs };
  });
};
