'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from './api';

export interface WorkspaceOrganization {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
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
  attackModeEnabled?: boolean;
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

export interface WorkspaceSubscriptionEntitlements {
  autoDeploy?: boolean;
  previewDeployments?: boolean;
  customDomains?: boolean;
  managedDatabases?: boolean;
}

export interface WorkspaceSubscription {
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  poolRamMb?: number;
  poolCpuMillicores?: number;
  poolBandwidthGb?: number;
  entitlements?: WorkspaceSubscriptionEntitlements | null;
  plan?: {
    code?: string | null;
    displayName?: string | null;
  } | null;
}

const STORAGE_KEY = 'apployd_selected_org';
const SUBSCRIPTION_SYNC_KEY = 'apployd_subscription_sync';

export const useWorkspace = () => {
  const [organizations, setOrganizations] = useState<WorkspaceOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationIdState] = useState('');
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscriptionError, setSubscriptionError] = useState('');

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

  const loadSubscription = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setSubscription(null);
      setSubscriptionError('');
      setSubscriptionLoading(false);
      return null;
    }

    setSubscriptionLoading(true);
    setSubscriptionError('');

    try {
      const currentData = await apiClient.get(`/plans/current?organizationId=${organizationId}`);
      const nextSubscription = (currentData.subscription ?? null) as WorkspaceSubscription | null;
      setSubscription(nextSubscription);
      return nextSubscription;
    } catch (err) {
      setSubscription(null);
      setSubscriptionError((err as Error).message);
      throw err;
    } finally {
      setSubscriptionLoading(false);
    }
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
        const [projectsResult, subscriptionResult] = await Promise.allSettled([
          loadProjects(candidate),
          loadSubscription(candidate),
        ]);
        if (projectsResult.status === 'rejected') {
          throw projectsResult.reason;
        }
        if (subscriptionResult.status === 'rejected') {
          setSubscriptionError((subscriptionResult.reason as Error).message);
        }
      } else {
        setProjects([]);
        setSubscription(null);
        setSubscriptionError('');
        setSubscriptionLoading(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setProjects([]);
      setOrganizations([]);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [loadOrganizations, loadProjects, loadSubscription]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setSubscription(null);
      setSubscriptionError('');
      setSubscriptionLoading(false);
      return;
    }

    loadProjects(selectedOrganizationId).catch((err) => setError((err as Error).message));
    loadSubscription(selectedOrganizationId).catch(() => undefined);
  }, [selectedOrganizationId, loadProjects, loadSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SUBSCRIPTION_SYNC_KEY || !event.newValue || !selectedOrganizationId) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue) as { organizationId?: string | null };
        if (payload.organizationId === selectedOrganizationId) {
          loadSubscription(selectedOrganizationId).catch(() => undefined);
        }
      } catch {
        // Ignore malformed payloads from older clients or manual edits.
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [selectedOrganizationId, loadSubscription]);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const refreshSubscription = useCallback(async () => {
    if (!selectedOrganizationId) {
      setSubscription(null);
      setSubscriptionError('');
      setSubscriptionLoading(false);
      return null;
    }

    const nextSubscription = await loadSubscription(selectedOrganizationId);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SUBSCRIPTION_SYNC_KEY,
        JSON.stringify({
          organizationId: selectedOrganizationId,
          updatedAt: Date.now(),
        }),
      );
    }

    return nextSubscription;
  }, [loadSubscription, selectedOrganizationId]);

  return {
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    setSelectedOrganizationId,
    projects,
    subscription,
    subscriptionLoading,
    loading,
    error,
    subscriptionError,
    refresh,
    refreshSubscription,
  };
};
