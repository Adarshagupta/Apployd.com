import { randomBytes } from 'crypto';

import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { env } from '../../config/env.js';
import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { EmailVerificationError, EmailVerificationService } from '../../services/email-verification-service.js';
import { GitHubService } from '../../services/github-service.js';
import { GoogleService } from '../../services/google-service.js';
import { OrganizationInviteService } from '../../services/organization-invite-service.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(120),
  organizationName: z.string().min(2).max(120),
  organizationSlug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginChallengeIdSchema = z
  .string()
  .regex(/^[a-f0-9]{48}$/i, 'Login challenge is invalid')
  .transform((value) => value.toLowerCase());

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
  loginChallengeId: loginChallengeIdSchema.optional(),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
  loginChallengeId: loginChallengeIdSchema.optional(),
});

const cliLoginChallengeIdSchema = z
  .string()
  .regex(/^[a-f0-9]{48}$/i, 'CLI login challenge is invalid')
  .transform((value) => value.toLowerCase());

const cliLoginPollSchema = z.object({
  challengeId: cliLoginChallengeIdSchema,
});

const cliLoginApproveSchema = z.object({
  challengeId: cliLoginChallengeIdSchema,
});

const githubLoginQuerySchema = z.object({
  next: z.string().optional(),
});

const githubExchangeSchema = z.object({
  code: z.string().min(24).max(128),
});

const googleLoginQuerySchema = z.object({
  next: z.string().optional(),
});

const googleExchangeSchema = z.object({
  code: z.string().min(24).max(128),
});

const googleCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const githubExchangePayloadSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().cuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
  redirectTo: z.string().optional(),
  acceptedInvites: z.number().int().nonnegative().optional(),
  acceptedOrganizationIds: z.array(z.string().cuid()).optional(),
});

const OAUTH_STATE_PREFIX = 'apployd:oauth:github:';
const LOGIN_RESULT_PREFIX = 'apployd:oauth:github:login:';
const GOOGLE_OAUTH_STATE_PREFIX = 'apployd:oauth:google:';
const GOOGLE_LOGIN_RESULT_PREFIX = 'apployd:oauth:google:login:';
const LOGIN_CHALLENGE_PREFIX = 'apployd:auth:login-challenge:';
const LOGIN_ATTEMPT_PREFIX = 'apployd:auth:login-attempts:';
const CLI_LOGIN_CHALLENGE_PREFIX = 'apployd:auth:cli:challenge:';
const CLI_LOGIN_RESULT_PREFIX = 'apployd:auth:cli:result:';
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const LOGIN_ATTEMPT_LIMIT = 10;
const CLI_LOGIN_TTL_SECONDS = 10 * 60;
const CLI_LOGIN_POLL_INTERVAL_SECONDS = 2;

