'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDashboardMessageToast } from '../../../../components/dashboard-toast';
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
const GUIDE_STEPS = [
  {
    id: 'basics',
    title: 'Project basics',
    description: 'Set project name and slug.',
  },
  {
    id: 'vercel',
    title: 'Optional Vercel import',
    description: 'Use this only if you want to import settings from Vercel.',
  },
  {
    id: 'repository',
    title: 'Git repository',
    description: 'Connect GitHub or paste your repository URL and branch.',
  },
  {
    id: 'advanced',
    title: 'Advanced settings',
    description: 'Open only when you need custom path, port, or commands.',
  },
  {
    id: 'secrets',
    title: 'Environment variables',
    description: 'Add secrets now, or add them later from project settings.',
  },
  {
    id: 'autoDeploy',
    title: 'Auto deploy',
    description: 'Enable deploy on every push to the selected branch.',
  },
  {
    id: 'deployment',
    title: 'Deployment region',
    description: 'Choose where to deploy the service.',
  },
  {
    id: 'resources',
    title: 'Resource profile',
    description: 'Pick a preset or tune resources manually.',
  },
  {
    id: 'actions',
    title: 'Create project',
    description: 'Review choices, then create the project.',
  },
] as const;

type GuideStepId = (typeof GUIDE_STEPS)[number]['id'];

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

