export interface PoolSnapshot {
  poolRamMb: number;
  poolCpuMillicores: number;
  poolBandwidthGb: number;
  currentlyAllocatedRamMb: number;
  currentlyAllocatedCpuMillicores: number;
  currentlyAllocatedBandwidthGb: number;
  currentProjectRamMb: number;
  currentProjectCpuMillicores: number;
  currentProjectBandwidthGb: number;
}

export interface RequestedAllocation {
  ramMb: number;
  cpuMillicores: number;
  bandwidthGb: number;
}

export const validateAllocationRules = (
  pool: PoolSnapshot,
  requested: RequestedAllocation,
): { ok: true } => {
  if (requested.ramMb > Math.floor(pool.poolRamMb * 0.5)) {
    throw new Error('A project cannot exceed 50% of RAM pool.');
  }
  if (requested.cpuMillicores > Math.floor(pool.poolCpuMillicores * 0.5)) {
    throw new Error('A project cannot exceed 50% of CPU pool.');
  }
  if (requested.bandwidthGb > Math.floor(pool.poolBandwidthGb * 0.5)) {
    throw new Error('A project cannot exceed 50% of bandwidth pool.');
  }

  const plannedRam =
    pool.currentlyAllocatedRamMb - pool.currentProjectRamMb + requested.ramMb;
  const plannedCpu =
    pool.currentlyAllocatedCpuMillicores -
    pool.currentProjectCpuMillicores +
    requested.cpuMillicores;
  const plannedBandwidth =
    pool.currentlyAllocatedBandwidthGb -
    pool.currentProjectBandwidthGb +
    requested.bandwidthGb;

  if (plannedRam > pool.poolRamMb) {
    throw new Error('RAM pool exceeded.');
  }
  if (plannedCpu > pool.poolCpuMillicores) {
    throw new Error('CPU pool exceeded.');
  }
  if (plannedBandwidth > pool.poolBandwidthGb) {
    throw new Error('Bandwidth pool exceeded.');
  }

  return { ok: true };
};
