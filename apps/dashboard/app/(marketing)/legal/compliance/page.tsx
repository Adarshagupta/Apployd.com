import type { Metadata } from 'next';
import Link from 'next/link';

import { buildPageMetadata } from '../../../../lib/seo';
import styles from '../../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Compliance',
  description:
    'Compliance posture, control areas, and governance practices for operating Apployd in regulated environments.',
  path: '/legal/compliance',
  keywords: ['compliance', 'GDPR', 'SOC 2', 'ISO 27001', 'Apployd compliance'],
});

const complianceItems = [
  { name: 'GDPR', status: 'Active', details: 'Data processing controls and user rights workflows are in place.' },
  { name: 'CCPA/CPRA', status: 'Active', details: 'Processes support access, deletion, and disclosure obligations.' },
  { name: 'SOC 2 Type II', status: 'In Progress', details: 'Control evidence collection and policy documentation are ongoing.' },
  { name: 'ISO 27001', status: 'In Progress', details: 'Security management framework mapping and control alignment are underway.' },
  { name: 'Encryption in Transit', status: 'Active', details: 'TLS is enforced across dashboard, API, and service communications.' },
  { name: 'Encryption at Rest', status: 'Active', details: 'Platform data and secrets storage are protected with encryption controls.' },
];

const controlAreas = [
  {
    title: 'Access Control',
    points: [
      'Role-based access control for organizations and projects.',
      'Scoped permissions for owner, admin, developer, and viewer roles.',
      'Auditable access-change history for governance reviews.',
    ],
  },
  {
    title: 'Operational Security',
    points: [
      'Runtime isolation with project-level network separation.',
      'Deployment logs and event trails for incident investigations.',
      'Continuous hardening of build and runtime workflows.',
    ],
  },
  {
    title: 'Data Governance',
    points: [
      'Defined retention boundaries for operational and billing records.',
      'Policy-driven handling for privacy and legal requests.',
      'Support for customer-controlled infrastructure ownership models.',
    ],
  },
];

export default function CompliancePage() {
  return (
    <>
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Legal</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.1rem, 5vw, 3.4rem)' }}>
            Compliance Program
          </h1>
          <p style={{ maxWidth: 640, margin: '1rem auto 0', fontSize: '1.02rem', color: 'rgba(212,221,244,0.7)' }}>
            Security and privacy controls that support enterprise governance and regulatory obligations.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, borderTop: 'none' }}>
        <div className={styles.container} style={{ maxWidth: 820 }}>
          <p className={styles.sectionLabel}>Status</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '1.4rem' }}>
            Compliance posture
          </h2>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(161,178,216,0.14)',
              background: 'rgba(8,10,16,0.5)',
              overflow: 'hidden',
            }}
          >
            {complianceItems.map((item, index) => {
              const isActive = item.status === 'Active';
              return (
                <article
                  key={item.name}
                  style={{
                    padding: '0.95rem 1.15rem',
                    borderTop: index > 0 ? '1px solid rgba(161,178,216,0.08)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{item.name}</h3>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        borderRadius: 999,
                        padding: '0.22rem 0.55rem',
                        color: isActive ? '#4ade80' : '#facc15',
                        background: isActive ? 'rgba(74,222,128,0.1)' : 'rgba(250,204,21,0.1)',
                        border: `1px solid ${isActive ? 'rgba(74,222,128,0.25)' : 'rgba(250,204,21,0.25)'}`,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.84rem', color: 'rgba(200,210,240,0.62)', lineHeight: 1.55 }}>
                    {item.details}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>Controls</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '1.4rem' }}>
            Program control areas
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {controlAreas.map((area) => (
              <article
                key={area.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.25rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{area.title}</h3>
                <ul style={{ margin: '0.65rem 0 0', listStyle: 'none', padding: 0, display: 'grid', gap: '0.42rem' }}>
                  {area.points.map((point) => (
                    <li key={point} style={{ fontSize: '0.86rem', color: 'rgba(200,210,240,0.66)', lineHeight: 1.5 }}>
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.3rem, 2.6vw, 1.8rem)' }}>
            Compliance documentation request
          </h2>
          <p style={{ maxWidth: 560, margin: '0.8rem auto 0', fontSize: '0.92rem', color: 'rgba(200,210,240,0.65)' }}>
            Contact our team for security questionnaires, policy details, and enterprise review workflows.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <Link href="/privacy" className={styles.secondaryButton}>
              Privacy Policy
            </Link>
            <Link href="/terms" className={styles.secondaryButton}>
              Terms and Conditions
            </Link>
            <Link href="/contact" className={styles.primaryButton}>
              Contact Compliance
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
