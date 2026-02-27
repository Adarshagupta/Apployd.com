import { PlanCode } from '@prisma/client';

export interface PlanEntitlements {
  autoDeploy: boolean;
  previewDeployments: boolean;
  customDomains: boolean;
  managedDatabases: boolean;
}

const entitlementsByPlan: Record<PlanCode, PlanEntitlements> = {
  free: {
    autoDeploy: true,
    previewDeployments: false,
    customDomains: false,
    managedDatabases: false,
  },
  dev: {
    autoDeploy: true,
    previewDeployments: false,
    customDomains: true,
    managedDatabases: true,
  },
  pro: {
    autoDeploy: true,
    previewDeployments: true,
    customDomains: true,
    managedDatabases: true,
  },
  max: {
    autoDeploy: true,
    previewDeployments: true,
    customDomains: true,
    managedDatabases: true,
  },
  enterprise: {
    autoDeploy: true,
    previewDeployments: true,
    customDomains: true,
    managedDatabases: true,
  },
};

export const getPlanEntitlements = (planCode: PlanCode | string | null | undefined): PlanEntitlements => {
  if (!planCode) {
    return entitlementsByPlan.free;
  }

  const normalized = planCode.toString().trim().toLowerCase() as PlanCode;
  return entitlementsByPlan[normalized] ?? entitlementsByPlan.free;
};
