import { describe, expect, it } from 'vitest';

import { pickBestServer } from '../src/scheduler/placement-strategy.js';

describe('pickBestServer', () => {
  it('prefers healthy server with enough capacity in preferred region', () => {
    const server = pickBestServer(
      [
        {
          id: 'a',
          region: 'fsn1',
          totalRamMb: 64000,
          usedRamMb: 10000,
          totalCpuMillicores: 32000,
          usedCpuMillicores: 6000,
          totalBandwidthGb: 10000,
          usedBandwidthGb: 1000,
          healthScore: 95,
        },
        {
          id: 'b',
          region: 'nbg1',
          totalRamMb: 64000,
          usedRamMb: 6000,
          totalCpuMillicores: 32000,
          usedCpuMillicores: 6000,
          totalBandwidthGb: 10000,
          usedBandwidthGb: 1000,
          healthScore: 60,
        },
      ],
      {
        ramMb: 1024,
        cpuMillicores: 500,
        bandwidthGb: 25,
        preferredRegion: 'fsn1',
      },
    );

    expect(server.id).toBe('a');
  });

  it('throws when no capacity exists', () => {
    expect(() =>
      pickBestServer(
        [
          {
            id: 'a',
            region: 'fsn1',
            totalRamMb: 1024,
            usedRamMb: 1000,
            totalCpuMillicores: 1000,
            usedCpuMillicores: 950,
            totalBandwidthGb: 50,
            usedBandwidthGb: 49,
            healthScore: 90,
          },
        ],
        {
          ramMb: 512,
          cpuMillicores: 500,
          bandwidthGb: 20,
        },
      ),
    ).toThrowError('No server has enough capacity for this workload.');
  });
});
