export type PlanCode = 'free' | 'dev' | 'pro' | 'max' | 'enterprise';

export interface ResourcePool {
  ramMb: number;
  cpuMillicores: number;
  bandwidthGb: number;
}

export interface AllocationRequest {
  projectId: string;
  ramMb: number;
  cpuMillicores: number;
  bandwidthGb: number;
}

export type ServiceType = 'web_service' | 'static_site';

export type DeploymentEnvironment = 'production' | 'preview';

export interface DeploymentRequest {
  projectId: string;
  gitUrl: string;
  commitSha?: string;
  branch?: string;
  rootDirectory?: string;
  env: Record<string, string>;
  buildCommand?: string;
  startCommand?: string;
  port: number;
  environment?: DeploymentEnvironment;
  serviceType?: ServiceType;
  outputDirectory?: string;
}

export interface SchedulerCandidate {
  serverId: string;
  region: string;
  availableRamMb: number;
  availableCpuMillicores: number;
  activeContainers: number;
  healthScore: number;
}

export interface DeploymentResult {
  deploymentId: string;
  containerId: string;
  domain: string;
  status: 'queued' | 'building' | 'deploying' | 'ready' | 'failed';
  environment: DeploymentEnvironment;
}

export interface BillingOverage {
  cpuHours: number;
  ramGbHours: number;
  bandwidthGb: number;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'unpaid';
