import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';

const exec = promisify(execCb);

const shellEscape = (value: string): string =>
  `'${value.replace(/'/g, `'\"'\"'`)}'`;

async function getDevContainer(projectId: string) {
  return prisma.container.findFirst({
    where: {
      projectId,
      containerType: 'development',
      status: 'running',
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function execInContainer(dockerId: string, cmd: string): Promise<string> {
  const { stdout } = await exec(
    `docker exec ${shellEscape(dockerId)} sh -c ${shellEscape(cmd)}`,
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
}

export const fileRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  // ── Middleware: resolve project + container + access ────────────────────────
  const resolveContext = async (
    userId: string,
    projectId: string,
    reply: FastifyReply,
  ) => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });

    if (!project) {
      reply.notFound('Project not found');
      return null;
    }

    try {
      await access.requireOrganizationRole(userId, project.organizationId, 'developer');
    } catch (e) {
      reply.forbidden((e as Error).message);
      return null;
    }

    const container = await getDevContainer(projectId);
    if (!container) {
      reply.badRequest('No running dev container for this project. Start one first.');
      return null;
    }

    if (!/^[a-f0-9]{12,64}$/i.test(container.dockerContainerId)) {
      reply.internalServerError('Container reference is invalid');
      return null;
    }

    return { project, container };
  };

  // ── GET /projects/:id/files  (directory listing) ─────────────────────────
  app.get(
    '/projects/:projectId/files',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
      const { path: dirPath = '/home/coder/project' } = z.object({
        path: z.string().optional(),
      }).parse(request.query);

      const ctx = await resolveContext(user.userId, projectId, reply);
      if (!ctx) return;

      const { container } = ctx;

      // find -maxdepth 3 for performance; sorted; skip .git internals
      const raw = await execInContainer(
        container.dockerContainerId,
        `find ${shellEscape(dirPath)} -maxdepth 3 \\( -path ${shellEscape(`${dirPath}/.git`)} -prune \\) -o -print 2>/dev/null | sort`,
      );

      const lines = raw.split('\n').filter((l) => l.trim() && l !== dirPath);

      // Build tree
      const entries = await Promise.all(
        lines.map(async (absPath) => {
          const stat = await execInContainer(
            container.dockerContainerId,
            `stat -c '%F %s %Y' ${shellEscape(absPath)} 2>/dev/null || echo 'unknown 0 0'`,
          ).catch(() => 'unknown 0 0');
          const [type, size, mtime] = stat.trim().split(' ');
          const relativePath = absPath.replace(dirPath, '').replace(/^\//, '');
          return {
            path: relativePath,
            absPath,
            type: type?.includes('directory') ? 'directory' : 'file',
            size: parseInt(size ?? '0', 10),
            modifiedAt: new Date(parseInt(mtime ?? '0', 10) * 1000).toISOString(),
          };
        }),
      );

      return { entries };
    },
  );

  // ── GET /projects/:id/files/:path  (read file content) ──────────────────
  app.get(
    '/projects/:projectId/files/*',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const params = request.params as { projectId: string; '*': string };
      const projectId = z.string().cuid().parse(params.projectId);
      const filePath = params['*'];

      if (!filePath) return reply.badRequest('File path required');

      const ctx = await resolveContext(user.userId, projectId, reply);
      if (!ctx) return;

      const absPath = `/home/coder/project/${filePath.replace(/^\//, '')}`;

      const content = await execInContainer(
        ctx.container.dockerContainerId,
        `cat ${shellEscape(absPath)}`,
      ).catch(() => null);

      if (content === null) return reply.notFound('File not found');

      return { path: filePath, content };
    },
  );

  // ── POST /projects/:id/files  (create file) ──────────────────────────────
  app.post(
    '/projects/:projectId/files',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
      const body = z.object({
        path: z.string().min(1),
        content: z.string().default(''),
      }).parse(request.body);

      const ctx = await resolveContext(user.userId, projectId, reply);
      if (!ctx) return;

      const absPath = `/home/coder/project/${body.path.replace(/^\//, '')}`;
      const escapedContent = body.content
        .replace(/\\/g, '\\\\')
        .replace(/'/g, `'\"'\"'`)
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`');

      // Create parent dirs + write file
      await execInContainer(
        ctx.container.dockerContainerId,
        `mkdir -p "$(dirname ${shellEscape(absPath)})" && printf '%s' '${escapedContent}' > ${shellEscape(absPath)}`,
      );

      reply.code(201);
      return { path: body.path, created: true };
    },
  );

  // ── PATCH /projects/:id/files/:path  (update file content) ──────────────
  app.patch(
    '/projects/:projectId/files/*',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const params = request.params as { projectId: string; '*': string };
      const projectId = z.string().cuid().parse(params.projectId);
      const filePath = params['*'];
      const body = z.object({ content: z.string() }).parse(request.body);

      if (!filePath) return reply.badRequest('File path required');

      const ctx = await resolveContext(user.userId, projectId, reply);
      if (!ctx) return;

      const absPath = `/home/coder/project/${filePath.replace(/^\//, '')}`;

      // Write via base64 to avoid shell escaping issues with arbitrary content
      const b64 = Buffer.from(body.content, 'utf8').toString('base64');
      await execInContainer(
        ctx.container.dockerContainerId,
        `printf '%s' '${b64}' | base64 -d > ${shellEscape(absPath)}`,
      );

      return { path: filePath, updated: true };
    },
  );

  // ── DELETE /projects/:id/files/:path  (delete file or dir) ──────────────
  app.delete(
    '/projects/:projectId/files/*',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { userId: string };
      const params = request.params as { projectId: string; '*': string };
      const projectId = z.string().cuid().parse(params.projectId);
      const filePath = params['*'];

      if (!filePath) return reply.badRequest('File path required');

      const ctx = await resolveContext(user.userId, projectId, reply);
      if (!ctx) return;

      const absPath = `/home/coder/project/${filePath.replace(/^\//, '')}`;
      await execInContainer(ctx.container.dockerContainerId, `rm -rf ${shellEscape(absPath)}`);

      return { path: filePath, deleted: true };
    },
  );
};
