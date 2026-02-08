export interface DockerStatsEntry {
  containerId: string;
  name: string;
  cpuPercent: number;
  memUsageMb: number;
  netInputBytes: number;
  netOutputBytes: number;
}

const SI_BYTE_MULTIPLIERS: Record<string, number> = {
  B: 1,
  KB: 1e3,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
  PB: 1e15,
};

const IEC_BYTE_MULTIPLIERS: Record<string, number> = {
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
  PIB: 1024 ** 5,
};

export function parseByteSizeToBytes(rawValue: string): number {
  const match = rawValue.trim().match(/^([\d.,]+)\s*([A-Za-z]+)$/);
  if (!match) {
    return 0;
  }

  const rawNumeric = match[1];
  const rawUnit = match[2];
  if (!rawNumeric || !rawUnit) {
    return 0;
  }

  const numeric = Number.parseFloat(rawNumeric.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  const unit = rawUnit.toUpperCase();
  const multiplier = IEC_BYTE_MULTIPLIERS[unit] ?? SI_BYTE_MULTIPLIERS[unit];
  if (!multiplier) {
    return 0;
  }

  return numeric * multiplier;
}

export function parseCpuPercent(rawValue: string): number {
  const value = Number.parseFloat(rawValue.replace('%', '').trim());
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

export function parseMemoryUsageToMb(rawValue: string): number {
  const usagePart = rawValue.split('/')[0]?.trim() ?? '';
  const bytes = parseByteSizeToBytes(usagePart);
  if (bytes <= 0) {
    return 0;
  }
  return bytes / (1024 * 1024);
}

export function parseNetworkIoToBytes(
  rawValue: string,
): {
  inputBytes: number;
  outputBytes: number;
} {
  const [input = '0B', output = '0B'] = rawValue.split('/').map((part) => part.trim());
  return {
    inputBytes: parseByteSizeToBytes(input),
    outputBytes: parseByteSizeToBytes(output),
  };
}

export function parseDockerStatsOutput(
  stdout: string,
  containerNamePrefix = 'apployd-',
): DockerStatsEntry[] {
  if (!stdout.trim()) {
    return [];
  }

  const entries: DockerStatsEntry[] = [];

  for (const rawLine of stdout.trim().split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parts = line.split('|');
    if (parts.length < 5) {
      continue;
    }

    const containerId = parts[0]?.trim() ?? '';
    const name = parts[1]?.trim() ?? '';
    const cpuRaw = parts[2] ?? '';
    const memRaw = parts[3] ?? '';
    const netRaw = parts[4] ?? '';

    if (!containerId || !name) {
      continue;
    }

    if (!name.startsWith(containerNamePrefix)) {
      continue;
    }

    const network = parseNetworkIoToBytes(netRaw);
    entries.push({
      containerId: containerId.trim(),
      name,
      cpuPercent: parseCpuPercent(cpuRaw),
      memUsageMb: parseMemoryUsageToMb(memRaw),
      netInputBytes: network.inputBytes,
      netOutputBytes: network.outputBytes,
    });
  }

  return entries;
}

export function resolveIntervalSeconds(
  previousCollectionStartedAtMs: number | null,
  currentCollectionStartedAtMs: number,
  defaultIntervalSeconds: number,
): number {
  if (previousCollectionStartedAtMs === null) {
    return defaultIntervalSeconds;
  }

  const elapsedSeconds = (currentCollectionStartedAtMs - previousCollectionStartedAtMs) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return defaultIntervalSeconds;
  }

  return Math.max(1, elapsedSeconds);
}
