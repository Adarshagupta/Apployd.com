'use client';

import { createContext, useContext, type ReactNode } from 'react';

import {
  useWorkspace,
  type WorkspaceOrganization,
  type WorkspaceProject,
  type WorkspaceSubscription,
} from '../lib/workspace';

interface WorkspaceContextValue {
  organizations: WorkspaceOrganization[];
  selectedOrganization: WorkspaceOrganization | null;
  selectedOrganizationId: string;
  setSelectedOrganizationId: (id: string) => void;
  projects: WorkspaceProject[];
  subscription: WorkspaceSubscription | null;
  subscriptionLoading: boolean;
  loading: boolean;
  error: string;
  subscriptionError: string;
  refresh: () => Promise<void>;
  refreshSubscription: () => Promise<WorkspaceSubscription | null>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return ctx;
}
