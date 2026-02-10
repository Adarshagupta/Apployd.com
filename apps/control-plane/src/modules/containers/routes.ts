import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

export const containerRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.get('/containers', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        projectId: z.string().cuid(),
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

    const containers = await prisma.container.findMany({
      where: {
        projectId: query.projectId,
        status: { in: ['running', 'starting'] },
      },
      select: {
        id: true,
        dockerContainerId: true,
        imageTag: true,
        internalPort: true,
        hostPort: true,
        status: true,
        sleepStatus: true,
        startedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { containers };
  });
};
