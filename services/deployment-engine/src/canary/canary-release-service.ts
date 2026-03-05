import { ContainerStatus, DeploymentStatus, SleepStatus } from '@prisma/client';
import { createHash } from 'crypto';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { NginxAdapter } from '../adapters/nginx-adapter.js';
import { env } from '../core/env.js';
import { prisma } from '../core/prisma.js';
import { redis } from '../core/redis.js';
import { withRetry } from '../core/retry.js';
import type { CanaryActionPayload } from '../core/types.js';

const isReachableHttpStatus = (status: string): boolean =>
  status !== '000' && status !== '502' && status !== '503' && status !== '504';

export class CanaryReleaseService {
  private readonly docker = new DockerAdapter();

  private readonly nginx = new NginxAdapter();

  async execute(payload: CanaryActionPayload): Promise<void> {
    if (payload.action === 'set_percent') {
      await this.handleSetPercent(payload.deploymentId, payload.percent);
      return;
    }

    if (payload.action === 'promote') {
      await this.handlePromote(payload.deploymentId, payload.stableDeploymentId);
      return;
    }

    await this.handleAbort(payload.deploymentId, payload.stableDeploymentId);
  }

  async reportFailure(payload: CanaryActionPayload, error: unknown): Promise<void> {
    const message = error instanceof Error && error.message ? error.message : 'Canary action failed';
    const deployment = await prisma.deployment.findUnique({
      where: { id: payload.deploymentId },
      select: {
        projectId: true,
      },
    });

    if (deployment) {
      await prisma.logEntry.create({
        data: {
          projectId: deployment.projectId,
          deploymentId: payload.deploymentId,
          level: 'error',
          source: 'deployment-engine',
          message,
          metadata: {
            eventType: 'canary_action_failed',
            action: payload.action,
          },
        },
      }).catch(() => undefined);
    }

    await redis.publish(
      `apployd:deployments:${payload.deploymentId}`,
      JSON.stringify({
        deploymentId: payload.deploymentId,
        type: 'canary_action_failed',
        message,
        timestamp: new Date().toISOString(),
      }),
    ).catch(() => undefined);
  }

  private async handleSetPercent(canaryDeploymentId: string, percent: number): Promise<void> {
    const context = await this.loadActiveCanaryContext(canaryDeploymentId);
    this.assertWeightedRoutingContext(context);

    await this.applyWeightedRouting({
      domain: context.domain,
      routeAliases: context.routeAliases,
      attackModeEnabled: context.project.attackModeEnabled,
      stablePort: context.stableDeployment.container.hostPort,
      canaryPort: context.canaryDeployment.container.hostPort,
      canaryWeight: percent,
      wakePath: `/api/v1/edge/deployments/${canaryDeploymentId}/wake`,
    });

    await prisma.project.update({
      where: { id: context.project.id },
      data: { canaryPercent: percent },
    });

    await this.publishEvent(
      canaryDeploymentId,
      'canary_percent_updated',
      `Canary traffic updated to ${percent}%.`,
      context.project.id,
      { action: 'set_percent', percent },
    );
  }

  private async handlePromote(canaryDeploymentId: string, stableDeploymentId: string): Promise<void> {
    const context = await this.loadActiveCanaryContext(canaryDeploymentId, stableDeploymentId);
    this.assertDirectPromotionContext(context);

    await this.applyDirectRouting({
      domain: context.domain,
      routeAliases: context.routeAliases,
      attackModeEnabled: context.project.attackModeEnabled,
      upstreamPort: context.canaryDeployment.container.hostPort,
      wakePath: `/api/v1/edge/deployments/${canaryDeploymentId}/wake`,
    });

    if (context.stableDeployment.container?.dockerContainerId) {
      await this.docker.stopContainer(context.stableDeployment.container.dockerContainerId).catch(() => undefined);
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.project.update({
        where: { id: context.project.id },
        data: {
          activeDeploymentId: canaryDeploymentId,
          canaryDeploymentId: null,
          canaryPercent: 0,
        },
      }),
      prisma.deployment.update({
        where: { id: canaryDeploymentId },
        data: {
          isCanary: false,
          canaryPromotedAt: now,
        },
      }),
      prisma.container.updateMany({
        where: { id: context.stableDeployment.container.id },
        data: {
          status: ContainerStatus.stopped,
          sleepStatus: SleepStatus.sleeping,
          stoppedAt: now,
        },
      }),
    ]);

