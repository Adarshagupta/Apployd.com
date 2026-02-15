import { randomBytes } from 'crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { getPlanEntitlements } from '../../domain/plan-entitlements.js';
import { hashPassword } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { decryptSecret, encryptSecret } from '../../lib/secrets.js';
import { AccessService } from '../../services/access-service.js';
import { DeploymentRequestError, DeploymentRequestService } from '../../services/deployment-request-service.js';
import { GitHubService } from '../../services/github-service.js';

const connectQuerySchema = z.object({
  redirectTo: z.string().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const repoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).optional(),
});

const updateGitSettingsSchema = z.object({
  repoUrl: z.string().url().optional(),
  repoOwner: z.string().trim().min(1).max(120).optional(),
  repoName: z.string().trim().min(1).max(120).optional(),
  repoFullName: z.string().trim().min(3).max(255).optional(),
  branch: z.string().trim().min(1).max(120).optional(),
  rootDirectory: z.string().trim().max(255).nullable().optional(),
  installCommand: z.string().trim().max(300).nullable().optional(),
  buildCommand: z.string().trim().max(300).nullable().optional(),
  startCommand: z.string().trim().max(300).nullable().optional(),
  targetPort: z.number().int().min(1).max(65535).optional(),
  autoDeployEnabled: z.boolean().optional(),
  previewDeploymentsEnabled: z.boolean().optional(),
  serviceType: z.enum(['web_service', 'static_site', 'python']).optional(),
  outputDirectory: z.string().trim().max(300).nullable().optional(),
  wakeMessage: z.string().trim().max(280).nullable().optional(),
  wakeRetrySeconds: z.number().int().min(1).max(60).optional(),
});

const pushWebhookSchema = z.object({
  ref: z.string(),
  after: z.string().optional(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
    clone_url: z.string(),
  }),
});

interface OAuthStatePayload {
  mode: 'connect' | 'login';
  userId?: string;
  redirectTo: string;
}

const OAUTH_STATE_PREFIX = 'apployd:oauth:github:';
const LOGIN_RESULT_PREFIX = 'apployd:oauth:github:login:';

