'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { DeployForm } from '../../../../components/deploy-form';
import { LogsTable } from '../../../../components/logs-table';
import { ResourceSlider } from '../../../../components/resource-slider';
import { apiClient } from '../../../../lib/api';
import { useWorkspaceContext } from '../../../../components/workspace-provider';

/* ---------- types ---------- */
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

interface ProjectSecretSummary {
  id: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

interface DeploymentSummary {
  id: string;
  status: string;
  environment: string;
  branch?: string | null;
  commitSha?: string | null;
  domain?: string | null;
  imageTag?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

interface CustomDomainSummary {
  id: string;
  domain: string;
  status: 'pending_verification' | 'active' | 'failed' | 'removing';
  cnameTarget: string;
  verificationToken: string;
  verifiedAt?: string | null;
  certificateIssuedAt?: string | null;
  createdAt: string;
}

interface ProjectUsageMetricPoint {
  day: string;
  total: string;
}

interface ProjectUsageDetails {
  snapshot: {
    projectId: string;
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
  };
  daily: {
    cpu_millicore_seconds: ProjectUsageMetricPoint[];
    ram_mb_seconds: ProjectUsageMetricPoint[];
    bandwidth_bytes: ProjectUsageMetricPoint[];
    request_count: ProjectUsageMetricPoint[];
  };
  insights: {
    avgDailyCpuMillicoreSeconds: string;
    avgDailyRamMbSeconds: string;
    avgDailyBandwidthBytes: string;
    peakBandwidthDay: string | null;
  };
}

type Tab = 'deployments' | 'settings' | 'domains' | 'environment' | 'usage' | 'logs' | 'deploy';

const TABS: { key: Tab; label: string }[] = [
  { key: 'deployments', label: 'Deployments' },
  { key: 'settings', label: 'Settings' },
  { key: 'domains', label: 'Domains' },
  { key: 'environment', label: 'Environment Variables' },
  { key: 'usage', label: 'Usage' },
  { key: 'logs', label: 'Logs' },
  { key: 'deploy', label: 'Deploy' },
];

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/* ================================================================== */

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const { projectId } = params ?? { projectId: '' };
  const router = useRouter();
  const { projects, refresh, loading: workspaceLoading } = useWorkspaceContext();

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const [activeTab, setActiveTab] = useState<Tab>('deployments');
  const [message, setMessage] = useState('');

  /* ---- Deployment state ---- */
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [deploymentAction, setDeploymentAction] = useState('');

  /* ---- Usage state ---- */
  const [usageDetails, setUsageDetails] = useState<ProjectUsageDetails | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  /* ---- Logs state ---- */
  interface LogRow {
    timestamp: string;
    level: string;
    message: string;
    source: string;
  }
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);

