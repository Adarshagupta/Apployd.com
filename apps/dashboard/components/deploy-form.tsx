'use client';

import { useEffect, useRef, useState } from 'react';

import { apiClient } from '../lib/api';

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

interface DeploymentEvent {
  type: string;
  message: string;
  timestamp: string;
}

interface EnvRow {
  key: string;
  value: string;
}

export function DeployForm({
  projectId,
  defaults,
  activeDeploymentId,
  onDeploymentComplete,
}: {
  projectId: string;
  defaults?: {
    domain?: string | null;
    gitUrl?: string | null;
    branch?: string | null;
    rootDirectory?: string | null;
    startCommand?: string | null;
    buildCommand?: string | null;
    port?: number;
    serviceType?: string | null;
    outputDirectory?: string | null;
  };
  /** If set, reconnects to an in-progress deployment's WebSocket stream on mount. */
  activeDeploymentId?: string | null;
  /** Called when a deployment reaches a terminal state (ready / failed). */
  onDeploymentComplete?: () => void;
}) {
  const [showOverrides, setShowOverrides] = useState(false);
  const [environment, setEnvironment] = useState<'production' | 'preview'>('production');
  const [serviceType, setServiceType] = useState<'web_service' | 'static_site'>(
    (defaults?.serviceType as 'web_service' | 'static_site') || 'web_service',
  );
  const [outputDirectory, setOutputDirectory] = useState(defaults?.outputDirectory ?? '');
  const [domain, setDomain] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [rootDirectory, setRootDirectory] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [port, setPort] = useState<number | ''>('');
  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<string>('Ready');
  const [events, setEvents] = useState<DeploymentEvent[]>([]);
  const [liveUrl, setLiveUrl] = useState<string>('');
  const [envRows, setEnvRows] = useState<EnvRow[]>([{ key: '', value: '' }]);
  const socketRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const onCompleteRef = useRef(onDeploymentComplete);
  onCompleteRef.current = onDeploymentComplete;

  useEffect(() => {
    setDomain('');
    setGitUrl('');
    setBranch('');
    setRootDirectory('');
    setStartCommand('');
    setBuildCommand('');
    setPort('');
    setShowOverrides(false);
    setServiceType((defaults?.serviceType as 'web_service' | 'static_site') || 'web_service');
    setOutputDirectory(defaults?.outputDirectory ?? '');
  }, [projectId]);

  useEffect(() => {
    setEnvRows([{ key: '', value: '' }]);
  }, [projectId]);

  /* ── Reconnect to an in-progress deployment when returning to the page ── */
  useEffect(() => {
    if (!activeDeploymentId) return;

    // Fetch the deployment to see if it's still in progress
    apiClient
      .get(`/deployments/${activeDeploymentId}`)
      .then((dep: { status?: string; websocket?: string; url?: string; domain?: string }) => {
        const inProgress = ['queued', 'building', 'deploying'].includes(dep.status ?? '');
        if (!inProgress) return;

        setDeploying(true);
        setStatus(`Reconnected — ${dep.status}`);
        setEvents([]);

        if (dep.websocket) {
          connectDeploymentStream(dep.websocket);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeploymentId]);

  const closeSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, []);

  const pushEvent = (event: DeploymentEvent) => {
    setEvents((previous) => [...previous, event].slice(-200));
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const connectDeploymentStream = (socketUrl: string) => {
    closeSocket();
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('apployd_token') ?? '' : '';
    const url = new URL(socketUrl);
    if (token) {
      url.searchParams.set('token', token);
    }

    const socket = new WebSocket(url.toString());
    socketRef.current = socket;

    socket.onmessage = (messageEvent) => {
      try {
        const parsed = JSON.parse(messageEvent.data as string) as DeploymentEvent;
        pushEvent({
          type: parsed.type ?? 'event',
          message: parsed.message ?? String(messageEvent.data),
          timestamp: parsed.timestamp ?? new Date().toISOString(),
        });

        if (parsed.type === 'failed') {
          setStatus(`Failed: ${parsed.message}`);
          setDeploying(false);
          onCompleteRef.current?.();
        }

        if (parsed.type === 'ready') {
          setStatus('Deployment completed');
          setDeploying(false);
          onCompleteRef.current?.();
          const urlMatch = parsed.message.match(/https?:\/\/[^\s]+/i);
          if (urlMatch?.[0]) {
            setLiveUrl(urlMatch[0]);
          }
        }
      } catch {
        pushEvent({
          type: 'event',
          message: String(messageEvent.data),
          timestamp: new Date().toISOString(),
        });
      }
    };
  };

  const effectiveGitUrl = gitUrl || defaults?.gitUrl || '';
  const effectiveBranch = branch || defaults?.branch || '';
  const effectiveStartCommand = startCommand || defaults?.startCommand || '';
  const effectivePort = port || defaults?.port || 3000;

  const hasDefaults = !!(defaults?.gitUrl);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!effectiveGitUrl) {
      setStatus('Failed: No repository URL configured. Set it in project settings or provide an override.');
      return;
    }

    setDeploying(true);
    setStatus('Deploying...');
    setEvents([]);
    setLiveUrl('');

    const envPayload: Record<string, string> = {};
    const seenKeys = new Set<string>();

    for (const row of envRows) {
      const key = row.key.trim().toUpperCase();
      const value = row.value.trim();

      if (!key && !value) {
        continue;
      }
      if (!key || !value) {
        setStatus('Failed: Each environment variable needs both key and value.');
        setDeploying(false);
        return;
      }
      if (!ENV_KEY_PATTERN.test(key)) {
        setStatus('Failed: Environment keys must be uppercase snake case (for example: DATABASE_URL).');
        setDeploying(false);
        return;
      }
      if (seenKeys.has(key)) {
        setStatus(`Failed: Duplicate environment key: ${key}`);
        setDeploying(false);
        return;
      }
      seenKeys.add(key);
      envPayload[key] = value;
    }

    if (Object.keys(envPayload).length > 50) {
      setStatus('Failed: At most 50 environment variables are allowed.');
      setDeploying(false);
      return;
    }

    try {
      const idempotencyKey =
        typeof window !== 'undefined' && 'crypto' in window && 'randomUUID' in window.crypto
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const response = await apiClient.post(
        '/deployments',
        {
          projectId,
          environment,
          domain: domain || undefined,
          gitUrl: gitUrl || undefined,
          branch: branch || undefined,
          rootDirectory: rootDirectory || undefined,
          startCommand: startCommand || undefined,
          buildCommand: buildCommand || undefined,
          port: typeof port === 'number' && Number.isFinite(port) ? port : undefined,
          env: envPayload,
          serviceType,
          outputDirectory: serviceType === 'static_site' ? (outputDirectory || undefined) : undefined,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        },
      );

      setStatus(response.idempotentReplay ? `Reused deployment ${response.deploymentId}` : 'Queued');
      if (response.url && !/\.localhost$/i.test(String(response.domain ?? ''))) {
        setLiveUrl(response.url);
      } else if (response.domain) {
        const computedUrl =
          /^(https?:\/\/)/i.test(response.domain) ||
          /^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(response.domain)
            ? response.domain.startsWith('http')
              ? response.domain
              : `http://${response.domain}`
            : `https://${response.domain}`;
        if (!/\.localhost$/i.test(response.domain)) {
          setLiveUrl(computedUrl);
        }
      }

      if (response.websocket) {
        connectDeploymentStream(response.websocket);
      }
    } catch (error) {
      setStatus(`Failed: ${(error as Error).message}`);
      setDeploying(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {hasDefaults ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold text-slate-700">Using project settings:</p>
          <p>
            {defaults?.gitUrl}{defaults?.branch ? ` @ ${defaults.branch}` : ''}{' '}
            &middot; port {defaults?.port ?? 3000}
            {defaults?.rootDirectory ? ` · root: ${defaults.rootDirectory}` : ''}
          </p>
          {defaults?.buildCommand ? <p>Build: {defaults.buildCommand}</p> : null}
          {defaults?.startCommand ? <p>Start: {defaults.startCommand}</p> : <p className="text-xs text-slate-400">Start: auto-detect from package.json</p>}
        </div>
      ) : (
        <p className="text-xs text-amber-700">
          No repository configured in project settings. Provide it below.
        </p>
      )}

      {/* ── Service Type Selector ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">Service Type</p>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
          <button
            type="button"
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              serviceType === 'web_service'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setServiceType('web_service')}
          >
            <span className="block text-xs">Web Service</span>
            <span className="block text-[10px] opacity-70 mt-0.5">Backend, API, full-stack</span>
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              serviceType === 'static_site'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setServiceType('static_site')}
          >
            <span className="block text-xs">Static Site</span>
            <span className="block text-[10px] opacity-70 mt-0.5">React, Vue, Vite, Next export</span>
          </button>
        </div>
      </div>

      {serviceType === 'static_site' && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
          <label>
            <span className="text-xs font-semibold text-blue-800">Output / Publish Directory</span>
            <input
              value={outputDirectory}
              onChange={(event) => setOutputDirectory(event.target.value)}
              className="field-input mt-1"
              placeholder="dist"
            />
          </label>
          <p className="text-[10px] text-blue-600">
            The folder containing your built static files (e.g. <code>dist</code>, <code>build</code>, <code>out</code>, <code>.next/out</code>).
            Your site will be served with nginx + SPA fallback.
          </p>
        </div>
      )}

      <button
        type="button"
        className="text-xs text-slate-500 hover:text-slate-800 underline"
        onClick={() => setShowOverrides(!showOverrides)}
      >
        {showOverrides ? 'Hide' : 'Show'} deployment overrides
      </button>

      {showOverrides ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">
            Leave fields blank to use project defaults. Values here apply only to this deployment.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              <span className="field-label">Domain override</span>
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                className="field-input"
                placeholder={defaults?.domain ?? 'auto-generated'}
              />
            </label>
            <label>
              <span className="field-label">Repository URL override</span>
              <input
                value={gitUrl}
                onChange={(event) => setGitUrl(event.target.value)}
                className="field-input"
                placeholder={defaults?.gitUrl ?? 'https://github.com/org/repo.git'}
              />
            </label>
            <label>
              <span className="field-label">Branch override</span>
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                className="field-input"
                placeholder={defaults?.branch ?? 'default branch'}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label>
              <span className="field-label">Root directory</span>
              <input
                value={rootDirectory}
                onChange={(event) => setRootDirectory(event.target.value)}
                className="field-input"
                placeholder={defaults?.rootDirectory ?? 'e.g. apps/web'}
              />
            </label>
            <label>
              <span className="field-label">Build command</span>
              <input
                value={buildCommand}
                onChange={(event) => setBuildCommand(event.target.value)}
                className="field-input"
                placeholder={defaults?.buildCommand ?? 'npm run build'}
              />
            </label>
            <label>
              <span className="field-label">Start command</span>
              <input
                value={startCommand}
                onChange={(event) => setStartCommand(event.target.value)}
                className="field-input"
                placeholder={defaults?.startCommand ?? 'auto-detect from package.json'}
              />
            </label>
            <label>
              <span className="field-label">Port</span>
              <input
                type="number"
                value={port}
                onChange={(event) => setPort(event.target.value ? Number(event.target.value) : '')}
                className="field-input"
                min={1}
                max={65535}
                placeholder={String(defaults?.port ?? 3000)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {(!hasDefaults || showOverrides) ? (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-sm font-semibold text-slate-900">Environment variables (optional)</p>
          <div className="space-y-2">
            {envRows.map((row, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                <input
                  value={row.key}
                  onChange={(event) =>
                    setEnvRows((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value.toUpperCase() } : item,
                      ),
                    )
                  }
                  className="field-input"
                  placeholder="DATABASE_URL"
                />
                <input
                  value={row.value}
                  onChange={(event) =>
                    setEnvRows((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                  className="field-input"
                  placeholder="postgres://..."
                  type="password"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setEnvRows((prev) => {
                      if (prev.length === 1) {
                        return [{ key: '', value: '' }];
                      }
                      return prev.filter((_, itemIndex) => itemIndex !== index);
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEnvRows((prev) => [...prev, { key: '', value: '' }])}
          >
            Add variable
          </button>
          <p className="text-xs text-slate-600">
            Keys must be uppercase snake case. These values apply only to this deployment request.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mr-2">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              environment === 'production'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setEnvironment('production')}
          >
            Production
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              environment === 'preview'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setEnvironment('preview')}
          >
            Preview
          </button>
        </div>
        <button type="submit" className="btn-primary" disabled={deploying}>
          {deploying ? 'Deploying...' : environment === 'preview' ? 'Deploy Preview' : 'Deploy to Production'}
        </button>
        <p className="self-center text-sm text-slate-600">{status}</p>
      </div>

      {liveUrl ? (
        <p className="text-sm text-slate-700">
          Live URL:{' '}
          <a href={liveUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">
            {liveUrl}
          </a>
        </p>
      ) : null}

      <div className="max-h-56 space-y-1 overflow-auto rounded-xl border border-slate-200 p-3">
        {events.length ? (
          events.map((item, index) => (
            <p
              key={`evt-${index}-${item.timestamp}`}
              className={`text-xs ${item.type === 'log' ? 'font-mono text-slate-500' : 'text-slate-700'}`}
            >
              <span className="mono text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span>{' '}
              {item.type !== 'log' && <span className="uppercase text-slate-600">[{item.type}]</span>}{' '}
              {item.message}
            </p>
          ))
        ) : (
          <p className="text-xs text-slate-500">Deployment events appear here in real time.</p>
        )}
        <div ref={logEndRef} />
      </div>
    </form>
  );
}
