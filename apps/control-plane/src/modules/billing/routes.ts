import type { FastifyPluginAsync } from 'fastify';

import { PlanCode, Prisma } from '@prisma/client';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { AccessService } from '../../services/access-service.js';
import { prisma } from '../../lib/prisma.js';
import { mapPlanPrice, stripe } from '../../services/stripe-service.js';

const checkoutSchema = z.object({
  organizationId: z.string().cuid(),
  planCode: z.enum(['dev', 'pro', 'max', 'enterprise']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});
const syncSubscriptionSchema = z.object({
  organizationId: z.string().cuid(),
});

export const billingRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.post('/billing/checkout-session', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!stripe) {
      return reply.serviceUnavailable('Billing not configured');
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
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return reply.badRequest('No current subscription');
    }

    let stripeCustomerId = subscription.stripeCustomerId;
    if (!isStripeCustomerId(stripeCustomerId)) {
      const organization = await prisma.organization.findUnique({
        where: { id: body.organizationId },
        select: { name: true },
      });
      const customer = await stripe.customers.create({
        email: user.email,
        ...(organization?.name ? { name: organization.name } : {}),
        metadata: {
          organizationId: body.organizationId,
        },
      });
      stripeCustomerId = customer.id;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          stripeCustomerId,
        },
      });
    }

    const lineItem =
      plan.stripePriceId
        ? {
            price: plan.stripePriceId,
            quantity: 1,
          }
        : {
            price_data: {
              currency: 'usd',
              unit_amount: mapPlanPrice(body.planCode),
              recurring: { interval: 'month' as const },
              product_data: { name: `Apployd ${plan.displayName}` },
            },
            quantity: 1,
          };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [lineItem],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      client_reference_id: body.organizationId,
      metadata: {
        organizationId: body.organizationId,
        planCode: body.planCode,
        currentSubscriptionId: subscription.id,
      },
      subscription_data: {
        metadata: {
          organizationId: body.organizationId,
          planCode: body.planCode,
        },
      },
    });

    return { checkoutUrl: session.url };
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
    if (!stripe) {
      return reply.serviceUnavailable('Billing not configured');
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

    if (!isStripeCustomerId(subscription.stripeCustomerId)) {
      return { subscription, synced: false, reason: 'no_stripe_customer' };
    }

    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: subscription.stripeCustomerId,
      status: 'all',
      limit: 20,
    });
    const latest = pickPreferredStripeSubscription(stripeSubscriptions.data);

    if (!latest) {
      return { subscription, synced: false, reason: 'no_stripe_subscription' };
    }

    const metadataPlanCode = parsePlanCode(latest.metadata?.planCode);
    const stripePriceId = latest.items.data[0]?.price?.id ?? null;
    const matchedPlan =
      (metadataPlanCode
        ? await prisma.plan.findUnique({
            where: { code: metadataPlanCode },
          })
        : null)
      ?? (stripePriceId
        ? await prisma.plan.findFirst({
            where: { stripePriceId },
          })
        : null);

    const periodStart =
      typeof latest.current_period_start === 'number'
        ? new Date(latest.current_period_start * 1000)
        : subscription.currentPeriodStart;
    const periodEnd =
      typeof latest.current_period_end === 'number'
        ? new Date(latest.current_period_end * 1000)
        : subscription.currentPeriodEnd;

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: latest.id,
        status: mapStripeSubscriptionStatus(latest.status, subscription.status),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(latest.cancel_at_period_end),
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

    return { subscription: updated, synced: true };
  });

  app.post('/billing/webhook', async (request, reply) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.serviceUnavailable('Billing not configured');
    }

    const signature = request.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      return reply.badRequest('Missing stripe-signature header');
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody ?? JSON.stringify(request.body ?? {}),
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      request.log.error({ error }, 'Stripe webhook signature verification failed');
      return reply.badRequest('Invalid webhook signature');
    }

    try {
      await prisma.webhookEvent.create({
        data: {
          provider: 'stripe',
          eventId: event.id,
          eventType: event.type,
          payload: event.data.object as unknown as Prisma.InputJsonValue,
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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        mode?: string | null;
        customer?: string | { id: string } | null;
        subscription?: string | { id: string } | null;
        metadata?: Record<string, string | undefined> | null;
      };

      if (session.mode === 'subscription') {
        const organizationId = session.metadata?.organizationId;
        const planCode = parsePlanCode(session.metadata?.planCode);
        const stripeCustomerId = getStripeResourceId(session.customer);
        const stripeSubscriptionId = getStripeResourceId(session.subscription);

        if (organizationId && stripeCustomerId && stripeSubscriptionId) {
          const targetSubscription = await prisma.subscription.findFirst({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
          });

          if (targetSubscription) {
            const stripeSubscription = await stripe.subscriptions
              .retrieve(stripeSubscriptionId)
              .catch(() => null);

            const now = new Date();
            const periodStart =
              typeof stripeSubscription?.current_period_start === 'number'
                ? new Date(stripeSubscription.current_period_start * 1000)
                : now;
            const periodEnd =
              typeof stripeSubscription?.current_period_end === 'number'
                ? new Date(stripeSubscription.current_period_end * 1000)
                : addOneMonth(periodStart);
            const subscriptionStatus = mapStripeSubscriptionStatus(
              stripeSubscription?.status,
              'active',
            );
            const plan =
              planCode
                ? await prisma.plan.findUnique({
                    where: { code: planCode },
                  })
                : null;

            await prisma.subscription.update({
              where: { id: targetSubscription.id },
              data: {
                stripeCustomerId,
                stripeSubscriptionId,
                status: subscriptionStatus,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: Boolean(stripeSubscription?.cancel_at_period_end),
                ...(plan
                  ? {
                      planId: plan.id,
                      poolRamMb: plan.includedRamMb,
                      poolCpuMillicores: plan.includedCpuMillicore,
                      poolBandwidthGb: plan.includedBandwidthGb,
                      overageEnabled: plan.code !== 'free',
                    }
                  : {}),
              },
            });
          }
        }
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const stripeSubscriptionId =
        typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

      if (stripeSubscriptionId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId },
          data: { status: 'past_due' },
        });
      }
    }

    if (event.type === 'invoice.finalized' || event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const stripeSubscriptionId =
        typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

      if (stripeSubscriptionId) {
        const subscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId },
        });

        if (subscription) {
          await prisma.invoice.upsert({
            where: { stripeInvoiceId: invoice.id },
            update: {
              amountDueUsd: (invoice.amount_due / 100).toFixed(2),
              amountPaidUsd: (invoice.amount_paid / 100).toFixed(2),
              currency: invoice.currency,
              status: mapInvoiceStatus(invoice.status),
              hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
              invoicePdfUrl: invoice.invoice_pdf ?? null,
              dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
              paidAt: invoice.status_transitions?.paid_at
                ? new Date(invoice.status_transitions.paid_at * 1000)
                : null,
            },
            create: {
              subscriptionId: subscription.id,
              stripeInvoiceId: invoice.id,
              amountDueUsd: (invoice.amount_due / 100).toFixed(2),
              amountPaidUsd: (invoice.amount_paid / 100).toFixed(2),
              currency: invoice.currency,
              status: mapInvoiceStatus(invoice.status),
              hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
              invoicePdfUrl: invoice.invoice_pdf ?? null,
              dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
              paidAt: invoice.status_transitions?.paid_at
                ? new Date(invoice.status_transitions.paid_at * 1000)
                : null,
            },
          });
        }
      }
    }

    if (
      event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as {
        id: string;
        customer?: string | { id: string } | null;
        status?: string | null;
        current_period_start?: number | null;
        current_period_end?: number | null;
        cancel_at_period_end?: boolean | null;
        metadata?: Record<string, string | undefined> | null;
        items?: { data?: Array<{ price?: { id?: string | null } | null }> } | null;
      };
      const stripeSubscriptionId = sub.id;
      const stripeCustomerId = getStripeResourceId(sub.customer);
      const metadataPlanCode = parsePlanCode(sub.metadata?.planCode);
      const stripePriceId = sub.items?.data?.[0]?.price?.id ?? null;

      const targetSubscription =
        (await prisma.subscription.findUnique({
          where: { stripeSubscriptionId },
        }))
        ?? (stripeCustomerId
          ? await prisma.subscription.findFirst({
              where: { stripeCustomerId },
              orderBy: { createdAt: 'desc' },
            })
          : null);

      if (targetSubscription) {
        const matchedPlan =
          (metadataPlanCode
            ? await prisma.plan.findUnique({
                where: { code: metadataPlanCode },
              })
            : null)
          ?? (stripePriceId
            ? await prisma.plan.findFirst({
                where: { stripePriceId },
              })
            : null);

        const periodStart =
          typeof sub.current_period_start === 'number'
            ? new Date(sub.current_period_start * 1000)
            : targetSubscription.currentPeriodStart;
        const periodEnd =
          typeof sub.current_period_end === 'number'
            ? new Date(sub.current_period_end * 1000)
            : targetSubscription.currentPeriodEnd;
        const statusFallback = event.type === 'customer.subscription.deleted' ? 'canceled' : targetSubscription.status;

        await prisma.subscription.update({
          where: { id: targetSubscription.id },
          data: {
            stripeSubscriptionId,
            ...(stripeCustomerId ? { stripeCustomerId } : {}),
            status: mapStripeSubscriptionStatus(sub.status, statusFallback),
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
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
        });
      }
    }

    return reply.code(200).send({ received: true });
  });
};

