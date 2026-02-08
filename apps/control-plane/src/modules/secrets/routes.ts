import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { decryptSecret, encryptSecret } from '../../lib/secrets.js';
import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';

const upsertSecretBody = z.object({
  value: z.string().min(1),
});

export const secretRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const audit = new AuditLogService();

  app.get('/projects/:projectId/secrets', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ projectId: z.string().cuid() }).parse(request.params);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
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

    const secrets = await prisma.projectSecret.findMany({
      where: { projectId: params.projectId },
      select: {
        id: true,
        key: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { key: 'asc' },
    });

    return { secrets };
  });

  app.put('/projects/:projectId/secrets/:key', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z
      .object({
        projectId: z.string().cuid(),
        key: z.string().min(1).max(120),
      })
      .parse(request.params);

    const body = upsertSecretBody.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
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

    const encrypted = encryptSecret(body.value);

    const secret = await prisma.projectSecret.upsert({
      where: {
        projectId_key: {
          projectId: params.projectId,
          key: params.key,
        },
      },
      update: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      create: {
        projectId: params.projectId,
        key: params.key,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      select: {
        id: true,
        key: true,
        updatedAt: true,
      },
    });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'project.secret.upserted',
      entityType: 'project_secret',
      entityId: secret.id,
      metadata: {
        projectId: params.projectId,
        key: params.key,
      },
    });

    return reply.code(201).send({ secret });
  });

  app.delete('/projects/:projectId/secrets/:key', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z
      .object({
        projectId: z.string().cuid(),
        key: z.string().min(1).max(120),
      })
      .parse(request.params);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
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

    await prisma.projectSecret.deleteMany({
      where: {
        projectId: params.projectId,
        key: params.key,
      },
    });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'project.secret.deleted',
      entityType: 'project_secret',
      entityId: params.key,
      metadata: {
        projectId: params.projectId,
        key: params.key,
      },
    });

    return { success: true };
  });

  app.get('/projects/:projectId/secrets/:key/reveal', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z
      .object({
        projectId: z.string().cuid(),
        key: z.string().min(1).max(120),
      })
      .parse(request.params);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { organizationId: true },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const secret = await prisma.projectSecret.findUnique({
      where: {
        projectId_key: {
          projectId: params.projectId,
          key: params.key,
        },
      },
    });

    if (!secret) {
      return reply.notFound('Secret not found');
    }

    const value = decryptSecret({
      encryptedValue: secret.encryptedValue,
      iv: secret.iv,
      authTag: secret.authTag,
    });

    return { key: secret.key, value };
  });
};
