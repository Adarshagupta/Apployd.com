'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

import { IconInfo } from '../../../components/dashboard-icons';
import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspaceContext } from '../../../components/workspace-provider';

interface RecentDeployment {
  id: string;
  status: string;
  domain: string | null;
  branch: string | null;
  createdAt: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
}

interface UsageSummaryResponse {
  pools: {
    ramMb: number;
    cpuMillicores: number;
    bandwidthGb: number;
  };
  usage: Record<string, string>;
  subscription?: {
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  };
}

interface CurrentSubscription {
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  plan: {
    code: string;
    displayName: string;
  };
}

interface UtilizationMetric {
  id: 'cpu' | 'ram' | 'bandwidth';
  label: string;
  used: number;
  usedLabel: string;
  capacity: number;
  capacityLabel: string;
  percent: number;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

function InfoIcon({ label }: { label: string }) {
  return (
    <span className="info-icon" title={label} aria-label={label}>
      <IconInfo size={13} />
    </span>
  );
}

const safeNumber = (value: string | number | null | undefined): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const formatInteger = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

const formatCompact = (value: number): string =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const formatCpuUsage = (value: number): string => {
  if (value >= 3_600_000) {
    return `${(value / 3_600_000).toFixed(1)}k mCPU-h`;
  }
  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(1)} mCPU-min`;
  }
  return `${formatInteger(value)} mCPU-s`;
};

const formatRamUsage = (value: number): string => {
  if (value >= 3_600_000) {
    return `${(value / 3_600_000).toFixed(1)}k MB-h`;
  }
  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(1)} MB-min`;
  }
  return `${formatInteger(value)} MB-s`;
};

