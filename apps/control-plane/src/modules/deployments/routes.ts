import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';
import { DeployQueueService } from '../../services/deploy-queue-service.js';
import { prisma } from '../../lib/prisma.js';
import { resolveDeploymentWebsocketUrl } from '../../lib/deployment-websocket-url.js';
import { DeploymentRequestError, DeploymentRequestService } from '../../services/deployment-request-service.js';
import { SleepService } from '../../services/sleep-service.js';

const envSchema = z
  .record(
    z
      .string()
      .regex(/^[A-Z_][A-Z0-9_]*$/, 'Environment keys must be uppercase snake case')
      .max(64),
    z.string().max(4096),
  )
  .refine((record) => Object.keys(record).length <= 50, {
    message: 'At most 50 environment variables are allowed per deployment request.',
  });

const createDeploymentSchema = z.object({
  projectId: z.string().cuid(),
  environment: z.enum(['production', 'preview']).default('production'),
  domain: z.string().min(3).max(255).optional(),
  gitUrl: z.string().url().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  rootDirectory: z.string().max(300).optional(),
  buildCommand: z.string().max(300).optional(),
  startCommand: z.string().min(1).max(300).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  env: envSchema.default({}),
  serviceType: z.enum(['web_service', 'static_site', 'python']).optional(),
  outputDirectory: z.string().max(300).optional(),
});

