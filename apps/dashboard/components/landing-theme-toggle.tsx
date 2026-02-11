'use client';

import { useEffect, useState } from 'react';

type LandingTheme = 'light' | 'dark';

const LANDING_THEME_STORAGE_KEY = 'apployd_landing_theme';
const DASHBOARD_THEME_STORAGE_KEY = 'apployd_dashboard_theme';
const LANDING_THEME_ATTRIBUTE = 'data-landing-theme';
const LANDING_THEME_UPDATED_EVENT = 'apployd:landing-theme-updated';
const DASHBOARD_THEME_UPDATED_EVENT = 'apployd:dashboard-theme-updated';

type LandingThemeToggleProps = {
  className?: string;
};

function applyLandingTheme(theme: LandingTheme) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute(LANDING_THEME_ATTRIBUTE, theme);
}

export function LandingThemeToggle({ className }: LandingThemeToggleProps) {
  const [theme, setTheme] = useState<LandingTheme>('dark');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(LANDING_THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      applyLandingTheme(stored);
      return;
    }

    const dashboardStored = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    if (dashboardStored === 'light' || dashboardStored === 'dark') {
      setTheme(dashboardStored);
      applyLandingTheme(dashboardStored);
      return;
    }

    const initialTheme: LandingTheme = window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
    setTheme(initialTheme);
    applyLandingTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANDING_THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, theme);
    applyLandingTheme(theme);
    window.dispatchEvent(new Event(LANDING_THEME_UPDATED_EVENT));
    window.dispatchEvent(new Event(DASHBOARD_THEME_UPDATED_EVENT));
  }, [theme]);

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={isLight}
    >
      <span>{isLight ? 'Dark' : 'Light'}</span>
      <strong>{isLight ? 'ON' : 'OFF'}</strong>
    </button>
  );
}
