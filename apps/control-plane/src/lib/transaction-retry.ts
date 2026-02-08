import { Prisma } from '@prisma/client';
import { setTimeout as sleep } from 'timers/promises';

import { prisma } from './prisma.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_MS = 20;
const SERIALIZATION_FAILURE_CODE = 'P2034';

interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
}

interface ErrorWithCode {
  code?: unknown;
}

export function getPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const { code } = error as ErrorWithCode;
  return typeof code === 'string' ? code : null;
}

export function isSerializableRetryableError(error: unknown): boolean {
  return getPrismaErrorCode(error) === SERIALIZATION_FAILURE_CODE;
}

export async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const shouldRetry = isSerializableRetryableError(error) && attempt < maxAttempts;
      if (!shouldRetry) {
        throw error;
      }

      await sleep(backoffMs * attempt);
    }
  }

  throw new Error('Serializable transaction retry exhausted unexpectedly.');
}