export const deploymentRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const deploymentService = new DeploymentRequestService();
  const queue = new DeployQueueService();
  const audit = new AuditLogService();
  const sleep = new SleepService();

  const releaseReservedCapacityIfNeeded = async (input: {
    deploymentId: string;
    serverId: string | null;
    ramMb: number;
    cpuMillicores: number;
    bandwidthGb: number;
  }) => {
    if (!input.serverId) {
      return false;
    }

    const released = await prisma.deployment.updateMany({
      where: {
        id: input.deploymentId,
        capacityReserved: true,
      },
      data: {
        capacityReserved: false,
      },
    });

    if (released.count === 0) {
      return false;
    }

    await prisma.server.update({
      where: { id: input.serverId },
      data: {
        reservedRamMb: { decrement: input.ramMb },
        reservedCpuMillicores: { decrement: input.cpuMillicores },
        reservedBandwidthGb: { decrement: input.bandwidthGb },
      },
    });

    return true;
  };

  app.get('/deployments/recent', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const deployments = await prisma.deployment.findMany({
      where: {
        project: {
          organizationId: query.organizationId,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return { deployments };
  });

  app.get('/deployments', { preHandler: [app.authenticate] }, async (request, reply) => {
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

    const deployments = await prisma.deployment.findMany({
      where: { projectId: query.projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { deployments };
  });

  app.get('/deployments/:deploymentId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const deployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
            name: true,
            slug: true,
            repoUrl: true,
            repoFullName: true,
            branch: true,
            serviceType: true,
            activeDeploymentId: true,
            createdById: true,
          },
        },
      },
    });

    if (!deployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, deployment.project.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    /* Resolve the user who created this deployment's project (best-effort). */
    let createdByName: string | null = null;
    try {
      const user = await prisma.user.findUnique({
        where: { id: deployment.project.createdById },
        select: { name: true, email: true },
      });
      createdByName = user?.name ?? user?.email ?? null;
    } catch {
      /* ignore */
    }

    const domainUrl = deployment.domain
      ? /\.(localhost)$/i.test(deployment.domain)
        ? null
        : /^(https?:\/\/)/i.test(deployment.domain)
        ? deployment.domain
        : /^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(deployment.domain)
          ? `http://${deployment.domain}`
          : `https://${deployment.domain}`
      : null;

    return {
      deploymentId: deployment.id,
      status: deployment.status,
      environment: deployment.environment,
      domain: deployment.domain,
      url: domainUrl,
      branch: deployment.branch,
      commitSha: deployment.commitSha,
      imageTag: deployment.imageTag,
      buildLogs: deployment.buildLogs,
      deployLogs: deployment.deployLogs,
      errorMessage: deployment.errorMessage,
      gitUrl: deployment.gitUrl,
      createdAt: deployment.createdAt,
      startedAt: deployment.startedAt,
      finishedAt: deployment.finishedAt,
      project: {
        id: deployment.project.id,
        name: deployment.project.name,
        slug: deployment.project.slug,
        repoUrl: deployment.project.repoUrl,
        repoFullName: deployment.project.repoFullName,
        serviceType: deployment.project.serviceType,
        activeDeploymentId: deployment.project.activeDeploymentId,
      },
      createdByName,
      websocket: resolveDeploymentWebsocketUrl(deployment.id),
    };
  });

  app.post('/deployments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = createDeploymentSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { organizationId: true },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const idempotencyKeyHeader = request.headers['idempotency-key'];
    const idempotencyKey =
      typeof idempotencyKeyHeader === 'string' && idempotencyKeyHeader.trim()
        ? idempotencyKeyHeader.trim()
        : null;
    try {
      const result = await deploymentService.create({
        projectId: body.projectId,
        actorUserId: user.userId,
        trigger: 'manual',
        environment: body.environment,
        ...(body.domain && { domain: body.domain }),
        ...(body.gitUrl && { gitUrl: body.gitUrl }),
        ...(body.branch && { branch: body.branch }),
        ...(body.commitSha && { commitSha: body.commitSha }),
        ...(body.rootDirectory && { rootDirectory: body.rootDirectory }),
        ...(body.buildCommand && { buildCommand: body.buildCommand }),
        ...(body.startCommand && { startCommand: body.startCommand }),
        ...(body.port && { port: body.port }),
        ...(body.env && { env: body.env }),
        ...(idempotencyKey && { idempotencyKey }),
        ...(body.serviceType && { serviceType: body.serviceType }),
        ...(body.outputDirectory && { outputDirectory: body.outputDirectory }),
      });
      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof DeploymentRequestError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  app.post('/deployments/:deploymentId/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const deployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
            resourceRamMb: true,
            resourceCpuMillicore: true,
            resourceBandwidthGb: true,
          },
        },
      },
    });

    if (!deployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, deployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!['queued', 'building', 'deploying'].includes(deployment.status)) {
      return reply.badRequest('Only queued, building, or deploying deployments can be canceled.');
    }

    const cancelMessage = 'Deployment canceled by user.';
    const now = new Date();

    const canceled = await prisma.deployment.updateMany({
      where: {
        id: deployment.id,
        status: { in: ['queued', 'building', 'deploying'] },
      },
      data: {
        status: 'failed',
        errorMessage: cancelMessage,
        finishedAt: now,
      },
    });

    if (canceled.count === 0) {
      return reply.conflict('Deployment is no longer in progress.');
    }

    await releaseReservedCapacityIfNeeded({
      deploymentId: deployment.id,
      serverId: deployment.serverId,
      ramMb: deployment.project.resourceRamMb,
      cpuMillicores: deployment.project.resourceCpuMillicore,
      bandwidthGb: deployment.project.resourceBandwidthGb,
    }).catch(() => undefined);

    await prisma.logEntry.create({
      data: {
        projectId: deployment.project.id,
        deploymentId: deployment.id,
        level: 'info',
        source: 'control-plane',
        message: cancelMessage,
        metadata: {
          eventType: 'canceled',
        },
      },
    }).catch(() => undefined);

    await queue.publishEvent({
      deploymentId: deployment.id,
      type: 'failed',
      message: cancelMessage,
    });

    await audit.record({
      organizationId: deployment.project.organizationId,
      actorUserId: user.userId,
      action: 'deployment.canceled',
      entityType: 'deployment',
      entityId: deployment.id,
      metadata: {
        previousStatus: deployment.status,
      },
    });

    return { success: true, deploymentId: deployment.id, status: 'failed', message: cancelMessage };
  });

  app.post('/deployments/:deploymentId/wake', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const deployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
          },
        },
        container: {
          select: { id: true, sleepStatus: true, status: true },
        },
      },
    });

    if (!deployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, deployment.project.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!deployment.container) {
      return reply.badRequest('No container associated with deployment');
    }

    if (deployment.container.sleepStatus === 'awake' && deployment.container.status === 'running') {
      return { success: true, message: 'Container is already awake.' };
    }

    const wakeTarget = await sleep.markContainerWakeInProgress(deployment.container.id);
    await queue.enqueueContainerAction({
      action: 'wake',
      containerId: deployment.container.id,
      dockerContainerId: wakeTarget.dockerContainerId,
      deploymentId: deployment.id,
    });

    await queue.publishEvent({
      deploymentId: deployment.id,
      type: 'waking',
      message: 'Container wake-up initiated',
    });

    await audit.record({
      organizationId: deployment.project.organizationId,
      actorUserId: user.userId,
      action: 'deployment.wake_requested',
      entityType: 'deployment',
      entityId: deployment.id,
      metadata: {
        containerId: deployment.container.id,
      },
    });

    return { success: true, coldStartTargetSeconds: 15 };
  });

  // ── Rollback: redeploy from a previous deployment's image (no rebuild) ──
  app.post('/deployments/:deploymentId/rollback', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const targetDeployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
            repoUrl: true,
            branch: true,
            startCommand: true,
            buildCommand: true,
            targetPort: true,
            rootDirectory: true,
          },
        },
      },
    });

    if (!targetDeployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, targetDeployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!targetDeployment.imageTag) {
      return reply.badRequest('Cannot rollback: deployment has no built image');
    }

    if (targetDeployment.environment !== 'production') {
      return reply.badRequest('Rollback is only available for production deployments');
    }

    try {
      const result = await deploymentService.create({
        projectId: targetDeployment.project.id,
        actorUserId: user.userId,
        trigger: 'manual',
        environment: 'production',
        gitUrl: targetDeployment.gitUrl,
        ...(targetDeployment.branch && { branch: targetDeployment.branch }),
        ...(targetDeployment.commitSha && { commitSha: targetDeployment.commitSha }),
        ...(targetDeployment.project.startCommand && { startCommand: targetDeployment.project.startCommand }),
        port: targetDeployment.project.targetPort,
        imageTag: targetDeployment.imageTag,
      });

      // Mark the old deployment as rolled_back
      await prisma.deployment.update({
        where: { id: params.deploymentId },
        data: { status: 'rolled_back' },
      });

      await audit.record({
        organizationId: targetDeployment.project.organizationId,
        actorUserId: user.userId,
        action: 'deployment.rollback',
        entityType: 'deployment',
        entityId: result.deploymentId,
        metadata: {
          rolledBackTo: params.deploymentId,
          imageTag: targetDeployment.imageTag,
        },
      });

      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof DeploymentRequestError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  // ── Promote: promote a preview deployment to production ──
  app.post('/deployments/:deploymentId/promote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const previewDeployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
            repoUrl: true,
            startCommand: true,
            buildCommand: true,
            targetPort: true,
            rootDirectory: true,
          },
        },
      },
    });

    if (!previewDeployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, previewDeployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (previewDeployment.environment !== 'preview') {
      return reply.badRequest('Only preview deployments can be promoted');
    }

    if (previewDeployment.status !== 'ready') {
      return reply.badRequest('Only ready deployments can be promoted');
    }

    try {
      // Create a new production deployment reusing the same image (no rebuild)
      const result = await deploymentService.create({
        projectId: previewDeployment.project.id,
        actorUserId: user.userId,
        trigger: 'manual',
        environment: 'production',
        gitUrl: previewDeployment.gitUrl,
        ...(previewDeployment.branch && { branch: previewDeployment.branch }),
        ...(previewDeployment.commitSha && { commitSha: previewDeployment.commitSha }),
        ...(previewDeployment.project.startCommand && { startCommand: previewDeployment.project.startCommand }),
        port: previewDeployment.project.targetPort,
        ...(previewDeployment.imageTag && { imageTag: previewDeployment.imageTag }),
      });

      await audit.record({
        organizationId: previewDeployment.project.organizationId,
        actorUserId: user.userId,
        action: 'deployment.promoted',
        entityType: 'deployment',
        entityId: result.deploymentId,
        metadata: {
          promotedFrom: params.deploymentId,
          commitSha: previewDeployment.commitSha,
        },
      });

      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof DeploymentRequestError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });
};
