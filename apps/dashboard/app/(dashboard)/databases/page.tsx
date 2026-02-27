'use client';

import { useCallback, useEffect, useState } from 'react';

import { useDashboardMessageToast } from '../../../components/dashboard-toast';
import { SectionCard } from '../../../components/section-card';
import { useWorkspaceContext } from '../../../components/workspace-provider';
import { apiClient } from '../../../lib/api';

export const dynamic = 'force-dynamic';

interface ManagedDatabaseSummary {
  id: string;
  organizationId: string;
  projectId: string | null;
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
  const { selectedOrganizationId } = useWorkspaceContext();
  const [databases, setDatabases] = useState<ManagedDatabaseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [message, setMessage] = useState('');
  const [lastConnectionUrl, setLastConnectionUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [neonConfigured, setNeonConfigured] = useState(true);
  const [form, setForm] = useState({
    projectName: '',
    regionId: '',
    branchName: 'main',
    databaseName: '',
    roleName: '',
  });
  useDashboardMessageToast(message);

  const loadDatabases = useCallback(async () => {
    if (!selectedOrganizationId) {
      setDatabases([]);
      setNeonConfigured(true);
      return;
    }

    try {
      setLoading(true);
      const query = new URLSearchParams({
        organizationId: selectedOrganizationId,
      });
      const data = (await apiClient.get(`/databases?${query.toString()}`)) as {
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
  }, [selectedOrganizationId]);

  useEffect(() => {
    loadDatabases().catch(() => undefined);
  }, [loadDatabases]);

  const createDatabase = async () => {
    if (!selectedOrganizationId) {
      setMessage('Select a workspace first.');
      return;
    }

    if (!neonConfigured) {
      setMessage('Neon API is not configured on server.');
      return;
    }

    try {
      setProvisioning(true);
      setMessage('');
      setCopied(false);
      setLastConnectionUrl('');
      const payload = {
        organizationId: selectedOrganizationId,
        projectName: form.projectName.trim() || undefined,
        regionId: form.regionId.trim() || undefined,
        branchName: form.branchName.trim() || undefined,
        databaseName: form.databaseName.trim() || undefined,
        roleName: form.roleName.trim() || undefined,
      };

      const result = (await apiClient.post('/databases/neon/provision', payload)) as {
        database?: ManagedDatabaseSummary;
        connectionUrl?: string;
      };

      await loadDatabases();
      if (result.connectionUrl) {
        setLastConnectionUrl(result.connectionUrl);
        setMessage(`Database "${result.database?.name ?? 'database'}" created successfully.`);
      } else {
        setMessage('Database created, but connection string was not returned.');
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setProvisioning(false);
    }
  };

  const copyConnectionUrl = async () => {
    if (!lastConnectionUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(lastConnectionUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Databases"
        subtitle="Create standalone Neon PostgreSQL databases for your workspace. No project binding is required."
      >
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadDatabases()}
            disabled={loading || !selectedOrganizationId}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Create Neon PostgreSQL"
        subtitle="Provision a standalone database and get a ready-to-use PostgreSQL connection string."
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
                placeholder="Bookai database"
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
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={createDatabase}
              disabled={provisioning || !neonConfigured || !selectedOrganizationId}
            >
              {provisioning ? 'Creating...' : 'Create database'}
            </button>
          </div>
        </div>
      </SectionCard>

      {lastConnectionUrl ? (
        <SectionCard
          title="PostgreSQL Connection String"
          subtitle="This is shown immediately after creation. Save it securely in your application secrets."
        >
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <code className="mono block break-all text-xs text-slate-700">{lastConnectionUrl}</code>
            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={copyConnectionUrl}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Provisioned Databases"
        subtitle="Standalone databases created in this workspace."
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
                  branch={database.branchName} db={database.databaseName} role={database.roleName}
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
    </div>
  );
}
