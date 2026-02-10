'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { useWorkspaceContext } from '../../../components/workspace-provider';

export const dynamic = 'force-dynamic';

type ProjectViewMode = 'grid' | 'list';
type ProjectStatusFilter = 'all' | 'deployed' | 'notDeployed';

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export default function ProjectsPage() {
  const {
    projects,
    loading,
    error: workspaceError,
  } = useWorkspaceContext();

  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ProjectViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const created = searchParams?.get('created');
    if (!created) return;
    const secretSetup = searchParams?.get('secretSetup');
    if (secretSetup === 'partial') {
      setMessage('Project created. Some environment variables could not be saved - add them on the project page.');
    } else if (secretSetup === 'ok') {
      setMessage('Project created with environment variables.');
    } else {
      setMessage('Project created successfully.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [addMenuOpen]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'deployed'
            ? Boolean(project.activeDeploymentId)
            : !project.activeDeploymentId;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableFields = [project.name, project.slug, project.repoFullName ?? '', project.branch ?? ''];
      return searchableFields.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [projects, searchQuery, statusFilter]);

  const cycleStatusFilter = () => {
    setStatusFilter((current) => {
      if (current === 'all') {
        return 'deployed';
      }
      if (current === 'deployed') {
        return 'notDeployed';
      }
      return 'all';
    });
  };

  const statusFilterLabel =
    statusFilter === 'all' ? 'All projects' : statusFilter === 'deployed' ? 'Deployed only' : 'Not deployed only';

  return (
    <div className="space-y-0">
      <SectionCard
        title=""
        subtitle=""
      >
        <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Projects..."
                className="field-input h-11 pl-10 pr-3"
                aria-label="Search projects"
              />
            </div>

            <button
              type="button"
              onClick={cycleStatusFilter}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${
                statusFilter === 'all'
                  ? 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-900 bg-slate-900 text-white'
              }`}
              aria-label={`Filter projects: ${statusFilterLabel}`}
              title={statusFilterLabel}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 4h18" />
                <path d="M6 12h12" />
                <path d="M10 20h4" />
              </svg>
            </button>

            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-label="Grid view"
                title="Grid view"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-label="List view"
                title="List view"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              className="btn-primary min-w-[160px] justify-between gap-3 px-5"
              onClick={() => setAddMenuOpen((open) => !open)}
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
            >
              <span>Add New...</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {addMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-lg sm:right-0 sm:w-52">
                <Link
                  href="/projects/new"
                  className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setAddMenuOpen(false)}
                >
                  New Project
                </Link>
                <Link
                  href="/integrations"
                  className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setAddMenuOpen(false)}
                >
                  Connect Repository
                </Link>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {[0, 1, 2, 3, 4, 5].map((placeholder) => (
              <article
                key={placeholder}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 p-5"
              >
                <div>
                  <SkeletonBlock className="h-5 w-36 rounded-lg" />
                  <SkeletonBlock className="mt-2 h-3 w-24 rounded" />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  {[0, 1, 2].map((metric) => (
                    <div key={metric}>
                      <SkeletonBlock className="h-3 w-10 rounded" />
                      <SkeletonBlock className="mt-1.5 h-3 w-12 rounded" />
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <SkeletonBlock className="h-5 w-24 rounded-full" />
                  <SkeletonBlock className="h-5 w-16 rounded-full" />
                </div>
              </article>
            ))}
          </div>
        ) : projects.length ? (
          filteredProjects.length ? (
            viewMode === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group flex flex-col justify-between rounded-xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                  >
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 transition group-hover:text-slate-700">
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
                          <p className="text-slate-500">
                            {formatDecimal(project.usage.utilization.cpuPercentOfAllocation, 2)}%
                          </p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide text-slate-500">RAM</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-800">
                            {formatDecimal(project.usage.derived.ramGibHours, 3)} GiB h
                          </p>
                          <p className="text-slate-500">
                            {formatDecimal(project.usage.utilization.ramPercentOfAllocation, 2)}%
                          </p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide text-slate-500">BW</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-800">
                            {formatDecimal(project.usage.derived.bandwidthGib, 3)} GiB
                          </p>
                          <p className="text-slate-500">
                            {formatDecimal(project.usage.utilization.bandwidthPercentOfAllocation, 2)}%
                          </p>
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
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 font-medium text-white">
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
              <div className="space-y-3">
                {filteredProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group flex flex-col gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-slate-700">
                        {project.name}
                      </h3>
                      <p className="mono mt-1 truncate text-xs text-slate-500">{project.slug}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {project.repoFullName && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                          {project.repoFullName}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {project.branch}
                      </span>
                      {project.activeDeploymentId ? (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 font-medium text-white">
                          Deployed
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                          Not deployed
                        </span>
                      )}
                      {project.usage ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                          CPU {formatDecimal(project.usage.derived.cpuCoreHours, 2)} ch
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
              <p className="text-sm text-slate-500">No projects match the current search and filter.</p>
              <button
                type="button"
                className="mt-3 inline-block text-sm font-medium text-slate-900 hover:underline"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
            <p className="text-sm text-slate-500">No projects in this organization yet.</p>
            <Link
              href="/projects/new"
              className="mt-3 inline-block text-sm font-medium text-slate-900 hover:underline"
            >
              Create your first project
            </Link>
          </div>
        )}

        {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
        {workspaceError && <p className="mt-2 text-sm text-slate-900">{workspaceError}</p>}
      </SectionCard>
    </div>
  );
}
