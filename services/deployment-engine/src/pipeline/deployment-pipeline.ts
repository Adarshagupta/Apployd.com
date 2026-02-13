import { ContainerStatus, DeploymentStatus, SleepStatus } from '@prisma/client';
import { createHash } from 'crypto';

import { CloudflareAdapter } from '../adapters/cloudflare-adapter.js';
import { DockerAdapter } from '../adapters/docker-adapter.js';
import { NginxAdapter } from '../adapters/nginx-adapter.js';
import { SslAdapter } from '../adapters/ssl-adapter.js';
import { env } from '../core/env.js';
import { prisma } from '../core/prisma.js';
import { redis } from '../core/redis.js';
import { withRetry } from '../core/retry.js';
import { DeploymentEmailNotifier } from '../notifications/deployment-email-notifier.js';
import type { QueueDeploymentPayload } from '../core/types.js';

const CANCEL_MESSAGE_FRAGMENT = 'canceled by user';

const isInProgressDeploymentStatus = (status: DeploymentStatus): boolean =>
  status === DeploymentStatus.queued ||
  status === DeploymentStatus.building ||
  status === DeploymentStatus.deploying;

class DeploymentCanceledError extends Error {
  constructor(message = 'Deployment canceled by user.') {
    super(message);
    this.name = 'DeploymentCanceledError';
  }
}

export class DeploymentPipeline {
  private readonly docker = new DockerAdapter();

  private readonly nginx = new NginxAdapter();

  private readonly ssl = new SslAdapter();

  private readonly cloudflare =
    env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID
      ? new CloudflareAdapter(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ZONE_ID)
      : null;

  private readonly emailNotifier = new DeploymentEmailNotifier();

