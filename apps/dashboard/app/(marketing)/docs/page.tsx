import Link from 'next/link';

import styles from '../../landing.module.css';

const quickStartSteps = [
  {
    title: 'Create a project',
    body: 'Start in the dashboard and define repository, branch, and runtime resources.',
  },
  {
    title: 'Configure environment',
    body: 'Add required environment variables and secrets before triggering deployments.',
  },
  {
    title: 'Deploy and verify',
    body: 'Run deployment, monitor logs, and confirm health checks before traffic cutover.',
  },
  {
    title: 'Monitor usage',
    body: 'Track CPU, RAM, and bandwidth in Usage to keep pool consumption predictable.',
  },
];

const docsIndex = [
  {
    title: 'Architecture',
    description: 'System components, request flow, and service boundaries.',
    file: 'docs/architecture.md',
  },
  {
    title: 'Database',
    description: 'Schema design and persistence responsibilities.',
    file: 'docs/database.md',
  },
  {
    title: 'Networking',
    description: 'Ingress, proxying, and runtime network topology.',
    file: 'docs/networking.md',
  },
  {
    title: 'Security',
    description: 'Security controls and hardening guidelines.',
    file: 'docs/security.md',
  },
  {
    title: 'Scaling',
    description: 'Capacity planning and horizontal scaling strategy.',
    file: 'docs/scaling.md',
  },
  {
    title: 'Deployment Runbook',
    description: 'Operational deployment checklist and rollback process.',
    file: 'docs/deployment-runbook.md',
  },
];

const apiEndpoints = [
  'POST /auth/login',
  'GET /auth/me',
  'GET /usage/summary',
  'GET /deployments/recent',
  'POST /projects',
  'POST /deployments',
];

export default function DocsPage() {
  return (
    <>
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Docs</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Documentation hub
          </h1>
          <p style={{ maxWidth: 620, margin: '1rem auto 0', fontSize: '1.02rem', color: 'rgba(212,221,244,0.7)' }}>
            Product guides, technical references, and operational runbooks for Apployd platform teams.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, borderTop: 'none' }}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>Quick Start</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '1.6rem' }}>
            From empty repo to production deploy
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {quickStartSteps.map((step, index) => (
              <article
                key={step.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.3rem',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.74rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,210,240,0.5)' }}>
                  Step {index + 1}
                </p>
                <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.02rem', fontWeight: 600 }}>{step.title}</h3>
                <p style={{ margin: '0.55rem 0 0', fontSize: '0.88rem', color: 'rgba(200,210,240,0.65)', lineHeight: 1.55 }}>
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>References</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '1.6rem' }}>
            Core documentation files
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {docsIndex.map((doc) => (
              <article
                key={doc.file}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.2rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{doc.title}</h3>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.86rem', color: 'rgba(200,210,240,0.62)', lineHeight: 1.5 }}>
                  {doc.description}
                </p>
                <p style={{ margin: '0.7rem 0 0', fontFamily: 'var(--font-mono), monospace', fontSize: '0.75rem', color: 'rgba(160,178,216,0.78)' }}>
                  {doc.file}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 740 }}>
          <p className={styles.sectionLabel}>API</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.3rem, 2.5vw, 1.8rem)', marginBottom: '1rem' }}>
            Common endpoints
          </h2>
          <pre
            style={{
              borderRadius: 14,
              border: '1px solid rgba(161,178,216,0.14)',
              background: 'rgba(8,10,16,0.6)',
              padding: '1.2rem',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono), monospace',
              color: 'rgba(200,210,240,0.74)',
              overflowX: 'auto',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
{apiEndpoints.join('\n')}
          </pre>
          <p style={{ margin: '0.8rem 0 0', fontSize: '0.82rem', color: 'rgba(190,205,236,0.62)' }}>
            Full OpenAPI spec: <span style={{ fontFamily: 'var(--font-mono), monospace' }}>docs/api/openapi.yaml</span>
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            Need a specific guide?
          </h2>
          <p style={{ maxWidth: 560, margin: '0.8rem auto 0', fontSize: '0.94rem', color: 'rgba(212,221,244,0.68)' }}>
            Open the Help Center for support channels, FAQ, and setup assistance from the team.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <Link href="/help" className={styles.primaryButton}>
              Open Help Center
            </Link>
            <Link href="/contact" className={styles.secondaryButton}>
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
