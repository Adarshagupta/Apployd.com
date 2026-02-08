import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';
import { DomainVerificationService } from '../../services/domain-verification-service.js';
import { prisma } from '../../lib/prisma.js';

/* ── Validation schemas ────────────────────────────────────────── */

const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(
      /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}$/,
      'Must be a valid domain (e.g. app.example.com)',
    )
    .transform((d) => d.toLowerCase().replace(/\.$/, '')),
});

const projectIdParam = z.object({ projectId: z.string().cuid() });
const domainIdParam = z.object({ projectId: z.string().cuid(), domainId: z.string().cuid() });

/* ── Routes ────────────────────────────────────────────────────── */

export const domainRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const audit = new AuditLogService();
  const verifier = new DomainVerificationService();

  /**
   * Helper: load project + org and assert user has at least the given role.
   */
  const resolveProject = async (projectId: string, userId: string, role: 'viewer' | 'developer' = 'developer') => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true },
    });
    if (!project) throw new Error('Project not found');
    await access.requireOrganizationRole(userId, project.organizationId, role);
    return project;
  };

  /* ── LIST domains for project ───────────────────────────────── */

  app.get('/projects/:projectId/domains', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const { projectId } = projectIdParam.parse(request.params);

    try {
      await resolveProject(projectId, user.userId, 'viewer');
    } catch (err) {
      return reply.forbidden((err as Error).message);
    }

    const domains = await prisma.customDomain.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return { domains };
  });

  /* ── ADD a custom domain ────────────────────────────────────── */

  app.post('/projects/:projectId/domains', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const { projectId } = projectIdParam.parse(request.params);

    let body: z.infer<typeof addDomainSchema>;
    try {
      body = addDomainSchema.parse(request.body);
    } catch (err) {
      return reply.badRequest((err as Error).message);
    }

    let project;
    try {
      project = await resolveProject(projectId, user.userId);
    } catch (err) {
      return reply.forbidden((err as Error).message);
    }

    // Ensure domain doesn't already exist across any project
    const existing = await prisma.customDomain.findUnique({
      where: { domain: body.domain },
    });
    if (existing) {
      return reply.conflict('This domain is already registered on Apployd.');
    }

    const cnameTarget = DomainVerificationService.buildCnameTarget(
      project.slug,
      project.organization.slug,
    );

    const domain = await prisma.customDomain.create({
      data: {
        projectId,
        domain: body.domain,
        cnameTarget,
      },
    });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'domain.add',
      entityType: 'CustomDomain',
      entityId: domain.id,
      metadata: { domain: body.domain },
    });

    return reply.code(201).send({
      domain,
      instructions: {
        cname: {
          type: 'CNAME',
          host: body.domain,
          value: cnameTarget,
          description: `Add a CNAME record pointing ${body.domain} to ${cnameTarget}`,
        },
        txt: {
          type: 'TXT',
          host: `_apployd-verify.${body.domain}`,
          value: domain.verificationToken,
          description: `Alternatively, add a TXT record at _apployd-verify.${body.domain} with value ${domain.verificationToken}`,
        },
      },
    });
  });

  /* ── VERIFY domain DNS ──────────────────────────────────────── */

  app.post('/projects/:projectId/domains/:domainId/verify', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const { projectId, domainId } = domainIdParam.parse(request.params);

    try {
      await resolveProject(projectId, user.userId);
    } catch (err) {
      return reply.forbidden((err as Error).message);
    }

    const domainRecord = await prisma.customDomain.findFirst({
      where: { id: domainId, projectId },
    });
    if (!domainRecord) return reply.notFound('Domain not found');

    if (domainRecord.status === 'active') {
      return { domain: domainRecord, verification: { verified: true, method: 'already_active', detail: 'Domain already verified' } };
    }

    const result = await verifier.verify(domainId);

    const updated = await prisma.customDomain.findUniqueOrThrow({
      where: { id: domainId },
    });

    return { domain: updated, verification: result };
  });

  /* ── GET single domain ──────────────────────────────────────── */

  app.get('/projects/:projectId/domains/:domainId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const { projectId, domainId } = domainIdParam.parse(request.params);

    try {
      await resolveProject(projectId, user.userId, 'viewer');
    } catch (err) {
      return reply.forbidden((err as Error).message);
    }

    const domainRecord = await prisma.customDomain.findFirst({
      where: { id: domainId, projectId },
    });
    if (!domainRecord) return reply.notFound('Domain not found');

    return { domain: domainRecord };
  });

  /* ── DELETE (remove) a custom domain ────────────────────────── */

  app.delete('/projects/:projectId/domains/:domainId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const { projectId, domainId } = domainIdParam.parse(request.params);

    let project;
    try {
      project = await resolveProject(projectId, user.userId);
    } catch (err) {
      return reply.forbidden((err as Error).message);
    }

    const domainRecord = await prisma.customDomain.findFirst({
      where: { id: domainId, projectId },
    });
    if (!domainRecord) return reply.notFound('Domain not found');

    await prisma.customDomain.delete({ where: { id: domainId } });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'domain.remove',
      entityType: 'CustomDomain',
      entityId: domainId,
      metadata: { domain: domainRecord.domain },
    });

    return reply.code(200).send({ deleted: true });
  });
};
