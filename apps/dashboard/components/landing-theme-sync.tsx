'use client';

import { useEffect } from 'react';

type LandingTheme = 'light' | 'dark';

const LANDING_THEME_STORAGE_KEY = 'apployd_landing_theme';
const DASHBOARD_THEME_STORAGE_KEY = 'apployd_dashboard_theme';
const THEME_PREFERENCE_SET_KEY = 'apployd_theme_preference_set';
const LANDING_THEME_ATTRIBUTE = 'data-landing-theme';
const LANDING_THEME_UPDATED_EVENT = 'apployd:landing-theme-updated';
const DASHBOARD_THEME_UPDATED_EVENT = 'apployd:dashboard-theme-updated';

function resolveTheme(): LandingTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const hasThemePreference = window.localStorage.getItem(THEME_PREFERENCE_SET_KEY) === '1';
  if (!hasThemePreference) {
    return 'light';
  }

  const landingTheme = window.localStorage.getItem(LANDING_THEME_STORAGE_KEY);
  if (landingTheme === 'light' || landingTheme === 'dark') {
    return landingTheme;
  }

  const dashboardTheme = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
  if (dashboardTheme === 'light' || dashboardTheme === 'dark') {
    return dashboardTheme;
  }

  return 'light';
}

function applyTheme(theme: LandingTheme) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute(LANDING_THEME_ATTRIBUTE, theme);
}

export function LandingThemeSync() {
  useEffect(() => {
    const syncTheme = () => {
      const theme = resolveTheme();
      if (window.localStorage.getItem(THEME_PREFERENCE_SET_KEY) !== '1') {
        window.localStorage.setItem(LANDING_THEME_STORAGE_KEY, 'light');
        window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, 'light');
      }
      applyTheme(theme);
    };

    syncTheme();

    window.addEventListener(LANDING_THEME_UPDATED_EVENT, syncTheme);
    window.addEventListener(DASHBOARD_THEME_UPDATED_EVENT, syncTheme);
    window.addEventListener('storage', syncTheme);

    return () => {
      window.removeEventListener(LANDING_THEME_UPDATED_EVENT, syncTheme);
      window.removeEventListener(DASHBOARD_THEME_UPDATED_EVENT, syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  return null;
}