export const githubIntegrationRoutes: FastifyPluginAsync = async (app) => {
  const github = new GitHubService();
  const access = new AccessService();
  const deploymentService = new DeploymentRequestService();

  app.get('/integrations/github/status', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    const connection = await prisma.gitHubConnection.findUnique({
      where: { userId: user.userId },
      select: {
        username: true,
        avatarUrl: true,
        tokenScope: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      configured: github.isConfigured(),
      connected: Boolean(connection),
      connection,
    };
  });

  app.get('/integrations/github/connect-url', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    if (!github.isConfigured()) {
      return reply.serviceUnavailable('GitHub OAuth is not configured on the server.');
    }

    const query = connectQuerySchema.parse(request.query);
    const state = randomBytes(24).toString('hex');
    const oauthState: OAuthStatePayload = {
      mode: 'connect',
      userId: user.userId,
      redirectTo: safeRedirectPath(query.redirectTo, '/settings'),
    };

    await redis.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify(oauthState),
      'EX',
      60 * 10,
    );

    return {
      url: github.getAuthorizeUrl(state),
    };
  });

  app.get('/integrations/github/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const consumedState = await consumeOAuthState(query.state);
    const statePayload = consumedState.payload;
    const isLoginFlow = statePayload?.mode === 'login';

    if (query.error) {
      const target = isLoginFlow
        ? dashboardLoginRedirect({
            status: 'error',
            message: query.error_description ?? query.error,
            next: statePayload?.redirectTo,
          })
        : dashboardRedirect({
            redirectTo: statePayload?.redirectTo ?? '/settings',
            status: 'error',
            message: query.error_description ?? query.error,
          });
      return reply.redirect(target);
    }

    if (!query.code || !query.state) {
      const target = isLoginFlow
        ? dashboardLoginRedirect({
            status: 'error',
            message: 'Missing OAuth code or state.',
            next: statePayload?.redirectTo,
          })
        : dashboardRedirect({
            redirectTo: statePayload?.redirectTo ?? '/settings',
            status: 'error',
            message: 'Missing OAuth code or state.',
          });
      return reply.redirect(target);
    }

    if (!statePayload) {
      const message =
        consumedState.reason === 'invalid'
          ? 'OAuth state is invalid.'
          : 'OAuth state has expired. Please try again.';
      return reply.redirect(
        dashboardRedirect({
          redirectTo: '/settings',
          status: 'error',
          message: `${message} Please restart the GitHub flow.`,
        }),
      );
    }

    try {
      const tokenResponse = await github.exchangeCodeForToken(query.code);
      if (!tokenResponse.access_token) {
        const message =
          tokenResponse.error_description ?? tokenResponse.error ?? 'GitHub did not return an access token.';
        throw new Error(message);
      }

      const githubUser = await github.getUser(tokenResponse.access_token);
      const encrypted = encryptSecret(tokenResponse.access_token);

      if (statePayload.mode === 'connect') {
        if (!statePayload.userId) {
          throw new Error('OAuth state is invalid.');
        }

        await upsertGitHubConnectionForUser({
          userId: statePayload.userId,
          githubUserId: String(githubUser.id),
          username: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          tokenScope: tokenResponse.scope ?? null,
          encryptedAccessToken: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        });

        const target = dashboardRedirect({
          redirectTo: statePayload.redirectTo,
          status: 'connected',
        });
        return reply.redirect(target);
      }

      const loginUser = await resolveUserForGitHubLogin({
        github,
        accessToken: tokenResponse.access_token,
        githubUser: {
          id: githubUser.id,
          login: githubUser.login,
          name: githubUser.name ?? null,
          email: githubUser.email ?? null,
          avatarUrl: githubUser.avatar_url ?? null,
        },
        tokenScope: tokenResponse.scope ?? null,
        encryptedAccessToken: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      });

      const token = app.jwt.sign({
        userId: loginUser.id,
        email: loginUser.email,
      });

      const loginCode = randomBytes(24).toString('hex');
      await redis.set(
        `${LOGIN_RESULT_PREFIX}${loginCode}`,
        JSON.stringify({
          token,
          user: {
            id: loginUser.id,
            email: loginUser.email,
            name: loginUser.name,
          },
          redirectTo: statePayload.redirectTo,
        }),
        'EX',
        60 * 5,
      );

      return reply.redirect(
        dashboardAuthCallbackRedirect({
          code: loginCode,
          next: statePayload.redirectTo,
        }),
      );
    } catch (error) {
      const target =
        statePayload.mode === 'login'
          ? dashboardLoginRedirect({
              status: 'error',
              message: (error as Error).message,
              next: statePayload.redirectTo,
            })
          : dashboardRedirect({
              redirectTo: statePayload.redirectTo,
              status: 'error',
              message: (error as Error).message,
            });
      return reply.redirect(target);
    }
  });

  app.delete('/integrations/github/connection', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    await prisma.gitHubConnection.deleteMany({
      where: { userId: user.userId },
    });

    return { success: true };
  });

  app.get('/integrations/github/repositories', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = repoQuerySchema.parse(request.query);
    const connection = await prisma.gitHubConnection.findUnique({
      where: { userId: user.userId },
    });

    if (!connection) {
      return reply.notFound('GitHub account is not connected.');
    }

    const accessToken = decryptSecret({
      encryptedValue: connection.encryptedAccessToken,
      iv: connection.iv,
      authTag: connection.authTag,
    });

    const result = await github.listRepositories({
      accessToken,
      page: query.page,
      perPage: query.perPage,
      ...(query.search && { search: query.search }),
    });

    return {
      repositories: result.repos,
      page: query.page,
      perPage: query.perPage,
      hasNextPage: result.hasNextPage,
    };
  });

  app.patch('/projects/:projectId/git-settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z.object({ projectId: z.string().cuid() }).parse(request.params);
    const body = updateGitSettingsSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      return reply.notFound('Project not found');
    }

    try {
      await access.requireOrganizationRole(user.userId, project.organizationId, 'developer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: project.organizationId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return reply.code(402).send({ message: 'No active subscription found for this organization.' });
    }

    const entitlements = getPlanEntitlements(subscription.plan.code);
    if (body.autoDeployEnabled === true && !entitlements.autoDeploy) {
      return reply.code(402).send({ message: 'Auto deploy is not available on your current plan.' });
    }
    if (body.previewDeploymentsEnabled === true && !entitlements.previewDeployments) {
      return reply.code(402).send({ message: 'Preview deployments are not available on your current plan.' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.repoUrl !== undefined) {
      updateData.repoUrl = body.repoUrl;
      updateData.gitProvider = 'github';
    }
    if (body.repoOwner !== undefined) updateData.repoOwner = body.repoOwner;
    if (body.repoName !== undefined) updateData.repoName = body.repoName;
    if (body.repoFullName !== undefined) updateData.repoFullName = body.repoFullName;
    if (body.branch !== undefined) updateData.branch = body.branch;
    if (body.rootDirectory !== undefined) updateData.rootDirectory = body.rootDirectory || null;
    if (body.installCommand !== undefined) updateData.installCommand = body.installCommand || null;
    if (body.buildCommand !== undefined) updateData.buildCommand = body.buildCommand || null;
    if (body.startCommand !== undefined) updateData.startCommand = body.startCommand || null;
    if (body.targetPort !== undefined) updateData.targetPort = body.targetPort;
    if (body.autoDeployEnabled !== undefined) updateData.autoDeployEnabled = body.autoDeployEnabled;
    if (body.previewDeploymentsEnabled !== undefined) {
      updateData.previewDeploymentsEnabled = body.previewDeploymentsEnabled;
    }
    if (body.serviceType !== undefined) updateData.serviceType = body.serviceType;
    if (body.outputDirectory !== undefined) updateData.outputDirectory = body.outputDirectory || null;
    if (body.wakeMessage !== undefined) updateData.wakeMessage = body.wakeMessage || null;
    if (body.wakeRetrySeconds !== undefined) updateData.wakeRetrySeconds = body.wakeRetrySeconds;

    const updated = await prisma.project.update({
      where: { id: params.projectId },
      data: updateData,
    });

    return { project: updated };
  });

  app.post('/integrations/github/webhook', async (request, reply) => {
    if (!env.GITHUB_WEBHOOK_SECRET) {
      return reply.serviceUnavailable('GitHub webhook secret is not configured.');
    }

    const signatureHeader = request.headers['x-hub-signature-256'];
    const payloadBuffer = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const valid = github.verifyWebhookSignature(
      payloadBuffer,
      typeof signatureHeader === 'string' ? signatureHeader : undefined,
    );

    if (!valid) {
      return reply.unauthorized('Invalid GitHub webhook signature.');
    }

    const eventType = request.headers['x-github-event'];
    if (eventType !== 'push') {
      return { received: true, ignored: true };
    }

    const payload = pushWebhookSchema.parse(request.body);
    const branch = payload.ref.replace('refs/heads/', '');

    const projects = await prisma.project.findMany({
      where: {
        gitProvider: 'github',
        repoFullName: payload.repository.full_name,
        autoDeployEnabled: true,
      },
      select: {
        id: true,
        branch: true,
        previewDeploymentsEnabled: true,
      },
    });

    if (!projects.length) {
      return { received: true, triggered: 0, ignored: 0 };
    }

    let triggered = 0;
    let ignored = 0;
    const errors: Array<{ projectId: string; message: string }> = [];

    for (const project of projects) {
      // Determine environment: push to the project's production branch → production
      // Push to any other branch → preview (if enabled)
      const isProductionBranch = branch === project.branch;
      const environment = isProductionBranch ? 'production' : 'preview';

      if (!isProductionBranch && !project.previewDeploymentsEnabled) {
        ignored += 1;
        continue;
      }
      if (payload.after) {
        const dedupeKey = `apployd:github:push:${project.id}:${payload.after}`;
        const reserved = await redis.set(dedupeKey, '1', 'NX', 'EX', 60 * 60 * 12);
        if (!reserved) {
          ignored += 1;
          continue;
        }
      }

      try {
        await deploymentService.create({
          projectId: project.id,
          trigger: 'github_push',
          environment,
          gitUrl: payload.repository.clone_url,
          branch,
          ...(payload.after && { commitSha: payload.after }),
        });
        triggered += 1;
      } catch (error) {
        if (error instanceof DeploymentRequestError) {
          errors.push({ projectId: project.id, message: error.message });
        } else {
          errors.push({ projectId: project.id, message: (error as Error).message });
        }
      }
    }

    return {
      received: true,
      triggered,
      ignored,
      errors,
    };
  });
};

