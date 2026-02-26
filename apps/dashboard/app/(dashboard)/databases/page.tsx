'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { useWorkspaceContext } from '../../../components/workspace-provider';
import { apiClient } from '../../../lib/api';

export const dynamic = 'force-dynamic';

interface ManagedDatabaseSummary {
  id: string;
  provider: string;
  status: string;
  name: string;
  regionId: string;
  branchName: string;
  databaseName: string;
  roleName: string;
  secretKey: string;
  createdAt: string;
  updatedAt: string;
}

export default function DatabasesPage() {
  const { projects, loading: workspaceLoading } = useWorkspaceContext();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [databases, setDatabases] = useState<ManagedDatabaseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [message, setMessage] = useState('');
  const [neonConfigured, setNeonConfigured] = useState(true);
  const [form, setForm] = useState({
    projectName: '',
    regionId: '',
    branchName: 'main',
    databaseName: '',
    roleName: '',
    secretKey: 'DATABASE_URL',
  });

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

  const loadDatabases = useCallback(async () => {
    if (!selectedProjectId) {
      setDatabases([]);
      setNeonConfigured(true);
      return;
    }

    try {
      setLoading(true);
      const data = (await apiClient.get(`/projects/${selectedProjectId}/databases`)) as {
        neonConfigured?: boolean;
        databases?: ManagedDatabaseSummary[];
      };
      setDatabases(data.databases ?? []);
      setNeonConfigured(data.neonConfigured !== false);
      setMessage('');
    } catch (error) {
      setDatabases([]);
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadDatabases().catch(() => undefined);
  }, [loadDatabases]);

  const createDatabase = async () => {
    if (!selectedProjectId) {
      setMessage('Select a project first.');
      return;
    }

    if (!neonConfigured) {
      setMessage('Neon API is not configured on server.');
      return;
    }

    try {
      setProvisioning(true);
      setMessage('');
      const payload = {
        projectName: form.projectName.trim() || undefined,
        regionId: form.regionId.trim() || undefined,
        branchName: form.branchName.trim() || undefined,
        databaseName: form.databaseName.trim() || undefined,
        roleName: form.roleName.trim() || undefined,
        secretKey: form.secretKey.trim().toUpperCase() || 'DATABASE_URL',
      };

      const result = (await apiClient.post(
        `/projects/${selectedProjectId}/databases/neon/provision`,
        payload,
      )) as {
        database?: ManagedDatabaseSummary;
        secret?: { key?: string };
      };

      await loadDatabases();
      setMessage(
        result.database?.name
          ? `Database "${result.database.name}" created. Secret ${result.secret?.key ?? 'DATABASE_URL'} updated.`
          : 'Database created and project secret updated.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Databases"
        subtitle="Create Neon PostgreSQL databases and attach connection strings to project environment variables."
      >
        {!projects.length && !workspaceLoading ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center">
            <p className="text-sm text-slate-600">Create a project before provisioning a database.</p>
            <Link href="/projects/new" className="btn-primary mt-3 inline-flex">
              Create project
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label>
              <span className="field-label">Project</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="field-input"
                disabled={workspaceLoading || !projects.length}
              >
                {!projects.length ? <option value="">Loading projects...</option> : null}
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
              onClick={() => loadDatabases()}
              disabled={loading || !selectedProjectId}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}
      </SectionCard>

      {selectedProjectId ? (
        <SectionCard
          title="Provision Neon PostgreSQL"
          subtitle={`Provision a managed database for ${selectedProject?.name ?? 'selected project'}.`}
        >
          <div className="space-y-4">
            {!neonConfigured ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Neon API is not configured on this server. Ask admin to set <span className="mono">NEON_API_KEY</span>.
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="field-label">Neon project name (optional)</span>
                <input
                  value={form.projectName}
                  onChange={(event) => setForm((prev) => ({ ...prev, projectName: event.target.value }))}
                  className="field-input"
                  placeholder={`${selectedProject?.name ?? 'Project'} database`}
                />
              </label>
              <label>
                <span className="field-label">Region (optional)</span>
                <input
                  value={form.regionId}
                  onChange={(event) => setForm((prev) => ({ ...prev, regionId: event.target.value }))}
                  className="field-input"
                  placeholder="aws-us-east-1"
                />
              </label>
              <label>
                <span className="field-label">Branch</span>
                <input
                  value={form.branchName}
                  onChange={(event) => setForm((prev) => ({ ...prev, branchName: event.target.value }))}
                  className="field-input"
                  placeholder="main"
                />
              </label>
              <label>
                <span className="field-label">Database name (optional)</span>
                <input
                  value={form.databaseName}
                  onChange={(event) => setForm((prev) => ({ ...prev, databaseName: event.target.value }))}
                  className="field-input"
                  placeholder="app_db"
                />
              </label>
              <label>
                <span className="field-label">Role name (optional)</span>
                <input
                  value={form.roleName}
                  onChange={(event) => setForm((prev) => ({ ...prev, roleName: event.target.value }))}
                  className="field-input"
                  placeholder="app_user"
                />
              </label>
              <label>
                <span className="field-label">Secret key</span>
                <input
                  value={form.secretKey}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, secretKey: event.target.value.toUpperCase() }))
                  }
                  className="field-input"
                  placeholder="DATABASE_URL"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="btn-primary"
                onClick={createDatabase}
                disabled={provisioning || !neonConfigured}
              >
                {provisioning ? 'Creating...' : 'Create database'}
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {selectedProjectId ? (
        <SectionCard
          title="Databases In Project"
          subtitle="All managed databases provisioned for the selected project."
        >
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((placeholder) => (
                <div key={placeholder} className="skeleton h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : databases.length ? (
            <div className="space-y-2">
              {databases.map((database) => (
                <article key={database.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{database.name}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {database.provider} | {database.status} | {database.regionId}
                  </p>
                  <p className="mono mt-1 text-xs text-slate-700">
                    branch={database.branchName} db={database.databaseName} role={database.roleName}{' '}
                    secret={database.secretKey}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {new Date(database.createdAt).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-600">
              No databases provisioned yet.
            </div>
          )}
        </SectionCard>
      ) : null}

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
