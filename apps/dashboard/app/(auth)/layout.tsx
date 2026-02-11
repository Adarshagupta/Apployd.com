import type { ReactNode } from 'react';

import { LandingThemeToggle } from '../../components/landing-theme-toggle';

import styles from './auth.module.css';

export const dynamic = 'force-dynamic';

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
