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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  JWT_SECRET: z.string().min(16),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().default(''),
  DASHBOARD_BASE_URL: z.string().url().default('http://localhost:3000'),
  ENCRYPTION_KEY: z.string().min(32),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  BASE_DOMAIN: z.string().min(3),
  PREVIEW_BASE_DOMAIN: z.string().min(3).optional(),
  DEFAULT_REGION: z.string().default('fsn1'),
  AUTO_PROVISION_DEV_SERVER: booleanFromEnv.optional(),
  DEV_SERVER_NAME: z.string().min(2).default('local-dev-1'),
  DEV_SERVER_IPV4: z.string().ip({ version: 'v4' }).default('127.0.0.1'),
  DEV_SERVER_TOTAL_RAM_MB: z.coerce.number().int().min(128).default(8192),
  DEV_SERVER_TOTAL_CPU_MILLICORES: z.coerce.number().int().min(100).default(4000),
  DEV_SERVER_TOTAL_BANDWIDTH_GB: z.coerce.number().int().min(1).default(1000),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  PREVIEW_BASE_DOMAIN: parsedEnv.PREVIEW_BASE_DOMAIN ?? parsedEnv.BASE_DOMAIN,
  AUTO_PROVISION_DEV_SERVER:
    parsedEnv.AUTO_PROVISION_DEV_SERVER ?? parsedEnv.NODE_ENV !== 'production',
};
