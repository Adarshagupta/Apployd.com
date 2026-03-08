import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

import { ApploydApiClient } from './client.js';
import {
  authStorePath,
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from './auth-store.js';

const argsSchema = z.object({
  command: z.enum(['serve', 'login', 'logout', 'whoami', 'help']).default('serve'),
  noOpen: z.boolean().default(false),
  apiBaseUrl: z.string().url().optional(),
});

interface ParsedArgs {
  command: 'serve' | 'login' | 'logout' | 'whoami' | 'help';
  noOpen: boolean;
  apiBaseUrl?: string;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  token?: string;
  defaultOrganizationId?: string;
}

const DEFAULT_API_BASE_URL = 'https://apployd.com/api/v1';

export const parseArgs = (argv: string[]): ParsedArgs => {
  let command: ParsedArgs['command'] = 'serve';
  let noOpen = false;
  let apiBaseUrl: string | undefined;

  const remaining = [...argv];
  if (remaining[0] && !remaining[0].startsWith('-')) {
    const candidate = remaining.shift();
    if (
      candidate === 'serve'
      || candidate === 'login'
      || candidate === 'logout'
      || candidate === 'whoami'
      || candidate === 'help'
    ) {
      command = candidate;
    } else {
      throw new Error(`Unknown command "${candidate}". Use login, logout, whoami, or serve.`);
    }
  }

  for (let index = 0; index < remaining.length; index += 1) {
    const value = remaining[index];
    if (value === '--no-open') {
      noOpen = true;
      continue;
    }

    if (value === '--api-base-url') {
      const next = remaining[index + 1];
      if (!next) {
        throw new Error('--api-base-url requires a value.');
      }
      apiBaseUrl = next;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      command = 'help';
      continue;
    }

    throw new Error(`Unknown option "${value}".`);
  }

  const parsed = argsSchema.parse({
    command,
    noOpen,
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
  });

  return {
    command: parsed.command,
    noOpen: parsed.noOpen,
    ...(parsed.apiBaseUrl ? { apiBaseUrl: parsed.apiBaseUrl } : {}),
  };
};

export const resolveRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const stored = await readStoredSession();
  const apiBaseUrl =
    process.env.APPLOYD_API_BASE_URL?.trim()
    || stored?.apiBaseUrl
    || DEFAULT_API_BASE_URL;
  const token = process.env.APPLOYD_API_TOKEN?.trim() || stored?.token;
  const defaultOrganizationId =
    process.env.APPLOYD_DEFAULT_ORGANIZATION_ID?.trim() || stored?.defaultOrganizationId;

  return {
    apiBaseUrl,
    ...(token ? { token } : {}),
    ...(defaultOrganizationId ? { defaultOrganizationId } : {}),
  };
};

export const requireRuntimeToken = (config: RuntimeConfig): string => {
  if (config.token?.trim()) {
    return config.token.trim();
  }

  throw new Error(
    'Apployd authentication is missing. Run `apployd-mcp-server login` or set APPLOYD_API_TOKEN.',
  );
};

const openUrl = async (url: string): Promise<boolean> => {
  const candidateCommands: Array<{ command: string; args: string[] }> = (() => {
    if (process.platform === 'darwin') {
      return [{ command: 'open', args: [url] }];
    }

    if (process.platform === 'win32') {
      return [{ command: 'cmd', args: ['/c', 'start', '', url] }];
    }

    return [{ command: 'xdg-open', args: [url] }];
  })();

  for (const candidate of candidateCommands) {
    try {
      const child = spawn(candidate.command, candidate.args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    } catch {
      // Try the next candidate if available.
    }
  }

  return false;
};

export const runLoginCommand = async (input: { apiBaseUrl?: string; noOpen: boolean }) => {
  const apiBaseUrl = input.apiBaseUrl ?? process.env.APPLOYD_API_BASE_URL?.trim() ?? DEFAULT_API_BASE_URL;
  const client = new ApploydApiClient(undefined, apiBaseUrl);
  const started = await client.startCliLogin();

  process.stdout.write(`Apployd login\n\n`);
  process.stdout.write(`Open this URL to continue:\n${started.verificationUrl}\n\n`);

  if (!input.noOpen) {
    const opened = await openUrl(started.verificationUrl);
    process.stdout.write(
      opened ? 'Opened browser for login.\n' : 'Could not open browser automatically.\n',
    );
  }

  const deadline = Date.now() + started.expiresInSeconds * 1000;

  while (Date.now() < deadline) {
    const polled = await client.pollCliLogin(started.challengeId);
    if (polled.status === 'pending') {
      await sleep((polled.pollIntervalSeconds ?? started.pollIntervalSeconds) * 1000);
      continue;
    }

    if (polled.status === 'expired') {
      throw new Error('Login session expired. Run the login command again.');
    }

    const authenticatedClient = new ApploydApiClient(polled.token, apiBaseUrl);
    const organizations = await authenticatedClient.getOrganizations();
    const defaultOrganizationId =
      organizations.length === 1 && organizations[0]?.id ? organizations[0].id : undefined;

    await writeStoredSession({
      token: polled.token,
      apiBaseUrl,
      ...(defaultOrganizationId ? { defaultOrganizationId } : {}),
      user: polled.user,
      savedAt: new Date().toISOString(),
    });

    process.stdout.write(`Logged in as ${polled.user.email}.\n`);
    if (defaultOrganizationId) {
      process.stdout.write(`Default organization: ${defaultOrganizationId}\n`);
    } else if (organizations.length > 1) {
      process.stdout.write(
        'Multiple organizations detected. Set APPLOYD_DEFAULT_ORGANIZATION_ID when needed.\n',
      );
    }
    process.stdout.write(`Credentials stored at ${authStorePath()}.\n`);
    return;
  }

  throw new Error('Login timed out. Run the login command again.');
};

export const runLogoutCommand = async () => {
  await clearStoredSession();
  process.stdout.write(`Removed stored credentials from ${authStorePath()}.\n`);
};

export const runWhoAmICommand = async () => {
  const runtimeConfig = await resolveRuntimeConfig();
  const token = requireRuntimeToken(runtimeConfig);
  const client = new ApploydApiClient(token, runtimeConfig.apiBaseUrl);
  const [user, organizations] = await Promise.all([client.getCurrentUser(), client.getOrganizations()]);

  process.stdout.write(
    `${JSON.stringify(
      {
        apiBaseUrl: runtimeConfig.apiBaseUrl,
        user: user.user,
        defaultOrganizationId: runtimeConfig.defaultOrganizationId ?? null,
        organizations,
      },
      null,
      2,
    )}\n`,
  );
};

export const printHelp = () => {
  process.stdout.write(`Apployd MCP Server

Usage:
  apployd-mcp-server                 Start the MCP server over stdio
  apployd-mcp-server serve           Start the MCP server over stdio
  apployd-mcp-server login           Sign in through the browser and cache a token locally
  apployd-mcp-server logout          Remove the cached token
  apployd-mcp-server whoami          Show the authenticated user and organizations

Options:
  --api-base-url <url>               Override the Apployd API base URL
  --no-open                          Print the login URL without opening a browser
`);
};
