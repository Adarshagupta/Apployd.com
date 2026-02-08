import { describe, expect, it } from 'vitest';

import { ProjectUsageService } from '../src/services/project-usage-service.js';

describe('ProjectUsageService', () => {
  it('builds safe snapshots with zero usage and no divide errors', async () => {
    const service = new ProjectUsageService();
    const result = await service.listProjectUsageSnapshots('org_1', [], {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(result.byProjectId).toEqual({});
    expect(result.window.start).toBe('2026-01-01T00:00:00.000Z');
    expect(result.window.end).toBe('2026-01-31T23:59:59.999Z');
  });
});
