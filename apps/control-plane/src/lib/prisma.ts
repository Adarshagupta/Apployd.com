import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';

const prismaGlobal = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  prismaGlobal.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  prismaGlobal.prisma = prisma;
}
