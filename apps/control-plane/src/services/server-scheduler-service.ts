import { ServerStatus, type Server } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

interface CapacityRequest {
  ramMb: number;
  cpuMillicores: number;
  bandwidthGb: number;
  region?: string;
}

type SchedulerErrorReason = 'no_healthy_servers' | 'insufficient_capacity';

interface SchedulerDiagnostics {
  requested: {
    ramMb: number;
    cpuMillicores: number;
    bandwidthGb: number;
  };
  preferredRegion: string | undefined;
  healthyServerCount: number;
  preferredRegionHealthyServerCount: number;
  largestAvailable: {
    ramMb: number;
    cpuMillicores: number;
    bandwidthGb: number;
  };
}

export class ServerSchedulingError extends Error {
  constructor(
    message: string,
    readonly reason: SchedulerErrorReason,
    readonly diagnostics: SchedulerDiagnostics,
  ) {
    super(message);
    this.name = 'ServerSchedulingError';
  }
}

export class ServerSchedulerService {
  async schedule(request: CapacityRequest): Promise<Server> {
    const healthyServers = await prisma.server.findMany({
      where: {
        status: ServerStatus.healthy,
      },
      orderBy: [{ region: 'asc' }, { createdAt: 'asc' }],
    });

    const preferredRegionServers =
      request.region === undefined
        ? healthyServers
        : healthyServers.filter((server) => server.region === request.region);

    const diagnostics: SchedulerDiagnostics = {
      requested: {
        ramMb: request.ramMb,
        cpuMillicores: request.cpuMillicores,
        bandwidthGb: request.bandwidthGb,
      },
      preferredRegion: request.region,
      healthyServerCount: healthyServers.length,
      preferredRegionHealthyServerCount: preferredRegionServers.length,
      largestAvailable: healthyServers.reduce(
        (currentLargest, server) => {
          const available = this.availableCapacity(server);
          return {
            ramMb: Math.max(currentLargest.ramMb, available.ramMb),
            cpuMillicores: Math.max(currentLargest.cpuMillicores, available.cpuMillicores),
            bandwidthGb: Math.max(currentLargest.bandwidthGb, available.bandwidthGb),
          };
        },
        {
          ramMb: 0,
          cpuMillicores: 0,
          bandwidthGb: 0,
        },
      ),
    };

    if (!healthyServers.length) {
      throw new ServerSchedulingError(
        'No healthy servers are registered. Add at least one healthy server to schedule deployments.',
        'no_healthy_servers',
        diagnostics,
      );
    }

    const preferredCandidate = this.pickCandidate(preferredRegionServers, request);
    if (preferredCandidate) {
      return preferredCandidate.server;
    }

    if (request.region) {
      const crossRegionCandidate = this.pickCandidate(healthyServers, request);
      if (crossRegionCandidate) {
        return crossRegionCandidate.server;
      }
    }

    throw new ServerSchedulingError(
      `No healthy servers with available capacity for ${request.ramMb}MB RAM, ${request.cpuMillicores}m CPU, ${request.bandwidthGb}GB bandwidth.`,
      'insufficient_capacity',
      diagnostics,
    );
  }

  private availableCapacity(server: Server): {
    ramMb: number;
    cpuMillicores: number;
    bandwidthGb: number;
  } {
    return {
      ramMb: server.totalRamMb - server.reservedRamMb,
      cpuMillicores: server.totalCpuMillicores - server.reservedCpuMillicores,
      bandwidthGb: server.totalBandwidthGb - server.reservedBandwidthGb,
    };
  }

  private pickCandidate(servers: Server[], request: CapacityRequest): { server: Server; score: number } | null {
    const ranked = servers
      .map((server) => {
        const available = this.availableCapacity(server);
        const hasCapacity =
          available.ramMb >= request.ramMb &&
          available.cpuMillicores >= request.cpuMillicores &&
          available.bandwidthGb >= request.bandwidthGb;

        return {
          server,
          hasCapacity,
          score: available.ramMb * 1.1 + available.cpuMillicores * 0.9 + available.bandwidthGb * 0.2,
        };
      })
      .filter((item) => item.hasCapacity)
      .sort((a, b) => b.score - a.score);

    return ranked[0] ?? null;
  }
}
