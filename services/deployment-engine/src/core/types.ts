import type { DeploymentEnvironment, DeploymentRequest } from '@apployd/shared';

export interface QueueDeploymentPayload {
  deploymentId: string;
  organizationId: string;
  projectId: string;
  environment: DeploymentEnvironment;
  request: DeploymentRequest;
  /**
   * When true, this deployment is a canary (gradual) release.
   * The pipeline will keep the old container running and configure Nginx
   * with a weighted upstream split instead of doing a hard cutover.
   */
  isCanary?: boolean;
  /**
   * Percentage of traffic (1–99) to send to the canary container.
   * Only relevant when `isCanary` is true.
   */
  canaryWeight?: number;
  /**
   * Host port of the currently active (stable) container on this server.
   * Required for weighted Nginx upstream when `isCanary` is true.
   */
  stableContainerHostPort?: number;
}

export interface PipelineContext {
  payload: QueueDeploymentPayload;
  serverId: string;
  deploymentDomain: string;
  imageTag?: string;
  dockerContainerId?: string;
  containerRecordId?: string;
  hostPort?: number;
}

export type CanaryActionPayload =
  | {
    action: 'set_percent';
    deploymentId: string;
    percent: number;
  }
  | {
    action: 'promote' | 'abort';
    deploymentId: string;
    stableDeploymentId: string;
  };
