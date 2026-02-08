'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { apiClient } from '../../../../../../lib/api';

/* ---------- types ---------- */
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
  };
  websocket: string;
}

/* ---------- helpers ---------- */
const STATUS_MAP: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  ready: { dot: 'bg-green-500', bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Ready' },
  failed: { dot: 'bg-red-500', bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Failed' },
  building: { dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Building' },
  deploying: { dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Deploying' },
  queued: { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Queued' },
  rolled_back: { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Rolled back' },
};

function statusInfo(status: string) {
  return STATUS_MAP[status] ?? { dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', label: status };
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

/* ================================================================== */
export default function DeploymentDetailPage() {
  const { projectId, deploymentId } = useParams<{ projectId: string; deploymentId: string }>();
  const [deployment, setDeployment] = useState<DeploymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logsTab, setLogsTab] = useState<'build' | 'deploy' | 'error'>('build');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = (await apiClient.get(`/deployments/${deploymentId}`)) as DeploymentDetail;
      setDeployment(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  /* Auto-poll while building/deploying */
  useEffect(() => {
    if (!deployment) return;
    if (!['queued', 'building', 'deploying'].includes(deployment.status)) return;
    const interval = setInterval(() => {
      load().catch(() => undefined);
    }, 4000);
    return () => clearInterval(interval);
  }, [deployment?.status, load]);

  if (loading) {
    return (
      <div className="section-band">
        <p className="text-sm text-slate-500">Loading deployment…</p>
      </div>
    );
  }

  if (error || !deployment) {
    return (
      <div className="section-band">
        <p className="text-sm text-red-600">{error || 'Deployment not found.'}</p>
        <Link href={`/projects/${projectId}`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← Back to project
        </Link>
      </div>
    );
  }

  const st = statusInfo(deployment.status);
  const isActive = deployment.project.activeDeploymentId === deployment.deploymentId;
  const isInProgress = ['queued', 'building', 'deploying'].includes(deployment.status);
  const duration = formatDuration(deployment.createdAt, deployment.finishedAt);
  const deploymentUrl = deployment.url ?? (deployment.domain ? `http://${deployment.domain}` : null);

  return (
    <div className="space-y-0">
      {/* ---- Breadcrumbs ---- */}
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
          <span className="text-slate-700 font-medium">Deployments</span>
          <span>/</span>
          <span className="text-slate-700 font-medium mono">{deployment.deploymentId.slice(0, 9)}…</span>
        </div>
      </div>

      {/* ---- Main two-column layout (like Vercel) ---- */}
      <div className="section-band">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
          {/* ---- LEFT: Preview / deployment snapshot ---- */}
          <div className="space-y-5">
            {/* Preview card */}
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              {deploymentUrl ? (
                <div className="relative group">
                  <iframe
                    src={deploymentUrl}
                    title="Deployment preview"
                    className="w-full h-[340px] border-none pointer-events-none"
                    sandbox="allow-scripts allow-same-origin"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition" />
                  <a
                    href={deploymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-white transition opacity-0 group-hover:opacity-100"
                  >
                    Open in new tab ↗
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[340px] bg-slate-50">
                  {isInProgress ? (
                    <div className="text-center">
                      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                      <p className="text-sm font-medium text-slate-600 capitalize">{deployment.status}…</p>
                      <p className="mt-1 text-xs text-slate-400">Preview will be available when deployment is ready</p>
                    </div>
                  ) : deployment.status === 'failed' ? (
                    <div className="text-center px-6">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                        <span className="text-lg">✕</span>
                      </div>
                      <p className="text-sm font-medium text-red-700">Deployment failed</p>
                      {deployment.errorMessage && (
                        <p className="mt-2 text-xs text-red-500 max-w-md">{deployment.errorMessage}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No preview available</p>
                  )}
                </div>
              )}
            </div>

            {/* Build / Deploy logs */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
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
                        logsTab === tab ? 'text-slate-900 bg-white' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="capitalize">{tab} Logs</span>
                      {hasContent && (
                        <span className={`ml-1.5 inline-flex h-1.5 w-1.5 rounded-full ${
                          tab === 'error' ? 'bg-red-500' : 'bg-slate-400'
                        }`} />
                      )}
                      {logsTab === tab && (
                        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-slate-900 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="bg-slate-950 p-4 max-h-[400px] overflow-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
                  {logsTab === 'build' && (deployment.buildLogs || 'No build logs available.')}
                  {logsTab === 'deploy' && (deployment.deployLogs || 'No deploy logs available.')}
                  {logsTab === 'error' && (deployment.errorMessage || 'No errors.')}
                </pre>
              </div>
            </div>
          </div>

          {/* ---- RIGHT: Deployment info panel ---- */}
          <div className="space-y-6">
            {/* Deployment header */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Deployment</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 break-all">
                {deployment.project.slug}-{deployment.deploymentId.slice(0, 8)}
              </h2>
            </div>

            {/* Domains */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Domains</p>
              <div className="mt-2 space-y-1.5">
                {deployment.domain ? (
                  <a
                    href={deploymentUrl ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-800 hover:text-blue-600 font-medium transition"
                  >
                    {deployment.domain}
                    <svg className="h-3.5 w-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No domain assigned</p>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Status</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {isInProgress && (
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${st.dot} opacity-75`} />
                    )}
                    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${st.dot}`} />
                  </span>
                  <span className={`text-sm font-semibold ${st.text}`}>{st.label}</span>
                  {isActive && (
                    <span className="inline-flex items-center rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white ml-1">
                      LIVE
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Created</p>
                <p className="mt-2 text-sm text-slate-800">{formatDate(deployment.createdAt)}</p>
                {deployment.createdByName && (
                  <p className="text-xs text-slate-500 mt-0.5">by {deployment.createdByName}</p>
                )}
              </div>
            </div>

            {/* Duration */}
            {duration && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Duration</p>
                <p className="mt-2 text-sm text-slate-800 font-medium">{duration}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDateTime(deployment.createdAt)} → {formatDateTime(deployment.finishedAt!)}
                </p>
              </div>
            )}

            {/* Environment */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Environment</p>
              <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                deployment.environment === 'production'
                  ? 'bg-slate-900 text-white'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {deployment.environment}
              </span>
            </div>

            {/* Source */}
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
                    <span className="text-slate-400">-○-</span>
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
                    className="text-xs text-slate-500 hover:text-slate-700 hover:underline break-all"
                  >
                    {deployment.project.repoFullName ?? deployment.gitUrl}
                  </a>
                )}
              </div>
            </div>

            {/* Service type */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Service Type</p>
              <p className="mt-2 text-sm text-slate-800 capitalize">
                {deployment.project.serviceType.replace('_', ' ')}
              </p>
            </div>

            {/* Image tag (dev detail) */}
            {deployment.imageTag && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Image</p>
                <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-600 break-all">
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
