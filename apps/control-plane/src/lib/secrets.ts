import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { env } from '../config/env.js';

const algorithm = 'aes-256-gcm';

const key = Buffer.from(env.ENCRYPTION_KEY, 'utf8').subarray(0, 32);

export interface EncryptedPayload {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export const encryptSecret = (value: string): EncryptedPayload => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

export const decryptSecret = (payload: EncryptedPayload): string => {
  const decipher = createDecipheriv(algorithm, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedValue, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};
