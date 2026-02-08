'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspace } from '../../../lib/workspace';

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
  connection: {
    username: string;
    avatarUrl: string | null;
    tokenScope: string | null;
    createdAt: string;
  } | null;
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const {
    organizations,
    selectedOrganizationId,
    setSelectedOrganizationId,
    projects,
    refresh,
  } = useWorkspace();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [message, setMessage] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);

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
    const githubState = searchParams.get('github');
    const githubMessage = searchParams.get('githubMessage');
    if (githubState === 'connected') {
      setMessage('GitHub connected successfully.');
    } else if (githubState === 'error') {
      setMessage(githubMessage ?? 'GitHub connection failed.');
    }
  }, [searchParams]);

  const loadStatus = async () => {
    try {
      const data = await apiClient.get('/integrations/github/status');
      setStatus(data);
    } catch (error) {
      setMessage((error as Error).message);
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
  }, []);

  useEffect(() => {
    if (status?.connected) {
      loadRepos(search).catch(() => undefined);
    }
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

    try {
      await apiClient.patch(`/projects/${selectedProjectId}/git-settings`, {
        repoUrl: `${selectedRepo.htmlUrl}.git`,
        repoOwner: selectedRepo.owner,
        repoName: selectedRepo.name,
        repoFullName: selectedRepo.fullName,
        branch: selectedRepo.defaultBranch,
        autoDeployEnabled: true,
      });

      await refresh();
      setMessage(`Linked ${selectedRepo.fullName} to ${selectedProject?.name ?? 'project'}.`);
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
        <label className="mb-4 block max-w-sm">
          <span className="field-label">Organization</span>
          <select
            value={selectedOrganizationId}
            onChange={(event) => setSelectedOrganizationId(event.target.value)}
            className="field-input"
          >
            {!organizations.length ? <option value="">No organizations</option> : null}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <div className="panel-muted flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Connection status</p>
            <p className="text-sm text-slate-600">
              {!status?.configured
                ? 'GitHub OAuth not configured on server'
                : status.connected
                  ? `Connected as @${status.connection?.username}`
                  : 'Not connected'}
            </p>
          </div>
          <div className="flex gap-2">
            {!status?.connected ? (
              <button className="btn-primary" onClick={connectGitHub} disabled={!status?.configured}>
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
        {!status?.connected ? (
          <p className="text-sm text-slate-600">Connect GitHub to import repositories.</p>
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
          <button className="btn-primary self-end" type="button" onClick={linkRepoToProject}>
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
