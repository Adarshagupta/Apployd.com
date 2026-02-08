import type { DeploymentRequest } from '@apployd/shared';
import { createHash } from 'crypto';
import { ServerStatus, type Deployment, type Prisma, type Server } from '@prisma/client';
import { setTimeout as sleep } from 'timers/promises';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secrets.js';
import { isSerializableRetryableError } from '../lib/transaction-retry.js';
import { AuditLogService } from './audit-log-service.js';
import { DeployQueueService } from './deploy-queue-service.js';
import { ResourcePolicyService } from './resource-policy-service.js';
import { ServerSchedulerService, ServerSchedulingError } from './server-scheduler-service.js';

const MAX_CAPACITY_RESERVATION_ATTEMPTS = 5;

interface CapacityRequest {
  ramMb: number;
  cpuMillicores: number;
  bandwidthGb: number;
  region: string;
}

interface DeploymentRecordInput {
  projectId: string;
  serverId: string;
  environment: 'production' | 'preview';
  gitUrl: string;
  branch: string;
  commitSha: string | null;
  imageTag: string | null;
  domain: string;
  capacityReserved: boolean;
}

interface AtomicReservationInput {
  initialServer: Server | null;
  capacityRequest: CapacityRequest;
  deployment: Omit<DeploymentRecordInput, 'serverId'>;
}

class CapacityReservationContentionError extends Error {
  constructor() {
    super('Server capacity changed before reservation could be committed.');
    this.name = 'CapacityReservationContentionError';
  }
}

export class DeploymentRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'DeploymentRequestError';
  }
}

interface CreateDeploymentInput {
  projectId: string;
  actorUserId?: string;
  trigger: 'manual' | 'github_push';
  environment?: 'production' | 'preview';
  domain?: string;
  gitUrl?: string;
  branch?: string;
  commitSha?: string;
  rootDirectory?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  env?: Record<string, string>;
  idempotencyKey?: string;
  serviceType?: 'web_service' | 'static_site';
  outputDirectory?: string;
  /** For rollback: reuse an existing image without building */
  imageTag?: string;
}

export interface QueuedDeploymentResult {
  deploymentId: string;
  status: string;
  environment: 'production' | 'preview';
  domain: string | null;
  url: string | null;
  websocket: string;
  idempotentReplay?: boolean;
}

export class DeploymentRequestService {
  private readonly policy = new ResourcePolicyService();

  private readonly queue = new DeployQueueService();

  private readonly scheduler = new ServerSchedulerService();

  private readonly audit = new AuditLogService();

