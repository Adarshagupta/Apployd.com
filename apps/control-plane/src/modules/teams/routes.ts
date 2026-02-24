import { createHash } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';

import { z } from 'zod';

import { AccessService } from '../../services/access-service.js';
import {
  buildTeamUrl,
  OrganizationInviteDeliveryService,
  parseEmailDomain,
} from '../../services/organization-invite-delivery-service.js';
import { OrganizationInviteEmailService } from '../../services/organization-invite-email-service.js';
import { normalizeInviteEmail, OrganizationInviteService } from '../../services/organization-invite-service.js';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

const inviteSchema = z.object({
  organizationId: z.string().cuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'developer', 'viewer']),
});

const inviteParamsSchema = z.object({
  inviteId: z.string().cuid(),
});

export const teamRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();
  const invites = new OrganizationInviteService();
  const inviteEmail = new OrganizationInviteEmailService();
  const inviteDelivery = new OrganizationInviteDeliveryService();

  app.get('/teams/:organizationId/members', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = z
      .object({ organizationId: z.string().cuid() })
      .parse(request.params);

    let membership;
    try {
      membership = await access.requireOrganizationRole(user.userId, params.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: params.organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const canManageInvites = membership.role === 'owner' || membership.role === 'admin';
    const pendingInvites = canManageInvites
      ? await invites.listPendingInvitesForOrganization(params.organizationId)
      : [];

    return {
      members,
      invites: pendingInvites,
      permissions: {
        canManageInvites,
      },
    };
  });

  app.post('/teams/invite', { preHandler: [app.authenticate] }, async (request, reply) => {
    const reqUser = request.user as { userId: string; email: string };
    const body = inviteSchema.parse(request.body);

    try {
      await access.requireOrganizationRole(reqUser.userId, body.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const [organization, inviter] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: body.organizationId },
        select: { id: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: reqUser.userId },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!organization) {
      return reply.notFound('Organization not found.');
    }

    const normalizedEmail = normalizeInviteEmail(body.email);
    if (!isInviteDomainAllowed(normalizedEmail)) {
      return reply.badRequest(
        `Invite email domain is not allowed. Allowed domains: ${env.INVITE_ALLOWED_EMAIL_DOMAINS.join(', ')}`,
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });

    if (user) {
      const member = await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: body.organizationId,
            userId: user.id,
          },
        },
        update: { role: body.role },
        create: {
          organizationId: body.organizationId,
          userId: user.id,
          role: body.role,
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      await invites.markInvitesAcceptedForExistingUser({
        organizationId: body.organizationId,
        email: normalizedEmail,
        userId: user.id,
      });

      const teamUrl = buildTeamUrl();
      const emailDelivery = await inviteEmail.sendMembershipAdded({
        toEmail: normalizedEmail,
        organizationName: organization.name,
        role: body.role,
        invitedByEmail: inviter?.email ?? reqUser.email,
        teamUrl,
        ...(inviter ? { invitedByName: inviter.name } : {}),
      });
      if (!emailDelivery.delivered) {
        app.log.warn(
          {
            organizationId: body.organizationId,
            email: normalizedEmail,
            reason: emailDelivery.reason ?? 'unknown',
            errorMessage: emailDelivery.errorMessage ?? null,
          },
          'Team membership notification email was not delivered',
        );
      }

      return reply.code(201).send({
        member,
        invitation: null,
        emailDelivery: {
          delivered: emailDelivery.delivered,
          reason: emailDelivery.reason ?? null,
          errorMessage: emailDelivery.errorMessage ?? null,
          teamUrl,
        },
        delivery: 'member_added',
        message: emailDelivery.delivered
          ? 'User exists, membership has been applied immediately and a notification email was sent.'
          : 'User exists, membership has been applied immediately. Notification email failed to send.',
      });
    }

    const invitation = await invites.upsertPendingInvite({
      organizationId: body.organizationId,
      email: normalizedEmail,
      role: body.role,
      invitedByUserId: reqUser.userId,
    });

    const {
      delivery: emailDelivery,
      links,
    } = await inviteDelivery.sendInviteEmail({
      inviteId: invitation.id,
      toEmail: normalizedEmail,
      organizationName: organization.name,
      role: body.role,
      invitedByEmail: inviter?.email ?? reqUser.email,
      expiresAt: invitation.expiresAt,
      ...(inviter ? { invitedByName: inviter.name } : {}),
    }, 'initial');

    if (!emailDelivery.delivered) {
      app.log.warn(
        {
          organizationId: body.organizationId,
          email: normalizedEmail,
          reason: emailDelivery.reason ?? 'unknown',
          errorMessage: emailDelivery.errorMessage ?? null,
        },
        'Team invitation email was not delivered',
      );
    }

    return reply.code(202).send({
      member: null,
      invitation,
      emailDelivery: {
        delivered: emailDelivery.delivered,
        reason: emailDelivery.reason ?? null,
        errorMessage: emailDelivery.errorMessage ?? null,
        loginUrl: links.loginUrl,
        signupUrl: links.signupUrl,
      },
      delivery: 'invite_pending_signup',
      message: emailDelivery.delivered
        ? 'Invitation email sent. The user can join from the invite link.'
        : 'Invitation saved. Email delivery is not configured or failed; share the invite link manually.',
    });
  });

  app.post('/teams/invites/:inviteId/resend', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = inviteParamsSchema.parse(request.params);
    const now = new Date();

    const invite = await prisma.organizationInvite.findUnique({
      where: { id: params.inviteId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invite) {
      return reply.notFound('Invitation not found.');
    }

    try {
      await access.requireOrganizationRole(user.userId, invite.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    if (invite.acceptedAt) {
      return reply.badRequest('Invitation is already accepted.');
    }
    if (invite.revokedAt) {
      return reply.badRequest('Invitation has been revoked.');
    }
    if (invite.expiresAt <= now) {
      return reply.badRequest('Invitation has expired.');
    }
    if (!isInviteDomainAllowed(invite.email)) {
      return reply.badRequest(
        `Invite email domain is not allowed. Allowed domains: ${env.INVITE_ALLOWED_EMAIL_DOMAINS.join(', ')}`,
      );
    }

    const actor = await prisma.user.findUnique({
      where: {
        id: user.userId,
      },
      select: {
        name: true,
        email: true,
      },
    });

    const {
      delivery,
      links,
    } = await inviteDelivery.sendInviteEmail({
      inviteId: invite.id,
      toEmail: invite.email,
      organizationName: invite.organization.name,
      role: invite.role as 'admin' | 'developer' | 'viewer',
      invitedByEmail: actor?.email ?? user.email,
      expiresAt: invite.expiresAt,
      ...(actor ? { invitedByName: actor.name } : {}),
    }, 'resend');

    if (!delivery.delivered) {
      app.log.warn(
        {
          inviteId: invite.id,
          organizationId: invite.organizationId,
          email: invite.email,
          reason: delivery.reason ?? 'unknown',
          errorMessage: delivery.errorMessage ?? null,
        },
        'Team invitation resend email was not delivered',
      );
    }

    return reply.code(202).send({
      delivered: delivery.delivered,
      reason: delivery.reason ?? null,
      errorMessage: delivery.errorMessage ?? null,
      loginUrl: links.loginUrl,
      signupUrl: links.signupUrl,
      message: delivery.delivered
        ? 'Invitation email resent.'
        : 'Failed to resend invitation email.',
    });
  });

  app.post('/teams/invites/email/webhook', async (request, reply) => {
    if (env.INVITE_WEBHOOK_TOKEN) {
      const tokenHeader = request.headers['x-invite-webhook-token'];
      const providedToken = typeof tokenHeader === 'string'
        ? tokenHeader
        : Array.isArray(tokenHeader) ? tokenHeader[0] : undefined;

      if (providedToken !== env.INVITE_WEBHOOK_TOKEN) {
        return reply.unauthorized('Invalid invite webhook token.');
      }
    }

    const parsed = parseInviteEmailFeedbackEvent(request.body);
    if (!parsed) {
      return reply.badRequest('Unsupported invite email webhook payload.');
    }

    const dedupeEventId = parsed.eventId
      ?? createHash('sha256').update(JSON.stringify(request.body ?? {})).digest('hex');

    try {
      await prisma.webhookEvent.create({
        data: {
          provider: `invite-email:${parsed.provider}`,
          eventId: dedupeEventId,
          eventType: parsed.eventType,
          payload: request.body as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        return reply.code(200).send({ received: true, duplicate: true });
      }
      throw error;
    }

    const feedback = await inviteDelivery.recordFeedbackByEmail({
      provider: parsed.provider,
      providerEventId: dedupeEventId,
      email: parsed.email,
      eventType: parsed.eventType,
      payload: request.body as Prisma.InputJsonValue,
      ...(parsed.message ? { message: parsed.message } : {}),
    });

    return reply.code(200).send({
      received: true,
      affectedInvites: feedback.affectedInvites,
    });
  });

  app.get('/teams/invites/pending', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };
    const pendingInvites = await invites.listPendingInvitesForEmail({
      userId: user.userId,
      email: user.email,
    });

    return {
      invites: pendingInvites,
    };
  });

  app.post('/teams/invites/:inviteId/accept', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = inviteParamsSchema.parse(request.params);

    try {
      const result = await invites.acceptInviteByIdForUser({
        inviteId: params.inviteId,
        userId: user.userId,
        email: user.email,
      });

      return {
        accepted: result.accepted,
        alreadyMember: result.alreadyMember,
        organizationId: result.organizationId,
        role: result.role,
      };
    } catch (error) {
      return reply.badRequest((error as Error).message);
    }
  });

  app.post('/teams/invites/:inviteId/decline', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const params = inviteParamsSchema.parse(request.params);

    try {
      const result = await invites.declineInviteByIdForUser({
        inviteId: params.inviteId,
        userId: user.userId,
        email: user.email,
      });
      return {
        declined: true,
        organizationId: result.organizationId,
      };
    } catch (error) {
      return reply.badRequest((error as Error).message);
    }
  });
};

