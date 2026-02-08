import Redis from 'ioredis';
import { ContainerStatus, DeploymentStatus, SleepStatus } from '@prisma/client';
import { z } from 'zod';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { env } from '../core/env.js';
import { prisma } from '../core/prisma.js';
import { redis } from '../core/redis.js';

const actionSchema = z.object({
  action: z.enum(['sleep', 'wake']),
  containerId: z.string().cuid(),
  dockerContainerId: z.string().min(5),
  deploymentId: z.string().cuid().optional(),
});

export class ContainerActionConsumer {
  private readonly queueKey = 'apployd:container-actions:queue';

  // BLPOP must use a dedicated connection; otherwise it can block deployment queue processing.
  private readonly blockingRedis = new (Redis as any)(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableAutoPipelining: false,
  });

  private readonly docker = new DockerAdapter();

  async run(): Promise<void> {
    while (true) {
      const item = await this.blockingRedis.blpop(this.queueKey, 0);
      if (!item || item.length < 2) continue;

      const raw = item[1];
      let payload: z.infer<typeof actionSchema>;

      try {
        payload = actionSchema.parse(JSON.parse(raw));
      } catch (error) {
        console.error('Invalid container action payload', error);
        continue;
      }

      try {
        if (payload.action === 'sleep') {
          await this.handleSleep(payload);
        } else {
          await this.handleWake(payload);
        }
      } catch (error) {
        console.error('Container action failed', payload, error);
      }
    }
  }

  private async handleSleep(payload: z.infer<typeof actionSchema>): Promise<void> {
    await this.docker.stopContainer(payload.dockerContainerId);

    await prisma.container.updateMany({
      where: { id: payload.containerId },
      data: {
        status: ContainerStatus.sleeping,
        sleepStatus: SleepStatus.sleeping,
        stoppedAt: new Date(),
      },
    });

    const container = await prisma.container.findUnique({
      where: { id: payload.containerId },
      select: { projectId: true },
    });

    if (container) {
      await prisma.logEntry.create({
        data: {
          projectId: container.projectId,
          deploymentId: payload.deploymentId ?? null,
          containerId: payload.containerId,
          level: 'info',
          source: 'deployment-engine',
          message: 'Container moved to sleep state',
          metadata: { action: 'sleep' },
        },
      });
    }

    if (payload.deploymentId) {
      await redis.publish(
        `apployd:deployments:${payload.deploymentId}`,
        JSON.stringify({
          deploymentId: payload.deploymentId,
          type: 'sleeping',
          message: 'Container moved to sleep state',
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private async handleWake(payload: z.infer<typeof actionSchema>): Promise<void> {
    await this.docker.startContainer(payload.dockerContainerId);

    await prisma.container.updateMany({
      where: { id: payload.containerId },
      data: {
        status: ContainerStatus.running,
        sleepStatus: SleepStatus.awake,
        startedAt: new Date(),
        lastRequestAt: new Date(),
      },
    });

    const container = await prisma.container.findUnique({
      where: { id: payload.containerId },
      select: { projectId: true },
    });

    if (container) {
      await prisma.logEntry.create({
        data: {
          projectId: container.projectId,
          deploymentId: payload.deploymentId ?? null,
          containerId: payload.containerId,
          level: 'info',
          source: 'deployment-engine',
          message: 'Container woke successfully',
          metadata: { action: 'wake' },
        },
      });
    }

    if (payload.deploymentId) {
      await prisma.deployment.updateMany({
        where: { id: payload.deploymentId },
        data: {
          status: DeploymentStatus.ready,
        },
      });

      await redis.publish(
        `apployd:deployments:${payload.deploymentId}`,
        JSON.stringify({
          deploymentId: payload.deploymentId,
          type: 'ready',
          message: 'Container woke successfully',
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }
}
