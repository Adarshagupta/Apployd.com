import type { FastifyPluginAsync } from 'fastify';
import type { Project } from '@prisma/client';

import { z } from 'zod';

import { env } from '../../config/env.js';
import { getPlanEntitlements } from '../../domain/plan-entitlements.js';
import { decryptSecret } from '../../lib/secrets.js';
import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';
import { GitHubService } from '../../services/github-service.js';
import { prisma } from '../../lib/prisma.js';
import { isSerializableRetryableError, withSerializableRetry } from '../../lib/transaction-retry.js';
import { ProjectUsageService } from '../../services/project-usage-service.js';
import { ResourcePolicyService } from '../../services/resource-policy-service.js';
import { ProjectDeleteOtpError, ProjectDeleteOtpService } from '../../services/project-delete-otp-service.js';

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

const projectIdParamsSchema = z.object({
  projectId: z.string().cuid(),
});

const confirmProjectDeleteSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'OTP must be a 6 digit code'),
});

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const buildGitHubWebhookUrl = (): string =>
  `${trimTrailingSlash(env.API_BASE_URL)}/api/v1/integrations/github/webhook`;

const resolveRepoIdentity = (input: {
  repoOwner?: string | undefined;
  repoName?: string | undefined;
  repoFullName?: string | undefined;
}): { owner: string; name: string } | null => {
  if (input.repoOwner?.trim() && input.repoName?.trim()) {
    return {
      owner: input.repoOwner.trim(),
      name: input.repoName.trim(),
    };
  }

  if (input.repoFullName?.trim()) {
    const [owner, name] = input.repoFullName.trim().split('/').filter(Boolean);
    if (owner && name) {
      return { owner, name };
    }
  }

  return null;
};

export const projectRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const policy = new ResourcePolicyService();
  const audit = new AuditLogService();
  const usage = new ProjectUsageService();
  const projectDeleteOtp = new ProjectDeleteOtpService();
  const github = new GitHubService();

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
        status: { in: ['active', 'trialing', 'past_due'] },
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
    const entitlements = getPlanEntitlements(subscription.plan.code);
    const autoDeployEnabled = entitlements.autoDeploy ? body.autoDeployEnabled : false;
    const previewDeploymentsEnabled =
      entitlements.previewDeployments ? body.previewDeploymentsEnabled : false;
    const repoIdentity = resolveRepoIdentity({
      repoOwner: body.repoOwner,
      repoName: body.repoName,
      repoFullName: body.repoFullName,
    });
    let webhook:
      | {
          configured: true;
          created: boolean;
          hookId: number;
          url: string;
        }
      | {
          configured: false;
          reason: string;
        };

    if (autoDeployEnabled && repoIdentity) {
      if (!env.GITHUB_WEBHOOK_SECRET?.trim()) {
        return reply.code(503).send({
          message:
            'GitHub webhook secret is not configured on the server. Set GITHUB_WEBHOOK_SECRET to enable automatic push deployments.',
        });
      }

      const connection = await prisma.gitHubConnection.findUnique({
        where: { userId: user.userId },
      });
      if (!connection) {
        return reply.code(409).send({
          message: 'Connect your GitHub account before enabling automatic push deployments.',
        });
      }

      const accessToken = decryptSecret({
        encryptedValue: connection.encryptedAccessToken,
        iv: connection.iv,
        authTag: connection.authTag,
      });

      try {
        const ensured = await github.ensureRepositoryPushWebhook({
          accessToken,
          owner: repoIdentity.owner,
          repo: repoIdentity.name,
          webhookUrl: buildGitHubWebhookUrl(),
          secret: env.GITHUB_WEBHOOK_SECRET,
        });
        webhook = {
          configured: true,
          created: ensured.created,
          hookId: ensured.hookId,
          url: buildGitHubWebhookUrl(),
        };
      } catch (error) {
        return reply.code(400).send({
          message: `GitHub webhook setup failed: ${(error as Error).message}`,
        });
      }
    } else {
      webhook = {
        configured: false,
        reason: autoDeployEnabled ? 'missing_repo_identity' : 'auto_deploy_disabled',
      };
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
            autoDeployEnabled,
            previewDeploymentsEnabled,
            ...(body.targetPort && { targetPort: body.targetPort }),
            resourceRamMb: 128,
            resourceCpuMillicore: 100,
            resourceBandwidthGb: 1,
            // Sleep mode is globally disabled; keep all projects always active.
            sleepEnabled: false,
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

    return reply.code(201).send({ project, webhook });
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

  app.post('/projects/:projectId/delete/request-otp', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = projectIdParamsSchema.parse(request.params);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        name: true,
        organizationId: true,
      },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const actor = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        email: true,
        name: true,
      },
    });
    if (!actor) {
      return reply.unauthorized('User no longer exists.');
    }

    try {
      const dispatched = await projectDeleteOtp.sendCode({
        projectId: project.id,
        projectName: project.name,
        userId: user.userId,
        email: actor.email,
        name: actor.name,
      });

      await audit.record({
        organizationId: project.organizationId,
        actorUserId: user.userId,
        action: 'project.delete_otp.requested',
        entityType: 'project',
        entityId: project.id,
      });

      return {
        success: true,
        expiresInMinutes: dispatched.expiresInMinutes,
        ...(dispatched.devCode ? { devCode: dispatched.devCode } : {}),
      };
    } catch (error) {
      if (error instanceof ProjectDeleteOtpError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  app.post('/projects/:projectId/delete/confirm', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = projectIdParamsSchema.parse(request.params);
    const body = confirmProjectDeleteSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        name: true,
        organizationId: true,
      },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    try {
      const valid = await projectDeleteOtp.verifyCode({
        projectId: project.id,
        userId: user.userId,
        code: body.code,
      });

      if (!valid) {
        return reply.unauthorized('Invalid or expired OTP.');
      }
    } catch (error) {
      if (error instanceof ProjectDeleteOtpError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }

    await prisma.project.delete({
      where: { id: project.id },
    });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'project.deleted',
      entityType: 'project',
      entityId: project.id,
      metadata: {
        name: project.name,
      },
    });

    return {
      success: true,
      deletedProjectId: project.id,
    };
  });
};
