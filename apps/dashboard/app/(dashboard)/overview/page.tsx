'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

  const quickActions = [
    {
      title: 'Provision Project',
      description: 'Create a new project and assign strict resource boundaries.',
      href: '/projects/new',
    },
    {
      title: 'Inspect Usage',
      description: 'Review pooled consumption and project-level utilization.',
      href: '/usage',
    },
    {
      title: 'Open Logs',
      description: 'Stream runtime and deployment logs from active services.',
      href: '/logs',
    },
    {
      title: 'Review Billing',
      description: 'Check current plan state and invoice history.',
      href: '/billing',
    },
  ] as const;

  const isOverviewLoading =
    loading ||
    (Boolean(selectedOrganizationId) &&
      refreshing &&
      !summary &&
      !subscription &&
      recentDeployments.length === 0);

  return (
    <div className="space-y-4">
      <SectionCard title="Mission Control" subtitle="Live operational posture for the selected organization.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <article className="workspace-card md:p-6">
            <div className="pointer-events-none absolute -right-20 -top-16 h-44 w-44 rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, var(--accent-alt), transparent)' }} />

            {isOverviewLoading ? (
              <>
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-3 w-20 rounded" />
                    <SkeletonBlock className="h-8 w-64 max-w-[70vw] rounded-xl" />
                    <SkeletonBlock className="h-4 w-52 max-w-[60vw] rounded" />
                    <SkeletonBlock className="h-3 w-44 max-w-[50vw] rounded" />
                  </div>
                  <SkeletonBlock className="h-10 w-24 rounded-xl" />
                </div>

                <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((placeholder) => (
                    <div key={placeholder} className="stat-card-overview">
                      <SkeletonBlock className="h-3 w-20 rounded" />
                      <SkeletonBlock className="mt-2 h-6 w-24 rounded-lg" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="workspace-label">Workspace</p>
                    <h3 className="workspace-title">
                      {selectedOrganization?.name ?? 'No organization selected'}
                    </h3>
                    <p className="workspace-subtitle">
                      {subscription?.plan?.displayName ?? 'No active plan'} • {subscription?.status ?? 'inactive'}
                    </p>
                    <p className="workspace-meta">
                      {formatBillingWindow(subscription?.currentPeriodStart, subscription?.currentPeriodEnd)}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => {
                      void loadOverview();
                    }}
                    disabled={refreshing}
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="stat-card-overview">
                    <p className="stat-label">Projects</p>
                    <p className="stat-value">{formatInteger(projects.length)}</p>
                  </div>
                  <div className="stat-card-overview">
                    <p className="stat-label">Deployments</p>
                    <p className="stat-value">{formatInteger(recentDeployments.length)}</p>
                  </div>
                  <div className="stat-card-overview">
                    <p className="stat-label">Overall Load</p>
                    <p className="stat-value">{overallLoadPercent.toFixed(1)}%</p>
                  </div>
                  <div className="stat-card-overview">
                    <p className="stat-label">Last Sync</p>
                    <p className="stat-value-sm">
                      {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : '--'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </article>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {quickActions.map((action) => (
              <button
                key={action.href}
                type="button"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push(action.href as any)}
                className="action-card"
              >
                <p className="action-card-title">{action.title}</p>
                <p className="action-card-description">{action.description}</p>
                <p className="action-card-cta">
                  Open {'>'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Capacity Radar" subtitle="Resource pressure across pooled limits for the current billing window.">
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
                    <span>{metric.percent.toFixed(1)}% of pool</span>
                    <span>Capacity: {metric.capacityLabel}</span>
                  </div>

                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Headroom: {formatCompact(Math.max(0, metric.capacity - metric.used))}</p>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Deployment Feed" subtitle="Latest deployment transitions across this organization.">
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
