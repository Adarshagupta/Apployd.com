import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transactionMock = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

import {
  getPrismaErrorCode,
  isSerializableRetryableError,
  withSerializableRetry,
} from '../src/lib/transaction-retry.js';

describe('transaction retry utilities', () => {
  beforeEach(() => {
    transactionMock.mockReset();
  });

  it('extracts prisma error code from unknown error objects', () => {
    expect(getPrismaErrorCode({ code: 'P2034' })).toBe('P2034');
    expect(getPrismaErrorCode({ code: 123 })).toBeNull();
    expect(getPrismaErrorCode(new Error('boom'))).toBeNull();
    expect(getPrismaErrorCode(null)).toBeNull();
  });

  it('detects retryable serializable transaction conflicts', () => {
    expect(isSerializableRetryableError({ code: 'P2034' })).toBe(true);
    expect(isSerializableRetryableError({ code: 'P2025' })).toBe(false);
  });

  it('retries serializable conflicts until success', async () => {
    const serializationConflict = { code: 'P2034' };
    transactionMock
      .mockRejectedValueOnce(serializationConflict)
      .mockResolvedValueOnce('ok');

    const result = await withSerializableRetry(async () => 'unused', {
      maxAttempts: 3,
      backoffMs: 0,
    });

    expect(result).toBe('ok');
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(transactionMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('throws once retry attempts are exhausted', async () => {
    const serializationConflict = { code: 'P2034' };
    transactionMock.mockRejectedValue(serializationConflict);

    await expect(
      withSerializableRetry(async () => 'unused', {
        maxAttempts: 2,
        backoffMs: 0,
      }),
    ).rejects.toEqual(serializationConflict);
    expect(transactionMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-serializable errors', async () => {
    const failure = new Error('database unavailable');
    transactionMock.mockRejectedValue(failure);

    await expect(
      withSerializableRetry(async () => 'unused', {
        maxAttempts: 5,
        backoffMs: 0,
      }),
    ).rejects.toThrow('database unavailable');
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
