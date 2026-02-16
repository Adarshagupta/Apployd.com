import { prisma } from '../lib/prisma.js';

const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = 30;
const MIN_BASELINE_MINUTES = 15;
const MAX_BASELINE_MINUTES = 24 * 60;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toSafeNumber = (value: bigint): number => {
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > maxSafe) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (value < -maxSafe) {
    return -Number.MAX_SAFE_INTEGER;
  }
  return Number(value);
};

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

export interface ProjectAnomalyTarget {
  id: string;
  name: string;
  slug: string;
  attackModeEnabled: boolean;
}

export interface ProjectAnomalyReport {
  projectId: string;
  projectName: string;
  projectSlug: string;
  attackModeEnabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  ddosSuspected: boolean;
  abuseSuspected: boolean;
  recommendAttackMode: boolean;
  signals: string[];
  metrics: {
    currentWindowMinutes: number;
    baselineWindowMinutes: number;
    currentBandwidthBytes: string;
    baselineBandwidthBytesAvg: string;
    bandwidthSpikeRatio: number;
    currentBandwidthMbps: number;
    currentCpuMillicoreSeconds: string;
    baselineCpuMillicoreSecondsAvg: string;
    cpuSpikeRatio: number;
    currentCpuMillicoresAverage: number;
  };
}

