import type { FastifyPluginAsync } from 'fastify';
import { spawn } from 'node:child_process';

import { z } from 'zod';

import { prisma } from '../lib/prisma.js';

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

const parseLogLines = (chunk: Buffer): string[] =>
  chunk
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const containerLogsWebsocketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ws/containers/:containerId/logs', { websocket: true }, (socket, request) => {
    const params = z.object({ containerId: z.string().cuid() }).safeParse(request.params);

    if (!params.success) {
      socket.close(1008, 'Invalid container id');
      return;
    }

    void (async () => {
      const token = resolveWebSocketToken(request);

      if (!token) {
        socket.close(1008, 'Authentication required');
        return;
      }

      let decoded: { userId: string; email: string };
      try {
        decoded = await app.jwt.verify<{ userId: string; email: string }>(token);
      } catch {
        socket.close(1008, 'Invalid token');
        return;
      }

      const container = await prisma.container.findUnique({
        where: { id: params.data.containerId },
        select: {
          id: true,
          dockerContainerId: true,
          status: true,
          project: {
            select: {
              id: true,
              organizationId: true,
              name: true,
            },
          },
        },
      });

      if (!container) {
        socket.close(1008, 'Container not found');
        return;
      }

      // Verify user has access to this project's organization
      const member = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: container.project.organizationId,
            userId: decoded.userId,
          },
        },
      });

      if (!member) {
        socket.close(1008, 'Access denied');
        return;
      }

      // Docker container IDs are hex strings. Enforce strict format before
      // passing into any host command to avoid command injection surfaces.
      if (!/^[a-f0-9]{12,64}$/i.test(container.dockerContainerId)) {
        socket.close(1011, 'Container reference is invalid');
        return;
      }

      // Send initial connection success
      socket.send(
        JSON.stringify({
          type: 'connected',
          containerId: container.id,
          projectName: container.project.name,
          status: container.status,
          timestamp: new Date().toISOString(),
        }),
      );

      // Stream logs with docker logs -f --tail 100
      const dockerLogsProcess = spawn(
        'docker',
        ['logs', '-f', '--tail', '100', container.dockerContainerId],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );

      if (!dockerLogsProcess.stdout) {
        socket.send(
          JSON.stringify({
            type: 'error',
            message: 'Failed to start log stream',
            timestamp: new Date().toISOString(),
          }),
        );
        socket.close(1011, 'Stream error');
        return;
      }

      dockerLogsProcess.stdout.on('data', (data: Buffer) => {
        const lines = parseLogLines(data);
        for (const line of lines) {
          if (socket.readyState === socket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'log',
                line,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        }
      });

      dockerLogsProcess.stderr?.on('data', (data: Buffer) => {
        const lines = parseLogLines(data);
        for (const line of lines) {
          if (socket.readyState === socket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'log',
                line,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        }
      });

      dockerLogsProcess.on('error', (error) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: error.message,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      });

      dockerLogsProcess.on('exit', (code) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'disconnected',
              message: `Log stream ended (exit code: ${code ?? 'unknown'})`,
              timestamp: new Date().toISOString(),
            }),
          );
          socket.close(1000, 'Stream ended');
        }
      });

      socket.on('close', () => {
        dockerLogsProcess.kill();
      });
    })().catch(() => {
      socket.close(1011, 'Internal server error');
    });
  });
};