const knownPlanCodes: PlanCode[] = ['free', 'dev', 'pro', 'max', 'enterprise'];

const parsePlanCode = (value?: string): PlanCode | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return knownPlanCodes.includes(normalized as PlanCode) ? (normalized as PlanCode) : null;
};

const isStripeCustomerId = (value: string): boolean => /^cus_[A-Za-z0-9]+$/.test(value);

const getStripeResourceId = (value: string | { id: string } | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.id === 'string' && value.id.length > 0) {
    return value.id;
  }
  return null;
};

const addOneMonth = (start: Date): Date => {
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end;
};

const mapStripeSubscriptionStatus = (
  status: string | null | undefined,
  fallback: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid',
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid' => {
  switch (status) {
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
    case 'incomplete_expired':
      return 'incomplete';
    case 'paused':
      return 'past_due';
    default:
      return fallback;
  }
};

const pickPreferredStripeSubscription = <T extends { status: string; created: number }>(
  subscriptions: T[],
): T | null => {
  if (!subscriptions.length) {
    return null;
  }

  const sorted = [...subscriptions].sort((a, b) => b.created - a.created);
  const preferred = sorted.find((subscription) =>
    ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'].includes(subscription.status),
  );

  return preferred ?? sorted[0] ?? null;
};

const mapInvoiceStatus = (status: string | null): 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' => {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'open';
    case 'paid':
      return 'paid';
    case 'void':
      return 'void';
    default:
      return 'uncollectible';
  }
};
