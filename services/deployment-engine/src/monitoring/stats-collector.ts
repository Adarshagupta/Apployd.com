/**
 * Container Stats Collector
 *
 * Periodically polls `docker stats` for all running Apployd containers,
 * then writes UsageRecord rows (CPU, RAM, Bandwidth) to the database.
 *
 * Runs as a background loop inside the deployment engine.
 */
import { exec } from 'child_process';

import { prisma } from '../core/prisma.js';
import {
  parseDockerStatsOutput,
  resolveIntervalSeconds,
  type DockerStatsEntry,
} from './stats-utils.js';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const INITIAL_DELAY_MS = 5_000;
const MAX_TRACKED_NET_CONTAINERS = 10_000;
const MAX_TRACKED_OWNERSHIP_CONTAINERS = 10_000;
const OWNERSHIP_CACHE_TTL_MS = 5 * 60_000;
const OWNERSHIP_NEGATIVE_CACHE_TTL_MS = POLL_INTERVAL_MS;

interface ContainerOwnership {
  organizationId: string;
  subscriptionId: string;
  projectId: string;
}

interface OwnershipCacheEntry {
  value: ContainerOwnership | null;
  expiresAtMs: number;
}

/**
 * Runs `docker stats --no-stream` and parses the output.
 * Returns stats for all containers matching the apployd- prefix.
 */
function collectDockerStats(): Promise<DockerStatsEntry[]> {
  return new Promise((resolve) => {
    exec(
      'docker stats --no-stream --format "{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"',
      { timeout: 15_000 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }

        resolve(parseDockerStatsOutput(stdout));
      },
    );
  });
}

/**
 * Resolves a docker container name (apployd-<deploymentId>) back to
 * the Prisma records we need: organizationId, subscriptionId, projectId.
 */
