'use client';

import { useEffect, useMemo, useState } from 'react';

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

export default function SecurityPage() {
  const { selectedOrganizationId, projects, refresh } = useWorkspaceContext();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [report, setReport] = useState<AnomalyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingProjectId, setPendingProjectId] = useState('');

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
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams({
        organizationId: selectedOrganizationId,
        windowMinutes: '5',
        baselineMinutes: '120',
      });
      if (selectedProjectId) {
        query.set('projectId', selectedProjectId);
      }

      const data = (await apiClient.get(`/security/anomalies?${query.toString()}`)) as AnomalyReportResponse;
      setReport(data);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
      setReport(null);
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

  const summary = useMemo(() => report?.summary ?? null, [report]);

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

        {summary ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Projects monitored</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{summary.totalProjects}</p>
            </article>
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">High/Critical</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{summary.high + summary.critical}</p>
            </article>
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Attack mode recommended</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{summary.recommendedAttackMode}</p>
            </article>
            <article className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Attack mode enabled</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{summary.attackModeEnabled}</p>
            </article>
          </div>
        ) : null}
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
