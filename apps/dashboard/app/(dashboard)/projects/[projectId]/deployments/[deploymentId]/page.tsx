'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { apiClient } from '../../../../../../lib/api';

/* ---------- types ---------- */
interface DeploymentListItem {
  id: string;
  status: string;
  environment: string;
  branch: string | null;
  commitSha: string | null;
  imageTag: string | null;
  createdAt: string;
  isCanary?: boolean;
  canaryStartedAt?: string | null;
  canaryPromotedAt?: string | null;
}

interface DeploymentDetail {
  deploymentId: string;
  status: string;
  environment: string;
  domain: string | null;
  url: string | null;
  branch: string | null;
  commitSha: string | null;
  imageTag: string | null;
  buildLogs: string | null;
  deployLogs: string | null;
  errorMessage: string | null;
  gitUrl: string | null;
  isCanary: boolean;
  canaryStartedAt: string | null;
  canaryPromotedAt: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdByName: string | null;
  project: {
    id: string;
    name: string;
    slug: string;
    repoUrl: string | null;
    repoFullName: string | null;
    serviceType: string;
    activeDeploymentId: string | null;
    canaryDeploymentId: string | null;
    canaryPercent: number | null;
  };
  websocket: string;
}

/* ---------- helpers ---------- */
type CanarySourceMode = 'latest' | 'preview' | 'candidate' | 'explicit';
type PendingAction = '' | 'cancel' | 'start' | 'percent' | 'promote' | 'abort';
type StatusUi = { dot: string; bg: string; text: string; label: string };

