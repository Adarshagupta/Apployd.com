import { createServer } from 'http';

import { env } from './core/env.js';
import { prisma } from './core/prisma.js';
import { redis } from './core/redis.js';
import { metricsRegistry } from './monitoring/metrics.js';
import { startStatsCollector } from './monitoring/stats-collector.js';
import { ContainerActionConsumer } from './queue/container-action-consumer.js';
import { DeployQueueConsumer } from './queue/deploy-consumer.js';

const heartbeatKey = `apployd:engine:heartbeat:${env.ENGINE_REGION}:${process.pid}`;

const startMetricsServer = () => {
  const server = createServer(async (_req, res) => {
    if (!_req.url || !_req.url.startsWith('/metrics')) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(
        `Metrics port ${env.ENGINE_METRICS_PORT} already in use, continuing without /metrics endpoint`,
      );
      return;
    }

    console.error('Metrics server failed', error);
  });

  server.listen(env.ENGINE_METRICS_PORT, '0.0.0.0', () => {
    console.log(`Metrics server listening on :${env.ENGINE_METRICS_PORT}`);
  });
};

const publishHeartbeat = async () => {
  await redis.set(
    heartbeatKey,
    JSON.stringify({
      region: env.ENGINE_REGION,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    }),
    'EX',
    20,
  );
};

const start = async () => {
  await prisma.$connect();
  await redis.ping();
  await publishHeartbeat();

  startMetricsServer();

  const consumer = new DeployQueueConsumer();
  const containerActionConsumer = new ContainerActionConsumer();
  startStatsCollector();
  console.log(`Deployment engine started in region ${env.ENGINE_REGION}`);

  const heartbeatInterval = setInterval(() => {
    publishHeartbeat().catch((error) => {
      console.error('Engine heartbeat failed', error);
    });
  }, 5_000);
  heartbeatInterval.unref();

  await Promise.all([consumer.run(), containerActionConsumer.run()]);
};

start().catch(async (error) => {
  console.error(error);
  await redis.del(heartbeatKey).catch(() => undefined);
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(1);
});

process.on('SIGINT', () => {
  redis.del(heartbeatKey).catch(() => undefined);
});

process.on('SIGTERM', () => {
  redis.del(heartbeatKey).catch(() => undefined);
});
