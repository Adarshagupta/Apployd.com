import { randomBytes } from 'crypto';
import type { OrgRole, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const DEFAULT_INVITE_TTL_DAYS = 14;

export const normalizeInviteEmail = (email: string): string =>
  email.trim().toLowerCase();

const computeDefaultExpiry = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_INVITE_TTL_DAYS);
  return expiresAt;
};

const roleRank: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  viewer: 1,
};

const maxRole = (currentRole: OrgRole, incomingRole: OrgRole): OrgRole =>
  roleRank[incomingRole] > roleRank[currentRole] ? incomingRole : currentRole;

export class OrganizationInviteService {
  async upsertPendingInvite(input: {
    organizationId: string;
    email: string;
    role: Extract<OrgRole, 'admin' | 'developer' | 'viewer'>;
    invitedByUserId: string;
    expiresAt?: Date;
  }) {
    const normalizedEmail = normalizeInviteEmail(input.email);
    const nextExpiresAt = input.expiresAt ?? computeDefaultExpiry();
    const token = randomBytes(24).toString('hex');

    return prisma.organizationInvite.upsert({
      where: {
        organizationId_email: {
          organizationId: input.organizationId,
          email: normalizedEmail,
        },
      },
      update: {
        role: input.role,
        invitedById: input.invitedByUserId,
        token,
        expiresAt: nextExpiresAt,
        revokedAt: null,
        acceptedAt: null,
        acceptedByUserId: null,
      },
      create: {
        organizationId: input.organizationId,
        email: normalizedEmail,
        role: input.role,
        invitedById: input.invitedByUserId,
        token,
        expiresAt: nextExpiresAt,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  async listPendingInvitesForOrganization(organizationId: string) {
    const now = new Date();
    return prisma.organizationInvite.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async listPendingInvitesForEmail(input: { userId: string; email: string }) {
    const normalizedEmail = normalizeInviteEmail(input.email);
    const now = new Date();

    return prisma.organizationInvite.findMany({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        organization: {
          memberships: {
            none: {
              userId: input.userId,
            },
          },
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async acceptInviteByIdForUser(input: {
    inviteId: string;
    userId: string;
    email: string;
  }): Promise<{
    organizationId: string;
    role: OrgRole;
    accepted: boolean;
    alreadyMember: boolean;
  }> {
    const normalizedEmail = normalizeInviteEmail(input.email);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const invite = await tx.organizationInvite.findUnique({
        where: { id: input.inviteId },
      });

      if (!invite) {
        throw new Error('Invitation not found.');
      }
      if (normalizeInviteEmail(invite.email) !== normalizedEmail) {
        throw new Error('This invitation is not addressed to your email.');
      }
      if (invite.revokedAt) {
        throw new Error('Invitation has been revoked.');
      }
      if (invite.acceptedAt) {
        const existingMembership = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: invite.organizationId,
              userId: input.userId,
            },
          },
        });
        return {
          organizationId: invite.organizationId,
          role: existingMembership?.role ?? invite.role,
          accepted: false,
          alreadyMember: Boolean(existingMembership),
        };
      }
      if (invite.expiresAt <= now) {
        throw new Error('Invitation has expired.');
      }

      const existingMembership = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId: input.userId,
          },
        },
      });

      if (!existingMembership) {
        await tx.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId: input.userId,
            role: invite.role,
          },
        });
      }

      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: {
          acceptedAt: now,
          acceptedByUserId: input.userId,
          revokedAt: null,
        },
      });

      return {
        organizationId: invite.organizationId,
        role: existingMembership?.role ?? invite.role,
        accepted: !existingMembership,
        alreadyMember: Boolean(existingMembership),
      };
    });
  }

  async declineInviteByIdForUser(input: {
    inviteId: string;
    userId: string;
    email: string;
  }): Promise<{ organizationId: string }> {
    const normalizedEmail = normalizeInviteEmail(input.email);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const invite = await tx.organizationInvite.findUnique({
        where: { id: input.inviteId },
      });

      if (!invite) {
        throw new Error('Invitation not found.');
      }
      if (normalizeInviteEmail(invite.email) !== normalizedEmail) {
        throw new Error('This invitation is not addressed to your email.');
      }
      if (invite.acceptedAt) {
        throw new Error('Invitation is already accepted.');
      }
      if (invite.revokedAt) {
        return { organizationId: invite.organizationId };
      }

      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: {
          revokedAt: now,
          acceptedByUserId: input.userId,
        },
      });

      return {
        organizationId: invite.organizationId,
      };
    });
  }

  async syncInvitesForUser(input: { userId: string; email: string }): Promise<{
    acceptedCount: number;
    acceptedOrganizationIds: string[];
  }> {
    const normalizedEmail = normalizeInviteEmail(input.email);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const pending = await tx.organizationInvite.findMany({
        where: {
          email: normalizedEmail,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!pending.length) {
        return {
          acceptedCount: 0,
          acceptedOrganizationIds: [],
        };
      }

      const acceptedOrganizationIds: string[] = [];
      let acceptedCount = 0;

      for (const invite of pending) {
        const membership = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: invite.organizationId,
              userId: input.userId,
            },
          },
        });

        if (!membership) {
          await tx.organizationMember.create({
            data: {
              organizationId: invite.organizationId,
              userId: input.userId,
              role: invite.role,
            },
          });
          acceptedCount += 1;
          acceptedOrganizationIds.push(invite.organizationId);
        } else {
          const upgradedRole = maxRole(membership.role, invite.role);
          if (upgradedRole !== membership.role) {
            await tx.organizationMember.update({
              where: {
                organizationId_userId: {
                  organizationId: invite.organizationId,
                  userId: input.userId,
                },
              },
              data: { role: upgradedRole },
            });
          }
        }

        await tx.organizationInvite.update({
          where: { id: invite.id },
          data: {
            acceptedAt: now,
            acceptedByUserId: input.userId,
            revokedAt: null,
          },
        });
      }

      return {
        acceptedCount,
        acceptedOrganizationIds,
      };
    });
  }

  async markInvitesAcceptedForExistingUser(input: {
    organizationId: string;
    email: string;
    userId: string;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const normalizedEmail = normalizeInviteEmail(input.email);
    const now = new Date();
    const client = input.tx ?? prisma;

    await client.organizationInvite.updateMany({
      where: {
        organizationId: input.organizationId,
        email: normalizedEmail,
        acceptedAt: null,
      },
      data: {
        acceptedAt: now,
        acceptedByUserId: input.userId,
        revokedAt: null,
      },
    });
  }
}
