import type { FastifyPluginAsync } from 'fastify';

import { env } from '../../config/env.js';
import { metricsRegistry } from '../../lib/observability.js';

const normalizeRemoteIp = (value: string): string => {
  const first = value.split(',')[0]?.trim() ?? '';
  if (!first) {
    return '';
  }

  if (first.startsWith('::ffff:')) {
    return first.slice(7);
  }

  return first;
};

const isLoopbackIp = (value: string): boolean => {
  const ip = normalizeRemoteIp(value).toLowerCase();
  return ip === '127.0.0.1' || ip === '::1';
};

const getBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) {
    return null;
  }
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

export const observabilityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (request, reply) => {
    const loopbackSource = isLoopbackIp(request.ip);
    const bearerToken = getBearerToken(
      typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined,
    );
    const tokenConfigured = Boolean(env.METRICS_AUTH_TOKEN);
    const tokenMatches = tokenConfigured && bearerToken === env.METRICS_AUTH_TOKEN;

    if (tokenConfigured && !tokenMatches) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (!tokenConfigured && env.NODE_ENV === 'production' && !loopbackSource) {
      return reply.code(503).send({
        error: 'Misconfigured',
        message: 'Set METRICS_AUTH_TOKEN to allow non-loopback metrics access in production.',
      });
    }

    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
};