export class AnomalyDetectionService {
  async detectProjectAnomalies(input: {
    organizationId: string;
    projects: ProjectAnomalyTarget[];
    windowMinutes?: number;
    baselineMinutes?: number;
    now?: Date;
  }): Promise<{
    generatedAt: string;
    windowMinutes: number;
    baselineMinutes: number;
    projects: ProjectAnomalyReport[];
  }> {
    const windowMinutes = clampNumber(
      Math.trunc(input.windowMinutes ?? 5),
      MIN_WINDOW_MINUTES,
      MAX_WINDOW_MINUTES,
    );
    const rawBaselineMinutes = clampNumber(
      Math.trunc(input.baselineMinutes ?? 120),
      MIN_BASELINE_MINUTES,
      MAX_BASELINE_MINUTES,
    );

    const baselineMinutes = Math.max(rawBaselineMinutes, windowMinutes * 6);

    if (input.projects.length === 0) {
      return {
        generatedAt: (input.now ?? new Date()).toISOString(),
        windowMinutes,
        baselineMinutes,
        projects: [],
      };
    }

    const projectIds = input.projects.map((project) => project.id);
    const now = input.now ?? new Date();
    const nowMs = now.getTime();
    const windowMs = windowMinutes * 60 * 1000;
    const baselineWindowCount = Math.max(1, Math.floor(baselineMinutes / windowMinutes));
    const currentStartMs = nowMs - windowMs;
    const baselineStartMs = currentStartMs - (baselineWindowCount * windowMs);
    const rangeStart = new Date(baselineStartMs);

    const records = await prisma.usageRecord.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: { in: projectIds },
        metricType: { in: ['cpu_millicore_seconds', 'bandwidth_bytes'] },
        recordedAt: {
          gte: rangeStart,
          lte: now,
        },
      },
      select: {
        projectId: true,
        metricType: true,
        quantity: true,
        recordedAt: true,
      },
    });

    const bucketsByProject = new Map<
      string,
      {
        currentCpuMillicoreSeconds: bigint;
        currentBandwidthBytes: bigint;
        baselineCpuMillicoreSeconds: bigint[];
        baselineBandwidthBytes: bigint[];
      }
    >();

    for (const project of input.projects) {
      bucketsByProject.set(project.id, {
        currentCpuMillicoreSeconds: 0n,
        currentBandwidthBytes: 0n,
        baselineCpuMillicoreSeconds: Array.from({ length: baselineWindowCount }, () => 0n),
        baselineBandwidthBytes: Array.from({ length: baselineWindowCount }, () => 0n),
      });
    }

    for (const record of records) {
      const projectId = record.projectId;
      if (!projectId) {
        continue;
      }

      const bucket = bucketsByProject.get(projectId);
      if (!bucket) {
        continue;
      }

      const recordedAtMs = record.recordedAt.getTime();
      if (recordedAtMs >= currentStartMs) {
        if (record.metricType === 'cpu_millicore_seconds') {
          bucket.currentCpuMillicoreSeconds += record.quantity;
        } else if (record.metricType === 'bandwidth_bytes') {
          bucket.currentBandwidthBytes += record.quantity;
        }
        continue;
      }

      const baselineIndex = Math.floor((recordedAtMs - baselineStartMs) / windowMs);
      if (baselineIndex < 0 || baselineIndex >= baselineWindowCount) {
        continue;
      }

      if (record.metricType === 'cpu_millicore_seconds') {
        const current = bucket.baselineCpuMillicoreSeconds[baselineIndex] ?? 0n;
        bucket.baselineCpuMillicoreSeconds[baselineIndex] = current + record.quantity;
      } else if (record.metricType === 'bandwidth_bytes') {
        const current = bucket.baselineBandwidthBytes[baselineIndex] ?? 0n;
        bucket.baselineBandwidthBytes[baselineIndex] = current + record.quantity;
      }
    }

    const windowSeconds = windowMinutes * 60;

    const reports: ProjectAnomalyReport[] = input.projects.map((project) => {
      const bucket = bucketsByProject.get(project.id);
      if (!bucket) {
        return this.buildEmptyReport(project, windowMinutes, baselineMinutes);
      }

      const currentCpuMillicoreSeconds = toSafeNumber(bucket.currentCpuMillicoreSeconds);
      const currentBandwidthBytes = toSafeNumber(bucket.currentBandwidthBytes);
      const baselineCpuSamples = bucket.baselineCpuMillicoreSeconds.map(toSafeNumber);
      const baselineBandwidthSamples = bucket.baselineBandwidthBytes.map(toSafeNumber);
      const baselineCpuMillicoreSecondsAvg = average(baselineCpuSamples);
      const baselineBandwidthBytesAvg = average(baselineBandwidthSamples);

      const cpuSpikeRatio = currentCpuMillicoreSeconds / Math.max(1, baselineCpuMillicoreSecondsAvg);
      const bandwidthSpikeRatio = currentBandwidthBytes / Math.max(1, baselineBandwidthBytesAvg);
      const currentBandwidthMbps = (currentBandwidthBytes * 8) / Math.max(1, windowSeconds) / 1_000_000;
      const currentCpuMillicoresAverage = currentCpuMillicoreSeconds / Math.max(1, windowSeconds);

      const ddosSuspected =
        currentBandwidthBytes >= 250 * 1024 * 1024 &&
        bandwidthSpikeRatio >= 2.5;

      const abuseSuspected =
        currentCpuMillicoresAverage >= 800 &&
        cpuSpikeRatio >= 2.5 &&
        bandwidthSpikeRatio >= 1.4;

      const bandwidthSpikeScore = clampNumber((bandwidthSpikeRatio - 1) * 14, 0, 40);
      const bandwidthVolumeScore = clampNumber(currentBandwidthMbps * 1.6, 0, 20);
      const cpuSpikeScore = clampNumber((cpuSpikeRatio - 1) * 10, 0, 25);
      const cpuLoadScore = clampNumber((currentCpuMillicoresAverage - 200) / 40, 0, 15);
      const riskWithFlags =
        bandwidthSpikeScore +
        bandwidthVolumeScore +
        cpuSpikeScore +
        cpuLoadScore +
        (ddosSuspected ? 15 : 0) +
        (abuseSuspected ? 10 : 0);

      const riskScore = Math.round(clampNumber(riskWithFlags, 0, 100));
      const severity =
        riskScore >= 80
          ? 'critical'
          : riskScore >= 60
            ? 'high'
            : riskScore >= 35
              ? 'medium'
              : 'low';

      const recommendAttackMode = riskScore >= 60 || ddosSuspected || abuseSuspected;

      const signals: string[] = [];
      if (bandwidthSpikeRatio >= 2) {
        signals.push(
          `Bandwidth spiked by ${bandwidthSpikeRatio.toFixed(2)}x over baseline.`,
        );
      }
      if (cpuSpikeRatio >= 2) {
        signals.push(`CPU usage spiked by ${cpuSpikeRatio.toFixed(2)}x over baseline.`);
      }
      if (currentBandwidthMbps >= 25) {
        signals.push(`Current ingress+egress rate is ${currentBandwidthMbps.toFixed(2)} Mbps.`);
      }
      if (ddosSuspected) {
        signals.push('Traffic profile matches a possible DDoS surge.');
      }
      if (abuseSuspected) {
        signals.push('CPU pressure and traffic pattern indicate possible abuse/bot activity.');
      }
      if (signals.length === 0) {
        signals.push('No abnormal surge detected in the selected window.');
      }

      return {
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        attackModeEnabled: project.attackModeEnabled,
        severity,
        riskScore,
        ddosSuspected,
        abuseSuspected,
        recommendAttackMode,
        signals,
        metrics: {
          currentWindowMinutes: windowMinutes,
          baselineWindowMinutes: baselineMinutes,
          currentBandwidthBytes: Math.round(currentBandwidthBytes).toString(),
          baselineBandwidthBytesAvg: Math.round(baselineBandwidthBytesAvg).toString(),
          bandwidthSpikeRatio: Number(bandwidthSpikeRatio.toFixed(2)),
          currentBandwidthMbps: Number(currentBandwidthMbps.toFixed(2)),
          currentCpuMillicoreSeconds: Math.round(currentCpuMillicoreSeconds).toString(),
          baselineCpuMillicoreSecondsAvg: Math.round(baselineCpuMillicoreSecondsAvg).toString(),
          cpuSpikeRatio: Number(cpuSpikeRatio.toFixed(2)),
          currentCpuMillicoresAverage: Number(currentCpuMillicoresAverage.toFixed(2)),
        },
      };
    });

    reports.sort((a, b) => b.riskScore - a.riskScore);

    return {
      generatedAt: now.toISOString(),
      windowMinutes,
      baselineMinutes,
      projects: reports,
    };
  }

  private buildEmptyReport(
    project: ProjectAnomalyTarget,
    windowMinutes: number,
    baselineMinutes: number,
  ): ProjectAnomalyReport {
    return {
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      attackModeEnabled: project.attackModeEnabled,
      severity: 'low',
      riskScore: 0,
      ddosSuspected: false,
      abuseSuspected: false,
      recommendAttackMode: false,
      signals: ['No data available for this project yet.'],
      metrics: {
        currentWindowMinutes: windowMinutes,
        baselineWindowMinutes: baselineMinutes,
        currentBandwidthBytes: '0',
        baselineBandwidthBytesAvg: '0',
        bandwidthSpikeRatio: 0,
        currentBandwidthMbps: 0,
        currentCpuMillicoreSeconds: '0',
        baselineCpuMillicoreSecondsAvg: '0',
        cpuSpikeRatio: 0,
        currentCpuMillicoresAverage: 0,
      },
    };
  }
}
