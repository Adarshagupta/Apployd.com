import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    ENGINE_PUBLIC_IPV4: undefined as string | undefined,
  },
  runHostCommand: vi.fn(async () => ''),
  prisma: {
    server: {
      update: vi.fn(async () => undefined),
    },
  },
}));

vi.mock('../src/core/env.js', () => ({
  env: state.env,
}));

vi.mock('../src/core/run-host-command.js', () => ({
  runHostCommand: state.runHostCommand,
}));

vi.mock('../src/core/prisma.js', () => ({
  prisma: state.prisma,
}));

import { pickPublicIpv4, resolveDnsTargetIpv4 } from '../src/core/server-ip.js';

describe('server-ip helpers', () => {
  beforeEach(() => {
    state.env.ENGINE_PUBLIC_IPV4 = undefined;
    state.runHostCommand.mockReset();
    state.runHostCommand.mockResolvedValue('');
    state.prisma.server.update.mockReset();
    state.prisma.server.update.mockResolvedValue(undefined);
  });

  it('prefers the route source IP over other addresses in command output', () => {
    expect(
      pickPublicIpv4('1.1.1.1 via 10.0.0.1 dev eth0 src 89.167.59.89 uid 0\n89.167.59.89 10.0.0.5'),
    ).toBe('89.167.59.89');
  });

  it('uses the configured public IP override and syncs the server record', async () => {
    state.env.ENGINE_PUBLIC_IPV4 = '89.167.59.89';

    const resolved = await resolveDnsTargetIpv4({
      serverId: 'srv_123',
      recordedIpv4: '95.216.165.119',
    });

    expect(resolved).toBe('89.167.59.89');
    expect(state.runHostCommand).not.toHaveBeenCalled();
    expect(state.prisma.server.update).toHaveBeenCalledWith({
      where: { id: 'srv_123' },
      data: { ipv4: '89.167.59.89' },
    });
  });

  it('falls back to the recorded server IP when host detection finds no public address', async () => {
    state.runHostCommand.mockResolvedValue('10.0.0.5 192.168.1.20');

    const resolved = await resolveDnsTargetIpv4({
      serverId: 'srv_123',
      recordedIpv4: '89.167.59.89',
    });

    expect(resolved).toBe('89.167.59.89');
    expect(state.prisma.server.update).not.toHaveBeenCalled();
  });
});
