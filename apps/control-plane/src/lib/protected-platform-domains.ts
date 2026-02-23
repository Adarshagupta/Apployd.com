import { env } from '../config/env.js';

const normalizeHostname = (value: string): string =>
  value.trim().toLowerCase().replace(/\.$/, '');

const hostnameFromUrl = (value: string): string | null => {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
};

const maybeAddCompanionWww = (host: string, target: Set<string>): void => {
  if (!host || host.includes(':')) {
    return;
  }

  if (host.startsWith('www.')) {
    const apex = host.slice(4);
    if (apex) {
      target.add(apex);
    }
    return;
  }

  const labels = host.split('.');
  if (labels.length === 2) {
    target.add(`www.${host}`);
  }
};

export const getProtectedPlatformDomains = (): Set<string> => {
  const protectedDomains = new Set<string>();

  const addHost = (value?: string | null): void => {
    if (!value) {
      return;
    }
    const normalized = normalizeHostname(value);
    if (!normalized) {
      return;
    }
    protectedDomains.add(normalized);
    maybeAddCompanionWww(normalized, protectedDomains);
  };

  addHost(env.BASE_DOMAIN);
  addHost(env.PREVIEW_BASE_DOMAIN);
  addHost(hostnameFromUrl(env.DASHBOARD_BASE_URL));
  addHost(hostnameFromUrl(env.API_BASE_URL));

  return protectedDomains;
};

export const isProtectedPlatformDomain = (domain: string): boolean =>
  getProtectedPlatformDomains().has(normalizeHostname(domain));
