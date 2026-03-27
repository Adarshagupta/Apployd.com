import crypto from 'node:crypto';

import { PlanCode } from '@prisma/client';

import { env } from '../config/env.js';

const DODO_PROVIDER_PREFIX = 'dodo:';

const paidPlanProductIds = {
  dev: env.DODO_PAYMENTS_PRODUCT_ID_DEV,
  pro: env.DODO_PAYMENTS_PRODUCT_ID_PRO,
  max: env.DODO_PAYMENTS_PRODUCT_ID_MAX,
} as const;

type CheckoutEnabledPlanCode = Exclude<PlanCode, 'free' | 'enterprise'>;
type DodoCheckoutPlanCode = keyof typeof paidPlanProductIds;
type BillingMetadata = Record<string, string>;
type DodoEnvironment = 'test' | 'live';
type DodoSubscriptionStatus = 'pending' | 'active' | 'on_hold' | 'cancelled' | 'failed' | 'expired';
type DodoPaymentStatus =
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'processing'
  | 'requires_customer_action'
  | 'requires_merchant_action'
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_capture'
  | 'partially_captured'
  | 'partially_captured_and_capturable';

interface DodoCustomerResponse {
  customer_id: string;
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string> | null;
}

interface DodoSubscriptionResponse {
  subscription_id: string;
  product_id?: string | null;
  status?: DodoSubscriptionStatus | null;
  previous_billing_date?: string | null;
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean | null;
  created_at?: string | null;
  customer?: {
    customer_id?: string | null;
    email?: string | null;
    name?: string | null;
    metadata?: Record<string, string> | null;
  } | null;
  metadata?: Record<string, string> | null;
}

interface DodoSubscriptionsListResponse {
  items?: DodoSubscriptionResponse[];
}

interface DodoPaymentResponse {
  payment_id: string;
  subscription_id?: string | null;
  status?: DodoPaymentStatus | null;
  total_amount?: number | null;
  currency?: string | null;
  invoice_id?: string | null;
  invoice_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  customer?: {
    customer_id?: string | null;
    email?: string | null;
    name?: string | null;
    metadata?: Record<string, string> | null;
  } | null;
  metadata?: Record<string, string> | null;
}

interface DodoPaymentsListResponse {
  items?: DodoPaymentResponse[];
}

interface DodoCheckoutSessionResponse {
  session_id: string;
  checkout_url: string | null;
}

export interface BillingCustomer {
  customerId: string;
  email: string | null;
  name: string | null;
  metadata: BillingMetadata;
}

export interface BillingSubscription {
  subscriptionId: string;
  productId: string | null;
  status: DodoSubscriptionStatus | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date | null;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerMetadata: BillingMetadata;
  metadata: BillingMetadata;
  raw: unknown;
}

export interface BillingPayment {
  paymentId: string;
  subscriptionId: string | null;
  status: DodoPaymentStatus | null;
  totalAmount: number | null;
  currency: string | null;
  invoiceId: string | null;
  invoiceUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  customerId: string | null;
  customerMetadata: BillingMetadata;
  metadata: BillingMetadata;
  raw: unknown;
}

export interface BillingWebhookEvent {
  id: string;
  type: string;
  occurredAt: string | null;
  data: Record<string, unknown>;
  raw: unknown;
}

interface BillingApiRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

interface CreateBillingCheckoutSessionInput {
  planCode: CheckoutEnabledPlanCode;
  customerId: string;
  returnUrl: string;
  cancelUrl: string;
  metadata: BillingMetadata;
}

export const billingProvider = 'dodo_payments';
export const billingProviderLabel = 'Dodo Payments';
export const billingProviderConfigured = Boolean(env.DODO_PAYMENTS_API_KEY);

export const isCheckoutEnabledForPlan = (planCode: PlanCode): boolean => {
  if (planCode === 'free' || planCode === 'enterprise') {
    return false;
  }

  return Boolean(getCheckoutProductId(planCode));
};

export const getCheckoutProductId = (planCode: CheckoutEnabledPlanCode): string | null =>
  paidPlanProductIds[planCode as DodoCheckoutPlanCode] ?? null;

export const encodeBillingReference = (value: string): string => `${DODO_PROVIDER_PREFIX}${value}`;

