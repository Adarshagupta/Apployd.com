import { Redis } from 'ioredis';

import { env } from '../config/env.js';

const redisGlobal = globalThis as unknown as { redis?: any };

export const redis =
  redisGlobal.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 5,
    enableAutoPipelining: true,
    lazyConnect: false,
  });

if (env.NODE_ENV !== 'production') {
  redisGlobal.redis = redis;
}
