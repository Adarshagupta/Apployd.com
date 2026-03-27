import type { FastifyPluginAsync } from 'fastify';

import { InvoiceStatus, PlanCode, Prisma } from '@prisma/client';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { AccessService } from '../../services/access-service.js';
import {
  billingProvider,
  billingProviderConfigured,
  billingProviderLabel,
  createBillingCheckoutSession,
  createBillingCustomer,
  decodeBillingReference,
  encodeBillingReference,
  getPlanCodeForProductId,
  parseBillingWebhookEvent,
  retrieveBillingPayment,
  retrieveBillingSubscription,
  listBillingPaymentsForSubscription,
  listBillingSubscriptionsForCustomer,
  verifyBillingWebhookSignature,
  type BillingPayment,
  type BillingSubscription,
  type BillingWebhookEvent,
} from '../../services/billing-provider-service.js';

const checkoutSchema = z.object({
  organizationId: z.string().cuid(),
  planCode: z.enum(['dev', 'pro', 'max']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const syncSubscriptionSchema = z.object({
  organizationId: z.string().cuid(),
  providerSubscriptionId: z.string().trim().min(1).optional(),
});

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
  include: { plan: true };
}>;

export const billingRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.post('/billing/checkout-session', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!billingProviderConfigured) {
      return reply.serviceUnavailable(`${billingProviderLabel} not configured`);
    }

    const user = request.user as { userId: string; email: string };
    const body = checkoutSchema.parse(request.body);

    try {
      await access.requireOrganizationRole(user.userId, body.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const plan = await prisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan) {
      return reply.notFound('Plan not found');
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: body.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      return reply.badRequest('No current subscription');
    }

    const organization = await prisma.organization.findUnique({
      where: { id: body.organizationId },
      select: { name: true },
    });
    const customerName = organization?.name?.trim() || user.email;

    let billingCustomerId = decodeBillingReference(subscription.stripeCustomerId);
    if (!billingCustomerId) {
      const customer = await createBillingCustomer({
        email: user.email,
        name: customerName,
        metadata: {
          organizationId: body.organizationId,
        },
      });
      billingCustomerId = customer.customerId;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          stripeCustomerId: encodeBillingReference(billingCustomerId),
        },
      });
    }

    const session = await createBillingCheckoutSession({
      planCode: body.planCode,
      customerId: billingCustomerId,
      returnUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      metadata: {
        organizationId: body.organizationId,
        planCode: body.planCode,
        currentSubscriptionId: subscription.id,
      },
    });

    if (!session.checkoutUrl) {
      return reply.badRequest('Checkout URL missing.');
    }

    return { checkoutUrl: session.checkoutUrl };
  });

  app.get('/billing/invoices', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const query = z
      .object({
        organizationId: z.string().cuid(),
      })
      .parse(request.query);

    try {
      await access.requireOrganizationRole(user.userId, query.organizationId, 'viewer');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId: query.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      return { invoices: [] };
    }

    const invoices = await prisma.invoice.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { invoices };
  });

  app.post('/billing/sync-subscription', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!billingProviderConfigured) {
      return reply.serviceUnavailable(`${billingProviderLabel} not configured`);
    }

    const user = request.user as { userId: string; email: string };
    const body = syncSubscriptionSchema.parse(request.body);

    try {
      await access.requireOrganizationRole(user.userId, body.organizationId, 'admin');
    } catch (error) {
      return reply.forbidden((error as Error).message);
    }

    const subscription = await prisma.subscription.findFirst({
      where: { organizationId: body.organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      return reply.notFound('No subscription found for organization');
    }

    const synced = await syncLatestOrganizationSubscription({
      subscription,
      providerSubscriptionId: body.providerSubscriptionId ?? null,
    });

    if (!synced.subscription) {
      return {
        subscription,
        synced: false,
        reason: synced.reason,
      };
    }

    return { subscription: synced.subscription, synced: true };
  });

  app.post('/billing/webhook', async (request, reply) => {
    if (!billingProviderConfigured || !env.DODO_PAYMENTS_WEBHOOK_SECRET) {
      return reply.serviceUnavailable('Billing not configured');
    }

    const rawPayload = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    if (!verifyBillingWebhookSignature(request.headers as Record<string, unknown>, rawPayload)) {
      request.log.error('Billing webhook signature verification failed');
      return reply.badRequest('Invalid billing webhook signature');
    }

    let event: BillingWebhookEvent;
    try {
      event = parseBillingWebhookEvent(request.body, request.headers as Record<string, unknown>);
    } catch (error) {
      return reply.badRequest((error as Error).message);
    }

    try {
      await prisma.webhookEvent.create({
        data: {
          provider: billingProvider,
          eventId: event.id,
          eventType: event.type,
          payload: event.raw as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return reply.code(200).send({ received: true, duplicate: true });
      }
      throw error;
    }

    await handleBillingWebhookEvent(event);

    return reply.code(200).send({ received: true });
  });
};

const knownPlanCodes: PlanCode[] = ['free', 'dev', 'pro', 'max', 'enterprise'];

const parsePlanCode = (value?: string | null): PlanCode | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return knownPlanCodes.includes(normalized as PlanCode) ? (normalized as PlanCode) : null;
};

