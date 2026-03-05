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
  .refine((record) => Object.keys(record).length <= 250, {
    message: 'At most 250 environment variables are allowed per deployment request.',
  });

const deploymentDomainSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((value) => value.toLowerCase().replace(/\.$/, ''))
  .refine(
    (value) =>
      /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value),
    'Domain must be a valid hostname (e.g. app.example.com)',
  );

const createDeploymentSchema = z.object({
  projectId: z.string().cuid(),
  environment: z.enum(['production', 'preview']).default('production'),
  domain: deploymentDomainSchema.optional(),
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

const canaryStartSchema = z
  .object({
    percent: z.number().int().min(1).max(99),
    previewDeploymentId: z.string().cuid().optional(),
    candidateDeploymentId: z.string().cuid().optional(),
    branch: z.string().trim().min(1).max(255).optional(),
    commitSha: z.string().trim().regex(/^[a-f0-9]{7,64}$/i, 'Commit SHA must be 7 to 64 hex characters').optional(),
    imageTag: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, ctx) => {
    const hasExplicitCandidate = Boolean(value.branch || value.commitSha || value.imageTag);
    const sourceCount =
      Number(Boolean(value.previewDeploymentId))
      + Number(Boolean(value.candidateDeploymentId))
      + Number(hasExplicitCandidate);

    if (sourceCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose exactly one canary source: preview deployment, candidate deployment, or explicit branch/commit/image.',
      });
    }
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
      select: {
        organizationId: true,
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
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

    const createdByName = project.createdBy?.name ?? project.createdBy?.email ?? null;

    return {
      deployments: deployments.map((deployment) => ({
        ...deployment,
        createdByName,
      })),
    };
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
            canaryDeploymentId: true,
            canaryPercent: true,
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
      isCanary: deployment.isCanary,
      canaryStartedAt: deployment.canaryStartedAt,
      canaryPromotedAt: deployment.canaryPromotedAt,
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
        canaryDeploymentId: deployment.project.canaryDeploymentId,
        canaryPercent: deployment.project.canaryPercent,
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

  app.post('/deployments/:deploymentId/canary', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);
    const body = canaryStartSchema.parse(request.body);

    const stableDeployment = await prisma.deployment.findUnique({
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
            canaryDeploymentId: true,
            activeDeploymentId: true,
          },
        },
        container: {
          select: { id: true, hostPort: true, status: true },
        },
      },
    });

    if (!stableDeployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, stableDeployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (stableDeployment.environment !== 'production') {
      return reply.badRequest('Canary releases are only supported for production deployments');
    }

    if (stableDeployment.project.activeDeploymentId !== params.deploymentId) {
      return reply.badRequest('Canary releases can only start from the active production deployment');
    }

    if (stableDeployment.status !== 'ready') {
      return reply.badRequest('Only a ready deployment can be used as the stable baseline for a canary release');
    }

    if (!stableDeployment.imageTag) {
      return reply.badRequest('Cannot start a canary: deployment has no built image');
    }

    if (!stableDeployment.serverId) {
      return reply.badRequest('Cannot start a canary: stable deployment is not assigned to a server');
    }

    if (!stableDeployment.container || stableDeployment.container.status !== 'running') {
      return reply.badRequest('Cannot start a canary: stable container is not running');
    }

    if (stableDeployment.project.canaryDeploymentId) {
      return reply.conflict('A canary release is already active for this project. Promote or abort it first.');
    }

    let candidateSource: 'latest_branch_head' | 'preview_deployment' | 'existing_deployment' | 'explicit' = 'latest_branch_head';
    let candidateDeploymentId: string | undefined;
    let candidateGitUrl = stableDeployment.gitUrl;
    let candidateBranch: string | undefined = stableDeployment.branch ?? stableDeployment.project.branch ?? undefined;
    let candidateCommitSha: string | undefined;
    let candidateImageTag: string | undefined;

    if (body.previewDeploymentId || body.candidateDeploymentId) {
      const candidate = await prisma.deployment.findUnique({
        where: { id: body.previewDeploymentId ?? body.candidateDeploymentId! },
        select: {
          id: true,
          projectId: true,
          environment: true,
          status: true,
          gitUrl: true,
          branch: true,
          commitSha: true,
          imageTag: true,
        },
      });

      if (!candidate) {
        return reply.notFound('Candidate deployment not found');
      }

      if (candidate.projectId !== stableDeployment.project.id) {
        return reply.badRequest('Canary source deployment must belong to the same project');
      }

      if (candidate.id === params.deploymentId) {
        return reply.badRequest('Select a different deployment as the canary candidate');
      }

      if (body.previewDeploymentId && candidate.environment !== 'preview') {
        return reply.badRequest('previewDeploymentId must reference a preview deployment');
      }

      if (body.previewDeploymentId && candidate.status !== 'ready') {
        return reply.badRequest('Only a ready preview deployment can be used as a canary candidate');
      }

      if (body.candidateDeploymentId && !['ready', 'rolled_back'].includes(candidate.status)) {
        return reply.badRequest('Candidate deployment must be ready or previously rolled back');
      }

      if (!candidate.imageTag && !candidate.commitSha && !candidate.branch) {
        return reply.badRequest('Candidate deployment does not include a reusable image or source reference');
      }

      candidateSource = body.previewDeploymentId ? 'preview_deployment' : 'existing_deployment';
      candidateDeploymentId = candidate.id;
      candidateGitUrl = candidate.gitUrl;
      candidateBranch = candidate.branch ?? stableDeployment.project.branch ?? undefined;
      candidateCommitSha = candidate.commitSha ?? undefined;
      candidateImageTag = candidate.imageTag ?? undefined;
    } else if (body.branch || body.commitSha || body.imageTag) {
      candidateSource = 'explicit';
      candidateBranch = body.branch ?? stableDeployment.project.branch ?? undefined;
      candidateCommitSha = body.commitSha;
      candidateImageTag = body.imageTag;
    }

    try {
      const result = await deploymentService.create({
        projectId: stableDeployment.project.id,
        actorUserId: user.userId,
        trigger: 'manual',
        environment: 'production',
        gitUrl: candidateGitUrl,
        ...(candidateBranch && { branch: candidateBranch }),
        ...(candidateCommitSha && { commitSha: candidateCommitSha }),
        ...(candidateImageTag && { imageTag: candidateImageTag }),
        ...(stableDeployment.project.startCommand && { startCommand: stableDeployment.project.startCommand }),
        ...(stableDeployment.project.buildCommand && { buildCommand: stableDeployment.project.buildCommand }),
        ...(stableDeployment.project.rootDirectory && { rootDirectory: stableDeployment.project.rootDirectory }),
        port: stableDeployment.project.targetPort,
        canary: {
          stableDeploymentId: params.deploymentId,
          stableContainerHostPort: stableDeployment.container.hostPort,
          weight: body.percent,
        },
        placement: {
          serverId: stableDeployment.serverId,
          requireServerAffinity: true,
          forceReserveCapacity: true,
        },
      });

      await audit.record({
        organizationId: stableDeployment.project.organizationId,
        actorUserId: user.userId,
        action: 'deployment.canary_started',
        entityType: 'deployment',
        entityId: result.deploymentId,
        metadata: {
          stableDeploymentId: params.deploymentId,
          canaryPercent: body.percent,
          candidateSource,
          ...(candidateDeploymentId && { candidateDeploymentId }),
          ...(candidateBranch && { branch: candidateBranch }),
          ...(candidateCommitSha && { commitSha: candidateCommitSha }),
          ...(candidateImageTag && { imageTag: candidateImageTag }),
        },
      });

      return reply.code(202).send({
        ...result,
        canaryPercent: body.percent,
        stableDeploymentId: params.deploymentId,
        candidateSource,
        ...(candidateDeploymentId && { candidateDeploymentId }),
        message: `Canary release queued. ${body.percent}% of traffic will shift after the new deployment is ready.`,
      });
    } catch (error) {
      if (error instanceof DeploymentRequestError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  app.patch('/deployments/:deploymentId/canary/percent', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);
    const body = z.object({ percent: z.number().int().min(1).max(99) }).parse(request.body);

    const canaryDeployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          include: {
            activeDeployment: {
              include: { container: { select: { hostPort: true, status: true } } },
            },
          },
        },
        container: { select: { hostPort: true, status: true } },
      },
    });

    if (!canaryDeployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, canaryDeployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!canaryDeployment.isCanary || canaryDeployment.project.canaryDeploymentId !== params.deploymentId) {
      return reply.badRequest('This deployment is not an active canary');
    }

    if (!canaryDeployment.container || canaryDeployment.container.status !== 'running') {
      return reply.badRequest('Canary container is not running');
    }

    const stableContainer = canaryDeployment.project.activeDeployment?.container;
    if (!stableContainer || stableContainer.status !== 'running') {
      return reply.badRequest('Stable container is not running');
    }

    await queue.enqueueCanaryAction({
      action: 'set_percent',
      deploymentId: params.deploymentId,
      percent: body.percent,
    });

    await queue.publishEvent({
      deploymentId: params.deploymentId,
      type: 'canary_percent_update_queued',
      message: `Canary traffic update queued (${body.percent}%).`,
    });

    await audit.record({
      organizationId: canaryDeployment.project.organizationId,
      actorUserId: user.userId,
      action: 'deployment.canary_percent_update_requested',
      entityType: 'deployment',
      entityId: params.deploymentId,
      metadata: { newPercent: body.percent },
    });

    return reply.code(202).send({
      success: true,
      deploymentId: params.deploymentId,
      canaryPercent: body.percent,
      message: `Canary traffic update queued for ${body.percent}%.`,
    });
  });

  app.post('/deployments/:deploymentId/canary/promote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const canaryDeployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          include: {
            activeDeployment: {
              include: { container: { select: { id: true, dockerContainerId: true, status: true, hostPort: true } } },
            },
          },
        },
        container: { select: { id: true, hostPort: true, status: true } },
      },
    });

    if (!canaryDeployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, canaryDeployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!canaryDeployment.isCanary || canaryDeployment.project.canaryDeploymentId !== params.deploymentId) {
      return reply.badRequest('This deployment is not an active canary');
    }

    if (canaryDeployment.status !== 'ready') {
      return reply.badRequest('Only a ready canary can be promoted');
    }

    if (!canaryDeployment.project.activeDeploymentId) {
      return reply.badRequest('Cannot promote canary: no stable deployment is currently recorded');
    }

    await queue.enqueueCanaryAction({
      action: 'promote',
      deploymentId: params.deploymentId,
      stableDeploymentId: canaryDeployment.project.activeDeploymentId,
    });

    await queue.publishEvent({
      deploymentId: params.deploymentId,
      type: 'canary_promote_queued',
      message: 'Canary promotion queued.',
    });

    await audit.record({
      organizationId: canaryDeployment.project.organizationId,
      actorUserId: user.userId,
      action: 'deployment.canary_promote_requested',
      entityType: 'deployment',
      entityId: params.deploymentId,
      metadata: {
        previousActiveDeploymentId: canaryDeployment.project.activeDeploymentId,
      },
    });

    return reply.code(202).send({
      success: true,
      deploymentId: params.deploymentId,
      message: 'Canary promotion queued.',
    });
  });

  app.post('/deployments/:deploymentId/canary/abort', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ deploymentId: z.string().cuid() }).parse(request.params);

    const canaryDeployment = await prisma.deployment.findUnique({
      where: { id: params.deploymentId },
      include: {
        project: {
          include: {
            activeDeployment: {
              include: { container: { select: { id: true, hostPort: true, status: true } } },
            },
          },
        },
        container: { select: { id: true, dockerContainerId: true, hostPort: true, status: true } },
      },
    });

    if (!canaryDeployment) {
      return reply.notFound('Deployment not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, canaryDeployment.project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (!canaryDeployment.isCanary || canaryDeployment.project.canaryDeploymentId !== params.deploymentId) {
      return reply.badRequest('This deployment is not an active canary');
    }

    if (!canaryDeployment.project.activeDeploymentId) {
      return reply.badRequest('Cannot abort canary: no stable deployment is currently recorded');
    }

    await queue.enqueueCanaryAction({
      action: 'abort',
      deploymentId: params.deploymentId,
      stableDeploymentId: canaryDeployment.project.activeDeploymentId,
    });

    await queue.publishEvent({
      deploymentId: params.deploymentId,
      type: 'canary_abort_queued',
      message: 'Canary abort queued.',
    });

    await audit.record({
      organizationId: canaryDeployment.project.organizationId,
      actorUserId: user.userId,
      action: 'deployment.canary_abort_requested',
      entityType: 'deployment',
      entityId: params.deploymentId,
      metadata: {
        restoredDeploymentId: canaryDeployment.project.activeDeploymentId,
      },
    });

    return reply.code(202).send({
      success: true,
      deploymentId: params.deploymentId,
      restoredDeploymentId: canaryDeployment.project.activeDeploymentId,
      message: 'Canary abort queued.',
    });
  });
};
