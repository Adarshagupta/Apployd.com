'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspaceContext } from '../../../components/workspace-provider';

export const dynamic = 'force-dynamic';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  canAdmin: boolean;
}

interface GitHubStatus {
  configured: boolean;
  connected: boolean;
  oauthRedirectUri?: string;
  webhookConfigured?: boolean;
  webhookUrl?: string;
  connection: {
    username: string;
    avatarUrl: string | null;
    tokenScope: string | null;
    createdAt: string;
  } | null;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const {
    projects,
    refresh,
  } = useWorkspaceContext();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [message, setMessage] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId('');
      return;
    }
    if (!projects.some((project) => project.id === selectedProjectId)) {
      const first = projects[0];
      if (first) {
        setSelectedProjectId(first.id);
      }
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    const githubState = searchParams?.get('github');
    const githubMessage = searchParams?.get('githubMessage');
    if (githubState === 'connected') {
      setMessage('GitHub connected successfully.');
    } else if (githubState === 'error') {
      setMessage(githubMessage ?? 'GitHub connection failed.');
    }
  }, [searchParams]);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await apiClient.get('/integrations/github/status');
      setStatus(data);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadRepos = async (searchTerm = '') => {
    if (!status?.connected) {
      setRepos([]);
      return;
    }

    setLoadingRepos(true);
    try {
      const data = await apiClient.get(
        `/integrations/github/repositories?page=1&perPage=60&search=${encodeURIComponent(searchTerm)}`,
      );
      setRepos(data.repositories ?? []);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    loadStatus().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.connected) {
      loadRepos(search).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  const connectGitHub = async () => {
    try {
      const data = await apiClient.get(
        `/integrations/github/connect-url?redirectTo=${encodeURIComponent('/integrations')}`,
      );
      if (!data.url) {
        setMessage('GitHub authorize URL missing.');
        return;
      }
      window.location.href = data.url;
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const disconnectGitHub = async () => {
    try {
      await apiClient.delete('/integrations/github/connection');
      setRepos([]);
      setSelectedRepo(null);
      setMessage('GitHub account disconnected.');
      await loadStatus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const filterRepos = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadRepos(search);
  };

  const linkRepoToProject = async () => {
    if (!selectedRepo || !selectedProjectId) {
      setMessage('Select both a project and repository.');
      return;
    }
    if (!selectedRepo.canAdmin) {
      setMessage('Selected repository does not grant admin/push permissions for webhook setup.');
      return;
    }

    try {
      const result = await apiClient.patch(`/projects/${selectedProjectId}/git-settings`, {
        repoUrl: `${selectedRepo.htmlUrl}.git`,
        repoOwner: selectedRepo.owner,
        repoName: selectedRepo.name,
        repoFullName: selectedRepo.fullName,
        branch: selectedRepo.defaultBranch,
        autoDeployEnabled: true,
      });

      await refresh();
      const webhookCreated = result?.webhook?.created === true;
      const webhookConfigured = result?.webhook?.configured === true;
      if (webhookConfigured) {
        setMessage(
          `Linked ${selectedRepo.fullName} to ${selectedProject?.name ?? 'project'} and ${
            webhookCreated ? 'created' : 'updated'
          } the GitHub push webhook.`,
        );
      } else {
        setMessage(`Linked ${selectedRepo.fullName} to ${selectedProject?.name ?? 'project'}.`);
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="GitHub Integration"
        subtitle="Connect GitHub once, then link repositories to projects for Vercel-style push deploys."
      >
        <div className="panel-muted flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Connection status</p>
            {loadingStatus ? (
              <div className="mt-1">
                <SkeletonBlock className="h-4 w-56 rounded" />
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-slate-600">
                  {!status?.configured
                    ? 'GitHub OAuth not configured on server'
                    : status.connected
                      ? `Connected as @${status.connection?.username}`
                      : 'Not connected'}
                </p>
                <p className="text-xs text-slate-500">
                  OAuth callback: <span className="mono">{status?.oauthRedirectUri ?? '-'}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Push webhook: <span className="mono">{status?.webhookUrl ?? '-'}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Webhook secret: <span className="font-medium">{status?.webhookConfigured ? 'configured' : 'missing'}</span>
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {!status?.connected ? (
              <button className="btn-primary" onClick={connectGitHub} disabled={loadingStatus || !status?.configured}>
                Connect GitHub
              </button>
            ) : (
              <button className="btn-danger" onClick={disconnectGitHub}>
                Disconnect
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Repository Import"
        subtitle="Select a repository and bind it to a project. Pushes to the production branch auto-deploy."
      >
        <form onSubmit={filterRepos} className="mb-3 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search repositories"
            className="field-input max-w-sm"
          />
          <button className="btn-secondary" type="submit" disabled={!status?.connected || loadingRepos}>
            {loadingRepos ? 'Loading...' : 'Search'}
          </button>
        </form>
        {loadingStatus ? (
          <div className="grid gap-2 rounded-xl border border-slate-200 p-2">
            {[0, 1, 2].map((placeholder) => (
              <article key={placeholder} className="rounded-xl border border-slate-200 p-3">
                <SkeletonBlock className="h-4 w-44 rounded" />
                <SkeletonBlock className="mt-2 h-3 w-52 rounded" />
              </article>
            ))}
          </div>
        ) : !status?.connected ? (
          <p className="text-sm text-slate-600">Connect GitHub to import repositories.</p>
        ) : loadingRepos && !repos.length ? (
          <div className="grid gap-2 rounded-xl border border-slate-200 p-2">
            {[0, 1, 2].map((placeholder) => (
              <article key={placeholder} className="rounded-xl border border-slate-200 p-3">
                <SkeletonBlock className="h-4 w-44 rounded" />
                <SkeletonBlock className="mt-2 h-3 w-52 rounded" />
              </article>
            ))}
          </div>
        ) : repos.length ? (
          <div className="grid gap-2 max-h-72 overflow-auto rounded-xl border border-slate-200 p-2">
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => setSelectedRepo(repo)}
                className={`rounded-xl border p-3 text-left ${
                  selectedRepo?.id === repo.id ? 'border-slate-900' : 'border-slate-200'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{repo.fullName}</p>
                <p className="text-xs text-slate-600">
                  default branch: {repo.defaultBranch} | {repo.private ? 'private' : 'public'}
                </p>
                {!repo.canAdmin ? (
                  <p className="text-xs text-amber-700">
                    Limited permissions. Admin/push access is required for automatic webhook setup.
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No repositories found.</p>
        )}
      </SectionCard>

      <SectionCard title="Bind To Project" subtitle="Apply selected repository to a project deployment configuration.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label>
            <span className="field-label">Project</span>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="field-input"
            >
              {!projects.length ? <option value="">No projects</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-primary self-end disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={linkRepoToProject}
            disabled={!selectedRepo || !selectedProjectId || !selectedRepo.canAdmin}
          >
            Link repository
          </button>
        </div>
        <div className="mt-3 panel-muted p-3 text-sm text-slate-700">
          <p>
            Selected repo: <span className="font-medium">{selectedRepo?.fullName ?? 'None'}</span>
          </p>
          <p>
            Selected project: <span className="font-medium">{selectedProject?.name ?? 'None'}</span>
          </p>
        </div>
      </SectionCard>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
