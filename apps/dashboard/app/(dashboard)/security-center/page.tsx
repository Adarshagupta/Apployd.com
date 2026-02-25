'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { SectionCard } from '../../../components/section-card';
import { useWorkspaceContext } from '../../../components/workspace-provider';
import { apiClient } from '../../../lib/api';

interface AnomalyReportProject {
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

interface AnomalyReportResponse {
  generatedAt: string;
  windowMinutes: number;
  baselineMinutes: number;
  summary: {
    totalProjects: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    recommendedAttackMode: number;
    attackModeEnabled: number;
  };
  projects: AnomalyReportProject[];
}

interface SecurityIncidentAppeal {
  id: string;
  status: 'submitted' | 'approved' | 'rejected';
  message: string;
  decisionNote: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  requestedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  decidedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface SecurityIncident {
  id: string;
  organizationId: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  deploymentId: string | null;
  containerId: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  reasonCode: string | null;
  blocked: boolean;
  status: 'open' | 'appealed' | 'reviewing' | 'resolved' | 'dismissed';
  detectedAt: string | null;
  blockedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  appealCount: number;
  pendingAppealCount: number;
  appeals: SecurityIncidentAppeal[];
}

interface SecurityIncidentResponse {
  incidents: SecurityIncident[];
}

const REFRESH_INTERVAL_MS = 30_000;

const toNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatBytes = (raw: string): string => {
  const value = toNumber(raw);
  const gib = value / 1024 ** 3;
  if (gib >= 1) {
    return `${gib.toFixed(2)} GiB`;
  }
  const mib = value / 1024 ** 2;
  if (mib >= 1) {
    return `${mib.toFixed(2)} MiB`;
  }
  return `${Math.round(value).toLocaleString()} B`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return 'N/A';
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return 'N/A';
  }
  return parsed.toLocaleString();
};

const formatStatus = (value: string): string =>
  value
    .split('_')
    .map((piece) => (piece.length ? `${piece[0]?.toUpperCase() ?? ''}${piece.slice(1)}` : ''))
    .join(' ');

const severityClassName = (severity: AnomalyReportProject['severity']): string => {
  if (severity === 'critical') {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (severity === 'high') {
    return 'bg-orange-100 text-orange-800 border-orange-200';
  }
  if (severity === 'medium') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
};

const incidentSeverityClassName = (severity: string): string => {
  const normalized = severity.trim().toLowerCase();
  if (normalized === 'critical') {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (normalized === 'high') {
    return 'bg-orange-100 text-orange-800 border-orange-200';
  }
  if (normalized === 'medium') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const incidentStatusClassName = (status: SecurityIncident['status']): string => {
  if (status === 'resolved') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }
  if (status === 'dismissed') {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  if (status === 'reviewing') {
    return 'bg-sky-100 text-sky-800 border-sky-200';
  }
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

export default function SecurityPage() {
  const searchParams = useSearchParams();
  const { selectedOrganizationId, selectedOrganization, projects, refresh } = useWorkspaceContext();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [report, setReport] = useState<AnomalyReportResponse | null>(null);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingProjectId, setPendingProjectId] = useState('');
  const [appealDrafts, setAppealDrafts] = useState<Record<string, string>>({});
  const [appealingIncidentId, setAppealingIncidentId] = useState('');
  const [unblockingIncidentId, setUnblockingIncidentId] = useState('');

  const highlightedIncidentId = searchParams?.get('incidentId') ?? '';
  const canUnblockIncidents = selectedOrganization?.role === 'owner' || selectedOrganization?.role === 'admin';

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId('');
      return;
    }

    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId('');
    }
  }, [projects, selectedProjectId]);

  const load = async () => {
    if (!selectedOrganizationId) {
      setReport(null);
      setIncidents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const anomalyQuery = new URLSearchParams({
        organizationId: selectedOrganizationId,
        windowMinutes: '5',
        baselineMinutes: '120',
      });
      if (selectedProjectId) {
        anomalyQuery.set('projectId', selectedProjectId);
      }

      const incidentQuery = new URLSearchParams({
        organizationId: selectedOrganizationId,
        status: 'all',
        limit: '50',
      });
      if (selectedProjectId) {
        incidentQuery.set('projectId', selectedProjectId);
      }

      const [anomalyData, incidentData] = await Promise.all([
        apiClient.get(`/security/anomalies?${anomalyQuery.toString()}`) as Promise<AnomalyReportResponse>,
        apiClient.get(`/security/incidents?${incidentQuery.toString()}`) as Promise<SecurityIncidentResponse>,
      ]);

      setReport(anomalyData);
      setIncidents(incidentData.incidents ?? []);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
      setReport(null);
      setIncidents([]);
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
  }, [selectedOrganizationId, selectedProjectId]);