const syncLatestOrganizationSubscription = async (input: {
  subscription: SubscriptionWithPlan;
  providerSubscriptionId: string | null;
}): Promise<{ subscription: SubscriptionWithPlan | null; reason: string }> => {
  const providerSubscriptionId =
    normalizeNullableString(input.providerSubscriptionId)
    ?? decodeBillingReference(input.subscription.stripeSubscriptionId);

  let providerSubscription: BillingSubscription | null = null;
  if (providerSubscriptionId) {
    providerSubscription = await retrieveBillingSubscription(providerSubscriptionId).catch(() => null);
  }

  if (!providerSubscription) {
    const providerCustomerId = decodeBillingReference(input.subscription.stripeCustomerId);
    if (!providerCustomerId) {
      return { subscription: null, reason: 'no_provider_customer' };
    }

    const subscriptions = await listBillingSubscriptionsForCustomer(providerCustomerId);
    providerSubscription = pickPreferredBillingSubscription(subscriptions);
  }

  if (!providerSubscription) {
    return { subscription: null, reason: 'no_provider_subscription' };
  }

  const updated = await syncSubscriptionRecord({
    targetSubscription: input.subscription,
    providerSubscription,
  });

  const latestPayment = await findLatestPaymentForSubscription(providerSubscription.subscriptionId);
  if (latestPayment) {
    await upsertInvoiceForSubscription(updated.id, latestPayment);
  }

  return { subscription: updated, reason: 'synced' };
};

const handleBillingWebhookEvent = async (event: BillingWebhookEvent): Promise<void> => {
  if (event.type.startsWith('subscription.')) {
    await handleSubscriptionWebhookEvent(event);
    return;
  }

  if (event.type.startsWith('payment.')) {
    await handlePaymentWebhookEvent(event);
  }
};

const handleSubscriptionWebhookEvent = async (event: BillingWebhookEvent): Promise<void> => {
  const providerSubscriptionId = getString(event.data.subscription_id);
  if (!providerSubscriptionId) {
    return;
  }

  const providerSubscription = await retrieveBillingSubscription(providerSubscriptionId);
  const targetSubscription = await findTargetSubscription({
    organizationId: getOrganizationIdFromSources(
      providerSubscription.metadata,
      providerSubscription.customerMetadata,
      event.data,
    ),
    providerSubscriptionId: providerSubscription.subscriptionId,
    providerCustomerId: providerSubscription.customerId,
  });
  if (!targetSubscription) {
    return;
  }

  const updated = await syncSubscriptionRecord({
    targetSubscription,
    providerSubscription,
  });
  const latestPayment = await findLatestPaymentForSubscription(providerSubscription.subscriptionId);
  if (latestPayment) {
    await upsertInvoiceForSubscription(updated.id, latestPayment);
  }
};

