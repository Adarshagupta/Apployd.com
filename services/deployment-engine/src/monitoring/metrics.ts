import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'apployd_engine_' });

export const deploymentProcessedCounter = new client.Counter({
  name: 'apployd_engine_deployment_processed_total',
  help: 'Total deployments processed by status',
  labelNames: ['status'],
});

export const deploymentDurationHistogram = new client.Histogram({
  name: 'apployd_engine_deployment_duration_seconds',
  help: 'Duration of deployment pipeline',
  buckets: [1, 3, 5, 10, 20, 30, 60, 120],
});

export const metricsRegistry = client.register;
