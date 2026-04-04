import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, findFirstMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    agentSubscription: {
      create: createMock,
      findFirst: findFirstMock,
      update: updateMock,
    },
  },
}));

import {
  createAgentSubscription,
  getActiveAgentSubscriptionForOrganization,
  updateAgentSubscriptionById,
} from '../src/services/agent-subscription-service.js';

const buildRow = (overrides?: Partial<Record<string, unknown>>) => ({
  id: 'agent_sub_1',
  organizationId: 'org_1',
  planCode: 'starter',
  stripeCustomerId: 'dodo:cus_1',
  stripeSubscriptionId: 'dodo:sub_1',
  status: 'active',
  currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  ...overrides,
});

describe('agent subscription service', () => {
  beforeEach(() => {
    createMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
  });

  it('queries active subscriptions with enum filters through Prisma', async () => {
    findFirstMock.mockResolvedValue(buildRow());

    await getActiveAgentSubscriptionForOrganization('org_1');

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('creates agent subscriptions through Prisma', async () => {
    createMock.mockResolvedValue(buildRow());

    await createAgentSubscription({
      organizationId: 'org_1',
      planCode: 'starter',
      stripeCustomerId: 'dodo:cus_1',
      stripeSubscriptionId: 'dodo:sub_1',
      status: 'active',
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    expect(createMock).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        organizationId: 'org_1',
        planCode: 'starter',
        stripeCustomerId: 'dodo:cus_1',
        stripeSubscriptionId: 'dodo:sub_1',
        status: 'active',
        currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('updates agent subscriptions through Prisma', async () => {
    updateMock.mockResolvedValue(buildRow({ status: 'past_due' }));

    await updateAgentSubscriptionById('agent_sub_1', {
      planCode: 'growth',
      stripeCustomerId: 'dodo:cus_1',
      stripeSubscriptionId: 'dodo:sub_2',
      status: 'past_due',
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
    });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'agent_sub_1' },
      data: {
        planCode: 'growth',
        stripeCustomerId: 'dodo:cus_1',
        stripeSubscriptionId: 'dodo:sub_2',
        status: 'past_due',
        currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        cancelAtPeriodEnd: true,
      },
    });
  });
});
