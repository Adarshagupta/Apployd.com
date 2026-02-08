import { ServerStatus } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export interface DevServerBootstrapResult {
  ensured: boolean;
  serverName?: string;
  reason?: string;
}

export const ensureDevelopmentServer = async (): Promise<DevServerBootstrapResult> => {
  if (!env.AUTO_PROVISION_DEV_SERVER) {
    return {
      ensured: false,
      reason: 'AUTO_PROVISION_DEV_SERVER is disabled.',
    };
  }

  const healthyServerCount = await prisma.server.count({
    where: {
      status: ServerStatus.healthy,
    },
  });

  if (healthyServerCount > 0) {
    return {
      ensured: false,
      reason: 'Healthy server already available.',
    };
  }

  const existingByName = await prisma.server.findUnique({
    where: { name: env.DEV_SERVER_NAME },
    select: { id: true },
  });

  if (existingByName) {
    await prisma.server.update({
      where: { id: existingByName.id },
      data: {
        status: ServerStatus.healthy,
        region: env.DEFAULT_REGION,
        ipv4: env.DEV_SERVER_IPV4,
        totalRamMb: env.DEV_SERVER_TOTAL_RAM_MB,
        totalCpuMillicores: env.DEV_SERVER_TOTAL_CPU_MILLICORES,
        totalBandwidthGb: env.DEV_SERVER_TOTAL_BANDWIDTH_GB,
      },
    });

    return {
      ensured: true,
      serverName: env.DEV_SERVER_NAME,
    };
  }

  await prisma.server.create({
    data: {
      name: env.DEV_SERVER_NAME,
      region: env.DEFAULT_REGION,
      ipv4: env.DEV_SERVER_IPV4,
      status: ServerStatus.healthy,
      totalRamMb: env.DEV_SERVER_TOTAL_RAM_MB,
      totalCpuMillicores: env.DEV_SERVER_TOTAL_CPU_MILLICORES,
      totalBandwidthGb: env.DEV_SERVER_TOTAL_BANDWIDTH_GB,
    },
  });

  return {
    ensured: true,
    serverName: env.DEV_SERVER_NAME,
  };
};
