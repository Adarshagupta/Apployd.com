import type { FastifyPluginAsync } from 'fastify';

import { Prisma } from '@prisma/client';
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

export const billingRoutes: FastifyPluginAsync = async (app) => {
  const access = new AccessService();

  app.post('/billing/checkout-session', { preHandler: [app.authenticate] }, async (request, reply) => {
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
      customer: subscription.stripeCustomerId,
      line_items: [lineItem],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: {
        organizationId: body.organizationId,
        planCode: body.planCode,
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

  app.post('/billing/webhook', async (request, reply) => {
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

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const stripeSubscriptionId = sub.id;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId },
        data: {
          status: sub.status as
            | 'active'
            | 'trialing'
            | 'past_due'
            | 'canceled'
            | 'incomplete'
            | 'unpaid',
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        },
      });
    }

    return reply.code(200).send({ received: true });
  });
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
