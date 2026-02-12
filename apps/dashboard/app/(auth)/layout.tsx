import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { LandingThemeToggle } from '../../components/landing-theme-toggle';
import { noIndexRobots } from '../../lib/seo';

import styles from './auth.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Authentication',
  description: 'Sign in or create an account to access your workspace.',
  robots: noIndexRobots,
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.themeDock}>
        <LandingThemeToggle className={styles.themeToggle} />
      </div>
      {children}
    </>
  );
}
