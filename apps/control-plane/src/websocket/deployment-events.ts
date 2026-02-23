import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

const decodeProtocolToken = (value: string): string | null => {
  const prefix = 'apployd-token.';
  if (!value.startsWith(prefix)) {
    return null;
  }

  const encoded = value.slice(prefix.length).trim();
  if (!encoded) {
    return null;
  }

  try {
    return Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

const resolveWebSocketToken = (request: { headers: Record<string, unknown>; query?: unknown }): string | undefined => {
  const query = z.object({ token: z.string().optional() }).parse(request.query ?? {});
  const queryToken = query.token?.trim();
  if (queryToken) {
    return queryToken;
  }

  const authorizationHeader = request.headers.authorization;
  if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
    const bearerToken = authorizationHeader.slice('Bearer '.length).trim();
    if (bearerToken) {
      return bearerToken;
    }
  }

  const protocolHeader = request.headers['sec-websocket-protocol'];
  if (typeof protocolHeader === 'string') {
    const protocols = protocolHeader
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    for (const protocol of protocols) {
      const token = decodeProtocolToken(protocol);
      if (token) {
        return token;
      }
    }
  }

  return undefined;
};

const extractEventType = (metadata: unknown, fallback: string): string => {
  if (
    metadata &&
    typeof metadata === 'object' &&
    'eventType' in metadata &&
    typeof (metadata as { eventType?: unknown }).eventType === 'string'
  ) {
    return (metadata as { eventType: string }).eventType;
  }

  return fallback;
};

export const deploymentWebsocketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ws/deployments/:deploymentId', { websocket: true }, (socket, request) => {
    const params = z.object({ deploymentId: z.string().cuid() }).safeParse(request.params);

    if (!params.success) {
      socket.close(1008, 'Invalid deployment id');
      return;
    }

    void (async () => {
      const token = resolveWebSocketToken(request);

      if (!token) {
        socket.close(1008, 'Authentication required');
        return;
      }

      const decoded = await app.jwt.verify<{ userId: string; email: string }>(token);

      const deployment = await prisma.deployment.findUnique({
        where: { id: params.data.deploymentId },
        select: {
          id: true,
          status: true,
          domain: true,
          errorMessage: true,
          project: {
            select: {
              organizationId: true,
            },
          },
        },
      });

      if (!deployment) {
        socket.close(1008, 'Deployment not found');
        return;
      }

      const membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: deployment.project.organizationId,
            userId: decoded.userId,
          },
        },
      });

      if (!membership) {
        socket.close(1008, 'Forbidden');
        return;
      }

      socket.send(
        JSON.stringify({
          type: 'status',
          message:
            deployment.status === 'failed' && deployment.errorMessage
              ? `Current status: failed (${deployment.errorMessage})`
              : `Current status: ${deployment.status}`,
          deploymentId: params.data.deploymentId,
          status: deployment.status,
          domain: deployment.domain,
          timestamp: new Date().toISOString(),
        }),
      );

      const historicalLogs = await prisma.logEntry.findMany({
        where: { deploymentId: params.data.deploymentId },
        orderBy: { timestamp: 'asc' },
        take: 200,
      });

      for (const log of historicalLogs) {
        socket.send(
          JSON.stringify({
            deploymentId: params.data.deploymentId,
            type: extractEventType(log.metadata, log.level),
            message: log.message,
            source: log.source,
            timestamp: log.timestamp.toISOString(),
          }),
        );
      }

      const sub = redis.duplicate();
      const channel = `apployd:deployments:${params.data.deploymentId}`;

      sub
        .subscribe(channel)
        .then(() => {
          socket.send(
            JSON.stringify({
              type: 'subscribed',
              message: 'Connected to deployment stream',
              deploymentId: params.data.deploymentId,
              timestamp: new Date().toISOString(),
            }),
          );
        })
        .catch(() => {
          socket.close(1011, 'Failed to subscribe');
        });

      sub.on('message', (_receivedChannel: string, message: string) => {
        socket.send(message);
      });

      socket.on('close', async () => {
        await sub.unsubscribe(channel);
        sub.disconnect();
      });
    })().catch(() => {
      socket.close(1011, 'Failed to initialize stream');
    });
  });
};
