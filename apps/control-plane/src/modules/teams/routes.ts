import { normalizeInviteEmail, OrganizationInviteService } from '../../services/organization-invite-service.js';
import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { env } from '../../config/env.js';
import { AccessService } from '../../services/access-service.js';
import { OrganizationInviteEmailService } from '../../services/organization-invite-email-service.js';
import { prisma } from '../../lib/prisma.js';

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

    const normalizedEmail = normalizeInviteEmail(body.email);
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

      return reply.code(201).send({
        member,
        invitation: null,
        delivery: 'member_added',
        message: 'User exists, membership has been applied immediately.',
      });
    }

    const invitation = await invites.upsertPendingInvite({
      organizationId: body.organizationId,
      email: normalizedEmail,
      role: body.role,
      invitedByUserId: reqUser.userId,
    });
    const links = buildInvitationLinks(invitation.id, normalizedEmail);
    const emailDelivery = await inviteEmail.sendInvite({
      toEmail: normalizedEmail,
      organizationName: invitation.organization.name,
      role: body.role,
      invitedByName: invitation.invitedBy.name,
      invitedByEmail: invitation.invitedBy.email,
      loginUrl: links.loginUrl,
      signupUrl: links.signupUrl,
      expiresAt: invitation.expiresAt,
    });
    if (!emailDelivery.delivered) {
      app.log.warn(
        {
          organizationId: body.organizationId,
          email: normalizedEmail,
          reason: emailDelivery.reason ?? 'unknown',
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
        loginUrl: links.loginUrl,
        signupUrl: links.signupUrl,
      },
      delivery: 'invite_pending_signup',
      message: emailDelivery.delivered
        ? 'Invitation email sent. The user can join from the invite link.'
        : 'Invitation saved. Email delivery is not configured or failed; share the invite link manually.',
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

const buildInvitationLinks = (
  inviteId: string,
  email: string,
): {
  loginUrl: string;
  signupUrl: string;
} => {
  const nextPath = `/team?invite=${encodeURIComponent(inviteId)}`;
  const loginUrl = new URL('/login', env.DASHBOARD_BASE_URL);
  loginUrl.searchParams.set('next', nextPath);
  loginUrl.searchParams.set('email', email);

  const signupUrl = new URL('/signup', env.DASHBOARD_BASE_URL);
  signupUrl.searchParams.set('next', nextPath);
  signupUrl.searchParams.set('email', email);

  return {
    loginUrl: loginUrl.toString(),
    signupUrl: signupUrl.toString(),
  };
};