const STATUS_MAP: Record<string, StatusUi> = {
  ready: { dot: 'bg-slate-400', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-900', label: 'Ready' },
  failed: { dot: 'bg-slate-900', bg: 'bg-slate-200 border-slate-400', text: 'text-slate-900', label: 'Failed' },
  canceled: { dot: 'bg-slate-600', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-800', label: 'Canceled' },
  building: { dot: 'bg-slate-700', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-700', label: 'Building' },
  deploying: { dot: 'bg-slate-700', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-700', label: 'Deploying' },
  queued: { dot: 'bg-slate-500', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', label: 'Queued' },
  rolled_back: { dot: 'bg-slate-600', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700', label: 'Rolled back' },
};

const FALLBACK_STATUS_UI: StatusUi = {
  dot: 'bg-slate-400',
  bg: 'bg-slate-50 border-slate-200',
  text: 'text-slate-600',
  label: 'Unknown',
};

function statusInfo(status: string, errorMessage?: string | null): StatusUi {
  if (status === 'failed' && (errorMessage ?? '').toLowerCase().includes('canceled by user')) {
    return STATUS_MAP.canceled ?? FALLBACK_STATUS_UI;
  }
  return STATUS_MAP[status] ?? {
    ...FALLBACK_STATUS_UI,
    label: status,
  };
}

function formatDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDeploymentOptionLabel(deployment: DeploymentListItem): string {
  const envLabel = deployment.environment === 'preview' ? 'preview' : deployment.isCanary ? 'canary' : 'production';
  const refLabel = deployment.commitSha ? deployment.commitSha.slice(0, 7) : deployment.branch ?? 'manual';
  return `${deployment.id.slice(0, 8)} - ${envLabel} - ${refLabel}`;
}

function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 99) {
    return null;
  }

  return parsed;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/* ================================================================== */
export default function DeploymentDetailPage() {
  const params = useParams<{ projectId: string; deploymentId: string }>();
  const { projectId, deploymentId } = params ?? { projectId: '', deploymentId: '' };
  const router = useRouter();
  const [deployment, setDeployment] = useState<DeploymentDetail | null>(null);
  const [projectDeployments, setProjectDeployments] = useState<DeploymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>('');
  const [logsTab, setLogsTab] = useState<'build' | 'deploy' | 'error'>('build');
  const [queuedRefreshUntil, setQueuedRefreshUntil] = useState<number | null>(null);
  const [canarySourceMode, setCanarySourceMode] = useState<CanarySourceMode>('latest');
  const [canaryPercentInput, setCanaryPercentInput] = useState('10');
  const [selectedPreviewDeploymentId, setSelectedPreviewDeploymentId] = useState('');
  const [selectedCandidateDeploymentId, setSelectedCandidateDeploymentId] = useState('');
  const [explicitBranch, setExplicitBranch] = useState('');
  const [explicitCommitSha, setExplicitCommitSha] = useState('');
  const [explicitImageTag, setExplicitImageTag] = useState('');

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = (await apiClient.get(`/deployments/${deploymentId}`)) as DeploymentDetail;
      setDeployment(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [deploymentId]);

  const loadProjectDeployments = useCallback(async () => {
    if (!projectId) {
      return;
    }

    try {
      const data = (await apiClient.get(`/deployments?projectId=${projectId}`)) as {
        deployments?: DeploymentListItem[];
      };
      setProjectDeployments(data.deployments ?? []);
    } catch {
      setProjectDeployments([]);
    }
  }, [projectId]);

  useEffect(() => {
    load().catch(() => undefined);
    loadProjectDeployments().catch(() => undefined);
  }, [load, loadProjectDeployments]);

  useEffect(() => {
    if (!deployment) {
      return;
    }

    const nextPercent =
      deployment.project.canaryPercent && deployment.project.canaryPercent > 0
        ? deployment.project.canaryPercent
        : 10;
    setCanaryPercentInput(String(nextPercent));
    setExplicitBranch(deployment.branch ?? '');
  }, [deployment?.deploymentId, deployment?.project.canaryPercent, deployment?.branch]);

  /* Auto-poll while building/deploying */
  useEffect(() => {
    if (!deployment) return;
    if (!['queued', 'building', 'deploying'].includes(deployment.status)) return;
    const interval = setInterval(() => {
      load({ silent: true }).catch(() => undefined);
    }, 4000);
    return () => clearInterval(interval);
  }, [deployment?.status, load]);

  useEffect(() => {
    if (!queuedRefreshUntil) {
      return;
    }

    if (queuedRefreshUntil <= Date.now()) {
      setQueuedRefreshUntil(null);
      return;
    }

    const interval = setInterval(() => {
      if (queuedRefreshUntil <= Date.now()) {
        setQueuedRefreshUntil(null);
        return;
      }
      load({ silent: true }).catch(() => undefined);
      loadProjectDeployments().catch(() => undefined);
    }, 3000);

    return () => clearInterval(interval);
  }, [queuedRefreshUntil, load, loadProjectDeployments]);

  const handleCancelDeployment = async () => {
    if (!deployment) {
      return;
    }

    try {
      setPendingAction('cancel');
      setActionMessage('');
      await apiClient.post(`/deployments/${deployment.deploymentId}/cancel`, {});
      await load({ silent: true });
      setActionMessage('Deployment canceled.');
    } catch (err) {
      setActionMessage(`Cancel failed: ${(err as Error).message}`);
    } finally {
      setPendingAction('');
    }
  };

  const handleStartCanary = async () => {
    if (!deployment) {
      return;
    }

    const percent = parsePercentInput(canaryPercentInput);
    if (!percent) {
      setActionMessage('Enter a canary percentage between 1 and 99.');
      return;
    }

    const payload: Record<string, string | number> = { percent };
    if (canarySourceMode === 'preview') {
      if (!selectedPreviewDeploymentId) {
        setActionMessage('Choose a preview deployment to reuse as the canary candidate.');
        return;
      }
      payload.previewDeploymentId = selectedPreviewDeploymentId;
    } else if (canarySourceMode === 'candidate') {
      if (!selectedCandidateDeploymentId) {
        setActionMessage('Choose an existing deployment to reuse as the canary candidate.');
        return;
      }
      payload.candidateDeploymentId = selectedCandidateDeploymentId;
    } else if (canarySourceMode === 'explicit') {
      const branch = explicitBranch.trim();
      const commitSha = explicitCommitSha.trim();
      const imageTag = explicitImageTag.trim();
      if (!branch && !commitSha && !imageTag) {
        setActionMessage('Provide at least one explicit canary source: branch, commit SHA, or image tag.');
        return;
      }
      if (branch) {
        payload.branch = branch;
      }
      if (commitSha) {
        payload.commitSha = commitSha;
      }
      if (imageTag) {
        payload.imageTag = imageTag;
      }
    }

    try {
      setPendingAction('start');
      setActionMessage('');
      const response = (await apiClient.post(`/deployments/${deployment.deploymentId}/canary`, payload)) as {
        deploymentId: string;
      };
      router.push(`/projects/${projectId}/deployments/${response.deploymentId}`);
    } catch (err) {
      setActionMessage(`Canary start failed: ${(err as Error).message}`);
    } finally {
      setPendingAction('');
    }
  };

  const handleUpdateCanaryPercent = async () => {
    if (!deployment) {
      return;
    }

    const percent = parsePercentInput(canaryPercentInput);
    if (!percent) {
      setActionMessage('Enter a canary percentage between 1 and 99.');
      return;
    }

    try {
      setPendingAction('percent');
      setActionMessage('');
      const response = (await apiClient.patch(`/deployments/${deployment.deploymentId}/canary/percent`, {
        percent,
      })) as { message?: string };
      setQueuedRefreshUntil(Date.now() + 45000);
      setActionMessage(response.message ?? `Canary traffic update queued for ${percent}%.`);
      await load({ silent: true });
    } catch (err) {
      setActionMessage(`Canary traffic update failed: ${(err as Error).message}`);
    } finally {
      setPendingAction('');
    }
  };

  const handlePromoteCanary = async () => {
    if (!deployment) {
      return;
    }

    try {
      setPendingAction('promote');
      setActionMessage('');
      const response = (await apiClient.post(`/deployments/${deployment.deploymentId}/canary/promote`, {})) as {
        message?: string;
      };
      setQueuedRefreshUntil(Date.now() + 45000);
      setActionMessage(response.message ?? 'Canary promotion queued.');
      await load({ silent: true });
    } catch (err) {
      setActionMessage(`Canary promote failed: ${(err as Error).message}`);
    } finally {
      setPendingAction('');
    }
  };

  const handleAbortCanary = async () => {
    if (!deployment) {
      return;
    }

    try {
      setPendingAction('abort');
      setActionMessage('');
      const response = (await apiClient.post(`/deployments/${deployment.deploymentId}/canary/abort`, {})) as {
        message?: string;
      };
      setQueuedRefreshUntil(Date.now() + 45000);
      setActionMessage(response.message ?? 'Canary abort queued.');
      await load({ silent: true });
    } catch (err) {
      setActionMessage(`Canary abort failed: ${(err as Error).message}`);
    } finally {
      setPendingAction('');
    }
  };

  const readyPreviewDeployments = useMemo(
    () =>
      projectDeployments.filter(
        (candidate) =>
          candidate.id !== deploymentId &&
          candidate.environment === 'preview' &&
          candidate.status === 'ready',
      ),
    [projectDeployments, deploymentId],
  );

  const reusableCandidateDeployments = useMemo(
    () =>
      projectDeployments.filter(
        (candidate) =>
          candidate.id !== deploymentId &&
          candidate.environment === 'production' &&
          !candidate.isCanary &&
          ['ready', 'rolled_back'].includes(candidate.status) &&
          Boolean(candidate.imageTag || candidate.commitSha || candidate.branch),
      ),
    [projectDeployments, deploymentId],
  );

  if (loading && !deployment) {
    return (
      <div className="space-y-0">
        <div className="section-band !pb-0">
          <div className="flex items-center gap-1.5">
            <SkeletonBlock className="h-3 w-12 rounded" />
            <SkeletonBlock className="h-3 w-3 rounded" />
            <SkeletonBlock className="h-3 w-24 rounded" />
            <SkeletonBlock className="h-3 w-3 rounded" />
            <SkeletonBlock className="h-3 w-20 rounded" />
          </div>
        </div>

        <div className="section-band">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <SkeletonBlock className="h-[320px] w-full rounded-xl" />
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex gap-2">
                  <SkeletonBlock className="h-8 w-24 rounded-lg" />
                  <SkeletonBlock className="h-8 w-24 rounded-lg" />
                  <SkeletonBlock className="h-8 w-24 rounded-lg" />
                </div>
                <SkeletonBlock className="mt-4 h-56 w-full rounded-xl" />
              </div>
            </div>

            <div className="space-y-4">
              {[0, 1, 2, 3, 4].map((placeholder) => (
                <div key={placeholder} className="rounded-xl border border-slate-200 p-4">
                  <SkeletonBlock className="h-3 w-24 rounded" />
                  <SkeletonBlock className="mt-2 h-4 w-40 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="section-band">
        <p className="text-sm text-slate-500">Loading deployment...</p>
      </div>
    );
  }

  if (error || !deployment) {
    return (
      <div className="section-band">
        <p className="text-sm text-slate-900">{error || 'Deployment not found.'}</p>
        <Link href={`/projects/${projectId}`} className="mt-3 inline-block text-sm text-slate-900 hover:underline">
          Back to project
        </Link>
      </div>
    );
  }

  const st = statusInfo(deployment.status, deployment.errorMessage);
  const statusDot = st.dot;
  const statusText = st.text;
  const statusLabel = st.label;
  const isActive = deployment.project.activeDeploymentId === deployment.deploymentId;
  const isActiveCanary = deployment.project.canaryDeploymentId === deployment.deploymentId;
  const isInProgress = ['queued', 'building', 'deploying'].includes(deployment.status);
  const duration = formatDuration(deployment.createdAt, deployment.finishedAt);
  const deploymentUrl = deployment.url ?? (deployment.domain ? `http://${deployment.domain}` : null);
  const canStartCanary =
    deployment.environment === 'production' &&
    deployment.status === 'ready' &&
    isActive &&
    !deployment.isCanary &&
    !deployment.project.canaryDeploymentId;
  const currentCanaryPercent =
    deployment.project.canaryDeploymentId || isActiveCanary
      ? Math.max(0, Math.min(99, deployment.project.canaryPercent ?? 0))
      : 0;
  const canaryStablePercent = Math.max(0, 100 - currentCanaryPercent);

  return (
    <div className="space-y-0">
      <div className="section-band !pb-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/projects" className="hover:text-slate-800 hover:underline">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-slate-800 hover:underline">
            {deployment.project.name}
          </Link>
          <span>/</span>
          <span className="font-medium text-slate-700">Deployments</span>
          <span>/</span>
          <span className="font-medium text-slate-700 mono">{deployment.deploymentId.slice(0, 9)}...</span>
        </div>
      </div>

      <div className="section-band">
        {actionMessage ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {actionMessage}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {deploymentUrl ? (
                <div className="group relative">
                  <iframe
                    src={deploymentUrl}
                    title="Deployment preview"
                    className="h-[340px] w-full border-none pointer-events-none"
                    sandbox="allow-scripts allow-same-origin"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/5" />
                  <a
                    href={deploymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white"
                  >
                    Open in new tab
                  </a>
                </div>
              ) : (
                <div className="flex h-[340px] items-center justify-center bg-slate-50">
                  {isInProgress ? (
                    <div className="text-center">
                      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                      <p className="text-sm font-medium capitalize text-slate-600">{deployment.status}...</p>
                      <p className="mt-1 text-xs text-slate-400">Preview will be available when deployment is ready.</p>
                    </div>
                  ) : deployment.status === 'failed' ? (
                    <div className="px-6 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                        <span className="text-lg">x</span>
                      </div>
                      <p className="text-sm font-medium text-red-700">Deployment failed</p>
                      {deployment.errorMessage && (
                        <p className="mt-2 max-w-md text-xs text-red-500">{deployment.errorMessage}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No preview available.</p>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex border-b border-slate-200 bg-slate-50">
                {(['build', 'deploy', 'error'] as const).map((tab) => {
                  const hasContent =
                    tab === 'build' ? !!deployment.buildLogs :
                    tab === 'deploy' ? !!deployment.deployLogs :
                    !!deployment.errorMessage;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setLogsTab(tab)}
                      className={`relative px-4 py-2.5 text-xs font-medium transition ${
                        logsTab === tab ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="capitalize">{tab} logs</span>
                      {hasContent && (
                        <span className={`ml-1.5 inline-flex h-1.5 w-1.5 rounded-full ${
                          tab === 'error' ? 'bg-red-500' : 'bg-slate-400'
                        }`} />
                      )}
                      {logsTab === tab && (
                        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-slate-900" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="max-h-[400px] overflow-auto bg-slate-950 p-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                  {logsTab === 'build' && (deployment.buildLogs || 'No build logs available.')}
                  {logsTab === 'deploy' && (deployment.deployLogs || 'No deploy logs available.')}
                  {logsTab === 'error' && (deployment.errorMessage || 'No errors.')}
                </pre>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Deployment</p>
              <h2 className="mt-1 break-all text-lg font-semibold text-slate-900">
                {deployment.project.slug}-{deployment.deploymentId.slice(0, 8)}
              </h2>
              {isInProgress ? (
                <button
                  type="button"
                  className="mt-3 rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-slate-300"
                  onClick={handleCancelDeployment}
                  disabled={pendingAction !== ''}
                >
                  {pendingAction === 'cancel' ? 'Cancelling...' : 'Cancel deployment'}
                </button>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Canary Release</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">
                    {isActiveCanary ? 'Manage live canary traffic' : 'Gradual release controls'}
                  </h3>
                </div>
                {isActiveCanary ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                    Live canary
                  </span>
                ) : null}
              </div>

              {canStartCanary ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-slate-600">
                    Start a canary from this active production deployment. Traffic stays on the stable baseline until the new deployment is ready.
                  </p>

                  <div className="grid gap-4 md:grid-cols-[120px_1fr]">
                    <label>
                      <span className="field-label">Percent</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={canaryPercentInput}
                        onChange={(event) => setCanaryPercentInput(event.target.value)}
                        className="field-input"
                      />
                    </label>

                    <div>
                      <span className="field-label">Source</span>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        {[
                          { value: 'latest', label: 'Latest branch head' },
                          { value: 'preview', label: 'Ready preview deployment' },
                          { value: 'candidate', label: 'Existing deployment' },
                          { value: 'explicit', label: 'Explicit branch / commit / image' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                              canarySourceMode === option.value
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                            onClick={() => setCanarySourceMode(option.value as CanarySourceMode)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {canarySourceMode === 'latest' ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      The canary will build from the latest commit on <span className="font-semibold text-slate-800">{deployment.branch ?? 'the configured branch'}</span>.
                    </div>
                  ) : null}

                  {canarySourceMode === 'preview' ? (
                    <label className="block">
                      <span className="field-label">Preview deployment</span>
                      <select
                        value={selectedPreviewDeploymentId}
                        onChange={(event) => setSelectedPreviewDeploymentId(event.target.value)}
                        className="field-input"
                      >
                        <option value="">Choose a ready preview deployment</option>
                        {readyPreviewDeployments.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {formatDeploymentOptionLabel(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {canarySourceMode === 'candidate' ? (
                    <label className="block">
                      <span className="field-label">Existing deployment</span>
                      <select
                        value={selectedCandidateDeploymentId}
                        onChange={(event) => setSelectedCandidateDeploymentId(event.target.value)}
                        className="field-input"
                      >
                        <option value="">Choose a reusable deployment</option>
                        {reusableCandidateDeployments.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {formatDeploymentOptionLabel(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {canarySourceMode === 'explicit' ? (
                    <div className="grid gap-4">
                      <label>
                        <span className="field-label">Branch</span>
                        <input
                          value={explicitBranch}
                          onChange={(event) => setExplicitBranch(event.target.value)}
                          className="field-input"
                          placeholder="main"
                        />
                      </label>
                      <label>
                        <span className="field-label">Commit SHA</span>
                        <input
                          value={explicitCommitSha}
                          onChange={(event) => setExplicitCommitSha(event.target.value)}
                          className="field-input font-mono text-xs"
                          placeholder="abc1234"
                        />
                      </label>
                      <label>
                        <span className="field-label">Image tag</span>
                        <input
                          value={explicitImageTag}
                          onChange={(event) => setExplicitImageTag(event.target.value)}
                          className="field-input font-mono text-xs"
                          placeholder="registry.example.com/project:sha"
                        />
                      </label>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleStartCanary}
                    disabled={pendingAction !== ''}
                  >
                    {pendingAction === 'start' ? 'Starting canary...' : 'Start canary'}
                  </button>
                </div>
              ) : null}

              {isActiveCanary ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {currentCanaryPercent}% of traffic is routed to this deployment. Stable traffic remains at {canaryStablePercent}% until you promote or abort.
                  </div>

                  <div className="grid gap-4 md:grid-cols-[120px_1fr]">
                    <label>
                      <span className="field-label">Percent</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={canaryPercentInput}
                        onChange={(event) => setCanaryPercentInput(event.target.value)}
                        className="field-input"
                      />
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleUpdateCanaryPercent}
                        disabled={pendingAction !== ''}
                      >
                        {pendingAction === 'percent' ? 'Updating...' : 'Update traffic'}
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handlePromoteCanary}
                        disabled={pendingAction !== ''}
                      >
                        {pendingAction === 'promote' ? 'Promoting...' : 'Promote to 100%'}
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleAbortCanary}
                        disabled={pendingAction !== ''}
                      >
                        {pendingAction === 'abort' ? 'Aborting...' : 'Abort canary'}
                      </button>
                    </div>
                  </div>

                  {deployment.canaryStartedAt ? (
                    <p className="text-xs text-slate-500">Canary started {formatDateTime(deployment.canaryStartedAt)}.</p>
                  ) : null}
                </div>
              ) : null}

              {!canStartCanary && !isActiveCanary && deployment.project.canaryDeploymentId ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-slate-600">
                    A canary is already active for this project at {deployment.project.canaryPercent ?? 0}% traffic.
                  </p>
                  <Link
                    href={`/projects/${projectId}/deployments/${deployment.project.canaryDeploymentId}`}
                    className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Open active canary
                  </Link>
                </div>
              ) : null}

              {!canStartCanary && !isActiveCanary && !deployment.project.canaryDeploymentId && deployment.canaryPromotedAt ? (
                <p className="mt-4 text-sm text-slate-600">
                  This deployment was promoted from a canary on {formatDateTime(deployment.canaryPromotedAt)}.
                </p>
              ) : null}

              {!canStartCanary && !isActiveCanary && deployment.isCanary && deployment.status === 'rolled_back' ? (
                <p className="mt-4 text-sm text-slate-600">
                  This canary was aborted and traffic was returned to the stable deployment.
                </p>
              ) : null}

              {!canStartCanary &&
              !isActiveCanary &&
              !deployment.project.canaryDeploymentId &&
              !deployment.canaryPromotedAt &&
              !(deployment.isCanary && deployment.status === 'rolled_back') ? (
                <p className="mt-4 text-sm text-slate-600">
                  Canary controls are available on the active production deployment or the live canary deployment.
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Domains</p>
              <div className="mt-2 space-y-1.5">
                {deployment.domain ? (
                  <a
                    href={deploymentUrl ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 transition hover:text-slate-900"
                  >
                    {deployment.domain}
                    <svg className="h-3.5 w-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No domain assigned.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Status</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {isInProgress && (
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusDot} opacity-75`} />
                    )}
                    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusDot}`} />
                  </span>
                  <span className={`text-sm font-semibold ${statusText}`}>{statusLabel}</span>
                  {isActive && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Live
                    </span>
                  )}
                  {isActiveCanary && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Canary
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Created</p>
                <p className="mt-2 text-sm text-slate-800">{formatDate(deployment.createdAt)}</p>
                {deployment.createdByName && (
                  <p className="mt-0.5 text-xs text-slate-500">by {deployment.createdByName}</p>
                )}
              </div>
            </div>

            {duration && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Duration</p>
                <p className="mt-2 text-sm font-medium text-slate-800">{duration}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDateTime(deployment.createdAt)} to {formatDateTime(deployment.finishedAt!)}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Environment</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                  deployment.environment === 'production'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-700 text-white'
                }`}>
                  {deployment.environment}
                </span>
                {deployment.isCanary && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-800">
                    Canary candidate
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Source</p>
              <div className="mt-2 space-y-1.5">
                {deployment.branch && (
                  <div className="flex items-center gap-2 text-sm text-slate-800">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="font-medium">{deployment.branch}</span>
                  </div>
                )}
                {deployment.commitSha && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400">commit</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">
                      {deployment.commitSha.slice(0, 7)}
                    </code>
                  </div>
                )}
                {deployment.gitUrl && (
                  <a
                    href={deployment.gitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-xs text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    {deployment.project.repoFullName ?? deployment.gitUrl}
                  </a>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Service Type</p>
              <p className="mt-2 text-sm capitalize text-slate-800">
                {deployment.project.serviceType.replace('_', ' ')}
              </p>
            </div>

            {deployment.imageTag && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Image</p>
                <code className="mt-2 block break-all rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-600">
                  {deployment.imageTag}
                </code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

