'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { DashboardNav } from '../../components/dashboard-nav';
import { apiClient } from '../../lib/api';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/overview': {
    title: 'Platform Overview',
    subtitle: 'System health, deployment activity, and capacity summary.',
  },
  '/projects': {
    title: 'Projects',
    subtitle: 'Manage your projects, deployments, and configuration.',
  },
  '/projects/new': {
    title: 'Create Project',
    subtitle: 'Provision a new project with initial deploy settings and strict allocation limits.',
  },
  '/usage': {
    title: 'Usage',
    subtitle: 'Metered consumption against pooled subscription limits.',
  },
  '/billing': {
    title: 'Billing',
    subtitle: 'Plan management, subscriptions, and invoice history.',
  },
  '/logs': {
    title: 'Logs',
    subtitle: 'Deployment and runtime log stream across your services.',
  },
  '/team': {
    title: 'Team',
    subtitle: 'Organization membership and RBAC controls.',
  },
  '/integrations': {
    title: 'Integrations',
    subtitle: 'GitHub connection and repository-backed deployment settings.',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Account profile, security posture, and environment settings.',
  },
};

/* Match /projects/<uuid> detail pages — hide default header there */
const PROJECT_DETAIL_RE = /^\/projects\/[a-f0-9-]+/i;

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'apployd_dashboard_theme';
const AUTH_STORAGE_KEY = 'apployd_token';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const rawPathname = usePathname();
  const pathname: string = rawPathname ?? '/overview';
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [authChecked, setAuthChecked] = useState(false);
  const copy = pageTitles[pathname] ?? {
    title: 'Dashboard',
    subtitle: 'Deploy and operate backend services.',
  };
  const isProjectDetail = PROJECT_DETAIL_RE.test(pathname);
  const shellClassName = useMemo(
    () => `app-shell ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`,
    [theme],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      return;
    }

    const prefersDark =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const next = currentPath && currentPath !== '/' ? currentPath : '/overview';
    const redirectToLogin = () => {
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    };

    const token = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) {
      redirectToLogin();
      return;
    }

    apiClient
      .get('/auth/me')
      .then(() => {
        if (!cancelled) {
          setAuthChecked(true);
        }
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        if (!cancelled) {
          redirectToLogin();
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  if (!authChecked) {
    return (
      <main className={shellClassName}>
        <div className="grid min-h-screen place-items-center px-4">
          <p className="text-sm text-slate-600">Checking session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={shellClassName}>
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <DashboardNav />

        <section className="min-w-0">
          <header className="panel px-4 py-5 md:px-6 md:py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {!isProjectDetail && (
                <div>
                  <p className="status-pill">Live Platform</p>
                  <h1 className="title-gradient mt-3 text-3xl font-semibold md:text-4xl">{copy.title}</h1>
                  <p className="mt-2 text-sm text-slate-700 md:text-base">{copy.subtitle}</p>
                </div>
              )}
              {isProjectDetail && (
                <div>
                  <p className="status-pill">Live Platform</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-secondary" onClick={toggleTheme} type="button" aria-label="Toggle color mode">
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.localStorage.removeItem('apployd_token');
                      window.location.href = '/login';
                    }
                  }}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>
          <section className="space-y-0">{children}</section>
        </section>
      </div>
    </main>
  );
}
