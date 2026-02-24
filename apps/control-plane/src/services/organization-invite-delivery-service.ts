import type { InviteEmailEventType, OrgRole, Prisma } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

import {
  type OrganizationInviteEmailDelivery,
  OrganizationInviteEmailService,
} from './organization-invite-email-service.js';
import { normalizeInviteEmail } from './organization-invite-service.js';

type InviteRole = Extract<OrgRole, 'admin' | 'developer' | 'viewer'>;
type InviteEmailMode = 'initial' | 'resend' | 'reminder';
type FeedbackEvent = 'bounced' | 'complained';

interface SendInviteEmailInput {
  inviteId: string;
  toEmail: string;
  organizationName: string;
  role: InviteRole;
  invitedByName?: string | null;
  invitedByEmail: string;
  expiresAt: Date;
}

interface SendInviteEmailResult {
  delivery: OrganizationInviteEmailDelivery;
  links: {
    loginUrl: string;
    signupUrl: string;
  };
}

export class OrganizationInviteDeliveryService {
  private readonly email = new OrganizationInviteEmailService();

  async sendInviteEmail(
    input: SendInviteEmailInput,
    mode: InviteEmailMode,
  ): Promise<SendInviteEmailResult> {
    const links = buildInvitationLinks(input.inviteId, input.toEmail);

    const delivery = await this.email.sendInvite({
      toEmail: input.toEmail,
      organizationName: input.organizationName,
      role: input.role,
      invitedByEmail: input.invitedByEmail,
      loginUrl: links.loginUrl,
      signupUrl: links.signupUrl,
      expiresAt: input.expiresAt,
      ...(input.invitedByName !== undefined ? { invitedByName: input.invitedByName } : {}),
    });

    await this.recordEmailResult({
      inviteId: input.inviteId,
      mode,
      delivery,
    });

    return {
      delivery,
      links,
    };
  }

  async sendDueReminders(
    limit = 100,
  ): Promise<{ scanned: number; sent: number; failed: number }> {
    if (!env.INVITE_REMINDER_ENABLED || env.INVITE_MAX_REMINDERS <= 0) {
      return { scanned: 0, sent: 0, failed: 0 };
    }

    const now = new Date();
    const createdBefore = new Date(now.getTime() - env.INVITE_REMINDER_DELAY_HOURS * 60 * 60 * 1000);
    const reminderBefore = new Date(now.getTime() - env.INVITE_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000);
    const invites = await prisma.organizationInvite.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        createdAt: { lte: createdBefore },
        reminderCount: { lt: env.INVITE_MAX_REMINDERS },
        emailDeliveryStatus: { notIn: ['bounced', 'complained'] },
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lte: reminderBefore } },
        ],
      },
      include: {
        organization: {
          select: {
            name: true,
          },
        },
        invitedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let sent = 0;
    let failed = 0;

    for (const invite of invites) {
      const result = await this.sendInviteEmail({
        inviteId: invite.id,
        toEmail: invite.email,
        organizationName: invite.organization.name,
        role: invite.role as InviteRole,
        invitedByName: invite.invitedBy.name,
        invitedByEmail: invite.invitedBy.email,
        expiresAt: invite.expiresAt,
      }, 'reminder');

      if (result.delivery.delivered) {
        sent += 1;
      } else {
        failed += 1;
      }
    }

    return {
      scanned: invites.length,
      sent,
      failed,
    };
  }

  async expirePendingInvites(limit = 200): Promise<number> {
    const now = new Date();
    const expiredInvites = await prisma.organizationInvite.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
      },
      select: {
        id: true,
      },
      orderBy: {
        expiresAt: 'asc',
      },
      take: limit,
    });

    if (!expiredInvites.length) {
      return 0;
    }

    await prisma.$transaction(async (tx) => {
      for (const invite of expiredInvites) {
        await tx.organizationInvite.update({
          where: { id: invite.id },
          data: { revokedAt: now },
        });
        await tx.organizationInviteEmailEvent.create({
          data: {
            inviteId: invite.id,
            eventType: 'auto_expired',
            message: 'Invite expired and was auto-revoked.',
          },
        });
      }
    });

    return expiredInvites.length;
  }

  async recordFeedbackByEmail(input: {
    provider: string;
    providerEventId?: string | null;
    email: string;
    eventType: FeedbackEvent;
    message?: string | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<{ affectedInvites: number }> {
    const now = new Date();
    const normalizedEmail = normalizeInviteEmail(input.email);
    const invites = await prisma.organizationInvite.findMany({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!invites.length) {
      return { affectedInvites: 0 };
    }

    await prisma.$transaction(async (tx) => {
      for (const invite of invites) {
        await tx.organizationInvite.update({
          where: { id: invite.id },
          data: input.eventType === 'bounced'
            ? {
                emailDeliveryStatus: 'bounced',
                bouncedAt: now,
                lastDeliveryError: input.message ?? 'Delivery bounced.',
              }
            : {
                emailDeliveryStatus: 'complained',
                complainedAt: now,
                lastDeliveryError: input.message ?? 'Recipient complaint received.',
              },
        });

        await tx.organizationInviteEmailEvent.create({
          data: {
            inviteId: invite.id,
            eventType: input.eventType,
            provider: input.provider,
            providerEventId: input.providerEventId ?? null,
            message: input.message ?? null,
            ...(input.payload !== undefined ? { metadata: input.payload } : {}),
          },
        });
      }
    });

    return { affectedInvites: invites.length };
  }

  private async recordEmailResult(input: {
    inviteId: string;
    mode: InviteEmailMode;
    delivery: OrganizationInviteEmailDelivery;
  }): Promise<void> {
    const now = new Date();
    const delivered = input.delivery.delivered;
    const eventType = mapEmailResultEventType(input.mode, delivered);
    const errorMessage = input.delivery.errorMessage ?? input.delivery.reason ?? null;

    await prisma.$transaction(async (tx) => {
      await tx.organizationInvite.update({
        where: { id: input.inviteId },
        data: {
          emailDeliveryStatus: delivered ? 'sent' : 'failed',
          lastDeliveryError: delivered ? null : errorMessage,
          ...(delivered ? { lastEmailSentAt: now } : {}),
          ...(input.mode === 'reminder'
            ? {
                lastReminderSentAt: now,
                reminderCount: { increment: 1 },
              }
            : {}),
        },
      });

      await tx.organizationInviteEmailEvent.create({
        data: {
          inviteId: input.inviteId,
          eventType,
          message: delivered
            ? modeSuccessMessage(input.mode)
            : errorMessage ?? 'Unable to deliver invite email.',
          ...(!delivered ? { metadata: { reason: input.delivery.reason ?? 'unknown' } } : {}),
        },
      });
    });
  }
}

const mapEmailResultEventType = (mode: InviteEmailMode, delivered: boolean): InviteEmailEventType => {
  if (mode === 'initial') {
    return delivered ? 'invite_sent' : 'invite_send_failed';
  }
  if (mode === 'resend') {
    return delivered ? 'invite_resent' : 'invite_resend_failed';
  }
  return delivered ? 'invite_reminder_sent' : 'invite_reminder_failed';
};

const modeSuccessMessage = (mode: InviteEmailMode): string => {
  if (mode === 'initial') {
    return 'Invitation email sent.';
  }
  if (mode === 'resend') {
    return 'Invitation email resent.';
  }
  return 'Invitation reminder email sent.';
};

export const buildInvitationLinks = (
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

export const buildTeamUrl = (): string =>
  new URL('/team', env.DASHBOARD_BASE_URL).toString();

export const parseEmailDomain = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
};
