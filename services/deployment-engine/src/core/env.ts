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

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BASE_DOMAIN: z.string().min(3),
  PREVIEW_BASE_DOMAIN: z.string().min(3).optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  NGINX_SITES_PATH: z.string().default('/etc/nginx/sites-enabled'),
  NGINX_TEMPLATE_PATH: z.string().optional(),
  CERTBOT_EMAIL: z.string().email().optional(),
  ENGINE_REGION: z.string().default('fsn1'),
  ENGINE_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9102),
  ENGINE_LOCAL_MODE: booleanFromEnv.optional(),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  PREVIEW_BASE_DOMAIN: parsed.PREVIEW_BASE_DOMAIN ?? parsed.BASE_DOMAIN,
  ENGINE_LOCAL_MODE: parsed.ENGINE_LOCAL_MODE ?? parsed.NODE_ENV !== 'production',
};
