'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { DashboardNav } from '../../components/dashboard-nav';
import {
  IconBilling,
  IconProfile,
  IconProjects,
  IconSettings,
} from '../../components/dashboard-icons';
import { WorkspaceProvider } from '../../components/workspace-provider';
import { apiClient, UnauthorizedError } from '../../lib/api';

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
  '/profile': {
    title: 'Profile',
    subtitle: 'Personal account details, security status, and session controls.',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Account profile, security posture, and environment settings.',
  },
  '/support': {
    title: 'Help Center',
    subtitle: 'Get support, browse FAQs, and access technical documentation.',
  },
};

/* Match /projects/<uuid> detail pages — hide default header there */
const PROJECT_DETAIL_RE = /^\/projects\/[a-f0-9-]+/i;

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'apployd_dashboard_theme';
const AUTH_STORAGE_KEY = 'apployd_token';
const THEME_UPDATED_EVENT = 'apployd:dashboard-theme-updated';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/overview';
  const [theme, setTheme] = useState<DashboardTheme>('dark');
  const [authChecked, setAuthChecked] = useState(false);
  const copy = pageTitles[pathname as keyof typeof pageTitles] ?? {
    title: 'Dashboard',
    subtitle: 'Deploy and operate backend services.',
  };
  const isProjectDetail = PROJECT_DETAIL_RE.test(pathname);
  const topbarTitle = isProjectDetail ? 'Project' : copy.title;
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

    setTheme('dark');
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

    const syncThemeFromStorage = () => {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      }
    };

    window.addEventListener(THEME_UPDATED_EVENT, syncThemeFromStorage);
    window.addEventListener('storage', syncThemeFromStorage);

    return () => {
      window.removeEventListener(THEME_UPDATED_EVENT, syncThemeFromStorage);
      window.removeEventListener('storage', syncThemeFromStorage);
    };
  }, []);

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
      .catch((error) => {
        if (error instanceof UnauthorizedError) {
          // Token is invalid/expired - api.ts already handles redirect
          // Just ensure we don't set authChecked
          return;
        }
        // For network errors or other issues, allow access (optimistic)
        // User will get proper 401 on actual API calls if token is bad
        if (!cancelled) {
          setAuthChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!authChecked) {
    return (
      <main className={shellClassName}>
        <div className="grid min-h-screen place-items-center px-4">
          <div className="space-y-3">
            <div className="skeleton h-4 w-36 rounded" />
            <div className="skeleton h-3 w-28 rounded" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <WorkspaceProvider>
    <main className={shellClassName}>
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DashboardNav />

        <section className="min-w-0">
          <header className="panel dashboard-topbar">
            <div className="dashboard-topbar-inner">
              <div className="dashboard-topbar-slot dashboard-topbar-left">
                <Link href="/projects" className="dashboard-topbar-chip" aria-label="Open all projects">
                  <IconProjects size={14} />
                  <span>All Projects</span>
                  <span className="dashboard-topbar-chevron" aria-hidden="true">
                    v
                  </span>
                </Link>
              </div>
              <div className="dashboard-topbar-slot dashboard-topbar-center">
                <h1 className="dashboard-topbar-title">{topbarTitle}</h1>
              </div>
              <div className="dashboard-topbar-slot dashboard-topbar-right">
                <Link href="/billing" className="dashboard-topbar-upgrade" aria-label="Upgrade subscription">
                  <IconBilling size={14} />
                  <span className="dashboard-topbar-upgrade-label">Upgrade</span>
                </Link>
                <Link href="/profile" className="dashboard-topbar-profile" aria-label="Open profile">
                  <IconProfile size={15} />
                  <span className="dashboard-topbar-profile-label">Profile</span>
                </Link>
                <Link href="/settings" className="dashboard-topbar-icon" aria-label="Open settings">
                  <IconSettings size={14} />
                </Link>
              </div>
            </div>
          </header>
          <section className="space-y-0">{children}</section>
        </section>
      </div>
    </main>
    </WorkspaceProvider>
  );
}
