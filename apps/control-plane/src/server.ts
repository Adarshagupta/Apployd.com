import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { ensureDevelopmentServer } from './services/dev-server-bootstrap-service.js';
import { seedPlans } from './services/plan-seed-service.js';
import { SleepService } from './services/sleep-service.js';

const start = async () => {
  const app = buildApp();

  await seedPlans();
  const disabledSleepProjects = await prisma.project.updateMany({
    where: { sleepEnabled: true },
    data: { sleepEnabled: false },
  });
  if (disabledSleepProjects.count > 0) {
    app.log.info({ projects: disabledSleepProjects.count }, 'Disabled project sleep mode globally');
  }
  const sleepService = new SleepService();
  const wakeQueued = await sleepService.wakeSleepingActiveContainers();
  if (wakeQueued > 0) {
    app.log.info({ containers: wakeQueued }, 'Queued wake actions for sleeping active containers');
  }

  const bootstrap = await ensureDevelopmentServer();
  if (bootstrap.ensured) {
    app.log.info(
      { serverName: bootstrap.serverName, region: env.DEFAULT_REGION },
      'Ensured development server in scheduler pool',
    );
  } else if (bootstrap.reason) {
    app.log.debug({ reason: bootstrap.reason }, 'Skipped development server bootstrap');
  }

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