  async execute(payload: QueueDeploymentPayload): Promise<void> {
    const deployment = await prisma.deployment.findUnique({
      where: { id: payload.deploymentId },
      include: {
        project: {
          include: {
            organization: true,
            customDomains: { where: { status: 'active' } },
          },
        },
        server: true,
      },
    });

    if (!deployment || !deployment.server) {
      throw new Error('Deployment or server missing');
    }

    if (deployment.status === DeploymentStatus.ready) {
      await this.publishEvent(payload.deploymentId, 'ready', 'Deployment already completed', deployment.projectId);
      return;
    }

    if (!isInProgressDeploymentStatus(deployment.status)) {
      await this.publishEvent(
        payload.deploymentId,
        'skipped',
        `Deployment ignored because status is ${deployment.status}`,
        deployment.projectId,
      );
      return;
    }

    const isPreview = payload.environment === 'preview';
    let startedDockerContainerId: string | null = null;
    let createdContainerId: string | null = null;

    try {
      await this.assertDeploymentCanContinue(payload.deploymentId);
      // ── Build ──────────────────────────────────────────────────
      await this.updateStatus(
        payload.deploymentId,
        DeploymentStatus.building,
        `Building ${isPreview ? 'preview' : 'production'} image`,
        deployment.projectId,
      );

      const onLog = (line: string) => {
        this.publishEvent(payload.deploymentId, 'log', line, deployment.projectId);
      };
      let deploymentCommit = payload.request.commitSha?.trim() || deployment.commitSha?.trim() || '';
      if (deploymentCommit) {
        onLog(`Deploy request commit: ${deploymentCommit}`);
      } else {
        const branchLabel = payload.request.branch?.trim() || 'default branch';
        onLog(`Deploy request branch: ${branchLabel} (commit resolved in build logs)`);
      }

      // If we already have an imageTag (rollback), skip the build
      let imageTag = deployment.imageTag ?? null;

      if (!imageTag) {
        const buildResult = await withRetry(
          () =>
            this.docker.buildImage(
              {
                deploymentId: payload.deploymentId,
                projectId: deployment.projectId,
                gitUrl: payload.request.gitUrl,
                branch: payload.request.branch ?? '',
                commitSha: deploymentCommit,
                ...(payload.request.rootDirectory && { rootDirectory: payload.request.rootDirectory }),
                ...(payload.request.buildCommand && { buildCommand: payload.request.buildCommand }),
                ...(payload.request.startCommand && { startCommand: payload.request.startCommand }),
                port: payload.request.port,
                ...(payload.request.serviceType && { serviceType: payload.request.serviceType }),
                ...(payload.request.outputDirectory && { outputDirectory: payload.request.outputDirectory }),
              },
              onLog,
            ),
          { retries: 2, delayMs: 2000 },
        );
        imageTag = buildResult.imageTag;
        if (!deploymentCommit && buildResult.sourceCommitSha) {
          deploymentCommit = buildResult.sourceCommitSha;
          onLog(`Deploy resolved commit: ${deploymentCommit}`);
        }

        await prisma.deployment.update({
          where: { id: payload.deploymentId },
          data: {
            imageTag,
            ...(deploymentCommit ? { commitSha: deploymentCommit } : {}),
          },
        });
      } else {
        onLog('Reusing existing image (rollback) — skipping build');
      }

      // ── Run container ──────────────────────────────────────────
      await this.assertDeploymentCanContinue(payload.deploymentId);
      await this.updateStatus(
        payload.deploymentId,
        DeploymentStatus.deploying,
        'Starting container',
        deployment.projectId,
      );

      onLog('Starting container...');
      const run = await withRetry(
        () =>
          this.docker.runContainer({
            imageTag: imageTag!,
            port: payload.request.port,
            env: payload.request.env,
            memoryMb: deployment.project.resourceRamMb,
            cpuMillicores: deployment.project.resourceCpuMillicore,
            deploymentId: payload.deploymentId,
          }),
        { retries: 1, delayMs: 1000 },
      );
      onLog(`Container started on port ${run.hostPort}`);
      startedDockerContainerId = run.dockerContainerId;
      await this.assertDeploymentCanContinue(payload.deploymentId);

      // ── Health check ───────────────────────────────────────────
      onLog('Running health check...');
      const healthy = await this.docker.healthCheck(
        run.hostPort,
        payload.request.port,
        run.dockerContainerId,
        onLog,
      );
      if (!healthy) {
        const stateSummary = await this.docker.getContainerStateSummary(run.dockerContainerId);
        if (stateSummary) {
          onLog(`Container state: ${stateSummary}`);
        }

        const logs = await this.docker.getContainerLogs(run.dockerContainerId, 40);
        onLog('── Container logs (last 40 lines) ──');
        const logLines = logs.split('\n').filter(Boolean);
        for (const line of logLines) {
          onLog(line);
        }

        // Extract the first real error line from container logs for a clearer failure message
        const errorLine = logLines.find(
          (l) => /^(Error:|TypeError:|ReferenceError:|SyntaxError:|\s+throw\s|\s+- property)/.test(l),
        );
        const hint = errorLine
          ? `Container crashed: ${errorLine.trim().slice(0, 200)}`
          : `Health check failed — app did not respond on container port ${payload.request.port} (host ${run.hostPort}) within ${env.ENGINE_HEALTHCHECK_TIMEOUT_SECONDS} s.`;

        throw new Error(
          `${hint} Check the container logs above for startup errors.`,
        );
      }

      await this.docker.setRestartPolicy(run.dockerContainerId, 'unless-stopped').catch((error) => {
        onLog(`Warning: failed to enable restart policy: ${(error as Error).message}`);
      });

      await this.assertDeploymentCanContinue(payload.deploymentId);

      // ── Domain resolution ──────────────────────────────────────
      const domain = env.ENGINE_LOCAL_MODE
        ? `localhost:${run.hostPort}`
        : deployment.domain ?? buildFallbackDomain({
            environment: payload.environment,
            projectSlug: deployment.project.slug,
            organizationSlug: deployment.project.organization.slug,
            ref: payload.request.commitSha ?? payload.request.branch ?? 'preview',
          });

      // Collect verified custom domain aliases for this project
      const customAliases = (deployment.project.customDomains ?? []).map((d: { domain: string }) => d.domain);

      // ── DNS + Reverse proxy + SSL ──────────────────────────────
      if (!env.ENGINE_LOCAL_MODE) {
        if (this.cloudflare) {
          onLog('Configuring DNS records...');
          await withRetry(
            () => this.cloudflare!.upsertARecord(domain, deployment.server!.ipv4),
            { retries: 2, delayMs: 1000 },
          );
          onLog('DNS configured');
        }

        onLog('Setting up reverse proxy...');
        await withRetry(
          () =>
            this.nginx.configureProjectProxy({
              domain,
              upstreamHost: '127.0.0.1',
              upstreamPort: run.hostPort,
              aliases: customAliases,
            }),
          { retries: 2, delayMs: 1000 },
        );
        onLog('Reverse proxy configured');

        onLog('Provisioning SSL certificate...');
        await withRetry(() => this.ssl.ensureCertificate(domain, customAliases), {
          retries: 1,
          delayMs: 3000,
        });
        onLog('SSL certificate ready');

        onLog('Verifying edge route...');
        const probe = await this.nginx.waitForRouteReady(
          domain,
          onLog,
          Math.min(45, env.ENGINE_HEALTHCHECK_TIMEOUT_SECONDS),
          'https',
        );
        const tlsReachable = probe.httpsStatus !== '000'
          && probe.httpsStatus !== '502'
          && probe.httpsStatus !== '503'
          && probe.httpsStatus !== '504';

        if (!tlsReachable) {
          throw new Error(
            `TLS route unhealthy after proxy/SSL setup (http=${probe.httpStatus}, https=${probe.httpsStatus}).`,
          );
        }

        onLog(`Edge route ready (http=${probe.httpStatus}, https=${probe.httpsStatus})`);
      }

      // ── Create container record ────────────────────────────────
      await this.assertDeploymentCanContinue(payload.deploymentId);
      const container = await prisma.container.create({
        data: {
          projectId: deployment.projectId,
          serverId: deployment.serverId!,
          dockerContainerId: run.dockerContainerId,
          imageTag: imageTag!,
          internalPort: payload.request.port,
          hostPort: run.hostPort,
          status: ContainerStatus.running,
          sleepStatus: deployment.project.sleepEnabled ? SleepStatus.awake : SleepStatus.awake,
          startedAt: new Date(),
          lastRequestAt: new Date(),
        },
      });

      // ── Capacity rebalancing ───────────────────────────────────
      // Only production deploys stop the old container.
      // Preview deploys run alongside production.
      const previousContainer = isPreview
        ? null
        : await prisma.container.findFirst({
            where: {
              projectId: deployment.projectId,
              id: { not: container.id },
              status: { in: [ContainerStatus.running, ContainerStatus.sleeping, ContainerStatus.pending] },
            },
            orderBy: { updatedAt: 'desc' },
          });

      if (previousContainer && previousContainer.serverId !== deployment.serverId) {
        if (deployment.capacityReserved) {
          await prisma.server.update({
            where: { id: previousContainer.serverId },
            data: {
              reservedRamMb: { decrement: deployment.project.resourceRamMb },
              reservedCpuMillicores: { decrement: deployment.project.resourceCpuMillicore },
              reservedBandwidthGb: { decrement: deployment.project.resourceBandwidthGb },
            },
          });
        } else {
          await prisma.$transaction([
            prisma.server.update({
              where: { id: deployment.serverId! },
              data: {
                reservedRamMb: { increment: deployment.project.resourceRamMb },
                reservedCpuMillicores: { increment: deployment.project.resourceCpuMillicore },
                reservedBandwidthGb: { increment: deployment.project.resourceBandwidthGb },
              },
            }),
            prisma.server.update({
              where: { id: previousContainer.serverId },
              data: {
                reservedRamMb: { decrement: deployment.project.resourceRamMb },
                reservedCpuMillicores: { decrement: deployment.project.resourceCpuMillicore },
                reservedBandwidthGb: { decrement: deployment.project.resourceBandwidthGb },
              },
            }),
          ]);
        }
      }

      // ── Mark deployment ready ──────────────────────────────────
      await prisma.deployment.update({
        where: { id: payload.deploymentId },
        data: {
          status: DeploymentStatus.ready,
          containerId: container.id,
          finishedAt: new Date(),
          domain,
        },
      });

      // ── Update activeDeploymentId (production only) ────────────
      if (!isPreview) {
        await prisma.project.update({
          where: { id: deployment.projectId },
          data: { activeDeploymentId: payload.deploymentId },
        });
      }

      // ── Stop previous container (production only) ──────────────
      if (previousContainer) {
        onLog('Stopping previous container...');
        await this.docker.stopContainer(previousContainer.dockerContainerId).catch(() => undefined);
        await prisma.container.update({
          where: { id: previousContainer.id },
          data: {
            status: ContainerStatus.stopped,
            sleepStatus: SleepStatus.sleeping,
            stoppedAt: new Date(),
          },
        });
      }

      const envLabel = isPreview ? '🔀 Preview' : '🚀 Production';
      const commitSuffix = deploymentCommit ? ` @ ${deploymentCommit.slice(0, 12)}` : '';
      await this.publishEvent(
        payload.deploymentId,
        'ready',
        `${envLabel} deployment${commitSuffix} ready at ${this.resolvePublicUrl(domain)}`,
        deployment.projectId,
      );

      await this.emailNotifier.sendDeploymentStatusEmail({
        organizationId: deployment.project.organizationId,
        projectId: deployment.projectId,
        projectName: deployment.project.name,
        deploymentId: payload.deploymentId,
        environment: payload.environment,
        status: 'ready',
        domain,
      }).catch((emailError) => {
        console.error('Failed to send deployment success email', payload.deploymentId, emailError);
      });
    } catch (error) {
      if (startedDockerContainerId) {
        await this.docker.stopContainer(startedDockerContainerId).catch(() => undefined);
      }

      await prisma.deployment.update({
        where: { id: payload.deploymentId },
        data: {
          status: DeploymentStatus.failed,
          errorMessage: (error as Error).message,
          finishedAt: new Date(),
        },
      });

      if (deployment.capacityReserved) {
        await prisma.server.update({
          where: { id: deployment.serverId! },
          data: {
            reservedRamMb: { decrement: deployment.project.resourceRamMb },
            reservedCpuMillicores: { decrement: deployment.project.resourceCpuMillicore },
            reservedBandwidthGb: { decrement: deployment.project.resourceBandwidthGb },
          },
        });
      }

      await this.publishEvent(payload.deploymentId, 'failed', (error as Error).message, deployment.projectId);

      await this.emailNotifier.sendDeploymentStatusEmail({
        organizationId: deployment.project.organizationId,
        projectId: deployment.projectId,
        projectName: deployment.project.name,
        deploymentId: payload.deploymentId,
        environment: payload.environment,
        status: 'failed',
        domain: deployment.domain,
        errorMessage: (error as Error).message,
      }).catch((emailError) => {
        console.error('Failed to send deployment failure email', payload.deploymentId, emailError);
      });
      throw error;
    }
  }

