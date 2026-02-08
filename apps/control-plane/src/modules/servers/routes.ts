import type { FastifyPluginAsync } from 'fastify';

import { OrgRole } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

export const serverRoutes: FastifyPluginAsync = async (app) => {
  const createServerSchema = z.object({
    name: z.string().min(2).max(80),
    region: z.string().min(2).max(32),
    ipv4: z.string().ip({ version: 'v4' }),
    totalRamMb: z.number().int().min(128),
    totalCpuMillicores: z.number().int().min(100),
    totalBandwidthGb: z.number().int().min(1),
    maxContainers: z.number().int().min(1).max(10000).default(200),
    status: z.enum(['healthy', 'degraded', 'draining', 'offline']).default('healthy'),
  });

  const updateServerSchema = z
    .object({
      name: z.string().min(2).max(80).optional(),
      region: z.string().min(2).max(32).optional(),
      ipv4: z.string().ip({ version: 'v4' }).optional(),
      totalRamMb: z.number().int().min(128).optional(),
      totalCpuMillicores: z.number().int().min(100).optional(),
      totalBandwidthGb: z.number().int().min(1).optional(),
      maxContainers: z.number().int().min(1).max(10000).optional(),
      status: z.enum(['healthy', 'degraded', 'draining', 'offline']).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required to update a server.',
    });

  const requireServerAdmin = async (userId: string): Promise<void> => {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId,
        role: {
          in: [OrgRole.owner, OrgRole.admin],
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new Error('Organization owner/admin role is required to manage servers.');
    }
  };

  app.get('/servers', { preHandler: [app.authenticate] }, async () => {
    const servers = await prisma.server.findMany({
      orderBy: [{ region: 'asc' }, { name: 'asc' }],
    });

    return { servers };
  });

  app.post('/servers', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = createServerSchema.parse(request.body);

    try {
      await requireServerAdmin(user.userId);
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const existing = await prisma.server.findFirst({
      where: {
        OR: [{ name: body.name }, { ipv4: body.ipv4 }],
      },
      select: { id: true },
    });

    if (existing) {
      return reply.conflict('Server with same name or IPv4 already exists.');
    }

    const server = await prisma.server.create({
      data: {
        name: body.name,
        region: body.region,
        ipv4: body.ipv4,
        status: body.status,
        totalRamMb: body.totalRamMb,
        totalCpuMillicores: body.totalCpuMillicores,
        totalBandwidthGb: body.totalBandwidthGb,
        maxContainers: body.maxContainers,
      },
    });

    return reply.code(201).send({ server });
  });

  app.patch('/servers/:serverId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ serverId: z.string().cuid() }).parse(request.params);
    const body = updateServerSchema.parse(request.body);

    try {
      await requireServerAdmin(user.userId);
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const existing = await prisma.server.findUnique({
      where: { id: params.serverId },
      select: { id: true },
    });

    if (!existing) {
      return reply.notFound('Server not found');
    }

    const server = await prisma.server.update({
      where: { id: params.serverId },
      data: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as any,
    });

    return { server };
  });
};
