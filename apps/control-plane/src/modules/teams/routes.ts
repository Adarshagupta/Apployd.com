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
    const links = buildInvitationLinks(invitation.id, normalizedEmail);
    const emailDelivery = await inviteEmail.sendInvite({
      toEmail: normalizedEmail,
      organizationName: organization.name,
      role: body.role,
      invitedByEmail: inviter?.email ?? reqUser.email,
      loginUrl: links.loginUrl,
      signupUrl: links.signupUrl,
      expiresAt: invitation.expiresAt,
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

const buildTeamUrl = (): string =>
  new URL('/team', env.DASHBOARD_BASE_URL).toString();