const handlePaymentWebhookEvent = async (event: BillingWebhookEvent): Promise<void> => {
  const paymentId = getString(event.data.payment_id);
  if (!paymentId) {
    return;
  }

  const payment = await retrieveBillingPayment(paymentId);
  let targetSubscription = await findTargetSubscription({
    organizationId: getOrganizationIdFromSources(payment.metadata, payment.customerMetadata, event.data),
    providerSubscriptionId: payment.subscriptionId,
    providerCustomerId: payment.customerId,
  });
  if (!targetSubscription) {
    return;
  }

  if (payment.subscriptionId) {
    const providerSubscription = await retrieveBillingSubscription(payment.subscriptionId).catch(() => null);
    if (providerSubscription) {
      targetSubscription = await syncSubscriptionRecord({
        targetSubscription,
        providerSubscription,
      });
    } else if (isPastDuePaymentStatus(payment.status)) {
      targetSubscription = await prisma.subscription.update({
        where: { id: targetSubscription.id },
        data: { status: 'past_due' },
        include: { plan: true },
      });
    }
  }

  await upsertInvoiceForSubscription(targetSubscription.id, payment);
};

const syncSubscriptionRecord = async (input: {
  targetSubscription: SubscriptionWithPlan;
  providerSubscription: BillingSubscription;
}): Promise<SubscriptionWithPlan> => {
  const metadataPlanCode = parsePlanCode(input.providerSubscription.metadata.planCode);
  const planCode = metadataPlanCode ?? getPlanCodeForProductId(input.providerSubscription.productId);
  const matchedPlan =
    planCode
      ? await prisma.plan.findUnique({
          where: { code: planCode },
        })
      : null;

  const periodStart =
    input.providerSubscription.currentPeriodStart
    ?? input.providerSubscription.createdAt
    ?? input.targetSubscription.currentPeriodStart;
  const periodEnd =
    input.providerSubscription.currentPeriodEnd
    ?? addOneMonth(periodStart);

  return prisma.subscription.update({
    where: { id: input.targetSubscription.id },
    data: {
      ...(input.providerSubscription.customerId
        ? {
            stripeCustomerId: encodeBillingReference(input.providerSubscription.customerId),
          }
        : {}),
      stripeSubscriptionId: encodeBillingReference(input.providerSubscription.subscriptionId),
      status: mapBillingSubscriptionStatus(
        input.providerSubscription.status,
        input.targetSubscription.status,
      ),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: input.providerSubscription.cancelAtPeriodEnd,
      ...(matchedPlan
        ? {
            planId: matchedPlan.id,
            poolRamMb: matchedPlan.includedRamMb,
            poolCpuMillicores: matchedPlan.includedCpuMillicore,
            poolBandwidthGb: matchedPlan.includedBandwidthGb,
            overageEnabled: matchedPlan.code !== 'free',
          }
        : {}),
    },
    include: { plan: true },
  });
};

const upsertInvoiceForSubscription = async (
  subscriptionId: string,
  payment: BillingPayment,
): Promise<void> => {
  const paymentReference = encodeBillingReference(payment.paymentId);
  const amountDue = formatMinorCurrencyAmount(payment.totalAmount);
  const amountPaid = payment.status === 'succeeded' ? amountDue : '0.00';
  const paidAt =
    payment.status === 'succeeded'
      ? payment.updatedAt ?? payment.createdAt
      : null;

  await prisma.invoice.upsert({
    where: { stripeInvoiceId: paymentReference },
    update: {
      amountDueUsd: amountDue,
      amountPaidUsd: amountPaid,
      currency: (payment.currency ?? 'USD').toLowerCase(),
      status: mapBillingPaymentStatusToInvoiceStatus(payment.status),
      hostedInvoiceUrl: payment.invoiceUrl,
      invoicePdfUrl: payment.invoiceUrl,
      dueAt: null,
      paidAt,
    },
    create: {
      subscriptionId,
      stripeInvoiceId: paymentReference,
      amountDueUsd: amountDue,
      amountPaidUsd: amountPaid,
      currency: (payment.currency ?? 'USD').toLowerCase(),
      status: mapBillingPaymentStatusToInvoiceStatus(payment.status),
      hostedInvoiceUrl: payment.invoiceUrl,
      invoicePdfUrl: payment.invoiceUrl,
      dueAt: null,
      paidAt,
    },
  });
};

