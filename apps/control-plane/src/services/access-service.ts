import type { OrgRole } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

export class AccessService {
  async requireOrganizationRole(userId: string, organizationId: string, minimumRole: OrgRole) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new Error('Not a member of this organization.');
    }

    const rank: Record<OrgRole, number> = {
      owner: 4,
      admin: 3,
      developer: 2,
      viewer: 1,
    };

    if (rank[membership.role] < rank[minimumRole]) {
      throw new Error(`Role ${minimumRole} required.`);
    }

    return membership;
  }
}
