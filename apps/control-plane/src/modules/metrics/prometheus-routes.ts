import type { FastifyPluginAsync } from 'fastify';

import { metricsRegistry } from '../../lib/observability.js';

export const observabilityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
};
