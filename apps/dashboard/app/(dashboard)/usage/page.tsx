'use client';

import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { UsageChart } from '../../../components/usage-chart';
import { useWorkspaceContext } from '../../../components/workspace-provider';
import { apiClient } from '../../../lib/api';

interface DailyPoint {
  day: string;
  total: string;
}

interface UsageSummary {
  subscription: {
    currentPeriodStart: string;
    currentPeriodEnd: string;
    status: string;
  };
  pools: { ramMb: number; cpuMillicores: number; bandwidthGb: number };
  allocated: { ramMb: number; cpuMillicores: number; bandwidthGb: number };
  usage: Record<string, string>;
}

interface ProjectUsageRow {
  id: string;
  name: string;
  slug: string;
  runtime: string;
  resourceRamMb: number;
  resourceCpuMillicore: number;
  resourceBandwidthGb: number;
  usage: {
    totals: {
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
  } | null;
}

type TrendPoint = { label: string; value: number };
type RankedProject = { id: string; name: string; slug: string; value: number };

const TREND_DAYS = 30;
const REFRESH_INTERVAL_MS = 30_000;

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPeriodDate(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return 'No data';
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'No data' : d.toLocaleString();
}

function formatBytes(raw: string): string {
  const value = toNumber(raw);
  const gib = value / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(2)} GiB`;
  const mib = value / 1024 ** 2;
  if (mib >= 1) return `${mib.toFixed(1)} MiB`;
  return `${Math.round(value).toLocaleString()} B`;
}

function formatRequests(raw: string): string {
  const value = toNumber(raw);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value).toLocaleString()}`;
}

function formatCpu(raw: string): string {
  const total = toNumber(raw);
  const coreHours = total / (1000 * 3600);
  return coreHours >= 1 ? `${coreHours.toFixed(2)} core-h` : `${Math.round(total).toLocaleString()} mCPU-s`;
}

function formatRam(raw: string): string {
  const total = toNumber(raw);
  const gibHours = total / (1024 * 3600);
  return gibHours >= 1 ? `${gibHours.toFixed(2)} GiB-h` : `${Math.round(total).toLocaleString()} MB-s`;
}

