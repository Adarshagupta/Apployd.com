import { createHash, randomBytes } from 'crypto';

import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { decryptSecret, encryptSecret } from '../../lib/secrets.js';

const connectQuerySchema = z.object({
  redirectTo: z.string().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const listVercelProjectsSchema = z.object({
  teamId: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  accessToken: z.string().trim().min(1).max(300).optional(),
});

const importVercelProjectSchema = z.object({
  projectIdOrName: z.string().trim().min(1).max(160),
  teamId: z.string().trim().min(1).max(120).optional(),
  accessToken: z.string().trim().min(1).max(300).optional(),
});

const oauthStateSchema = z.object({
  mode: z.literal('connect'),
  userId: z.string().cuid(),
  redirectTo: z.string(),
  codeVerifier: z.string().min(43).max(128),
});

interface OAuthStatePayload {
  mode: 'connect';
  userId: string;
  redirectTo: string;
  codeVerifier: string;
}

interface VercelOAuthTokenResponse {
  access_token?: string | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
  token_type?: string | undefined;
  expires_in?: number | undefined;
  id_token?: string | undefined;
  error?: string | undefined;
  error_description?: string | undefined;
}

interface VercelUserInfoSummary {
  id: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
}

const VERCEL_API_BASE = 'https://api.vercel.com';
const VERCEL_OAUTH_AUTHORIZE_URL = 'https://vercel.com/oauth/authorize';
const VERCEL_OAUTH_TOKEN_URL = 'https://api.vercel.com/v2/oauth/access_token';
const VERCEL_OAUTH_USERINFO_URL = 'https://api.vercel.com/v2/oauth/userinfo';
const OAUTH_STATE_PREFIX = 'apployd:oauth:vercel:';
const VERCEL_ENV_TARGET_PRIORITY: Record<string, number> = {
  production: 3,
  preview: 2,
  development: 1,
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asIdentifierString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return undefined;
};

const asPort = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const port = Math.floor(value);
  if (port < 1 || port > 65535) {
    return undefined;
  }
  return port;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const toBase64Url = (value: Buffer): string =>
  value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const generateCodeVerifier = (): string => toBase64Url(randomBytes(32));

const buildCodeChallenge = (codeVerifier: string): string =>
  toBase64Url(createHash('sha256').update(codeVerifier).digest());

const isVercelOAuthConfigured = (): boolean => Boolean(env.VERCEL_CLIENT_ID?.trim());

const getVercelOAuthRedirectUri = (): string =>
  env.VERCEL_OAUTH_REDIRECT_URI
  ?? `${trimTrailingSlash(env.API_BASE_URL)}/api/v1/integrations/vercel/callback`;

const safeRedirectPath = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const base = new URL(env.DASHBOARD_BASE_URL);
    if (parsed.origin === base.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
};

const dashboardRedirect = (input: {
  redirectTo: string;
  status: 'connected' | 'error';
  message?: string;
}): string => {
  const url = new URL(input.redirectTo, env.DASHBOARD_BASE_URL);
  url.searchParams.set('vercel', input.status);
  if (input.message) {
    url.searchParams.set('vercelMessage', input.message);
  }
  return url.toString();
};

const consumeOAuthState = async (
  state?: string,
): Promise<{ payload: OAuthStatePayload | null; reason: 'missing' | 'invalid' | null }> => {
  if (!state) {
    return { payload: null, reason: 'missing' };
  }

  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const stored = await redis.get(key);
  await redis.del(key);

  if (!stored) {
    return { payload: null, reason: 'missing' };
  }

  try {
    const parsed = oauthStateSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) {
      return { payload: null, reason: 'invalid' };
    }

    return {
      payload: {
        mode: 'connect',
        userId: parsed.data.userId,
        redirectTo: safeRedirectPath(parsed.data.redirectTo, '/projects/new'),
        codeVerifier: parsed.data.codeVerifier,
      },
      reason: null,
    };
  } catch {
    return { payload: null, reason: 'invalid' };
  }
};

type ImportedEnvironmentVariable = {
  key: string;
  value: string;
  target: string | null;
};

type ImportedEnvironmentVariableSummary = {
  totalEntries: number;
  importedCount: number;
  unresolvedKeys: string[];
  variables: ImportedEnvironmentVariable[];
};

type VercelEnvironmentEntry = {
  id: string | null;
  key: string;
  value: string | null;
  target: string | null;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

const parseRepoIdentity = (project: Record<string, unknown>): {
  provider: string | null;
  repoFullName: string | null;
  repoOwner: string | null;
  repoName: string | null;
  repoUrl: string | null;
  branch: string;
} => {
  const link = asRecord(project.link);
  const gitRepository = asRecord(project.gitRepository);

  const providerRaw =
    asNonEmptyString(link?.type)
    ?? asNonEmptyString(gitRepository?.type)
    ?? asNonEmptyString(project.gitProvider)
    ?? null;
  const provider = providerRaw ? providerRaw.toLowerCase() : null;

  const repoFullNameRaw =
    asNonEmptyString(link?.repo)
    ?? asNonEmptyString(gitRepository?.repo)
    ?? null;
  const repoFullName =
    repoFullNameRaw && repoFullNameRaw.includes('/') ? repoFullNameRaw : null;
  const [repoOwner, repoName] = repoFullName ? repoFullName.split('/', 2) : [null, null];

  let repoUrl: string | null = null;
  if (provider === 'github' && repoFullName) {
    repoUrl = `https://github.com/${repoFullName}.git`;
  } else if (asNonEmptyString(project.repoUrl)) {
    repoUrl = asNonEmptyString(project.repoUrl) ?? null;
  }

  const branch =
    asNonEmptyString(link?.productionBranch)
    ?? asNonEmptyString(gitRepository?.productionBranch)
    ?? asNonEmptyString(project.productionBranch)
    ?? 'main';

  return {
    provider,
    repoFullName,
    repoOwner,
    repoName,
    repoUrl,
    branch,
  };
};

const extractVercelErrorMessage = (payload: unknown): string | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const nestedError = asRecord(record.error);
  const nestedMessage = asNonEmptyString(nestedError?.message);
  if (nestedMessage) {
    return nestedMessage;
  }

  const topLevelMessage = asNonEmptyString(record.message);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  const oauthDescription = asNonEmptyString(record.error_description);
  if (oauthDescription) {
    return oauthDescription;
  }

  const oauthError = asNonEmptyString(record.error);
  if (oauthError) {
    return oauthError;
  }

  return null;
};

const requestVercelOAuthToken = async (
  body: URLSearchParams,
  action: 'code exchange' | 'token refresh',
): Promise<VercelOAuthTokenResponse> => {
  const response = await fetch(VERCEL_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = extractVercelErrorMessage(payload) ?? `HTTP ${response.status}`;
    throw new Error(`Vercel OAuth ${action} failed (${message}).`);
  }

  const data = asRecord(payload);
  if (!data) {
    throw new Error(`Vercel OAuth ${action} returned an invalid payload.`);
  }

  return {
    access_token: asNonEmptyString(data.access_token),
    refresh_token: asNonEmptyString(data.refresh_token),
    scope: asNonEmptyString(data.scope),
    token_type: asNonEmptyString(data.token_type),
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : undefined,
    id_token: asNonEmptyString(data.id_token),
    error: asNonEmptyString(data.error),
    error_description: asNonEmptyString(data.error_description),
  };
};

const exchangeCodeForToken = async (input: {
  code: string;
  codeVerifier: string;
}): Promise<VercelOAuthTokenResponse> => {
  if (!env.VERCEL_CLIENT_ID?.trim()) {
    throw new Error('Vercel OAuth is not configured on the server.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.VERCEL_CLIENT_ID.trim(),
    redirect_uri: getVercelOAuthRedirectUri(),
    code: input.code,
    code_verifier: input.codeVerifier,
  });

  if (env.VERCEL_CLIENT_SECRET?.trim()) {
    body.set('client_secret', env.VERCEL_CLIENT_SECRET.trim());
  }

  return requestVercelOAuthToken(body, 'code exchange');
};

const refreshAccessToken = async (refreshToken: string): Promise<VercelOAuthTokenResponse> => {
  if (!env.VERCEL_CLIENT_ID?.trim()) {
    throw new Error('Vercel OAuth is not configured on the server.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.VERCEL_CLIENT_ID.trim(),
  });

  if (env.VERCEL_CLIENT_SECRET?.trim()) {
    body.set('client_secret', env.VERCEL_CLIENT_SECRET.trim());
  }

  return requestVercelOAuthToken(body, 'token refresh');
};

const parseVercelUserInfo = (payload: unknown): VercelUserInfoSummary | null => {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const nestedUser = asRecord(root.user);
  const source = nestedUser ?? root;

  const id =
    asIdentifierString(source.sub)
    ?? asIdentifierString(source.id)
    ?? asIdentifierString(source.uid)
    ?? null;
  if (!id) {
    return null;
  }

  const username =
    asNonEmptyString(source.preferred_username)
    ?? asNonEmptyString(source.username)
    ?? asNonEmptyString(source.login)
    ?? asNonEmptyString(source.name)
    ?? null;

  const email = asNonEmptyString(source.email) ?? null;
  const avatarUrl =
    asNonEmptyString(source.picture)
    ?? asNonEmptyString(source.avatar)
    ?? asNonEmptyString(source.avatar_url)
    ?? null;

  return {
    id,
    username,
    email,
    avatarUrl,
  };
};

const fetchVercelUserInfo = async (accessToken: string): Promise<VercelUserInfoSummary> => {
  const userInfoResponse = await fetch(VERCEL_OAUTH_USERINFO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (userInfoResponse.ok) {
    const payload = (await userInfoResponse.json().catch(() => null)) as unknown;
    const parsed = parseVercelUserInfo(payload);
    if (parsed) {
      return parsed;
    }
  }

  const fallbackResponse = await fetch(`${VERCEL_API_BASE}/v2/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!fallbackResponse.ok) {
    throw new Error(`Unable to fetch Vercel user profile (HTTP ${fallbackResponse.status}).`);
  }

  const fallbackPayload = (await fallbackResponse.json().catch(() => null)) as unknown;
  const parsedFallback = parseVercelUserInfo(fallbackPayload);
  if (!parsedFallback) {
    throw new Error('Vercel user profile response is invalid.');
  }

  return parsedFallback;
};

const toAccessTokenExpiryDate = (expiresIn?: number): Date | null => {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }

  return new Date(Date.now() + (expiresIn * 1000));
};

const readTarget = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry.trim().toLowerCase();
    }
  }

  return null;
};

const toVercelEnvEntries = (payload: unknown): VercelEnvironmentEntry[] => {
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload)?.envs)
      ? (asRecord(payload)?.envs as unknown[])
      : [];

  return values
    .map((entry): VercelEnvironmentEntry | null => {
      const item = asRecord(entry);
      if (!item) {
        return null;
      }

      const key = asNonEmptyString(item.key)?.toUpperCase();
      if (!key) {
        return null;
      }

      return {
        id: asNonEmptyString(item.id) ?? null,
        key,
        value: asNonEmptyString(item.value) ?? null,
        target: readTarget(item.target),
      };
    })
    .filter((entry): entry is VercelEnvironmentEntry => Boolean(entry));
};

const resolveVercelEnvValueById = async (input: {
  token: string;
  projectIdOrName: string;
  envId: string;
  teamId?: string;
}): Promise<string | null> => {
  const query = new URLSearchParams();
  if (input.teamId) {
    query.set('teamId', input.teamId);
  }

  const endpoint = `${VERCEL_API_BASE}/v1/projects/${encodeURIComponent(input.projectIdOrName)}/env/${encodeURIComponent(input.envId)}${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const entry = asRecord(payload);
  if (!entry) {
    return null;
  }

  return asNonEmptyString(entry.value) ?? null;
};

const importVercelEnvironmentVariables = async (input: {
  token: string;
  projectIdOrName: string;
  teamId?: string;
}): Promise<ImportedEnvironmentVariableSummary> => {
  const query = new URLSearchParams({
    decrypt: 'true',
    source: 'apployd:migrate',
  });
  if (input.teamId) {
    query.set('teamId', input.teamId);
  }

  const endpoint = `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(input.projectIdOrName)}/env?${query.toString()}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = extractVercelErrorMessage(payload) ?? `status ${response.status}`;
    throw new Error(`Unable to import Vercel environment variables (${message}).`);
  }

  const entries = toVercelEnvEntries(payload);
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      importedCount: 0,
      unresolvedKeys: [],
      variables: [],
    };
  }

  const enriched = await Promise.all(
    entries.map(async (entry) => {
      if (entry.value || !entry.id) {
        return entry;
      }

      const resolved = await resolveVercelEnvValueById({
        token: input.token,
        projectIdOrName: input.projectIdOrName,
        envId: entry.id,
        ...(input.teamId ? { teamId: input.teamId } : {}),
      });

      return {
        ...entry,
        value: resolved,
      };
    }),
  );

  const bestByKey = new Map<string, VercelEnvironmentEntry>();
  for (const entry of enriched) {
    const current = bestByKey.get(entry.key);
    if (!current) {
      bestByKey.set(entry.key, entry);
      continue;
    }

    const score = (candidate: VercelEnvironmentEntry): number => {
      const valueScore = candidate.value ? 100 : 0;
      const targetScore = VERCEL_ENV_TARGET_PRIORITY[candidate.target ?? ''] ?? 0;
      return valueScore + targetScore;
    };

    if (score(entry) > score(current)) {
      bestByKey.set(entry.key, entry);
    }
  }

  const variables = [...bestByKey.values()]
    .filter((entry): entry is VercelEnvironmentEntry & { value: string } => Boolean(entry.value))
    .map((entry) => ({
      key: entry.key,
      value: entry.value,
      target: entry.target,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const unresolvedKeys = [...bestByKey.values()]
    .filter((entry) => !entry.value)
    .map((entry) => entry.key)
    .sort((a, b) => a.localeCompare(b));

  return {
    totalEntries: entries.length,
    importedCount: variables.length,
    unresolvedKeys,
    variables,
  };
};

const projectResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  repoUrl: z.string().nullable(),
  repoOwner: z.string().nullable(),
  repoName: z.string().nullable(),
  repoFullName: z.string().nullable(),
  branch: z.string(),
  rootDirectory: z.string().nullable(),
  buildCommand: z.string().nullable(),
  startCommand: z.string().nullable(),
  installCommand: z.string().nullable(),
  outputDirectory: z.string().nullable(),
  framework: z.string().nullable(),
  autoDeployEnabled: z.boolean(),
  targetPort: z.number().int().min(1).max(65535),
  runtime: z.literal('node'),
  serviceType: z.enum(['web_service', 'static_site']),
});

const toIsoTimestamp = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      return toIsoTimestamp(parsedNumber);
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
};

const isAccessTokenExpiringSoon = (expiresAt: Date | null): boolean => {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() <= Date.now() + (60 * 1000);
};

const decryptVercelAccessToken = (connection: {
  encryptedAccessToken: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
}): string =>
  decryptSecret({
    encryptedValue: connection.encryptedAccessToken,
    iv: connection.accessTokenIv,
    authTag: connection.accessTokenAuthTag,
  });

const decryptVercelRefreshToken = (connection: {
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  refreshTokenAuthTag: string | null;
}): string | null => {
  if (
    !connection.encryptedRefreshToken
    || !connection.refreshTokenIv
    || !connection.refreshTokenAuthTag
  ) {
    return null;
  }

  return decryptSecret({
    encryptedValue: connection.encryptedRefreshToken,
    iv: connection.refreshTokenIv,
    authTag: connection.refreshTokenAuthTag,
  });
};

const refreshStoredConnectionToken = async (connection: {
  id: string;
  tokenScope: string | null;
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  refreshTokenAuthTag: string | null;
}): Promise<string> => {
  const refreshToken = decryptVercelRefreshToken(connection);
  if (!refreshToken) {
    throw new Error('Vercel access token expired. Reconnect Vercel and try again.');
  }

  if (!isVercelOAuthConfigured()) {
    throw new Error('Vercel OAuth is not configured on the server.');
  }

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.access_token) {
    throw new Error('Unable to refresh Vercel access token. Reconnect Vercel and try again.');
  }

  const encryptedAccess = encryptSecret(refreshed.access_token);
  const nextRefreshToken = refreshed.refresh_token ?? refreshToken;
  const encryptedRefresh = encryptSecret(nextRefreshToken);

  await prisma.vercelConnection.update({
    where: { id: connection.id },
    data: {
      tokenScope: refreshed.scope ?? connection.tokenScope,
      encryptedAccessToken: encryptedAccess.encryptedValue,
      accessTokenIv: encryptedAccess.iv,
      accessTokenAuthTag: encryptedAccess.authTag,
      encryptedRefreshToken: encryptedRefresh.encryptedValue,
      refreshTokenIv: encryptedRefresh.iv,
      refreshTokenAuthTag: encryptedRefresh.authTag,
      accessTokenExpiresAt: toAccessTokenExpiryDate(refreshed.expires_in),
    },
  });

  return refreshed.access_token;
};

const resolveVercelApiToken = async (input: {
  userId: string;
  accessToken?: string;
}): Promise<string> => {
  const providedAccessToken = input.accessToken?.trim();
  if (providedAccessToken) {
    return providedAccessToken;
  }

  const connection = await prisma.vercelConnection.findUnique({
    where: { userId: input.userId },
    select: {
      id: true,
      tokenScope: true,
      encryptedAccessToken: true,
      accessTokenIv: true,
      accessTokenAuthTag: true,
      encryptedRefreshToken: true,
      refreshTokenIv: true,
      refreshTokenAuthTag: true,
      accessTokenExpiresAt: true,
    },
  });

  if (!connection) {
    throw new Error('Connect your Vercel account first to import projects.');
  }

  if (isAccessTokenExpiringSoon(connection.accessTokenExpiresAt)) {
    return refreshStoredConnectionToken(connection);
  }

  try {
    return decryptVercelAccessToken(connection);
  } catch {
    throw new Error('Stored Vercel credentials are invalid. Reconnect your Vercel account.');
  }
};

const upsertVercelConnectionForUser = async (input: {
  userId: string;
  vercelUserId: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  tokenScope: string | null;
  encryptedAccessToken: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  refreshTokenAuthTag: string | null;
  accessTokenExpiresAt: Date | null;
}): Promise<void> => {
  try {
    await prisma.$transaction(async (tx) => {
      const existingByVercelUser = await tx.vercelConnection.findUnique({
        where: { vercelUserId: input.vercelUserId },
        select: {
          id: true,
          userId: true,
        },
      });

      if (existingByVercelUser && existingByVercelUser.userId !== input.userId) {
        await tx.vercelConnection.deleteMany({
          where: { userId: input.userId },
        });

        await tx.vercelConnection.update({
          where: { id: existingByVercelUser.id },
          data: {
            userId: input.userId,
            username: input.username,
            email: input.email,
            avatarUrl: input.avatarUrl,
            tokenScope: input.tokenScope,
            encryptedAccessToken: input.encryptedAccessToken,
            accessTokenIv: input.accessTokenIv,
            accessTokenAuthTag: input.accessTokenAuthTag,
            encryptedRefreshToken: input.encryptedRefreshToken,
            refreshTokenIv: input.refreshTokenIv,
            refreshTokenAuthTag: input.refreshTokenAuthTag,
            accessTokenExpiresAt: input.accessTokenExpiresAt,
          },
        });
        return;
      }

      await tx.vercelConnection.upsert({
        where: { userId: input.userId },
        update: {
          vercelUserId: input.vercelUserId,
          username: input.username,
          email: input.email,
          avatarUrl: input.avatarUrl,
          tokenScope: input.tokenScope,
          encryptedAccessToken: input.encryptedAccessToken,
          accessTokenIv: input.accessTokenIv,
          accessTokenAuthTag: input.accessTokenAuthTag,
          encryptedRefreshToken: input.encryptedRefreshToken,
          refreshTokenIv: input.refreshTokenIv,
          refreshTokenAuthTag: input.refreshTokenAuthTag,
          accessTokenExpiresAt: input.accessTokenExpiresAt,
        },
        create: {
          userId: input.userId,
          vercelUserId: input.vercelUserId,
          username: input.username,
          email: input.email,
          avatarUrl: input.avatarUrl,
          tokenScope: input.tokenScope,
          encryptedAccessToken: input.encryptedAccessToken,
          accessTokenIv: input.accessTokenIv,
          accessTokenAuthTag: input.accessTokenAuthTag,
          encryptedRefreshToken: input.encryptedRefreshToken,
          refreshTokenIv: input.refreshTokenIv,
          refreshTokenAuthTag: input.refreshTokenAuthTag,
          accessTokenExpiresAt: input.accessTokenExpiresAt,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      throw new Error(
        'This Vercel account is already linked to another Apployd account. Disconnect it there first.',
      );
    }
    throw error;
  }
};

export const vercelIntegrationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/integrations/vercel/status', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    const connection = await prisma.vercelConnection.findUnique({
      where: { userId: user.userId },
      select: {
        username: true,
        email: true,
        avatarUrl: true,
        tokenScope: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      configured: isVercelOAuthConfigured(),
      connected: Boolean(connection),
      connection,
      oauthRedirectUri: getVercelOAuthRedirectUri(),
      legacyAccessTokenConfigured: Boolean(env.VERCEL_ACCESS_TOKEN?.trim()),
    };
  });

  app.get('/integrations/vercel/connect-url', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    if (!isVercelOAuthConfigured()) {
      return reply.serviceUnavailable('Vercel OAuth is not configured on the server.');
    }

    const clientId = env.VERCEL_CLIENT_ID?.trim();
    if (!clientId) {
      return reply.serviceUnavailable('Vercel OAuth client ID is missing on the server.');
    }

    const query = connectQuerySchema.parse(request.query);
    const state = randomBytes(24).toString('hex');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = buildCodeChallenge(codeVerifier);
    const redirectTo = safeRedirectPath(query.redirectTo, '/projects/new');

    const oauthState: OAuthStatePayload = {
      mode: 'connect',
      userId: user.userId,
      redirectTo,
      codeVerifier,
    };

    await redis.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify(oauthState),
      'EX',
      60 * 10,
    );

    const authorizeUrl = new URL(VERCEL_OAUTH_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', getVercelOAuthRedirectUri());
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid email profile offline_access');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    return {
      url: authorizeUrl.toString(),
    };
  });

  app.get('/integrations/vercel/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const consumedState = await consumeOAuthState(query.state);
    const statePayload = consumedState.payload;

    if (query.error) {
      return reply.redirect(
        dashboardRedirect({
          redirectTo: statePayload?.redirectTo ?? '/projects/new',
          status: 'error',
          message: query.error_description ?? query.error,
        }),
      );
    }

    if (!query.code || !query.state) {
      return reply.redirect(
        dashboardRedirect({
          redirectTo: statePayload?.redirectTo ?? '/projects/new',
          status: 'error',
          message: 'Missing OAuth code or state.',
        }),
      );
    }

    if (!statePayload) {
      const message =
        consumedState.reason === 'invalid'
          ? 'OAuth state is invalid.'
          : 'OAuth state has expired. Please try again.';
      return reply.redirect(
        dashboardRedirect({
          redirectTo: '/projects/new',
          status: 'error',
          message: `${message} Please restart Vercel connect.`,
        }),
      );
    }

    try {
      const tokenResponse = await exchangeCodeForToken({
        code: query.code,
        codeVerifier: statePayload.codeVerifier,
      });

      if (!tokenResponse.access_token) {
        const message =
          tokenResponse.error_description ?? tokenResponse.error ?? 'Vercel did not return an access token.';
        throw new Error(message);
      }

      const vercelUser = await fetchVercelUserInfo(tokenResponse.access_token);
      const encryptedAccess = encryptSecret(tokenResponse.access_token);
      const encryptedRefresh = tokenResponse.refresh_token
        ? encryptSecret(tokenResponse.refresh_token)
        : null;

      await upsertVercelConnectionForUser({
        userId: statePayload.userId,
        vercelUserId: vercelUser.id,
        username: vercelUser.username,
        email: vercelUser.email,
        avatarUrl: vercelUser.avatarUrl,
        tokenScope: tokenResponse.scope ?? null,
        encryptedAccessToken: encryptedAccess.encryptedValue,
        accessTokenIv: encryptedAccess.iv,
        accessTokenAuthTag: encryptedAccess.authTag,
        encryptedRefreshToken: encryptedRefresh?.encryptedValue ?? null,
        refreshTokenIv: encryptedRefresh?.iv ?? null,
        refreshTokenAuthTag: encryptedRefresh?.authTag ?? null,
        accessTokenExpiresAt: toAccessTokenExpiryDate(tokenResponse.expires_in),
      });

      return reply.redirect(
        dashboardRedirect({
          redirectTo: statePayload.redirectTo,
          status: 'connected',
        }),
      );
    } catch (error) {
      return reply.redirect(
        dashboardRedirect({
          redirectTo: statePayload.redirectTo,
          status: 'error',
          message: (error as Error).message,
        }),
      );
    }
  });

  app.delete('/integrations/vercel/connection', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    await prisma.vercelConnection.deleteMany({
      where: { userId: user.userId },
    });

    return { success: true };
  });

  app.post('/integrations/vercel/projects', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = listVercelProjectsSchema.parse(request.body);

    let token: string;
    try {
      token = await resolveVercelApiToken({
        userId: user.userId,
        ...(body.accessToken ? { accessToken: body.accessToken } : {}),
      });
    } catch (error) {
      return reply.badRequest((error as Error).message);
    }

    const query = new URLSearchParams({
      limit: String(body.limit),
    });
    if (body.teamId) {
      query.set('teamId', body.teamId);
    }

    const response = await fetch(`${VERCEL_API_BASE}/v9/projects?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = extractVercelErrorMessage(payload) ?? `Vercel API request failed with status ${response.status}.`;
      return reply.code(response.status >= 500 ? 502 : 400).send({ message });
    }

    const parsed = asRecord(payload);
    if (!parsed) {
      return reply.badGateway('Vercel returned an invalid response payload.');
    }

    const rawProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
    const projects = rawProjects
      .map((entry) => {
        const project = asRecord(entry);
        if (!project) {
          return null;
        }

        const id = asNonEmptyString(project.id);
        const name = asNonEmptyString(project.name);
        if (!id || !name) {
          return null;
        }

        const repoIdentity = parseRepoIdentity(project);
        return {
          id,
          name,
          slug: slugify(name),
          framework: asNonEmptyString(project.framework) ?? null,
          repoFullName: repoIdentity.repoFullName,
          repoUrl: repoIdentity.repoUrl,
          branch: repoIdentity.branch,
          updatedAt: toIsoTimestamp(project.updatedAt),
        };
      })
      .filter((entry): entry is {
        id: string;
        name: string;
        slug: string;
        framework: string | null;
        repoFullName: string | null;
        repoUrl: string | null;
        branch: string;
        updatedAt: string | null;
      } => Boolean(entry));

    projects.sort((a, b) => {
      if (a.updatedAt && b.updatedAt) {
        return a.updatedAt > b.updatedAt ? -1 : 1;
      }
      if (a.updatedAt) {
        return -1;
      }
      if (b.updatedAt) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      source: 'vercel',
      projects,
    };
  });

  app.post('/integrations/vercel/import-project', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = importVercelProjectSchema.parse(request.body);

    let token: string;
    try {
      token = await resolveVercelApiToken({
        userId: user.userId,
        ...(body.accessToken ? { accessToken: body.accessToken } : {}),
      });
    } catch (error) {
      return reply.badRequest((error as Error).message);
    }

    const query = new URLSearchParams();
    if (body.teamId) {
      query.set('teamId', body.teamId);
    }
    const queryString = query.toString();
    const vercelUrl = `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(body.projectIdOrName)}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(vercelUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const vercelMessage = extractVercelErrorMessage(payload);
      const message = vercelMessage
        ? `Vercel API error: ${vercelMessage}`
        : `Vercel API request failed with status ${response.status}.`;
      return reply.code(response.status >= 500 ? 502 : 400).send({ message });
    }

    const project = asRecord(payload);
    if (!project) {
      return reply.badGateway('Vercel returned an invalid response payload.');
    }

    const importedName = asNonEmptyString(project.name);
    if (!importedName) {
      return reply.badGateway('Vercel project response did not include a project name.');
    }

    const repoIdentity = parseRepoIdentity(project);
    const rootDirectory = asNonEmptyString(project.rootDirectory) ?? null;
    const buildCommand = asNonEmptyString(project.buildCommand) ?? null;
    const startCommand = asNonEmptyString(project.devCommand) ?? null;
    const installCommand = asNonEmptyString(project.installCommand) ?? null;
    const outputDirectory = asNonEmptyString(project.outputDirectory) ?? null;
    const framework = asNonEmptyString(project.framework) ?? null;
    const nodeVersion = asNonEmptyString(project.nodeVersion) ?? null;
    const targetPort = asPort(project.port) ?? 3000;

    const warnings: string[] = [];
    if (repoIdentity.provider && repoIdentity.provider !== 'github') {
      warnings.push(
        `Linked git provider is ${repoIdentity.provider}; Apployd auto-webhook setup currently supports GitHub only.`,
      );
    }
    if (!repoIdentity.repoUrl) {
      warnings.push('Repository URL could not be resolved from Vercel project metadata.');
    }
    if (!buildCommand) {
      warnings.push('Build command was not set on Vercel; review and set one before deploying.');
    }
    if (!startCommand) {
      warnings.push('Start command was not detected from Vercel config; set it before creating deployment.');
    }
    if (nodeVersion) {
      warnings.push(`Vercel nodeVersion=${nodeVersion} detected. Verify runtime compatibility in Apployd.`);
    }

    const serviceType = outputDirectory ? 'static_site' : 'web_service';
    let environmentVariables: ImportedEnvironmentVariableSummary = {
      totalEntries: 0,
      importedCount: 0,
      unresolvedKeys: [],
      variables: [],
    };

    try {
      environmentVariables = await importVercelEnvironmentVariables({
        token,
        projectIdOrName: body.projectIdOrName,
        ...(body.teamId ? { teamId: body.teamId } : {}),
      });
    } catch (error) {
      warnings.push((error as Error).message);
    }

    if (environmentVariables.unresolvedKeys.length > 0) {
      warnings.push(
        `Could not decrypt some environment variables: ${environmentVariables.unresolvedKeys.join(', ')}.`,
      );
    }

    const projectData = projectResponseSchema.parse({
      id: asNonEmptyString(project.id) ?? body.projectIdOrName,
      name: importedName,
      slug: slugify(importedName),
      repoUrl: repoIdentity.repoUrl,
      repoOwner: repoIdentity.repoOwner,
      repoName: repoIdentity.repoName,
      repoFullName: repoIdentity.repoFullName,
      branch: repoIdentity.branch,
      rootDirectory,
      buildCommand,
      startCommand,
      installCommand,
      outputDirectory,
      framework,
      autoDeployEnabled: true,
      targetPort,
      runtime: 'node',
      serviceType,
    });

    return {
      source: 'vercel',
      project: projectData,
      environmentVariables,
      warnings,
    };
  });
};
