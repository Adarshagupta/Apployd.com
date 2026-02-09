'use client';

import { useEffect, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { UsageChart } from '../../../components/usage-chart';
import { apiClient } from '../../../lib/api';
import { useWorkspaceContext } from '../../../components/workspace-provider';

interface DailyPoint {
  day: string;
  total: string;
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
    usageWindow: {
      start: string;
      end: string;
      source: 'subscription_period' | 'rolling_window';
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
  } | null;
}

export default function UsagePage() {
  const { selectedOrganizationId } = useWorkspaceContext();
  const [summary, setSummary] = useState<{
    pools: { ramMb: number; cpuMillicores: number; bandwidthGb: number };
    usage: Record<string, string>;
  } | null>(null);
  const [cpuData, setCpuData] = useState<Array<{ label: string; value: number }>>([]);
  const [ramData, setRamData] = useState<Array<{ label: string; value: number }>>([]);
  const [projectUsage, setProjectUsage] = useState<ProjectUsageRow[]>([]);
  const [message, setMessage] = useState('');

  const mapPoints = (points: DailyPoint[]) =>
    points.map((point) => ({
      label: new Date(point.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: Number(point.total),
    }));

  const load = async () => {
    if (!selectedOrganizationId) {
      setSummary(null);
      setCpuData([]);
      setRamData([]);
      setProjectUsage([]);
      return;
    }

    try {
      const summaryData = await apiClient.get(`/usage/summary?organizationId=${selectedOrganizationId}`);
      setSummary(summaryData);

      const [cpuDaily, ramDaily, projectData] = await Promise.all([
        apiClient.get(
          `/usage/daily?organizationId=${selectedOrganizationId}&metricType=cpu_millicore_seconds&days=14`,
        ),
        apiClient.get(
          `/usage/daily?organizationId=${selectedOrganizationId}&metricType=ram_mb_seconds&days=14`,
        ),
        apiClient.get(`/usage/projects?organizationId=${selectedOrganizationId}`),
      ]);

      setCpuData(mapPoints(cpuDaily.points ?? []));
      setRamData(mapPoints(ramDaily.points ?? []));
      setProjectUsage((projectData.projects ?? []) as ProjectUsageRow[]);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    const interval = setInterval(() => {
      load().catch(() => undefined);
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  const formatCpu = (raw: string) => {
    // raw is millicore-seconds accumulated this billing period
    // Convert to average millicores: total_ms / period_seconds
    // For simplicity, just show the accumulated value in a readable unit
    const val = Number(raw);
    if (val === 0) return '0';
    if (val >= 3_600_000) return `${(val / 3_600_000).toFixed(1)}k mCPU·h`;
    if (val >= 60_000) return `${(val / 60_000).toFixed(1)} mCPU·min`;
    return `${val.toLocaleString()} mCPU·s`;
  };

  const formatRam = (raw: string) => {
    const val = Number(raw);
    if (val === 0) return '0';
    if (val >= 3_600_000) return `${(val / 3_600_000).toFixed(1)}k MB·h`;
    if (val >= 60_000) return `${(val / 60_000).toFixed(1)} MB·min`;
    return `${val.toLocaleString()} MB·s`;
  };

  const formatBandwidth = (raw: string) => {
    const val = Number(raw);
    if (val === 0) return '0';
    if (val >= 1e9) return `${(val / 1e9).toFixed(2)} GB`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(1)} MB`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(0)} KB`;
    return `${val} B`;
  };

  const formatPercent = (raw: string) => {
    const val = Number(raw);
    if (!Number.isFinite(val)) return '0%';
    return `${val.toFixed(2)}%`;
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Usage Summary" subtitle="Live metering against the active subscription pool.">

        {summary ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">CPU</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatCpu(summary.usage.cpu_millicore_seconds ?? '0')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">pool: {summary.pools.cpuMillicores} mCPU</p>
            </div>
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">RAM</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatRam(summary.usage.ram_mb_seconds ?? '0')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">pool: {summary.pools.ramMb} MB</p>
            </div>
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Bandwidth</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatBandwidth(summary.usage.bandwidth_bytes ?? '0')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">pool: {summary.pools.bandwidthGb} GB</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Select an organization to load usage metrics.</p>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="CPU Trend" subtitle="Last 14 days of recorded CPU metric">
          <UsageChart title="cpu_millicore_seconds" data={cpuData} />
        </SectionCard>
        <SectionCard title="RAM Trend" subtitle="Last 14 days of recorded RAM metric">
          <UsageChart title="ram_mb_seconds" data={ramData} />
        </SectionCard>
      </div>

      <SectionCard
        title="Project Usage Breakdown"
        subtitle="Detailed usage and utilization by project for the active billing window."
      >
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
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {project.usage ? (
                        <>
                          <p>{Number(project.usage.derived.cpuCoreHours).toFixed(3)} core-h</p>
                          <p className="text-xs text-slate-500">{formatPercent(project.usage.utilization.cpuPercentOfAllocation)}</p>
                        </>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {project.usage ? (
                        <>
                          <p>{Number(project.usage.derived.ramGibHours).toFixed(3)} GiB-h</p>
                          <p className="text-xs text-slate-500">{formatPercent(project.usage.utilization.ramPercentOfAllocation)}</p>
                        </>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {project.usage ? (
                        <>
                          <p>{Number(project.usage.derived.bandwidthGib).toFixed(3)} GiB</p>
                          <p className="text-xs text-slate-500">{formatPercent(project.usage.utilization.bandwidthPercentOfAllocation)}</p>
                        </>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {project.usage?.totals.requestCount ?? '0'}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {project.usage?.lastRecordedAt
                        ? new Date(project.usage.lastRecordedAt).toLocaleString()
                        : 'No data'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">No project usage has been recorded yet.</p>
        )}
      </SectionCard>

      {message ? <p className="text-sm text-slate-900">{message}</p> : null}
    </div>
  );
}
