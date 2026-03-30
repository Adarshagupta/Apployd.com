'use client';

import { useEffect, useRef, useState } from 'react';

import {
  agentApi,
  type AgentContextFile,
  type AgentFileChange,
  type AgentResponse,
} from '../lib/editor-api';

interface AiAgentPanelProps {
  projectId: string;
  activePath?: string | null;
  openFiles: AgentContextFile[];
  enabled: boolean;
  onApplyChanges: (changes: AgentFileChange[]) => Promise<void>;
  onNotify?: ((message: string, type?: 'ok' | 'err') => void) | undefined;
}

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AgentResponse | undefined;
  applying?: boolean | undefined;
  applied?: boolean | undefined;
}

const quickPrompts = [
  'Explain the current file and point out risks.',
  'Refactor the active file to be cleaner without changing behavior.',
  'Add tests for the code I have open.',
];

const makeId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const previewContent = (content: string): string =>
  content.length > 4000 ? `${content.slice(0, 4000)}\n\n/* preview truncated */` : content;

export default function AiAgentPanel({
  projectId,
  activePath,
  openFiles,
  enabled,
  onApplyChanges,
  onNotify,
}: AiAgentPanelProps) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresAgentSubscription, setRequiresAgentSubscription] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [entries, loading]);

  const submitPrompt = async (rawPrompt?: string) => {
    const nextPrompt = (rawPrompt ?? prompt).trim();
    if (!nextPrompt || loading || !enabled) {
      return;
    }

    const userEntry: ChatEntry = {
      id: makeId(),
      role: 'user',
      content: nextPrompt,
    };

    const nextEntries = [...entries, userEntry];
    setEntries(nextEntries);
    setPrompt('');
    setError(null);
    setRequiresAgentSubscription(false);
    setLoading(true);

    try {
      const response = await agentApi.respond(projectId, {
        ...(activePath === undefined ? {} : { activePath }),
        openFiles,
        messages: nextEntries.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      });

      setEntries((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          content: response.reply,
          response,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Codex request failed.';
      setError(message);
      setRequiresAgentSubscription(
        message.toLowerCase().includes('agentic coding requires an active agent subscription'),
      );
      onNotify?.(message, 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (entryId: string, changes: AgentFileChange[]) => {
    if (changes.length === 0) {
      return;
    }

    setEntries((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, applying: true } : entry)),
    );
    setError(null);

    try {
      await onApplyChanges(changes);
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId ? { ...entry, applying: false, applied: true } : entry,
        ),
      );
      onNotify?.(
        `Applied ${changes.length} AI ${changes.length === 1 ? 'change' : 'changes'}.`,
        'ok',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply AI changes.';
      setEntries((current) =>
        current.map((entry) => (entry.id === entryId ? { ...entry, applying: false } : entry)),
      );
      setError(message);
      onNotify?.(message, 'err');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-gray-800 bg-gray-950 lg:border-l lg:border-t-0">
      <div className="border-b border-gray-800 bg-gradient-to-r from-amber-500/10 via-transparent to-cyan-400/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/80">
              Codex Agent
            </div>
            <div className="mt-1 text-sm text-gray-200">
              Repo-aware coding help inside Code Studio
            </div>
          </div>
          <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-200">
            OpenAI
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Uses the active file, open tabs, and repo files from the dev container.
        </div>
      </div>

      {!enabled ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center">
          <div>
            <div className="text-sm text-gray-300">
              Start the dev environment to use the Codex agent.
            </div>
            <div className="mt-2 text-xs text-gray-500">
              The agent needs the running workspace so it can inspect project files and propose
              edits.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {entries.length === 0 && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
                <div className="text-sm text-gray-200">
                  Ask for a change, review, or explanation.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickPrompts.map((item) => (
                    <button
                      key={item}
                      onClick={() => submitPrompt(item)}
                      className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1.5 text-xs text-gray-300 transition hover:border-amber-400/40 hover:text-white"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl border p-3 ${
                  entry.role === 'user'
                    ? 'ml-8 border-blue-500/20 bg-blue-500/10'
                    : 'mr-3 border-gray-800 bg-gray-900/80'
                }`}
              >
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                  {entry.role === 'user' ? 'You' : 'Codex'}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-gray-100">
                  {entry.content}
                </div>

                {entry.response?.fileChanges.length ? (
                  <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/80 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-gray-200">
                        {entry.response.fileChanges.length} proposed file{' '}
                        {entry.response.fileChanges.length === 1 ? 'change' : 'changes'}
                      </div>
                      <button
                        onClick={() => handleApply(entry.id, entry.response?.fileChanges ?? [])}
                        disabled={entry.applying || entry.applied}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
                      >
                        {entry.applying ? 'Applying…' : entry.applied ? 'Applied' : 'Apply changes'}
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {entry.response.fileChanges.map((change) => (
                        <details
                          key={`${change.action}:${change.path}`}
                          className="rounded-xl border border-gray-800 bg-black/20 p-3"
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm text-gray-100">{change.path}</div>
                                <div className="mt-1 text-xs text-gray-500">
                                  {change.description}
                                </div>
                              </div>
                              <div
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ${
                                  change.action === 'create'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : change.action === 'delete'
                                      ? 'bg-red-500/15 text-red-300'
                                      : 'bg-cyan-500/15 text-cyan-300'
                                }`}
                              >
                                {change.action}
                              </div>
                            </div>
                          </summary>
                          {change.action !== 'delete' && (
                            <pre className="mt-3 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs leading-5 text-gray-300">
                              <code>{previewContent(change.content)}</code>
                            </pre>
                          )}
                        </details>
                      ))}
                    </div>
                  </div>
                ) : null}

                {entry.response?.suggestedCommands.length ? (
                  <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/80 p-3">
                    <div className="text-sm text-gray-200">Suggested verification</div>
                    <div className="mt-3 space-y-2">
                      {entry.response.suggestedCommands.map((command) => (
                        <div
                          key={command.command}
                          className="rounded-lg border border-gray-800 bg-black/20 p-3"
                        >
                          <code className="block overflow-x-auto text-xs text-amber-200">
                            {command.command}
                          </code>
                          <div className="mt-2 text-xs text-gray-500">{command.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {entry.response?.inspectedFiles.length ? (
                  <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                    <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                      Context files ({entry.response.inspectedFiles.length})
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.response.inspectedFiles.map((file) => (
                        <span
                          key={file}
                          className="rounded-full border border-gray-800 bg-black/20 px-2 py-1 text-[11px] text-gray-400"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ))}

            {loading && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                  Codex
                </div>
                <div className="text-sm text-gray-300">Reviewing the repository context…</div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-800 bg-gray-950/90 px-4 py-4">
            {error && (
              <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
            {requiresAgentSubscription && (
              <a
                href="/billing"
                className="mb-3 inline-flex rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-300/20"
              >
                Activate Agent subscription
              </a>
            )}

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submitPrompt();
                }
              }}
              placeholder="Ask Codex to explain, refactor, or change your code…"
              className="min-h-[110px] w-full resize-none rounded-2xl border border-gray-800 bg-gray-900 px-3 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-amber-400/50"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {activePath ? `Active file: ${activePath}` : 'No active file selected'}
              </div>
              <button
                onClick={() => submitPrompt()}
                disabled={loading || prompt.trim().length === 0}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
              >
                {loading ? 'Thinking…' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
