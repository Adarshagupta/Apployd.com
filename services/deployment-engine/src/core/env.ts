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

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DASHBOARD_BASE_URL: z.string().url().default('http://localhost:3000'),
  BASE_DOMAIN: z.string().min(3),
  PREVIEW_BASE_DOMAIN: z.string().min(3).optional(),
  PREVIEW_DOMAIN_STYLE: z.enum(['project', 'project_ref']).default('project_ref'),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromEnv.optional(),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM_EMAIL: optionalEmail,
  SMTP_FROM_NAME: optionalString.default('Apployd'),
  NGINX_SITES_PATH: z.string().default('/etc/nginx/sites-enabled'),
  NGINX_TEMPLATE_PATH: z.string().optional(),
  CERTBOT_EMAIL: z.string().email().optional(),
  ENGINE_REGION: z.string().default('fsn1'),
  ENGINE_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9102),
  ENGINE_HEALTHCHECK_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
  ENGINE_HEALTHCHECK_DELAY_MS: z.coerce.number().int().min(250).max(5000).default(1000),
  ENGINE_LOCAL_MODE: booleanFromEnv.optional(),
  ENGINE_CONTAINER_READ_ONLY: booleanFromEnv.optional(),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  SMTP_SECURE: parsed.SMTP_SECURE ?? parsed.SMTP_PORT === 465,
  PREVIEW_BASE_DOMAIN: parsed.PREVIEW_BASE_DOMAIN ?? parsed.BASE_DOMAIN,
  ENGINE_LOCAL_MODE: parsed.ENGINE_LOCAL_MODE ?? parsed.NODE_ENV !== 'production',
  ENGINE_CONTAINER_READ_ONLY: parsed.ENGINE_CONTAINER_READ_ONLY ?? false,
};
