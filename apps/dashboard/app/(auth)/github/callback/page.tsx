'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { LandingThreeBackground } from '../../../../components/landing-three-background';
import { SectionThreeBackground } from '../../../../components/landing-section-three';
import { apiClient } from '../../../../lib/api';

import styles from '../../auth.module.css';

const resolveSafePath = (value: string | null | undefined, fallback = '/overview') => {
  if (!value) {
    return fallback;
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  return fallback;
};

export default function GitHubAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const next = resolveSafePath(searchParams.get('next'), '/overview');

  useEffect(() => {
    let canceled = false;

    const completeOAuthLogin = async () => {
      if (!code) {
        const target = `/login?githubLogin=error&githubMessage=${encodeURIComponent(
          'Missing GitHub login code.',
        )}&next=${encodeURIComponent(next)}`;
        router.replace(target);
        return;
      }

      try {
        const payload = await apiClient.post('/auth/github/exchange', { code });
        if (canceled) {
          return;
        }

        if (!payload?.token) {
          throw new Error('GitHub login token is missing.');
        }

        window.localStorage.setItem('apployd_token', payload.token);
        const redirectTo = resolveSafePath(payload.redirectTo, next);
        router.replace(redirectTo);
      } catch (error) {
        if (canceled) {
          return;
        }

        const message = (error as Error).message || 'GitHub login failed.';
        const target = `/login?githubLogin=error&githubMessage=${encodeURIComponent(
          message,
        )}&next=${encodeURIComponent(next)}`;
        router.replace(target);
      }
    };

    completeOAuthLogin().catch(() => undefined);

    return () => {
      canceled = true;
    };
  }, [code, next, router]);

  return (
    <main className={styles.page}>
      <LandingThreeBackground className={styles.globalCanvas ?? ''} />
      <div className={styles.vignette} />

      <section className={styles.shell}>
        <SectionThreeBackground className={styles.shellCanvas ?? ''} variant="hero" />
        <aside className={styles.heroColumn}>
          <div className={styles.heroInner}>
            <p className={styles.meta}>GitHub OAuth</p>
            <h1 className={styles.title}>Signing you in.</h1>
            <p className={styles.subtitle}>
              Finalizing secure GitHub authentication and preparing your workspace.
            </p>
          </div>
        </aside>

        <div className={styles.formColumn}>
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <p>Apployd</p>
              <h2>Completing sign-in</h2>
              <span>You will be redirected automatically.</span>
            </header>
          </article>
        </div>
      </section>
    </main>
  );
}