const oauthStateSchema = z.object({
  mode: z.enum(['connect', 'login']),
  userId: z.string().cuid().optional(),
  redirectTo: z.string(),
});

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

    const redirectTo = safeRedirectPath(
      parsed.data.redirectTo,
      parsed.data.mode === 'login' ? '/overview' : '/settings',
    );
    return {
      payload: {
        mode: parsed.data.mode,
        ...(parsed.data.userId && { userId: parsed.data.userId }),
        redirectTo,
      },
      reason: null,
    };
  } catch {
    return { payload: null, reason: 'invalid' };
  }
};

const upsertGitHubConnectionForUser = async (input: {
  userId: string;
  githubUserId: string;
  username: string;
  avatarUrl: string | null;
  tokenScope: string | null;
  encryptedAccessToken: string;
  iv: string;
  authTag: string;
}): Promise<void> => {
  await prisma.gitHubConnection.upsert({
    where: { userId: input.userId },
    update: {
      githubUserId: input.githubUserId,
      username: input.username,
      avatarUrl: input.avatarUrl,
      tokenScope: input.tokenScope,
      encryptedAccessToken: input.encryptedAccessToken,
      iv: input.iv,
      authTag: input.authTag,
    },
    create: {
      userId: input.userId,
      githubUserId: input.githubUserId,
      username: input.username,
      avatarUrl: input.avatarUrl,
      tokenScope: input.tokenScope,
      encryptedAccessToken: input.encryptedAccessToken,
      iv: input.iv,
      authTag: input.authTag,
    },
  });
};

