import crypto from 'node:crypto';

import { Prisma, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

export interface AgentSubscriptionRecord {
  id: string;
  organizationId: string;
  planCode: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AgentSubscriptionRow {
  id: string;
  organizationId: string;
  planCode: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const activeStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

const isMissingAgentSubscriptionsTableError = (error: unknown): boolean => {
  const message = (error as Error)?.message?.toLowerCase?.() ?? '';
  return message.includes('agent_subscriptions') && message.includes('does not exist');
};

const throwStorageNotInitialized = (): never => {
  throw new Error(
    'Agent subscription storage is not initialized. Run database migrations for agent subscriptions.',
  );
};

const mapAgentSubscriptionRow = (row: AgentSubscriptionRow): AgentSubscriptionRecord => ({
  ...row,
  status: normalizeSubscriptionStatus(row.status),
});

const normalizeSubscriptionStatus = (value: string): SubscriptionStatus => {
  switch (value) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    case 'unpaid':
      return 'unpaid';
    default:
      return 'incomplete';
  }
};

const baseSelect = Prisma.sql`
  SELECT
    "id",
    "organizationId",
    "planCode",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "status",
    "currentPeriodStart",
    "currentPeriodEnd",
    "cancelAtPeriodEnd",
    "createdAt",
    "updatedAt"
  FROM "agent_subscriptions"
`;

export const getLatestAgentSubscriptionForOrganization = async (
  organizationId: string,
): Promise<AgentSubscriptionRecord | null> => {
  try {
    const rows = await prisma.$queryRaw<AgentSubscriptionRow[]>(Prisma.sql`
      ${baseSelect}
      WHERE "organizationId" = ${organizationId}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `);

    return rows[0] ? mapAgentSubscriptionRow(rows[0]) : null;
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      return null;
    }
    throw error;
  }
};

export const getActiveAgentSubscriptionForOrganization = async (
  organizationId: string,
): Promise<AgentSubscriptionRecord | null> => {
  try {
    const rows = await prisma.$queryRaw<AgentSubscriptionRow[]>(Prisma.sql`
      ${baseSelect}
      WHERE "organizationId" = ${organizationId}
        AND "status" IN (${Prisma.join(activeStatuses)})
      ORDER BY "createdAt" DESC
      LIMIT 1
    `);

    return rows[0] ? mapAgentSubscriptionRow(rows[0]) : null;
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      return null;
    }
    throw error;
  }
};

export const findAgentSubscriptionByProviderSubscription = async (
  stripeSubscriptionId: string,
): Promise<AgentSubscriptionRecord | null> => {
  try {
    const rows = await prisma.$queryRaw<AgentSubscriptionRow[]>(Prisma.sql`
      ${baseSelect}
      WHERE "stripeSubscriptionId" = ${stripeSubscriptionId}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `);

    return rows[0] ? mapAgentSubscriptionRow(rows[0]) : null;
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      return null;
    }
    throw error;
  }
};

export const findLatestAgentSubscriptionByProviderCustomer = async (
  stripeCustomerId: string,
): Promise<AgentSubscriptionRecord | null> => {
  try {
    const rows = await prisma.$queryRaw<AgentSubscriptionRow[]>(Prisma.sql`
      ${baseSelect}
      WHERE "stripeCustomerId" = ${stripeCustomerId}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `);

    return rows[0] ? mapAgentSubscriptionRow(rows[0]) : null;
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      return null;
    }
    throw error;
  }
};

export const createOrRefreshPendingAgentSubscription = async (input: {
  organizationId: string;
  planCode: string;
  stripeCustomerId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}): Promise<AgentSubscriptionRecord> => {
  const latest = await getLatestAgentSubscriptionForOrganization(input.organizationId);
  if (latest && latest.status === 'incomplete' && !latest.stripeSubscriptionId) {
    return updateAgentSubscriptionById(latest.id, {
      planCode: input.planCode,
      stripeCustomerId: input.stripeCustomerId,
      status: 'incomplete',
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
    });
  }

  return createAgentSubscription({
    organizationId: input.organizationId,
    planCode: input.planCode,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: null,
    status: 'incomplete',
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: false,
  });
};

export const createAgentSubscription = async (input: {
  organizationId: string;
  planCode: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}): Promise<AgentSubscriptionRecord> => {
  const id = crypto.randomUUID();
  let rows: AgentSubscriptionRow[];
  try {
    rows = await prisma.$queryRaw<AgentSubscriptionRow[]>(Prisma.sql`
      INSERT INTO "agent_subscriptions" (
        "id",
        "organizationId",
        "planCode",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "status",
        "currentPeriodStart",
        "currentPeriodEnd",
        "cancelAtPeriodEnd",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${input.organizationId},
        ${input.planCode},
        ${input.stripeCustomerId},
        ${input.stripeSubscriptionId},
        ${input.status},
        ${input.currentPeriodStart},
        ${input.currentPeriodEnd},
        ${input.cancelAtPeriodEnd},
        NOW(),
        NOW()
      )
      RETURNING
        "id",
        "organizationId",
        "planCode",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "status",
        "currentPeriodStart",
        "currentPeriodEnd",
        "cancelAtPeriodEnd",
        "createdAt",
        "updatedAt"
    `);
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      throwStorageNotInitialized();
    }
    throw error;
  }

  const created = rows[0];
  if (!created) {
    throw new Error('Unable to create agent subscription record.');
  }
  return mapAgentSubscriptionRow(created);
};

export const updateAgentSubscriptionById = async (
  id: string,
  input: {
    planCode: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  },
): Promise<AgentSubscriptionRecord> => {
  let rows: AgentSubscriptionRow[];
  try {
    rows = await prisma.$queryRaw<AgentSubscriptionRow[]>(Prisma.sql`
      UPDATE "agent_subscriptions"
      SET
        "planCode" = ${input.planCode},
        "stripeCustomerId" = ${input.stripeCustomerId},
        "stripeSubscriptionId" = ${input.stripeSubscriptionId},
        "status" = ${input.status},
        "currentPeriodStart" = ${input.currentPeriodStart},
        "currentPeriodEnd" = ${input.currentPeriodEnd},
        "cancelAtPeriodEnd" = ${input.cancelAtPeriodEnd},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
      RETURNING
        "id",
        "organizationId",
        "planCode",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "status",
        "currentPeriodStart",
        "currentPeriodEnd",
        "cancelAtPeriodEnd",
        "createdAt",
        "updatedAt"
    `);
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      throwStorageNotInitialized();
    }
    throw error;
  }

  const updated = rows[0];
  if (!updated) {
    throw new Error('Agent subscription record not found.');
  }
  return mapAgentSubscriptionRow(updated);
};

export const upsertAgentSubscriptionByProviderSubscription = async (input: {
  organizationId: string;
  planCode: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}): Promise<AgentSubscriptionRecord> => {
  const existing = await findAgentSubscriptionByProviderSubscription(input.stripeSubscriptionId);
  if (existing) {
    return updateAgentSubscriptionById(existing.id, {
      planCode: input.planCode,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      status: input.status,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });
  }

  return createAgentSubscription({
    organizationId: input.organizationId,
    planCode: input.planCode,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    status: input.status,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  });
};
