import 'dotenv/config';

import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return value;
}, z.boolean());

const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalEmail = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().email().optional());

const optionalCsvUrls = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return values.length > 0 ? values : undefined;
}, z.array(z.string().url()).optional());

const optionalCsvEmails = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const values = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return values.length > 0 ? values : undefined;
}, z.array(z.string().email()).optional());

const optionalCsvDomains = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const values = value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);

    return values.length > 0 ? values : undefined;
  },
  z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).optional(),
);

const countryCode = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : undefined;
}, z.string().regex(/^[A-Z]{2}$/).default('US'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  JWT_SECRET: z.string().min(16),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(['test', 'live']).default('test'),
  DODO_PAYMENTS_DEFAULT_COUNTRY: countryCode,
  DODO_PAYMENTS_PRODUCT_ID_DEV: optionalString,
  DODO_PAYMENTS_PRODUCT_ID_PRO: optionalString,
  DODO_PAYMENTS_PRODUCT_ID_MAX: optionalString,
  DODO_PAYMENTS_PRODUCT_ID_AGENT_STARTER: optionalString,
  DODO_PAYMENTS_PRODUCT_ID_AGENT_GROWTH: optionalString,
  DODO_PAYMENTS_PRODUCT_ID_AGENT_SCALE: optionalString,
  DODO_PAYMENTS_ADDON_ID_DATABASE_STARTER: optionalString,
  DODO_PAYMENTS_ADDON_ID_DATABASE_GROWTH: optionalString,
  DODO_PAYMENTS_ADDON_ID_DATABASE_SCALE: optionalString,
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromEnv.optional(),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM_EMAIL: optionalEmail,
  SMTP_FROM_NAME: optionalString.default('Apployd'),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  EMAIL_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().default(''),
  VERCEL_CLIENT_ID: optionalString,
  VERCEL_CLIENT_SECRET: optionalString,
  VERCEL_OAUTH_REDIRECT_URI: z.string().url().optional(),
  VERCEL_ACCESS_TOKEN: optionalString,
  NEON_API_KEY: optionalString,
  NEON_API_BASE_URL: z.string().url().default('https://console.neon.tech/api/v2'),
  NEON_DEFAULT_REGION: z.string().default('aws-us-east-1'),
  DASHBOARD_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ALLOWED_ORIGINS: optionalCsvUrls,
  PLATFORM_ADMIN_EMAILS: optionalCsvEmails,
  ENCRYPTION_KEY: z.string().min(32),
  METRICS_AUTH_TOKEN: optionalString,
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  INVITE_ALLOWED_EMAIL_DOMAINS: optionalCsvDomains,
  INVITE_WEBHOOK_TOKEN: optionalString,
  INVITE_REMINDER_ENABLED: booleanFromEnv.optional(),
  INVITE_REMINDER_DELAY_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  INVITE_REMINDER_INTERVAL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  INVITE_MAX_REMINDERS: z.coerce.number().int().min(0).max(20).default(2),
  INVITE_MAINTENANCE_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  BASE_DOMAIN: z.string().min(3),
  PREVIEW_BASE_DOMAIN: z.string().min(3).optional(),
  PREVIEW_DOMAIN_STYLE: z.enum(['project', 'project_ref']).default('project_ref'),
  DEFAULT_REGION: z.string().default('fsn1'),
  ALLOW_PRIVATE_GIT_HOSTS: booleanFromEnv.optional(),
  ALLOW_RISKY_DEPLOYMENT_COMMANDS: booleanFromEnv.optional(),
  AUTO_PROVISION_DEV_SERVER: booleanFromEnv.optional(),
  DEV_SERVER_NAME: z.string().min(2).default('local-dev-1'),
  DEV_SERVER_IPV4: z.string().ip({ version: 'v4' }).default('127.0.0.1'),
  DEV_SERVER_TOTAL_RAM_MB: z.coerce.number().int().min(128).default(8192),
  DEV_SERVER_TOTAL_CPU_MILLICORES: z.coerce.number().int().min(100).default(4000),
  DEV_SERVER_TOTAL_BANDWIDTH_GB: z.coerce.number().int().min(1).default(1000),
  EDGE_WAKE_TOKEN: optionalString,
  EDGE_WAKE_RETRY_SECONDS: z.coerce.number().int().min(1).max(60).default(5),
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_CODEX_MODEL: z.string().min(1).default('gpt-5.2-codex'),
});

const parsedEnv = envSchema.parse(process.env);
const defaultCorsOrigins = (() => {
  try {
    return [new URL(parsedEnv.DASHBOARD_BASE_URL).origin];
  } catch {
    return [] as string[];
  }
})();

export const env = {
  ...parsedEnv,
  SMTP_SECURE: parsedEnv.SMTP_SECURE ?? parsedEnv.SMTP_PORT === 465,
  PREVIEW_BASE_DOMAIN: parsedEnv.PREVIEW_BASE_DOMAIN ?? parsedEnv.BASE_DOMAIN,
  CORS_ALLOWED_ORIGINS: parsedEnv.CORS_ALLOWED_ORIGINS ?? defaultCorsOrigins,
  PLATFORM_ADMIN_EMAILS: parsedEnv.PLATFORM_ADMIN_EMAILS ?? [],
  INVITE_ALLOWED_EMAIL_DOMAINS: parsedEnv.INVITE_ALLOWED_EMAIL_DOMAINS ?? [],
  INVITE_REMINDER_ENABLED: parsedEnv.INVITE_REMINDER_ENABLED ?? true,
  ALLOW_PRIVATE_GIT_HOSTS: parsedEnv.ALLOW_PRIVATE_GIT_HOSTS ?? false,
  ALLOW_RISKY_DEPLOYMENT_COMMANDS: parsedEnv.ALLOW_RISKY_DEPLOYMENT_COMMANDS ?? false,
  AUTO_PROVISION_DEV_SERVER:
    parsedEnv.AUTO_PROVISION_DEV_SERVER ?? parsedEnv.NODE_ENV !== 'production',
};
