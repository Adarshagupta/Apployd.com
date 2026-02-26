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

const resetRolePassword = async (input: {
  apiKey: string;
  neonProjectId: string;
  neonBranchId: string;
  roleName: string;
}): Promise<string> => {
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

export const databaseRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const audit = new AuditLogService();

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
      where: { projectId: params.projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
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
      },
    });

    return {
      neonConfigured: Boolean(env.NEON_API_KEY?.trim()),
      databases,
    };
  });

  app.post('/projects/:projectId/databases/neon/provision', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = PROJECT_ID_PARAMS_SCHEMA.parse(request.params);
    const body = provisionNeonDatabaseBodySchema.parse(request.body);

    const apiKey = env.NEON_API_KEY?.trim();
    if (!apiKey) {
      return reply.serviceUnavailable('Neon provisioning is not configured on the server.');
    }

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        name: true,
        slug: true,
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

    const regionId = body.regionId?.trim() || env.NEON_DEFAULT_REGION;
    const branchName = toBranchName(body.branchName ?? 'main', 'main');
    const databaseName = body.databaseName ?? toSnakeIdentifier(`${project.slug}_db`, 'app_db');
    const roleName = body.roleName ?? toSnakeIdentifier(`${project.slug}_user`, 'app_user');
    const secretKey = body.secretKey?.trim().toUpperCase() || 'DATABASE_URL';
    const projectName = toProjectDisplayName(
      body.projectName ?? `${project.name} database`,
      `${project.name} database`,
    );

    let neonProjectId = '';
    let neonBranchId = '';
    let neonEndpointId: string | null = null;
    let databaseUrl = '';

    try {
      neonProjectId = await createNeonProject({
        apiKey,
        projectName,
        regionId,
        branchName,
        databaseName,
        roleName,
      });
      neonBranchId = await resolveBranchId({
        apiKey,
        neonProjectId,
        branchName,
      });
      const rolePassword = await resetRolePassword({
        apiKey,
        neonProjectId,
        neonBranchId,
        roleName,
      });
      const endpoint = await resolveEndpointInfo({
        apiKey,
        neonProjectId,
        neonBranchId,
      });
      neonEndpointId = endpoint.endpointId;
      const connectionUri = await resolveConnectionUriFromNeon({
        apiKey,
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
      request.log.error(
        {
          err: error,
          projectId: project.id,
          regionId,
          branchName,
          databaseName,
          roleName,
        },
        'Neon database provisioning failed',
      );
      return reply.badGateway((error as Error).message);
    }

    const encrypted = encryptSecret(databaseUrl);

    const result = await prisma.$transaction(async (tx) => {
      const secret = await tx.projectSecret.upsert({
        where: {
          projectId_key: {
            projectId: project.id,
            key: secretKey,
          },
        },
        update: {
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        },
        create: {
          projectId: project.id,
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
      });

      const managedDatabase = await tx.managedDatabase.create({
        data: {
          projectId: project.id,
          createdById: user.userId,
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
        select: {
          id: true,
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
        },
      });

      return {
        secret,
        managedDatabase,
      };
    });

    await audit.record({
      organizationId: project.organizationId,
      actorUserId: user.userId,
      action: 'project.database.provisioned',
      entityType: 'managed_database',
      entityId: result.managedDatabase.id,
      metadata: {
        projectId: project.id,
        provider: 'neon',
        regionId,
        branchName,
        databaseName,
        roleName,
        secretKey,
      },
    });

    return reply.code(201).send({
      database: result.managedDatabase,
      secret: result.secret,
    });
  });
};
