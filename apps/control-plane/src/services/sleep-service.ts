import { ContainerStatus, SleepStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { DeployQueueService } from './deploy-queue-service.js';

export class SleepService {
  async markIdleFreeTierContainersSleeping(now = new Date()): Promise<number> {
    void now;
    // Sleep mode is globally disabled: containers should remain active.
    return 0;
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

  async wakeSleepingActiveContainers(): Promise<number> {
    const projects = await prisma.project.findMany({
      where: {
        activeDeploymentId: { not: null },
      },
      select: {
        activeDeployment: {
          select: {
            id: true,
            container: {
              select: {
                id: true,
                dockerContainerId: true,
                status: true,
                sleepStatus: true,
              },
            },
          },
        },
      },
      take: 1000,
    });

    const targets = projects
      .map((project) => project.activeDeployment)
      .filter((deployment): deployment is NonNullable<typeof deployment> => Boolean(deployment))
      .map((deployment) => ({
        deploymentId: deployment.id,
        container: deployment.container,
      }))
      .filter(
        (entry): entry is { deploymentId: string; container: NonNullable<typeof entry.container> } =>
          Boolean(entry.container),
      )
      .filter(
        ({ container }) =>
          container.status === ContainerStatus.sleeping ||
          container.sleepStatus === SleepStatus.sleeping ||
          container.sleepStatus === SleepStatus.waking,
      );

    if (!targets.length) {
      return 0;
    }

    const queue = new DeployQueueService();
    await Promise.all(
      targets.map(async ({ deploymentId, container }) => {
        await prisma.container.updateMany({
          where: { id: container.id },
          data: {
            sleepStatus: SleepStatus.waking,
          },
        });

        await queue.enqueueContainerAction({
          action: 'wake',
          containerId: container.id,
          dockerContainerId: container.dockerContainerId,
          deploymentId,
        });
      }),
    );

    return targets.length;
  }
}
