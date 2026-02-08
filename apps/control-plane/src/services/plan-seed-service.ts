import { PlanCode } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const defaults: Record<PlanCode, { name: string; ramMb: number; cpu: number; bandwidth: number; price: string; sleepBypass: boolean; maxProjects: number | null }> = {
  free: { name: 'Free', ramMb: 512, cpu: 500, bandwidth: 50, price: '0.00', sleepBypass: false, maxProjects: null },
  dev: { name: 'Dev', ramMb: 2048, cpu: 1500, bandwidth: 250, price: '5.00', sleepBypass: true, maxProjects: null },
  pro: { name: 'Pro', ramMb: 6144, cpu: 4000, bandwidth: 1000, price: '12.00', sleepBypass: true, maxProjects: null },
  max: { name: 'Max', ramMb: 12288, cpu: 8000, bandwidth: 2500, price: '25.00', sleepBypass: true, maxProjects: null },
  enterprise: { name: 'Enterprise', ramMb: 32768, cpu: 16000, bandwidth: 10000, price: '100.00', sleepBypass: true, maxProjects: null },
};

export const seedPlans = async (): Promise<void> => {
  await Promise.all(
    (Object.keys(defaults) as PlanCode[]).map(async (code) => {
      const plan = defaults[code];
      await prisma.plan.upsert({
        where: { code },
        update: {
          displayName: plan.name,
          priceUsdMonthly: plan.price,
          includedRamMb: plan.ramMb,
          includedCpuMillicore: plan.cpu,
          includedBandwidthGb: plan.bandwidth,
          allowsSleepBypass: plan.sleepBypass,
          maxProjects: plan.maxProjects,
        },
        create: {
          code,
          displayName: plan.name,
          priceUsdMonthly: plan.price,
          includedRamMb: plan.ramMb,
          includedCpuMillicore: plan.cpu,
          includedBandwidthGb: plan.bandwidth,
          allowsSleepBypass: plan.sleepBypass,
          maxProjects: plan.maxProjects,
        },
      });
    }),
  );
};
