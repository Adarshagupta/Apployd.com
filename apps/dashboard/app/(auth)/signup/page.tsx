'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LandingThreeBackground } from '../../../components/landing-three-background';
import { SectionThreeBackground } from '../../../components/landing-section-three';
import { apiClient } from '../../../lib/api';

import styles from '../auth.module.css';

export const dynamic = 'force-dynamic';

type SignupStep = 'signup' | 'verify';

export default function SignupPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    organizationSlug: '',
  });
  const [step, setStep] = useState<SignupStep>('signup');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [githubSubmitting, setGithubSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = window.localStorage.getItem('apployd_token');
    if (token) {
      router.replace('/overview');
    }
  }, [router]);

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await apiClient.post('/auth/signup', form);
      if (data.token) {
        window.localStorage.setItem('apployd_token', data.token);
        router.push('/overview');
        return;
      }

      if (data.verificationRequired) {
        setStep('verify');
        setVerificationEmail(data.email ?? form.email);
        setVerificationMessage(data.message ?? 'A verification code has been sent to your email.');
        setDevCode(typeof data.devCode === 'string' ? data.devCode : '');
        return;
      }

      throw new Error('Unexpected signup response. Please try again.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setVerificationSubmitting(true);

    try {
      const data = await apiClient.post('/auth/verify-email', {
        email: verificationEmail,
        code: verificationCode,
      });
      window.localStorage.setItem('apployd_token', data.token);
      router.push('/overview');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerificationSubmitting(false);
    }
  };

  const onResendCode = async () => {
    setError('');
    setResending(true);

    try {
      const data = await apiClient.post('/auth/resend-verification-code', {
        email: verificationEmail,
      });
      setVerificationMessage(data.message ?? 'Verification code sent.');
      setDevCode(typeof data.devCode === 'string' ? data.devCode : '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResending(false);
    }
  };

  const onGithubSignup = async () => {
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
              <h2>{step === 'signup' ? 'Create account' : 'Verify email'}</h2>
              <span>
                {step === 'signup'
                  ? 'This also creates your first organization on the free plan.'
                  : 'Enter the 6-digit code sent to your email to complete registration.'}
              </span>
            </header>

            {step === 'signup' ? (
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
            ) : (
              <form onSubmit={onVerifySubmit} className={styles.form}>
                {verificationMessage ? <p>{verificationMessage}</p> : null}

                <label className={styles.label}>
                  <span className={styles.labelText}>Email</span>
                  <input
                    type="email"
                    value={verificationEmail}
                    onChange={(event) => setVerificationEmail(event.target.value)}
                    className={styles.input}
                    required
                  />
                </label>

                <label className={styles.label}>
                  <span className={styles.labelText}>Verification code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    placeholder="123456"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={styles.input}
                    required
                  />
                </label>

                <button type="submit" className={styles.submit} disabled={verificationSubmitting}>
                  {verificationSubmitting ? 'Verifying...' : 'Verify and continue'}
                </button>

                <button
                  type="button"
                  className={styles.githubButton}
                  onClick={onResendCode}
                  disabled={resending || verificationSubmitting}
                >
                  {resending ? 'Sending code...' : 'Resend code'}
                </button>

                {devCode ? <p>Development code: {devCode}</p> : null}
                {error ? <p className={styles.error}>{error}</p> : null}
              </form>
            )}

            <p className={styles.switchText}>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
