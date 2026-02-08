import { buildApp } from './app.js';
import { env } from './config/env.js';
import { ensureDevelopmentServer } from './services/dev-server-bootstrap-service.js';
import { seedPlans } from './services/plan-seed-service.js';
import { SleepService } from './services/sleep-service.js';

const start = async () => {
  const app = buildApp();

  await seedPlans();
  const bootstrap = await ensureDevelopmentServer();
  if (bootstrap.ensured) {
    app.log.info(
      { serverName: bootstrap.serverName, region: env.DEFAULT_REGION },
      'Ensured development server in scheduler pool',
    );
  } else if (bootstrap.reason) {
    app.log.debug({ reason: bootstrap.reason }, 'Skipped development server bootstrap');
  }

  const sleepService = new SleepService();
  setInterval(async () => {
    try {
      const slept = await sleepService.markIdleFreeTierContainersSleeping();
      if (slept > 0) {
        app.log.info({ slept }, 'Marked idle free-tier containers as sleeping');
      }
    } catch (error) {
      app.log.error({ error }, 'Sleep sweep failed');
    }
  }, 60_000);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
