'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { SectionCard } from '../../../components/section-card';
import { useWorkspace } from '../../../lib/workspace';

export default function ProjectsPage() {
  const {
    organizations,
    selectedOrganizationId,
    setSelectedOrganizationId,
    projects,
    error: workspaceError,
  } = useWorkspace();

  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');

  const formatDecimal = (raw: string, fractionDigits = 2) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return '0';
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    });
  };

  /* If user just came from /projects/new, flash a success message */
  useEffect(() => {
    const created = searchParams.get('created');
    if (!created) return;
    const secretSetup = searchParams.get('secretSetup');
    if (secretSetup === 'partial') {
      setMessage('Project created. Some environment variables could not be saved — add them on the project page.');
    } else if (secretSetup === 'ok') {
      setMessage('Project created with environment variables.');
    } else {
      setMessage('Project created successfully.');
    }
  }, [searchParams]);

  return (
    <div className="space-y-0">
      <SectionCard
        title="Projects"
        subtitle="Select a project to manage deployments, settings, and environment variables."
      >
        {/* Org selector */}
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <label className="w-full max-w-xs">
            <span className="field-label">Organization</span>
            <select
              className="field-input"
              value={selectedOrganizationId}
              onChange={(e) => setSelectedOrganizationId(e.target.value)}
            >
              {!organizations.length && <option value="">No organizations</option>}
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role})
                </option>
              ))}
            </select>
          </label>

          <Link href="/projects/new" className="btn-primary text-center">
            + New project
          </Link>
        </div>

        {/* Project grid */}
        {projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={`/projects/${project.id}` as any}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
              >
                <div>
                  <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition">
                    {project.name}
                  </h3>
                  <p className="mono mt-1 text-xs text-slate-500">{project.slug}</p>
                </div>

                {project.usage ? (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
                    <div>
                      <p className="uppercase tracking-wide text-slate-500">CPU</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-800">
                        {formatDecimal(project.usage.derived.cpuCoreHours, 3)} ch
                      </p>
                      <p className="text-slate-500">{formatDecimal(project.usage.utilization.cpuPercentOfAllocation, 2)}%</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wide text-slate-500">RAM</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-800">
                        {formatDecimal(project.usage.derived.ramGibHours, 3)} GiB h
                      </p>
                      <p className="text-slate-500">{formatDecimal(project.usage.utilization.ramPercentOfAllocation, 2)}%</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wide text-slate-500">BW</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-800">
                        {formatDecimal(project.usage.derived.bandwidthGib, 3)} GiB
                      </p>
                      <p className="text-slate-500">{formatDecimal(project.usage.utilization.bandwidthPercentOfAllocation, 2)}%</p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                  {project.repoFullName && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      {project.repoFullName}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {project.branch}
                  </span>
                  {project.activeDeploymentId ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                      Deployed
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                      Not deployed
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
            <p className="text-sm text-slate-500">No projects in this organization yet.</p>
            <Link
              href="/projects/new"
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Create your first project →
            </Link>
          </div>
        )}

        {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
        {workspaceError && <p className="mt-2 text-sm text-red-600">{workspaceError}</p>}
      </SectionCard>
    </div>
  );
}
