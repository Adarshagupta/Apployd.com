export interface ServerSnapshot {
  id: string;
  region: string;
  totalRamMb: number;
  usedRamMb: number;
  totalCpuMillicores: number;
  usedCpuMillicores: number;
  totalBandwidthGb: number;
  usedBandwidthGb: number;
  healthScore: number;
}

export interface WorkloadRequest {
  ramMb: number;
  cpuMillicores: number;
  bandwidthGb: number;
  preferredRegion?: string;
}

export const pickBestServer = (
  servers: ServerSnapshot[],
  request: WorkloadRequest,
): ServerSnapshot => {
  const scored = servers
    .map((server) => {
      const availableRam = server.totalRamMb - server.usedRamMb;
      const availableCpu = server.totalCpuMillicores - server.usedCpuMillicores;
      const availableBandwidth = server.totalBandwidthGb - server.usedBandwidthGb;

      const fits =
        availableRam >= request.ramMb &&
        availableCpu >= request.cpuMillicores &&
        availableBandwidth >= request.bandwidthGb;

      const regionBonus = request.preferredRegion && server.region === request.preferredRegion ? 25 : 0;

      const score =
        (availableRam / server.totalRamMb) * 40 +
        (availableCpu / server.totalCpuMillicores) * 35 +
        (availableBandwidth / server.totalBandwidthGb) * 10 +
        server.healthScore * 0.15 +
        regionBonus;

      return {
        server,
        fits,
        score,
      };
    })
    .filter((candidate) => candidate.fits)
    .sort((a, b) => b.score - a.score);

  const selected = scored[0]?.server;

  if (!selected) {
    throw new Error('No server has enough capacity for this workload.');
  }

  return selected;
};
