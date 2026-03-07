import { z } from 'zod';

import { env } from '../config/env.js';

const MAX_MESSAGES = 12;
const MAX_MODEL_PASSES = 3;
const MAX_REQUESTED_FILES = 6;
const MAX_FILE_CHARS = 20_000;
const MAX_TOTAL_CONTEXT_CHARS = 120_000;

const modelResponseSchema = z.object({
  reply: z.string().default(''),
  requestedFiles: z.array(z.string()).max(MAX_REQUESTED_FILES).default([]),
  fileChanges: z
    .array(
      z.object({
        path: z.string(),
        action: z.enum(['create', 'update', 'delete']),
        content: z.string(),
        description: z.string(),
      }),
    )
    .max(8)
    .default([]),
  suggestedCommands: z
    .array(
      z.object({
        command: z.string(),
        description: z.string(),
      }),
    )
    .max(6)
    .default([]),
});

const responseFormatSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'requestedFiles', 'fileChanges', 'suggestedCommands'],
  properties: {
    reply: { type: 'string' },
    requestedFiles: {
      type: 'array',
      items: { type: 'string' },
      maxItems: MAX_REQUESTED_FILES,
    },
    fileChanges: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'action', 'content', 'description'],
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['create', 'update', 'delete'] },
          content: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    suggestedCommands: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'description'],
        properties: {
          command: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
} as const;

interface LoadedContextFile {
  path: string;
  content: string;
  source: 'editor' | 'repo';
  truncated: boolean;
}

export interface AgentConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentOpenFile {
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

export interface CodexAgentRequest {
  projectName: string;
  repoUrl?: string | null;
  activePath?: string | null;
  messages: AgentConversationMessage[];
  openFiles: AgentOpenFile[];
  availableFiles: string[];
  readFile: (path: string) => Promise<string | null>;
}

export interface CodexAgentResponse {
  reply: string;
  fileChanges: AgentFileChange[];
  suggestedCommands: AgentSuggestedCommand[];
  inspectedFiles: string[];
  model: string;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const sanitizeText = (value: string): string => value.replace(/\u0000/g, '').trimEnd();

const truncateText = (value: string, limit: number): { content: string; truncated: boolean } => {
  if (value.length <= limit) {
    return { content: value, truncated: false };
  }

  return {
    content: `${value.slice(0, Math.max(limit - 38, 0))}\n\n/* truncated for context */`,
    truncated: true,
  };
};

export const normalizeAgentPath = (value: string): string | null => {
  const normalized = value
    .replace(/^\/home\/coder\/project\/?/i, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();

  if (!normalized || normalized.includes('..')) {
    return null;
  }

  return normalized;
};

const languageHintForPath = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    json: 'json',
    md: 'md',
    css: 'css',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    py: 'py',
    sql: 'sql',
    prisma: 'prisma',
  };
  return map[extension] ?? '';
};

const buildAvailableFilesList = (availableFiles: string[]): string =>
  availableFiles.length > 0 ? availableFiles.join('\n') : '(no files found)';

const buildContextSnapshot = (
  input: Pick<CodexAgentRequest, 'projectName' | 'repoUrl' | 'activePath' | 'availableFiles'>,
  loadedFiles: LoadedContextFile[],
): string => {
  const fileSections =
    loadedFiles.length > 0
      ? loadedFiles
          .map((file) => {
            const language = languageHintForPath(file.path);
            const notes = [
              file.source === 'editor' ? 'from editor state' : 'from repository',
              file.truncated ? 'truncated' : null,
            ]
              .filter(Boolean)
              .join(', ');

            return [
              `File: ${file.path}${notes ? ` (${notes})` : ''}`,
              `\`\`\`${language}`,
              file.content,
              '```',
            ].join('\n');
          })
          .join('\n\n')
      : '(no file contents loaded yet)';

  return [
    `Project: ${input.projectName}`,
    `Repository URL: ${input.repoUrl ?? 'not linked'}`,
    `Active file: ${input.activePath ?? 'none selected'}`,
    '',
    'Available repository files:',
    buildAvailableFilesList(input.availableFiles),
    '',
    'Loaded file contents:',
    fileSections,
    '',
    'Open editor files may include unsaved changes and should take precedence over repo versions.',
  ].join('\n');
};

const buildInstructions = (): string =>
  [
    'You are Codex inside a browser-based code editor.',
    'Return valid JSON that matches the provided schema.',
    'Use the repository file list and loaded file contents to answer the user.',
    'If you need more context before editing, list specific paths in requestedFiles and keep fileChanges empty.',
    'When you propose fileChanges, each create or update must contain the full replacement file content.',
    'Prefer small, coherent edits that match the project style and existing stack.',
    'Never request files outside the provided repository file list.',
    'Use suggestedCommands for concise verification steps the user can run after applying changes.',
    'Keep reply concise and action-oriented.',
  ].join(' ');

const extractResponseText = (payload: any): string => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const parts: string[] = [];