const formatBandwidthUsage = (value: number): string => {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)} GB`;
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)} MB`;
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(0)} KB`;
  }
  return `${formatInteger(value)} B`;
};

const formatRelativeTime = (iso: string): string => {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Unknown time';
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diffSeconds);

  if (abs < 60) {
    return rtf.format(diffSeconds, 'second');
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, 'day');
};

const formatBillingWindow = (start?: string, end?: string): string => {
  if (!start || !end) {
    return 'Active billing period';
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return 'Active billing period';
  }

  return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
};

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

const buildSparkPath = (percent: number, seed: number): string => {
  const normalized = clampPercent(percent);
  const points = Array.from({ length: 7 }, (_, index) => {
    const x = (index / 6) * 100;
    const wave = Math.sin((index + seed * 0.33) * 1.05) * 7;
    const trend = (index - 2.8) * 1.4;
    const magnitude = normalized * 0.44;
    const y = 86 - magnitude - wave - trend;
    return [x, Math.min(90, Math.max(10, y))] as const;
  });

  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
};

const missionSignalTone = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized === 'ready') {
    return 'ready';
  }
  if (normalized === 'failed') {
    return 'failed';
  }
  if (normalized === 'building' || normalized === 'deploying') {
    return 'active';
  }
  if (normalized === 'queued') {
    return 'queued';
  }
  return 'idle';
};

const deploymentTone = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized === 'ready') {
    return 'bg-slate-100 text-slate-900 border border-slate-300';
  }
  if (normalized === 'failed') {
    return 'bg-slate-200 text-slate-900 border border-slate-400';
  }
  if (normalized === 'building' || normalized === 'deploying') {
    return 'bg-slate-100 text-slate-700 border border-slate-300';
  }
  if (normalized === 'queued') {
    return 'bg-slate-50 text-slate-600 border border-slate-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200';
};

const utilizationTone = (percent: number): {
  label: string;
  badgeClass: string;
  barClass: string;
} => {
  if (percent >= 90) {
    return {
      label: 'Critical',
      badgeClass: 'bg-slate-900 text-white border border-slate-800',
      barClass: 'bg-slate-900',
    };
  }
  if (percent >= 70) {
    return {
      label: 'Elevated',
      badgeClass: 'bg-slate-700 text-white border border-slate-600',
      barClass: 'bg-slate-700',
    };
  }
  return {
    label: 'Healthy',
    badgeClass: 'bg-slate-100 text-slate-900 border border-slate-300',
    barClass: 'bg-slate-400',
  };
};

export default function OverviewPage() {
  const router = useRouter();
  const {
    organizations,
    selectedOrganizationId,
    projects,
    loading,
  } = useWorkspaceContext();

  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [recentDeployments, setRecentDeployments] = useState<RecentDeployment[]>([]);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const loadOverview = useCallback(async () => {
    if (!selectedOrganizationId) {
      setSummary(null);
      setSubscription(null);
      setRecentDeployments([]);
      setMessage('');
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    try {
      const [summaryRes, planRes, deploymentRes] = await Promise.all([
        apiClient.get(`/usage/summary?organizationId=${selectedOrganizationId}`),
        apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`),
        apiClient.get(`/deployments/recent?organizationId=${selectedOrganizationId}&limit=10`),
      ]);

      setSummary(summaryRes as UsageSummaryResponse);
      setSubscription((planRes as { subscription?: CurrentSubscription }).subscription ?? null);
      setRecentDeployments(((deploymentRes as { deployments?: RecentDeployment[] }).deployments ?? []).slice(0, 10));
      setMessage('');
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [selectedOrganizationId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const utilizationMetrics = useMemo<UtilizationMetric[]>(() => {
    const cpuUsed = safeNumber(summary?.usage.cpu_millicore_seconds);
    const ramUsed = safeNumber(summary?.usage.ram_mb_seconds);
    const bandwidthUsed = safeNumber(summary?.usage.bandwidth_bytes);

    const cpuPool = safeNumber(summary?.pools.cpuMillicores);
    const ramPool = safeNumber(summary?.pools.ramMb);
    const bandwidthPool = safeNumber(summary?.pools.bandwidthGb);

    const toPercent = (used: number, capacity: number) => {
      if (capacity <= 0) {
        return 0;
      }
      return Math.min(100, (used / capacity) * 100);
    };

    return [
      {
        id: 'cpu',
        label: 'CPU Pool',
        used: cpuUsed,
        usedLabel: formatCpuUsage(cpuUsed),
        capacity: cpuPool,
        capacityLabel: `${formatInteger(cpuPool)} mCPU`,
        percent: toPercent(cpuUsed, cpuPool),
      },
      {
        id: 'ram',
        label: 'RAM Pool',
        used: ramUsed,
        usedLabel: formatRamUsage(ramUsed),
        capacity: ramPool,
        capacityLabel: `${formatInteger(ramPool)} MB`,
        percent: toPercent(ramUsed, ramPool),
      },
      {
        id: 'bandwidth',
        label: 'Bandwidth Pool',
        used: bandwidthUsed,
        usedLabel: formatBandwidthUsage(bandwidthUsed),
        capacity: bandwidthPool,
        capacityLabel: `${formatInteger(bandwidthPool)} GB`,
        percent: toPercent(bandwidthUsed, bandwidthPool),
      },
    ];
  }, [summary]);

  const overallLoadPercent = useMemo(() => {
    if (!utilizationMetrics.length) {
      return 0;
    }
    const total = utilizationMetrics.reduce((acc, metric) => acc + metric.percent, 0);
    return total / utilizationMetrics.length;
  }, [utilizationMetrics]);

  const peakPressure = useMemo(() => {
    if (!utilizationMetrics.length) {
      return { label: 'No data', percent: 0 };
    }

    const hottest = utilizationMetrics.reduce((max, metric) =>
      metric.percent > max.percent ? metric : max,
    );

    return { label: hottest.label, percent: hottest.percent };
  }, [utilizationMetrics]);

  const latestProjects = useMemo(() => projects.slice(0, 4), [projects]);
  const featuredProjects = useMemo(() => latestProjects.slice(0, 3), [latestProjects]);
  const featuredProjectSlots = useMemo(
    () => Array.from({ length: 3 }, (_, index) => featuredProjects[index] ?? null),
    [featuredProjects],
  );

  const latestDeploymentByProject = useMemo(() => {
    const map = new Map<string, RecentDeployment>();
    for (const deployment of recentDeployments) {
      if (!map.has(deployment.project.id)) {
        map.set(deployment.project.id, deployment);
      }
    }
    return map;
  }, [recentDeployments]);

  const isOverviewLoading =
    loading ||
    (Boolean(selectedOrganizationId) &&
      refreshing &&
      !summary &&
      !subscription &&
      recentDeployments.length === 0);

  return (
    <div className="space-y-4">
      <SectionCard title="Mission Control">
        <div className="mission-shell">
          <article className="mission-main">
            <div className="mission-head">
              <div className="mission-overline-row">
                <p className="mission-overline">Service signals for active cycle</p>
                <span className="mission-pill">{formatInteger(featuredProjects.length)} assets</span>
              </div>
              <div className="mission-filter-row">
                <span className="mission-filter-chip">24h</span>
                <span className="mission-filter-chip">{subscription?.plan?.displayName ?? 'No Plan'}</span>
                <span className="mission-filter-chip">{formatInteger(projects.length)} projects</span>
              </div>
            </div>

            <h3 className="mission-title">{selectedOrganization?.name ?? 'No organization selected'}</h3>

            {isOverviewLoading ? (
              <div className="mission-grid">
                {Array.from({ length: 3 }, (_, index) => (
                  <article key={`mission-loading-${index}`} className="mission-card">
                    <SkeletonBlock className="h-4 w-24 rounded" />
                    <SkeletonBlock className="mt-3 h-6 w-40 rounded" />
                    <SkeletonBlock className="mt-2 h-4 w-24 rounded" />
                    <SkeletonBlock className="mt-5 h-8 w-28 rounded" />
                    <SkeletonBlock className="mt-3 h-16 w-full rounded-xl" />
                  </article>
                ))}
              </div>
            ) : featuredProjects.length === 0 ? (
              <button
                type="button"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push('/projects/new' as any)}
                className="mission-empty"
              >
                <span className="mission-empty-mark">+</span>
                <span className="mission-empty-text">Create project</span>
              </button>
            ) : (
              <div className="mission-grid">
                {featuredProjectSlots.map((project, index) => {
                  if (!project) {
                    return (
                      <button
                        key={`mission-create-${index}`}
                        type="button"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onClick={() => router.push('/projects/new' as any)}
                        className="mission-card mission-card-create"
                      >
                        <p className="mission-card-runtime">Open slot</p>
                        <p className="mission-card-name">Create Project</p>
                        <p className="mission-card-meta">Provision a new backend service.</p>
                      </button>
                    );
                  }

                  const deployment = latestDeploymentByProject.get(project.id);
                  const status = deployment?.status ?? 'idle';
                  const tone = missionSignalTone(status);
                  const percentSignals = [
                    safeNumber(project.usage?.utilization.cpuPercentOfAllocation),
                    safeNumber(project.usage?.utilization.ramPercentOfAllocation),
                    safeNumber(project.usage?.utilization.bandwidthPercentOfAllocation),
                  ].filter((value) => value > 0);
                  const poolSignals = [
                    summary?.pools.cpuMillicores
                      ? (project.resourceCpuMillicore / safeNumber(summary.pools.cpuMillicores)) * 100
                      : 0,
                    summary?.pools.ramMb ? (project.resourceRamMb / safeNumber(summary.pools.ramMb)) * 100 : 0,
                    summary?.pools.bandwidthGb
                      ? (project.resourceBandwidthGb / safeNumber(summary.pools.bandwidthGb)) * 100
                      : 0,
                  ].filter((value) => Number.isFinite(value) && value > 0);

                  const loadValue = percentSignals.length
                    ? percentSignals.reduce((total, value) => total + value, 0) / percentSignals.length
                    : poolSignals.length
                      ? poolSignals.reduce((total, value) => total + value, 0) / poolSignals.length
                      : 0;
                  const loadPercent = clampPercent(loadValue);
                  const accentColor = ['#8ea2ff', '#9f7cff', '#f67b7b'][index % 3];

                  return (
                    <button
                      key={project.id}
                      type="button"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onClick={() => router.push(`/projects/${project.id}` as any)}
                      className="mission-card"
                      style={{ '--mission-accent': accentColor } as CSSProperties}
                    >
                      <div className="mission-card-top">
                        <p className="mission-card-runtime">{project.runtime.toUpperCase()}</p>
                        <span className={`mission-card-status mission-card-status-${tone}`}>{status}</span>
                      </div>
                      <p className="mission-card-name">{project.name}</p>
                      <p className="mission-card-meta mono">{project.slug}</p>
                      <p className="mission-card-value">{loadPercent.toFixed(1)}%</p>
                      <p className="mission-card-trend">
                        {deployment ? formatRelativeTime(deployment.createdAt) : 'No deployments'}
                      </p>
                      <div className="mission-card-chart">
                        <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
                          <path d={buildSparkPath(loadPercent, index + project.name.length)} className="mission-card-chart-line" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <aside className="mission-side">
            {isOverviewLoading ? (
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-24 rounded" />
                <SkeletonBlock className="h-7 w-52 rounded-xl" />
                <SkeletonBlock className="h-4 w-64 max-w-full rounded" />
                <SkeletonBlock className="h-24 w-full rounded-2xl" />
                <SkeletonBlock className="h-11 w-full rounded-xl" />
                <SkeletonBlock className="h-10 w-full rounded-xl" />
              </div>
            ) : (
              <>
                <div className="mission-side-head">
                  <p className="mission-side-label">Apployd Mission</p>
                  <span className="mission-side-chip">{subscription?.status ?? 'inactive'}</span>
                </div>
                <h4 className="mission-side-title">Deployment Portfolio</h4>
                <p className="mission-side-description">
                  Monitor pooled capacity and launch services from one control surface.
                </p>

                <div className="mission-side-stats">
                  <div className="mission-side-stat-row">
                    <span>Plan</span>
                    <strong>{subscription?.plan?.displayName ?? 'No active plan'}</strong>
                  </div>
                  <div className="mission-side-stat-row">
                    <span>Deployments</span>
                    <strong>{formatInteger(recentDeployments.length)}</strong>
                  </div>
                  <div className="mission-side-stat-row">
                    <span>Load</span>
                    <strong>{overallLoadPercent.toFixed(1)}%</strong>
                  </div>
                  <div className="mission-side-stat-row">
                    <span>Peak</span>
                    <strong>{peakPressure.label} {peakPressure.percent.toFixed(1)}%</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="mission-side-cta mission-side-cta-secondary"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={() => router.push('/projects/new' as any)}
                >
                  Create project
                </button>

                <p className="mission-side-foot">
                  <InfoIcon label="Billing window" /> {formatBillingWindow(subscription?.currentPeriodStart, subscription?.currentPeriodEnd)}
                </p>
                <p className="mission-side-foot">
                  <InfoIcon label="Last sync" /> {lastSyncedAt ? formatRelativeTime(lastSyncedAt) : '--'}
                </p>
              </>
            )}
          </aside>
        </div>
      </SectionCard>

      <SectionCard title="Capacity Radar">
        {isOverviewLoading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((placeholder) => (
              <article key={placeholder} className="capacity-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-3 w-24 rounded" />
                    <SkeletonBlock className="h-6 w-28 rounded-lg" />
                  </div>
                  <SkeletonBlock className="h-6 w-20 rounded-full" />
                </div>

                <div className="mt-4">
                  <SkeletonBlock className="h-2 w-full rounded-full" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-3 w-24 rounded" />
                  <SkeletonBlock className="h-3 w-32 rounded" />
                </div>

                <SkeletonBlock className="mt-2 h-3 w-36 rounded" />
              </article>
            ))}
          </div>
        ) : !selectedOrganizationId ? (
          <p className="empty-state-text">Select an organization to load capacity metrics.</p>
        ) : !summary ? (
          <p className="empty-state-text">Capacity metrics are unavailable right now.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {utilizationMetrics.map((metric) => {
              const tone = utilizationTone(metric.percent);
              const barWidth = `${Math.min(100, Math.max(metric.percent, metric.percent > 0 ? 6 : 0)).toFixed(1)}%`;

              return (
                <article key={metric.id} className="capacity-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="stat-label">{metric.label}</p>
                      <p className="mt-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>{metric.usedLabel}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${tone.badgeClass}`}
                    >
                      {tone.label}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-2)' }}>
                      <div className={`h-full rounded-full transition-all duration-500 ${tone.barClass}`} style={{ width: barWidth }} />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{metric.percent.toFixed(1)}%</span>
                    <span>{metric.capacityLabel}</span>
                  </div>

                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <InfoIcon label="Headroom" /> {formatCompact(Math.max(0, metric.capacity - metric.used))}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Deployment Feed">
        {isOverviewLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((placeholder) => (
              <article key={placeholder} className="deployment-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-44 rounded" />
                    <SkeletonBlock className="h-3 w-28 rounded" />
                  </div>
                  <SkeletonBlock className="h-6 w-20 rounded-full" />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[0, 1, 2].map((field) => (
                    <div key={field}>
                      <SkeletonBlock className="h-3 w-16 rounded" />
                      <SkeletonBlock className="mt-2 h-3 w-20 rounded" />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : recentDeployments.length ? (
          <div className="space-y-2">
            {recentDeployments.map((deployment) => (
              <button
                key={deployment.id}
                type="button"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push(`/projects/${deployment.project.id}/deployments/${deployment.id}` as any)}
                className="deployment-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="deployment-title">{deployment.project.name}</p>
                    <p className="mono deployment-meta mt-1">{deployment.project.slug}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${deploymentTone(deployment.status)}`}
                  >
                    {deployment.status}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="deployment-meta-label">Branch</p>
                    <p className="mono deployment-meta-value">{deployment.branch ?? '-'}</p>
                  </div>
                  <div>
                    <p className="deployment-meta-label">Domain</p>
                    <p className="deployment-meta-value truncate">{deployment.domain ?? 'no-domain'}</p>
                  </div>
                  <div>
                    <p className="deployment-meta-label">Created</p>
                    <p className="deployment-meta-value">{formatRelativeTime(deployment.createdAt)}</p>
                    <p className="deployment-meta text-[11px]">{new Date(deployment.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-state-text">No deployments yet for this organization.</p>
          </div>
        )}
      </SectionCard>

      {message ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{message}</p> : null}
    </div>
  );
}