function mapDaily(points: DailyPoint[]): TrendPoint[] {
  return points.map((point) => ({
    label: new Date(point.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: toNumber(point.total),
  }));
}

function rankProjects(rows: ProjectUsageRow[], getValue: (row: ProjectUsageRow) => number): RankedProject[] {
  return rows
    .map((row) => ({ id: row.id, name: row.name, slug: row.slug, value: getValue(row) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function TopList({
  title,
  rows,
  formatValue,
}: {
  title: string;
  rows: RankedProject[];
  formatValue: (value: number) => string;
}) {
  const max = rows.length ? Math.max(...rows.map((row) => row.value)) : 1;
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{title}</p>
      {rows.length ? (
        <div className="mt-3 space-y-3">
          {rows.map((row) => (
            <div key={row.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                <p className="mono text-xs text-slate-700">{formatValue(row.value)}</p>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{row.slug}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No data yet.</p>
      )}
    </article>
  );
}

export default function UsagePage() {
  const { selectedOrganizationId } = useWorkspaceContext();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [cpuData, setCpuData] = useState<TrendPoint[]>([]);
  const [ramData, setRamData] = useState<TrendPoint[]>([]);
  const [bandwidthData, setBandwidthData] = useState<TrendPoint[]>([]);
  const [requestData, setRequestData] = useState<TrendPoint[]>([]);
  const [projectUsage, setProjectUsage] = useState<ProjectUsageRow[]>([]);
  const [loading, setLoading] = useState(Boolean(selectedOrganizationId));
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!selectedOrganizationId) {
      setSummary(null);
      setCpuData([]);
      setRamData([]);
      setBandwidthData([]);
      setRequestData([]);
      setProjectUsage([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [summaryData, cpuDaily, ramDaily, bandwidthDaily, requestDaily, projectData] = await Promise.all([
        apiClient.get(`/usage/summary?organizationId=${selectedOrganizationId}`),
        apiClient.get(`/usage/daily?organizationId=${selectedOrganizationId}&metricType=cpu_millicore_seconds&days=${TREND_DAYS}`),
        apiClient.get(`/usage/daily?organizationId=${selectedOrganizationId}&metricType=ram_mb_seconds&days=${TREND_DAYS}`),
        apiClient.get(`/usage/daily?organizationId=${selectedOrganizationId}&metricType=bandwidth_bytes&days=${TREND_DAYS}`),
        apiClient.get(`/usage/daily?organizationId=${selectedOrganizationId}&metricType=request_count&days=${TREND_DAYS}`),
        apiClient.get(`/usage/projects?organizationId=${selectedOrganizationId}&days=${TREND_DAYS}`),
      ]);

      setSummary(summaryData as UsageSummary);
      setCpuData(mapDaily(cpuDaily.points ?? []));
      setRamData(mapDaily(ramDaily.points ?? []));
      setBandwidthData(mapDaily(bandwidthDaily.points ?? []));
      setRequestData(mapDaily(requestDaily.points ?? []));
      setProjectUsage((projectData.projects ?? []) as ProjectUsageRow[]);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    const interval = setInterval(() => {
      load().catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  const windowDays = useMemo(() => {
    if (!summary) return TREND_DAYS;
    const start = new Date(summary.subscription.currentPeriodStart);
    const end = new Date(summary.subscription.currentPeriodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return TREND_DAYS;
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }, [summary]);

  const topCpu = useMemo(() => rankProjects(projectUsage, (row) => toNumber(row.usage?.derived.cpuCoreHours)), [projectUsage]);
  const topBandwidth = useMemo(() => rankProjects(projectUsage, (row) => toNumber(row.usage?.derived.bandwidthGib)), [projectUsage]);
  const topRequests = useMemo(() => rankProjects(projectUsage, (row) => toNumber(row.usage?.totals.requestCount)), [projectUsage]);

  return (
    <div className="space-y-4">
      <SectionCard title="Usage Summary" subtitle="Detailed metering and allocation posture for the current billing cycle.">
        {summary ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Billing window</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatPeriodDate(summary.subscription.currentPeriodStart)} to {formatPeriodDate(summary.subscription.currentPeriodEnd)}
                </p>
                <p className="mt-1 text-xs text-slate-600">{windowDays} days</p>
              </div>
              <div className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Metered CPU</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatCpu(summary.usage.cpu_millicore_seconds ?? '0')}</p>
                <p className="mt-1 text-xs text-slate-600">{formatCpu(String(toNumber(summary.usage.cpu_millicore_seconds ?? '0') / windowDays))} per day</p>
              </div>
              <div className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Metered Requests</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatRequests(summary.usage.request_count ?? '0')}</p>
                <p className="mt-1 text-xs text-slate-600">{formatRequests(String(toNumber(summary.usage.request_count ?? '0') / windowDays))} per day</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">CPU allocation</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {summary.allocated.cpuMillicores} / {summary.pools.cpuMillicores} mCPU
                </p>
              </div>
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">RAM allocation</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {summary.allocated.ramMb} / {summary.pools.ramMb} MB
                </p>
              </div>
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Bandwidth allocation</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {summary.allocated.bandwidthGb} / {summary.pools.bandwidthGb} GB
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Metered RAM</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatRam(summary.usage.ram_mb_seconds ?? '0')}</p>
              </div>
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Metered Bandwidth</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatBytes(summary.usage.bandwidth_bytes ?? '0')}</p>
              </div>
            </div>
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-600">Loading usage summary...</p>
        ) : (
          <p className="text-sm text-slate-600">Select an organization to load usage metrics.</p>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="CPU Trend" subtitle={`Last ${TREND_DAYS} days`}>
          <UsageChart title="CPU millicore-seconds" data={cpuData} />
        </SectionCard>
        <SectionCard title="RAM Trend" subtitle={`Last ${TREND_DAYS} days`}>
          <UsageChart title="RAM megabyte-seconds" data={ramData} />
        </SectionCard>
        <SectionCard title="Bandwidth Trend" subtitle={`Last ${TREND_DAYS} days`}>
          <UsageChart title="Bandwidth bytes" data={bandwidthData} />
        </SectionCard>
        <SectionCard title="Request Trend" subtitle={`Last ${TREND_DAYS} days`}>
          <UsageChart title="Request count" data={requestData} />
        </SectionCard>
      </div>

      <SectionCard title="Project Hotspots" subtitle="Top projects by compute, transfer, and request volume.">
        <div className="grid gap-3 xl:grid-cols-3">
          <TopList title="Top CPU Projects" rows={topCpu} formatValue={(value) => `${value.toFixed(2)} core-h`} />
          <TopList title="Top Bandwidth Projects" rows={topBandwidth} formatValue={(value) => `${value.toFixed(2)} GiB`} />
          <TopList title="Top Request Projects" rows={topRequests} formatValue={(value) => formatRequests(String(value))} />
        </div>
      </SectionCard>

      <SectionCard title="Project Usage Breakdown" subtitle="Usage and utilization by project for the active window.">
        {projectUsage.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">CPU</th>
                  <th className="px-3 py-2">RAM</th>
                  <th className="px-3 py-2">Bandwidth</th>
                  <th className="px-3 py-2">Requests</th>
                  <th className="px-3 py-2">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {projectUsage.map((project) => (
                  <tr key={project.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{project.name}</p>
                      <p className="mono text-xs text-slate-500">{project.slug}</p>
                      <p className="text-xs text-slate-500">runtime: {project.runtime}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <p>{toNumber(project.usage?.derived.cpuCoreHours).toFixed(3)} core-h</p>
                      <p className="text-xs text-slate-500">{toNumber(project.usage?.utilization.cpuPercentOfAllocation).toFixed(2)}%</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <p>{toNumber(project.usage?.derived.ramGibHours).toFixed(3)} GiB-h</p>
                      <p className="text-xs text-slate-500">{toNumber(project.usage?.utilization.ramPercentOfAllocation).toFixed(2)}%</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <p>{toNumber(project.usage?.derived.bandwidthGib).toFixed(3)} GiB</p>
                      <p className="text-xs text-slate-500">{toNumber(project.usage?.utilization.bandwidthPercentOfAllocation).toFixed(2)}%</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{formatRequests(project.usage?.totals.requestCount ?? '0')}</td>
                    <td className="px-3 py-2 text-slate-500">{formatDateTime(project.usage?.lastRecordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-600">Loading project usage...</p>
        ) : (
          <p className="text-sm text-slate-600">No project usage has been recorded yet.</p>
        )}
      </SectionCard>

      {message ? <p className="text-sm text-slate-900">{message}</p> : null}
    </div>
  );
}
