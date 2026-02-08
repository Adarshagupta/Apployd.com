'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { LandingThreeBackground } from '../../../components/landing-three-background';
import { SectionThreeBackground } from '../../../components/landing-section-three';
import { apiClient } from '../../../lib/api';

import styles from '../auth.module.css';

export default function SignupPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    organizationSlug: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [githubSubmitting, setGithubSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await apiClient.post('/auth/signup', form);
      window.localStorage.setItem('apployd_token', data.token);
      router.push('/overview');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onGithubSignup = async () => {
    setError('');
    setGithubSubmitting(true);

    try {
      const nextRaw = searchParams.get('next');
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
        <SectionThreeBackground className={styles.shellCanvas ?? ''} variant="product" />
        <aside className={styles.heroColumn}>
          <div className={styles.heroInner}>
            <p className={styles.meta}>Start Workspace</p>
            <h1 className={styles.title}>Build your control plane.</h1>
            <p className={styles.subtitle}>
              Create your account, initialize an organization, and start deploying backend services with deterministic
              workflows.
            </p>
            <div className={styles.heroMetrics}>
              <article className={styles.metricCard}>
                <p>Projects</p>
                <strong>Provision in Minutes</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Environment</p>
                <strong>Secure Variables</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Team</p>
                <strong>Role-based Access</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Billing</p>
                <strong>Usage Governance</strong>
              </article>
            </div>
          </div>
        </aside>

        <div className={styles.formColumn}>
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <p>Apployd</p>
              <h2>Create account</h2>
              <span>This also creates your first organization on the free plan.</span>
            </header>

            <form onSubmit={onSubmit} className={`${styles.form} ${styles.formGridTwo}`}>
              <button
                type="button"
                className={`${styles.githubButton} ${styles.full}`}
                onClick={onGithubSignup}
                disabled={githubSubmitting || submitting}
              >
                {githubSubmitting ? 'Redirecting to GitHub...' : 'Continue with GitHub'}
              </button>

              <div className={`${styles.divider} ${styles.full}`}>
                <span>or create with email</span>
              </div>

              <label className={`${styles.label} ${styles.full}`}>
                <span className={styles.labelText}>Full name</span>
                <input
                  placeholder="Your name"
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  className={styles.input}
                  required
                />
              </label>

              <label className={`${styles.label} ${styles.full}`}>
                <span className={styles.labelText}>Email</span>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  className={styles.input}
                  required
                />
              </label>

              <label className={`${styles.label} ${styles.full}`}>
                <span className={styles.labelText}>Password</span>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                  className={styles.input}
                  required
                />
              </label>

              <label className={styles.label}>
                <span className={styles.labelText}>Organization name</span>
                <input
                  placeholder="Acme Platform Team"
                  value={form.organizationName}
                  onChange={(event) => update('organizationName', event.target.value)}
                  className={styles.input}
                  required
                />
              </label>

              <label className={styles.label}>
                <span className={styles.labelText}>Organization slug</span>
                <input
                  placeholder="acme-platform"
                  value={form.organizationSlug}
                  onChange={(event) => update('organizationSlug', event.target.value.toLowerCase())}
                  className={styles.input}
                  required
                />
              </label>

              <button type="submit" className={`${styles.submit} ${styles.full}`} disabled={submitting}>
                {submitting ? 'Creating account...' : 'Create account'}
              </button>
              {error ? <p className={`${styles.error} ${styles.full}`}>{error}</p> : null}
            </form>

            <p className={styles.switchText}>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
