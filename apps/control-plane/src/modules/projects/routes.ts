import type { FastifyPluginAsync } from 'fastify';
import type { Project } from '@prisma/client';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';
import { prisma } from '../../lib/prisma.js';
import { isSerializableRetryableError, withSerializableRetry } from '../../lib/transaction-retry.js';
import { ProjectUsageService } from '../../services/project-usage-service.js';
import { ResourcePolicyService } from '../../services/resource-policy-service.js';

const createProjectSchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
  repoUrl: z.string().url().optional(),
  repoOwner: z.string().min(1).max(120).optional(),
  repoName: z.string().min(1).max(120).optional(),
  repoFullName: z.string().min(3).max(255).optional(),
  branch: z.string().default('main'),
  runtime: z.string().default('node'),
  installCommand: z.string().max(300).optional(),
  buildCommand: z.string().max(300).optional(),
  startCommand: z.string().max(300).optional(),
  rootDirectory: z.string().max(255).optional(),
  autoDeployEnabled: z.boolean().default(true),
  previewDeploymentsEnabled: z.boolean().default(true),
  targetPort: z.number().int().min(1).max(65535).default(3000),
  resourceRamMb: z.number().int().min(128).max(32768).default(256),
  resourceCpuMillicore: z.number().int().min(100).max(16000).default(250),
  resourceBandwidthGb: z.number().int().min(1).max(50000).default(25),
});

const updateResourceSchema = z.object({
  resourceRamMb: z.number().int().min(128).max(32768),
  resourceCpuMillicore: z.number().int().min(100).max(16000),
  resourceBandwidthGb: z.number().int().min(1).max(50000),
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const policy = new ResourcePolicyService();
  const audit = new AuditLogService();
  const usage = new ProjectUsageService();

  app.get('/projects', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
        includeUsage: z.coerce.boolean().default(true),
        usageDays: z.coerce.number().int().min(1).max(365).optional(),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const projects = await prisma.project.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    if (!query.includeUsage || projects.length === 0) {
      return { projects };
    }

    const usageOptions = query.usageDays
      ? {
          from: new Date(Date.now() - (query.usageDays * 24 * 60 * 60 * 1000)),
          to: new Date(),
        }
      : {};

    const usageByProject = await usage.listProjectUsageSnapshots(
      query.organizationId,
      projects.map((project) => project.id),
      usageOptions,
    );

    return {
      projects: projects.map((project) => ({
        ...project,
        usage: usageByProject.byProjectId[project.id] ?? null,
      })),
      usageWindow: usageByProject.window,
    };
  });

  app.post('/projects', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = createProjectSchema.parse(request.body);

    try {
      await access.requireOrganizationRole(user.userId, body.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: body.organizationId,
        status: { in: ['active', 'trialing'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return reply.badRequest('No active subscription');
    }

    if (subscription.plan.maxProjects !== null) {
      const count = await prisma.project.count({
        where: { organizationId: body.organizationId },
      });
      if (count >= subscription.plan.maxProjects) {
        return reply.badRequest('Project limit reached for plan');
      }
    }

    let project: Project;
    try {
      project = await withSerializableRetry(async (tx) => {
        const seedProject = await tx.project.create({
          data: {
            organizationId: body.organizationId,
            name: body.name,
            slug: body.slug,
            createdById: user.userId,
            runtime: body.runtime,
            gitProvider: body.repoUrl ? 'github' : null,
            ...(body.repoUrl && { repoUrl: body.repoUrl }),
            ...(body.repoOwner && { repoOwner: body.repoOwner }),
            ...(body.repoName && { repoName: body.repoName }),
            ...(body.repoFullName && { repoFullName: body.repoFullName }),
            ...(body.branch && { branch: body.branch }),
            ...(body.installCommand && { installCommand: body.installCommand }),
            ...(body.buildCommand && { buildCommand: body.buildCommand }),
            ...(body.startCommand && { startCommand: body.startCommand }),
            ...(body.rootDirectory && { rootDirectory: body.rootDirectory }),
            ...(body.autoDeployEnabled !== undefined && { autoDeployEnabled: body.autoDeployEnabled }),
            ...(body.previewDeploymentsEnabled !== undefined && { previewDeploymentsEnabled: body.previewDeploymentsEnabled }),
            ...(body.targetPort && { targetPort: body.targetPort }),
            resourceRamMb: 128,
            resourceCpuMillicore: 100,
            resourceBandwidthGb: 1,
            sleepEnabled: subscription.plan.code === 'free',
          },
        });

        await policy.assertCanAllocate(body.organizationId, seedProject.id, {
          ramMb: body.resourceRamMb,
          cpuMillicores: body.resourceCpuMillicore,
          bandwidthGb: body.resourceBandwidthGb,
        }, tx);

        return tx.project.update({
          where: { id: seedProject.id },
          data: {
            resourceRamMb: body.resourceRamMb,
            resourceCpuMillicore: body.resourceCpuMillicore,
            resourceBandwidthGb: body.resourceBandwidthGb,
          },
        });
      });
    } catch (error) {
      if (isSerializableRetryableError(error)) {
        return reply.code(503).send({
          message: 'Project allocation is currently contended. Retry this request.',
        });
      }
      return reply.badRequest((error as Error).message);
    }

    await audit.record({
      organizationId: body.organizationId,
      actorUserId: user.userId,
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
      metadata: {
        name: project.name,
        slug: project.slug,
      },
    });

    return reply.code(201).send({ project });
  });

  app.patch('/projects/:projectId/resources', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ projectId: z.string().cuid() }).parse(request.params);
    const body = updateResourceSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    let updated: Project;
    try {
      updated = await withSerializableRetry(async (tx) => {
        await policy.assertCanAllocate(project.organizationId, project.id, {
          ramMb: body.resourceRamMb,
          cpuMillicores: body.resourceCpuMillicore,
          bandwidthGb: body.resourceBandwidthGb,
        }, tx);

        return tx.project.update({
          where: { id: project.id },
          data: {
            resourceRamMb: body.resourceRamMb,
            resourceCpuMillicore: body.resourceCpuMillicore,
            resourceBandwidthGb: body.resourceBandwidthGb,
          },
        });
      });
    } catch (error) {
      if (isSerializableRetryableError(error)) {
        return reply.code(503).send({
          message: 'Project allocation is currently contended. Retry this request.',
        });
      }
      return reply.badRequest((error as Error).message);
    }

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'project.resources.updated',
      entityType: 'project',
      entityId: project.id,
      metadata: body,
    });

    return { project: updated };
  });
};
