import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/secrets.js';
import { AccessService } from '../../services/access-service.js';
import { AuditLogService } from '../../services/audit-log-service.js';

const PROJECT_ID_PARAMS_SCHEMA = z.object({
  projectId: z.string().cuid(),
});

const SECRET_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const PG_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const provisionNeonDatabaseBodySchema = z.object({
  projectName: z.string().trim().min(2).max(120).optional(),
  regionId: z.string().trim().min(2).max(64).optional(),
  branchName: z.string().trim().min(1).max(63).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  databaseName: z.string().trim().min(1).max(63).regex(PG_IDENTIFIER_PATTERN).optional(),
  roleName: z.string().trim().min(1).max(63).regex(PG_IDENTIFIER_PATTERN).optional(),
  secretKey: z.string().trim().min(1).max(120).regex(SECRET_KEY_PATTERN).optional(),
});

const listOrganizationDatabasesQuerySchema = z.object({
  organizationId: z.string().cuid(),
});

const provisionOrganizationNeonDatabaseBodySchema = provisionNeonDatabaseBodySchema.extend({
  organizationId: z.string().cuid(),
});

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const toSnakeIdentifier = (value: string, fallback: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
  if (!normalized) {
    return fallback;
  }
  if (!/^[a-z_]/.test(normalized)) {
    return `${fallback.slice(0, Math.max(0, 62 - normalized.length))}_${normalized}`.slice(0, 63);
  }
  return normalized;
};

const toBranchName = (value: string, fallback: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return normalized || fallback;
};

const toProjectDisplayName = (value: string, fallback: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, 120);
};

const ROLE_PROPAGATION_RETRY_DELAYS_MS = [250, 500, 1000, 1500] as const;

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const extractNeonError = (payload: unknown, status: number): string => {
  const root = asRecord(payload);
  const directMessage =
    asString(root?.message)
    ?? asString(root?.error)
    ?? asString(root?.error_description)
    ?? asString(asRecord(root?.error)?.message);
  if (directMessage) {
    return directMessage;
  }

  const issues = asArray(root?.errors)
    .map((entry) => asString(asRecord(entry)?.message))
    .filter((entry): entry is string => Boolean(entry));
  if (issues.length > 0) {
    return issues.join('; ');
  }

  return `Neon API request failed with status ${status}.`;
};

