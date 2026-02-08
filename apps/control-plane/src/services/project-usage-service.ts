import { Prisma, SubscriptionStatus, type UsageMetricType } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const BYTES_PER_GIB = 1024n * 1024n * 1024n;
const MILLICORE_SECONDS_PER_CORE_HOUR = 1000n * 3600n;
const MB_SECONDS_PER_GIB_HOUR = 1024n * 3600n;

const METRIC_KEYS = [
  'cpu_millicore_seconds',
  'ram_mb_seconds',
  'bandwidth_bytes',
  'request_count',
] as const;

type SupportedMetric = (typeof METRIC_KEYS)[number];
type UsageDbClient = typeof prisma;

interface UsageWindow {
  start: Date;
  end: Date;
  source: 'subscription_period' | 'rolling_window';
}

interface ProjectResourceSnapshot {
  id: string;
  resourceRamMb: number;
  resourceCpuMillicore: number;
  resourceBandwidthGb: number;
}

export interface ProjectUsageSnapshot {
  projectId: string;
  usageWindow: {
    start: string;
    end: string;
    source: UsageWindow['source'];
  };
  totals: {
    cpuMillicoreSeconds: string;
    ramMbSeconds: string;
    bandwidthBytes: string;
    requestCount: string;
  };
  derived: {
    cpuCoreHours: string;
    ramGibHours: string;
    bandwidthGib: string;
  };
  utilization: {
    cpuPercentOfAllocation: string;
    ramPercentOfAllocation: string;
    bandwidthPercentOfAllocation: string;
  };
  lastRecordedAt: string | null;
}

export interface DailyMetricPoint {
  day: string;
  total: string;
}

export interface ProjectUsageDetails {
  snapshot: ProjectUsageSnapshot;
  daily: Record<SupportedMetric, DailyMetricPoint[]>;
  insights: {
    avgDailyCpuMillicoreSeconds: string;
    avgDailyRamMbSeconds: string;
    avgDailyBandwidthBytes: string;
    peakBandwidthDay: string | null;
  };
}

interface ProjectUsageSummaryOptions {
  from?: Date;
  to?: Date;
  rollingDaysFallback?: number;
  db?: UsageDbClient;
}

interface ProjectUsageDetailsOptions {
  from?: Date;
  to?: Date;
  rollingDaysFallback?: number;
  db?: UsageDbClient;
}

interface ProjectUsageAggregateRow {
  projectId: string | null;
  metricType: UsageMetricType;
  _sum: {
    quantity: bigint | null;
  };
  _max: {
    recordedAt: Date | null;
  };
}

interface ProjectDailyAggregateRow {
  day: Date;
  metricType: UsageMetricType;
  total: bigint;
}

function bigintToString(value: bigint): string {
  return value.toString();
}

function normalizeMetric(metric: UsageMetricType): SupportedMetric | null {
  if (METRIC_KEYS.includes(metric as SupportedMetric)) {
    return metric as SupportedMetric;
  }
  return null;
}

function zeroTotals() {
  return {
    cpu_millicore_seconds: 0n,
    ram_mb_seconds: 0n,
    bandwidth_bytes: 0n,
    request_count: 0n,
  };
}

function decimalFromRatio(numerator: bigint, denominator: bigint, fractionDigits: number): string {
  if (denominator <= 0n) {
    return fractionDigits === 0 ? '0' : `0.${'0'.repeat(fractionDigits)}`;
  }

  const sign = numerator < 0n ? -1n : 1n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (absNumerator * scale) / denominator;
  const whole = scaled / scale;
  const fraction = scaled % scale;
  const fractionString = fractionDigits > 0 ? fraction.toString().padStart(fractionDigits, '0') : '';

  if (fractionDigits === 0) {
    return `${sign < 0n ? '-' : ''}${whole}`;
  }

  return `${sign < 0n ? '-' : ''}${whole}.${fractionString}`;
}

function percentFromUsage(used: bigint, capacity: bigint): string {
  return decimalFromRatio(used * 100n, capacity, 2);
}

