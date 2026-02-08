import { SubscriptionStatus, type Prisma } from '@prisma/client';

import { validateAllocationRules } from '../domain/resource-rules.js';
import { prisma } from '../lib/prisma.js';

type PolicyDbClient = Prisma.TransactionClient | typeof prisma;

export class ResourcePolicyService {
  async assertCanAllocate(
    organizationId: string,
    projectId: string,
    requested: { ramMb: number; cpuMillicores: number; bandwidthGb: number },
    db: PolicyDbClient = prisma,
  ): Promise<void> {
    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new Error('No active subscription found for organization.');
    }

    const usage = await db.project.aggregate({
      where: { organizationId },
      _sum: {
        resourceRamMb: true,
        resourceCpuMillicore: true,
        resourceBandwidthGb: true,
      },
    });

    const currentProject = await db.project.findUnique({
      where: { id: projectId },
      select: {
        resourceRamMb: true,
        resourceCpuMillicore: true,
        resourceBandwidthGb: true,
      },
    });

    if (!currentProject) {
      throw new Error('Project not found.');
    }

    validateAllocationRules(
      {
        poolRamMb: subscription.poolRamMb,
        poolCpuMillicores: subscription.poolCpuMillicores,
        poolBandwidthGb: subscription.poolBandwidthGb,
        currentlyAllocatedRamMb: usage._sum.resourceRamMb ?? 0,
        currentlyAllocatedCpuMillicores: usage._sum.resourceCpuMillicore ?? 0,
        currentlyAllocatedBandwidthGb: usage._sum.resourceBandwidthGb ?? 0,
        currentProjectRamMb: currentProject.resourceRamMb,
        currentProjectCpuMillicores: currentProject.resourceCpuMillicore,
        currentProjectBandwidthGb: currentProject.resourceBandwidthGb,
      },
      requested,
    );
  }
}
