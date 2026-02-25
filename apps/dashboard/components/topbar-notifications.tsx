'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '../lib/api';
import { IconBell } from './dashboard-icons';
import { useWorkspaceContext } from './workspace-provider';

type NotificationCategory = 'invites' | 'deployments' | 'subscriptions' | 'usages';
type NotificationTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface PendingInvite {
  id: string;
  email: string;
  expiresAt: string;
  organization?: {
    id: string;
    name: string;
  } | null;
}

interface PendingInvitesResponse {
  invites?: PendingInvite[];
}

interface RecentDeployment {
  id: string;
  status: string;
  createdAt: string;
  project?: {
    id: string;
    name: string;
  } | null;
}

interface RecentDeploymentsResponse {
  deployments?: RecentDeployment[];
}

interface CurrentSubscriptionResponse {
  subscription?: {
    status?: string;
    currentPeriodEnd?: string;
    plan?: {
      displayName?: string | null;
    } | null;
  } | null;
}

interface UsageSummaryResponse {
  usage?: Record<string, string | number | null | undefined>;
}

interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  detail: string;
  href: string;
  tone: NotificationTone;
  actionRequired: boolean;
}

const DEPLOYMENT_IN_PROGRESS = new Set(['queued', 'building', 'deploying']);
const HEALTHY_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const REFRESH_INTERVAL_MS = 45_000;
const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  invites: 'Invites',
  deployments: 'Deployments',
  subscriptions: 'Subscriptions',
  usages: 'Usage',
};

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleDateString();
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return 'recently';
  }
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return 'recently';
  }

  const deltaSeconds = Math.round((time - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const absSeconds = Math.abs(deltaSeconds);

  if (absSeconds < 60) {
    return formatter.format(deltaSeconds, 'second');
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, 'minute');
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, 'hour');
  }

  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, 'day');
}

function formatStatus(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'Unknown';
  }
  return normalized
    .split('_')
    .map((piece) => (piece.length ? `${piece[0]?.toUpperCase() ?? ''}${piece.slice(1)}` : ''))
    .join(' ');
}

function resolveDeploymentHref(deployment: RecentDeployment | undefined): string {
  const projectId = deployment?.project?.id;
  const deploymentId = deployment?.id;
  if (!projectId || !deploymentId) {
    return '/projects';
  }
  return `/projects/${projectId}/deployments/${deploymentId}`;
}

function getFallbackNotifications(reason: string): NotificationItem[] {
  return [
    {
      id: 'invites',
      category: 'invites',
      title: 'Invites unavailable',
      detail: reason,
      href: '/team',
      tone: 'neutral',
      actionRequired: false,
    },
    {
      id: 'deployments',
      category: 'deployments',
      title: 'Deployments unavailable',
      detail: reason,
      href: '/projects',
      tone: 'neutral',
      actionRequired: false,
    },
    {
      id: 'subscriptions',
      category: 'subscriptions',
      title: 'Subscription unavailable',
      detail: reason,
      href: '/billing',
      tone: 'neutral',
      actionRequired: false,
    },
    {
      id: 'usages',
      category: 'usages',
      title: 'Usage unavailable',
      detail: reason,
      href: '/usage',
      tone: 'neutral',
      actionRequired: false,
    },
  ];
}

