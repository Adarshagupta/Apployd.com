import type { FastifyPluginAsync } from 'fastify';

import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';
import { ProjectUsageService } from '../../services/project-usage-service.js';

export const usageRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const projectUsage = new ProjectUsageService();

  app.get('/usage/summary', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: query.organizationId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return reply.notFound('No active subscription found');
    }

    const grouped = await prisma.usageRecord.groupBy({
      by: ['metricType'],
      where: {
        organizationId: query.organizationId,
        recordedAt: {
          gte: subscription.currentPeriodStart,
          lte: subscription.currentPeriodEnd,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const totals = grouped.reduce<Record<string, string>>((acc, row) => {
      acc[row.metricType] = row._sum.quantity?.toString() ?? '0';
      return acc;
    }, {});

    // Calculate current allocation across all projects
    const currentAllocation = await prisma.project.aggregate({
      where: { organizationId: query.organizationId },
      _sum: {
        resourceRamMb: true,
        resourceCpuMillicore: true,
        resourceBandwidthGb: true,
      },
    });

    return {
      subscription,
      usage: totals,
      pools: {
        ramMb: subscription.poolRamMb,
        cpuMillicores: subscription.poolCpuMillicores,
        bandwidthGb: subscription.poolBandwidthGb,
      },
      allocated: {
        ramMb: currentAllocation._sum.resourceRamMb ?? 0,
        cpuMillicores: currentAllocation._sum.resourceCpuMillicore ?? 0,
        bandwidthGb: currentAllocation._sum.resourceBandwidthGb ?? 0,
      },
    };
  });

  app.get('/usage/daily', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
        metricType: z.enum([
          'cpu_millicore_seconds',
          'ram_mb_seconds',
          'bandwidth_bytes',
          'request_count',
        ]),
        days: z.coerce.number().int().min(1).max(90).default(7),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const from = new Date();
    from.setDate(from.getDate() - query.days + 1);
    from.setHours(0, 0, 0, 0);

    const rows = await prisma.$queryRaw<Array<{ day: Date; total: bigint }>>(Prisma.sql`
      SELECT
        DATE_TRUNC('day', "recordedAt") AS day,
        SUM("quantity")::bigint AS total
      FROM "usage_records"
      WHERE "organizationId" = ${query.organizationId}
        AND "metricType" = ${query.metricType}::"UsageMetricType"
        AND "recordedAt" >= ${from}
      GROUP BY DATE_TRUNC('day', "recordedAt")
      ORDER BY day ASC
    `);

    return {
      points: rows.map((row) => ({
        day: row.day.toISOString(),
        total: row.total.toString(),
      })),
    };
  });

  app.get('/usage/projects', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
        days: z.coerce.number().int().min(1).max(365).optional(),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const projects = await prisma.project.findMany({
      where: { organizationId: query.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        runtime: true,
        resourceRamMb: true,
        resourceCpuMillicore: true,
        resourceBandwidthGb: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const usageOptions = query.days
      ? {
          from: new Date(Date.now() - (query.days * 24 * 60 * 60 * 1000)),
          to: new Date(),
        }
      : {};

    const snapshots = await projectUsage.listProjectUsageSnapshots(
      query.organizationId,
      projects.map((project) => project.id),
      usageOptions,
    );

    return {
      usageWindow: snapshots.window,
      projects: projects.map((project) => ({
        ...project,
        usage: snapshots.byProjectId[project.id] ?? null,
      })),
    };
  });

  app.get('/usage/projects/:projectId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ projectId: z.string().cuid() }).parse(request.params);
    const query = z
      .object({
        days: z.coerce.number().int().min(1).max(365).optional(),
      })
      .parse(request.query);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        runtime: true,
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

    const details = await projectUsage.getProjectUsageDetails(project.organizationId, project.id, {
      ...(query.days
        ? {
            from: new Date(Date.now() - (query.days * 24 * 60 * 60 * 1000)),
            to: new Date(),
          }
        : {}),
    });

    return {
      project,
      ...details,
    };
  });
};
