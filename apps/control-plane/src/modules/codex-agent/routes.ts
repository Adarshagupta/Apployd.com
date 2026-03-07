import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';
import { CodexAgentService, normalizeAgentPath } from '../../services/codex-agent-service.js';

const exec = promisify(execCb);
const WORKSPACE_ROOT = '/home/coder/project';

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(12_000),
      }),
    )
    .min(1)
    .max(16),
  activePath: z.string().nullable().optional(),
  openFiles: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().max(120_000),
        dirty: z.boolean().optional(),
      }),
    )
    .max(20)
    .default([]),
});

const shellEscape = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;

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
  const { stdout } = await exec(`docker exec ${shellEscape(dockerId)} sh -c ${shellEscape(cmd)}`, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function resolveContext(
  userId: string,
  projectId: string,
  reply: FastifyReply,
  access: AccessService,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, repoUrl: true, organizationId: true },
  });

  if (!project) {
    reply.notFound('Project not found');
    return null;
  }

  try {
    await access.requireOrganizationRole(userId, project.organizationId, 'developer');
  } catch (error) {
    reply.forbidden((error as Error).message);
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
}

async function listProjectFiles(dockerContainerId: string): Promise<string[]> {
  const raw = await execInContainer(
    dockerContainerId,
    [
      `find ${shellEscape(WORKSPACE_ROOT)} -maxdepth 8`,
      '\\(',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/.git`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/*/.git`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/node_modules`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/*/node_modules`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/.next`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/*/.next`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/dist`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/*/dist`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/build`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/*/build`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/coverage`)}`,
      '-o',
      `-path ${shellEscape(`${WORKSPACE_ROOT}/*/coverage`)}`,
      '\\)',
      '-prune -o -type f -print 2>/dev/null | sort',
    ].join(' '),
  );

  return raw
    .split('\n')
    .map((line) => normalizeAgentPath(line))
    .filter((line): line is string => Boolean(line));
}

async function readProjectFile(
  dockerContainerId: string,
  relativePath: string,
): Promise<string | null> {
  const normalizedPath = normalizeAgentPath(relativePath);
  if (!normalizedPath) {
    return null;
  }

  const absolutePath = `${WORKSPACE_ROOT}/${normalizedPath}`;
  return execInContainer(dockerContainerId, `cat ${shellEscape(absolutePath)}`)
    .then((content) => content)
    .catch(() => null);
}

export const codexAgentRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const codex = new CodexAgentService();

  app.post(
    '/projects/:projectId/codex/respond',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!codex.isConfigured()) {
        return reply.serviceUnavailable(
          'Codex agent is not configured on the server. Set OPENAI_API_KEY first.',
        );
      }

      const user = request.user as { userId: string };
      const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
      const body = requestSchema.parse(request.body ?? {});

      const context = await resolveContext(user.userId, projectId, reply, access);
      if (!context) {
        return;
      }

      const availableFiles = await listProjectFiles(context.container.dockerContainerId);

      const result = await codex.respond({
        projectName: context.project.name,
        repoUrl: context.project.repoUrl,
        ...(body.activePath === undefined || body.activePath === null
          ? {}
          : { activePath: body.activePath }),
        messages: body.messages,
        openFiles: body.openFiles.map((file) =>
          file.dirty === undefined
            ? { path: file.path, content: file.content }
            : { path: file.path, content: file.content, dirty: file.dirty },
        ),
        availableFiles,
        readFile: async (path) => readProjectFile(context.container.dockerContainerId, path),
      });

      return result;
    },
  );
};
