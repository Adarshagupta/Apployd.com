import type { FastifyPluginAsync } from 'fastify';
import { ContainerStatus, SleepStatus } from '@prisma/client';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { DeployQueueService } from '../../services/deploy-queue-service.js';

const wakeParamsSchema = z.object({
  deploymentId: z.string().cuid(),
});

const getHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return typeof value === 'string' ? value : '';
};

const sanitizeOriginalUri = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) {
    return '/';
  }
  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return '/';
  }
  return trimmed;
};

const wantsHtml = (acceptHeader: string): boolean => {
  const accept = acceptHeader.toLowerCase();
  return accept.includes('text/html') || accept.includes('*/*');
};

const isNavigationRequest = (headers: Record<string, string | string[] | undefined>): boolean => {
  const mode = getHeaderValue(headers['sec-fetch-mode']).toLowerCase();
  const dest = getHeaderValue(headers['sec-fetch-dest']).toLowerCase();
  if (!mode && !dest) {
    return true;
  }
  return mode === 'navigate' || dest === 'document';
};

const renderWakePage = (targetPath: string, retryAfterSeconds: number): string => {
  const safeTargetPath = JSON.stringify(targetPath);
  const safeRetryMs = Math.max(1000, retryAfterSeconds * 1000);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="${retryAfterSeconds}" />
  <title>Waking up service</title>
  <style>
    :root { color-scheme: light; }
    html, body { margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: min(560px, 100%); border: 1px solid #e2e8f0; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07); }
    .row { display: flex; align-items: center; gap: 12px; }
    .dot { width: 12px; height: 12px; border-radius: 9999px; background: #0f172a; animation: pulse 1.2s infinite ease-in-out; }
    @keyframes pulse { 0%, 100% { opacity: 0.25; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1); } }
    h1 { margin: 0; font-size: 20px; line-height: 1.3; }
    p { margin: 10px 0 0; color: #334155; line-height: 1.5; }
    .meta { margin-top: 14px; font-size: 13px; color: #64748b; }
    .btn { margin-top: 18px; display: inline-block; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 12px; font-size: 13px; color: #0f172a; text-decoration: none; background: #fff; }
    .btn:hover { background: #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrap">
    <main class="card">
      <div class="row">
        <span class="dot" aria-hidden="true"></span>
        <h1>Waking up this service</h1>
      </div>
      <p>This app was sleeping due to inactivity. We started it now. This usually takes 5-20 seconds.</p>
      <p class="meta">This page auto-refreshes until the app is ready.</p>
      <a class="btn" href="${targetPath}">Try again now</a>
    </main>
  </div>
  <script>
    setTimeout(function () {
      window.location.replace(${safeTargetPath});
    }, ${safeRetryMs});
  </script>
</body>
</html>`;
};

export const edgeRoutes: FastifyPluginAsync = async (app) => {
  const queue = new DeployQueueService();

  app.all('/api/v1/edge/deployments/:deploymentId/wake', async (request, reply) => {
    if (env.EDGE_WAKE_TOKEN) {
      const incomingToken = getHeaderValue(request.headers['x-apployd-edge-token']);
      if (incomingToken !== env.EDGE_WAKE_TOKEN) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    }

    const { deploymentId } = wakeParamsSchema.parse(request.params);
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        projectId: true,
        container: {
          select: {
            id: true,
            dockerContainerId: true,
            status: true,
            sleepStatus: true,
          },
        },
      },
    });

    if (!deployment?.container) {
      return reply.code(503).send({ error: 'Unavailable', message: 'No container is attached to this deployment.' });
    }

    const now = new Date();
    let wakeQueued = false;
    let state: 'already_awake' | 'waking' | 'wake_queued' = 'already_awake';

    const isSleeping =
      deployment.container.sleepStatus === SleepStatus.sleeping ||
      deployment.container.status === ContainerStatus.sleeping;
    if (isSleeping) {
      const transitioned = await prisma.container.updateMany({
        where: {
          id: deployment.container.id,
          sleepStatus: SleepStatus.sleeping,
        },
        data: {
          sleepStatus: SleepStatus.waking,
        },
      });

      if (transitioned.count > 0) {
        wakeQueued = true;
        state = 'wake_queued';
        await queue.enqueueContainerAction({
          action: 'wake',
          containerId: deployment.container.id,
          dockerContainerId: deployment.container.dockerContainerId,
          deploymentId: deployment.id,
        });
        await queue.publishEvent({
          deploymentId: deployment.id,
          type: 'waking',
          message: 'Container wake-up initiated by edge request',
        });
        await prisma.logEntry
          .create({
            data: {
              projectId: deployment.projectId,
              deploymentId: deployment.id,
              containerId: deployment.container.id,
              level: 'info',
              source: 'control-plane',
              message: 'Container wake-up initiated by edge request',
              metadata: {
                trigger: 'edge-request',
              },
            },
          })
          .catch(() => undefined);
      } else {
        state = 'waking';
      }
    } else if (deployment.container.sleepStatus === SleepStatus.waking) {
      state = 'waking';
    }

    await prisma.container
      .updateMany({
        where: { id: deployment.container.id },
        data: { lastRequestAt: now },
      })
      .catch(() => undefined);

    const retryAfterSeconds = env.EDGE_WAKE_RETRY_SECONDS;
    const originalMethod = getHeaderValue(request.headers['x-apployd-original-method']) || request.method;
    const targetPath = sanitizeOriginalUri(getHeaderValue(request.headers['x-apployd-original-uri']) || '/');

    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .header('Retry-After', String(retryAfterSeconds));

    if (originalMethod.toUpperCase() === 'HEAD') {
      return reply.code(503).send();
    }

    const acceptHeader = getHeaderValue(request.headers.accept);
    if (
      originalMethod.toUpperCase() !== 'GET' ||
      !wantsHtml(acceptHeader) ||
      !isNavigationRequest(request.headers)
    ) {
      return reply.code(503).send({
        status: 'warming',
        state,
        wakeQueued,
        retryAfterSeconds,
      });
    }

    return reply
      .code(503)
      .type('text/html; charset=utf-8')
      .send(renderWakePage(targetPath, retryAfterSeconds));
  });
};