export const decodeBillingReference = (value: string | null | undefined): string | null => {
  if (!value || !value.startsWith(DODO_PROVIDER_PREFIX)) {
    return null;
  }

  const decoded = value.slice(DODO_PROVIDER_PREFIX.length).trim();
  return decoded.length > 0 ? decoded : null;
};

export const getPlanCodeForProductId = (productId: string | null | undefined): CheckoutEnabledPlanCode | null => {
  if (!productId) {
    return null;
  }

  const match = (Object.entries(paidPlanProductIds) as Array<[CheckoutEnabledPlanCode, string | undefined]>)
    .find(([, configuredProductId]) => configuredProductId === productId);

  return match?.[0] ?? null;
};

export const createBillingCustomer = async (input: {
  email: string;
  name: string;
  metadata: BillingMetadata;
}): Promise<BillingCustomer> => {
  const customer = await billingApiRequest<DodoCustomerResponse>('/customers', {
    method: 'POST',
    body: {
      email: input.email,
      name: input.name,
      metadata: input.metadata,
    },
  });

  return mapBillingCustomer(customer);
};

export const createBillingCheckoutSession = async (
  input: CreateBillingCheckoutSessionInput,
): Promise<{ sessionId: string; checkoutUrl: string | null }> => {
  const productId = getCheckoutProductId(input.planCode);
  if (!productId) {
    throw new Error(`Plan ${input.planCode} is not configured for ${billingProviderLabel} checkout.`);
  }

  const session = await billingApiRequest<DodoCheckoutSessionResponse>('/checkouts', {
    method: 'POST',
    body: {
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      customer: {
        customer_id: input.customerId,
      },
      billing_currency: 'USD',
      show_saved_payment_methods: true,
      feature_flags: {
        always_create_new_customer: false,
      },
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
    },
  });

  return {
    sessionId: session.session_id,
    checkoutUrl: session.checkout_url,
  };
};

export const retrieveBillingSubscription = async (
  subscriptionId: string,
): Promise<BillingSubscription> => mapBillingSubscription(
  await billingApiRequest<DodoSubscriptionResponse>(`/subscriptions/${encodeURIComponent(subscriptionId)}`),
);

export const listBillingSubscriptionsForCustomer = async (
  customerId: string,
): Promise<BillingSubscription[]> => {
  const response = await billingApiRequest<DodoSubscriptionsListResponse>('/subscriptions', {
    query: {
      customer_id: customerId,
      page_size: 100,
    },
  });

  return (response.items ?? []).map(mapBillingSubscription);
};

export const retrieveBillingPayment = async (paymentId: string): Promise<BillingPayment> => mapBillingPayment(
  await billingApiRequest<DodoPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}`),
);

export const listBillingPaymentsForSubscription = async (
  subscriptionId: string,
): Promise<BillingPayment[]> => {
  const response = await billingApiRequest<DodoPaymentsListResponse>('/payments', {
    query: {
      subscription_id: subscriptionId,
      page_size: 20,
    },
  });

  return (response.items ?? []).map(mapBillingPayment);
};

export const verifyBillingWebhookSignature = (headers: Record<string, unknown>, rawPayload: string): boolean => {
  if (!env.DODO_PAYMENTS_WEBHOOK_SECRET) {
    return false;
  }

  const webhookId = readHeader(headers, 'webhook-id');
  const webhookTimestamp = readHeader(headers, 'webhook-timestamp');
  const webhookSignature = readHeader(headers, 'webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  const signedMessage = `${webhookId}.${webhookTimestamp}.${rawPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', env.DODO_PAYMENTS_WEBHOOK_SECRET)
    .update(signedMessage)
    .digest('base64');

  const candidates = parseSignatureCandidates(webhookSignature);
  return candidates.some((candidate) => timingSafeEqual(candidate, expectedSignature));
};

export const parseBillingWebhookEvent = (
  payload: unknown,
  headers: Record<string, unknown>,
): BillingWebhookEvent => {
  const event = payload as {
    type?: unknown;
    timestamp?: unknown;
    data?: unknown;
  };
  const data =
    event.data && typeof event.data === 'object' && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : {};

  const eventId = readHeader(headers, 'webhook-id');
  if (!eventId || typeof event.type !== 'string' || event.type.trim().length === 0) {
    throw new Error('Invalid billing webhook payload.');
  }

  return {
    id: eventId,
    type: event.type.trim(),
    occurredAt: typeof event.timestamp === 'string' ? event.timestamp : null,
    data,
    raw: payload,
  };
};

