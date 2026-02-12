import type { Metadata } from 'next';

import { buildPageMetadata } from '../../../lib/seo';
import styles from '../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Security',
  description:
    'Review Apployd security architecture including encryption, runtime isolation, RBAC, audit logging, and hardening practices.',
  path: '/security',
  keywords: ['platform security', 'deployment security', 'Apployd security'],
});

const features = [
  {
    title: 'AES-256-GCM Encryption',
    description: 'Every secret is encrypted at rest with AES-256-GCM and a unique IV. Decryption happens only at container injection time.',
    icon: '🔐',
  },
  {
    title: 'Read-Only Containers',
    description: 'All application containers run with read-only root filesystems by default, preventing runtime tampering and persistence attacks.',
    icon: '🛡',
  },
  {
    title: 'Role-Based Access Control',
    description: 'Granular RBAC with owner, admin, developer, and viewer roles. Scope permissions per project, per team.',
    icon: '👥',
  },
  {
    title: 'Audit Logging',
    description: 'Every action — deploys, secret changes, team modifications — is logged with actor, timestamp, and IP for full traceability.',
    icon: '📋',
  },
  {
    title: 'Network Isolation',
    description: 'Each project runs in its own Docker network. Inter-project communication is blocked by default with strict iptables rules.',
    icon: '🌐',
  },
  {
    title: 'Minimal Base Images',
    description: 'Build artifacts run on distroless or Alpine-based images with no shell, no package manager, minimal attack surface.',
    icon: '📦',
  },
];

const practices = [
  {
    title: 'Secret Injection',
    items: [
      'Secrets never written to disk or build layers',
      'Injected as environment variables at container start',
      'Per-environment secret scoping (dev / staging / prod)',
      'Automatic secret rotation support',
    ],
  },
  {
    title: 'Build Security',
    items: [
      'Isolated build environments per project',
      'No root access during builds',
      'Build cache separated per project',
      'Automatic vulnerability scanning of base images',
    ],
  },
  {
    title: 'Runtime Security',
    items: [
      'Read-only filesystems enforced',
      'No privileged containers',
      'Resource limits (CPU, memory) per container',
      'Health-check-driven restarts',
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      'TLS everywhere — API, dashboard, inter-service',
      'SSH key-based server authentication',
      'Automatic certificate provisioning via Let\'s Encrypt',
      'Reverse proxy with rate limiting and DDoS mitigation',
    ],
  },
];

const compliance = [
  { name: 'SOC 2 Type II', status: 'In Progress', badge: 'progress' },
  { name: 'GDPR', status: 'Active', badge: 'active' },
  { name: 'HIPAA', status: 'In Progress', badge: 'progress' },
  { name: 'ISO 27001', status: 'In Progress', badge: 'progress' },
  { name: 'Data Residency', status: 'Active', badge: 'active' },
  { name: 'Encryption at Rest', status: 'Active', badge: 'active' },
  { name: 'Encryption in Transit', status: 'Active', badge: 'active' },
  { name: 'Audit Trail', status: 'Active', badge: 'active' },
];

export default function SecurityPage() {
  return (
    <>
      {/* Hero */}
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Security</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Security is the foundation
          </h1>
          <p style={{ maxWidth: 580, margin: '1rem auto 0', fontSize: '1.05rem', color: 'rgba(212,221,244,0.7)' }}>
            Not a feature, not an add-on. Every layer of Apployd is built with security as the default.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.2rem' }}>
            {features.map((f) => (
              <div
                key={f.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.4rem',
                }}
              >
                <span style={{ fontSize: '1.6rem', display: 'block', marginBottom: '0.6rem' }}>{f.icon}</span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{f.title}</h3>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', color: 'rgba(200,210,240,0.6)', lineHeight: 1.55 }}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Practices */}
      <section className={styles.section}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>Practices</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '2rem' }}>
            Defense in depth
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.2rem' }}>
            {practices.map((p) => (
              <div
                key={p.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.4rem',
                }}
              >
                <h3 style={{ margin: '0 0 0.8rem', fontSize: '1rem', fontWeight: 600 }}>{p.title}</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
                  {p.items.map((item) => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.84rem', color: 'rgba(220,228,248,0.75)' }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: '0.15rem' }}>
                        <path d="M3 8.5l3 3 7-7" stroke="#2a8dff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 700 }}>
          <p className={styles.sectionLabel}>Compliance</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '2rem' }}>
            Compliance &amp; certifications
          </h2>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(161,178,216,0.14)',
              background: 'rgba(8,10,16,0.5)',
              overflow: 'hidden',
            }}
          >
            {compliance.map((c, i) => (
              <div
                key={c.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1.2rem',
                  borderTop: i > 0 ? '1px solid rgba(161,178,216,0.08)' : 'none',
                }}
              >
                <span style={{ fontSize: '0.9rem', color: 'rgba(220,228,248,0.85)' }}>{c.name}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    borderRadius: 999,
                    padding: '0.22rem 0.6rem',
                    color: c.badge === 'active' ? '#4ade80' : '#facc15',
                    background: c.badge === 'active' ? 'rgba(74,222,128,0.1)' : 'rgba(250,204,21,0.1)',
                    border: `1px solid ${c.badge === 'active' ? 'rgba(74,222,128,0.25)' : 'rgba(250,204,21,0.25)'}`,
                  }}
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 700 }}>
          <p className={styles.sectionLabel}>Architecture</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.3rem, 2.5vw, 1.8rem)', marginBottom: '1.4rem' }}>
            Security architecture overview
          </h2>
          <pre
            style={{
              borderRadius: 14,
              border: '1px solid rgba(161,178,216,0.14)',
              background: 'rgba(8,10,16,0.6)',
              padding: '1.4rem',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono), monospace',
              color: 'rgba(200,210,240,0.7)',
              overflowX: 'auto',
              lineHeight: 1.6,
            }}
          >
{`┌─────────────────────────────────────────────────┐
│                  HTTPS / TLS                     │
│  ┌─────────┐   ┌──────────┐   ┌──────────────┐  │
│  │ Dashboard│──▶│ API (mTLS)│──▶│  PostgreSQL   │  │
│  │  (Next)  │   │ (Fastify) │   │  (encrypted)  │  │
│  └─────────┘   └─────┬────┘   └──────────────┘  │
│                       │                           │
│               ┌───────▼───────┐                   │
│               │  Deploy Engine │                   │
│               │  (isolated)    │                   │
│               └───────┬───────┘                   │
│                       │                           │
│         ┌─────────────▼──────────────┐            │
│         │   Docker Network (per-proj) │            │
│         │  ┌──────┐ ┌──────┐ ┌─────┐ │            │
│         │  │ app  │ │ app  │ │ app │ │            │
│         │  │ (ro) │ │ (ro) │ │(ro) │ │            │
│         │  └──────┘ └──────┘ └─────┘ │            │
│         └────────────────────────────┘            │
└─────────────────────────────────────────────────┘`}
          </pre>
        </div>
      </section>

      {/* Responsible Disclosure */}
      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            Responsible disclosure
          </h2>
          <p style={{ maxWidth: 520, margin: '0.8rem auto 0', fontSize: '0.95rem', color: 'rgba(212,221,244,0.7)', lineHeight: 1.6 }}>
            Found a vulnerability? We take security reports seriously. Please email{' '}
            <span style={{ color: '#6bb4ff' }}>security@apployd.dev</span>{' '}
            and we&apos;ll respond within 24 hours.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.6rem' }}>
            <a href="mailto:security@apployd.dev" className={styles.primaryButton}>
              Report a Vulnerability
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