  const handleAttackModeToggle = async (projectId: string, enabled: boolean) => {
    setPendingProjectId(projectId);
    try {
      const payload = (await apiClient.patch(`/security/projects/${projectId}/attack-mode`, {
        enabled,
      })) as { message?: string };
      await Promise.all([load(), refresh()]);
      setMessage(payload.message ?? (enabled ? 'Attack mode enabled.' : 'Attack mode disabled.'));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPendingProjectId('');
    }
  };

  const handleAppealSubmit = async (incidentId: string) => {
    const messageDraft = (appealDrafts[incidentId] ?? '').trim();
    if (messageDraft.length < 10) {
      setMessage('Appeal message must be at least 10 characters.');
      return;
    }

    setAppealingIncidentId(incidentId);
    try {
      const payload = (await apiClient.post(`/security/incidents/${incidentId}/appeals`, {
        message: messageDraft,
      })) as { message?: string };
      setAppealDrafts((current) => ({
        ...current,
        [incidentId]: '',
      }));
      await load();
      setMessage(payload.message ?? 'Appeal submitted.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAppealingIncidentId('');
    }
  };

  const handleUnblockIncident = async (incidentId: string) => {
    setUnblockingIncidentId(incidentId);
    try {
      const payload = (await apiClient.post(`/security/incidents/${incidentId}/unblock`, {
        resolutionNote: 'Manually unblocked from Security Center.',
      })) as { message?: string };
      await Promise.all([load(), refresh()]);
      setMessage(payload.message ?? 'Incident unblocked.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setUnblockingIncidentId('');
    }
  };

  const anomalySummary = useMemo(() => report?.summary ?? null, [report]);

  const incidentSummary = useMemo(() => {
    const blockedCount = incidents.filter((incident) => incident.blocked).length;
    const criticalBlocked = incidents.filter((incident) => {
      const severity = incident.severity.toLowerCase();
      return incident.blocked && (severity === 'critical' || severity === 'high');
    }).length;
    const pendingAppeals = incidents.reduce((total, incident) => total + incident.pendingAppealCount, 0);

    return {
      total: incidents.length,
      blockedCount,
      criticalBlocked,
      pendingAppeals,
    };
  }, [incidents]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Anomaly Detection"
        subtitle="Detect traffic surges that resemble DDoS or abusive behavior and harden edge rate limits with Attack Mode."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label>
            <span className="field-label">Project scope</span>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="field-input"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary self-end"
            onClick={() => load().catch(() => undefined)}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh now'}
          </button>
          <div className="self-end text-xs text-slate-500">
            Auto-refresh: 30s
          </div>
        </div>

        {anomalySummary ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Projects monitored</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{anomalySummary.totalProjects}</p>
            </article>
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">High/Critical</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{anomalySummary.high + anomalySummary.critical}</p>
            </article>
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Attack mode recommended</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{anomalySummary.recommendedAttackMode}</p>
            </article>
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Attack mode enabled</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{anomalySummary.attackModeEnabled}</p>
            </article>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Blocked Runtime Incidents"
        subtitle="Users can file an appeal for blocked workloads. Owners and admins can unblock from this panel."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Incidents</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{incidentSummary.total}</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Blocked now</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{incidentSummary.blockedCount}</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">High risk blocked</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{incidentSummary.criticalBlocked}</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Pending appeals</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{incidentSummary.pendingAppeals}</p>
          </article>
        </div>

        {!incidents.length ? (
          <p className="mt-4 text-sm text-slate-600">No incidents found for this scope.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {incidents.map((incident) => {
              const latestAppeal = incident.appeals[0];
              const isHighlighted = highlightedIncidentId === incident.id;
              const canAppeal = incident.blocked && incident.status !== 'resolved' && incident.status !== 'dismissed';

              return (
                <article
                  key={incident.id}
                  className={`rounded-xl border p-4 ${
                    isHighlighted
                      ? 'border-sky-300 bg-sky-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{incident.title}</p>
                      <p className="text-xs text-slate-500">{incident.projectName} ({incident.projectSlug})</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${incidentSeverityClassName(incident.severity)}`}>
                        {incident.severity.toUpperCase()}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${incidentStatusClassName(incident.status)}`}>
                        {formatStatus(incident.status)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                          incident.blocked
                            ? 'border-rose-200 bg-rose-100 text-rose-800'
                            : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {incident.blocked ? 'Blocked' : 'Unblocked'}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-slate-700">{incident.description}</p>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="panel-muted p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-800">Detected</p>
                      <p>{formatDateTime(incident.detectedAt)}</p>
                    </div>
                    <div className="panel-muted p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-800">Reason</p>
                      <p>{incident.reasonCode ?? incident.category}</p>
                    </div>
                    <div className="panel-muted p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-800">Appeals</p>
                      <p>{incident.appealCount} total ({incident.pendingAppealCount} pending)</p>
                    </div>
                  </div>

                  {latestAppeal ? (
                    <div className="mt-3 panel-muted p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-800">
                        Latest appeal: {formatStatus(latestAppeal.status)}
                      </p>
                      <p className="mt-1">{latestAppeal.message}</p>
                      <p className="mt-1 text-slate-500">
                        By {latestAppeal.requestedBy.name ?? latestAppeal.requestedBy.email} at {formatDateTime(latestAppeal.createdAt)}
                      </p>
                      {latestAppeal.decisionNote ? (
                        <p className="mt-1 text-slate-600">Decision: {latestAppeal.decisionNote}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {incident.resolutionNote ? (
                    <p className="mt-3 text-xs text-emerald-700">Resolution: {incident.resolutionNote}</p>
                  ) : null}

                  {canAppeal ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={appealDrafts[incident.id] ?? ''}
                        onChange={(event) =>
                          setAppealDrafts((current) => ({
                            ...current,
                            [incident.id]: event.target.value,
                          }))
                        }
                        className="field-input min-h-24"
                        placeholder="Explain why this block should be reviewed (minimum 10 characters)."
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleAppealSubmit(incident.id)}
                          disabled={appealingIncidentId === incident.id}
                        >
                          {appealingIncidentId === incident.id ? 'Submitting appeal...' : 'Submit appeal'}
                        </button>
                        {canUnblockIncidents ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleUnblockIncident(incident.id)}
                            disabled={unblockingIncidentId === incident.id}
                          >
                            {unblockingIncidentId === incident.id ? 'Unblocking...' : 'Admin unblock'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">Owner or admin approval is required to unblock.</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Project Threat Status"
        subtitle="Risk is calculated from CPU and bandwidth spikes over the recent baseline."
      >
        {loading && !report ? (
          <p className="text-sm text-slate-600">Loading anomaly report...</p>
        ) : null}

        {!loading && report?.projects.length === 0 ? (
          <p className="text-sm text-slate-600">No projects available for detection yet.</p>
        ) : null}

        {report?.projects.length ? (
          <div className="space-y-3">
            {report.projects.map((project) => (
              <article key={project.projectId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{project.projectName}</p>
                    <p className="text-xs text-slate-500">{project.projectSlug}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityClassName(project.severity)}`}>
                      {project.severity.toUpperCase()}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      Risk {project.riskScore}/100
                    </span>
                    <button
                      type="button"
                      className={project.attackModeEnabled ? 'btn-secondary' : 'btn-primary'}
                      disabled={pendingProjectId === project.projectId}
                      onClick={() => handleAttackModeToggle(project.projectId, !project.attackModeEnabled)}
                    >
                      {pendingProjectId === project.projectId
                        ? 'Saving...'
                        : project.attackModeEnabled
                          ? 'Disable Attack Mode'
                          : 'Enable Attack Mode'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <div className="panel-muted p-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Bandwidth now</p>
                    <p className="text-sm font-semibold text-slate-900">{formatBytes(project.metrics.currentBandwidthBytes)}</p>
                    <p className="text-xs text-slate-600">{project.metrics.currentBandwidthMbps.toFixed(2)} Mbps</p>
                  </div>
                  <div className="panel-muted p-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Bandwidth spike</p>
                    <p className="text-sm font-semibold text-slate-900">{project.metrics.bandwidthSpikeRatio.toFixed(2)}x</p>
                    <p className="text-xs text-slate-600">Baseline {formatBytes(project.metrics.baselineBandwidthBytesAvg)}</p>
                  </div>
                  <div className="panel-muted p-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">CPU now</p>
                    <p className="text-sm font-semibold text-slate-900">{project.metrics.currentCpuMillicoresAverage.toFixed(0)} mCPU avg</p>
                    <p className="text-xs text-slate-600">{Number(project.metrics.currentCpuMillicoreSeconds).toLocaleString()} mCPU-s</p>
                  </div>
                  <div className="panel-muted p-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">CPU spike</p>
                    <p className="text-sm font-semibold text-slate-900">{project.metrics.cpuSpikeRatio.toFixed(2)}x</p>
                    <p className="text-xs text-slate-600">
                      Baseline {Number(project.metrics.baselineCpuMillicoreSecondsAvg).toLocaleString()} mCPU-s
                    </p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1 text-xs text-slate-700">
                  {project.signals.map((signal, index) => (
                    <li key={`${project.projectId}-signal-${index}`}>- {signal}</li>
                  ))}
                </ul>

                {(project.ddosSuspected || project.abuseSuspected) ? (
                  <p className="mt-2 text-xs font-medium text-rose-700">
                    {project.ddosSuspected ? 'Potential DDoS detected.' : ''}
                    {project.ddosSuspected && project.abuseSuspected ? ' ' : ''}
                    {project.abuseSuspected ? 'Potential abuse pattern detected.' : ''}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-xs text-slate-500">
          Attack mode applies stricter nginx rate and connection limits. Enable it during active incidents.
        </p>
      </SectionCard>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
