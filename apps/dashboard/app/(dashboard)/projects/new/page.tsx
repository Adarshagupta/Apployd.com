'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ResourceSlider } from '../../../../components/resource-slider';
import { SectionCard } from '../../../../components/section-card';
import { apiClient } from '../../../../lib/api';
import { useWorkspaceContext } from '../../../../components/workspace-provider';

export const dynamic = 'force-dynamic';

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const MIN_RESOURCE_LIMITS = {
  ram: 128,
  cpu: 100,
  bandwidth: 1,
} as const;
const DEFAULT_RESOURCE_LIMITS = {
  ram: 512,
  cpu: 500,
  bandwidth: 50,
} as const;

interface EnvRow {
  key: string;
  value: string;
}

interface GitHubRepository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  canAdmin: boolean;
}

interface GitHubConnectionStatus {
  configured: boolean;
  connected: boolean;
  connection: {
    username: string;
    avatarUrl: string | null;
    tokenScope: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

interface CurrentSubscription {
  status: string;
  poolRamMb: number;
  poolCpuMillicores: number;
  poolBandwidthGb: number;
  entitlements?: {
    autoDeploy: boolean;
    previewDeployments: boolean;
    customDomains: boolean;
  };
  plan?: {
    code: string;
    displayName: string;
  } | null;
}

interface VercelImportPayload {
  source: 'vercel';
  project: {
    id: string;
    name: string;
    slug: string;
    repoUrl: string | null;
    repoOwner: string | null;
    repoName: string | null;
    repoFullName: string | null;
    branch: string;
    rootDirectory: string | null;
    buildCommand: string | null;
    startCommand: string | null;
    installCommand: string | null;
    outputDirectory: string | null;
    framework: string | null;
    autoDeployEnabled: boolean;
    targetPort: number;
    runtime: 'node';
    serviceType: 'web_service' | 'static_site';
  };
  environmentVariables: {
    totalEntries: number;
    importedCount: number;
    unresolvedKeys: string[];
    variables: Array<{
      key: string;
      value: string;
      target: string | null;
    }>;
  };
  warnings: string[];
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

const parseGithubRepo = (repoUrl: string) => {
  if (!repoUrl) return null;

  try {
    const parsed = new URL(repoUrl);
    if (parsed.hostname !== 'github.com') return null;
    const [owner, repoNameRaw] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repoNameRaw) return null;
    const repoName = repoNameRaw.replace(/\.git$/, '');
    return {
      owner,
      name: repoName,
      fullName: `${owner}/${repoName}`,
    };
  } catch {
    return null;
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function CreateProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    selectedOrganizationId,
    loading,
    error: workspaceError,
  } = useWorkspaceContext();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    repoUrl: '',
    branch: 'main',
    rootDirectory: '',
    deploymentRegion: 'fsn1',
    buildCommand: '',
    startCommand: '',
    targetPort: 3000,
    autoDeployEnabled: true,
    ram: 512,
    cpu: 500,
    bandwidth: 50,
  });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [envRows, setEnvRows] = useState<EnvRow[]>([{ key: '', value: '' }]);
  const [envBulkText, setEnvBulkText] = useState('');
  const [githubStatus, setGithubStatus] = useState<GitHubConnectionStatus | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [githubSearch, setGithubSearch] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [selectedGithubRepoId, setSelectedGithubRepoId] = useState('');
  const [vercelImportLoading, setVercelImportLoading] = useState(false);
  const [vercelProjectIdOrName, setVercelProjectIdOrName] = useState('');
  const [vercelTeamId, setVercelTeamId] = useState('');
  const [vercelAccessToken, setVercelAccessToken] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showSecretsEditor, setShowSecretsEditor] = useState(false);
  const [showResourceTuning, setShowResourceTuning] = useState(false);
  const [showVercelImport, setShowVercelImport] = useState(false);
  const [showGithubBrowser, setShowGithubBrowser] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);

  const selectedGithubRepo = useMemo(
    () => githubRepos.find((repo) => repo.id === selectedGithubRepoId) ?? null,
    [githubRepos, selectedGithubRepoId],
  );
  const autoDeployLocked = subscription?.entitlements?.autoDeploy === false;
  const slugError = useMemo(() => {
    if (!form.slug) return 'Slug is required.';
    if (form.slug.length < 2) return 'Slug must be at least 2 characters.';
    if (!SLUG_PATTERN.test(form.slug)) return 'Slug can only include lowercase letters, numbers, and hyphens.';
    return '';
  }, [form.slug]);
  const isCreateDisabled = submitting || loading || !selectedOrganizationId || !!slugError;
  const resourceLimits = useMemo(
    () => ({
      ram: Math.max(
        MIN_RESOURCE_LIMITS.ram,
        subscription?.poolRamMb ?? DEFAULT_RESOURCE_LIMITS.ram,
      ),
      cpu: Math.max(
        MIN_RESOURCE_LIMITS.cpu,
        subscription?.poolCpuMillicores ?? DEFAULT_RESOURCE_LIMITS.cpu,
      ),
      bandwidth: Math.max(
        MIN_RESOURCE_LIMITS.bandwidth,
        subscription?.poolBandwidthGb ?? DEFAULT_RESOURCE_LIMITS.bandwidth,
      ),
    }),
    [subscription],
  );

  const loadGitHubStatus = useCallback(async () => {
    try {
      const status = (await apiClient.get('/integrations/github/status')) as GitHubConnectionStatus;
      setGithubStatus(status);
      if (!status.connected) {
        setGithubRepos([]);
        setSelectedGithubRepoId('');
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);

  const loadGitHubRepositories = useCallback(async (searchTerm = '') => {
    if (!githubStatus?.connected) {
      setGithubRepos([]);
      setSelectedGithubRepoId('');
      return;
    }

    setGithubLoading(true);
    try {
      const data = await apiClient.get(
        `/integrations/github/repositories?page=1&perPage=60&search=${encodeURIComponent(searchTerm)}`,
      );
      setGithubRepos((data.repositories ?? []) as GitHubRepository[]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setGithubLoading(false);
    }
  }, [githubStatus?.connected]);

  const loadSubscription = useCallback(async () => {
    if (!selectedOrganizationId) {
      setSubscription(null);
      return;
    }

    setSubscriptionLoading(true);
    try {
      const data = await apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`);
      setSubscription((data.subscription ?? null) as CurrentSubscription | null);
    } catch (error) {
      setSubscription(null);
      setMessage((error as Error).message);
    } finally {
      setSubscriptionLoading(false);
    }
  }, [selectedOrganizationId]);

  const connectGitHub = async () => {
    setGithubConnecting(true);
    setMessage('');
    setNotice('');
    try {
      const data = await apiClient.get(
        `/integrations/github/connect-url?redirectTo=${encodeURIComponent('/projects/new')}`,
      );
      if (!data.url) {
        throw new Error('GitHub authorize URL is missing.');
      }
      window.location.href = data.url;
    } catch (error) {
      setMessage((error as Error).message);
      setGithubConnecting(false);
    }
  };

  const bindRepositorySelection = (repository: GitHubRepository) => {
    setSelectedGithubRepoId(repository.id);
    setForm((prev) => ({
      ...prev,
      repoUrl: `${repository.htmlUrl}.git`,
      branch: repository.defaultBranch || prev.branch,
    }));
    setNotice(`Selected repository ${repository.fullName}`);
  };

  useEffect(() => {
    loadGitHubStatus().catch(() => undefined);
  }, [loadGitHubStatus]);

  useEffect(() => {
    loadSubscription().catch(() => undefined);
  }, [loadSubscription]);

  useEffect(() => {
    if (githubStatus?.connected) {
      loadGitHubRepositories().catch(() => undefined);
    }
  }, [githubStatus?.connected, loadGitHubRepositories]);

  useEffect(() => {
    const githubState = searchParams?.get('github');
    const githubMessage = searchParams?.get('githubMessage');
    if (githubState === 'connected') {
      setNotice('GitHub connected successfully.');
      loadGitHubStatus().catch(() => undefined);
      loadGitHubRepositories().catch(() => undefined);
      return;
    }

    if (githubState === 'error') {
      setMessage(githubMessage ?? 'GitHub connection failed.');
    }
  }, [loadGitHubRepositories, loadGitHubStatus, searchParams]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      ram: clamp(prev.ram, MIN_RESOURCE_LIMITS.ram, resourceLimits.ram),
      cpu: clamp(prev.cpu, MIN_RESOURCE_LIMITS.cpu, resourceLimits.cpu),
      bandwidth: clamp(prev.bandwidth, MIN_RESOURCE_LIMITS.bandwidth, resourceLimits.bandwidth),
    }));
  }, [resourceLimits]);

  useEffect(() => {
    if (!autoDeployLocked) {
      return;
    }

    setForm((prev) => (prev.autoDeployEnabled ? { ...prev, autoDeployEnabled: false } : prev));
  }, [autoDeployLocked]);

  const searchGitHubRepos = async () => {
    await loadGitHubRepositories(githubSearch);
  };

  const importFromVercel = async () => {
    const cleanedProject = vercelProjectIdOrName.trim();
    if (!cleanedProject) {
      setMessage('Enter Vercel project ID or name.');
      return;
    }

    setVercelImportLoading(true);
    setMessage('');
    setNotice('');

    try {
      const payload = (await apiClient.post('/integrations/vercel/import-project', {
        projectIdOrName: cleanedProject,
        ...(vercelTeamId.trim() ? { teamId: vercelTeamId.trim() } : {}),
        ...(vercelAccessToken.trim() ? { accessToken: vercelAccessToken.trim() } : {}),
      })) as VercelImportPayload;

      const imported = payload.project;
      const importedName = imported.name.trim();
      const importedSlug = slugify(imported.slug || imported.name || form.slug || importedName);
      const importedTargetPort = Number(imported.targetPort);
      const hasValidPort = Number.isFinite(importedTargetPort) && importedTargetPort >= 1 && importedTargetPort <= 65535;

      setForm((prev) => ({
        ...prev,
        name: importedName || prev.name,
        slug: importedSlug || prev.slug,
        repoUrl: imported.repoUrl ?? prev.repoUrl,
        branch: imported.branch || prev.branch,
        rootDirectory: imported.rootDirectory ?? prev.rootDirectory,
        buildCommand: imported.buildCommand ?? prev.buildCommand,
        startCommand: imported.startCommand ?? prev.startCommand,
        targetPort: hasValidPort ? importedTargetPort : prev.targetPort,
        autoDeployEnabled: autoDeployLocked ? false : imported.autoDeployEnabled,
      }));
      setSlugManuallyEdited(false);
      setSelectedGithubRepoId('');
      setVercelAccessToken('');
      const importedEnvVariables = payload.environmentVariables?.variables ?? [];
      if (importedEnvVariables.length > 0) {
        setEnvRows(importedEnvVariables.map((entry) => ({ key: entry.key, value: entry.value })));
        setEnvBulkText('');
      }

      const envImportSummary =
        payload.environmentVariables && payload.environmentVariables.importedCount > 0
          ? `Imported ${payload.environmentVariables.importedCount} environment variable${
              payload.environmentVariables.importedCount === 1 ? '' : 's'
            }.`
          : 'No environment variables were imported.';

      if (payload.warnings.length > 0) {
        setNotice(`${envImportSummary} Notes: ${payload.warnings.join(' ')}`);
      } else {
        setNotice(`Imported project settings from Vercel. ${envImportSummary}`);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setVercelImportLoading(false);
    }
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedOrganizationId) {
      setMessage('Select an organization first.');
      return;
    }
    if (slugError) {
      setMessage(slugError);
      return;
    }

    const envPayload: Array<{ key: string; value: string }> = [];
    const seenKeys = new Set<string>();
    for (const row of envRows) {
      const key = row.key.trim().toUpperCase();
      const value = row.value.trim();

      if (!key && !value) {
        continue;
      }
      if (!key || !value) {
        setMessage('Each environment variable needs both key and value.');
        return;
      }
      if (!ENV_KEY_PATTERN.test(key)) {
        setMessage('Environment keys must be uppercase snake case (for example: DATABASE_URL).');
        return;
      }
      if (seenKeys.has(key)) {
        setMessage(`Duplicate environment key: ${key}`);
        return;
      }

      seenKeys.add(key);
      envPayload.push({ key, value });
    }

    const cleanedRepoUrl = form.repoUrl.trim();
    const cleanedRootDirectory =
      form.rootDirectory
        .trim()
        .replace(/^[\\/]+/, '')
        .replace(/[\\/]+$/, '') || undefined;
    if (cleanedRepoUrl) {
      try {
        new URL(cleanedRepoUrl);
      } catch {
        setMessage('Repository URL must be a valid URL.');
        return;
      }
    }

    try {
      setSubmitting(true);
      setMessage('');
      const selectedRam = clamp(Number(form.ram), MIN_RESOURCE_LIMITS.ram, resourceLimits.ram);
      const selectedCpu = clamp(Number(form.cpu), MIN_RESOURCE_LIMITS.cpu, resourceLimits.cpu);
      const selectedBandwidth = clamp(
        Number(form.bandwidth),
        MIN_RESOURCE_LIMITS.bandwidth,
        resourceLimits.bandwidth,
      );
      const githubRepo = parseGithubRepo(cleanedRepoUrl);
      const response = await apiClient.post('/projects', {
        organizationId: selectedOrganizationId,
        name: form.name.trim(),
        slug: form.slug,
        repoUrl: cleanedRepoUrl || undefined,
        repoOwner: githubRepo?.owner,
        repoName: githubRepo?.name,
        repoFullName: githubRepo?.fullName,
        branch: form.branch.trim() || 'main',
        rootDirectory: cleanedRootDirectory,
        deploymentRegion: form.deploymentRegion,
        buildCommand: form.buildCommand.trim() || undefined,
        startCommand: form.startCommand.trim() || undefined,
        targetPort: Number(form.targetPort),
        autoDeployEnabled: form.autoDeployEnabled,
        resourceRamMb: selectedRam,
        resourceCpuMillicore: selectedCpu,
        resourceBandwidthGb: selectedBandwidth,
      });

      const createdProjectId = (response.project as { id?: string } | undefined)?.id;
      if (createdProjectId) {
        if (envPayload.length || envBulkText.trim().length > 0) {
          try {
            await apiClient.post(`/projects/${createdProjectId}/secrets/bulk`, {
              ...(envPayload.length ? { secrets: envPayload } : {}),
              ...(envBulkText.trim().length ? { envText: envBulkText } : {}),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push(`/projects?created=${createdProjectId}&secretSetup=ok` as any);
            return;
          } catch {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push(`/projects?created=${createdProjectId}&secretSetup=partial` as any);
            return;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(`/projects?created=${createdProjectId}` as any);
      } else {
        router.push('/projects');
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: slugManuallyEdited ? prev.slug : slugify(value),
    }));
  };

  const applyResourcePreset = (preset: {
    ram: number;
    cpu: number;
    bandwidth: number;
  }) => {
    setForm((prev) => ({
      ...prev,
      ram: clamp(preset.ram, MIN_RESOURCE_LIMITS.ram, resourceLimits.ram),
      cpu: clamp(preset.cpu, MIN_RESOURCE_LIMITS.cpu, resourceLimits.cpu),
      bandwidth: clamp(preset.bandwidth, MIN_RESOURCE_LIMITS.bandwidth, resourceLimits.bandwidth),
    }));
  };

  const leanPreset = {
    ram: MIN_RESOURCE_LIMITS.ram,
    cpu: MIN_RESOURCE_LIMITS.cpu,
    bandwidth: MIN_RESOURCE_LIMITS.bandwidth,
  };
  const balancedPreset = {
    ram: Math.min(512, resourceLimits.ram),
    cpu: Math.min(500, resourceLimits.cpu),
    bandwidth: Math.min(25, resourceLimits.bandwidth),
  };
  const performancePreset = {
    ram: resourceLimits.ram,
    cpu: resourceLimits.cpu,
    bandwidth: resourceLimits.bandwidth,
  };
  const usingLeanPreset =
    form.ram === leanPreset.ram &&
    form.cpu === leanPreset.cpu &&
    form.bandwidth === leanPreset.bandwidth;
  const usingBalancedPreset =
    form.ram === balancedPreset.ram &&
    form.cpu === balancedPreset.cpu &&
    form.bandwidth === balancedPreset.bandwidth;
  const usingPerformancePreset =
    form.ram === performancePreset.ram &&
    form.cpu === performancePreset.cpu &&
    form.bandwidth === performancePreset.bandwidth;

  return (
    <div className="space-y-4">
      <SectionCard title="Create Project" subtitle="Connect your code and deploy.">
        <form onSubmit={onSubmit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowVercelImport((prev) => !prev)}
              >
                {showVercelImport ? 'Hide Vercel import' : 'Migrate from Vercel (optional)'}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="field-label">Project name</span>
                <input
                  value={form.name}
                  onChange={(event) => onNameChange(event.target.value)}
                  className="field-input"
                  placeholder="Payments API"
                  required
                />
              </label>
              <label>
                <span className="field-label">Slug</span>
                <input
                  value={form.slug}
                  onChange={(event) => {
                    setSlugManuallyEdited(true);
                    setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }));
                  }}
                  className="field-input"
                  placeholder="payments-api"
                  minLength={2}
                  maxLength={63}
                  required
                />
              </label>

              {showVercelImport ? (
                <div className="md:col-span-2 space-y-2 rounded-xl border border-slate-200 p-3">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                    <input
                      value={vercelProjectIdOrName}
                      onChange={(event) => setVercelProjectIdOrName(event.target.value)}
                      className="field-input"
                      placeholder="Vercel project ID or name"
                    />
                    <input
                      value={vercelTeamId}
                      onChange={(event) => setVercelTeamId(event.target.value)}
                      className="field-input"
                      placeholder="team_xxx (optional)"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={importFromVercel}
                      disabled={vercelImportLoading}
                    >
                      {vercelImportLoading ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                  <input
                    type="password"
                    value={vercelAccessToken}
                    onChange={(event) => setVercelAccessToken(event.target.value)}
                    className="field-input"
                    placeholder="Vercel token (optional)"
                  />
                </div>
              ) : null}

              <div className="md:col-span-2 space-y-3 rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Git repository</p>
                  <div className="flex flex-wrap gap-2">
                    {!githubStatus?.connected ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={connectGitHub}
                        disabled={!githubStatus?.configured || githubConnecting}
                      >
                        {githubConnecting ? 'Connecting...' : 'Connect GitHub'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowGithubBrowser((prev) => !prev)}
                      >
                        {showGithubBrowser ? 'Hide GitHub repos' : 'Browse GitHub repos'}
                      </button>
                    )}
                  </div>
                </div>

                {githubStatus?.connected && showGithubBrowser ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={githubSearch}
                        onChange={(event) => setGithubSearch(event.target.value)}
                        className="field-input max-w-sm"
                        placeholder="Search repositories"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={searchGitHubRepos}
                        disabled={githubLoading}
                      >
                        {githubLoading ? 'Loading...' : 'Search'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => loadGitHubRepositories(githubSearch)}
                        disabled={githubLoading}
                      >
                        Refresh
                      </button>
                    </div>
                    {githubRepos.length ? (
                      <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2">
                        {githubRepos.map((repository) => (
                          <button
                            key={repository.id}
                            type="button"
                            onClick={() => bindRepositorySelection(repository)}
                            className={`w-full rounded-lg border p-2 text-left ${
                              selectedGithubRepoId === repository.id ? 'border-slate-900' : 'border-slate-200'
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-900">{repository.fullName}</p>
                            <p className="text-xs text-slate-600">
                              {repository.defaultBranch} | {repository.private ? 'private' : 'public'}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">
                        {githubLoading ? 'Loading repositories...' : 'No repositories found.'}
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label>
                    <span className="field-label">Repository URL</span>
                    <input
                      type="url"
                      value={form.repoUrl}
                      onChange={(event) => {
                        setSelectedGithubRepoId('');
                        setForm((prev) => ({ ...prev, repoUrl: event.target.value }));
                      }}
                      className="field-input"
                      placeholder="https://github.com/org/repo.git"
                    />
                  </label>
                  <label>
                    <span className="field-label">Branch</span>
                    <input
                      value={form.branch}
                      onChange={(event) => setForm((prev) => ({ ...prev, branch: event.target.value }))}
                      className="field-input"
                      placeholder="main"
                      required
                    />
                  </label>
                </div>
                {selectedGithubRepo ? (
                  <p className="text-xs text-slate-600">Selected: {selectedGithubRepo.fullName}</p>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAdvancedSettings((prev) => !prev)}
                >
                  {showAdvancedSettings ? 'Hide advanced settings' : 'Advanced settings'}
                </button>
              </div>

              {showAdvancedSettings ? (
                <div className="md:col-span-2 grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
                  <label>
                    <span className="field-label">Repository folder</span>
                    <input
                      value={form.rootDirectory}
                      onChange={(event) => setForm((prev) => ({ ...prev, rootDirectory: event.target.value }))}
                      className="field-input"
                      placeholder="apps/web"
                    />
                  </label>
                  <label>
                    <span className="field-label">Target port</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={form.targetPort}
                      onChange={(event) => setForm((prev) => ({ ...prev, targetPort: Number(event.target.value) }))}
                      className="field-input"
                      required
                    />
                  </label>
                  <label>
                    <span className="field-label">Build command</span>
                    <input
                      value={form.buildCommand}
                      onChange={(event) => setForm((prev) => ({ ...prev, buildCommand: event.target.value }))}
                      className="field-input"
                      placeholder="npm run build"
                    />
                  </label>
                  <label>
                    <span className="field-label">Start command</span>
                    <input
                      value={form.startCommand}
                      onChange={(event) => setForm((prev) => ({ ...prev, startCommand: event.target.value }))}
                      className="field-input"
                      placeholder="node dist/server.js"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Environment variables (optional)</p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSecretsEditor((prev) => !prev)}
                >
                  {showSecretsEditor ? 'Hide' : 'Add secrets'}
                </button>
              </div>
              {showSecretsEditor ? (
                <>
                  <div className="space-y-2">
                    {envRows.map((row, index) => (
                      <div key={index} className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                        <input
                          value={row.key}
                          onChange={(event) =>
                            setEnvRows((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, key: event.target.value.toUpperCase() } : item,
                              ),
                            )
                          }
                          className="field-input"
                          placeholder="DATABASE_URL"
                        />
                        <input
                          value={row.value}
                          onChange={(event) =>
                            setEnvRows((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: event.target.value } : item,
                              ),
                            )
                          }
                          className="field-input"
                          placeholder="postgres://..."
                          type="password"
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setEnvRows((prev) => {
                              if (prev.length === 1) {
                                return [{ key: '', value: '' }];
                              }
                              return prev.filter((_, itemIndex) => itemIndex !== index);
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEnvRows((prev) => [...prev, { key: '', value: '' }])}
                  >
                    Add variable
                  </button>
                  <label className="block">
                    <span className="field-label">Paste .env</span>
                    <textarea
                      value={envBulkText}
                      onChange={(event) => setEnvBulkText(event.target.value)}
                      className="field-input min-h-32 font-mono text-xs"
                      placeholder={'DATABASE_URL=postgres://...\nJWT_SECRET=...'}
                    />
                  </label>
                </>
              ) : (
                <p className="text-xs text-slate-600">You can also add secrets later.</p>
              )}
            </div>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.autoDeployEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, autoDeployEnabled: event.target.checked }))}
                disabled={autoDeployLocked}
              />
              <span className="text-sm text-slate-700">Auto deploy on push</span>
            </label>
            {autoDeployLocked ? (
              <p className="text-xs text-slate-500">Upgrade plan to enable auto deploy.</p>
            ) : null}
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-200 p-4 xl:sticky xl:top-24 h-fit">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Deployment</p>
              <label>
                <span className="field-label">Deployment region</span>
                <select
                  value={form.deploymentRegion}
                  onChange={(event) => setForm((prev) => ({ ...prev, deploymentRegion: event.target.value }))}
                  className="field-input"
                >
                  <option value="fsn1">Frankfurt, Germany (fsn1)</option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Resource profile</p>
              <p className="text-xs text-slate-600">
                {subscription
                  ? `Available: ${resourceLimits.ram} MB RAM, ${resourceLimits.cpu} mCPU, ${resourceLimits.bandwidth} GB`
                  : selectedOrganizationId
                    ? subscriptionLoading
                      ? 'Loading subscription limits...'
                      : `Default: ${resourceLimits.ram} MB RAM, ${resourceLimits.cpu} mCPU, ${resourceLimits.bandwidth} GB`
                    : 'Select an organization to load limits.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn-secondary ${usingLeanPreset ? 'border-slate-900' : ''}`}
                  onClick={() => applyResourcePreset(leanPreset)}
                >
                  Lean
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${usingBalancedPreset ? 'border-slate-900' : ''}`}
                  onClick={() => applyResourcePreset(balancedPreset)}
                >
                  Balanced
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${usingPerformancePreset ? 'border-slate-900' : ''}`}
                  onClick={() => applyResourcePreset(performancePreset)}
                >
                  Performance
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowResourceTuning((prev) => !prev)}
              >
                {showResourceTuning ? 'Hide manual tuning' : 'Manual tuning'}
              </button>
              {showResourceTuning ? (
                <>
                  <ResourceSlider
                    label="RAM"
                    min={MIN_RESOURCE_LIMITS.ram}
                    max={resourceLimits.ram}
                    step={128}
                    value={form.ram}
                    unit="MB"
                    onChange={(ram) =>
                      setForm((prev) => ({
                        ...prev,
                        ram: clamp(ram, MIN_RESOURCE_LIMITS.ram, resourceLimits.ram),
                      }))
                    }
                  />
                  <ResourceSlider
                    label="CPU"
                    min={MIN_RESOURCE_LIMITS.cpu}
                    max={resourceLimits.cpu}
                    step={100}
                    value={form.cpu}
                    unit="mCPU"
                    onChange={(cpu) =>
                      setForm((prev) => ({
                        ...prev,
                        cpu: clamp(cpu, MIN_RESOURCE_LIMITS.cpu, resourceLimits.cpu),
                      }))
                    }
                  />
                  <ResourceSlider
                    label="Bandwidth"
                    min={MIN_RESOURCE_LIMITS.bandwidth}
                    max={resourceLimits.bandwidth}
                    value={form.bandwidth}
                    unit="GB"
                    onChange={(bandwidth) =>
                      setForm((prev) => ({
                        ...prev,
                        bandwidth: clamp(bandwidth, MIN_RESOURCE_LIMITS.bandwidth, resourceLimits.bandwidth),
                      }))
                    }
                  />
                </>
              ) : null}
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={isCreateDisabled}
              >
                {submitting ? 'Creating project...' : 'Create project'}
              </button>
              <Link href="/projects" className="btn-secondary block w-full text-center">
                Cancel
              </Link>
            </div>
          </aside>
        </form>

        {workspaceError ? <p className="mt-4 text-sm text-red-600">{workspaceError}</p> : null}
        {notice ? <p className="mt-2 text-sm text-slate-700">{notice}</p> : null}
        {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
      </SectionCard>
    </div>
  );
}