const neonRequest = async <T>(input: {
  path: string;
  method?: 'GET' | 'POST';
  apiKey: string;
  body?: Record<string, unknown>;
}): Promise<T> => {
  const endpoint = `${trimTrailingSlash(env.NEON_API_BASE_URL)}${input.path}`;
  const response = await fetch(endpoint, {
    method: input.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: 'application/json',
      ...(input.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(extractNeonError(payload, response.status));
  }

  return payload as T;
};

const resolveBranchId = async (input: {
  apiKey: string;
  neonProjectId: string;
  branchName: string;
}): Promise<string> => {
  const payload = await neonRequest<unknown>({
    path: `/projects/${encodeURIComponent(input.neonProjectId)}/branches`,
    apiKey: input.apiKey,
  });
  const root = asRecord(payload);
  const branches = asArray(root?.branches);
  if (branches.length === 0) {
    throw new Error('Neon project has no branches.');
  }

  const selected =
    branches.find((entry) => asString(asRecord(entry)?.name) === input.branchName)
    ?? branches.find((entry) => asRecord(entry)?.default === true)
    ?? branches[0];
  const selectedRecord = asRecord(selected);
  const branchId = asString(selectedRecord?.id);
  if (!branchId) {
    throw new Error('Unable to resolve Neon branch ID.');
  }
  return branchId;
};

const parseConnectionUri = (payload: unknown): string | null => {
  const root = asRecord(payload);
  return (
    asString(root?.uri)
    ?? asString(root?.connection_uri)
    ?? asString(asRecord(root?.connection_uris)?.primary)
    ?? asString(asRecord(root?.connection_uris)?.pooler)
    ?? null
  );
};

const resolveConnectionUriFromNeon = async (input: {
  apiKey: string;
  neonProjectId: string;
  neonBranchId: string;
  databaseName: string;
  roleName: string;
}): Promise<string | null> => {
  try {
    const searchParams = new URLSearchParams({
      branch_id: input.neonBranchId,
      database_name: input.databaseName,
      role_name: input.roleName,
    });
    const payload = await neonRequest<unknown>({
      path: `/projects/${encodeURIComponent(input.neonProjectId)}/connection_uri?${searchParams.toString()}`,
      apiKey: input.apiKey,
    });
    return parseConnectionUri(payload);
  } catch {
    return null;
  }
};

const resolveEndpointInfo = async (input: {
  apiKey: string;
  neonProjectId: string;
  neonBranchId: string;
}): Promise<{ endpointId: string | null; host: string }> => {
  const payload = await neonRequest<unknown>({
    path: `/projects/${encodeURIComponent(input.neonProjectId)}/endpoints`,
    apiKey: input.apiKey,
  });
  const root = asRecord(payload);
  const endpoints = asArray(root?.endpoints);

  const pickEndpoint = (value: unknown[]): Record<string, unknown> | null => {
    const branchMatch = value.find((entry) => {
      const endpoint = asRecord(entry);
      return asString(endpoint?.branch_id) === input.neonBranchId && asString(endpoint?.type) === 'read_write';
    });
    if (branchMatch) {
      return asRecord(branchMatch);
    }

    const anyBranch = value.find((entry) => asString(asRecord(entry)?.branch_id) === input.neonBranchId);
    if (anyBranch) {
      return asRecord(anyBranch);
    }

    if (value[0]) {
      return asRecord(value[0]);
    }

    return null;
  };

  const resolved = pickEndpoint(endpoints);
  const host = asString(resolved?.host);
  const endpointId = asString(resolved?.id);
  if (host) {
    return { endpointId, host };
  }

  const createdPayload = await neonRequest<unknown>({
    path: `/projects/${encodeURIComponent(input.neonProjectId)}/endpoints`,
    method: 'POST',
    apiKey: input.apiKey,
    body: {
      endpoint: {
        branch_id: input.neonBranchId,
        type: 'read_write',
      },
    },
  });
  const createdRoot = asRecord(createdPayload);
  const createdEndpoint = asRecord(createdRoot?.endpoint) ?? createdRoot;
  const createdHost = asString(createdEndpoint?.host);
  const createdId = asString(createdEndpoint?.id);
  if (!createdHost) {
    throw new Error('Unable to resolve Neon endpoint host.');
  }
  return {
    endpointId: createdId,
    host: createdHost,
  };
};

const ensureConnectionUri = (input: {
  connectionUri: string | null;
  roleName: string;
  rolePassword: string;
  databaseName: string;
  endpointHost: string;
}): string => {
  const defaultUri = (() => {
    const url = new URL(`postgresql://${input.endpointHost}/${input.databaseName}`);
    url.username = input.roleName;
    url.password = input.rolePassword;
    url.searchParams.set('sslmode', 'require');
    return url.toString();
  })();

  if (!input.connectionUri) {
    return defaultUri;
  }

  try {
    const parsed = new URL(input.connectionUri);
    if (!parsed.username) {
      parsed.username = input.roleName;
    }
    if (!parsed.password) {
      parsed.password = input.rolePassword;
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = `/${input.databaseName}`;
    }
    if (!parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
    }
    return parsed.toString();
  } catch {
    return defaultUri;
  }
};

const neonErrorMessage = (error: unknown): string =>
  (error as Error)?.message?.toLowerCase?.() ?? '';

const isNeonAlreadyExistsError = (error: unknown): boolean => {
  const message = neonErrorMessage(error);
  return (
    message.includes('already exists')
    || message.includes('duplicate key')
    || message.includes('conflict')
  );
};

const isNeonRoleMissingError = (error: unknown): boolean =>
  neonErrorMessage(error).includes('role not found');

const ensureRoleOnBranch = async (input: {
  apiKey: string;
  neonProjectId: string;
  neonBranchId: string;
  roleName: string;
}): Promise<void> => {
  try {
    await neonRequest<unknown>({
      path: `/projects/${encodeURIComponent(input.neonProjectId)}/branches/${encodeURIComponent(input.neonBranchId)}/roles`,
      method: 'POST',
      apiKey: input.apiKey,
      body: {
        role: {
          name: input.roleName,
        },
      },
    });
  } catch (error) {
    if (isNeonAlreadyExistsError(error)) {
      return;
    }
    throw error;
  }
};

const ensureDatabaseOnBranch = async (input: {
  apiKey: string;
  neonProjectId: string;
  neonBranchId: string;
  databaseName: string;
  roleName: string;
}): Promise<void> => {
  for (let attempt = 0; attempt <= ROLE_PROPAGATION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await neonRequest<unknown>({
        path: `/projects/${encodeURIComponent(input.neonProjectId)}/branches/${encodeURIComponent(input.neonBranchId)}/databases`,
        method: 'POST',
        apiKey: input.apiKey,
        body: {
          database: {
            name: input.databaseName,
            owner_name: input.roleName,
          },
        },
      });
      return;
    } catch (error) {
      if (isNeonAlreadyExistsError(error)) {
        return;
      }
      if (!isNeonRoleMissingError(error) || attempt >= ROLE_PROPAGATION_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await ensureRoleOnBranch({
        apiKey: input.apiKey,
        neonProjectId: input.neonProjectId,
        neonBranchId: input.neonBranchId,
        roleName: input.roleName,
      });
      const delayMs =
        ROLE_PROPAGATION_RETRY_DELAYS_MS[attempt]
        ?? ROLE_PROPAGATION_RETRY_DELAYS_MS[ROLE_PROPAGATION_RETRY_DELAYS_MS.length - 1]
        ?? 1500;
      await sleep(delayMs);
    }
  }
};

const resetRolePassword = async (input: {
  apiKey: string;
  neonProjectId: string;
  neonBranchId: string;
  roleName: string;
}): Promise<string> => {
  for (let attempt = 0; attempt <= ROLE_PROPAGATION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const payload = await neonRequest<unknown>({
        path: `/projects/${encodeURIComponent(input.neonProjectId)}/branches/${encodeURIComponent(input.neonBranchId)}/roles/${encodeURIComponent(input.roleName)}/reset_password`,
        method: 'POST',
        apiKey: input.apiKey,
        body: {},
      });

      const root = asRecord(payload);
      const password =
        asString(root?.password)
        ?? asString(asRecord(root?.role)?.password)
        ?? null;
      if (!password) {
        throw new Error('Neon did not return a database password.');
      }
      return password;
    } catch (error) {
      if (!isNeonRoleMissingError(error) || attempt >= ROLE_PROPAGATION_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await ensureRoleOnBranch({
        apiKey: input.apiKey,
        neonProjectId: input.neonProjectId,
        neonBranchId: input.neonBranchId,
        roleName: input.roleName,
      });
      const delayMs =
        ROLE_PROPAGATION_RETRY_DELAYS_MS[attempt]
        ?? ROLE_PROPAGATION_RETRY_DELAYS_MS[ROLE_PROPAGATION_RETRY_DELAYS_MS.length - 1]
        ?? 1500;
      await sleep(delayMs);
    }
  }
  throw new Error(`Role "${input.roleName}" not found in Neon branch after retries.`);
};

const createNeonProject = async (input: {
  apiKey: string;
  projectName: string;
  regionId: string;
  branchName: string;
  databaseName: string;
  roleName: string;
}): Promise<string> => {
  const primaryBody = {
    project: {
      name: input.projectName,
      region_id: input.regionId,
      settings: {
        store_passwords: true,
      },
    },
    branch: {
      name: input.branchName,
    },
    database: {
      name: input.databaseName,
    },
    role: {
      name: input.roleName,
    },
  } as const;

  const fallbackBody = {
    project: {
      name: input.projectName,
      region_id: input.regionId,
      settings: {
        store_passwords: true,
      },
      branch: {
        name: input.branchName,
        database_name: input.databaseName,
        role_name: input.roleName,
      },
    },
  } as const;

  let payload: unknown;
  try {
    payload = await neonRequest<unknown>({
      path: '/projects',
      method: 'POST',
      apiKey: input.apiKey,
      body: primaryBody as unknown as Record<string, unknown>,
    });
  } catch {
    payload = await neonRequest<unknown>({
      path: '/projects',
      method: 'POST',
      apiKey: input.apiKey,
      body: fallbackBody as unknown as Record<string, unknown>,
    });
  }

  const root = asRecord(payload);
  const neonProjectId = asString(asRecord(root?.project)?.id) ?? asString(root?.id);
  if (!neonProjectId) {
    throw new Error('Neon project creation response did not include a project ID.');
  }
  return neonProjectId;
};

const managedDatabaseSelect = {
  id: true,
  organizationId: true,
  projectId: true,
  provider: true,
  status: true,
  name: true,
  regionId: true,
  branchName: true,
  databaseName: true,
  roleName: true,
  secretKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

const provisionNeonManagedDatabase = async (input: {
  apiKey: string;
  actorUserId: string;
  organizationId: string;
  project: {
    id: string;
    name: string;
    slug: string;
  } | null;
  payload: z.infer<typeof provisionNeonDatabaseBodySchema>;
  audit: AuditLogService;
  requestLog: {
    error: (arg0: Record<string, unknown>, arg1: string) => void;
  };
}): Promise<{
  database: {
    id: string;
    organizationId: string;
    projectId: string | null;
    provider: string;
    status: string;
    name: string;
    regionId: string;
    branchName: string;
    databaseName: string;
    roleName: string;
    secretKey: string;
    createdAt: Date;
    updatedAt: Date;
  };
  secret: {
    id: string;
    key: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  connectionUrl: string | null;
}> => {
  const regionId = input.payload.regionId?.trim() || env.NEON_DEFAULT_REGION;
  const slugSeed =
    input.project?.slug
    ?? toSnakeIdentifier(input.payload.projectName ?? `org_${input.organizationId.slice(0, 6)}`, 'app');
  const nameSeed = input.project?.name ?? 'Standalone';
  const branchName = toBranchName(input.payload.branchName ?? 'main', 'main');
  const databaseName = input.payload.databaseName ?? toSnakeIdentifier(`${slugSeed}_db`, 'app_db');
  const roleName = input.payload.roleName ?? toSnakeIdentifier(`${slugSeed}_user`, 'app_user');
  const secretKey = input.payload.secretKey?.trim().toUpperCase() || 'DATABASE_URL';
  const projectName = toProjectDisplayName(
    input.payload.projectName ?? `${nameSeed} database`,
    `${nameSeed} database`,
  );

  let neonProjectId = '';
  let neonBranchId = '';
  let neonEndpointId: string | null = null;
  let databaseUrl = '';

  try {
    neonProjectId = await createNeonProject({
      apiKey: input.apiKey,
      projectName,
      regionId,
      branchName,
      databaseName,
      roleName,
    });
    neonBranchId = await resolveBranchId({
      apiKey: input.apiKey,
      neonProjectId,
      branchName,
    });
    await ensureRoleOnBranch({
      apiKey: input.apiKey,
      neonProjectId,
      neonBranchId,
      roleName,
    });
    await ensureDatabaseOnBranch({
      apiKey: input.apiKey,
      neonProjectId,
      neonBranchId,
      databaseName,
      roleName,
    });
    const rolePassword = await resetRolePassword({
      apiKey: input.apiKey,
      neonProjectId,
      neonBranchId,
      roleName,
    });
    const endpoint = await resolveEndpointInfo({
      apiKey: input.apiKey,
      neonProjectId,
      neonBranchId,
    });
    neonEndpointId = endpoint.endpointId;
    const connectionUri = await resolveConnectionUriFromNeon({
      apiKey: input.apiKey,
      neonProjectId,
      neonBranchId,
      databaseName,
      roleName,
    });
    databaseUrl = ensureConnectionUri({
      connectionUri,
      roleName,
      rolePassword,
      databaseName,
      endpointHost: endpoint.host,
    });
  } catch (error) {
    input.requestLog.error(
      {
        err: error,
        organizationId: input.organizationId,
        projectId: input.project?.id ?? null,
        regionId,
        branchName,
        databaseName,
        roleName,
      },
      'Neon database provisioning failed',
    );
    throw error;
  }

  const encrypted = encryptSecret(databaseUrl);

  const result = await prisma.$transaction(async (tx) => {
    const secret = input.project
      ? await tx.projectSecret.upsert({
          where: {
            projectId_key: {
              projectId: input.project.id,
              key: secretKey,
            },
          },
          update: {
            encryptedValue: encrypted.encryptedValue,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
          create: {
            projectId: input.project.id,
            key: secretKey,
            encryptedValue: encrypted.encryptedValue,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
          select: {
            id: true,
            key: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : null;

    const database = await tx.managedDatabase.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.project?.id ?? null,
        createdById: input.actorUserId,
        provider: 'neon',
        status: 'ready',
        name: projectName,
        regionId,
        branchName,
        databaseName,
        roleName,
        secretKey,
        externalProjectId: neonProjectId,
        externalBranchId: neonBranchId,
        externalEndpointId: neonEndpointId,
      },
      select: managedDatabaseSelect,
    });

    return {
      secret,
      database,
    };
  });

  await input.audit.record({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'database.provisioned',
    entityType: 'managed_database',
    entityId: result.database.id,
    metadata: {
      projectId: input.project?.id ?? null,
      provider: 'neon',
      regionId,
      branchName,
      databaseName,
      roleName,
      secretKey,
    },
  });

  return {
    database: result.database,
    secret: result.secret,
    connectionUrl: input.project ? null : databaseUrl,
  };
};

export const databaseRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const audit = new AuditLogService();

  app.get('/databases', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = listOrganizationDatabasesQuerySchema.parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const databases = await prisma.managedDatabase.findMany({
      where: {
        organizationId: query.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      select: managedDatabaseSelect,
    });

    return {
      neonConfigured: Boolean(env.NEON_API_KEY?.trim()),
      databases,
    };
  });

  app.post('/databases/neon/provision', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = provisionOrganizationNeonDatabaseBodySchema.parse(request.body);

    const apiKey = env.NEON_API_KEY?.trim();
    if (!apiKey) {
      return reply.serviceUnavailable('Neon provisioning is not configured on the server.');
    }

    try {
      await access.requireOrganizationRole(user.userId, body.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    try {
      const result = await provisionNeonManagedDatabase({
        apiKey,
        actorUserId: user.userId,
        organizationId: body.organizationId,
        project: null,
        payload: {
          projectName: body.projectName,
          regionId: body.regionId,
          branchName: body.branchName,
          databaseName: body.databaseName,
          roleName: body.roleName,
          secretKey: body.secretKey,
        },
        audit,
        requestLog: request.log,
      });

      return reply.code(201).send({
        database: result.database,
        secret: result.secret,
        ...(result.connectionUrl ? { connectionUrl: result.connectionUrl } : {}),
      });
    } catch (error) {
      return reply.badGateway((error as Error).message);
    }
  });

  app.get('/projects/:projectId/databases', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = PROJECT_ID_PARAMS_SCHEMA.parse(request.params);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        organizationId: true,
      },
    });
    if (!project) {
      return reply.notFound('Project not found.');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const databases = await prisma.managedDatabase.findMany({
      where: {
        organizationId: project.organizationId,
        projectId: params.projectId,
      },
      orderBy: { createdAt: 'desc' },
      select: managedDatabaseSelect,
    });

    return {
      neonConfigured: Boolean(env.NEON_API_KEY?.trim()),
      databases,
    };
  });

  app.post('/projects/:projectId/databases/neon/provision', { preHandler: [app.authenticate] }, async (request, reply) => {
    PROJECT_ID_PARAMS_SCHEMA.parse(request.params);
    return reply.code(410).send({
      message: 'Project-based database creation has been removed. Create standalone databases from /databases.',
    });
  });
};
