import type { DeploymentRequest } from '@apployd/shared';

import { redis } from '../lib/redis.js';

const DEPLOY_QUEUE = 'apployd:deployments:queue';
const CONTAINER_ACTION_QUEUE = 'apployd:container-actions:queue';

export class DeployQueueService {
  async enqueue(payload: {
    deploymentId: string;
    organizationId: string;
    projectId: string;
    request: DeploymentRequest;
  }): Promise<void> {
    await redis.rpush(DEPLOY_QUEUE, JSON.stringify(payload));
  }

  async publishEvent(payload: { deploymentId: string; type: string; message: string }): Promise<void> {
    await redis.publish(
      `apployd:deployments:${payload.deploymentId}`,
      JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  async enqueueContainerAction(payload: {
    action: 'sleep' | 'wake';
    containerId: string;
    dockerContainerId: string;
    deploymentId?: string;
  }): Promise<void> {
    await redis.rpush(CONTAINER_ACTION_QUEUE, JSON.stringify(payload));
  }

  async hasActiveWorkers(): Promise<boolean> {
    const keys = await redis.keys('apployd:engine:heartbeat:*');
    return keys.length > 0;
  }
}

export const deployQueueKey = DEPLOY_QUEUE;
export const containerActionQueueKey = CONTAINER_ACTION_QUEUE;