  async create(input: CreateDeploymentInput): Promise<QueuedDeploymentResult> {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      include: {
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['active', 'trialing'] } },
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!project) {
      throw new DeploymentRequestError('Project not found', 404);
    }

    const resolvedGitUrl = input.gitUrl ?? project.repoUrl ?? undefined;
    const resolvedBranch = input.branch ?? project.branch ?? 'main';
    const resolvedRootDirectory = input.rootDirectory ?? project.rootDirectory ?? undefined;
    const resolvedStartCommand = input.startCommand ?? project.startCommand ?? undefined;
    const resolvedBuildCommand = input.buildCommand ?? project.buildCommand ?? undefined;
    const resolvedPort = input.port ?? project.targetPort ?? 3000;
    const resolvedEnvironment = input.environment ?? 'production';
    const resolvedServiceType = input.serviceType ?? (project as any).serviceType ?? 'web_service';
    const resolvedOutputDirectory = input.outputDirectory ?? (project as any).outputDirectory ?? undefined;

    // Preview deployments get a unique subdomain; production gets the canonical domain
    const resolvedDomain = input.domain
      ?? (resolvedEnvironment === 'preview'
        ? buildPreviewDomain({
            projectSlug: project.slug,
            organizationSlug: project.organization.slug,
            baseDomain: env.PREVIEW_BASE_DOMAIN,
            ref: input.commitSha ?? input.branch ?? 'preview',
          })
        : `${sanitizeDomainLabel(project.slug, 'project')}.${sanitizeDomainLabel(project.organization.slug, 'org')}.${env.BASE_DOMAIN}`);

    if (!resolvedGitUrl) {
      throw new DeploymentRequestError(
        'Repository is not configured. Link a GitHub repository or provide gitUrl.',
        400,
      );
    }

    const activeSubscription = project.organization.subscriptions[0];
    if (!activeSubscription) {
      throw new DeploymentRequestError('No active subscription for this organization.', 402);
    }

    if (activeSubscription.currentPeriodEnd < new Date()) {
      throw new DeploymentRequestError('Subscription period has ended. Renew to deploy.', 402);
    }

    try {
      await this.policy.assertCanAllocate(project.organizationId, project.id, {
        ramMb: project.resourceRamMb,
        cpuMillicores: project.resourceCpuMillicore,
        bandwidthGb: project.resourceBandwidthGb,
      });
    } catch (error) {
      throw new DeploymentRequestError((error as Error).message, 409);
    }

    let idempotencyReservationAcquired = false;
    if (input.idempotencyKey) {
      const key = `apployd:idempotency:deploy:${project.id}:${input.idempotencyKey}`;
      const reserved = await redis.set(key, 'in_progress', 'NX', 'EX', 60 * 60);

      if (!reserved) {
        const existing = await redis.get(key);
        if (existing?.startsWith('dep:')) {
          const existingDeploymentId = existing.replace('dep:', '');
          const existingDeployment = await prisma.deployment.findUnique({
            where: { id: existingDeploymentId },
          });

          if (existingDeployment) {
            return {
              deploymentId: existingDeployment.id,
              status: existingDeployment.status,
              environment: existingDeployment.environment as 'production' | 'preview',
              domain: existingDeployment.domain,
              url: this.resolvePublicUrl(existingDeployment.domain),
              websocket: `${env.API_BASE_URL.replace('http', 'ws')}/ws/deployments/${existingDeployment.id}`,
              idempotentReplay: true,
            };
          }
        }

        throw new DeploymentRequestError(
          'A deployment request with this idempotency key is already in progress.',
          409,
        );
      }

      idempotencyReservationAcquired = true;
    }

    const capacityRequest: CapacityRequest = {
      ramMb: project.resourceRamMb,
      cpuMillicores: project.resourceCpuMillicore,
      bandwidthGb: project.resourceBandwidthGb,
      region: env.DEFAULT_REGION,
    };

    const activeContainer = await prisma.container.findFirst({
      where: {
        projectId: project.id,
        status: {
          in: ['pending', 'running', 'sleeping'],
        },
      },
      select: { id: true, serverId: true },
      orderBy: { updatedAt: 'desc' },
    });

    let reusableServer: Server | null = null;
    if (activeContainer) {
      const activeServer = await prisma.server.findUnique({
        where: { id: activeContainer.serverId },
      });
      if (activeServer?.status === ServerStatus.healthy) {
        reusableServer = activeServer;
      }
    }

    const workersAvailable = await this.queue.hasActiveWorkers();
    if (!workersAvailable) {
      if (input.idempotencyKey && idempotencyReservationAcquired) {
        await redis.del(`apployd:idempotency:deploy:${project.id}:${input.idempotencyKey}`);
      }
      throw new DeploymentRequestError(
        'Deployment workers are offline. Start the deployment-engine service and try again.',
        503,
      );
    }

    let server: Server;
    let deployment: Deployment;
    const reserveCapacity = !reusableServer || !activeContainer || reusableServer.id !== activeContainer.serverId;

    try {
      if (!reserveCapacity && reusableServer) {
        server = reusableServer;
        deployment = await prisma.deployment.create({
          data: this.buildDeploymentRecord({
            projectId: project.id,
            serverId: server.id,
            environment: resolvedEnvironment,
            gitUrl: resolvedGitUrl,
            branch: resolvedBranch,
            commitSha: input.commitSha ?? null,
            imageTag: input.imageTag ?? null,
            domain: resolvedDomain,
            capacityReserved: false,
          }),
        });
      } else {
        const reserved = await this.createDeploymentWithAtomicCapacityReservation({
          initialServer: reusableServer,
          capacityRequest,
          deployment: {
            projectId: project.id,
            environment: resolvedEnvironment,
            gitUrl: resolvedGitUrl,
            branch: resolvedBranch,
            commitSha: input.commitSha ?? null,
            imageTag: input.imageTag ?? null,
            domain: resolvedDomain,
            capacityReserved: true,
          },
        });
        server = reserved.server;
        deployment = reserved.deployment;
      }
    } catch (error) {
      if (input.idempotencyKey && idempotencyReservationAcquired) {
        await redis.del(`apployd:idempotency:deploy:${project.id}:${input.idempotencyKey}`);
      }

      if (error instanceof ServerSchedulingError) {
        if (error.reason === 'no_healthy_servers') {
          throw new DeploymentRequestError(
            `No healthy servers available for deployments in region ${env.DEFAULT_REGION}. Register a healthy server or enable AUTO_PROVISION_DEV_SERVER in local development.`,
            503,
          );
        }

        throw new DeploymentRequestError(
          `Insufficient server capacity in region ${env.DEFAULT_REGION}. Requested ${project.resourceRamMb}MB RAM, ${project.resourceCpuMillicore}m CPU, ${project.resourceBandwidthGb}GB bandwidth. Largest available right now: ${error.diagnostics.largestAvailable.ramMb}MB RAM, ${error.diagnostics.largestAvailable.cpuMillicores}m CPU, ${error.diagnostics.largestAvailable.bandwidthGb}GB bandwidth.`,
          503,
        );
      }

      if (error instanceof CapacityReservationContentionError) {
        throw new DeploymentRequestError(
          'Server capacity is currently contended. Retry this deployment request.',
          503,
        );
      }

      throw new DeploymentRequestError((error as Error).message, 503);
    }

    const projectSecrets = await prisma.projectSecret.findMany({
      where: { projectId: project.id },
      select: {
        key: true,
        encryptedValue: true,
        iv: true,
        authTag: true,
      },
    });

    const decryptedSecrets = projectSecrets.reduce<Record<string, string>>((acc, secret) => {
      acc[secret.key] = decryptSecret({
        encryptedValue: secret.encryptedValue,
        iv: secret.iv,
        authTag: secret.authTag,
      });
      return acc;
    }, {});

    const payload: DeploymentRequest = {
      projectId: project.id,
      gitUrl: resolvedGitUrl,
      branch: resolvedBranch,
      commitSha: input.commitSha,
      rootDirectory: resolvedRootDirectory,
      buildCommand: resolvedBuildCommand,
      startCommand: resolvedStartCommand,
      port: resolvedPort,
      env: { ...decryptedSecrets, ...(input.env ?? {}) },
      environment: resolvedEnvironment,
      serviceType: resolvedServiceType as 'web_service' | 'static_site',
      outputDirectory: resolvedOutputDirectory,
    };

    try {
      await prisma.logEntry.create({
        data: {
          projectId: project.id,
          deploymentId: deployment.id,
          level: 'info',
          source: 'control-plane',
          message: `Deployment queued (${input.trigger})`,
          metadata: {
            eventType: 'queued',
            trigger: input.trigger,
          },
        },
      });

      await this.queue.enqueue({
        deploymentId: deployment.id,
        organizationId: project.organizationId,
        projectId: project.id,
        environment: resolvedEnvironment,
        request: payload,
      });

      await this.queue.publishEvent({
        deploymentId: deployment.id,
        type: 'queued',
        message: `Deployment queued (${input.trigger})`,
      });
    } catch (error) {
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: 'failed',
          errorMessage: `Queueing failed: ${(error as Error).message}`,
          finishedAt: new Date(),
        },
      });

      if (deployment.capacityReserved) {
        await prisma.server.update({
          where: { id: server.id },
          data: {
            reservedRamMb: { decrement: project.resourceRamMb },
            reservedCpuMillicores: { decrement: project.resourceCpuMillicore },
            reservedBandwidthGb: { decrement: project.resourceBandwidthGb },
          },
        });
      }

      if (input.idempotencyKey && idempotencyReservationAcquired) {
        await redis.del(`apployd:idempotency:deploy:${project.id}:${input.idempotencyKey}`);
      }

      throw new DeploymentRequestError('Deployment queue is unavailable. Try again.', 503);
    }

    if (input.idempotencyKey) {
      await redis.set(
        `apployd:idempotency:deploy:${project.id}:${input.idempotencyKey}`,
        `dep:${deployment.id}`,
        'EX',
        60 * 60,
      );
    }

    await this.audit.record({
      organizationId: project.organizationId,
      actorUserId: input.actorUserId,
      action: input.trigger === 'github_push' ? 'deployment.created.github_push' : 'deployment.created',
      entityType: 'deployment',
      entityId: deployment.id,
      metadata: {
        projectId: project.id,
        serverId: server.id,
        domain: deployment.domain,
        branch: resolvedBranch,
      },
    });

    return {
      deploymentId: deployment.id,
      status: deployment.status,
      environment: resolvedEnvironment,
      domain: deployment.domain,
      url: this.resolvePublicUrl(deployment.domain),
      websocket: `${env.API_BASE_URL.replace('http', 'ws')}/ws/deployments/${deployment.id}`,
    };
  }

  private buildDeploymentRecord(input: DeploymentRecordInput): Prisma.DeploymentUncheckedCreateInput {
    return {
      projectId: input.projectId,
      serverId: input.serverId,
      status: 'queued',
      environment: input.environment,
      gitUrl: input.gitUrl,
      branch: input.branch,
      commitSha: input.commitSha,
      imageTag: input.imageTag,
      domain: input.domain,
      capacityReserved: input.capacityReserved,
    };
  }

  private async createDeploymentWithAtomicCapacityReservation(
    input: AtomicReservationInput,
  ): Promise<{ deployment: Deployment; server: Server }> {
    let candidateServer = input.initialServer;
    let attempt = 0;

    while (attempt < MAX_CAPACITY_RESERVATION_ATTEMPTS) {
      attempt += 1;

      if (!candidateServer) {
        candidateServer = await this.scheduler.schedule(input.capacityRequest);
      }

      const serverCandidate = candidateServer;
      if (!serverCandidate) {
        throw new CapacityReservationContentionError();
      }

      try {
        const deployment = await prisma.$transaction(async (tx) => {
          const reserved = await this.tryReserveServerCapacity(tx, serverCandidate.id, input.capacityRequest);
          if (!reserved) {
            throw new CapacityReservationContentionError();
          }

          return tx.deployment.create({
            data: this.buildDeploymentRecord({
              ...input.deployment,
              serverId: serverCandidate.id,
              capacityReserved: true,
            }),
          });
        });

        return { deployment, server: serverCandidate };
      } catch (error) {
        const retryable = error instanceof CapacityReservationContentionError
          || isSerializableRetryableError(error);
        if (!retryable || attempt >= MAX_CAPACITY_RESERVATION_ATTEMPTS) {
          throw error;
        }

        candidateServer = null;
        await sleep(15 * attempt);
      }
    }

    throw new CapacityReservationContentionError();
  }

  private async tryReserveServerCapacity(
    tx: Prisma.TransactionClient,
    serverId: string,
    request: CapacityRequest,
  ): Promise<boolean> {
    const updatedRows = await tx.$executeRaw`
      UPDATE "servers"
      SET
        "reservedRamMb" = "reservedRamMb" + ${request.ramMb},
        "reservedCpuMillicores" = "reservedCpuMillicores" + ${request.cpuMillicores},
        "reservedBandwidthGb" = "reservedBandwidthGb" + ${request.bandwidthGb}
      WHERE "id" = ${serverId}
        AND "status" = ${ServerStatus.healthy}
        AND "reservedRamMb" + ${request.ramMb} <= "totalRamMb"
        AND "reservedCpuMillicores" + ${request.cpuMillicores} <= "totalCpuMillicores"
        AND "reservedBandwidthGb" + ${request.bandwidthGb} <= "totalBandwidthGb"
    `;

    return Number(updatedRows) === 1;
  }

  private resolvePublicUrl(domain: string | null): string | null {
    if (!domain) {
      return null;
    }

    if (/\.(localhost)$/i.test(domain)) {
      return null;
    }

    if (/^https?:\/\//i.test(domain)) {
      return domain;
    }

    if (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(domain)) {
      return `http://${domain}`;
    }

    return `https://${domain}`;
  }
}

const sanitizeDomainLabel = (value: string, fallback: string): string => {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 63).replace(/-+$/g, '') || fallback;
};

const buildPreviewLabel = (projectSlug: string, ref: string): string => {
  const projectPart = sanitizeDomainLabel(projectSlug, 'project').slice(0, 24);
  const refPart = sanitizeDomainLabel(ref, 'preview').slice(0, 20);
  const suffix = createHash('sha1').update(ref).digest('hex').slice(0, 6);
  const label = `${projectPart}-${refPart}-${suffix}`;
  return sanitizeDomainLabel(label, 'preview');
};

const buildPreviewDomain = (input: {
  projectSlug: string;
  organizationSlug: string;
  baseDomain: string;
  ref: string;
}): string => {
  const previewLabel = buildPreviewLabel(input.projectSlug, input.ref);
  const organizationLabel = sanitizeDomainLabel(input.organizationSlug, 'org');
  return `${previewLabel}.${organizationLabel}.${input.baseDomain}`;
};
