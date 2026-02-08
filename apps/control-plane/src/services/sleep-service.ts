import { ContainerStatus, SleepStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { DeployQueueService } from './deploy-queue-service.js';

export class SleepService {
  async markIdleFreeTierContainersSleeping(now = new Date()): Promise<number> {
    const idleCutoff = new Date(now.getTime() - 15 * 60 * 1000);

    const queue = new DeployQueueService();

    const candidates = await prisma.container.findMany({
      where: {
        status: ContainerStatus.running,
        sleepStatus: SleepStatus.awake,
        lastRequestAt: { lt: idleCutoff },
        project: {
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
      select: { id: true, dockerContainerId: true },
      take: 200,
    });

    if (!candidates.length) {
      return 0;
    }

    const ids = candidates.map((container) => container.id);

    await prisma.container.updateMany({
      where: { id: { in: ids } },
      data: {
        status: ContainerStatus.sleeping,
        sleepStatus: SleepStatus.sleeping,
        stoppedAt: now,
      },
    });

    await Promise.all(
      candidates.map((container) =>
        queue.enqueueContainerAction({
          action: 'sleep',
          containerId: container.id,
          dockerContainerId: container.dockerContainerId,
        }),
      ),
    );

    return ids.length;
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
