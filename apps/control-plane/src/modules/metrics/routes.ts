import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

export const metricRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.get('/metrics/query', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z
      .object({
        projectId: z.string().cuid(),
        metric: z.string().min(1),
        from: z.coerce.date(),
        to: z.coerce.date(),
      })
      .parse(request.query);

    const project = await prisma.project.findUnique({
      where: { id: query.projectId },
      select: { organizationId: true },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(request.user.userId, project.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const points = await prisma.metricEntry.findMany({
      where: {
        projectId: query.projectId,
        name: query.metric,
        timestamp: {
          gte: query.from,
          lte: query.to,
        },
      },
      orderBy: { timestamp: 'asc' },
      take: 3000,
    });

    return { points };
  });
};
