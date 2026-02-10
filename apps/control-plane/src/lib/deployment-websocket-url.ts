import { env } from '../config/env.js';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const isLocalHost = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

const resolvePublicBaseUrl = (): string => {
  const apiBaseUrl = trimTrailingSlash(env.API_BASE_URL);
  const dashboardBaseUrl = trimTrailingSlash(env.DASHBOARD_BASE_URL);

  const shouldUseDashboardBase =
    env.NODE_ENV === 'production'
    && isLocalHost(apiBaseUrl)
    && !isLocalHost(dashboardBaseUrl);

  return shouldUseDashboardBase ? dashboardBaseUrl : apiBaseUrl;
};

const toWebSocketBaseUrl = (value: string): string =>
  value.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');

export const resolveDeploymentWebsocketUrl = (deploymentId: string): string => {
  const baseUrl = toWebSocketBaseUrl(resolvePublicBaseUrl());
  return `${baseUrl}/ws/deployments/${deploymentId}`;
};