export const authRoutes: FastifyPluginAsync = async (app) => {
  const github = new GitHubService();
  const google = new GoogleService();
  const emailVerification = new EmailVerificationService();
  const inviteService = new OrganizationInviteService();

  app.post('/auth/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
      },
    });
    if (existingUser) {
      if (existingUser.emailVerifiedAt) {
        return reply.conflict('Email already in use');
      }

      try {
        const resend = await emailVerification.sendCode({
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        });
        return reply.code(202).send({
          verificationRequired: true,
          email: existingUser.email,
          message: 'Account exists but email is not verified. A new code has been sent.',
          expiresInMinutes: resend.expiresInMinutes,
          ...(resend.devCode ? { devCode: resend.devCode } : {}),
        });
      } catch (error) {
        if (error instanceof EmailVerificationError) {
          return reply.code(error.statusCode).send({
            message: error.message,
          });
        }
        throw error;
      }
    }

    if (!emailVerification.canDispatchCodes()) {
      return reply.serviceUnavailable('Email verification service is not configured.');
    }

    const freePlan = await prisma.plan.findUnique({ where: { code: 'free' } });
    if (!freePlan) {
      return reply.badRequest('Default plans not seeded');
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash: hashPassword(body.password),
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: body.organizationName,
          slug: body.organizationSlug,
          ownerId: user.id,
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
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

      return { user, organization };
    });

    try {
      const dispatch = await emailVerification.sendCode({
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        bypassCooldown: true,
      });

      return reply.code(202).send({
        verificationRequired: true,
        email: result.user.email,
        message: 'We sent a verification code to your email.',
        expiresInMinutes: dispatch.expiresInMinutes,
        ...(dispatch.devCode ? { devCode: dispatch.devCode } : {}),
      });
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        app.log.error(
          {
            userId: result.user.id,
            email: result.user.email,
            error: error.message,
          },
          'Signup created but verification email could not be delivered',
        );
        return reply.code(202).send({
          verificationRequired: true,
          email: result.user.email,
          message: 'Account created. Unable to send verification code right now, please request a new code.',
          emailDeliveryFailed: true,
        });
      }
      throw error;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    const existingAttempts = Number((await redis.get(loginAttemptKey(normalizedEmail))) ?? '0');
    if (existingAttempts >= LOGIN_ATTEMPT_LIMIT) {
      return reply.code(429).send({
        message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
      });
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      const attempts = await redis.incr(loginAttemptKey(normalizedEmail));
      if (attempts === 1) {
        await redis.expire(loginAttemptKey(normalizedEmail), LOGIN_ATTEMPT_WINDOW_SECONDS);
      }
      if (attempts >= LOGIN_ATTEMPT_LIMIT) {
        return reply.code(429).send({
          message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
        });
      }
      return reply.unauthorized('Invalid email or password');
    }
    await redis.del(loginAttemptKey(normalizedEmail));

    const loginChallengeId = await createLoginChallenge({
      userId: user.id,
      email: user.email,
    });

    try {
      const dispatch = await emailVerification.sendCode({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      return reply.code(202).send({
        verificationRequired: true,
        email: user.email,
        message: user.emailVerifiedAt
          ? 'We sent a login verification code to your email.'
          : 'Please verify your email to complete sign in. We sent a verification code.',
        expiresInMinutes: dispatch.expiresInMinutes,
        loginChallengeId,
        ...(dispatch.devCode ? { devCode: dispatch.devCode } : {}),
      });
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        // Cooldown still means a valid recent code exists for this user.
        if (error.statusCode === 429) {
          return reply.code(202).send({
            verificationRequired: true,
            email: user.email,
            message: error.message,
            loginChallengeId,
          });
        }

        await redis.del(loginChallengeKey(loginChallengeId));
        return reply.code(error.statusCode).send({ message: error.message });
      }
      await redis.del(loginChallengeKey(loginChallengeId));
      throw error;
    }
  });

  app.post('/auth/verify-email', async (request, reply) => {
    const body = verifyEmailSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return reply.unauthorized('Invalid or expired verification code.');
    }

    const loginChallenge = body.loginChallengeId
      ? await resolveLoginChallenge(body.loginChallengeId)
      : null;

    if (
      body.loginChallengeId
      && (!loginChallenge || loginChallenge.userId !== user.id || loginChallenge.email !== user.email)
    ) {
      return reply.unauthorized('Login verification session is invalid or expired. Please sign in again.');
    }

    if (user.emailVerifiedAt && !loginChallenge) {
      return reply.unauthorized('Login verification session is invalid or expired. Please sign in again.');
    }

    try {
      const valid = await emailVerification.verifyCode(user.id, body.code);
      if (!valid) {
        return reply.unauthorized('Invalid or expired verification code.');
      }
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }

    if (!user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    if (body.loginChallengeId) {
      await redis.del(loginChallengeKey(body.loginChallengeId));
    }
    const inviteSync = await inviteService.syncInvitesForUser({
      userId: user.id,
      email: user.email,
    });

    const token = app.jwt.sign({ userId: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      verified: true,
      acceptedInvites: inviteSync.acceptedCount,
      acceptedOrganizationIds: inviteSync.acceptedOrganizationIds,
    };
  });

  app.post('/auth/resend-verification-code', async (request, reply) => {
    const body = resendVerificationSchema.parse(request.body);
    const loginChallenge = body.loginChallengeId
      ? await resolveLoginChallenge(body.loginChallengeId)
      : null;

    if (body.loginChallengeId && !loginChallenge) {
      return reply.unauthorized('Login verification session is invalid or expired. Please sign in again.');
    }

    const user = loginChallenge
      ? await prisma.user.findUnique({
          where: { id: loginChallenge.userId },
          select: {
            id: true,
            email: true,
            name: true,
            emailVerifiedAt: true,
          },
        })
      : await prisma.user.findUnique({
          where: { email: body.email },
          select: {
            id: true,
            email: true,
            name: true,
            emailVerifiedAt: true,
          },
        });

    if (!user) {
      if (loginChallenge) {
        return reply.unauthorized('Login verification session is invalid or expired. Please sign in again.');
      }
      return {
        success: true,
        message: 'If an account exists for that email, a verification code has been sent.',
      };
    }

    if (loginChallenge && loginChallenge.email !== user.email) {
      return reply.unauthorized('Login verification session is invalid or expired. Please sign in again.');
    }

    if (user.emailVerifiedAt && !loginChallenge) {
      return reply.unauthorized('Login verification session is invalid or expired. Please sign in again.');
    }

    try {
      const resend = await emailVerification.sendCode({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
      return {
        success: true,
        message: user.emailVerifiedAt
          ? 'Login verification code sent.'
          : 'Verification code sent.',
        expiresInMinutes: resend.expiresInMinutes,
        ...(resend.devCode ? { devCode: resend.devCode } : {}),
      };
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        if (error.statusCode === 429) {
          return {
            success: false,
            throttled: true,
            message: error.message,
          };
        }
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  app.post('/auth/cli/start', async () => {
    const challengeId = await createCliLoginChallenge();
    const verificationUrl = new URL('/cli-auth', env.DASHBOARD_BASE_URL);
    verificationUrl.searchParams.set('challenge', challengeId);

    return {
      challengeId,
      verificationUrl: verificationUrl.toString(),
      expiresInSeconds: CLI_LOGIN_TTL_SECONDS,
      pollIntervalSeconds: CLI_LOGIN_POLL_INTERVAL_SECONDS,
    };
  });

  app.get('/auth/cli/poll', async (request) => {
    const query = cliLoginPollSchema.parse(request.query);
    const result = await consumeCliLoginResult(query.challengeId);

    if (result) {
      return {
        status: 'complete',
        token: result.token,
        user: result.user,
      } as const;
    }

    const ttlSeconds = await redis.ttl(cliLoginChallengeKey(query.challengeId));
    if (ttlSeconds <= 0) {
      return {
        status: 'expired',
      } as const;
    }

    return {
      status: 'pending',
      expiresInSeconds: ttlSeconds,
      pollIntervalSeconds: CLI_LOGIN_POLL_INTERVAL_SECONDS,
    } as const;
  });

  app.post('/auth/cli/approve', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = cliLoginApproveSchema.parse(request.body);
    const challengeKey = cliLoginChallengeKey(body.challengeId);
    const challengeTtlSeconds = await redis.ttl(challengeKey);

    if (challengeTtlSeconds <= 0) {
      return reply.gone('CLI login challenge is invalid or expired.');
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!userRecord) {
      return reply.unauthorized('Authenticated user was not found.');
    }

    const token = app.jwt.sign({ userId: userRecord.id, email: userRecord.email });
    const resultTtlSeconds = Math.max(30, Math.min(challengeTtlSeconds, CLI_LOGIN_TTL_SECONDS));
    await redis.set(
      cliLoginResultKey(body.challengeId),
      JSON.stringify({
        token,
        user: {
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
        },
      }),
      'EX',
      resultTtlSeconds,
    );

    return {
      success: true,
      expiresInSeconds: resultTtlSeconds,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
      },
    };
  });

  app.get('/auth/github/login-url', async (request, reply) => {
    if (!github.isConfigured()) {
      return reply.serviceUnavailable('GitHub OAuth is not configured on the server.');
    }

    const query = githubLoginQuerySchema.parse(request.query);
    const state = randomBytes(24).toString('hex');
    const redirectTo = safeRedirectPath(query.next, '/overview');

    await redis.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify({
        mode: 'login',
        redirectTo,
      }),
      'EX',
      60 * 10,
    );

    return {
      url: github.getAuthorizeUrl(state),
    };
  });

  app.get('/auth/google/login-url', async (request, reply) => {
    if (!google.isConfigured()) {
      return reply.serviceUnavailable('Google OAuth is not configured on the server.');
    }

    const query = googleLoginQuerySchema.parse(request.query);
    const state = randomBytes(24).toString('hex');
    const redirectTo = safeRedirectPath(query.next, '/overview');

    await redis.set(
      `${GOOGLE_OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify({
        mode: 'login',
        redirectTo,
      }),
      'EX',
      60 * 10,
    );

    return {
      url: google.getAuthorizeUrl(state),
    };
  });

  app.get('/auth/google/callback', async (request, reply) => {
    const query = googleCallbackQuerySchema.parse(request.query);
    const statePayload = await consumeGoogleOAuthState(query.state);

    if (query.error) {
      return reply.redirect(
        dashboardGoogleLoginRedirect({
          status: 'error',
          message: query.error_description ?? query.error,
          ...(statePayload?.redirectTo ? { next: statePayload.redirectTo } : {}),
        }),
      );
    }

    if (!query.code || !query.state) {
      return reply.redirect(
        dashboardGoogleLoginRedirect({
          status: 'error',
          message: 'Missing OAuth code or state.',
          ...(statePayload?.redirectTo ? { next: statePayload.redirectTo } : {}),
        }),
      );
    }

    if (!statePayload) {
      return reply.redirect(
        dashboardGoogleLoginRedirect({
          status: 'error',
          message: 'OAuth state has expired. Please restart Google sign-in.',
        }),
      );
    }

    try {
      const tokenResponse = await google.exchangeCodeForToken(query.code);
      if (!tokenResponse.access_token) {
        const message =
          tokenResponse.error_description ?? tokenResponse.error ?? 'Google did not return an access token.';
        throw new Error(message);
      }

      const googleUser = await google.getUser(tokenResponse.access_token);
      if (!googleUser.email || !googleUser.emailVerified) {
        throw new Error('Google account must have a verified email address to sign in.');
      }

      const loginUser = await resolveUserForGoogleLogin({
        subject: googleUser.subject,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.avatarUrl,
      });

      const inviteSync = await inviteService.syncInvitesForUser({
        userId: loginUser.id,
        email: loginUser.email,
      });

      const token = app.jwt.sign({
        userId: loginUser.id,
        email: loginUser.email,
      });

      const loginCode = randomBytes(24).toString('hex');
      await redis.set(
        `${GOOGLE_LOGIN_RESULT_PREFIX}${loginCode}`,
        JSON.stringify({
          token,
          user: {
            id: loginUser.id,
            email: loginUser.email,
            name: loginUser.name,
          },
          redirectTo: statePayload.redirectTo,
          acceptedInvites: inviteSync.acceptedCount,
          acceptedOrganizationIds: inviteSync.acceptedOrganizationIds,
        }),
        'EX',
        60 * 5,
      );

      return reply.redirect(
        dashboardGoogleAuthCallbackRedirect({
          code: loginCode,
          next: statePayload.redirectTo,
        }),
      );
    } catch (error) {
      return reply.redirect(
        dashboardGoogleLoginRedirect({
          status: 'error',
          message: (error as Error).message,
          next: statePayload.redirectTo,
        }),
      );
    }
  });

  app.post('/auth/github/exchange', async (request, reply) => {
    const body = githubExchangeSchema.parse(request.body);
    const key = `${LOGIN_RESULT_PREFIX}${body.code}`;
    const stored = await redis.get(key);
    await redis.del(key);

    if (!stored) {
      return reply.unauthorized('GitHub login code is invalid or expired.');
    }

    try {
      const payload = githubExchangePayloadSchema.parse(JSON.parse(stored));
      return payload;
    } catch {
      return reply.unauthorized('GitHub login code is invalid.');
    }
  });

  app.post('/auth/google/exchange', async (request, reply) => {
    const body = googleExchangeSchema.parse(request.body);
    const key = `${GOOGLE_LOGIN_RESULT_PREFIX}${body.code}`;
    const stored = await redis.get(key);
    await redis.del(key);

    if (!stored) {
      return reply.unauthorized('Google login code is invalid or expired.');
    }

    try {
      const payload = githubExchangePayloadSchema.parse(JSON.parse(stored));
      return payload;
    } catch {
      return reply.unauthorized('Google login code is invalid.');
    }
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    const userRecord = await prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    return { user: userRecord };
  });
};

const safeRedirectPath = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  return fallback;
};

const googleOauthStateSchema = z.object({
  mode: z.literal('login'),
  redirectTo: z.string(),
});

const consumeGoogleOAuthState = async (
  state: string | undefined,
): Promise<{ redirectTo: string } | null> => {
  if (!state) {
    return null;
  }

  const key = `${GOOGLE_OAUTH_STATE_PREFIX}${state}`;
  const stored = await redis.get(key);
  await redis.del(key);
  if (!stored) {
    return null;
  }

  try {
    const parsed = googleOauthStateSchema.parse(JSON.parse(stored));
    return {
      redirectTo: safeRedirectPath(parsed.redirectTo, '/overview'),
    };
  } catch {
    return null;
  }
};

const dashboardGoogleLoginRedirect = (input: {
  status: 'error';
  message?: string;
  next?: string;
}): string => {
  const url = new URL('/login', env.DASHBOARD_BASE_URL);
  url.searchParams.set('googleLogin', input.status);
  if (input.message) {
    url.searchParams.set('googleMessage', input.message);
  }

  const next = safeRedirectPath(input.next, '/overview');
  if (next) {
    url.searchParams.set('next', next);
  }

  return url.toString();
};

const dashboardGoogleAuthCallbackRedirect = (input: {
  code: string;
  next?: string;
}): string => {
  const url = new URL('/google/callback', env.DASHBOARD_BASE_URL);
  url.searchParams.set('code', input.code);
  const next = safeRedirectPath(input.next, '/overview');
  if (next) {
    url.searchParams.set('next', next);
  }
  return url.toString();
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

const resolveUserForGoogleLogin = async (input: {
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<{ id: string; email: string; name: string | null }> => {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    throw new Error('Google did not provide a valid email.');
  }
  const fallbackDisplayName = normalizedEmail.split('@')[0] || 'workspace';

  let user = await prisma.user.findFirst({
    where: {
      oauthProvider: 'google',
      oauthSubject: input.subject,
    },
  });

  if (!user) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      if (
        existingByEmail.oauthProvider === 'google'
        && existingByEmail.oauthSubject
        && existingByEmail.oauthSubject !== input.subject
      ) {
        throw new Error('This email is already linked to a different Google account.');
      }

      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          oauthProvider: 'google',
          oauthSubject: input.subject,
          avatarUrl: existingByEmail.avatarUrl ?? input.avatarUrl,
          name: existingByEmail.name ?? input.name ?? fallbackDisplayName,
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

      const workspaceOwner = input.name?.trim() || fallbackDisplayName;
      const organizationSlug = await resolveUniqueOrganizationSlug(workspaceOwner);
      const organizationName = `${workspaceOwner} Workspace`;
      const randomPassword = randomBytes(32).toString('hex');

      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: input.name ?? workspaceOwner,
            avatarUrl: input.avatarUrl,
            passwordHash: hashPassword(randomPassword),
            oauthProvider: 'google',
            oauthSubject: input.subject,
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
    user.oauthProvider !== 'google'
    || user.oauthSubject !== input.subject
    || (!user.name && input.name)
    || (!user.avatarUrl && input.avatarUrl)
    || !user.emailVerifiedAt
  ) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        oauthProvider: 'google',
        oauthSubject: input.subject,
        name: user.name ?? input.name ?? fallbackDisplayName,
        avatarUrl: user.avatarUrl ?? input.avatarUrl,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
  };
};

const loginChallengeSchema = z.object({
  userId: z.string().cuid(),
  email: z.string().email(),
});

const loginChallengeKey = (challengeId: string): string =>
  `${LOGIN_CHALLENGE_PREFIX}${challengeId}`;

const loginAttemptKey = (normalizedEmail: string): string =>
  `${LOGIN_ATTEMPT_PREFIX}${normalizedEmail}`;

const cliLoginChallengeKey = (challengeId: string): string =>
  `${CLI_LOGIN_CHALLENGE_PREFIX}${challengeId}`;

const cliLoginResultKey = (challengeId: string): string =>
  `${CLI_LOGIN_RESULT_PREFIX}${challengeId}`;

const loginChallengeTtlSeconds = (): number =>
  env.EMAIL_VERIFICATION_TTL_MINUTES * 60;

const createLoginChallenge = async (payload: {
  userId: string;
  email: string;
}): Promise<string> => {
  const challengeId = randomBytes(24).toString('hex');
  await redis.set(
    loginChallengeKey(challengeId),
    JSON.stringify(payload),
    'EX',
    loginChallengeTtlSeconds(),
  );
  return challengeId;
};

const resolveLoginChallenge = async (
  challengeId: string,
): Promise<{ userId: string; email: string } | null> => {
  const stored = await redis.get(loginChallengeKey(challengeId));
  if (!stored) {
    return null;
  }

  try {
    return loginChallengeSchema.parse(JSON.parse(stored));
  } catch {
    await redis.del(loginChallengeKey(challengeId));
    return null;
  }
};

const createCliLoginChallenge = async (): Promise<string> => {
  const challengeId = randomBytes(24).toString('hex');
  await redis.set(
    cliLoginChallengeKey(challengeId),
    JSON.stringify({
      createdAt: new Date().toISOString(),
    }),
    'EX',
    CLI_LOGIN_TTL_SECONDS,
  );
  return challengeId;
};

const cliLoginResultSchema = z.object({
  token: z.string().min(1),
  user: z.object({
    id: z.string().cuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
});

const consumeCliLoginResult = async (
  challengeId: string,
): Promise<{ token: string; user: { id: string; email: string; name: string | null } } | null> => {
  const resultKey = cliLoginResultKey(challengeId);
  const stored = await redis.get(resultKey);
  if (!stored) {
    return null;
  }

  await redis.del(resultKey);
  await redis.del(cliLoginChallengeKey(challengeId));

  try {
    return cliLoginResultSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
};
