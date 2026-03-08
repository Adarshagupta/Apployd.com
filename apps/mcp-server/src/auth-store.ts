import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

const sessionSchema = z.object({
  token: z.string().min(1),
  apiBaseUrl: z.string().url(),
  defaultOrganizationId: z.string().cuid().optional(),
  user: z
    .object({
      id: z.string().cuid(),
      email: z.string().email(),
      name: z.string().nullable().optional(),
    })
    .optional(),
  savedAt: z.string(),
});

export type StoredSession = z.infer<typeof sessionSchema>;

const configRoot = (): string => {
  const explicit = process.env.APPLOYD_CONFIG_DIR?.trim();
  if (explicit) {
    return explicit;
  }

  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Apployd');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'apployd');
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'apployd');
};

export const authStorePath = (): string => path.join(configRoot(), 'mcp-auth.json');

export const readStoredSession = async (): Promise<StoredSession | null> => {
  try {
    const raw = await readFile(authStorePath(), 'utf8');
    return sessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeStoredSession = async (session: StoredSession): Promise<void> => {
  const filePath = authStorePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(filePath, 0o600).catch(() => undefined);
};

export const clearStoredSession = async (): Promise<void> => {
  await rm(authStorePath(), { force: true });
};
