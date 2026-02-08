import { PrismaClient } from '@prisma/client';

import { env } from './env.js';

export const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
