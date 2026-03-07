import type { FastifyPluginAsync } from 'fastify';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

const exec = promisify(execCb);

const shellEscape = (value: string): string =>
  `'${value.replace(/'/g, `'\"'\"'`)}'`;

const DEV_IMAGE = 'apployd/dev-container:latest';

export const devContainerRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  // ── GET /projects/:id/dev-container  (status) ────────────────────────────
  app.get(
    '/projects/:projectId/dev-container',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true, name: true },
      });
      if (!project) return reply.notFound('Project not found');

      try {
        await access.requireOrganizationRole(user.userId, project.organizationId, 'viewer');
      } catch (error) {
        return reply.forbidden((error as Error).message);
      }

      const container = await prisma.container.findFirst({
        where: { projectId, containerType: 'development' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          dockerContainerId: true,
          status: true,
          sleepStatus: true,
          volumeName: true,
          startedAt: true,
          createdAt: true,
        },
      });

      if (!container) return { exists: false };

      return { exists: true, container };
    },
  );

  // ── POST /projects/:id/dev-container  (create + start) ──────────────────
  app.post(
    '/projects/:projectId/dev-container',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
      const body = z.object({
        gitUrl: z.string().url().optional(),
        branch: z.string().optional(),
      }).parse(request.body ?? {});

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true, name: true },
      });
      if (!project) return reply.notFound('Project not found');

      // Determine server: prefer the server already running a container for this project
      const existingDeployContainer = await prisma.container.findFirst({
        where: { projectId, status: { in: ['running', 'sleeping', 'pending'] } },
        select: { serverId: true },
        orderBy: { createdAt: 'desc' },
      });
      let serverId = existingDeployContainer?.serverId ?? null;
      if (!serverId) {
        const healthyServer = await prisma.server.findFirst({
          where: { status: 'healthy' },
          orderBy: { reservedRamMb: 'asc' },
          select: { id: true },
        });
        if (!healthyServer) return reply.serviceUnavailable('No available server');
        serverId = healthyServer.id;
      }

      try {
        await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
      } catch (error) {
        return reply.forbidden((error as Error).message);
      }

      // Only one dev container per project
      const existing = await prisma.container.findFirst({
        where: { projectId, containerType: 'development' },
        orderBy: { createdAt: 'desc' },
      });

      if (existing && ['running', 'starting', 'sleeping'].includes(existing.status)) {
        return reply.conflict('Dev container already exists. Use start/stop endpoints.');
      }

      const volumeName = `apployd-dev-${projectId}`;
      const containerName = `apployd-dev-${projectId}`;

      // Remove stale container if exists
      await exec(`docker rm -f ${shellEscape(containerName)} 2>/dev/null || true`);

      // Create volume (idempotent)
      await exec(`docker volume create ${shellEscape(volumeName)}`);
      await exec(`docker volume create ${shellEscape(`${volumeName}-config`)}`);
      await exec(`docker volume create ${shellEscape(`${volumeName}-ssh`)}`);

      // Run container: sleep infinity so it stays alive for exec sessions
      const { stdout: dockerId } = await exec(
        `docker run -d \
          --name ${shellEscape(containerName)} \
          --network apployd-net \
          --volume ${shellEscape(volumeName)}:/home/coder/project \
          --volume ${shellEscape(`${volumeName}-config`)}:/home/coder/.config \
          --volume ${shellEscape(`${volumeName}-ssh`)}:/home/coder/.ssh \
          --cpus=2 --memory=4g --memory-swap=4g \
          --security-opt no-new-privileges \
          ${shellEscape(DEV_IMAGE)} \
          sleep infinity`,
      );

      const trimmedId = dockerId.trim();

      // Clone repo if provided
      if (body.gitUrl) {
        const branchFlag = body.branch ? `--branch ${shellEscape(body.branch)}` : '';
        await exec(
          `docker exec ${shellEscape(trimmedId)} sh -c ${shellEscape(
            `git clone --depth=1 ${branchFlag} ${body.gitUrl} /home/coder/project 2>&1 || true`,
          )}`,
        ).catch(() => undefined);
      }

      // Save container record
      const record = await prisma.container.create({
        data: {
          projectId,
          serverId: serverId,
          dockerContainerId: trimmedId,
          imageTag: DEV_IMAGE,
          internalPort: 0,
          hostPort: 0,
          status: 'running',
          sleepStatus: 'awake',
          containerType: 'development',
          volumeName,
          startedAt: new Date(),
        },
      });

      reply.code(201);
      return { container: { id: record.id, status: record.status, volumeName } };
    },
  );

  // ── POST /projects/:id/dev-container/start  (wake sleeping container) ────
  app.post(
    '/projects/:projectId/dev-container/start',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true },
      });
      if (!project) return reply.notFound('Project not found');

      try {
        await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
      } catch (error) {
        return reply.forbidden((error as Error).message);
      }

      const container = await prisma.container.findFirst({
        where: { projectId, containerType: 'development' },
        orderBy: { createdAt: 'desc' },
      });
      if (!container) return reply.notFound('Dev container not found');

      await exec(`docker start ${shellEscape(container.dockerContainerId)}`).catch(() => undefined);

      await prisma.container.update({
        where: { id: container.id },
        data: { status: 'running', sleepStatus: 'awake', startedAt: new Date() },
      });

      return { status: 'running' };
    },
  );

  // ── POST /projects/:id/dev-container/stop  ────────────────────────────────
  app.post(
    '/projects/:projectId/dev-container/stop',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true },
      });
      if (!project) return reply.notFound('Project not found');

      try {
        await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
      } catch (error) {
        return reply.forbidden((error as Error).message);
      }

      const container = await prisma.container.findFirst({
        where: { projectId, containerType: 'development' },
        orderBy: { createdAt: 'desc' },
      });
      if (!container) return reply.notFound('Dev container not found');

      await exec(`docker stop ${shellEscape(container.dockerContainerId)}`).catch(() => undefined);

      await prisma.container.update({
        where: { id: container.id },
        data: { status: 'stopped', sleepStatus: 'sleeping', stoppedAt: new Date() },
      });

      return { status: 'stopped' };
    },
  );

  // ── DELETE /projects/:id/dev-container  (destroy container + volumes) ────
  app.delete(
    '/projects/:projectId/dev-container',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
      const { deleteVolumes = false } = z.object({ deleteVolumes: z.boolean().optional() }).parse(
        request.query ?? {},
      );

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true },
      });
      if (!project) return reply.notFound('Project not found');

      try {
        await access.requireOrganizationRole(user.userId, project.organizationId, 'admin');
      } catch (error) {
        return reply.forbidden((error as Error).message);
      }

      const container = await prisma.container.findFirst({
        where: { projectId, containerType: 'development' },
        orderBy: { createdAt: 'desc' },
      });
      if (!container) return reply.notFound('Dev container not found');

      const containerName = `apployd-dev-${projectId}`;
      await exec(`docker rm -f ${shellEscape(containerName)} 2>/dev/null || true`);

      if (deleteVolumes && container.volumeName) {
        const vol = container.volumeName;
        await exec(`docker volume rm ${shellEscape(vol)} ${shellEscape(`${vol}-config`)} ${shellEscape(`${vol}-ssh`)} 2>/dev/null || true`);
      }

      await prisma.container.delete({ where: { id: container.id } });

      return { deleted: true };
    },
  );
};