  for (const item of payload?.output ?? []) {
    if (item?.type !== 'message') {
      continue;
    }

    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string' && content.text.length > 0) {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
};

export class CodexAgentService {
  private readonly apiKey = env.OPENAI_API_KEY ?? '';
  private readonly baseUrl = trimTrailingSlash(env.OPENAI_BASE_URL);
  private readonly model = env.OPENAI_CODEX_MODEL;

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async respond(input: CodexAgentRequest): Promise<CodexAgentResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        'Codex agent is not configured. Set OPENAI_API_KEY on the control-plane service.',
      );
    }

    const availableFiles = [
      ...new Set(
        input.availableFiles
          .map((path) => normalizeAgentPath(path))
          .filter((path): path is string => Boolean(path)),
      ),
    ].sort((a, b) => a.localeCompare(b));

    const availableFileSet = new Set(availableFiles);
    const loadedFiles = new Map<string, LoadedContextFile>();
    let totalContextChars = 0;

    const addContextFile = (
      path: string,
      content: string,
      source: LoadedContextFile['source'],
      force = false,
    ): boolean => {
      const normalizedPath = normalizeAgentPath(path);
      if (!normalizedPath) {
        return false;
      }

      const sanitized = sanitizeText(content);
      const next = truncateText(sanitized, MAX_FILE_CHARS);
      const existing = loadedFiles.get(normalizedPath);
      const existingLength = existing?.content.length ?? 0;
      const projectedTotal = totalContextChars - existingLength + next.content.length;

      if (!force && projectedTotal > MAX_TOTAL_CONTEXT_CHARS) {
        return false;
      }

      loadedFiles.set(normalizedPath, {
        path: normalizedPath,
        content: next.content,
        source,
        truncated: next.truncated,
      });
      totalContextChars = projectedTotal;
      return true;
    };

    const prioritizedOpenFiles = [...input.openFiles].sort((a, b) => {
      if (a.path === input.activePath) return -1;
      if (b.path === input.activePath) return 1;
      return 0;
    });

    for (const file of prioritizedOpenFiles) {
      addContextFile(file.path, file.content, 'editor', true);
    }

    const autoContextCandidates = [
      input.activePath ?? null,
      'README.md',
      'package.json',
      (() => {
        const activePath = normalizeAgentPath(input.activePath ?? '');
        if (!activePath) return null;

        const parts = activePath.split('/');
        if (parts.length >= 2 && ['apps', 'services', 'packages'].includes(parts[0] ?? '')) {
          return `${parts[0]}/${parts[1]}/package.json`;
        }

        return null;
      })(),
    ]
      .filter((path): path is string => Boolean(path))
      .filter((path, index, list) => list.indexOf(path) === index);

    for (const path of autoContextCandidates) {
      const normalizedPath = normalizeAgentPath(path);
      if (
        !normalizedPath ||
        loadedFiles.has(normalizedPath) ||
        !availableFileSet.has(normalizedPath)
      ) {
        continue;
      }

      const content = await input.readFile(normalizedPath);
      if (content) {
        addContextFile(normalizedPath, content, 'repo');
      }
    }

    let latest = await this.callModel({ ...input, availableFiles }, [...loadedFiles.values()]);

    for (let pass = 1; pass < MAX_MODEL_PASSES; pass += 1) {
      const nextRequestedFiles = latest.requestedFiles
        .map((path) => normalizeAgentPath(path))
        .filter((path): path is string => Boolean(path))
        .filter((path, index, list) => list.indexOf(path) === index)
        .filter((path) => availableFileSet.has(path))
        .filter((path) => !loadedFiles.has(path))
        .slice(0, MAX_REQUESTED_FILES);

      if (nextRequestedFiles.length === 0) {
        break;
      }

      let addedAny = false;
      for (const path of nextRequestedFiles) {
        const content = await input.readFile(path);
        if (!content) {
          continue;
        }

        const added = addContextFile(path, content, 'repo');
        addedAny ||= added;
      }

      if (!addedAny) {
        break;
      }

      latest = await this.callModel({ ...input, availableFiles }, [...loadedFiles.values()]);
    }

    const fileChanges = latest.fileChanges
      .map((change) => {
        const normalizedPath = normalizeAgentPath(change.path);
        if (!normalizedPath) {
          return null;
        }

        return {
          path: normalizedPath,
          action: change.action,
          content: change.action === 'delete' ? '' : change.content,
          description: sanitizeText(change.description),
        } satisfies AgentFileChange;
      })
      .filter((change): change is AgentFileChange => Boolean(change));

    const suggestedCommands = latest.suggestedCommands
      .map((command) => ({
        command: sanitizeText(command.command),
        description: sanitizeText(command.description),
      }))
      .filter((command) => command.command.length > 0);

    return {
      reply:
        sanitizeText(latest.reply) ||
        'I reviewed the current context and did not produce a change set yet.',
      fileChanges,
      suggestedCommands,
      inspectedFiles: [...loadedFiles.keys()],
      model: this.model,
    };
  }

  private async callModel(input: CodexAgentRequest, loadedFiles: LoadedContextFile[]) {
    const messages = input.messages
      .slice(-MAX_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: sanitizeText(message.content),
      }))
      .filter((message) => message.content.length > 0);

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: this.model,
        instructions: buildInstructions(),
        input: [
          {
            role: 'user',
            content: buildContextSnapshot(input, loadedFiles),
          },
          ...messages,
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'editor_agent_response',
            strict: true,
            schema: responseFormatSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      let message = `OpenAI request failed: HTTP ${response.status}`;

      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        message = parsed.error?.message ?? message;
      } catch {
        if (body.trim()) {
          message = body.trim();
        }
      }

      throw new Error(message);
    }

    const payload = await response.json();
    const outputText = extractResponseText(payload);

    if (!outputText) {
      throw new Error('OpenAI returned an empty response for the Codex agent.');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outputText);
    } catch {
      throw new Error('OpenAI returned malformed JSON for the Codex agent.');
    }

    return modelResponseSchema.parse(parsedJson);
  }
}
