import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';
import { AnomalyDetectionService } from '../../services/anomaly-detection-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';
import { DeployQueueService } from '../../services/deploy-queue-service.js';

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

const incidentQuerySchema = z.object({
  organizationId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  status: z
    .enum(['all', 'active', 'open', 'appealed', 'reviewing', 'resolved', 'dismissed'])
    .default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const incidentParamsSchema = z.object({
  incidentId: z.string().cuid(),
});

const appealBodySchema = z.object({
  message: z.string().trim().min(10).max(4000),
});

const unblockBodySchema = z.object({
  resolutionNote: z.string().trim().max(500).optional(),
});

const asIso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export const securityRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const anomaly = new AnomalyDetectionService();
  const audit = new AuditLogService();
  const queue = new DeployQueueService();

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

  app.get('/security/incidents', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = incidentQuerySchema.parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const where: Prisma.SecurityIncidentWhereInput = {
      organizationId: query.organizationId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
    };

    if (query.status === 'active') {
      where.blocked = true;
      where.status = { in: ['open', 'appealed', 'reviewing'] };
    } else if (query.status !== 'all') {
      where.status = query.status;
    }

    const incidents = await prisma.securityIncident.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        appeals: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            status: true,
            message: true,
            decisionNote: true,
            createdAt: true,
            decidedAt: true,
            requestedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            decidedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            appeals: true,
          },
        },
      },
      orderBy: [{ blocked: 'desc' }, { detectedAt: 'desc' }],
      take: query.limit,
    });

    const incidentIds = incidents.map((incident) => incident.id);
    const pendingAppealRows =
      incidentIds.length > 0
        ? await prisma.securityIncidentAppeal.groupBy({
            by: ['incidentId'],
            where: {
              incidentId: { in: incidentIds },
              status: 'submitted',
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const pendingAppealCountByIncident = new Map(
      pendingAppealRows.map((row) => [row.incidentId, row._count._all]),
    );

    return {
      incidents: incidents.map((incident) => ({
        id: incident.id,
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        projectName: incident.project.name,
        projectSlug: incident.project.slug,
        deploymentId: incident.deploymentId,
        containerId: incident.containerId,
        category: incident.category,
        severity: incident.severity,
        title: incident.title,
        description: incident.description,
        reasonCode: incident.reasonCode,
        blocked: incident.blocked,
        status: incident.status,
        detectedAt: asIso(incident.detectedAt),
        blockedAt: asIso(incident.blockedAt),
        resolvedAt: asIso(incident.resolvedAt),
        resolutionNote: incident.resolutionNote,
        appealCount: incident._count.appeals,
        pendingAppealCount: pendingAppealCountByIncident.get(incident.id) ?? 0,
        appeals: incident.appeals.map((appeal) => ({
          id: appeal.id,
          status: appeal.status,
          message: appeal.message,
          decisionNote: appeal.decisionNote,
          createdAt: asIso(appeal.createdAt),
          decidedAt: asIso(appeal.decidedAt),
          requestedBy: {
            id: appeal.requestedBy.id,
            name: appeal.requestedBy.name,
            email: appeal.requestedBy.email,
          },
          decidedBy: appeal.decidedBy
            ? {
                id: appeal.decidedBy.id,
                name: appeal.decidedBy.name,
                email: appeal.decidedBy.email,
              }
            : null,
        })),
      })),
    };
  });

  app.post('/security/incidents/:incidentId/appeals', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = incidentParamsSchema.parse(request.params);
    const body = appealBodySchema.parse(request.body);

    const incident = await prisma.securityIncident.findUnique({
      where: { id: params.incidentId },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        project: {
          select: {
            name: true,
          },
        },
        status: true,
        blocked: true,
      },
    });

    if (!incident) {
      return reply.notFound('Security incident not found.');
    }

    try {
      await access.requireOrganizationRole(user.userId, incident.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!incident.blocked || incident.status === 'resolved' || incident.status === 'dismissed') {
      return reply.badRequest('This incident is already closed and cannot be appealed.');
    }

    const existingAppeal = await prisma.securityIncidentAppeal.findFirst({
      where: {
        incidentId: incident.id,
        requestedById: user.userId,
        status: 'submitted',
      },
      select: {
        id: true,
      },
    });

    if (existingAppeal) {
      return reply.conflict('You already have a pending appeal for this incident.');
    }

    const now = new Date();
    const appeal = await prisma.securityIncidentAppeal.create({
      data: {
        incidentId: incident.id,
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        requestedById: user.userId,
        status: 'submitted',
        message: body.message,
      },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
      },
    });

    if (incident.status === 'open') {
      await prisma.securityIncident.update({
        where: { id: incident.id },
        data: {
          status: 'appealed',
        },
      });
    }

    await audit.record({
      organizationId: incident.organizationId,
      actorUserId: user.userId,
      action: 'security.incident.appealed',
      entityType: 'security_incident',
      entityId: incident.id,
      metadata: {
        projectId: incident.projectId,
        projectName: incident.project.name,
        appealId: appeal.id,
        submittedAt: now.toISOString(),
      },
    });

    return reply.code(201).send({
      appeal: {
        id: appeal.id,
        status: appeal.status,
        message: appeal.message,
        createdAt: asIso(appeal.createdAt),
      },
      message: 'Appeal submitted. An admin will review this incident.',
    });
  });

  app.post('/security/incidents/:incidentId/unblock', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = incidentParamsSchema.parse(request.params);
    const body = unblockBodySchema.parse(request.body ?? {});

    const incident = await prisma.securityIncident.findUnique({
      where: { id: params.incidentId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
        container: {
          select: {
            id: true,
            dockerContainerId: true,
          },
        },
      },
    });

    if (!incident) {
      return reply.notFound('Security incident not found.');
    }

    try {
      await access.requireOrganizationRole(user.userId, incident.project.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!incident.blocked) {
      return {
        incidentId: incident.id,
        blocked: incident.blocked,
        status: incident.status,
        unchanged: true,
        message: 'Incident is already unblocked.',
      };
    }

    const now = new Date();
    const resolutionNoteRaw = body.resolutionNote?.trim();
    const resolutionNote =
      resolutionNoteRaw && resolutionNoteRaw.length > 0
        ? resolutionNoteRaw
        : 'Manually unblocked by admin from Security Center.';
    const decisionNote = `Auto-approved because incident was manually unblocked by ${user.email}.`;

    await prisma.$transaction(async (tx) => {
      await tx.securityIncident.update({
        where: { id: incident.id },
        data: {
          blocked: false,
          status: 'resolved',
          resolvedAt: now,
          resolvedById: user.userId,
          resolutionNote,
        },
      });

      await tx.securityIncidentAppeal.updateMany({
        where: {
          incidentId: incident.id,
          status: 'submitted',
        },
        data: {
          status: 'approved',
          decidedById: user.userId,
          decidedAt: now,
          decisionNote,
        },
      });
    });

    let wakeQueued = false;
    if (incident.container?.dockerContainerId) {
      await queue
        .enqueueContainerAction({
          action: 'wake',
          containerId: incident.container.id,
          dockerContainerId: incident.container.dockerContainerId,
          ...(incident.deploymentId ? { deploymentId: incident.deploymentId } : {}),
        })
        .then(() => {
          wakeQueued = true;
        })
        .catch(() => undefined);
    }

    if (wakeQueued && incident.deploymentId) {
      await queue
        .publishEvent({
          deploymentId: incident.deploymentId,
          type: 'waking',
          message: 'Security unblock approved. Container restart queued.',
        })
        .catch(() => undefined);
    }

    await audit.record({
      organizationId: incident.project.organizationId,
      actorUserId: user.userId,
      action: 'security.incident.unblocked',
      entityType: 'security_incident',
      entityId: incident.id,
      metadata: {
        projectId: incident.projectId,
        projectName: incident.project.name,
        deploymentId: incident.deploymentId,
        containerId: incident.containerId,
        wakeQueued,
        resolvedAt: now.toISOString(),
      },
    });

    return {
      incidentId: incident.id,
      blocked: false,
      status: 'resolved',
      wakeQueued,
      message: wakeQueued
        ? 'Incident unblocked. Container restart was queued.'
        : 'Incident unblocked.',
    };
  });
};