    await this.publishEvent(
      canaryDeploymentId,
      'canary_promoted',
      'Canary promoted to 100%. The new deployment is now fully live.',
      context.project.id,
      { action: 'promote', previousActiveDeploymentId: stableDeploymentId },
    );
  }

  private async handleAbort(canaryDeploymentId: string, stableDeploymentId: string): Promise<void> {
    const context = await this.loadActiveCanaryContext(canaryDeploymentId, stableDeploymentId);
    this.assertDirectAbortContext(context);

    await this.applyDirectRouting({
      domain: context.domain,
      routeAliases: context.routeAliases,
      attackModeEnabled: context.project.attackModeEnabled,
      upstreamPort: context.stableDeployment.container.hostPort,
      wakePath: `/api/v1/edge/deployments/${stableDeploymentId}/wake`,
    });

    if (context.canaryDeployment.container?.dockerContainerId) {
      await this.docker.stopContainer(context.canaryDeployment.container.dockerContainerId).catch(() => undefined);
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.project.update({
        where: { id: context.project.id },
        data: {
          canaryDeploymentId: null,
          canaryPercent: 0,
        },
      }),
      prisma.deployment.update({
        where: { id: canaryDeploymentId },
        data: {
          status: DeploymentStatus.rolled_back,
          finishedAt: now,
        },
      }),
      prisma.container.updateMany({
        where: { id: context.canaryDeployment.container.id },
        data: {
          status: ContainerStatus.stopped,
          sleepStatus: SleepStatus.sleeping,
          stoppedAt: now,
        },
      }),
    ]);

    await this.publishEvent(
      canaryDeploymentId,
      'canary_aborted',
      'Canary aborted. All traffic is now routed back to the stable deployment.',
      context.project.id,
      { action: 'abort', restoredDeploymentId: stableDeploymentId },
    );
  }

  private async loadActiveCanaryContext(canaryDeploymentId: string, stableDeploymentId?: string) {
    const canaryDeployment = await prisma.deployment.findUnique({
      where: { id: canaryDeploymentId },
      select: {
        id: true,
        projectId: true,
        status: true,
        isCanary: true,
        environment: true,
        domain: true,
        branch: true,
        commitSha: true,
        container: {
          select: {
            id: true,
            hostPort: true,
            status: true,
            dockerContainerId: true,
            serverId: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            organizationId: true,
            attackModeEnabled: true,
            activeDeploymentId: true,
            canaryDeploymentId: true,
            organization: {
              select: {
                slug: true,
              },
            },
            customDomains: {
              where: { status: 'active' },
              select: { domain: true },
            },
          },
        },
      },
    });

    if (!canaryDeployment) {
      throw new Error('Canary deployment not found.');
    }

    if (canaryDeployment.environment !== 'production') {
      throw new Error('Canary actions are only supported for production deployments.');
    }

    if (!canaryDeployment.isCanary || canaryDeployment.project.canaryDeploymentId !== canaryDeployment.id) {
      throw new Error('Deployment is not an active canary.');
    }

    const resolvedStableDeploymentId = stableDeploymentId ?? canaryDeployment.project.activeDeploymentId;
    if (!resolvedStableDeploymentId) {
      throw new Error('Stable deployment is not recorded for this project.');
    }

    const stableDeployment = await prisma.deployment.findUnique({
      where: { id: resolvedStableDeploymentId },
      select: {
        id: true,
        status: true,
        domain: true,
        container: {
          select: {
            id: true,
            hostPort: true,
            status: true,
            dockerContainerId: true,
            serverId: true,
          },
        },
      },
    });

    if (!stableDeployment) {
      throw new Error('Stable deployment not found.');
    }

    const domain = canaryDeployment.domain
      ?? stableDeployment.domain
      ?? buildUniqueProjectDomain({
        projectSlug: canaryDeployment.project.slug,
        organizationSlug: canaryDeployment.project.organization.slug,
        baseDomain: env.BASE_DOMAIN,
      });

    const routeAliases = resolveProductionRouteAliases({
      primaryDomain: domain,
      projectSlug: canaryDeployment.project.slug,
      organizationSlug: canaryDeployment.project.organization.slug,
      customDomains: canaryDeployment.project.customDomains.map((item) => item.domain),
    });

    return {
      project: canaryDeployment.project,
      canaryDeployment,
      stableDeployment,
      domain,
      routeAliases,
    };
  }

  private assertWeightedRoutingContext(context: Awaited<ReturnType<CanaryReleaseService['loadActiveCanaryContext']>>): asserts context is Awaited<ReturnType<CanaryReleaseService['loadActiveCanaryContext']>> & {
    canaryDeployment: {
      container: {
        id: string;
        hostPort: number;
        status: ContainerStatus;
        dockerContainerId: string;
        serverId: string;
      };
    };
    stableDeployment: {
      container: {
        id: string;
        hostPort: number;
        status: ContainerStatus;
        dockerContainerId: string;
        serverId: string;
      };
    };
  } {
    if (!context.canaryDeployment.container || context.canaryDeployment.container.status !== ContainerStatus.running) {
      throw new Error('Canary container is not running.');
    }
    if (!context.stableDeployment.container || context.stableDeployment.container.status !== ContainerStatus.running) {
      throw new Error('Stable container is not running.');
    }
    if (context.canaryDeployment.container.serverId !== context.stableDeployment.container.serverId) {
      throw new Error('Canary and stable containers must be on the same server for weighted routing.');
    }
  }

  private assertDirectPromotionContext(context: Awaited<ReturnType<CanaryReleaseService['loadActiveCanaryContext']>>): asserts context is Awaited<ReturnType<CanaryReleaseService['loadActiveCanaryContext']>> & {
    canaryDeployment: {
      container: {
        id: string;
        hostPort: number;
        status: ContainerStatus;
        dockerContainerId: string;
        serverId: string;
      };
      status: DeploymentStatus;
    };
    stableDeployment: {
      container: {
        id: string;
        hostPort: number;
        status: ContainerStatus;
        dockerContainerId: string;
        serverId: string;
      };
    };
  } {
    if (context.canaryDeployment.status !== DeploymentStatus.ready) {
      throw new Error('Only a ready canary can be promoted.');
    }
    if (!context.canaryDeployment.container || context.canaryDeployment.container.status !== ContainerStatus.running) {
      throw new Error('Canary container is not running.');
    }
    if (!context.stableDeployment.container) {
      throw new Error('Stable deployment has no container record.');
    }
  }

  private assertDirectAbortContext(context: Awaited<ReturnType<CanaryReleaseService['loadActiveCanaryContext']>>): asserts context is Awaited<ReturnType<CanaryReleaseService['loadActiveCanaryContext']>> & {
    canaryDeployment: {
      container: {
        id: string;
        hostPort: number;
        status: ContainerStatus;
        dockerContainerId: string;
        serverId: string;
      };
    };
    stableDeployment: {
      container: {
        id: string;
        hostPort: number;
        status: ContainerStatus;
        dockerContainerId: string;
        serverId: string;
      };
    };
  } {
    if (!context.canaryDeployment.container) {
      throw new Error('Canary deployment has no container record.');
    }
    if (!context.stableDeployment.container || context.stableDeployment.container.status !== ContainerStatus.running) {
      throw new Error('Stable container is not running.');
    }
  }

  private async applyWeightedRouting(input: {
    domain: string;
    routeAliases: string[];
    attackModeEnabled: boolean;
    stablePort: number;
    canaryPort: number;
    canaryWeight: number;
    wakePath: string;
  }): Promise<void> {
    if (env.ENGINE_LOCAL_MODE) {
      return;
    }

    const upstreamScheme = await this.resolveUpstreamScheme(input.canaryPort);
    await withRetry(
      () =>
        this.nginx.configureWeightedProjectProxyWithTls({
          domain: input.domain,
          certificateDomain: input.domain,
          stableUpstreamHost: '127.0.0.1',
          stableUpstreamPort: input.stablePort,
          canaryUpstreamHost: '127.0.0.1',
          canaryUpstreamPort: input.canaryPort,
          upstreamScheme,
          attackModeEnabled: input.attackModeEnabled,
          aliases: input.routeAliases,
          wakePath: input.wakePath,
          canaryWeight: input.canaryWeight,
        }),
      { retries: 2, delayMs: 1000 },
    );

    await this.verifyRouteReady(input.domain);
  }

  private async applyDirectRouting(input: {
    domain: string;
    routeAliases: string[];
    attackModeEnabled: boolean;
    upstreamPort: number;
    wakePath: string;
  }): Promise<void> {
    if (env.ENGINE_LOCAL_MODE) {
      return;
    }

    const upstreamScheme = await this.resolveUpstreamScheme(input.upstreamPort);
    await withRetry(
      () =>
        this.nginx.configureProjectProxyWithTls({
          domain: input.domain,
          certificateDomain: input.domain,
          upstreamHost: '127.0.0.1',
          upstreamPort: input.upstreamPort,
          upstreamScheme,
          attackModeEnabled: input.attackModeEnabled,
          aliases: input.routeAliases,
          wakePath: input.wakePath,
        }),
      { retries: 2, delayMs: 1000 },
    );

    await this.verifyRouteReady(input.domain);
  }

  private async resolveUpstreamScheme(upstreamPort: number): Promise<'http' | 'https'> {
    const upstream = await this.nginx.waitForUpstreamReachable(
      '127.0.0.1',
      upstreamPort,
      undefined,
      Math.min(15, env.ENGINE_HEALTHCHECK_TIMEOUT_SECONDS),
    );

    const httpReachable = isReachableHttpStatus(upstream.httpStatus);
    const httpsReachable = isReachableHttpStatus(upstream.httpsStatus);

    if (!httpReachable && !httpsReachable && !upstream.tcpReachable) {
      throw new Error(`Upstream is unreachable on 127.0.0.1:${upstreamPort}.`);
    }

    return httpsReachable && !httpReachable ? 'https' : 'http';
  }

  private async verifyRouteReady(domain: string): Promise<void> {
    const probe = await this.nginx.waitForRouteReady(
      domain,
      undefined,
      Math.min(45, env.ENGINE_HEALTHCHECK_TIMEOUT_SECONDS),
      'https',
    );

    if (!isReachableHttpStatus(probe.httpsStatus)) {
      throw new Error(`Route unhealthy after Nginx reconfiguration (http=${probe.httpStatus}, https=${probe.httpsStatus}).`);
    }
  }

  private async publishEvent(
    deploymentId: string,
    type: string,
    message: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await prisma.logEntry.create({
      data: {
        projectId,
        deploymentId,
        level: type.includes('failed') ? 'error' : 'info',
        source: 'deployment-engine',
        message,
        metadata: {
          eventType: type,
          ...(metadata ?? {}),
        },
      },
    }).catch(() => undefined);

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

const normalizeHostname = (value: string): string =>
  value.trim().toLowerCase().replace(/\.$/, '');

const hostnameFromUrl = (value: string): string | null => {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
};

const maybeAddCompanionWww = (host: string, target: Set<string>): void => {
  if (!host || host.includes(':')) {
    return;
  }

  if (host.startsWith('www.')) {
    const apex = host.slice(4);
    if (apex) {
      target.add(apex);
    }
    return;
  }

  const labels = host.split('.');
  if (labels.length === 2) {
    target.add(`www.${host}`);
  }
};

const buildProtectedPlatformDomains = (): Set<string> => {
  const protectedDomains = new Set<string>();
  const addHost = (value?: string | null): void => {
    if (!value) {
      return;
    }
    const normalized = normalizeHostname(value);
    if (!normalized) {
      return;
    }
    protectedDomains.add(normalized);
    maybeAddCompanionWww(normalized, protectedDomains);
  };

  addHost(env.BASE_DOMAIN);
  addHost(env.PREVIEW_BASE_DOMAIN);
  addHost(hostnameFromUrl(env.DASHBOARD_BASE_URL));

  return protectedDomains;
};

const buildLegacyProjectDomain = (input: {
  projectSlug: string;
  organizationSlug: string;
  baseDomain: string;
}): string => {
  const project = sanitizeDomainLabel(input.projectSlug, 'project');
  const org = sanitizeDomainLabel(input.organizationSlug, 'org');
  return `${project}.${org}.${input.baseDomain}`;
};

const buildUniqueProjectLabel = (projectSlug: string, organizationSlug: string): string => {
  const projectPart = sanitizeDomainLabel(projectSlug, 'project').slice(0, 28);
  const orgPart = sanitizeDomainLabel(organizationSlug, 'org').slice(0, 18);
  const suffix = createHash('sha1')
    .update(`${projectSlug}:${organizationSlug}`)
    .digest('hex')
    .slice(0, 6);

  return sanitizeDomainLabel(`${projectPart}-${orgPart}-${suffix}`, 'project');
};

const buildUniqueProjectDomain = (input: {
  projectSlug: string;
  organizationSlug: string;
  baseDomain: string;
}): string => {
  const label = buildUniqueProjectLabel(input.projectSlug, input.organizationSlug);
  return `${label}.${input.baseDomain}`;
};

const resolveProductionRouteAliases = (input: {
  primaryDomain: string;
  projectSlug: string;
  organizationSlug: string;
  customDomains: string[];
}): string[] => {
  const protectedDomains = buildProtectedPlatformDomains();
  const legacyDomain = buildLegacyProjectDomain({
    projectSlug: input.projectSlug,
    organizationSlug: input.organizationSlug,
    baseDomain: env.BASE_DOMAIN,
  });
  const uniqueDomain = buildUniqueProjectDomain({
    projectSlug: input.projectSlug,
    organizationSlug: input.organizationSlug,
    baseDomain: env.BASE_DOMAIN,
  });

  return Array.from(new Set([legacyDomain, uniqueDomain, ...input.customDomains]))
    .filter((domain) => domain !== input.primaryDomain)
    .filter((domain) => !protectedDomains.has(normalizeHostname(domain)));
};
