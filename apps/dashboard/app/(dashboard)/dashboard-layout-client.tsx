'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { DashboardNav } from '../../components/dashboard-nav';
import {
  IconBilling,
  IconContent,
  IconPlus,
  IconProfile,
  IconProjects,
  IconShield,
  IconSettings,
  IconUsage,
} from '../../components/dashboard-icons';
import { TopbarNotifications } from '../../components/topbar-notifications';
import { ThemeLogo } from '../../components/theme-logo';
import { WorkspaceProvider, useWorkspaceContext } from '../../components/workspace-provider';
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
  '/content': {
    title: 'Content Studio',
    subtitle: 'Create, edit, and publish blog and news updates.',
  },
  '/onboarding': {
    title: 'Onboarding',
    subtitle: 'Complete initial setup for GitHub, team access, and billing.',
  },
  '/projects/new': {
    title: 'Create Project',
    subtitle: 'Provision a new project with initial deploy settings and strict allocation limits.',
  },
  '/usage': {
    title: 'Usage',
    subtitle: 'Metered consumption against pooled subscription limits.',
  },
  '/security-center': {
    title: 'Security',
    subtitle: 'Anomaly detection for DDoS and abuse patterns with attack mode controls.',
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
const CONTENT_ADMIN_EMAIL_DOMAIN = '@apployd.com';

interface AuthMeResponse {
  user?: {
    email?: string | null;
  } | null;
}

interface OnboardingStatusResponse {
  completed?: boolean;
}

const canManageContent = (email: string | null): boolean => {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(CONTENT_ADMIN_EMAIL_DOMAIN) && normalized.length > CONTENT_ADMIN_EMAIL_DOMAIN.length;
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/overview';
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('dark');
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const copy = pageTitles[pathname as keyof typeof pageTitles] ?? {
    title: 'Dashboard',
    subtitle: 'Deploy and operate backend services.',
  };
  const isProjectDetail = PROJECT_DETAIL_RE.test(pathname);
  const topbarTitle = isProjectDetail ? 'Project' : copy.title;
  const showContentMenu = canManageContent(currentUserEmail);
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
  }, [router]);

  useEffect(() => {
    if (!topbarMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!topbarMenuRef.current?.contains(target)) {
        setTopbarMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTopbarMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [topbarMenuOpen]);

  useEffect(() => {
    setTopbarMenuOpen(false);
  }, [pathname]);

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
  }, [router]);

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
      .then(async (data) => {
        if (!cancelled) {
          const email = ((data as AuthMeResponse).user?.email ?? null);
          setCurrentUserEmail(typeof email === 'string' && email.trim().length > 0 ? email : null);
          const isOnboardingPath =
            window.location.pathname === '/onboarding'
            || window.location.pathname.startsWith('/onboarding/');

          const onboarding = (await apiClient.get('/onboarding/status').catch(() => null)) as
            | OnboardingStatusResponse
            | null;
          if (cancelled) {
            return;
          }
          const completed = Boolean(onboarding?.completed);

          if (!completed && !isOnboardingPath) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.replace('/onboarding' as any);
          } else if (completed && isOnboardingPath) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.replace('/overview' as any);
          }
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
          setCurrentUserEmail(null);
          setAuthChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

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
        <DashboardNav userEmail={currentUserEmail} />

        <section className="min-w-0">
          <header className="panel dashboard-topbar">
            <div className="dashboard-topbar-inner">
              <div className="dashboard-topbar-slot dashboard-topbar-left">
                <Link href="/overview" className="dashboard-topbar-brand" aria-label="Go to overview">
                  <ThemeLogo width={22} height={22} className="dashboard-topbar-brand-logo" />
                </Link>
                <div ref={topbarMenuRef} className="dashboard-topbar-menu">
                  <button
                    type="button"
                    className={`dashboard-topbar-chip dashboard-topbar-chip-menu ${topbarMenuOpen ? 'dashboard-topbar-chip-open' : ''}`}
                    aria-label="Open header menu"
                    aria-expanded={topbarMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setTopbarMenuOpen((open) => !open)}
                  >
                    <IconProjects size={16} />
                    <span>Menu</span>
                    <span className={`dashboard-topbar-chevron ${topbarMenuOpen ? 'dashboard-topbar-chevron-open' : ''}`} aria-hidden="true">
                      v
                    </span>
                  </button>

                  <div className={`dashboard-topbar-dropdown ${topbarMenuOpen ? 'dashboard-topbar-dropdown-open' : ''}`} role="menu">
                    <p className="dashboard-topbar-dropdown-title">Quick Actions</p>
                    <div className="dashboard-topbar-dropdown-list">
                      <Link href="/projects" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconProjects size={16} />
                        <span>All Projects</span>
                      </Link>
                      <Link href="/projects/new" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconPlus size={16} />
                        <span>Create Project</span>
                      </Link>
                      {showContentMenu ? (
                        <Link href="/content" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                          <IconContent size={16} />
                          <span>Content</span>
                        </Link>
                      ) : null}
                      <Link href="/usage" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconUsage size={16} />
                        <span>Usage</span>
                      </Link>
                      <Link href="/security-center" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconShield size={16} />
                        <span>Security</span>
                      </Link>
                      <Link href="/billing" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconBilling size={16} />
                        <span>Billing</span>
                      </Link>
                      <Link href="/profile" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconProfile size={16} />
                        <span>Profile</span>
                      </Link>
                      <Link href="/settings" className="dashboard-topbar-dropdown-item" role="menuitem" onClick={() => setTopbarMenuOpen(false)}>
                        <IconSettings size={16} />
                        <span>Settings</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
              <div className="dashboard-topbar-slot dashboard-topbar-center">
                <h1 className="dashboard-topbar-title">{topbarTitle}</h1>
              </div>
              <div className="dashboard-topbar-slot dashboard-topbar-right">
                <TopbarSubscriptionChip />
                <TopbarNotifications />
                <Link href="/profile" className="dashboard-topbar-profile" aria-label="Open profile">
                  <IconProfile size={17} />
                  <span className="dashboard-topbar-profile-label">Profile</span>
                </Link>
                <Link href="/settings" className="dashboard-topbar-icon" aria-label="Open settings">
                  <IconSettings size={16} />
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

interface CurrentSubscriptionResponse {
  subscription?: {
    plan?: {
      displayName?: string | null;
    } | null;
  } | null;
}

function TopbarSubscriptionChip() {
  const { selectedOrganizationId } = useWorkspaceContext();
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!selectedOrganizationId) {
      setPlanName(null);
      return () => {
        cancelled = true;
      };
    }

    apiClient
      .get(`/plans/current?organizationId=${selectedOrganizationId}`)
      .then((data) => {
        if (cancelled) {
          return;
        }
        const current = (data as CurrentSubscriptionResponse).subscription?.plan?.displayName;
        setPlanName(typeof current === 'string' && current.trim().length > 0 ? current : null);
      })
      .catch(() => {
        if (!cancelled) {
          setPlanName(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrganizationId]);

  const hasPlan = Boolean(planName);

  return (
    <Link
      href="/billing"
      className={`dashboard-topbar-upgrade ${hasPlan ? 'dashboard-topbar-upgrade-gold' : ''}`}
      aria-label={hasPlan ? `Current subscription ${planName}` : 'Upgrade subscription'}
    >
      <IconBilling size={16} />
      <span className="dashboard-topbar-upgrade-label">{planName ?? 'Upgrade'}</span>
    </Link>
  );
}
