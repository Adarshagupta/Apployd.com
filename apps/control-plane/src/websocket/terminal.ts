import type { FastifyPluginAsync } from 'fastify';
import { spawn } from 'node:child_process';

import { z } from 'zod';

import { prisma } from '../lib/prisma.js';

const decodeProtocolToken = (value: string): string | null => {
  const prefix = 'apployd-token.';
  if (!value.startsWith(prefix)) return null;
  const encoded = value.slice(prefix.length).trim();
  if (!encoded) return null;
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

const resolveWebSocketToken = (request: { headers: Record<string, unknown>; query?: unknown }): string | undefined => {
  const query = z.object({ token: z.string().optional() }).parse(request.query ?? {});
  if (query.token?.trim()) return query.token.trim();

  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }

  const proto = request.headers['sec-websocket-protocol'];
  if (typeof proto === 'string') {
    for (const p of proto.split(',').map((s) => s.trim())) {
      const t = decodeProtocolToken(p);
      if (t) return t;
    }
  }

  return undefined;
};

export const terminalWebsocketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ws/projects/:projectId/terminal', { websocket: true }, (socket, request) => {
    const params = z.object({ projectId: z.string().cuid() }).safeParse(request.params);

    if (!params.success) {
      socket.close(1008, 'Invalid project id');
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

      const container = await prisma.container.findFirst({
        where: {
          projectId: params.data.projectId,
          containerType: 'development',
          status: 'running',
        },
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
        orderBy: { createdAt: 'desc' },
      });

      if (!container) {
        socket.close(1008, 'Dev container not found or not running');
        return;
      }

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

      if (!/^[a-f0-9]{12,64}$/i.test(container.dockerContainerId)) {
        socket.close(1011, 'Container reference is invalid');
        return;
      }

      // Read initial terminal size from query
      const sizeQuery = z
        .object({
          cols: z.coerce.number().int().min(10).max(500).optional(),
          rows: z.coerce.number().int().min(5).max(200).optional(),
        })
        .parse(request.query ?? {});
      const cols = sizeQuery.cols ?? 80;
      const rows = sizeQuery.rows ?? 24;

      // Spawn docker exec with a PTY via script(1) / stty
      // We use 'docker exec -it' which allocates a pty inside the container
      const proc = spawn(
        'docker',
        [
          'exec',
          '-i',
          '-t',
          '-e', `TERM=xterm-256color`,
          '-e', `COLUMNS=${cols}`,
          '-e', `LINES=${rows}`,
          container.dockerContainerId,
          '/bin/bash',
          '--login',
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        },
      );

      socket.send(
        JSON.stringify({
          type: 'connected',
          projectName: container.project.name,
          timestamp: new Date().toISOString(),
        }),
      );

      // stdout/stderr → WebSocket (raw bytes as binary)
      proc.stdout?.on('data', (data: Buffer) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data);
        }
      });

      // WebSocket → stdin
      socket.on('message', (rawMsg: Buffer | string) => {
        // Control messages are JSON strings; raw input is binary/string
        if (typeof rawMsg === 'string') {
          try {
            const msg = JSON.parse(rawMsg) as Record<string, unknown>;
            if (msg.type === 'resize') {
              const newCols = Number(msg.cols) || 80;
              const newRows = Number(msg.rows) || 24;
              // Send SIGWINCH-compatible resize via stty
              proc.stdin?.write(`\x1b[8;${newRows};${newCols}t`);
            }
            return;
          } catch {
            // not JSON — treat as terminal input below
          }
          proc.stdin?.write(rawMsg);
        } else {
          proc.stdin?.write(rawMsg);
        }
      });

      proc.on('error', (err) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'error', message: err.message }));
          socket.close(1011, 'Process error');
        }
      });

      proc.on('exit', (code) => {
        if (socket.readyState === socket.OPEN) {
          socket.close(1000, `Shell exited (${code ?? 'unknown'})`);
        }
      });

      socket.on('close', () => {
        proc.kill();
      });
    })().catch(() => {
      socket.close(1011, 'Internal server error');
    });
  });
};
