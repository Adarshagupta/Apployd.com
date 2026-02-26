import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';

const importVercelProjectSchema = z.object({
  projectIdOrName: z.string().trim().min(1).max(160),
  teamId: z.string().trim().min(1).max(120).optional(),
  accessToken: z.string().trim().min(1).max(300).optional(),
});

const VERCEL_API_BASE = 'https://api.vercel.com';
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

  return null;
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

export const vercelIntegrationRoutes: FastifyPluginAsync = async (app) => {
  app.post('/integrations/vercel/import-project', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = importVercelProjectSchema.parse(request.body);
    const token = body.accessToken ?? env.VERCEL_ACCESS_TOKEN;

    if (!token) {
      return reply.badRequest('Provide a Vercel access token, or set VERCEL_ACCESS_TOKEN on the server.');
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
