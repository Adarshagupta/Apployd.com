import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

export const logRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.get('/logs', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        projectId: z.string().cuid(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
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
      await access.requireOrganizationRole(user.userId, project.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const logs = await prisma.logEntry.findMany({
      where: { projectId: query.projectId },
      orderBy: { timestamp: 'desc' },
      take: query.limit,
    });

    return { logs };
  });
};
