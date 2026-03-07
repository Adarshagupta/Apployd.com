import { prisma } from './prisma.js';
import { env } from './env.js';
import { runHostCommand } from './run-host-command.js';

const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const ROUTE_SRC_PATTERN = /\bsrc\s+((?:\d{1,3}\.){3}\d{1,3})\b/;

const toIpv4Octets = (value: string): number[] | null => {
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
};

export const isPublicIpv4 = (value: string): boolean => {
  const octets = toIpv4Octets(value);
  if (!octets) {
    return false;
  }

  const a = octets[0]!;
  const b = octets[1]!;

  if (a === 0 || a === 10 || a === 127) {
    return false;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return false;
  }
  if (a === 169 && b === 254) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 192 && b === 168) {
    return false;
  }
  if (a >= 224) {
    return false;
  }

  return true;
};

export const pickPublicIpv4 = (rawOutput: string): string | null => {
  const routeMatch = rawOutput.match(ROUTE_SRC_PATTERN);
  if (routeMatch?.[1] && isPublicIpv4(routeMatch[1])) {
    return routeMatch[1];
  }

  const matches = rawOutput.match(IPV4_PATTERN) ?? [];
  for (const match of matches) {
    if (isPublicIpv4(match)) {
      return match;
    }
  }

  return null;
};

const detectHostPublicIpv4 = async (): Promise<string | null> => {
  const command = [
    'if command -v ip >/dev/null 2>&1; then',
    '  ip -4 route get 1.1.1.1 2>/dev/null || true',
    'fi',
    'if command -v hostname >/dev/null 2>&1; then',
    '  hostname -I 2>/dev/null || true',
    'fi',
  ].join('\n');

  try {
    const rawOutput = await runHostCommand(command);
    return pickPublicIpv4(rawOutput);
  } catch {
    return null;
  }
};

export const resolveDnsTargetIpv4 = async (input: {
  serverId: string;
  recordedIpv4: string;
  onLog?: (line: string) => void;
}): Promise<string> => {
  const configuredIpv4 = env.ENGINE_PUBLIC_IPV4;
  const detectedIpv4 = configuredIpv4 ?? await detectHostPublicIpv4();
  const effectiveIpv4 = detectedIpv4 ?? input.recordedIpv4;

  if (effectiveIpv4 !== input.recordedIpv4) {
    input.onLog?.(`Using server IP ${effectiveIpv4} for DNS (server record was ${input.recordedIpv4})`);

    await prisma.server.update({
      where: { id: input.serverId },
      data: { ipv4: effectiveIpv4 },
    }).catch((error) => {
      input.onLog?.(`Warning: failed to sync server IPv4 to ${effectiveIpv4}: ${(error as Error).message}`);
    });
  }

  return effectiveIpv4;
};
