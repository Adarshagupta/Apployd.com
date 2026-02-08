import type { OrgRole } from '@prisma/client';

const roleRank: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  viewer: 1,
};

export const hasMinimumRole = (actual: OrgRole, required: OrgRole): boolean => {
  return roleRank[actual] >= roleRank[required];
};