const normalizeEmail = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const slugifyOrganization = (value: string): string => {
  const candidate = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

  if (candidate.length >= 2) {
    return candidate;
  }

  return 'workspace';
};

const resolveUniqueOrganizationSlug = async (seed: string): Promise<string> => {
  const base = slugifyOrganization(seed);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (attempt === 0) {
      const existing = await prisma.organization.findUnique({
        where: { slug: base },
        select: { id: true },
      });
      if (!existing) {
        return base;
      }
      continue;
    }

    const suffix = `-${attempt + 1}`;
    const prefixMax = Math.max(2, 63 - suffix.length);
    const prefixed = `${base.slice(0, prefixMax)}${suffix}`;
    const existing = await prisma.organization.findUnique({
      where: { slug: prefixed },
      select: { id: true },
    });
    if (!existing) {
      return prefixed;
    }
  }

  throw new Error('Unable to allocate a unique organization slug.');
};

const resolveUserForGitHubLogin = async (input: {
  github: GitHubService;
  accessToken: string;
  githubUser: {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  tokenScope: string | null;
  encryptedAccessToken: string;
  iv: string;
  authTag: string;
}): Promise<{ id: string; email: string; name: string | null }> => {
  const githubSubject = String(input.githubUser.id);

  const linkedConnection = await prisma.gitHubConnection.findUnique({
    where: { githubUserId: githubSubject },
    include: { user: true },
  });

  let user = linkedConnection?.user ?? null;

  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        oauthProvider: 'github',
        oauthSubject: githubSubject,
      },
    });
  }

  if (!user) {
    const primaryEmail =
      normalizeEmail(input.githubUser.email) ??
      normalizeEmail(await input.github.getPrimaryEmail(input.accessToken));

    if (!primaryEmail) {
      throw new Error(
        'GitHub did not provide an email. Ensure your GitHub account has a verified email and try again.',
      );
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: primaryEmail },
    });

    if (existingByEmail) {
      if (
        existingByEmail.oauthProvider === 'github' &&
        existingByEmail.oauthSubject &&
        existingByEmail.oauthSubject !== githubSubject
      ) {
        throw new Error('This email is already linked to a different GitHub account.');
      }

      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          oauthProvider: 'github',
          oauthSubject: githubSubject,
          avatarUrl: existingByEmail.avatarUrl ?? input.githubUser.avatarUrl,
          name: existingByEmail.name ?? input.githubUser.name ?? input.githubUser.login,
          emailVerifiedAt: existingByEmail.emailVerifiedAt ?? new Date(),
        },
      });
    } else {
      const freePlan = await prisma.plan.findUnique({
        where: { code: 'free' },
      });

      if (!freePlan) {
        throw new Error('Default plans not seeded');
      }

      const organizationSlug = await resolveUniqueOrganizationSlug(
        input.githubUser.login || primaryEmail.split('@')[0] || 'workspace',
      );
      const workspaceOwner = input.githubUser.name?.trim() || input.githubUser.login;
      const organizationName = `${workspaceOwner} Workspace`;
      const randomPassword = randomBytes(32).toString('hex');

      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: primaryEmail,
            name: input.githubUser.name ?? input.githubUser.login,
            avatarUrl: input.githubUser.avatarUrl,
            passwordHash: hashPassword(randomPassword),
            oauthProvider: 'github',
            oauthSubject: githubSubject,
            emailVerifiedAt: new Date(),
          },
        });

        const organization = await tx.organization.create({
          data: {
            name: organizationName,
            slug: organizationSlug,
            ownerId: createdUser.id,
          },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: createdUser.id,
            role: 'owner',
          },
        });

        const periodStart = new Date();
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: freePlan.id,
            stripeCustomerId: `free_${organization.id}`,
            stripeSubscriptionId: `free_${organization.id}`,
            status: 'active',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            poolRamMb: freePlan.includedRamMb,
            poolCpuMillicores: freePlan.includedCpuMillicore,
            poolBandwidthGb: freePlan.includedBandwidthGb,
            overageEnabled: false,
          },
        });

        return createdUser;
      });
    }
  }

  if (
    user.oauthProvider !== 'github' ||
    user.oauthSubject !== githubSubject ||
    (!user.avatarUrl && input.githubUser.avatarUrl) ||
    (!user.name && input.githubUser.name) ||
    !user.emailVerifiedAt
  ) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        oauthProvider: 'github',
        oauthSubject: githubSubject,
        avatarUrl: user.avatarUrl ?? input.githubUser.avatarUrl,
        name: user.name ?? input.githubUser.name ?? input.githubUser.login,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
  }

  await upsertGitHubConnectionForUser({
    userId: user.id,
    githubUserId: githubSubject,
    username: input.githubUser.login,
    avatarUrl: input.githubUser.avatarUrl,
    tokenScope: input.tokenScope,
    encryptedAccessToken: input.encryptedAccessToken,
    iv: input.iv,
    authTag: input.authTag,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
  };
};

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
  url.searchParams.set('github', input.status);
  if (input.message) {
    url.searchParams.set('githubMessage', input.message);
  }
  return url.toString();
};

const dashboardLoginRedirect = (input: {
  status: 'error';
  message?: string;
  next?: string;
}): string => {
  const url = new URL('/login', env.DASHBOARD_BASE_URL);
  url.searchParams.set('githubLogin', input.status);
  if (input.message) {
    url.searchParams.set('githubMessage', input.message);
  }
  const next = safeRedirectPath(input.next, '/overview');
  if (next) {
    url.searchParams.set('next', next);
  }
  return url.toString();
};

const dashboardAuthCallbackRedirect = (input: {
  code: string;
  next?: string;
}): string => {
  const url = new URL('/github/callback', env.DASHBOARD_BASE_URL);
  url.searchParams.set('code', input.code);
  const next = safeRedirectPath(input.next, '/overview');
  if (next) {
    url.searchParams.set('next', next);
  }
  return url.toString();
};
