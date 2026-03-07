import { apiClient } from './api';

// ── Dev Container ─────────────────────────────────────────────────────────────

export interface DevContainerStatus {
  exists: boolean;
  container?: {
    id: string;
    dockerContainerId: string;
    status: 'running' | 'starting' | 'sleeping' | 'stopped' | 'crashed';
    sleepStatus: string;
    volumeName: string;
    startedAt: string | null;
    createdAt: string;
  };
}

export const devContainerApi = {
  get: (projectId: string): Promise<DevContainerStatus> =>
    apiClient.get(`/projects/${projectId}/dev-container`),

  create: (
    projectId: string,
    opts?: { gitUrl?: string; branch?: string },
  ): Promise<{ container: { id: string; status: string; volumeName: string } }> =>
    apiClient.post(`/projects/${projectId}/dev-container`, opts ?? {}),

  start: (projectId: string) => apiClient.post(`/projects/${projectId}/dev-container/start`, {}),

  stop: (projectId: string) => apiClient.post(`/projects/${projectId}/dev-container/stop`, {}),

  delete: (projectId: string, deleteVolumes = false) =>
    apiClient.delete(`/projects/${projectId}/dev-container?deleteVolumes=${deleteVolumes}`),
};

// ── Files ─────────────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  absPath: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

export const fileApi = {
  list: (projectId: string, dirPath?: string): Promise<{ entries: FileEntry[] }> =>
    apiClient.get(
      `/projects/${projectId}/files${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`,
    ),

  read: (projectId: string, filePath: string): Promise<{ path: string; content: string }> =>
    apiClient.get(`/projects/${projectId}/files/${filePath.replace(/^\//, '')}`),

  create: (
    projectId: string,
    path: string,
    content = '',
  ): Promise<{ path: string; created: boolean }> =>
    apiClient.post(`/projects/${projectId}/files`, { path, content }),

  update: (
    projectId: string,
    filePath: string,
    content: string,
  ): Promise<{ path: string; updated: boolean }> =>
    apiClient.patch(`/projects/${projectId}/files/${filePath.replace(/^\//, '')}`, { content }),

  delete: (projectId: string, filePath: string): Promise<{ path: string; deleted: boolean }> =>
    apiClient.delete(`/projects/${projectId}/files/${filePath.replace(/^\//, '')}`),
};

// ── Codex Agent ───────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentContextFile {
  path: string;
  content: string;
  dirty?: boolean;
}

export interface AgentFileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  content: string;
  description: string;
}

export interface AgentSuggestedCommand {
  command: string;
  description: string;
}

export interface AgentResponse {
  reply: string;
  fileChanges: AgentFileChange[];
  suggestedCommands: AgentSuggestedCommand[];
  inspectedFiles: string[];
  model: string;
}

export const agentApi = {
  respond: (
    projectId: string,
    body: {
      messages: AgentMessage[];
      activePath?: string | null;
      openFiles: AgentContextFile[];
    },
  ): Promise<AgentResponse> => apiClient.post(`/projects/${projectId}/codex/respond`, body),
};