async function resolveContainerOwnership(dockerContainerId: string): Promise<ContainerOwnership | null> {
  // Container.dockerContainerId stores the full hash from `docker run -d`
  // `docker stats` returns a short 12-char prefix
  const container = await prisma.container.findFirst({
    where: {
      dockerContainerId: { startsWith: dockerContainerId.slice(0, 12) },
      status: 'running',
    },
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          organizationId: true,
          organization: {
            select: {
              subscriptions: {
                where: { status: { in: ['active', 'trialing'] } },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!container) return null;

  const subscription = container.project.organization.subscriptions[0];
  if (!subscription) return null;

  return {
    organizationId: container.project.organizationId,
    subscriptionId: subscription.id,
    projectId: container.projectId,
  };
}

// Track previous network bytes per container to compute deltas.
const prevNetBytes = new Map<string, { rx: number; tx: number }>();
const ownershipCache = new Map<string, OwnershipCacheEntry>();
let lastCollectionStartedAtMs: number | null = null;

function pruneMapToMaxEntries<T>(map: Map<string, T>, maxEntries: number): void {
  if (map.size <= maxEntries) {
    return;
  }

  const staleIds = [...map.keys()].slice(0, map.size - maxEntries);
  for (const containerId of staleIds) {
    map.delete(containerId);
  }
}

async function resolveContainerOwnershipCached(
  dockerContainerId: string,
): Promise<ContainerOwnership | null> {
  const nowMs = Date.now();
  const cached = ownershipCache.get(dockerContainerId);
  if (cached && cached.expiresAtMs > nowMs) {
    return cached.value;
  }

  const value = await resolveContainerOwnership(dockerContainerId);
  ownershipCache.set(dockerContainerId, {
    value,
    expiresAtMs: nowMs + (value ? OWNERSHIP_CACHE_TTL_MS : OWNERSHIP_NEGATIVE_CACHE_TTL_MS),
  });
  return value;
}

/**
 * One collection cycle: snapshot docker stats -> write UsageRecord rows.
 */
async function collectOnce(): Promise<number> {
  const cycleStartedAtMs = Date.now();
  const intervalSeconds = resolveIntervalSeconds(
    lastCollectionStartedAtMs,
    cycleStartedAtMs,
    INITIAL_DELAY_MS / 1000,
  );
  lastCollectionStartedAtMs = cycleStartedAtMs;

  const stats = await collectDockerStats();
  if (stats.length === 0) {
    return 0;
  }

  const now = new Date(cycleStartedAtMs);
  const activeContainers = new Set(stats.map((entry) => entry.containerId));
  const ownershipEntries = await Promise.all(
    stats.map(async (entry) => [
      entry.containerId,
      await resolveContainerOwnershipCached(entry.containerId),
    ] as const),
  );
  const ownershipByContainerId = new Map<string, ContainerOwnership | null>(ownershipEntries);

  const records: Array<{
    organizationId: string;
    subscriptionId: string;
    projectId: string;
    metricType: 'cpu_millicore_seconds' | 'ram_mb_seconds' | 'bandwidth_bytes';
    quantity: bigint;
    unit: string;
    recordedAt: Date;
  }> = [];

  for (const entry of stats) {
    const ownership = ownershipByContainerId.get(entry.containerId);
    if (!ownership) continue;

    // CPU: convert percent to millicore-seconds over the interval.
    // 100% CPU = 1000 millicores. So cpuPercent * 10 = millicores.
    // millicore-seconds = millicores * interval_seconds
    const millicores = entry.cpuPercent * 10;
    const cpuMillicoreSeconds = Math.round(millicores * intervalSeconds);
    if (cpuMillicoreSeconds > 0) {
      records.push({
        ...ownership,
        metricType: 'cpu_millicore_seconds',
        quantity: BigInt(cpuMillicoreSeconds),
        unit: 'millicore_seconds',
        recordedAt: now,
      });
    }

    // RAM: MB-seconds = current_MB * interval_seconds
    const ramMbSeconds = Math.round(entry.memUsageMb * intervalSeconds);
    if (ramMbSeconds > 0) {
      records.push({
        ...ownership,
        metricType: 'ram_mb_seconds',
        quantity: BigInt(ramMbSeconds),
        unit: 'mb_seconds',
        recordedAt: now,
      });
    }

    // Bandwidth: compute delta from previous snapshot.
    const prevNet = prevNetBytes.get(entry.containerId);
    const totalNow = entry.netInputBytes + entry.netOutputBytes;
    if (prevNet) {
      const prevTotal = prevNet.rx + prevNet.tx;
      const delta = totalNow - prevTotal;
      if (delta > 0) {
        records.push({
          ...ownership,
          metricType: 'bandwidth_bytes',
          quantity: BigInt(Math.round(delta)),
          unit: 'bytes',
          recordedAt: now,
        });
      }
    }
    prevNetBytes.set(entry.containerId, {
      rx: entry.netInputBytes,
      tx: entry.netOutputBytes,
    });
  }

  if (records.length > 0) {
    await prisma.usageRecord.createMany({ data: records });
  }

  // Prevent stale growth in long-lived engines by pruning dead container keys.
  for (const containerId of prevNetBytes.keys()) {
    if (!activeContainers.has(containerId)) {
      prevNetBytes.delete(containerId);
    }
  }
  for (const containerId of ownershipCache.keys()) {
    if (!activeContainers.has(containerId)) {
      ownershipCache.delete(containerId);
    }
  }

  pruneMapToMaxEntries(prevNetBytes, MAX_TRACKED_NET_CONTAINERS);
  pruneMapToMaxEntries(ownershipCache, MAX_TRACKED_OWNERSHIP_CONTAINERS);

  return records.length;
}

/**
 * Start the stats collection loop. Call once from index.ts.
 */
export function startStatsCollector(): void {
  console.log(`Stats collector started (interval: ${POLL_INTERVAL_MS / 1000}s)`);

  let cycleInProgress = false;
  let overlapWarningShown = false;

  const runCycle = async (source: 'initial' | 'interval') => {
    if (cycleInProgress) {
      if (!overlapWarningShown) {
        console.warn(`Stats collector: skipped ${source} cycle because the previous cycle is still running`);
        overlapWarningShown = true;
      }
      return;
    }

    cycleInProgress = true;
    overlapWarningShown = false;
    try {
      const count = await collectOnce();
      if (count > 0) {
        if (source === 'initial') {
          console.log(`Stats collector (initial): wrote ${count} usage records`);
        } else {
          console.log(`Stats collector: wrote ${count} usage records`);
        }
      }
    } catch (error) {
      if (source === 'initial') {
        console.error('Stats collector initial run error:', error);
      } else {
        console.error('Stats collector error:', error);
      }
    } finally {
      cycleInProgress = false;
    }
  };

  // Run first collection after a short delay so containers have time after engine restart.
  const initialTimer = setTimeout(() => {
    void runCycle('initial');
  }, INITIAL_DELAY_MS);
  initialTimer.unref();

  const timer = setInterval(() => {
    void runCycle('interval');
  }, POLL_INTERVAL_MS);

  timer.unref(); // Don't prevent process exit
}
