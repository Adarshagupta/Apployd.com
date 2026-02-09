'use client';

import { useEffect, useRef, useState } from 'react';

import { LogsTable } from '../../../components/logs-table';
import { SectionCard } from '../../../components/section-card';
import { apiClient, resolveWebSocketBaseUrl } from '../../../lib/api';
import { useWorkspaceContext } from '../../../components/workspace-provider';

interface LogRow {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export default function LogsPage() {
  const { projects } = useWorkspaceContext();
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [message, setMessage] = useState('Select organization and project to view logs.');
  const [deploymentId, setDeploymentId] = useState('');
  const [streamEvents, setStreamEvents] = useState<Array<{ type: string; message: string; timestamp: string }>>([]);
  const socketRef = useRef<WebSocket | null>(null);

  const closeSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    return () => closeSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projects.length) {
      setProjectId('');
      return;
    }
    if (!projects.some((project) => project.id === projectId)) {
      const first = projects[0];
      if (first) {
        setProjectId(first.id);
      }
    }
  }, [projects, projectId]);

  const loadLogs = async () => {
    if (!projectId) {
      setMessage('Project required');
      return;
    }
    try {
      const data = await apiClient.get(`/logs?projectId=${projectId}&limit=200`);
      setRows(data.logs ?? []);
      setMessage(`Loaded ${data.logs?.length ?? 0} logs`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const connectDeploymentStream = () => {
    if (!deploymentId) {
      setMessage('Deployment ID required.');
      return;
    }

    closeSocket();
    const wsBase = resolveWebSocketBaseUrl();
    const wsUrl = new URL(`${wsBase}/ws/deployments/${deploymentId}`);
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('apployd_token') ?? '' : '';
    if (token) {
      wsUrl.searchParams.set('token', token);
    }
    const socket = new WebSocket(wsUrl.toString());
    socketRef.current = socket;
    setStreamEvents([]);

    socket.onopen = () => {
      setStreamEvents((previous) => [
        ...previous,
        { type: 'stream', message: 'Connected', timestamp: new Date().toISOString() },
      ]);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { type?: string; message?: string; timestamp?: string };
        setStreamEvents((previous) => [
          ...previous,
          {
            type: payload.type ?? 'event',
            message: payload.message ?? String(event.data),
            timestamp: payload.timestamp ?? new Date().toISOString(),
          },
        ]);
      } catch {
        setStreamEvents((previous) => [
          ...previous,
          { type: 'event', message: String(event.data), timestamp: new Date().toISOString() },
        ]);
      }
    };
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Query Logs" subtitle="Load recent log records from centralized project logs.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label>
            <span className="field-label">Project</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="field-input">
              {!projects.length ? <option value="">No projects</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={loadLogs} className="btn-primary self-end">
            Load logs
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Log Output">
        <LogsTable rows={rows} />
      </SectionCard>

      <SectionCard title="Live Deployment Stream" subtitle="Stream deployment engine events using deployment ID.">
        <div className="mb-2 grid gap-3 md:grid-cols-[1fr_auto]">
          <label>
            <span className="field-label">Deployment ID</span>
            <input
              value={deploymentId}
              onChange={(event) => setDeploymentId(event.target.value)}
              placeholder="cuid deployment id"
              className="field-input"
            />
          </label>
          <button onClick={connectDeploymentStream} className="btn-secondary self-end">
            Connect stream
          </button>
        </div>
        <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 p-3">
          {streamEvents.length ? (
            streamEvents.map((event, index) => (
              <p key={`${event.timestamp}-${index}`} className="text-xs text-slate-700">
                <span className="mono text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</span>{' '}
                <span className="uppercase text-slate-600">[{event.type}]</span> {event.message}
              </p>
            ))
          ) : (
            <p className="text-xs text-slate-500">Connect with deployment ID to stream events.</p>
          )}
        </div>
      </SectionCard>

      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}
