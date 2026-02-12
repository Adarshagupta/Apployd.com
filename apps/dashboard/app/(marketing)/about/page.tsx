import type { Metadata } from 'next';

import { buildPageMetadata } from '../../../lib/seo';
import styles from '../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'About',
  description:
    'Learn how Apployd helps engineering teams own their infrastructure with secure, developer-first deployment workflows.',
  path: '/about',
  keywords: ['about Apployd', 'deployment platform company', 'developer-first infrastructure'],
});

const stats = [
  { value: '47s', label: 'Avg. deploy time' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '70%', label: 'Cost reduction' },
  { value: '<100ms', label: 'P95 latency' },
];

const values = [
  {
    title: 'Developer-First',
    body: 'Every feature starts with the question: "Does this make a developer\'s day better?" If the answer isn\'t a clear yes, we don\'t ship it.',
    icon: '⌘',
  },
  {
    title: 'Open by Default',
    body: 'Apployd is source-available. Inspect every line. Fork it, extend it, contribute back. No black boxes.',
    icon: '◇',
  },
  {
    title: 'Own Your Infrastructure',
    body: 'Your servers, your data, your rules. We give you the tools — you keep the control.',
    icon: '⬡',
  },
  {
    title: 'Security Non-Negotiable',
    body: 'AES-256-GCM encryption, read-only containers, RBAC, audit logs. Security isn\'t a feature — it\'s the foundation.',
    icon: '⊡',
  },
];

const timeline = [
  { date: 'Aug 2025', event: 'Idea born — frustrated by PaaS lock-in and egress fees.' },
  { date: 'Oct 2025', event: 'First prototype: Docker-based deploys from git push on a single VPS.' },
  { date: 'Dec 2025', event: 'Multi-server support, rolling deploys, real-time logs.' },
  { date: 'Jan 2026', event: 'Public beta launch with universal Dockerfile auto-detection.' },
  { date: 'Feb 2026', event: 'Team RBAC, audit logging, GitHub integration.' },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>About</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Deployment should be boring
          </h1>
          <p style={{ maxWidth: 600, margin: '1rem auto 0', fontSize: '1.05rem', color: 'rgba(212,221,244,0.7)' }}>
            We&apos;re building the deployment platform we always wanted — one that runs on your servers, respects your data, and just works.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className={styles.section} style={{ paddingTop: 0, paddingBottom: '2rem', borderTop: 'none' }}>
        <div className={styles.container}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
              borderRadius: 14,
              border: '1px solid rgba(161,178,216,0.14)',
              background: 'rgba(8,10,16,0.5)',
              padding: '1.4rem 1.6rem',
              textAlign: 'center',
            }}
          >
            {stats.map((s) => (
              <div key={s.label}>
                <p style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: '#6bb4ff' }}>{s.value}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'rgba(200,210,240,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2.5rem', alignItems: 'start' }}>
            <div>
              <p className={styles.sectionLabel}>Mission</p>
              <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)' }}>
                Give every team Render-level DX on infrastructure they own
              </h2>
            </div>
            <div style={{ fontSize: '0.95rem', color: 'rgba(212,221,244,0.7)', lineHeight: 1.7 }}>
              <p style={{ margin: 0 }}>
                Modern PaaS platforms deliver incredible developer experiences — git push deploys, instant previews, zero-config scaling.
                But they come with trade-offs: vendor lock-in, unpredictable pricing, and zero visibility into where your code actually runs.
              </p>
              <p style={{ marginTop: '1rem' }}>
                Apployd bridges that gap. We package the best deployment UX into a self-hosted platform that runs on any Linux server.
                You bring the machines; we handle the rest — builds, routing, TLS, scaling, and monitoring.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className={styles.section}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>Values</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '2rem' }}>
            What we believe
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.2rem' }}>
            {values.map((v) => (
              <div
                key={v.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.5rem',
                }}
              >
                <span style={{ fontSize: '1.4rem', display: 'block', marginBottom: '0.6rem' }}>{v.icon}</span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{v.title}</h3>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', color: 'rgba(200,210,240,0.6)', lineHeight: 1.55 }}>
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <p className={styles.sectionLabel}>Timeline</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '2rem' }}>
            Our journey so far
          </h2>
          <div style={{ display: 'grid', gap: '0' }}>
            {timeline.map((t, i) => (
              <div
                key={t.date}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 24px 1fr',
                  gap: '0.8rem',
                  alignItems: 'start',
                  paddingBottom: i < timeline.length - 1 ? '1.8rem' : 0,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono), monospace',
                    fontSize: '0.76rem',
                    color: 'rgba(200,210,240,0.5)',
                    textAlign: 'right',
                    paddingTop: '0.15rem',
                  }}
                >
                  {t.date}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: '2px solid #2a8dff',
                      background: i === timeline.length - 1 ? '#2a8dff' : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                  {i < timeline.length - 1 && (
                    <span style={{ width: 1, flex: 1, background: 'rgba(42,141,255,0.25)', minHeight: 30 }} />
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(220,228,248,0.8)', lineHeight: 1.5 }}>
                  {t.event}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)' }}>
            Join us on this journey
          </h2>
          <p style={{ maxWidth: 480, margin: '0.8rem auto 0', fontSize: '1rem', color: 'rgba(212,221,244,0.7)' }}>
            Whether you contribute code, file issues, or just deploy your next project — you&apos;re part of the story.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.6rem' }}>
            <a href="/signup" className={styles.primaryButton}>Get Started</a>
            <a href="https://github.com" className={styles.secondaryButton}>View on GitHub</a>
          </div>
        </div>
      </section>
    </>
  );
}