const isInviteDomainAllowed = (email: string): boolean => {
  if (!env.INVITE_ALLOWED_EMAIL_DOMAINS.length) {
    return true;
  }

  const domain = parseEmailDomain(email);
  if (!domain) {
    return false;
  }

  return env.INVITE_ALLOWED_EMAIL_DOMAINS.some((allowedDomain) =>
    domain === allowedDomain || domain.endsWith(`.${allowedDomain}`));
};

const parseInviteEmailFeedbackEvent = (payload: unknown): {
  provider: string;
  eventId?: string;
  eventType: 'bounced' | 'complained';
  email: string;
  message?: string;
} | null => {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const parsedEntry = extractFromObject(entry);
      if (parsedEntry) {
        return parsedEntry;
      }
    }
    return null;
  }

  const fromObject = extractFromObject(payload);
  if (fromObject) {
    return fromObject;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const snsType = readString(candidate.Type);
  const snsMessage = readString(candidate.Message);
  if (snsType === 'Notification' && snsMessage) {
    try {
      const nested = JSON.parse(snsMessage);
      return extractFromObject(nested);
    } catch {
      return null;
    }
  }

  return null;
};

const extractFromObject = (payload: unknown): {
  provider: string;
  eventId?: string;
  eventType: 'bounced' | 'complained';
  email: string;
  message?: string;
} | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;
  const rawType = readString(value.eventType)
    ?? readString(value.event)
    ?? readString(value.notificationType)
    ?? readString(value.type)
    ?? readString(value['event-type']);
  const normalizedType = normalizeFeedbackType(rawType);
  if (!normalizedType) {
    return null;
  }

  const email = readEmail(value.email)
    ?? readEmail(value.recipient)
    ?? readEmail(value.to)
    ?? readEmail(value.address)
    ?? readEmail(firstArrayValue(value.emails))
    ?? readEmail(getNested(value, ['bounce', 'bouncedRecipients', 0, 'emailAddress']))
    ?? readEmail(getNested(value, ['complaint', 'complainedRecipients', 0, 'emailAddress']));

  if (!email) {
    return null;
  }

  const provider = readString(value.provider)
    ?? readString(value.source)
    ?? inferProvider(value)
    ?? 'unknown';

  const eventId = readString(value.eventId)
    ?? readString(value.id)
    ?? readString(value.sg_event_id)
    ?? readString(value.MessageId)
    ?? readString(getNested(value, ['mail', 'messageId']));

  const message = readString(value.reason)
    ?? readString(value.description)
    ?? readString(value.message);

  return {
    provider,
    eventType: normalizedType,
    email,
    ...(eventId ? { eventId } : {}),
    ...(message ? { message } : {}),
  };
};

const normalizeFeedbackType = (value: string | undefined): 'bounced' | 'complained' | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['bounce', 'bounced', 'dropped'].includes(normalized)) {
    return 'bounced';
  }
  if (['complaint', 'complained', 'spamreport', 'spam_report'].includes(normalized)) {
    return 'complained';
  }

  return null;
};

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readEmail = (value: unknown): string | undefined => {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }
  const lowered = candidate.toLowerCase();
  return lowered.includes('@') ? lowered : undefined;
};

const firstArrayValue = (value: unknown): unknown => {
  if (!Array.isArray(value) || !value.length) {
    return undefined;
  }
  return value[0];
};

const getNested = (value: Record<string, unknown>, path: Array<string | number>): unknown => {
  let cursor: unknown = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(cursor) || cursor.length <= segment) {
        return undefined;
      }
      cursor = cursor[segment];
      continue;
    }

    if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

const inferProvider = (value: Record<string, unknown>): string | undefined => {
  if (value.notificationType && value.mail) {
    return 'ses';
  }
  if (value.sg_event_id || value.sg_message_id) {
    return 'sendgrid';
  }
  return undefined;
};