const billingApiRequest = async <T>(
  path: string,
  options: BillingApiRequestOptions = {},
): Promise<T> => {
  if (!env.DODO_PAYMENTS_API_KEY) {
    throw new Error(`${billingProviderLabel} is not configured.`);
  }

  const url = new URL(path, getBillingApiBaseUrl());
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const responseText = await response.text();
  const payload = responseText ? safeJsonParse(responseText) : null;
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload) ?? `${billingProviderLabel} request failed (${response.status}).`);
  }

  return payload as T;
};

const getBillingApiBaseUrl = (): string => {
  const environment: DodoEnvironment = env.DODO_PAYMENTS_ENVIRONMENT === 'test' ? 'test' : 'live';
  return environment === 'test' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
};

const mapBillingCustomer = (customer: DodoCustomerResponse): BillingCustomer => ({
  customerId: customer.customer_id,
  email: normalizeNullableString(customer.email),
  name: normalizeNullableString(customer.name),
  metadata: normalizeMetadata(customer.metadata),
});

const mapBillingSubscription = (subscription: DodoSubscriptionResponse): BillingSubscription => ({
  subscriptionId: subscription.subscription_id,
  productId: normalizeNullableString(subscription.product_id),
  status: normalizeNullableString(subscription.status) as DodoSubscriptionStatus | null,
  currentPeriodStart: parseDate(subscription.previous_billing_date),
  currentPeriodEnd: parseDate(subscription.next_billing_date),
  cancelAtPeriodEnd: Boolean(subscription.cancel_at_next_billing_date),
  createdAt: parseDate(subscription.created_at),
  customerId: normalizeNullableString(subscription.customer?.customer_id),
  customerEmail: normalizeNullableString(subscription.customer?.email),
  customerName: normalizeNullableString(subscription.customer?.name),
  customerMetadata: normalizeMetadata(subscription.customer?.metadata),
  metadata: normalizeMetadata(subscription.metadata),
  raw: subscription,
});

const mapBillingPayment = (payment: DodoPaymentResponse): BillingPayment => ({
  paymentId: payment.payment_id,
  subscriptionId: normalizeNullableString(payment.subscription_id),
  status: normalizeNullableString(payment.status) as DodoPaymentStatus | null,
  totalAmount: typeof payment.total_amount === 'number' ? payment.total_amount : null,
  currency: normalizeNullableString(payment.currency),
  invoiceId: normalizeNullableString(payment.invoice_id),
  invoiceUrl: normalizeNullableString(payment.invoice_url),
  createdAt: parseDate(payment.created_at),
  updatedAt: parseDate(payment.updated_at),
  customerId: normalizeNullableString(payment.customer?.customer_id),
  customerMetadata: normalizeMetadata(payment.customer?.metadata),
  metadata: normalizeMetadata(payment.metadata),
  raw: payment,
});

const normalizeMetadata = (value: Record<string, string> | null | undefined): BillingMetadata => {
  if (!value) {
    return {};
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.trim(), typeof entryValue === 'string' ? entryValue.trim() : ''] as const)
    .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0);

  return Object.fromEntries(entries);
};

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractApiErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directMessage = normalizeNullableString(record.message) ?? normalizeNullableString(record.error);
  if (directMessage) {
    return directMessage;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const joined = errors
      .map((error) => {
        if (!error || typeof error !== 'object') {
          return null;
        }

        const errorRecord = error as Record<string, unknown>;
        return normalizeNullableString(errorRecord.message) ?? normalizeNullableString(errorRecord.detail);
      })
      .filter((value): value is string => Boolean(value))
      .join('; ');

    return joined.length > 0 ? joined : null;
  }

  return null;
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
};

const readHeader = (headers: Record<string, unknown>, name: string): string | null => {
  const header = headers[name];
  if (typeof header === 'string') {
    return header.trim() || null;
  }
  if (Array.isArray(header)) {
    const first = header.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof first === 'string' ? first.trim() : null;
  }

  return null;
};

const parseSignatureCandidates = (headerValue: string): string[] => {
  const matches = [...headerValue.matchAll(/v\d+[=,]([A-Za-z0-9+/=_-]+)/g)].map((match) => match[1]);
  if (matches.length > 0) {
    return matches;
  }

  return headerValue
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
