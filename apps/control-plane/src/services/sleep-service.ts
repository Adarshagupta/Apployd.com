import { ContainerStatus, SleepStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { DeployQueueService } from './deploy-queue-service.js';

export class SleepService {
  async markIdleFreeTierContainersSleeping(now = new Date()): Promise<number> {
    const queue = new DeployQueueService();

    const candidates = await prisma.container.findMany({
      where: {
        status: ContainerStatus.running,
        sleepStatus: SleepStatus.awake,
        project: {
          sleepEnabled: true,
          organization: {
            subscriptions: {
              some: {
                plan: { code: 'free' },
                status: 'active',
              },
            },
          },
        },
      },
      select: {
        id: true,
        dockerContainerId: true,
        lastRequestAt: true,
        startedAt: true,
        createdAt: true,
        project: {
          select: {
            sleepAfterSeconds: true,
          },
        },
      },
      take: 500,
    });

    if (!candidates.length) {
      return 0;
    }

    const idleIds = candidates
      .filter((container) => {
        const sleepAfterSeconds = Math.max(60, container.project.sleepAfterSeconds || 900);
        const idleSince = container.lastRequestAt ?? container.startedAt ?? container.createdAt;
        return now.getTime() - idleSince.getTime() >= sleepAfterSeconds * 1000;
      })
      .map((container) => container.id);

    if (!idleIds.length) {
      return 0;
    }
    const idleSet = new Set(idleIds);

    await prisma.container.updateMany({
      where: { id: { in: idleIds } },
      data: {
        status: ContainerStatus.sleeping,
        sleepStatus: SleepStatus.sleeping,
        stoppedAt: now,
      },
    });

    await Promise.all(
      candidates
        .filter((container) => idleSet.has(container.id))
        .map((container) =>
          queue.enqueueContainerAction({
            action: 'sleep',
            containerId: container.id,
            dockerContainerId: container.dockerContainerId,
          }),
        ),
    );

    return idleIds.length;
  }

  async markContainerWakeInProgress(containerId: string): Promise<{ dockerContainerId: string }> {
    const current = await prisma.container.findUnique({
      where: { id: containerId },
      select: { dockerContainerId: true },
    });

    if (!current) {
      throw new Error('Container not found');
    }

    await prisma.container.update({
      where: { id: containerId },
      data: {
        sleepStatus: SleepStatus.waking,
      },
    });

    return { dockerContainerId: current.dockerContainerId };
  }
}
