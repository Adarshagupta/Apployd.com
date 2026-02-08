import { describe, expect, it } from 'vitest';

import {
  parseByteSizeToBytes,
  parseDockerStatsOutput,
  parseMemoryUsageToMb,
  resolveIntervalSeconds,
} from '../src/monitoring/stats-utils.js';

describe('stats-utils', () => {
  it('parses byte sizes in decimal and binary units', () => {
    expect(parseByteSizeToBytes('1.5kB')).toBeCloseTo(1_500, 6);
    expect(parseByteSizeToBytes('2MB')).toBeCloseTo(2_000_000, 6);
    expect(parseByteSizeToBytes('3GiB')).toBeCloseTo(3 * 1024 * 1024 * 1024, 6);
    expect(parseByteSizeToBytes('unknown')).toBe(0);
  });

  it('parses memory usage values from docker stats format', () => {
    expect(parseMemoryUsageToMb('512MiB / 2GiB')).toBeCloseTo(512, 6);
    expect(parseMemoryUsageToMb('1536KiB / 1GiB')).toBeCloseTo(1.5, 6);
    expect(parseMemoryUsageToMb('0B / 1GiB')).toBe(0);
  });

  it('parses docker stats output and filters non-apployd containers', () => {
    const output = [
      'abc123|apployd-web|12.5%|256MiB / 1GiB|1.5kB / 2MB',
      'def456|postgres|5.0%|128MiB / 2GiB|300B / 500B',
    ].join('\n');

    const entries = parseDockerStatsOutput(output);
    expect(entries).toHaveLength(1);
    const first = entries[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }

    expect(first).toMatchObject({
      containerId: 'abc123',
      name: 'apployd-web',
      cpuPercent: 12.5,
    });
    expect(first.memUsageMb).toBeCloseTo(256, 6);
    expect(first.netInputBytes).toBeCloseTo(1_500, 6);
    expect(first.netOutputBytes).toBeCloseTo(2_000_000, 6);
  });

  it('derives collection interval from elapsed time', () => {
    expect(resolveIntervalSeconds(null, 10_000, 5)).toBe(5);
    expect(resolveIntervalSeconds(10_000, 40_000, 5)).toBe(30);
    expect(resolveIntervalSeconds(10_000, 10_010, 5)).toBe(1);
    expect(resolveIntervalSeconds(10_000, 9_000, 5)).toBe(5);
  });
});
