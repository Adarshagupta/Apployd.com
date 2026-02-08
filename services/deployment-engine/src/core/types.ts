import type { DeploymentEnvironment, DeploymentRequest } from '@apployd/shared';

export interface QueueDeploymentPayload {
  deploymentId: string;
  organizationId: string;
  projectId: string;
  environment: DeploymentEnvironment;
  request: DeploymentRequest;
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