export function TopbarNotifications() {
  const pathname = usePathname();
  const { selectedOrganizationId } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!selectedOrganizationId) {
      setNotifications(getFallbackNotifications('Select an organization to load notifications.'));
      setUnreadCount(0);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [invitesResult, deploymentsResult, subscriptionResult, usageResult] = await Promise.allSettled([
        apiClient.get('/teams/invites/pending') as Promise<PendingInvitesResponse>,
        apiClient.get(`/deployments/recent?organizationId=${selectedOrganizationId}&limit=5`) as Promise<RecentDeploymentsResponse>,
        apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`) as Promise<CurrentSubscriptionResponse>,
        apiClient.get(`/usage/summary?organizationId=${selectedOrganizationId}`) as Promise<UsageSummaryResponse>,
      ]);

      const invites =
        invitesResult.status === 'fulfilled'
          ? (invitesResult.value.invites ?? [])
          : [];
      const deployments =
        deploymentsResult.status === 'fulfilled'
          ? (deploymentsResult.value.deployments ?? [])
          : [];
      const subscription =
        subscriptionResult.status === 'fulfilled'
          ? subscriptionResult.value.subscription
          : null;
      const usage =
        usageResult.status === 'fulfilled'
          ? usageResult.value.usage
          : undefined;

      const latestInvite = invites[0];
      const inviteCount = invites.length;
      const inviteTitle = inviteCount > 0
        ? `${inviteCount} pending invite${inviteCount === 1 ? '' : 's'}`
        : 'No pending invites';
      const inviteDetail = latestInvite
        ? `${latestInvite.organization?.name ?? latestInvite.email} expires ${formatDate(latestInvite.expiresAt)}`
        : 'No team invite action required.';

      const failedDeployment = deployments.find((deployment) => deployment.status.toLowerCase() === 'failed');
      const inProgressDeployment = deployments.find((deployment) =>
        DEPLOYMENT_IN_PROGRESS.has(deployment.status.toLowerCase()));
      const latestDeployment = deployments[0];

      let deploymentTitle = 'No recent deployments';
      let deploymentDetail = 'Trigger a deployment from any project.';
      let deploymentTone: NotificationTone = 'neutral';
      let deploymentActionRequired = false;
      let deploymentTarget = latestDeployment;

      if (failedDeployment) {
        deploymentTitle = `Deployment failed on ${failedDeployment.project?.name ?? 'project'}`;
        deploymentDetail = `Latest failure ${formatRelativeTime(failedDeployment.createdAt)}.`;
        deploymentTone = 'danger';
        deploymentActionRequired = true;
        deploymentTarget = failedDeployment;
      } else if (inProgressDeployment) {
        deploymentTitle = `${inProgressDeployment.project?.name ?? 'Project'} is ${formatStatus(inProgressDeployment.status).toLowerCase()}`;
        deploymentDetail = `Started ${formatRelativeTime(inProgressDeployment.createdAt)}.`;
        deploymentTone = 'info';
        deploymentTarget = inProgressDeployment;
      } else if (latestDeployment) {
        deploymentTitle = `Latest deployment is ${formatStatus(latestDeployment.status).toLowerCase()}`;
        deploymentDetail = `${latestDeployment.project?.name ?? 'Project'} deployed ${formatRelativeTime(latestDeployment.createdAt)}.`;
        deploymentTone = latestDeployment.status.toLowerCase() === 'ready' ? 'success' : 'neutral';
      }

      const planNameRaw = subscription?.plan?.displayName;
      const planName = typeof planNameRaw === 'string' && planNameRaw.trim().length > 0
        ? planNameRaw.trim()
        : null;
      const subscriptionStatus = (subscription?.status ?? '').toLowerCase();
      const subscriptionHealthy = Boolean(planName) && HEALTHY_SUBSCRIPTION_STATUSES.has(subscriptionStatus);
      const subscriptionActionRequired = !subscriptionHealthy;
      const subscriptionTitle = planName
        ? `${planName} subscription`
        : 'Subscription needs setup';
      const subscriptionDetail = planName
        ? `Status: ${formatStatus(subscription?.status)}. Renews ${formatDate(subscription?.currentPeriodEnd)}.`
        : 'Open billing to choose a plan and unlock deployment limits.';
      const subscriptionTone: NotificationTone = subscriptionHealthy ? 'success' : 'warning';

      const requestCount = toNumber(usage?.request_count);
      const cpuCount = toNumber(usage?.cpu_millicore_seconds);
      const ramCount = toNumber(usage?.ram_mb_seconds);
      const hasUsageData = requestCount > 0 || cpuCount > 0 || ramCount > 0;
      const usageTitle = hasUsageData
        ? `${formatCount(requestCount)} requests this cycle`
        : 'No usage recorded yet';
      const usageDetail = hasUsageData
        ? `CPU ${formatCount(cpuCount)} mCPU-s | RAM ${formatCount(ramCount)} MB-s.`
        : 'Usage activity appears here after traffic and runtime events.';

      const nextNotifications: NotificationItem[] = [
        {
          id: 'invites',
          category: 'invites',
          title: inviteTitle,
          detail: inviteDetail,
          href: '/team',
          tone: inviteCount > 0 ? 'warning' : 'neutral',
          actionRequired: inviteCount > 0,
        },
        {
          id: 'deployments',
          category: 'deployments',
          title: deploymentTitle,
          detail: deploymentDetail,
          href: resolveDeploymentHref(deploymentTarget),
          tone: deploymentTone,
          actionRequired: deploymentActionRequired,
        },
        {
          id: 'subscriptions',
          category: 'subscriptions',
          title: subscriptionTitle,
          detail: subscriptionDetail,
          href: '/billing',
          tone: subscriptionTone,
          actionRequired: subscriptionActionRequired,
        },
        {
          id: 'usages',
          category: 'usages',
          title: usageTitle,
          detail: usageDetail,
          href: '/usage',
          tone: hasUsageData ? 'info' : 'neutral',
          actionRequired: false,
        },
      ];

      const nextUnreadCount = inviteCount
        + (deploymentActionRequired ? 1 : 0)
        + (subscriptionActionRequired ? 1 : 0);

      setNotifications(nextNotifications);
      setUnreadCount(nextUnreadCount);

      const hasRequestFailure =
        invitesResult.status === 'rejected'
        || deploymentsResult.status === 'rejected'
        || subscriptionResult.status === 'rejected'
        || usageResult.status === 'rejected';
      if (hasRequestFailure) {
        setError('Some notifications could not be refreshed.');
      }
    } catch {
      setNotifications(getFallbackNotifications('Failed to load notifications.'));
      setUnreadCount(0);
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrganizationId]);

  useEffect(() => {
    loadNotifications().catch(() => {
      setNotifications(getFallbackNotifications('Failed to load notifications.'));
      setUnreadCount(0);
      setError('Failed to load notifications.');
      setLoading(false);
    });
  }, [loadNotifications]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadNotifications().catch(() => {
        setError('Failed to refresh notifications.');
        setLoading(false);
      });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) {
      return;
    }
    loadNotifications().catch(() => {
      setError('Failed to refresh notifications.');
      setLoading(false);
    });
  }, [open, loadNotifications]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const buttonLabel =
    unreadCount > 0
      ? `Open notifications (${unreadCount} unread)`
      : 'Open notifications';

  return (
    <div ref={menuRef} className="dashboard-topbar-menu dashboard-topbar-notify-menu">
      <button
        type="button"
        className={`dashboard-topbar-icon dashboard-topbar-notify-button ${open ? 'dashboard-topbar-chip-open' : ''}`}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <IconBell size={16} />
        {unreadCount > 0 ? (
          <span className="dashboard-topbar-notify-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      <div
        className={`dashboard-topbar-dropdown dashboard-topbar-dropdown-notify ${open ? 'dashboard-topbar-dropdown-open' : ''}`}
        role="menu"
      >
        <div className="dashboard-topbar-notify-head">
          <p className="dashboard-topbar-dropdown-title">Notifications</p>
          <button
            type="button"
            className="dashboard-topbar-notify-refresh"
            onClick={() => {
              loadNotifications().catch(() => {
                setError('Failed to refresh notifications.');
                setLoading(false);
              });
            }}
            disabled={loading}
          >
            {loading ? 'Syncing...' : 'Refresh'}
          </button>
        </div>

        {notifications.length ? (
          <div className="dashboard-topbar-dropdown-list">
            {notifications.map((notification) => (
              <Link
                key={notification.id}
                href={notification.href}
                className="dashboard-topbar-dropdown-item dashboard-topbar-notify-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span
                  className={`dashboard-topbar-notify-dot dashboard-topbar-notify-dot-${notification.tone}`}
                  aria-hidden="true"
                />
                <span className="dashboard-topbar-notify-copy">
                  <span className="dashboard-topbar-notify-category">{CATEGORY_LABELS[notification.category]}</span>
                  <span className="dashboard-topbar-notify-title">{notification.title}</span>
                  <span className="dashboard-topbar-notify-detail">{notification.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="dashboard-topbar-notify-empty">
            {loading ? 'Loading notifications...' : 'No notifications available.'}
          </p>
        )}

        {error ? <p className="dashboard-topbar-notify-empty">{error}</p> : null}
      </div>
    </div>
  );
}
