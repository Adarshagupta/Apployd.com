import crypto from 'node:crypto';

import { Prisma, SubscriptionStatus, type AgentSubscription } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

export type AgentSubscriptionRecord = AgentSubscription;

const activeStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

const isMissingAgentSubscriptionsTableError = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    const table =
      typeof error.meta?.table === 'string' ? error.meta.table.toLowerCase() : '';
    const modelName =
      typeof error.meta?.modelName === 'string' ? error.meta.modelName.toLowerCase() : '';

    if (table.includes('agent_subscriptions') || modelName === 'agentsubscription') {
      return true;
    }
  }

  const message = (error as Error)?.message?.toLowerCase?.() ?? '';
  return message.includes('agent_subscriptions') && message.includes('does not exist');
};

const isAgentSubscriptionRecordNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

const throwStorageNotInitialized = (): never => {
  throw new Error(
    'Agent subscription storage is not initialized. Run database migrations for agent subscriptions.',
  );
};

export const getLatestAgentSubscriptionForOrganization = async (
  organizationId: string,
): Promise<AgentSubscriptionRecord | null> => {
  try {
    return await prisma.agentSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
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
    return await prisma.agentSubscription.findFirst({
      where: {
        organizationId,
        status: { in: activeStatuses },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    return await prisma.agentSubscription.findFirst({
      where: { stripeSubscriptionId },
      orderBy: { createdAt: 'desc' },
    });
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
    return await prisma.agentSubscription.findFirst({
      where: { stripeCustomerId },
      orderBy: { createdAt: 'desc' },
    });
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
  try {
    return await prisma.agentSubscription.create({
      data: {
        id,
        organizationId: input.organizationId,
        planCode: input.planCode,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      throwStorageNotInitialized();
    }
    throw error;
  }
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
  try {
    return await prisma.agentSubscription.update({
      where: { id },
      data: {
        planCode: input.planCode,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    if (isMissingAgentSubscriptionsTableError(error)) {
      throwStorageNotInitialized();
    }
    if (isAgentSubscriptionRecordNotFoundError(error)) {
      throw new Error('Agent subscription record not found.');
    }
    throw error;
  }
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
