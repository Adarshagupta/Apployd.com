import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';
import { AnomalyDetectionService } from '../../services/anomaly-detection-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';

const anomalyQuerySchema = z.object({
  organizationId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  windowMinutes: z.coerce.number().int().min(1).max(30).default(5),
  baselineMinutes: z.coerce.number().int().min(15).max(1440).default(120),
});

const attackModeParamsSchema = z.object({
  projectId: z.string().cuid(),
});

const attackModeBodySchema = z.object({
  enabled: z.boolean(),
});

export const securityRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const anomaly = new AnomalyDetectionService();
  const audit = new AuditLogService();

  app.get('/security/anomalies', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = anomalyQuerySchema.parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const projects = await prisma.project.findMany({
      where: {
        organizationId: query.organizationId,
        ...(query.projectId && { id: query.projectId }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        attackModeEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (query.projectId && projects.length === 0) {
      return reply.notFound('Project not found');
    }

    const report = await anomaly.detectProjectAnomalies({
      organizationId: query.organizationId,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        attackModeEnabled: project.attackModeEnabled,
      })),
      windowMinutes: query.windowMinutes,
      baselineMinutes: query.baselineMinutes,
    });

    const summary = report.projects.reduce(
      (acc, project) => {
        if (project.severity === 'critical') {
          acc.critical += 1;
        } else if (project.severity === 'high') {
          acc.high += 1;
        } else if (project.severity === 'medium') {
          acc.medium += 1;
        } else {
          acc.low += 1;
        }

        if (project.recommendAttackMode) {
          acc.recommendedAttackMode += 1;
        }
        if (project.attackModeEnabled) {
          acc.attackModeEnabled += 1;
        }

        return acc;
      },
      {
        totalProjects: report.projects.length,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        recommendedAttackMode: 0,
        attackModeEnabled: 0,
      },
    );

    return {
      ...report,
      summary,
    };
  });

  app.patch('/security/projects/:projectId/attack-mode', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = attackModeParamsSchema.parse(request.params);
    const body = attackModeBodySchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        attackModeEnabled: true,
      },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (project.attackModeEnabled === body.enabled) {
      return {
        projectId: project.id,
        attackModeEnabled: project.attackModeEnabled,
        unchanged: true,
        message: body.enabled
          ? 'Attack mode is already enabled.'
          : 'Attack mode is already disabled.',
      };
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        attackModeEnabled: body.enabled,
      },
      select: {
        id: true,
        attackModeEnabled: true,
      },
    });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: body.enabled ? 'project.attack_mode.enabled' : 'project.attack_mode.disabled',
      entityType: 'project',
      entityId: project.id,
      metadata: {
        projectName: project.name,
        previousAttackMode: project.attackModeEnabled,
        nextAttackMode: updated.attackModeEnabled,
      },
    });

    return {
      projectId: updated.id,
      attackModeEnabled: updated.attackModeEnabled,
      message:
        'Attack mode saved. It will be enforced on the next deployment or proxy refresh.',
    };
  });
};