  const loadDeployments = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId) return;
    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setDeploymentsLoading(true);
      }
      const data = (await apiClient.get(`/deployments?projectId=${projectId}`)) as {
        deployments?: DeploymentSummary[];
      };
      setDeployments(data.deployments ?? []);
    } catch {
      if (!silent) {
        setDeployments([]);
      }
    } finally {
      if (!silent) {
        setDeploymentsLoading(false);
      }
    }
  }, [projectId]);

  const loadUsage = useCallback(async () => {
    if (!projectId) {
      setUsageDetails(null);
      return;
    }

    try {
      setUsageLoading(true);
      const data = (await apiClient.get(`/usage/projects/${projectId}?days=30`)) as ProjectUsageDetails;
      setUsageDetails(data);
    } catch {
      setUsageDetails(null);
    } finally {
      setUsageLoading(false);
    }
  }, [projectId]);

  const loadLogs = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId) {
      setLogs([]);
      return;
    }

    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setLogsLoading(true);
      }
      const data = (await apiClient.get(`/logs?projectId=${projectId}&limit=200`)) as { logs?: LogRow[] };
      setLogs(data.logs ?? []);
    } catch {
      if (!silent) {
        setLogs([]);
      }
    } finally {
      if (!silent) {
        setLogsLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    loadDeployments().catch(() => undefined);
  }, [loadDeployments]);

  useEffect(() => {
    if (activeTab !== 'usage') {
      return;
    }
    loadUsage().catch(() => undefined);
  }, [activeTab, loadUsage]);

  useEffect(() => {
    if (activeTab !== 'logs') {
      return;
    }
    loadLogs().catch(() => undefined);
  }, [activeTab, loadLogs]);

  // Auto-refresh logs every 3 seconds when on logs tab with auto-refresh enabled
  useEffect(() => {
    if (activeTab !== 'logs' || !autoRefreshLogs) {
      return;
    }
    const interval = setInterval(() => {
      loadLogs({ silent: true }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab, autoRefreshLogs, loadLogs]);

  /** Find the most recent in-progress deployment (queued | building | deploying). */
  const inProgressDeployment = useMemo(
    () => deployments.find((d) => ['queued', 'building', 'deploying'].includes(d.status)) ?? null,
    [deployments],
  );

  /**
   * Auto-poll the deployment list every 5 s while a deployment is in progress.
   * This keeps the list fresh even if the user is on the Deployments tab without
   * a WebSocket connection (e.g. they navigated away and came back).
   */
  useEffect(() => {
    if (!inProgressDeployment) return;
    const interval = setInterval(() => {
      loadDeployments({ silent: true }).catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [inProgressDeployment, loadDeployments]);

  /** Called by DeployForm when a deployment reaches a terminal state. */
  const handleDeploymentComplete = useCallback(() => {
    loadDeployments({ silent: true }).catch(() => undefined);
    refresh().catch(() => undefined);
  }, [loadDeployments, refresh]);

  const handleRollback = async (deploymentId: string) => {
    try {
      setDeploymentAction(deploymentId);
      await apiClient.post(`/deployments/${deploymentId}/rollback`, {});
      setMessage('Rollback initiated — a new deployment will start from the previous image.');
      await loadDeployments();
    } catch (error) {
      setMessage(`Rollback failed: ${(error as Error).message}`);
    } finally {
      setDeploymentAction('');
    }
  };

  const handlePromote = async (deploymentId: string) => {
    try {
      setDeploymentAction(deploymentId);
      await apiClient.post(`/deployments/${deploymentId}/promote`, {});
      setMessage('Promotion initiated — preview deployment will be redeployed to production.');
      await loadDeployments();
    } catch (error) {
      setMessage(`Promote failed: ${(error as Error).message}`);
    } finally {
      setDeploymentAction('');
    }
  };

  /* ---- Settings state ---- */
  const [saving, setSaving] = useState(false);
  const [projectSettings, setProjectSettings] = useState({
    repoUrl: '',
    branch: 'main',
    rootDirectory: '',
    buildCommand: '',
    startCommand: '',
    targetPort: 3000,
    autoDeployEnabled: true,
    serviceType: 'web_service' as 'web_service' | 'static_site' | 'python',
    outputDirectory: '',
    ram: 512,
    cpu: 500,
    bandwidth: 50,
  });

  useEffect(() => {
    if (!project) return;
    setProjectSettings({
      repoUrl: project.repoUrl ?? '',
      branch: project.branch ?? 'main',
      rootDirectory: project.rootDirectory ?? '',
      buildCommand: project.buildCommand ?? '',
      startCommand: project.startCommand ?? '',
      targetPort: project.targetPort ?? 3000,
      autoDeployEnabled: project.autoDeployEnabled,
      serviceType: (project.serviceType as 'web_service' | 'static_site' | 'python') ?? 'web_service',
      outputDirectory: project.outputDirectory ?? '',
      ram: project.resourceRamMb,
      cpu: project.resourceCpuMillicore,
      bandwidth: project.resourceBandwidthGb,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const saveProjectWorkspace = async () => {
    if (!projectId) return;
    try {
      setSaving(true);
      let gitSettingsSaved = true;
      try {
        await apiClient.patch(`/projects/${projectId}/git-settings`, {
          repoUrl: projectSettings.repoUrl || undefined,
          branch: projectSettings.branch,
          rootDirectory: projectSettings.rootDirectory || null,
          buildCommand: projectSettings.buildCommand || null,
          startCommand: projectSettings.startCommand || null,
          targetPort: Number(projectSettings.targetPort),
          autoDeployEnabled: projectSettings.autoDeployEnabled,
          serviceType: projectSettings.serviceType,
          outputDirectory: projectSettings.outputDirectory || null,
        });
      } catch (error) {
        const msg = (error as Error).message.toLowerCase();
        if (msg.includes('404') || msg.includes('not found')) {
          gitSettingsSaved = false;
        } else {
          throw error;
        }
      }
      await apiClient.patch(`/projects/${projectId}/resources`, {
        resourceRamMb: Number(projectSettings.ram),
        resourceCpuMillicore: Number(projectSettings.cpu),
        resourceBandwidthGb: Number(projectSettings.bandwidth),
      });
      await refresh();
      setMessage(
        gitSettingsSaved
          ? 'Settings saved.'
          : 'Allocation saved. Git settings endpoint unavailable on current API build.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Env vars state ---- */
  const [envMessage, setEnvMessage] = useState('');
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);
  const [envDeletingKey, setEnvDeletingKey] = useState('');
  const [projectSecrets, setProjectSecrets] = useState<ProjectSecretSummary[]>([]);
  const [envDraft, setEnvDraft] = useState({ key: '', value: '' });

  useEffect(() => {
    const loadSecrets = async () => {
      if (!projectId) {
        setProjectSecrets([]);
        return;
      }
      try {
        setEnvLoading(true);
        const data = (await apiClient.get(`/projects/${projectId}/secrets`)) as {
          secrets?: ProjectSecretSummary[];
        };
        setProjectSecrets(data.secrets ?? []);
        setEnvMessage('');
      } catch (error) {
        setProjectSecrets([]);
        setEnvMessage((error as Error).message);
      } finally {
        setEnvLoading(false);
      }
    };
    loadSecrets().catch(() => undefined);
  }, [projectId]);

  const saveProjectEnvVar = async () => {
    if (!projectId) return;
    const key = envDraft.key.trim().toUpperCase();
    const value = envDraft.value.trim();
    if (!key || !value) {
      setEnvMessage('Key and value are required.');
      return;
    }
    if (!ENV_KEY_PATTERN.test(key)) {
      setEnvMessage('Key must be uppercase snake case (e.g. DATABASE_URL).');
      return;
    }
    try {
      setEnvSaving(true);
      await apiClient.put(`/projects/${projectId}/secrets/${encodeURIComponent(key)}`, { value });
      const data = (await apiClient.get(`/projects/${projectId}/secrets`)) as {
        secrets?: ProjectSecretSummary[];
      };
      setProjectSecrets(data.secrets ?? []);
      setEnvDraft({ key: '', value: '' });
      setEnvMessage(`${key} saved.`);
    } catch (error) {
      setEnvMessage((error as Error).message);
    } finally {
      setEnvSaving(false);
    }
  };

  const deleteProjectEnvVar = async (key: string) => {
    if (!projectId) return;
    try {
      setEnvDeletingKey(key);
      await apiClient.delete(`/projects/${projectId}/secrets/${encodeURIComponent(key)}`);
      setProjectSecrets((prev) => prev.filter((s) => s.key !== key));
      setEnvMessage(`${key} deleted.`);
    } catch (error) {
      setEnvMessage((error as Error).message);
    } finally {
      setEnvDeletingKey('');
    }
  };

  /* ---- Custom domains state ---- */
  const [domainMessage, setDomainMessage] = useState('');
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainAdding, setDomainAdding] = useState(false);
  const [domainVerifying, setDomainVerifying] = useState('');
  const [domainDeleting, setDomainDeleting] = useState('');
  const [customDomains, setCustomDomains] = useState<CustomDomainSummary[]>([]);
  const [domainDraft, setDomainDraft] = useState('');
  const [domainInstructions, setDomainInstructions] = useState<{
    cname: { host: string; value: string };
    txt: { host: string; value: string };
  } | null>(null);

  const loadDomains = useCallback(async () => {
    if (!projectId) return;
    try {
      setDomainsLoading(true);
      const data = (await apiClient.get(`/projects/${projectId}/domains`)) as {
        domains?: CustomDomainSummary[];
      };
      setCustomDomains(data.domains ?? []);
    } catch (error) {
      setDomainMessage((error as Error).message);
    } finally {
      setDomainsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'domains') {
      loadDomains().catch(() => undefined);
    }
  }, [activeTab, loadDomains]);

  const addDomain = async () => {
    if (!projectId || !domainDraft.trim()) return;
    try {
      setDomainAdding(true);
      setDomainMessage('');
      const result = (await apiClient.post(`/projects/${projectId}/domains`, {
        domain: domainDraft.trim().toLowerCase(),
      })) as {
        domain: CustomDomainSummary;
        instructions: { cname: { host: string; value: string }; txt: { host: string; value: string } };
      };
      setCustomDomains((prev) => [result.domain, ...prev]);
      setDomainInstructions(result.instructions);
      setDomainDraft('');
      setDomainMessage('Domain added — configure DNS records below, then verify.');
    } catch (error) {
      setDomainMessage((error as Error).message);
    } finally {
      setDomainAdding(false);
    }
  };

  const verifyDomain = async (domainId: string) => {
    if (!projectId) return;
    try {
      setDomainVerifying(domainId);
      setDomainMessage('');
      const result = (await apiClient.post(
        `/projects/${projectId}/domains/${domainId}/verify`,
        {},
      )) as { domain: CustomDomainSummary; verification: { verified: boolean; detail: string } };
      setCustomDomains((prev) =>
        prev.map((d) => (d.id === domainId ? result.domain : d)),
      );
      setDomainMessage(
        result.verification.verified
          ? `✓ Domain verified! It may take a few minutes for SSL to propagate.`
          : `DNS not verified yet: ${result.verification.detail}`,
      );
    } catch (error) {
      setDomainMessage((error as Error).message);
    } finally {
      setDomainVerifying('');
    }
  };

  const deleteDomain = async (domainId: string) => {
    if (!projectId) return;
    try {
      setDomainDeleting(domainId);
      await apiClient.delete(`/projects/${projectId}/domains/${domainId}`);
      setCustomDomains((prev) => prev.filter((d) => d.id !== domainId));
      setDomainMessage('Domain removed.');
    } catch (error) {
      setDomainMessage((error as Error).message);
    } finally {
      setDomainDeleting('');
    }
  };

  /* ---- Loading / 404 ---- */
  if (!project) {
    if (workspaceLoading) {
      return (
        <div className="space-y-0">
          <div className="section-band !pb-0">
            <SkeletonBlock className="h-3 w-24 rounded" />
            <div className="mt-4">
              <SkeletonBlock className="h-8 w-56 rounded-xl" />
              <SkeletonBlock className="mt-2 h-3 w-32 rounded" />
            </div>
            <div className="mt-5 flex gap-2 border-b border-slate-200 pb-2">
              {[0, 1, 2, 3, 4, 5].map((placeholder) => (
                <SkeletonBlock key={placeholder} className="h-9 w-24 rounded-lg" />
              ))}
            </div>
          </div>

          <div className="section-band">
            <div className="space-y-2">
              {[0, 1, 2].map((placeholder) => (
                <article key={placeholder} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-56 rounded" />
                      <SkeletonBlock className="h-3 w-32 rounded" />
                    </div>
                    <SkeletonBlock className="h-8 w-20 rounded-lg" />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="section-band">
        <p className="text-sm text-slate-600">Project not found or still loading…</p>
        <Link href="/projects" className="mt-3 inline-block text-sm text-slate-900 hover:underline">
          ← Back to projects
        </Link>
      </div>
    );
  }

  /* ================================================================ */
  return (
    <div className="space-y-0">
      {/* ---- Breadcrumb + project header ---- */}
      <div className="section-band !pb-0">
        <Link href="/projects" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
          ← All projects
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="title-gradient text-2xl font-semibold">{project.name}</h2>
            <p className="mono mt-1 text-xs text-slate-600">{project.slug}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-800 hover:underline"
              >
                {project.repoFullName ?? project.repoUrl}
              </a>
            )}
            {project.activeDeploymentId && (
              <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                Active deployment
              </span>
            )}
          </div>
        </div>

        {/* ---- In-progress deployment banner ---- */}
        {inProgressDeployment && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-900" />
            </span>
            <p className="text-sm text-slate-800">
              <span className="font-medium">Deployment in progress</span>
              {' — '}
              <span className="capitalize">{inProgressDeployment.status}</span>
              {inProgressDeployment.branch ? ` on ${inProgressDeployment.branch}` : ''}
              {'. Runs server-side — safe to close the browser.'}
            </p>
            <button
              type="button"
              className="ml-auto text-xs font-medium text-slate-900 hover:underline"
              onClick={() => setActiveTab('deploy')}
            >
              View logs →
            </button>
          </div>
        )}

        {/* ---- Tab bar ---- */}
        <nav className="mt-5 flex gap-0 overflow-x-auto border-b border-slate-200 scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.key === 'deploy' && inProgressDeployment && (
                <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-slate-900 animate-pulse" />
              )}
              {activeTab === tab.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-slate-900 rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ---- Tab content ---- */}
      <div className="section-band">
        {message && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {message}
            <button
              type="button"
              className="ml-3 text-slate-400 hover:text-slate-700"
              onClick={() => setMessage('')}
            >
              ✕
            </button>
          </div>
        )}

        {/* ===== DEPLOYMENTS TAB ===== */}
        {activeTab === 'deployments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Deployment History</h3>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800 underline"
                onClick={() => loadDeployments()}
              >
                Refresh
              </button>
            </div>

            {deploymentsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((placeholder) => (
                  <article key={placeholder} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SkeletonBlock className="h-5 w-14 rounded-full" />
                        <SkeletonBlock className="h-5 w-20 rounded-full" />
                        <SkeletonBlock className="h-4 w-44 rounded" />
                      </div>
                      <div className="flex items-center gap-2">
                        <SkeletonBlock className="h-8 w-20 rounded-lg" />
                        <SkeletonBlock className="h-8 w-20 rounded-lg" />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : deployments.length ? (
              <div className="space-y-2">
                {deployments.map((dep) => {
                  const isActive = project.activeDeploymentId === dep.id;
                  return (
                    <div
                      key={dep.id}
                      role="button"
                      tabIndex={0}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onClick={() => router.push(`/projects/${projectId}/deployments/${dep.id}` as any)}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/projects/${projectId}/deployments/${dep.id}` as any); }}
                    >
                    <article
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition cursor-pointer ${
                        isActive ? 'border-slate-900 bg-slate-100' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Environment badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            dep.environment === 'production'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-700 text-white'
                          }`}
                        >
                          {dep.environment === 'production' ? 'prod' : 'preview'}
                        </span>

                        {/* Status badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            dep.status === 'ready'
                              ? 'bg-slate-200 text-slate-900'
                              : dep.status === 'failed'
                                ? 'bg-slate-900 text-white'
                                : dep.status === 'rolled_back'
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {['queued', 'building', 'deploying'].includes(dep.status) && (
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-slate-900 animate-pulse" />
                          )}
                          {dep.status}
                        </span>

                        {isActive && (
                          <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            LIVE
                          </span>
                        )}

                        <div className="min-w-0">
                          <p className="text-sm text-slate-800 font-medium truncate">
                            {dep.branch ?? 'unknown'}
                            {dep.commitSha ? (
                              <span className="font-normal text-slate-500">
                                {' '}
                                @ {dep.commitSha.slice(0, 7)}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {new Date(dep.createdAt).toLocaleString()}
                            {dep.finishedAt && (
                              <span>
                                {' · '}
                                {Math.round(
                                  (new Date(dep.finishedAt).getTime() -
                                    new Date(dep.createdAt).getTime()) /
                                    1000,
                                )}
                                s
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {dep.domain && dep.status === 'ready' && (
                          <a
                            href={dep.domain.startsWith('http') ? dep.domain : `https://${dep.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200 transition"
                          >
                            Visit →
                          </a>
                        )}

                        {dep.environment === 'production' &&
                          dep.status === 'ready' &&
                          dep.imageTag &&
                          !isActive && (
                            <button
                              type="button"
                              className="rounded-md bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-900 hover:bg-slate-300 transition"
                              onClick={(e) => { e.stopPropagation(); handleRollback(dep.id); }}
                              disabled={deploymentAction === dep.id}
                            >
                              {deploymentAction === dep.id ? '…' : 'Rollback'}
                            </button>
                          )}

                        {dep.environment === 'preview' && dep.status === 'ready' && (
                          <button
                            type="button"
                            className="rounded-md bg-slate-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 transition"
                            onClick={(e) => { e.stopPropagation(); handlePromote(dep.id); }}
                            disabled={deploymentAction === dep.id}
                          >
                            {deploymentAction === dep.id ? '…' : 'Promote'}
                          </button>
                        )}
                      </div>
                    </article>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
                <p className="text-sm text-slate-500">No deployments yet.</p>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-slate-900 hover:underline"
                  onClick={() => setActiveTab('deploy')}
                >
                  Create your first deployment →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Git &amp; Build</h3>
              <p className="mt-1 text-sm text-slate-500">Repository connection, build commands, and deploy triggers.</p>
            </div>

            {/* Service Type */}
            <div className="space-y-2">
              <span className="field-label">Service Type</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
                <button
                  type="button"
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    projectSettings.serviceType === 'web_service'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setProjectSettings((p) => ({ ...p, serviceType: 'web_service' }))}
                >
                  <span className="block">Web Service</span>
                  <span className="block text-[10px] opacity-70">Backend, API, full-stack (Node.js)</span>
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    projectSettings.serviceType === 'python'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setProjectSettings((p) => ({ ...p, serviceType: 'python' }))}
                >
                  <span className="block">Python</span>
                  <span className="block text-[10px] opacity-70">Django, Flask, FastAPI</span>
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    projectSettings.serviceType === 'static_site'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setProjectSettings((p) => ({ ...p, serviceType: 'static_site' }))}
                >
                  <span className="block">Static Site</span>
                  <span className="block text-[10px] opacity-70">React, Vue, Vite, Next export</span>
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="field-label">Repository URL</span>
                <input
                  value={projectSettings.repoUrl}
                  onChange={(e) => setProjectSettings((p) => ({ ...p, repoUrl: e.target.value }))}
                  className="field-input"
                  placeholder="https://github.com/org/repo.git"
                />
              </label>
              <label>
                <span className="field-label">Branch</span>
                <input
                  value={projectSettings.branch}
                  onChange={(e) => setProjectSettings((p) => ({ ...p, branch: e.target.value }))}
                  className="field-input"
                />
              </label>
              <label>
                <span className="field-label">Root directory (monorepo)</span>
                <input
                  value={projectSettings.rootDirectory}
                  onChange={(e) => setProjectSettings((p) => ({ ...p, rootDirectory: e.target.value }))}
                  className="field-input"
                  placeholder="e.g. apps/web (leave blank if root)"
                />
              </label>
              <label>
                <span className="field-label">Port</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={projectSettings.targetPort}
                  onChange={(e) => setProjectSettings((p) => ({ ...p, targetPort: Number(e.target.value) }))}
                  className="field-input"
                />
              </label>
              <label>
                <span className="field-label">Build command</span>
                <input
                  value={projectSettings.buildCommand}
                  onChange={(e) => setProjectSettings((p) => ({ ...p, buildCommand: e.target.value }))}
                  className="field-input"
                  placeholder="npm run build"
                />
              </label>
              {projectSettings.serviceType === 'web_service' && (
                <label>
                  <span className="field-label">Start command</span>
                  <input
                    value={projectSettings.startCommand}
                    onChange={(e) => setProjectSettings((p) => ({ ...p, startCommand: e.target.value }))}
                    className="field-input"
                    placeholder="auto-detect from package.json"
                  />
                </label>
              )}
              {projectSettings.serviceType === 'static_site' && (
                <label>
                  <span className="field-label">Output directory</span>
                  <input
                    value={projectSettings.outputDirectory}
                    onChange={(e) => setProjectSettings((p) => ({ ...p, outputDirectory: e.target.value }))}
                    className="field-input"
                    placeholder="dist"
                  />
                  <span className="text-[10px] text-slate-400">e.g. dist, build, out, .next/out</span>
                </label>
              )}
              <label className="inline-flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={projectSettings.autoDeployEnabled}
                  onChange={(e) => setProjectSettings((p) => ({ ...p, autoDeployEnabled: e.target.checked }))}
                />
                <span className="text-sm text-slate-700">Auto-deploy on push</span>
              </label>
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Resources</h3>
                <p className="mt-1 text-sm text-slate-500">RAM, CPU, and bandwidth allocation for this project.</p>
              </div>
              <ResourceSlider
                label="RAM"
                min={128}
                max={8192}
                step={128}
                value={projectSettings.ram}
                unit="MB"
                onChange={(ram) => setProjectSettings((p) => ({ ...p, ram }))}
              />
              <ResourceSlider
                label="CPU"
                min={100}
                max={8000}
                step={100}
                value={projectSettings.cpu}
                unit="mCPU"
                onChange={(cpu) => setProjectSettings((p) => ({ ...p, cpu }))}
              />
              <ResourceSlider
                label="Bandwidth"
                min={1}
                max={2000}
                value={projectSettings.bandwidth}
                unit="GB"
                onChange={(bandwidth) => setProjectSettings((p) => ({ ...p, bandwidth }))}
              />
            </div>

            <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
              <button
                className="btn-primary"
                type="button"
                onClick={saveProjectWorkspace}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        )}

        {/* ===== DOMAINS TAB ===== */}
        {activeTab === 'domains' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Custom Domains</h3>
              <p className="mt-1 text-sm text-slate-500">
                Connect your own domains to this project. Add a domain, configure DNS at your registrar, then verify.
              </p>
            </div>

            {/* Add domain form */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[240px]">
                <span className="field-label">Domain</span>
                <input
                  value={domainDraft}
                  onChange={(e) => setDomainDraft(e.target.value)}
                  className="field-input"
                  placeholder="app.example.com"
                  onKeyDown={(e) => { if (e.key === 'Enter') addDomain(); }}
                />
              </label>
              <button
                className="btn-primary"
                type="button"
                onClick={addDomain}
                disabled={domainAdding || !domainDraft.trim()}
              >
                {domainAdding ? 'Adding…' : 'Add domain'}
              </button>
            </div>

            {/* DNS instructions (shown after adding a domain) */}
            {domainInstructions && (
              <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-900">Configure DNS records at your domain registrar:</p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-700">Option 1 — CNAME (recommended)</p>
                  <div className="grid gap-2 md:grid-cols-2 text-sm">
                    <div>
                      <span className="text-xs text-slate-600">Type</span>
                      <p className="mono rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-900">CNAME</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-600">Host / Name</span>
                      <p className="mono rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-900 select-all">{domainInstructions.cname.host}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-xs text-slate-600">Points to</span>
                      <p className="mono rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-900 select-all">{domainInstructions.cname.value}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-300 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-700">Option 2 — TXT verification</p>
                  <div className="grid gap-2 md:grid-cols-2 text-sm">
                    <div>
                      <span className="text-xs text-slate-600">Type</span>
                      <p className="mono rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-900">TXT</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-600">Host / Name</span>
                      <p className="mono rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-900 select-all">{domainInstructions.txt.host}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-xs text-slate-600">Value</span>
                      <p className="mono rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-900 select-all">{domainInstructions.txt.value}</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="text-xs text-slate-900 hover:underline"
                  onClick={() => setDomainInstructions(null)}
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Domain list */}
            {domainsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((placeholder) => (
                  <article key={placeholder} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                    <div className="space-y-2 min-w-0">
                      <SkeletonBlock className="h-4 w-44 rounded" />
                      <SkeletonBlock className="h-3 w-64 rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                      <SkeletonBlock className="h-8 w-24 rounded-lg" />
                      <SkeletonBlock className="h-8 w-20 rounded-lg" />
                    </div>
                  </article>
                ))}
              </div>
            ) : customDomains.length ? (
              <div className="space-y-2">
                {customDomains.map((d) => (
                  <article
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="mono text-sm font-medium text-slate-900 truncate">{d.domain}</p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            d.status === 'active'
                              ? 'bg-slate-900 text-white'
                              : d.status === 'pending_verification'
                                ? 'bg-slate-700 text-white'
                                : d.status === 'failed'
                                  ? 'bg-slate-200 text-slate-900'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {d.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        CNAME → <span className="mono select-all">{d.cnameTarget}</span>
                        {d.verifiedAt && (
                          <span> · Verified {new Date(d.verifiedAt).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.status !== 'active' && (
                        <button
                          type="button"
                          className="rounded-md bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-900 hover:bg-slate-300 transition"
                          onClick={() => verifyDomain(d.id)}
                          disabled={domainVerifying === d.id}
                        >
                          {domainVerifying === d.id ? 'Checking…' : 'Verify DNS'}
                        </button>
                      )}
                      {d.status === 'active' && (
                        <a
                          href={`https://${d.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200 transition"
                        >
                          Visit →
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => deleteDomain(d.id)}
                        disabled={domainDeleting === d.id}
                      >
                        {domainDeleting === d.id ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
                <p className="text-sm text-slate-500">No custom domains configured.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Your project is accessible at its default Apployd subdomain.
                </p>
              </div>
            )}

            {domainMessage && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {domainMessage}
                <button
                  type="button"
                  className="ml-3 text-slate-400 hover:text-slate-700"
                  onClick={() => setDomainMessage('')}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== ENVIRONMENT VARIABLES TAB ===== */}
        {activeTab === 'environment' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Environment Variables</h3>
              <p className="mt-1 text-sm text-slate-500">
                Encrypted secrets injected into every deployment for this project.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
              <label>
                <span className="field-label">Key</span>
                <input
                  value={envDraft.key}
                  onChange={(e) => setEnvDraft((p) => ({ ...p, key: e.target.value.toUpperCase() }))}
                  className="field-input"
                  placeholder="DATABASE_URL"
                />
              </label>
              <label>
                <span className="field-label">Value</span>
                <input
                  type="password"
                  value={envDraft.value}
                  onChange={(e) => setEnvDraft((p) => ({ ...p, value: e.target.value }))}
                  className="field-input"
                  placeholder="postgres://…"
                />
              </label>
              <div className="flex items-end">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={saveProjectEnvVar}
                  disabled={envSaving}
                >
                  {envSaving ? 'Saving…' : 'Add'}
                </button>
              </div>
            </div>

            {envLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((placeholder) => (
                  <article key={placeholder} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-28 rounded" />
                      <SkeletonBlock className="h-3 w-52 rounded" />
                    </div>
                    <SkeletonBlock className="h-9 w-20 rounded-xl" />
                  </article>
                ))}
              </div>
            ) : projectSecrets.length ? (
              <div className="space-y-2">
                {projectSecrets.map((secret) => (
                  <article
                    key={secret.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                  >
                    <div>
                      <p className="mono text-sm font-medium text-slate-900">{secret.key}</p>
                      <p className="text-xs text-slate-500">
                        Updated {new Date(secret.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      className="btn-danger"
                      type="button"
                      onClick={() => deleteProjectEnvVar(secret.key)}
                      disabled={envDeletingKey === secret.key}
                    >
                      {envDeletingKey === secret.key ? 'Deleting…' : 'Delete'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
                <p className="text-sm text-slate-500">No environment variables configured.</p>
              </div>
            )}

            {envMessage && <p className="text-sm text-slate-700">{envMessage}</p>}
          </div>
        )}

        {/* ===== USAGE TAB ===== */}
        {activeTab === 'usage' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Project Usage</h3>
                <p className="mt-1 text-sm text-slate-500">
                  CPU, RAM, bandwidth, and request metering for this project.
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800 underline"
                onClick={() => loadUsage()}
              >
                Refresh
              </button>
            </div>

            {usageLoading ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  {[0, 1, 2, 3].map((placeholder) => (
                    <div key={placeholder} className="metric-card">
                      <SkeletonBlock className="h-3 w-16 rounded" />
                      <SkeletonBlock className="mt-2 h-7 w-24 rounded-lg" />
                      <SkeletonBlock className="mt-1 h-3 w-20 rounded" />
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  {[0, 1, 2, 3, 4].map((placeholder) => (
                    <div key={placeholder} className="grid gap-3 md:grid-cols-5">
                      {[0, 1, 2, 3, 4].map((cell) => (
                        <SkeletonBlock key={cell} className="h-4 w-full rounded" />
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : usageDetails ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="metric-card">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">CPU</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {Number(usageDetails.snapshot.derived.cpuCoreHours).toFixed(3)} core-h
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {Number(usageDetails.snapshot.utilization.cpuPercentOfAllocation).toFixed(2)}% allocation
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">RAM</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {Number(usageDetails.snapshot.derived.ramGibHours).toFixed(3)} GiB-h
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {Number(usageDetails.snapshot.utilization.ramPercentOfAllocation).toFixed(2)}% allocation
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Bandwidth</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {Number(usageDetails.snapshot.derived.bandwidthGib).toFixed(3)} GiB
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {Number(usageDetails.snapshot.utilization.bandwidthPercentOfAllocation).toFixed(2)}% allocation
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Requests</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {Number(usageDetails.snapshot.totals.requestCount).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      peak bandwidth day:{' '}
                      {usageDetails.insights.peakBandwidthDay
                        ? new Date(usageDetails.insights.peakBandwidthDay).toLocaleDateString()
                        : 'n/a'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <p className="text-sm font-medium text-slate-800">Last 30 days</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Day</th>
                          <th className="px-3 py-2">CPU mCPU-s</th>
                          <th className="px-3 py-2">RAM MB-s</th>
                          <th className="px-3 py-2">Bandwidth bytes</th>
                          <th className="px-3 py-2">Requests</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageDetails.daily.cpu_millicore_seconds.map((point, index) => (
                          <tr key={point.day} className="border-t border-slate-200">
                            <td className="px-3 py-2 text-slate-700">
                              {new Date(point.day).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {Number(point.total).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {Number(usageDetails.daily.ram_mb_seconds[index]?.total ?? '0').toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {Number(usageDetails.daily.bandwidth_bytes[index]?.total ?? '0').toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {Number(usageDetails.daily.request_count[index]?.total ?? '0').toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">No usage data available yet for this project.</p>
            )}
          </div>
        )}

        {/* ===== LOGS TAB ===== */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Project Logs</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Realtime logs from deployments and running containers for this project.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoRefreshLogs}
                    onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Auto-refresh (3s)
                </label>
                <button
                  onClick={() => loadLogs()}
                  disabled={logsLoading}
                  className="btn-secondary"
                >
                  {logsLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {logsLoading && !logs.length ? (
              <div className="rounded-xl border border-slate-200 p-8 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-cyan-500 border-r-transparent"></div>
                <p className="mt-3 text-sm text-slate-600">Loading logs...</p>
              </div>
            ) : logs.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-slate-500">
                  Showing last {logs.length} log entries • {autoRefreshLogs ? 'Auto-refreshing every 3 seconds' : 'Paused'}
                </p>
                <LogsTable rows={logs} />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm text-slate-600">No logs available yet for this project.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Logs will appear here once deployments run or containers start.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== DEPLOY TAB ===== */}
        {activeTab === 'deploy' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">New Deployment</h3>
              <p className="mt-1 text-sm text-slate-500">
                Trigger a manual deployment with optional overrides.
                Deployments run server-side — you can close the browser and come back anytime.
              </p>
            </div>
            <DeployForm
              projectId={project.id}
              defaults={{
                gitUrl: project.repoUrl,
                branch: project.branch,
                rootDirectory: project.rootDirectory,
                buildCommand: project.buildCommand,
                startCommand: project.startCommand,
                port: project.targetPort,
                serviceType: project.serviceType,
                outputDirectory: project.outputDirectory,
              }}
              activeDeploymentId={inProgressDeployment?.id ?? null}
              onDeploymentComplete={handleDeploymentComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