interface VercelConnectionStatus {
  configured: boolean;
  connected: boolean;
  connection: {
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
    tokenScope: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  oauthRedirectUri?: string;
  legacyAccessTokenConfigured?: boolean;
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

interface VercelProjectListItem {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  repoFullName: string | null;
  repoUrl: string | null;
  branch: string;
  updatedAt: string | null;
}

interface VercelProjectListPayload {
  source: 'vercel';
  projects: VercelProjectListItem[];
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
    subscription,
    subscriptionLoading,
    refresh,
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
  const [vercelStatus, setVercelStatus] = useState<VercelConnectionStatus | null>(null);
  const [vercelConnecting, setVercelConnecting] = useState(false);
  const [vercelImportLoading, setVercelImportLoading] = useState(false);
  const [vercelProjectsLoading, setVercelProjectsLoading] = useState(false);
  const [vercelProjects, setVercelProjects] = useState<VercelProjectListItem[]>([]);
  const [vercelProjectSearch, setVercelProjectSearch] = useState('');
  const [vercelProjectIdOrName, setVercelProjectIdOrName] = useState('');
  const [vercelTeamId, setVercelTeamId] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showSecretsEditor, setShowSecretsEditor] = useState(false);
  const [showResourceTuning, setShowResourceTuning] = useState(false);
  const [showVercelImport, setShowVercelImport] = useState(false);
  const [showGithubBrowser, setShowGithubBrowser] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  useDashboardMessageToast(message);
  useDashboardMessageToast(notice, 'success');

  const basicsRef = useRef<HTMLDivElement | null>(null);
  const vercelToggleRef = useRef<HTMLDivElement | null>(null);
  const repositoryRef = useRef<HTMLDivElement | null>(null);
  const advancedRef = useRef<HTMLDivElement | null>(null);
  const secretsRef = useRef<HTMLDivElement | null>(null);
  const autoDeployRef = useRef<HTMLDivElement | null>(null);
  const deploymentRef = useRef<HTMLDivElement | null>(null);
  const resourcesRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const selectedGithubRepo = useMemo(
    () => githubRepos.find((repo) => repo.id === selectedGithubRepoId) ?? null,
    [githubRepos, selectedGithubRepoId],
  );
  const filteredVercelProjects = useMemo(() => {
    const query = vercelProjectSearch.trim().toLowerCase();
    if (!query) {
      return vercelProjects;
    }

    return vercelProjects.filter((project) =>
      project.name.toLowerCase().includes(query)
      || project.slug.toLowerCase().includes(query)
      || project.repoFullName?.toLowerCase().includes(query),
    );
  }, [vercelProjects, vercelProjectSearch]);
  const selectedVercelProject = useMemo(
    () =>
      vercelProjects.find(
        (project) => project.id === vercelProjectIdOrName || project.name === vercelProjectIdOrName,
      ) ?? null,
    [vercelProjects, vercelProjectIdOrName],
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

  const loadVercelStatus = useCallback(async () => {
    try {
      const status = (await apiClient.get('/integrations/vercel/status')) as VercelConnectionStatus;
      setVercelStatus(status);
      if (!status.connected) {
        setVercelProjects([]);
        setVercelProjectIdOrName('');
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

  const connectVercel = async () => {
    setVercelConnecting(true);
    setMessage('');
    setNotice('');
    try {
      const data = await apiClient.get(
        `/integrations/vercel/connect-url?redirectTo=${encodeURIComponent('/projects/new')}`,
      );
      if (!data.url) {
        throw new Error('Vercel authorize URL is missing.');
      }
      window.location.href = data.url;
    } catch (error) {
      setMessage((error as Error).message);
      setVercelConnecting(false);
    }
  };

  const disconnectVercel = async () => {
    setMessage('');
    setNotice('');
    try {
      await apiClient.delete('/integrations/vercel/connection');
      setVercelProjects([]);
      setVercelProjectIdOrName('');
      await loadVercelStatus();
      setNotice('Vercel account disconnected.');
    } catch (error) {
      setMessage((error as Error).message);
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
    loadVercelStatus().catch(() => undefined);
  }, [loadVercelStatus]);

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
    const vercelState = searchParams?.get('vercel');
    const vercelMessage = searchParams?.get('vercelMessage');
    if (vercelState === 'connected') {
      setNotice('Vercel connected successfully.');
      setShowVercelImport(true);
      loadVercelStatus().catch(() => undefined);
      return;
    }

    if (vercelState === 'error') {
      setMessage(vercelMessage ?? 'Vercel connection failed.');
    }
  }, [loadVercelStatus, searchParams]);

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

  const loadVercelProjects = async () => {
    if (!vercelStatus?.connected) {
      setMessage('Connect your Vercel account first.');
      return;
    }

    setVercelProjectsLoading(true);
    setMessage('');
    setNotice('');

    try {
      const payload = (await apiClient.post('/integrations/vercel/projects', {
        ...(vercelTeamId.trim() ? { teamId: vercelTeamId.trim() } : {}),
        limit: 100,
      })) as VercelProjectListPayload;

      setVercelProjects(payload.projects ?? []);
      setVercelProjectSearch('');
      const firstProject = payload.projects[0];
      if (!firstProject) {
        setNotice('No Vercel projects found for this account/team.');
      } else {
        if (!vercelProjectIdOrName.trim()) {
          setVercelProjectIdOrName(firstProject.id);
        }
        setNotice(`Loaded ${payload.projects.length} Vercel project${payload.projects.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setVercelProjectsLoading(false);
    }
  };

  const importFromVercel = async () => {
    const cleanedProject = vercelProjectIdOrName.trim();
    if (!cleanedProject) {
      setMessage('Enter Vercel project ID or name.');
      return;
    }
    if (!vercelStatus?.connected) {
      setMessage('Connect your Vercel account first.');
      return;
    }

    setVercelImportLoading(true);
    setMessage('');
    setNotice('');

    try {
      const payload = (await apiClient.post('/integrations/vercel/import-project', {
        projectIdOrName: cleanedProject,
        ...(vercelTeamId.trim() ? { teamId: vercelTeamId.trim() } : {}),
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

      const syncWorkspaceProjects = async () => {
        await refresh().catch(() => undefined);
      };

      const createdProjectId = (response.project as { id?: string } | undefined)?.id;
      if (createdProjectId) {
        if (envPayload.length || envBulkText.trim().length > 0) {
          try {
            await apiClient.post(`/projects/${createdProjectId}/secrets/bulk`, {
              ...(envPayload.length ? { secrets: envPayload } : {}),
              ...(envBulkText.trim().length ? { envText: envBulkText } : {}),
            });
            await syncWorkspaceProjects();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push(`/projects?created=${createdProjectId}&secretSetup=ok` as any);
            return;
          } catch {
            await syncWorkspaceProjects();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push(`/projects?created=${createdProjectId}&secretSetup=partial` as any);
            return;
          }
        }

        await syncWorkspaceProjects();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(`/projects?created=${createdProjectId}` as any);
      } else {
        await syncWorkspaceProjects();
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
  const activeGuideStep = guideOpen ? GUIDE_STEPS[guideStepIndex] : null;

  const startGuide = () => {
    setGuideStepIndex(0);
    setGuideOpen(true);
  };

  const closeGuide = () => {
    setGuideOpen(false);
    setGuideStepIndex(0);
  };

  const nextGuideStep = () => {
    if (guideStepIndex >= GUIDE_STEPS.length - 1) {
      closeGuide();
      return;
    }

    setGuideStepIndex((prev) => Math.min(prev + 1, GUIDE_STEPS.length - 1));
  };

  const previousGuideStep = () => {
    setGuideStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const getGuideTarget = useCallback((stepId: GuideStepId) => {
    switch (stepId) {
      case 'basics':
        return basicsRef.current;
      case 'vercel':
        return vercelToggleRef.current;
      case 'repository':
        return repositoryRef.current;
      case 'advanced':
        return advancedRef.current;
      case 'secrets':
        return secretsRef.current;
      case 'autoDeploy':
        return autoDeployRef.current;
      case 'deployment':
        return deploymentRef.current;
      case 'resources':
        return resourcesRef.current;
      case 'actions':
        return actionsRef.current;
      default:
        return null;
    }
  }, []);

  const guideHighlightClass = (stepId: GuideStepId) =>
    activeGuideStep?.id === stepId
      ? 'ring-2 ring-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.18)]'
      : '';

  useEffect(() => {
    if (!activeGuideStep) {
      return;
    }

    const target = getGuideTarget(activeGuideStep.id);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, [activeGuideStep, getGuideTarget]);

  return (
    <div className="space-y-4">
      <SectionCard title="Create Project" subtitle="Connect your code and deploy.">
        <form onSubmit={onSubmit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div
              ref={vercelToggleRef}
              className={`flex justify-end rounded-xl p-1 transition ${guideHighlightClass('vercel')}`}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowVercelImport((prev) => !prev)}
              >
                {showVercelImport ? 'Hide Vercel import' : 'Migrate from Vercel (optional)'}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div
                ref={basicsRef}
                className={`md:col-span-2 grid gap-3 rounded-xl p-1 transition md:grid-cols-2 ${guideHighlightClass('basics')}`}
              >
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
              </div>

              {showVercelImport ? (
                <div className="md:col-span-2 space-y-2 rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Vercel migration</p>
                      <p className="text-xs text-slate-600">
                        {vercelStatus?.connected
                          ? `Connected as ${vercelStatus.connection?.username ?? vercelStatus.connection?.email ?? 'your Vercel account'}`
                          : vercelStatus?.configured
                            ? 'Connect Vercel to import project settings.'
                            : 'Vercel OAuth is not configured on the server.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!vercelStatus?.connected ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={connectVercel}
                          disabled={!vercelStatus?.configured || vercelConnecting}
                        >
                          {vercelConnecting ? 'Connecting...' : 'Connect Vercel'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={disconnectVercel}
                        >
                          Disconnect
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={loadVercelProjects}
                        disabled={!vercelStatus?.connected || vercelProjectsLoading}
                      >
                        {vercelProjectsLoading ? 'Loading...' : 'Load projects'}
                      </button>
                    </div>
                  </div>

                  <input
                    value={vercelTeamId}
                    onChange={(event) => setVercelTeamId(event.target.value)}
                    className="field-input"
                    placeholder="team_xxx (optional)"
                  />

                  {vercelProjects.length > 0 ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 p-2">
                      <input
                        value={vercelProjectSearch}
                        onChange={(event) => setVercelProjectSearch(event.target.value)}
                        className="field-input"
                        placeholder="Search loaded Vercel projects"
                      />
                      <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                        {filteredVercelProjects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            className={`w-full rounded-lg border p-2 text-left ${
                              selectedVercelProject?.id === project.id ? 'border-slate-900' : 'border-slate-200'
                            }`}
                            onClick={() => setVercelProjectIdOrName(project.id)}
                          >
                            <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                            <p className="text-xs text-slate-600">
                              {project.repoFullName ?? project.slug} | branch {project.branch}
                            </p>
                          </button>
                        ))}
                        {!filteredVercelProjects.length ? (
                          <p className="text-xs text-slate-600">No projects match this search.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={vercelProjectIdOrName}
                      onChange={(event) => setVercelProjectIdOrName(event.target.value)}
                      className="field-input"
                      placeholder="Selected Vercel project ID or name"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={importFromVercel}
                      disabled={!vercelStatus?.connected || vercelImportLoading}
                    >
                      {vercelImportLoading ? 'Importing...' : 'Import settings'}
                    </button>
                  </div>

                  {selectedVercelProject ? (
                    <p className="text-xs text-slate-600">
                      Selected: <span className="font-medium">{selectedVercelProject.name}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div
                ref={repositoryRef}
                className={`md:col-span-2 space-y-3 rounded-xl border border-slate-200 p-3 transition ${guideHighlightClass('repository')}`}
              >
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
              <div
                ref={advancedRef}
                className={`md:col-span-2 rounded-xl p-1 transition ${guideHighlightClass('advanced')}`}
              >
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

            <div
              ref={secretsRef}
              className={`space-y-2 rounded-xl border border-slate-200 p-3 transition ${guideHighlightClass('secrets')}`}
            >
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

            <div
              ref={autoDeployRef}
              className={`space-y-1 rounded-xl p-1 transition ${guideHighlightClass('autoDeploy')}`}
            >
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
                <p className="text-xs text-slate-500">Auto deploy is not available for this workspace plan.</p>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-200 p-4 xl:sticky xl:top-24 h-fit">
            <div
              ref={deploymentRef}
              className={`space-y-2 rounded-xl p-1 transition ${guideHighlightClass('deployment')}`}
            >
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

            <div
              ref={resourcesRef}
              className={`space-y-3 rounded-xl p-1 transition ${guideHighlightClass('resources')}`}
            >
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

            <div
              ref={actionsRef}
              className={`space-y-2 rounded-xl border-t border-slate-200 p-1 pt-3 transition ${guideHighlightClass('actions')}`}
            >
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
      </SectionCard>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {activeGuideStep ? (
          <div className="w-72 rounded-2xl border border-slate-700 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur">
            <p className="text-[11px] uppercase tracking-wide text-sky-300">
              Form guide {guideStepIndex + 1}/{GUIDE_STEPS.length}
            </p>
            <p className="mt-1 text-sm font-semibold">{activeGuideStep.title}</p>
            <p className="mt-1 text-xs text-slate-300">{activeGuideStep.description}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeGuide}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={previousGuideStep}
                disabled={guideStepIndex === 0}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={nextGuideStep}
              >
                {guideStepIndex === GUIDE_STEPS.length - 1 ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="btn-primary shadow-lg"
          onClick={guideOpen ? closeGuide : startGuide}
        >
          {guideOpen ? 'Stop guide' : 'Guide me'}
        </button>
      </div>
    </div>
  );
}
