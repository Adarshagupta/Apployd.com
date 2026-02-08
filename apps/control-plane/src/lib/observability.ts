import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'apployd_control_' });

const requestDuration = new client.Histogram({
  name: 'apployd_control_http_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.03, 0.06, 0.1, 0.2, 0.5, 1, 2, 5],
});

const requestCounter = new client.Counter({
  name: 'apployd_control_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const metricsRegistry = client.register;

export const instrumentHttpRequest = (input: {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}) => {
  const labels = {
    method: input.method,
    route: input.route,
    status_code: String(input.statusCode),
  };

  requestDuration.observe(labels, input.durationSeconds);
  requestCounter.inc(labels, 1);
};
