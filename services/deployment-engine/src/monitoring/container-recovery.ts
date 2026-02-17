import { ContainerStatus, SleepStatus, type Prisma } from '@prisma/client';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { prisma } from '../core/prisma.js';

const INITIAL_DELAY_MS = 10_000;
const RECOVERY_INTERVAL_MS = 60_000;

interface RecoveryTarget {
  deploymentId: string;
  container: {
    id: string;
    dockerContainerId: string;
    hostPort: number;
    internalPort: number;
    projectId: string;
    status: ContainerStatus;
    sleepStatus: SleepStatus;
  };
}

interface RecoverySummary {
  scanned: number;
  policiesEnsured: number;
  restarted: number;
  markedCrashed: number;
  failures: number;
}

const loadRecoveryTargets = async (): Promise<RecoveryTarget[]> => {
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
              hostPort: true,
              internalPort: true,
              projectId: true,
              status: true,
              sleepStatus: true,
            },
          },
        },
      },
    },
    take: 5000,
  });

  return projects
    .map((project) => project.activeDeployment)
    .filter(
      (deployment): deployment is NonNullable<typeof deployment> =>
        Boolean(deployment && deployment.container),
    )
    .map((deployment) => ({
      deploymentId: deployment.id,
      container: deployment.container!,
    }));
};

const recordRecoveryLog = async (
  target: RecoveryTarget,
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, string | number | boolean | null>,
): Promise<void> => {
  await prisma.logEntry.create({
    data: {
      projectId: target.container.projectId,
      deploymentId: target.deploymentId,
      containerId: target.container.id,
      level,
      source: 'deployment-engine',
      message,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  }).catch(() => undefined);
};

const markContainerCrashed = async (
  target: RecoveryTarget,
  message: string,
  metadata?: Record<string, string | number | boolean | null>,
): Promise<boolean> => {
  const update = await prisma.container.updateMany({
    where: {
      id: target.container.id,
      status: { not: ContainerStatus.crashed },
    },
    data: {
      status: ContainerStatus.crashed,
      sleepStatus: SleepStatus.awake,
      stoppedAt: new Date(),
    },
  });

  if (update.count > 0) {
    await recordRecoveryLog(target, 'warn', message, metadata);
    return true;
  }

  return false;
};

const recoverActiveContainersOnce = async (): Promise<RecoverySummary> => {
  const docker = new DockerAdapter();
  const targets = await loadRecoveryTargets();

  const summary: RecoverySummary = {
    scanned: 0,
    policiesEnsured: 0,
    restarted: 0,
    markedCrashed: 0,
    failures: 0,
  };

  for (const target of targets) {
    summary.scanned += 1;

    try {
      await docker.setRestartPolicy(target.container.dockerContainerId, 'unless-stopped');
      summary.policiesEnsured += 1;
    } catch (error) {
      summary.failures += 1;
      console.warn(
        `Container recovery: failed to ensure restart policy for ${target.container.dockerContainerId}: ${(error as Error).message}`,
      );
    }

    const runtime = await docker.getContainerRuntimeState(target.container.dockerContainerId);
    if (!runtime) {
      const marked = await markContainerCrashed(
        target,
        'Active container missing from Docker runtime',
        { reason: 'container_missing' },
      );
      if (marked) {
        summary.markedCrashed += 1;
      }
      continue;
    }

    if (runtime.running) {
      if (
        target.container.status !== ContainerStatus.running ||
        target.container.sleepStatus !== SleepStatus.awake
      ) {
        await prisma.container.updateMany({
          where: { id: target.container.id },
          data: {
            status: ContainerStatus.running,
            sleepStatus: SleepStatus.awake,
            lastRequestAt: new Date(),
          },
        });
      }
      continue;
    }

    try {
      await docker.startContainer(target.container.dockerContainerId);
      const healthy = await docker.healthCheck(
        target.container.hostPort,
        target.container.internalPort,
        target.container.dockerContainerId,
      );

      if (healthy) {
        await prisma.container.updateMany({
          where: { id: target.container.id },
          data: {
            status: ContainerStatus.running,
            sleepStatus: SleepStatus.awake,
            startedAt: new Date(),
            lastRequestAt: new Date(),
          },
        });
        summary.restarted += 1;
        await recordRecoveryLog(target, 'info', 'Recovered active container after runtime stop', {
          previousStatus: runtime.status,
          exitCode: runtime.exitCode,
          restartCount: runtime.restartCount,
          oomKilled: runtime.oomKilled,
        });
      } else {
        const marked = await markContainerCrashed(
          target,
          'Container restart attempted but health check failed',
          {
            previousStatus: runtime.status,
            exitCode: runtime.exitCode,
            restartCount: runtime.restartCount,
            oomKilled: runtime.oomKilled,
          },
        );
        if (marked) {
          summary.markedCrashed += 1;
        }
        summary.failures += 1;
      }
    } catch (error) {
      const marked = await markContainerCrashed(
        target,
        'Container restart failed during automatic recovery',
        {
          previousStatus: runtime.status,
          exitCode: runtime.exitCode,
          restartCount: runtime.restartCount,
          oomKilled: runtime.oomKilled,
          error: (error as Error).message,
        },
      );
      if (marked) {
        summary.markedCrashed += 1;
      }
      summary.failures += 1;
    }
  }

  return summary;
};

export const startActiveContainerRecoveryLoop = (): void => {
  let running = false;

  const runCycle = async (source: 'initial' | 'interval') => {
    if (running) {
      return;
    }
    running = true;

    try {
      const summary = await recoverActiveContainersOnce();
      if (summary.restarted > 0 || summary.markedCrashed > 0 || summary.failures > 0) {
        console.log(
          `Container recovery (${source}): scanned=${summary.scanned}, policies=${summary.policiesEnsured}, restarted=${summary.restarted}, crashed=${summary.markedCrashed}, failures=${summary.failures}`,
        );
      }
    } catch (error) {
      console.error(`Container recovery (${source}) failed`, error);
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(() => {
    void runCycle('initial');
  }, INITIAL_DELAY_MS);
  initialTimer.unref();

  const timer = setInterval(() => {
    void runCycle('interval');
  }, RECOVERY_INTERVAL_MS);
  timer.unref();
};
