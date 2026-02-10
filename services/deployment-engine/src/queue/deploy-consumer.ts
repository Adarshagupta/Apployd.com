import { Redis } from 'ioredis';
import { z } from 'zod';

import { env } from '../core/env.js';
import { prisma } from '../core/prisma.js';
import { redis } from '../core/redis.js';
import type { QueueDeploymentPayload } from '../core/types.js';
import { deploymentDurationHistogram, deploymentProcessedCounter } from '../monitoring/metrics.js';
import { DeploymentEmailNotifier } from '../notifications/deployment-email-notifier.js';
import { DeploymentPipeline } from '../pipeline/deployment-pipeline.js';

const payloadSchema = z.object({
  deploymentId: z.string().cuid(),
  organizationId: z.string().cuid(),
  projectId: z.string().cuid(),
  environment: z.enum(['production', 'preview']).default('production'),
  request: z.object({
    projectId: z.string().cuid(),
    gitUrl: z.string().url(),
    commitSha: z.string().optional(),
    branch: z.string().optional(),
    rootDirectory: z.string().optional(),
    env: z.record(z.string()),
    buildCommand: z.string().optional(),
    startCommand: z.string().optional(),
    port: z.number().int(),
    environment: z.enum(['production', 'preview']).optional(),
    serviceType: z.enum(['web_service', 'static_site', 'python']).optional(),
    outputDirectory: z.string().optional(),
  }).transform(req => {
    // Remove undefined values from optional fields for exactOptionalPropertyTypes compliance
    const result = { ...req } as any;
    Object.keys(result).forEach(key => {
      if (result[key] === undefined) {
        delete result[key];
      }
    });
    return result;
  }),
}).transform(payload => {
  // Ensure request doesn't have undefined values
  return {
    ...payload,
    request: Object.fromEntries(
      Object.entries(payload.request).filter(([, v]) => v !== undefined)
    ) as any,
  };
});

export class DeployQueueConsumer {
  private readonly queueKey = 'apployd:deployments:queue';

  // BLPOP must use a dedicated connection; otherwise it blocks heartbeat and event publishing.
  private readonly blockingRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableAutoPipelining: false,
  });

  private readonly pipeline = new DeploymentPipeline();

  private readonly emailNotifier = new DeploymentEmailNotifier();

  async run(): Promise<void> {
    while (true) {
      const item = await this.blockingRedis.blpop(this.queueKey, 0);
      if (!item || item.length < 2) {
        continue;
      }

      const raw = item[1];
      let payload: QueueDeploymentPayload;

      try {
        payload = payloadSchema.parse(JSON.parse(raw));
      } catch (error) {
        console.error('Invalid deployment payload', error);
        const parsedRaw = this.tryExtractRawPayload(raw);
        if (parsedRaw?.deploymentId && parsedRaw?.projectId) {
          await this.failDeployment(parsedRaw.deploymentId, parsedRaw.projectId, 'Invalid deployment payload');
        }
        deploymentProcessedCounter.inc({ status: 'invalid' });
        continue;
      }

      const stopTimer = deploymentDurationHistogram.startTimer();
      const lockKey = `apployd:deployments:lock:${payload.deploymentId}`;
      const lockAcquired = await redis.set(lockKey, '1', 'EX', 15 * 60, 'NX');

      if (!lockAcquired) {
        deploymentProcessedCounter.inc({ status: 'duplicate' });
        stopTimer();
        continue;
      }

      try {
        await this.pipeline.execute(payload);
        deploymentProcessedCounter.inc({ status: 'success' });
      } catch (error) {
        console.error('Deployment failed', payload.deploymentId, error);
        await this.failDeployment(payload.deploymentId, payload.projectId, this.toErrorMessage(error));
        deploymentProcessedCounter.inc({ status: 'failed' });
      } finally {
        stopTimer();
        await redis.del(lockKey);
      }
    }
  }

  private tryExtractRawPayload(raw: string): { deploymentId?: string; projectId?: string } | null {
    try {
      const parsed = JSON.parse(raw) as { deploymentId?: unknown; projectId?: unknown };
      return {
        ...(typeof parsed.deploymentId === 'string' && { deploymentId: parsed.deploymentId }),
        ...(typeof parsed.projectId === 'string' && { projectId: parsed.projectId }),
      };
    } catch {
      return null;
    }
  }

  private async failDeployment(deploymentId: string, projectId: string, message: string): Promise<void> {
    const updateResult = await prisma.deployment
      .updateMany({
        where: {
          id: deploymentId,
          status: { in: ['queued', 'building', 'deploying'] },
        },
        data: {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);

    if (!updateResult || updateResult.count === 0) {
      return;
    }

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        domain: true,
        environment: true,
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
      },
    });

    await prisma.logEntry
      .create({
        data: {
          projectId,
          deploymentId,
          level: 'error',
          source: 'deployment-engine',
          message,
          metadata: { eventType: 'failed' },
        },
      })
      .catch(() => undefined);

    await redis
      .publish(
        `apployd:deployments:${deploymentId}`,
        JSON.stringify({
          deploymentId,
          type: 'failed',
          message,
          timestamp: new Date().toISOString(),
        }),
      )
      .catch(() => undefined);

    if (deployment) {
      await this.emailNotifier.sendDeploymentStatusEmail({
        organizationId: deployment.project.organizationId,
        projectId: deployment.project.id,
        projectName: deployment.project.name,
        deploymentId: deployment.id,
        environment: deployment.environment as 'production' | 'preview',
        status: 'failed',
        domain: deployment.domain,
        errorMessage: message,
      }).catch((error) => {
        console.error('Failed to send deployment failure email', deploymentId, error);
      });
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Deployment failed';
  }
}
