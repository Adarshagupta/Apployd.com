import { describe, expect, it } from 'vitest';

import { validateAllocationRules } from '../src/domain/resource-rules.js';

describe('validateAllocationRules', () => {
  it('accepts allocation within 50% and pool limits', () => {
    const result = validateAllocationRules(
      {
        poolRamMb: 2048,
        poolCpuMillicores: 2000,
        poolBandwidthGb: 200,
        currentlyAllocatedRamMb: 1100,
        currentlyAllocatedCpuMillicores: 1000,
        currentlyAllocatedBandwidthGb: 80,
        currentProjectRamMb: 256,
        currentProjectCpuMillicores: 250,
        currentProjectBandwidthGb: 20,
      },
      {
        ramMb: 512,
        cpuMillicores: 500,
        bandwidthGb: 40,
      },
    );

    expect(result.ok).toBe(true);
  });

  it('rejects a project using over 50% of ram pool', () => {
    expect(() =>
      validateAllocationRules(
        {
          poolRamMb: 2048,
          poolCpuMillicores: 2000,
          poolBandwidthGb: 200,
          currentlyAllocatedRamMb: 1000,
          currentlyAllocatedCpuMillicores: 800,
          currentlyAllocatedBandwidthGb: 70,
          currentProjectRamMb: 128,
          currentProjectCpuMillicores: 100,
          currentProjectBandwidthGb: 10,
        },
        {
          ramMb: 1200,
          cpuMillicores: 500,
          bandwidthGb: 20,
        },
      ),
    ).toThrowError('A project cannot exceed 50% of RAM pool.');
  });

  it('rejects total cpu pool overflow', () => {
    expect(() =>
      validateAllocationRules(
        {
          poolRamMb: 4096,
          poolCpuMillicores: 3000,
          poolBandwidthGb: 300,
          currentlyAllocatedRamMb: 1200,
          currentlyAllocatedCpuMillicores: 2800,
          currentlyAllocatedBandwidthGb: 100,
          currentProjectRamMb: 200,
          currentProjectCpuMillicores: 200,
          currentProjectBandwidthGb: 10,
        },
        {
          ramMb: 250,
          cpuMillicores: 900,
          bandwidthGb: 10,
        },
      ),
    ).toThrowError('CPU pool exceeded.');
  });
});
