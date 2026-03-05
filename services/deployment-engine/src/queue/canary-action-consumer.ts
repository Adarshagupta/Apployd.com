import { Redis } from 'ioredis';
import { z } from 'zod';

import { CanaryReleaseService } from '../canary/canary-release-service.js';
import { env } from '../core/env.js';
import type { CanaryActionPayload } from '../core/types.js';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_percent'),
    deploymentId: z.string().cuid(),
    percent: z.number().int().min(1).max(99),
  }),
  z.object({
    action: z.literal('promote'),
    deploymentId: z.string().cuid(),
    stableDeploymentId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('abort'),
    deploymentId: z.string().cuid(),
    stableDeploymentId: z.string().cuid(),
  }),
]);

export class CanaryActionConsumer {
  private readonly queueKey = 'apployd:canary-actions:queue';

  private readonly blockingRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableAutoPipelining: false,
  });

  private readonly service = new CanaryReleaseService();

  async run(): Promise<void> {
    while (true) {
      const item = await this.blockingRedis.blpop(this.queueKey, 0);
      if (!item || item.length < 2) {
        continue;
      }

      const raw = item[1];
      let payload: CanaryActionPayload;

      try {
        payload = actionSchema.parse(JSON.parse(raw));
      } catch (error) {
        console.error('Invalid canary action payload', error);
        continue;
      }

      try {
        await this.service.execute(payload);
      } catch (error) {
        console.error('Canary action failed', payload, error);
        await this.service.reportFailure(payload, error);
      }
    }
  }
}
