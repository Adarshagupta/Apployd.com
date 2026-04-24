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

const optionalCsvPorts = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const values = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 65535);

  return values.length > 0 ? values : undefined;
}, z.array(z.number().int().min(1).max(65535)).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DASHBOARD_BASE_URL: z.string().url().default('http://localhost:3000'),
  BASE_DOMAIN: z.string().min(3),
  PREVIEW_BASE_DOMAIN: z.string().min(3).optional(),
  ENGINE_PUBLIC_IPV4: z.string().ip({ version: 'v4' }).optional(),
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
  ENGINE_BUILD_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(7200).default(1800),
  ENGINE_LOCAL_MODE: booleanFromEnv.optional(),
  ENGINE_CONTAINER_READ_ONLY: booleanFromEnv.optional(),
  ENGINE_SECURITY_MODE: z.enum(['off', 'monitor', 'strict', 'lockdown']).optional(),
  ENGINE_SECURITY_AUTO_BLOCK: booleanFromEnv.optional(),
  ENGINE_SECURITY_ALLOW_PRIVATE_EGRESS: booleanFromEnv.optional(),
  ENGINE_EGRESS_ALLOWED_TCP_PORTS: optionalCsvPorts,
  ENGINE_EGRESS_ALLOWED_UDP_PORTS: optionalCsvPorts,
  ENGINE_EGRESS_BLOCKED_TCP_PORTS: optionalCsvPorts,
  ENGINE_EGRESS_BLOCKED_UDP_PORTS: optionalCsvPorts,
  ENGINE_SECURITY_MAX_DISTINCT_REMOTE_PORTS: z.coerce.number().int().min(1).max(1024).default(8),
  ENGINE_SECURITY_MAX_DISTINCT_REMOTE_HOSTS: z.coerce.number().int().min(1).max(10000).default(80),
  ENGINE_SECURITY_MAX_SYN_SENT_CONNECTIONS: z.coerce.number().int().min(1).max(10000).default(30),
  CONTROL_PLANE_INTERNAL_URL: z.string().url().default('http://127.0.0.1:4000'),
  EDGE_WAKE_TOKEN: optionalString,
  EDGE_WAKE_ENABLED: booleanFromEnv.optional(),
});

const parsed = schema.parse(process.env);

const normalizePorts = (ports: number[]): number[] =>
  Array.from(new Set(ports))
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535)
    .sort((a, b) => a - b);

export const env = {
  ...parsed,
  SMTP_SECURE: parsed.SMTP_SECURE ?? parsed.SMTP_PORT === 465,
  PREVIEW_BASE_DOMAIN: parsed.PREVIEW_BASE_DOMAIN ?? parsed.BASE_DOMAIN,
  ENGINE_LOCAL_MODE: parsed.ENGINE_LOCAL_MODE ?? parsed.NODE_ENV !== 'production',
  ENGINE_CONTAINER_READ_ONLY: parsed.ENGINE_CONTAINER_READ_ONLY ?? false,
  ENGINE_SECURITY_MODE:
    parsed.ENGINE_SECURITY_MODE ?? (parsed.NODE_ENV === 'production' ? 'strict' : 'monitor'),
  ENGINE_SECURITY_AUTO_BLOCK: parsed.ENGINE_SECURITY_AUTO_BLOCK ?? true,
  ENGINE_SECURITY_ALLOW_PRIVATE_EGRESS: parsed.ENGINE_SECURITY_ALLOW_PRIVATE_EGRESS ?? true,
  ENGINE_EGRESS_ALLOWED_TCP_PORTS: normalizePorts(parsed.ENGINE_EGRESS_ALLOWED_TCP_PORTS ?? [80, 443]),
  ENGINE_EGRESS_ALLOWED_UDP_PORTS: normalizePorts(parsed.ENGINE_EGRESS_ALLOWED_UDP_PORTS ?? [53, 123]),
  ENGINE_EGRESS_BLOCKED_TCP_PORTS: normalizePorts(
    parsed.ENGINE_EGRESS_BLOCKED_TCP_PORTS ?? [21, 22, 23, 25, 69, 445, 1433, 3306, 3389, 5432, 6379, 8080, 11211],
  ),
  ENGINE_EGRESS_BLOCKED_UDP_PORTS: normalizePorts(parsed.ENGINE_EGRESS_BLOCKED_UDP_PORTS ?? [19, 161]),
  EDGE_WAKE_ENABLED: parsed.EDGE_WAKE_ENABLED ?? true,
};
