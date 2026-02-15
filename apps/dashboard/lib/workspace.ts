'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from './api';

export interface WorkspaceOrganization {
  id: string;
  name: string;
  role: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  slug: string;
  runtime: string;
  serviceType: string;
  outputDirectory: string | null;
  repoUrl: string | null;
  repoFullName: string | null;
  branch: string;
  rootDirectory: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  targetPort: number;
  wakeMessage?: string | null;
  wakeRetrySeconds?: number;
  autoDeployEnabled: boolean;
  activeDeploymentId: string | null;
  resourceRamMb: number;
  resourceCpuMillicore: number;
  resourceBandwidthGb: number;
  usage?: {
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
  } | null;
}

const STORAGE_KEY = 'apployd_selected_org';

export const useWorkspace = () => {
  const [organizations, setOrganizations] = useState<WorkspaceOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationIdState] = useState('');
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setSelectedOrganizationId = useCallback((organizationId: string) => {
    setSelectedOrganizationIdState(organizationId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, organizationId);
    }
  }, []);

  const loadOrganizations = useCallback(async (): Promise<WorkspaceOrganization[]> => {
    const orgData = await apiClient.get('/organizations');
    const orgs = (orgData.organizations ?? []) as WorkspaceOrganization[];
    setOrganizations(orgs);
    return orgs;
  }, []);

  const loadProjects = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setProjects([]);
      return;
    }

    const projectData = await apiClient.get(`/projects?organizationId=${organizationId}`);
    setProjects((projectData.projects ?? []) as WorkspaceProject[]);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const orgs = await loadOrganizations();
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      const candidate =
        (stored && orgs.find((org) => org.id === stored)?.id) ||
        orgs[0]?.id ||
        '';

      setSelectedOrganizationIdState(candidate);
      if (candidate) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, candidate);
        }
        await loadProjects(candidate);
      } else {
        setProjects([]);
      }
    } catch (err) {
      setError((err as Error).message);
      setProjects([]);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [loadOrganizations, loadProjects]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      return;
    }

    loadProjects(selectedOrganizationId).catch((err) => setError((err as Error).message));
  }, [selectedOrganizationId, loadProjects]);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  return {
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    setSelectedOrganizationId,
    projects,
    loading,
    error,
    refresh,
  };
};
