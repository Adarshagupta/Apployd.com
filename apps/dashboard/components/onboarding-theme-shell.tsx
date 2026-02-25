'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

type DashboardTheme = 'light' | 'dark';

const DASHBOARD_THEME_STORAGE_KEY = 'apployd_dashboard_theme';
const DASHBOARD_THEME_UPDATED_EVENT = 'apployd:dashboard-theme-updated';

export function OnboardingThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<DashboardTheme>('dark');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
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

    const syncThemeFromStorage = () => {
      const stored = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      }
    };

    window.addEventListener(DASHBOARD_THEME_UPDATED_EVENT, syncThemeFromStorage);
    window.addEventListener('storage', syncThemeFromStorage);

    return () => {
      window.removeEventListener(DASHBOARD_THEME_UPDATED_EVENT, syncThemeFromStorage);
      window.removeEventListener('storage', syncThemeFromStorage);
    };
  }, []);

  const shellClassName = useMemo(
    () => `app-shell ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`,
    [theme],
  );

  return <div className={shellClassName}>{children}</div>;
}