  private async updateStatus(
    deploymentId: string,
    status: DeploymentStatus,
    message: string,
    projectId?: string,
  ): Promise<void> {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status,
        ...(status === DeploymentStatus.building ? { startedAt: new Date() } : {}),
      },
    });

    await this.publishEvent(deploymentId, status, message, projectId);
  }

  private async publishEvent(
    deploymentId: string,
    type: string,
    message: string,
    projectId?: string,
  ): Promise<void> {
    // Only persist status-level events to the database, not individual build log lines
    if (projectId && type !== 'log') {
      await prisma.logEntry.create({
        data: {
          projectId,
          deploymentId,
          level: type === 'failed' ? 'error' : 'info',
          source: 'deployment-engine',
          message,
          metadata: { eventType: type },
        },
      }).catch(() => undefined);
    }

    await redis.publish(
      `apployd:deployments:${deploymentId}`,
      JSON.stringify({
        deploymentId,
        type,
        message,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  private async assertDeploymentCanContinue(deploymentId: string): Promise<void> {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        status: true,
        errorMessage: true,
      },
    });

    if (!deployment) {
      throw new Error('Deployment not found while processing queue item.');
    }

    if (isInProgressDeploymentStatus(deployment.status)) {
      return;
    }

    const message =
      deployment.errorMessage && deployment.errorMessage.trim().length > 0
        ? deployment.errorMessage
        : `Deployment cannot continue because status is ${deployment.status}.`;

    if (
      deployment.status === DeploymentStatus.failed &&
      message.toLowerCase().includes(CANCEL_MESSAGE_FRAGMENT)
    ) {
      throw new DeploymentCanceledError(message);
    }

    throw new Error(message);
  }

  private resolvePublicUrl(domain: string): string {
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
  return sanitizeDomainLabel(`${projectPart}-${refPart}-${suffix}`, 'preview');
};

const buildFallbackDomain = (input: {
  environment: 'production' | 'preview';
  projectSlug: string;
  organizationSlug: string;
  ref: string;
}): string => {
  const org = sanitizeDomainLabel(input.organizationSlug, 'org');
  if (input.environment === 'preview') {
    const projectLabel = sanitizeDomainLabel(input.projectSlug, 'project');
    if (env.PREVIEW_DOMAIN_STYLE === 'project') {
      return `${projectLabel}.${env.PREVIEW_BASE_DOMAIN}`;
    }

    const previewLabel = buildPreviewLabel(input.projectSlug, input.ref);
    return `${previewLabel}.${org}.${env.PREVIEW_BASE_DOMAIN}`;
  }

  const project = sanitizeDomainLabel(input.projectSlug, 'project');
  return `${project}.${org}.${env.BASE_DOMAIN}`;
};
