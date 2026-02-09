'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspaceContext } from '../../../components/workspace-provider';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'apployd_dashboard_theme';
const THEME_UPDATED_EVENT = 'apployd:dashboard-theme-updated';
const AUTH_STORAGE_KEY = 'apployd_token';

export default function SettingsPage() {
  const { selectedOrganizationId } = useWorkspaceContext();
  const [me, setMe] = useState<{ id: string; email: string; name: string | null; createdAt?: string } | null>(null);
  const [subscription, setSubscription] = useState<{
    status: string;
    currentPeriodEnd: string;
    plan: { code: string; displayName: string } | null;
  } | null>(null);
  const [theme, setTheme] = useState<DashboardTheme>('dark');
  const [githubConnected, setGithubConnected] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [meData, githubStatus] = await Promise.all([
        apiClient.get('/auth/me'),
        apiClient.get('/integrations/github/status'),
      ]);

      setMe(meData.user ?? null);
      setGithubConnected(Boolean(githubStatus.connected));

      if (selectedOrganizationId) {
        const current = await apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`);
        setSubscription(current.subscription ?? null);
      } else {
        setSubscription(null);
      }

      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      return;
    }

    setTheme('dark');
  }, []);

  const toggleTheme = () => {
    if (typeof window === 'undefined') {
      return;
    }

    setTheme((current) => {
      const next: DashboardTheme = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      window.dispatchEvent(new Event(THEME_UPDATED_EVENT));
      return next;
    });
  };

  const signOut = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.href = '/login';
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Workspace Settings" subtitle="Account profile and subscription context for current workspace.">
        <div className="grid gap-3 md:grid-cols-[320px_1fr]">
          <div className="panel-muted p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Security posture</p>
            <p className="mt-1 text-sm text-slate-700">
              GitHub integration: <span className="font-medium">{githubConnected ? 'Connected' : 'Not connected'}</span>
            </p>
            <p className="text-sm text-slate-700">
              Auth type: <span className="font-medium">JWT session</span>
            </p>
          </div>
          <div className="panel-muted p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Session controls</p>
            <p className="mt-1 text-sm text-slate-700">
              Theme: <span className="font-medium">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={toggleTheme} type="button" aria-label="Toggle color mode">
                {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>
              <button className="btn-secondary" onClick={signOut} type="button">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="User Profile">
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              Name: <span className="font-medium text-slate-900">{me?.name ?? '-'}</span>
            </p>
            <p>
              Email: <span className="font-medium text-slate-900">{me?.email ?? '-'}</span>
            </p>
            <p>
              User ID: <span className="mono text-xs">{me?.id ?? '-'}</span>
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Subscription">
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              Plan:{' '}
              <span className="font-medium text-slate-900">
                {subscription?.plan
                  ? `${subscription.plan.displayName} (${subscription.plan.code})`
                  : 'No active subscription'}
              </span>
            </p>
            <p>
              Status: <span className="font-medium text-slate-900">{subscription?.status ?? '-'}</span>
            </p>
            <p>
              Period end:{' '}
              <span className="font-medium text-slate-900">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : '-'}
              </span>
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Policy & Compliance" subtitle="Legal documents and compliance references for your workspace.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/privacy" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Privacy Policy</p>
            <p className="mt-1 text-xs text-slate-600">Data handling and privacy rights.</p>
          </Link>
          <Link href="/terms" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Terms & Conditions</p>
            <p className="mt-1 text-xs text-slate-600">Service usage terms and obligations.</p>
          </Link>
          <Link href="/legal/compliance" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Compliance Program</p>
            <p className="mt-1 text-xs text-slate-600">Regulatory controls and framework status.</p>
          </Link>
          <Link href="/support" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Support</p>
            <p className="mt-1 text-xs text-slate-600">Troubleshooting and contact channels.</p>
          </Link>
        </div>
      </SectionCard>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