const findLatestPaymentForSubscription = async (
  providerSubscriptionId: string,
): Promise<BillingPayment | null> => {
  const payments = await listBillingPaymentsForSubscription(providerSubscriptionId);
  if (!payments.length) {
    return null;
  }

  return [...payments].sort((left, right) => {
    const leftTime = (left.updatedAt ?? left.createdAt)?.getTime() ?? 0;
    const rightTime = (right.updatedAt ?? right.createdAt)?.getTime() ?? 0;
    return rightTime - leftTime;
  })[0] ?? null;
};

const findTargetSubscription = async (input: {
  organizationId: string | null;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
}): Promise<SubscriptionWithPlan | null> => {
  if (input.providerSubscriptionId) {
    const bySubscriptionId = await prisma.subscription.findUnique({
      where: {
        stripeSubscriptionId: encodeBillingReference(input.providerSubscriptionId),
      },
      include: { plan: true },
    });
    if (bySubscriptionId) {
      return bySubscriptionId;
    }
  }

  if (input.providerCustomerId) {
    const byCustomerId = await prisma.subscription.findFirst({
      where: {
        stripeCustomerId: encodeBillingReference(input.providerCustomerId),
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (byCustomerId) {
      return byCustomerId;
    }
  }

  if (input.organizationId) {
    return prisma.subscription.findFirst({
      where: { organizationId: input.organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
};

const getOrganizationIdFromSources = (
  metadata: Record<string, string>,
  customerMetadata: Record<string, string>,
  eventData: Record<string, unknown>,
): string | null => {
  const direct =
    normalizeNullableString(metadata.organizationId)
    ?? normalizeNullableString(customerMetadata.organizationId);
  if (direct) {
    return direct;
  }

  const rawMetadata = asRecord(eventData.metadata);
  const rawCustomer = asRecord(eventData.customer);
  const rawCustomerMetadata = asRecord(rawCustomer.metadata);

  return normalizeNullableString(rawMetadata.organizationId)
    ?? normalizeNullableString(rawCustomerMetadata.organizationId);
};

const pickPreferredBillingSubscription = (
  subscriptions: BillingSubscription[],
): BillingSubscription | null => {
  if (!subscriptions.length) {
    return null;
  }

  return [...subscriptions].sort((left, right) => {
    const priorityDifference = billingSubscriptionPriority(left.status) - billingSubscriptionPriority(right.status);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const leftTime = (left.currentPeriodEnd ?? left.createdAt)?.getTime() ?? 0;
    const rightTime = (right.currentPeriodEnd ?? right.createdAt)?.getTime() ?? 0;
    return rightTime - leftTime;
  })[0] ?? null;
};

const billingSubscriptionPriority = (status: string | null): number => {
  switch (status) {
    case 'active':
      return 0;
    case 'on_hold':
      return 1;
    case 'pending':
      return 2;
    case 'failed':
      return 3;
    case 'cancelled':
      return 4;
    case 'expired':
      return 5;
    default:
      return 6;
  }
};

const mapBillingSubscriptionStatus = (
  status: string | null,
  fallback: SubscriptionWithPlan['status'],
): SubscriptionWithPlan['status'] => {
  switch (status) {
    case 'active':
      return 'active';
    case 'on_hold':
      return 'past_due';
    case 'pending':
    case 'failed':
      return 'incomplete';
    case 'cancelled':
    case 'expired':
      return 'canceled';
    default:
      return fallback;
  }
};

const mapBillingPaymentStatusToInvoiceStatus = (
  status: string | null,
): InvoiceStatus => {
  switch (status) {
    case 'succeeded':
      return 'paid';
    case 'cancelled':
      return 'void';
    case 'failed':
      return 'uncollectible';
    case 'processing':
    case 'requires_capture':
    case 'requires_confirmation':
    case 'requires_customer_action':
    case 'requires_merchant_action':
    case 'requires_payment_method':
    case 'partially_captured':
    case 'partially_captured_and_capturable':
      return 'open';
    default:
      return 'draft';
  }
};

const isPastDuePaymentStatus = (status: string | null): boolean =>
  status === 'failed' || status === 'cancelled' || status === 'requires_payment_method';

const addOneMonth = (start: Date): Date => {
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end;
};

const formatMinorCurrencyAmount = (amount: number | null): string => {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return '0.00';
  }

  return (amount / 100).toFixed(2);
};

const getString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeNullableString = (value: unknown): string | null => getString(value);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};
