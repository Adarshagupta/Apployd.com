import Fastify from 'fastify';

import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';

import { env } from './config/env.js';
import { authRoutes } from './modules/auth/routes.js';
import { billingRoutes } from './modules/billing/routes.js';
import { deploymentRoutes } from './modules/deployments/routes.js';
import { domainRoutes } from './modules/domains/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { githubIntegrationRoutes } from './modules/integrations/github-routes.js';
import { logRoutes } from './modules/logs/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { metricRoutes } from './modules/metrics/routes.js';
import { observabilityRoutes } from './modules/metrics/prometheus-routes.js';
import { organizationRoutes } from './modules/organizations/routes.js';
import { planRoutes } from './modules/plans/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { secretRoutes } from './modules/secrets/routes.js';
import { serverRoutes } from './modules/servers/routes.js';
import { teamRoutes } from './modules/teams/routes.js';
import { usageRoutes } from './modules/usage/routes.js';
import { instrumentHttpRequest } from './lib/observability.js';
import authenticatePlugin from './plugins/authenticate.js';
import { deploymentWebsocketRoutes } from './websocket/deployment-events.js';

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  app.register(cors, {
    origin: true,
    credentials: true,
  });
  app.register(sensible);
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });
  app.register(websocket);
  app.register(authenticatePlugin);

  app.addContentTypeParser(/^application\/json(?:;.*)?$/, { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer;
    if (!body.length) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.addHook('onRequest', (request, _reply, done) => {
    (request as typeof request & { startTimeNs?: bigint }).startTimeNs = process.hrtime.bigint();
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const startTime =
      (request as typeof request & { startTimeNs?: bigint }).startTimeNs ?? process.hrtime.bigint();
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;

    instrumentHttpRequest({
      method: request.method,
      route: request.routeOptions.url ?? 'unknown',
      statusCode: reply.statusCode,
      durationSeconds,
    });
    done();
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error({ error }, 'Unhandled error');
    const err = error as any;
    return reply.status(err.statusCode ?? 500).send({
      error: err.name ?? 'Error',
      message: err.message ?? 'An error occurred',
    });
  });

  app.register(healthRoutes);
  app.register(observabilityRoutes);

  app.register(async (api) => {
    api.register(authRoutes);
    api.register(organizationRoutes);
    api.register(teamRoutes);
    api.register(planRoutes);
    api.register(projectRoutes);
    api.register(secretRoutes);
    api.register(deploymentRoutes);
    api.register(domainRoutes);
    api.register(usageRoutes);
    api.register(logRoutes);
    api.register(auditRoutes);
    api.register(metricRoutes);
    api.register(serverRoutes);
    api.register(billingRoutes);
    api.register(githubIntegrationRoutes);
  }, { prefix: '/api/v1' });

  app.register(deploymentWebsocketRoutes);

  return app;
};
