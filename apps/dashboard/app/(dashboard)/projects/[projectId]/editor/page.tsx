'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import AiAgentPanel from '../../../../../components/ai-agent-panel';
import { devContainerApi, fileApi } from '../../../../../lib/editor-api';
import type { AgentFileChange } from '../../../../../lib/editor-api';
import type { FileEntry } from '../../../../../lib/editor-api';
import { useWorkspaceContext } from '../../../../../components/workspace-provider';
import FileTree from '../../../../../components/file-tree';

// Lazy-loaded heavy components
const CodeEditor = dynamic(() => import('../../../../../components/code-editor'), { ssr: false });
const Terminal = dynamic(() => import('../../../../../components/dev-terminal'), { ssr: false });

type Panel = 'editor' | 'terminal' | 'split';

interface OpenTab {
  path: string;
  content: string;
  dirty: boolean;
}

function useAuth() {
  const [token, setToken] = useState<string>('');
  useEffect(() => {
    setToken(window.localStorage.getItem('apployd_token') ?? '');
  }, []);
  return token;
}

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';
  const router = useRouter();
  const token = useAuth();
  const { projects } = useWorkspaceContext();
  const project = projects.find((p) => p.id === projectId) ?? null;

  // ── State ────────────────────────────────────────────────────────────────
  const [containerStatus, setContainerStatus] = useState<
    'loading' | 'none' | 'starting' | 'running' | 'stopped' | 'error'
  >('loading');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('split');
  const [showAgent, setShowAgent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'ok' | 'err' } | null>(
    null,
  );
  // Prevent duplicate auto-create attempts
  const autoCreateAttempted = useRef(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    try {
      const { entries } = await fileApi.list(projectId);
      setFiles(entries);
    } catch {
      // container might still be booting
    }
  }, [projectId]);

  // ── Boot: check container status ─────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;

    void (async () => {
      try {
        const status = await devContainerApi.get(projectId);
        if (!status.exists) {
          setContainerStatus('none');
          // Auto-create will trigger via the effect below once project data is available
        } else if (status.container?.status === 'running') {
          setContainerStatus('running');
          await loadFiles();
        } else if (
          status.container?.status === 'stopped' ||
          status.container?.status === 'sleeping'
        ) {
          setContainerStatus('stopped');
        } else {
          setContainerStatus('none');
        }
      } catch {
        setContainerStatus('error');
      }
    })();
  }, [projectId, loadFiles]);

  // ── Auto-create: once project loaded and container is missing ────────────
  useEffect(() => {
    if (!projectId || autoCreateAttempted.current) return;
    if (containerStatus !== 'none') return;
    // Wait until workspace has loaded project data
    if (projects.length === 0) return;

    autoCreateAttempted.current = true;

    if (project?.repoUrl) {
      // Silently create and clone — no modal needed
      setContainerStatus('starting');
      setSetupLoading(true);
      const repoUrl = project.repoUrl;
      const createOptions = project.branch
        ? { gitUrl: repoUrl, branch: project.branch }
        : { gitUrl: repoUrl };
      devContainerApi
        .create(projectId, createOptions)
        .then(async () => {
          setContainerStatus('running');
          await loadFiles();
          notify('Dev environment ready!');
        })
        .catch((e: unknown) => {
          setContainerStatus('none');
          setShowSetup(true);
          notify((e as Error).message, 'err');
        })
        .finally(() => setSetupLoading(false));
    } else {
      // No repo linked — show manual setup
      setShowSetup(true);
    }
  }, [projectId, project, projects.length, containerStatus, loadFiles]);

  // ── Create container (manual, from setup modal) ───────────────────────────
  const handleCreateContainer = async () => {
    if (!projectId) return;
    setSetupLoading(true);
    try {
      const repoToUse = gitUrl || project?.repoUrl || undefined;
      const createOptions = repoToUse
        ? project?.branch
          ? { gitUrl: repoToUse, branch: project.branch }
          : { gitUrl: repoToUse }
        : {};
      await devContainerApi.create(projectId, createOptions);
      setContainerStatus('running');
      setShowSetup(false);
      await loadFiles();
      notify('Dev environment ready!');
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleStartContainer = async () => {
    if (!projectId) return;
    setContainerStatus('starting');
    try {
      await devContainerApi.start(projectId);
      setContainerStatus('running');
      await loadFiles();
      notify('Environment started!');
    } catch (e) {
      setContainerStatus('stopped');
      notify((e as Error).message, 'err');
    }
  };

  // ── Open file ─────────────────────────────────────────────────────────────
  const openFile = useCallback(
    async (entry: FileEntry) => {
      if (!projectId || entry.type === 'directory') return;

      // Already open?
      const existing = tabs.find((t) => t.path === entry.path);
      if (existing) {
        setActiveTab(entry.path);
        return;
      }

      try {
        const { content } = await fileApi.read(projectId, entry.path);
        setTabs((prev) => [...prev, { path: entry.path, content, dirty: false }]);
        setActiveTab(entry.path);
      } catch (e) {
        notify((e as Error).message, 'err');
      }
    },
    [projectId, tabs],
  );

  // ── Save file (debounced) ─────────────────────────────────────────────────
  const saveFile = useCallback(
    async (path: string, content: string) => {
      if (!projectId) return;
      setSaving(true);
      try {
        await fileApi.update(projectId, path, content);
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, content, dirty: false } : t)));
      } catch (e) {
        notify((e as Error).message, 'err');
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  const handleEditorChange = useCallback(
    (value: string) => {
      if (!activeTab) return;
      setTabs((prev) =>
        prev.map((t) => (t.path === activeTab ? { ...t, content: value, dirty: true } : t)),
      );
      // Auto-save after 2s idle
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveFile(activeTab, value);
      }, 2000);
    },
    [activeTab, saveFile],
  );

  const handleManuaLSave = () => {
    const tab = tabs.find((t) => t.path === activeTab);
    if (tab) saveFile(tab.path, tab.content);
  };

  // ── Close tab ─────────────────────────────────────────────────────────────
  const closeTab = (path: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activeTab === path) {
        setActiveTab(next[next.length - 1]?.path ?? null);
      }
      return next;
    });
  };

  // ── Delete file ──────────────────────────────────────────────────────────
  const handleDeleteFile = async (entry: FileEntry) => {
    if (!projectId) return;
    if (!confirm(`Delete ${entry.path}?`)) return;
    try {
      await fileApi.delete(projectId, entry.path);
      closeTab(entry.path);
      await loadFiles();
      notify('File deleted');
    } catch (e) {
      notify((e as Error).message, 'err');
    }
  };

  // ── New file ─────────────────────────────────────────────────────────────
  const handleNewFile = async (dirPath: string) => {
    if (!projectId) return;
    const name = window.prompt('File name:');
    if (!name) return;
    const path = dirPath ? `${dirPath}/${name}` : name;
    try {
      await fileApi.create(projectId, path, '');
      await loadFiles();
      const entry: FileEntry = {
        path,
        absPath: `/home/coder/project/${path}`,
        type: 'file',
        size: 0,
        modifiedAt: new Date().toISOString(),
      };
      openFile(entry);
    } catch (e) {
      notify((e as Error).message, 'err');
    }
  };

  const applyAgentChanges = async (changes: AgentFileChange[]) => {
    if (!projectId || changes.length === 0) return;

    const nextTabs = [...tabs];
    let nextActiveTab = activeTab;
    const knownFiles = new Set(
      files.filter((entry) => entry.type === 'file').map((entry) => entry.path),
    );

    for (const change of changes) {
      const normalizedPath = change.path.replace(/^\/+/, '');
      if (!normalizedPath) continue;

      if (change.action === 'delete') {
        await fileApi.delete(projectId, normalizedPath);
        knownFiles.delete(normalizedPath);

        const deleteIndex = nextTabs.findIndex((tab) => tab.path === normalizedPath);
        if (deleteIndex !== -1) {
          nextTabs.splice(deleteIndex, 1);
          if (nextActiveTab === normalizedPath) {
            nextActiveTab =
              nextTabs[Math.max(deleteIndex - 1, 0)]?.path ?? nextTabs[0]?.path ?? null;
          }
        }
        continue;
      }

      if (knownFiles.has(normalizedPath)) {
        await fileApi.update(projectId, normalizedPath, change.content);
      } else {
        await fileApi.create(projectId, normalizedPath, change.content);
        knownFiles.add(normalizedPath);
      }

      const nextTab = { path: normalizedPath, content: change.content, dirty: false };
      const tabIndex = nextTabs.findIndex((tab) => tab.path === normalizedPath);
      if (tabIndex === -1) {
        nextTabs.push(nextTab);
      } else {
        nextTabs[tabIndex] = nextTab;
      }
      nextActiveTab = normalizedPath;
    }

    setTabs(nextTabs);
    setActiveTab(nextActiveTab);
    await loadFiles().catch(() => undefined);
  };

  // ── Active tab content ────────────────────────────────────────────────────
  const activeTabData = tabs.find((t) => t.path === activeTab);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <Link href={`/projects/${projectId}`} className="text-gray-400 hover:text-white text-sm">
          ← {project?.name ?? 'Project'}
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-sm text-gray-300 font-medium">Code Studio</span>

        {/* Container status badge */}
        <div
          className={`ml-2 flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full
          ${
            containerStatus === 'running'
              ? 'bg-green-900/50 text-green-400'
              : containerStatus === 'starting'
                ? 'bg-yellow-900/50 text-yellow-400'
                : containerStatus === 'stopped'
                  ? 'bg-gray-800 text-gray-500'
                  : 'bg-gray-800 text-gray-500'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full
            ${
              containerStatus === 'running'
                ? 'bg-green-400'
                : containerStatus === 'starting'
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-gray-600'
            }`}
          />
          {containerStatus === 'running'
            ? 'Environment running'
            : containerStatus === 'starting'
              ? 'Preparing…'
              : containerStatus === 'stopped'
                ? 'Environment stopped'
                : containerStatus === 'loading'
                  ? 'Loading…'
                  : 'No environment'}
        </div>

        {containerStatus === 'stopped' && (
          <button
            onClick={handleStartContainer}
            className="text-xs px-2 py-0.5 bg-green-800 hover:bg-green-700 text-green-300 rounded"
          >
            Start
          </button>
        )}

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex gap-1 bg-gray-800 rounded p-0.5">
          {(['editor', 'split', 'terminal'] as Panel[]).map((p) => (
            <button
              key={p}
              onClick={() => setPanel(p)}
              className={`text-xs px-2 py-0.5 rounded capitalize transition-colors
                ${panel === p ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAgent((prev) => !prev)}
          className={`text-xs px-3 py-1 rounded transition-colors ${
            showAgent
              ? 'bg-amber-500 text-gray-950 hover:bg-amber-400'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {showAgent ? 'Hide agent' : 'Show agent'}
        </button>

        {/* Save */}
        <button
          onClick={handleManuaLSave}
          disabled={!activeTabData?.dirty}
          className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── Notification ───────────────────────────────────────────────── */}
      {notification && (
        <div
          className={`text-xs px-3 py-1.5 text-center shrink-0
          ${notification.type === 'ok' ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}
        >
          {notification.msg}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      {tabs.length > 0 && (
        <div className="flex gap-0 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0">
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-gray-800 shrink-0 group
                ${activeTab === tab.path ? 'bg-gray-950 text-white border-t-2 border-t-blue-500' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
              onClick={() => setActiveTab(tab.path)}
            >
              <span className="truncate max-w-[120px]">{tab.path.split('/').pop()}</span>
              {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-white ml-0.5"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* File tree sidebar */}
        <div className="w-52 sm:w-60 shrink-0 hidden sm:flex flex-col">
          {containerStatus === 'running' && (
            <FileTree
              entries={files}
              selectedPath={activeTab ?? undefined}
              onSelect={openFile}
              onRefresh={loadFiles}
              onNewFile={handleNewFile}
              onDelete={handleDeleteFile}
            />
          )}
        </div>

        {/* Editor + Terminal */}
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {/* Editor pane */}
          {(panel === 'editor' || panel === 'split') && (
            <div className={`overflow-hidden ${panel === 'split' ? 'flex-1' : 'flex-1'}`}>
              {activeTabData ? (
                <CodeEditor
                  path={activeTabData.path}
                  content={activeTabData.content}
                  onChange={handleEditorChange}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                  <div className="text-4xl mb-3">📄</div>
                  <div className="text-sm">Select a file to edit</div>
                  <div className="text-xs mt-1">or open the terminal to use CLI tools</div>
                </div>
              )}
            </div>
          )}

          {/* Divider for split */}
          {panel === 'split' && <div className="h-px bg-gray-800 shrink-0" />}

          {/* Terminal pane */}
          {(panel === 'terminal' || panel === 'split') &&
            token &&
            containerStatus === 'running' && (
              <div className={panel === 'split' ? 'h-[40%]' : 'flex-1'}>
                <Terminal projectId={projectId ?? ''} token={token} className="h-full" />
              </div>
            )}

          {(panel === 'terminal' || panel === 'split') && containerStatus !== 'running' && (
            <div
              className={`flex items-center justify-center text-gray-600 text-sm ${panel === 'split' ? 'h-[40%]' : 'flex-1'}`}
            >
              {containerStatus === 'starting'
                ? 'Preparing your environment…'
                : 'Start a dev environment to use the terminal'}
            </div>
          )}
        </div>

        {showAgent && (
          <div className="h-[45%] min-h-[320px] shrink-0 lg:h-auto lg:w-[28rem]">
            <AiAgentPanel
              projectId={projectId}
              activePath={activeTab}
              openFiles={tabs}
              enabled={containerStatus === 'running'}
              onApplyChanges={applyAgentChanges}
              onNotify={notify}
            />
          </div>
        )}
      </div>

      {/* ── Setup modal ────────────────────────────────────────────────── */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Start Code Studio</h2>
            <p className="text-sm text-gray-400 mb-5">
              Launch a dev environment with git, Node.js, Python, and GitHub CLI pre-installed. Your
              files are saved between sessions.
            </p>

            <label className="block text-xs text-gray-400 mb-1">Git repo URL (optional)</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 mb-4 focus:outline-none focus:border-blue-500"
              placeholder="https://github.com/you/repo.git"
              value={gitUrl || project?.repoUrl || ''}
              onChange={(e) => setGitUrl(e.target.value)}
            />
            <p className="text-xs text-gray-500 mb-5">
              If provided, your repository will be cloned automatically. You can also clone manually
              from the terminal.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSetup(false);
                  router.back();
                }}
                className="flex-1 px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateContainer}
                disabled={setupLoading}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {setupLoading ? 'Starting…' : 'Start Environment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
