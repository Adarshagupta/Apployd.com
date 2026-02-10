'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LandingThreeBackground } from '../../../components/landing-three-background';
import { SectionThreeBackground } from '../../../components/landing-section-three';
import { apiClient } from '../../../lib/api';

import styles from '../auth.module.css';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [githubSubmitting, setGithubSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Redirect if already logged in
    const token = window.localStorage.getItem('apployd_token');
    if (token) {
      const nextRaw = searchParams?.get('next') ?? null;
      const nextPath =
        nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/overview';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(nextPath as any);
    }
  }, [router, searchParams]);

  useEffect(() => {
    const githubLoginState = searchParams?.get('githubLogin');
    const githubMessage = searchParams?.get('githubMessage');

    if (githubLoginState === 'error') {
      setError(githubMessage ?? 'GitHub sign-in failed.');
    }
  }, [searchParams]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await apiClient.post('/auth/login', { email, password });
      window.localStorage.setItem('apployd_token', data.token);
      const nextRaw = searchParams?.get('next') ?? null;
      const nextPath =
        nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/overview';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(nextPath as any);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onGithubLogin = async () => {
    setError('');
    setGithubSubmitting(true);

    try {
      const nextRaw = searchParams?.get('next') ?? null;
      const nextPath =
        nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/overview';
      const data = await apiClient.get(
        `/auth/github/login-url?next=${encodeURIComponent(nextPath)}`,
      );
      if (!data.url) {
        throw new Error('GitHub authorize URL is missing.');
      }
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setGithubSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <LandingThreeBackground className={styles.globalCanvas ?? ''} />
      <div className={styles.vignette} />

      <section className={styles.shell}>
        <SectionThreeBackground className={styles.shellCanvas ?? ''} variant="hero" />
        <aside className={styles.heroColumn}>
          <div className={styles.heroInner}>
            <p className={styles.meta}>Secure Access</p>
            <h1 className={styles.title}>Welcome back.</h1>
            <p className={styles.subtitle}>
              Continue from where you left off and monitor live backend delivery with full deployment visibility.
            </p>
            <div className={styles.heroMetrics}>
              <article className={styles.metricCard}>
                <p>Deployment Stream</p>
                <strong>Live Events</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Secrets</p>
                <strong>Encrypted at Rest</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Runtime</p>
                <strong>Resource Boundaries</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Queue</p>
                <strong>Idempotent Requests</strong>
              </article>
            </div>
          </div>
        </aside>

        <div className={styles.formColumn}>
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <p>Apployd</p>
              <h2>Sign in</h2>
              <span>Use your workspace credentials to continue.</span>
            </header>

            <form onSubmit={onSubmit} className={styles.form}>
              <button
                type="button"
                className={styles.githubButton}
                onClick={onGithubLogin}
                disabled={githubSubmitting || submitting}
              >
                {githubSubmitting ? 'Redirecting to GitHub...' : 'Continue with GitHub'}
              </button>

              <div className={styles.divider}>
                <span>or sign in with email</span>
              </div>

              <label className={styles.label}>
                <span className={styles.labelText}>Email</span>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={styles.input}
                  required
                />
              </label>

              <label className={styles.label}>
                <span className={styles.labelText}>Password</span>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={styles.input}
                  required
                />
              </label>

              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
              {error ? <p className={styles.error}>{error}</p> : null}
            </form>

            <p className={styles.switchText}>
              New to Apployd? <Link href="/signup">Create account</Link>
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
