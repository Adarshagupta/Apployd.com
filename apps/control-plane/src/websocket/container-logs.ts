import type { FastifyPluginAsync } from 'fastify';
import { exec } from 'node:child_process';

import { z } from 'zod';

import { prisma } from '../lib/prisma.js';

export const containerLogsWebsocketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ws/containers/:containerId/logs', { websocket: true }, (socket, request) => {
    const params = z.object({ containerId: z.string().cuid() }).safeParse(request.params);

    if (!params.success) {
      socket.close(1008, 'Invalid container id');
      return;
    }

    void (async () => {
      const query = z.object({ token: z.string().optional() }).parse(request.query ?? {});
      const authorizationHeader = request.headers.authorization;
      const bearerToken =
        typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')
          ? authorizationHeader.slice('Bearer '.length)
          : undefined;
      const token = query.token ?? bearerToken;

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
      const dockerLogsProcess = exec(
        `docker logs -f --tail 100 ${container.dockerContainerId} 2>&1`,
        { maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
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
        const lines = data.toString().split('\n').filter((line) => line.trim());
        for (const line of lines) {
          if (socket.readyState === socket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'log',
                line: line.trim(),
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
