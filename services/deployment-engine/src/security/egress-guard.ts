import { isIP } from 'node:net';

import { env } from '../core/env.js';
import { runHostCommand } from '../core/run-host-command.js';

const CHAIN_NAME = 'APLOYD_EGRESS';
const COMMENT_PREFIX = 'apployd';
const MULTIPORT_MAX = 15;
type FirewallFamily = 4 | 6;

const PRIVATE_EGRESS_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

interface ContainerNetworkIdentity {
  containerId: string;
  containerName: string;
  ipAddress: string;
  policyKey: string;
}

const shellEscape = (value: string): string =>
  `'${value.replace(/'/g, `'\"'\"'`)}'`;

const chunkPorts = (ports: number[]): number[][] => {
  const chunks: number[][] = [];
  for (let index = 0; index < ports.length; index += MULTIPORT_MAX) {
    chunks.push(ports.slice(index, index + MULTIPORT_MAX));
  }
  return chunks;
};

const normalizePolicyKey = (value: string): string => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return sanitized || 'unknown';
};

const policyKeyFromContainerName = (containerName: string, containerId: string): string => {
  const normalized = containerName.trim().replace(/^\//, '');
  if (normalized.startsWith('apployd-')) {
    const deploymentId = normalized.slice('apployd-'.length);
    if (deploymentId) {
      return normalizePolicyKey(deploymentId);
    }
  }

  return normalizePolicyKey(containerId.slice(0, 12));
};

const commentTag = (policyKey: string, suffix: string): string =>
  `${COMMENT_PREFIX}:${normalizePolicyKey(policyKey)}:${suffix}`.slice(0, 120);

export class EgressGuard {
  async applyPolicy(containerNameOrId: string): Promise<void> {
    if (env.ENGINE_SECURITY_MODE === 'off') {
      return;
    }

    const identity = await this.resolveContainerIdentity(containerNameOrId);
    if (!identity) {
      return;
    }

    const family = this.addressFamily(identity.ipAddress);
    await this.ensureChainReady(family);
    await this.deleteRulesByPolicyKey(identity.policyKey);
    await this.deleteRulesBySourceIp(identity.ipAddress);

    const sourceIp = this.sourceCidr(identity.ipAddress);
    const mode = env.ENGINE_SECURITY_MODE;
    if (mode === 'strict' || mode === 'lockdown') {
      await this.insertPortRules({
        sourceIp,
        protocol: 'tcp',
        ports: env.ENGINE_EGRESS_BLOCKED_TCP_PORTS,
        policyKey: identity.policyKey,
        action: 'DROP',
        suffix: 'block-tcp',
        family,
      });
      await this.insertPortRules({
        sourceIp,
        protocol: 'udp',
        ports: env.ENGINE_EGRESS_BLOCKED_UDP_PORTS,
        policyKey: identity.policyKey,
        action: 'DROP',
        suffix: 'block-udp',
        family,
      });
    }

    if (mode === 'lockdown') {
      await this.insertRule(
        `-s ${sourceIp} -m comment --comment "${commentTag(identity.policyKey, 'deny-all')}" -j DROP`,
        family,
      );
    }

    await this.insertAllowRules(identity.policyKey, sourceIp, family);
  }

  async removePolicy(containerNameOrId: string): Promise<void> {
    if (env.ENGINE_SECURITY_MODE === 'off') {
      return;
    }

    const identity = await this.resolveContainerIdentity(containerNameOrId);
    const fallbackPolicyKey = normalizePolicyKey(containerNameOrId);
    const policyKey = identity?.policyKey ?? fallbackPolicyKey;
    await this.deleteRulesByPolicyKey(policyKey);
    if (identity?.ipAddress) {
      await this.deleteRulesBySourceIp(identity.ipAddress);
    }
  }

  async enforcePoliciesForRunningContainers(): Promise<void> {
    if (env.ENGINE_SECURITY_MODE === 'off') {
      return;
    }

    const output = await runHostCommand(
      'docker ps --format "{{.ID}} {{.Names}}" | awk \'$2 ~ /^apployd-/ {print $1}\'',
    ).catch(() => '');
    const containerIds = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const containerId of containerIds) {
      await this.applyPolicy(containerId);
    }
  }

  private async insertAllowRules(policyKey: string, sourceIp: string, family: FirewallFamily): Promise<void> {
    if (env.ENGINE_SECURITY_ALLOW_PRIVATE_EGRESS) {
      for (const cidr of PRIVATE_EGRESS_CIDRS.filter((entry) => this.addressFamily(entry) === family)) {
        await this.insertRule(
          `-s ${sourceIp} -d ${cidr} -m comment --comment "${commentTag(policyKey, 'allow-private')}" -j RETURN`,
          family,
        );
      }
    }

    await this.insertPortRules({
      sourceIp,
      protocol: 'tcp',
      ports: env.ENGINE_EGRESS_ALLOWED_TCP_PORTS,
      policyKey,
      action: 'RETURN',
      suffix: 'allow-tcp',
      family,
    });
    await this.insertPortRules({
      sourceIp,
      protocol: 'udp',
      ports: env.ENGINE_EGRESS_ALLOWED_UDP_PORTS,
      policyKey,
      action: 'RETURN',
      suffix: 'allow-udp',
      family,
    });
  }

  private async insertPortRules(input: {
    sourceIp: string;
    protocol: 'tcp' | 'udp';
    ports: number[];
    policyKey: string;
    action: 'RETURN' | 'DROP';
    suffix: string;
    family: FirewallFamily;
  }): Promise<void> {
    if (input.ports.length === 0) {
      return;
    }

    const chunks = chunkPorts(input.ports);
    for (let index = 0; index < chunks.length; index += 1) {
      const ports = chunks[index] ?? [];
      if (ports.length === 0) {
        continue;
      }
      const multiport = ports.join(',');
      await this.insertRule(
        `-s ${input.sourceIp} -p ${input.protocol} -m multiport --dports ${multiport} -m comment --comment "${commentTag(input.policyKey, `${input.suffix}-${index + 1}`)}" -j ${input.action}`,
        input.family,
      );
    }
  }

  private async resolveContainerIdentity(containerNameOrId: string): Promise<ContainerNetworkIdentity | null> {
    const formatted = await runHostCommand(
      `docker inspect --format ${shellEscape('{{.Id}}|{{.Name}}|{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}')} ${shellEscape(containerNameOrId)}`,
    ).catch(() => '');
    const trimmed = formatted.trim();
    if (!trimmed) {
      return null;
    }

    const [containerId = '', containerName = '', addresses = ''] = trimmed.split('|');
    const ipAddress = addresses
      .trim()
      .split(/\s+/)
      .map((entry) => entry.trim())
      .find((entry) => isIP(entry) === 4 || isIP(entry) === 6);

    if (!containerId || !containerName || !ipAddress) {
      return null;
    }

    return {
      containerId,
      containerName,
      ipAddress,
      policyKey: policyKeyFromContainerName(containerName, containerId),
    };
  }

  private async ensureChainReady(family: FirewallFamily): Promise<void> {
    const command = this.firewallBinary(family);
    await runHostCommand(
      `${command} -nL ${CHAIN_NAME} >/dev/null 2>&1 || ${command} -N ${CHAIN_NAME}`,
    );
    await runHostCommand(
      `${command} -C DOCKER-USER -j ${CHAIN_NAME} >/dev/null 2>&1 || ${command} -I DOCKER-USER 1 -j ${CHAIN_NAME}`,
    );
    await runHostCommand(
      `${command} -C ${CHAIN_NAME} -j RETURN >/dev/null 2>&1 || ${command} -A ${CHAIN_NAME} -j RETURN`,
    );
  }

  private async insertRule(ruleTail: string, family: FirewallFamily): Promise<void> {
    await runHostCommand(`${this.firewallBinary(family)} -I ${CHAIN_NAME} 1 ${ruleTail}`);
  }

  private async deleteRulesByPolicyKey(policyKey: string): Promise<void> {
    const marker = `${COMMENT_PREFIX}:${normalizePolicyKey(policyKey)}:`;
    for (const family of [4, 6] as const) {
      const rules = await this.listChainRules(family);
      const matches = rules.filter((line) => line.includes(marker));
      await this.deleteRules(matches, family);
    }
  }

  private async deleteRulesBySourceIp(sourceIp: string): Promise<void> {
    const family = this.addressFamily(sourceIp);
    const rules = await this.listChainRules(family);
    const sourceMarker = `-s ${this.sourceCidr(sourceIp)}`;
    const matches = rules.filter((line) => line.includes(sourceMarker));
    await this.deleteRules(matches, family);
  }

  private async listChainRules(family: FirewallFamily): Promise<string[]> {
    const rulesOutput = await runHostCommand(
      `${this.firewallBinary(family)} -S ${CHAIN_NAME} 2>/dev/null || true`,
    ).catch(() => '');
    return rulesOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`-A ${CHAIN_NAME} `));
  }

  private async deleteRules(rules: string[], family: FirewallFamily): Promise<void> {
    for (const line of [...rules].reverse()) {
      const deleteRule = line.replace(/^-A\s+/, '-D ');
      await runHostCommand(`${this.firewallBinary(family)} ${deleteRule}`).catch(() => undefined);
    }
  }

  private firewallBinary(family: FirewallFamily): 'iptables' | 'ip6tables' {
    return family === 6 ? 'ip6tables' : 'iptables';
  }

  private addressFamily(value: string): FirewallFamily {
    const family = isIP(value.split('/')[0] ?? value);
    if (family !== 4 && family !== 6) {
      throw new Error(`Invalid IP address: ${value}`);
    }
    return family;
  }

  private sourceCidr(ipAddress: string): string {
    return this.addressFamily(ipAddress) === 6 ? `${ipAddress}/128` : `${ipAddress}/32`;
  }
}
