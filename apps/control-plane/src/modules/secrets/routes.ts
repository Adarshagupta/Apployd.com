import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { DotenvParseError, parseDotenvText } from '../../lib/dotenv-parser.js';
import { decryptSecret, encryptSecret } from '../../lib/secrets.js';
import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';

const upsertSecretBody = z.object({
  value: z.string().max(4096),
});

const SECRET_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

const secretKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(SECRET_KEY_PATTERN, 'Environment keys must be uppercase snake case');

const bulkUpsertSecretsBody = z
  .object({
    envText: z.string().max(200_000).optional(),
    secrets: z
      .array(
        z.object({
          key: secretKeySchema,
          value: z.string().max(4096),
        }),
      )
      .max(500)
      .optional(),
  })
  .refine(
    (value) =>
      (typeof value.envText === 'string' && value.envText.trim().length > 0)
      || (Array.isArray(value.secrets) && value.secrets.length > 0),
    {
      message: 'Provide envText or secrets.',
      path: ['envText'],
    },
  );

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
        key: secretKeySchema,
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

  app.post('/projects/:projectId/secrets/bulk', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ projectId: z.string().cuid() }).parse(request.params);
    const body = bulkUpsertSecretsBody.parse(request.body);

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

    const mergedSecrets = new Map<string, string>();

    if (typeof body.envText === 'string' && body.envText.trim().length > 0) {
      try {
        for (const entry of parseDotenvText(body.envText)) {
          mergedSecrets.set(entry.key, entry.value);
        }
      } catch (error) {
        if (error instanceof DotenvParseError) {
          return reply.badRequest(error.message);
        }
        throw error;
      }
    }

    for (const entry of body.secrets ?? []) {
      mergedSecrets.set(entry.key.trim().toUpperCase(), entry.value);
    }

    if (mergedSecrets.size === 0) {
      return reply.badRequest('No valid environment variables were provided.');
    }

    if (mergedSecrets.size > 500) {
      return reply.badRequest('At most 500 environment variables can be imported at once.');
    }

    const keys = [...mergedSecrets.keys()];
    const invalidKey = keys.find((key) => !SECRET_KEY_PATTERN.test(key));
    if (invalidKey) {
      return reply.badRequest(`Invalid environment key: ${invalidKey}`);
    }

    const existing = await prisma.projectSecret.findMany({
      where: {
        projectId: params.projectId,
        key: { in: keys },
      },
      select: { key: true },
    });
    const existingSet = new Set(existing.map((record) => record.key));

    await prisma.$transaction(async (tx) => {
      for (const [key, value] of mergedSecrets.entries()) {
        const encrypted = encryptSecret(value);
        await tx.projectSecret.upsert({
          where: {
            projectId_key: {
              projectId: params.projectId,
              key,
            },
          },
          update: {
            encryptedValue: encrypted.encryptedValue,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
          create: {
            projectId: params.projectId,
            key,
            encryptedValue: encrypted.encryptedValue,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
        });
      }
    });

    const created = keys.filter((key) => !existingSet.has(key)).length;
    const updated = keys.length - created;

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'project.secret.bulk_upserted',
      entityType: 'project',
      entityId: params.projectId,
      metadata: {
        imported: keys.length,
        created,
        updated,
      },
    });

    return {
      success: true,
      imported: keys.length,
      created,
      updated,
    };
  });

  app.delete('/projects/:projectId/secrets/:key', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z
      .object({
        projectId: z.string().cuid(),
        key: secretKeySchema,
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
        key: secretKeySchema,
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
