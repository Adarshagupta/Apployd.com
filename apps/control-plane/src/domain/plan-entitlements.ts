import { PlanCode } from '@prisma/client';

export interface PlanEntitlements {
  autoDeploy: boolean;
  previewDeployments: boolean;
  customDomains: boolean;
}

const entitlementsByPlan: Record<PlanCode, PlanEntitlements> = {
  free: {
    autoDeploy: false,
    previewDeployments: false,
    customDomains: false,
  },
  dev: {
    autoDeploy: true,
    previewDeployments: false,
    customDomains: true,
  },
  pro: {
    autoDeploy: true,
    previewDeployments: true,
    customDomains: true,
  },
  max: {
    autoDeploy: true,
    previewDeployments: true,
    customDomains: true,
  },
  enterprise: {
    autoDeploy: true,
    previewDeployments: true,
    customDomains: true,
  },
};

export const getPlanEntitlements = (planCode: PlanCode | string | null | undefined): PlanEntitlements => {
  if (!planCode) {
    return entitlementsByPlan.free;
  }

  const normalized = planCode.toString().trim().toLowerCase() as PlanCode;
  return entitlementsByPlan[normalized] ?? entitlementsByPlan.free;
};