function getWindowDurationSeconds(window: UsageWindow): bigint {
  const milliseconds = BigInt(Math.max(0, window.end.getTime() - window.start.getTime()));
  const seconds = milliseconds / 1000n;
  return seconds > 0n ? seconds : 1n;
}

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function addUtcDays(input: Date, days: number): Date {
  const next = new Date(input);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKeyUtc(input: Date): string {
  return input.toISOString().slice(0, 10);
}

export class ProjectUsageService {
  async listProjectUsageSnapshots(
    organizationId: string,
    projectIds: string[],
    options: ProjectUsageSummaryOptions = {},
  ): Promise<{
    window: ProjectUsageSnapshot['usageWindow'];
    byProjectId: Record<string, ProjectUsageSnapshot>;
  }> {
    const db = options.db ?? prisma;
    const uniqueProjectIds = [...new Set(projectIds)];
    if (uniqueProjectIds.length === 0) {
      const emptyWindow = this.toWindowShape(this.resolveExplicitOrRollingWindow(options, new Date(), 30));
      return { window: emptyWindow, byProjectId: {} };
    }

    const projectResources = await db.project.findMany({
      where: {
        organizationId,
        id: { in: uniqueProjectIds },
      },
      select: {
        id: true,
        resourceRamMb: true,
        resourceCpuMillicore: true,
        resourceBandwidthGb: true,
      },
    });

    const window = await this.resolveUsageWindow(organizationId, options, db);
    const aggregates = (await db.usageRecord.groupBy({
      by: ['projectId', 'metricType'],
      where: {
        organizationId,
        projectId: { in: projectResources.map((project) => project.id) },
        recordedAt: {
          gte: window.start,
          lte: window.end,
        },
      },
      _sum: {
        quantity: true,
      },
      _max: {
        recordedAt: true,
      },
    })) as ProjectUsageAggregateRow[];

    const byProjectId = this.buildSnapshots(projectResources, aggregates, window);
    return { window: this.toWindowShape(window), byProjectId };
  }

  async getProjectUsageDetails(
    organizationId: string,
    projectId: string,
    options: ProjectUsageDetailsOptions = {},
  ): Promise<ProjectUsageDetails> {
    const db = options.db ?? prisma;
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
      select: {
        id: true,
        resourceRamMb: true,
        resourceCpuMillicore: true,
        resourceBandwidthGb: true,
      },
    });

    if (!project) {
      throw new Error('Project not found.');
    }

    const window = await this.resolveUsageWindow(organizationId, options, db);
    const aggregates = (await db.usageRecord.groupBy({
      by: ['projectId', 'metricType'],
      where: {
        organizationId,
        projectId,
        recordedAt: {
          gte: window.start,
          lte: window.end,
        },
      },
      _sum: { quantity: true },
      _max: { recordedAt: true },
    })) as ProjectUsageAggregateRow[];

    const snapshots = this.buildSnapshots([project], aggregates, window);
    const snapshot = snapshots[projectId] ?? this.buildSnapshot(project, zeroTotals(), window, null);

    const dailyRows = await db.$queryRaw<ProjectDailyAggregateRow[]>(Prisma.sql`
      SELECT
        DATE_TRUNC('day', "recordedAt") AS day,
        "metricType",
        SUM("quantity")::bigint AS total
      FROM "usage_records"
      WHERE "organizationId" = ${organizationId}
        AND "projectId" = ${projectId}
        AND "recordedAt" >= ${window.start}
        AND "recordedAt" <= ${window.end}
      GROUP BY DATE_TRUNC('day', "recordedAt"), "metricType"
      ORDER BY day ASC
    `);

    const daily = this.buildDailySeries(dailyRows, window);
    const insights = this.buildInsights(daily);

    return { snapshot, daily, insights };
  }

  private buildSnapshots(
    projects: ProjectResourceSnapshot[],
    aggregates: ProjectUsageAggregateRow[],
    window: UsageWindow,
  ): Record<string, ProjectUsageSnapshot> {
    const totalsByProject: Record<string, ReturnType<typeof zeroTotals>> = {};
    const lastSeenByProject: Record<string, Date | null> = {};

    for (const project of projects) {
      totalsByProject[project.id] = zeroTotals();
      lastSeenByProject[project.id] = null;
    }

    for (const row of aggregates) {
      if (!row.projectId) {
        continue;
      }
      const metric = normalizeMetric(row.metricType);
      if (!metric || !(row.projectId in totalsByProject)) {
        continue;
      }

      const projectTotals = totalsByProject[row.projectId];
      if (!projectTotals) {
        continue;
      }

      projectTotals[metric] += row._sum.quantity ?? 0n;
      const candidate = row._max.recordedAt;
      const currentLastSeen = lastSeenByProject[row.projectId] ?? null;
      if (candidate && (!currentLastSeen || candidate > currentLastSeen)) {
        lastSeenByProject[row.projectId] = candidate;
      }
    }

    const byProjectId: Record<string, ProjectUsageSnapshot> = {};
    for (const project of projects) {
      byProjectId[project.id] = this.buildSnapshot(
        project,
        totalsByProject[project.id] ?? zeroTotals(),
        window,
        lastSeenByProject[project.id] ?? null,
      );
    }

    return byProjectId;
  }

  private buildSnapshot(
    project: ProjectResourceSnapshot,
    totals: ReturnType<typeof zeroTotals>,
    window: UsageWindow,
    lastRecordedAt: Date | null,
  ): ProjectUsageSnapshot {
    const seconds = getWindowDurationSeconds(window);
    const cpuAllocation = BigInt(project.resourceCpuMillicore) * seconds;
    const ramAllocation = BigInt(project.resourceRamMb) * seconds;
    const bandwidthAllocation = BigInt(project.resourceBandwidthGb) * BYTES_PER_GIB;

    return {
      projectId: project.id,
      usageWindow: this.toWindowShape(window),
      totals: {
        cpuMillicoreSeconds: bigintToString(totals.cpu_millicore_seconds),
        ramMbSeconds: bigintToString(totals.ram_mb_seconds),
        bandwidthBytes: bigintToString(totals.bandwidth_bytes),
        requestCount: bigintToString(totals.request_count),
      },
      derived: {
        cpuCoreHours: decimalFromRatio(totals.cpu_millicore_seconds, MILLICORE_SECONDS_PER_CORE_HOUR, 4),
        ramGibHours: decimalFromRatio(totals.ram_mb_seconds, MB_SECONDS_PER_GIB_HOUR, 4),
        bandwidthGib: decimalFromRatio(totals.bandwidth_bytes, BYTES_PER_GIB, 4),
      },
      utilization: {
        cpuPercentOfAllocation: percentFromUsage(totals.cpu_millicore_seconds, cpuAllocation),
        ramPercentOfAllocation: percentFromUsage(totals.ram_mb_seconds, ramAllocation),
        bandwidthPercentOfAllocation: percentFromUsage(totals.bandwidth_bytes, bandwidthAllocation),
      },
      lastRecordedAt: lastRecordedAt?.toISOString() ?? null,
    };
  }

  private buildDailySeries(
    rows: ProjectDailyAggregateRow[],
    window: UsageWindow,
  ): Record<SupportedMetric, DailyMetricPoint[]> {
    const startDay = startOfUtcDay(window.start);
    const endDay = startOfUtcDay(window.end);
    const pointsByMetric: Record<SupportedMetric, Record<string, bigint>> = {
      cpu_millicore_seconds: {},
      ram_mb_seconds: {},
      bandwidth_bytes: {},
      request_count: {},
    };

    for (const row of rows) {
      const metric = normalizeMetric(row.metricType);
      if (!metric) {
        continue;
      }
      const key = dateKeyUtc(row.day);
      pointsByMetric[metric][key] = (pointsByMetric[metric][key] ?? 0n) + (row.total ?? 0n);
    }

    const series: Record<SupportedMetric, DailyMetricPoint[]> = {
      cpu_millicore_seconds: [],
      ram_mb_seconds: [],
      bandwidth_bytes: [],
      request_count: [],
    };

    for (let day = new Date(startDay); day <= endDay; day = addUtcDays(day, 1)) {
      const key = dateKeyUtc(day);
      for (const metric of METRIC_KEYS) {
        series[metric].push({
          day: day.toISOString(),
          total: bigintToString(pointsByMetric[metric][key] ?? 0n),
        });
      }
    }

    return series;
  }

  private buildInsights(daily: Record<SupportedMetric, DailyMetricPoint[]>) {
    const days = BigInt(Math.max(daily.cpu_millicore_seconds.length, 1));
    const cpuTotal = daily.cpu_millicore_seconds.reduce((sum, point) => sum + BigInt(point.total), 0n);
    const ramTotal = daily.ram_mb_seconds.reduce((sum, point) => sum + BigInt(point.total), 0n);
    const bandwidthTotal = daily.bandwidth_bytes.reduce((sum, point) => sum + BigInt(point.total), 0n);

    let peakBandwidthDay: string | null = null;
    let peakBandwidth = -1n;
    for (const point of daily.bandwidth_bytes) {
      const value = BigInt(point.total);
      if (value > peakBandwidth) {
        peakBandwidth = value;
        peakBandwidthDay = point.day;
      }
    }

    return {
      avgDailyCpuMillicoreSeconds: decimalFromRatio(cpuTotal, days, 2),
      avgDailyRamMbSeconds: decimalFromRatio(ramTotal, days, 2),
      avgDailyBandwidthBytes: decimalFromRatio(bandwidthTotal, days, 2),
      peakBandwidthDay,
    };
  }

  private async resolveUsageWindow(
    organizationId: string,
    options: ProjectUsageSummaryOptions | ProjectUsageDetailsOptions,
    db: UsageDbClient,
  ): Promise<UsageWindow> {
    const now = new Date();
    if (options.from || options.to) {
      return this.resolveExplicitOrRollingWindow(options, now, options.rollingDaysFallback ?? 30);
    }

    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    if (subscription) {
      return {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd,
        source: 'subscription_period',
      };
    }

    return this.resolveExplicitOrRollingWindow(options, now, options.rollingDaysFallback ?? 30);
  }

  private resolveExplicitOrRollingWindow(
    options: ProjectUsageSummaryOptions | ProjectUsageDetailsOptions,
    now: Date,
    fallbackDays: number,
  ): UsageWindow {
    const startCandidate = options.from ?? addUtcDays(now, -Math.max(1, fallbackDays) + 1);
    const endCandidate = options.to ?? now;

    const start = startCandidate <= endCandidate ? startCandidate : endCandidate;
    const end = endCandidate >= startCandidate ? endCandidate : startCandidate;

    return {
      start,
      end,
      source: 'rolling_window',
    };
  }

  private toWindowShape(window: UsageWindow): ProjectUsageSnapshot['usageWindow'] {
    return {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      source: window.source,
    };
  }
}
