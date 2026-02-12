import type { Metadata } from 'next';
import Link from 'next/link';

import { buildPageMetadata } from '../../../lib/seo';
import styles from '../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Understand how Apployd collects, processes, secures, and retains account and operational data.',
  path: '/privacy',
  keywords: ['privacy policy', 'data processing', 'Apployd privacy'],
});

const effectiveDate = 'February 9, 2026';

const privacySections = [
  {
    title: 'Data We Collect',
    points: [
      'Account identity data such as name, email, and organization membership.',
      'Operational metadata such as deployment events, logs, usage counters, and audit records.',
      'Configuration details required to provide service features, including project runtime settings.',
    ],
  },
  {
    title: 'How We Use Data',
    points: [
      'To authenticate users and authorize actions through role-based access controls.',
      'To operate platform features including deployments, billing, usage metering, and security monitoring.',
      'To detect abuse, investigate incidents, and maintain service reliability.',
    ],
  },
  {
    title: 'Data Sharing',
    points: [
      'We do not sell personal data.',
      'We may share data with subprocessors strictly required for hosting, billing, and operational support.',
      'We may disclose information when required by law or to enforce platform security obligations.',
    ],
  },
  {
    title: 'Retention and Deletion',
    points: [
      'Operational records are retained only as long as needed for security, billing, and legal obligations.',
      'Customers may request deletion of account data, subject to mandatory retention requirements.',
      'Backup retention windows may temporarily delay permanent deletion from all storage replicas.',
    ],
  },
  {
    title: 'Security Controls',
    points: [
      'Sensitive data is protected using encryption in transit and encryption at rest controls.',
      'Access to internal systems follows least-privilege practices and audit logging.',
      'Security reviews are performed to reduce risk and improve platform hardening.',
    ],
  },
  {
    title: 'Your Rights',
    points: [
      'You may request access, correction, export, or deletion of your personal data where legally applicable.',
      'You may object to specific processing activities or request restrictions under applicable privacy laws.',
      'Requests can be submitted through support channels listed in the Help page.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Legal</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Privacy Policy
          </h1>
          <p style={{ margin: '0.9rem 0 0', fontSize: '0.9rem', color: 'rgba(200,210,240,0.6)' }}>
            Effective date: {effectiveDate}
          </p>
          <p style={{ maxWidth: 640, margin: '1rem auto 0', fontSize: '1.02rem', color: 'rgba(212,221,244,0.7)' }}>
            This policy explains how Apployd collects, uses, protects, and manages personal and operational data.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, borderTop: 'none' }}>
        <div className={styles.container} style={{ maxWidth: 880 }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {privacySections.map((section) => (
              <article
                key={section.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.25rem 1.35rem',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 600 }}>{section.title}</h2>
                <ul style={{ margin: '0.65rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '0.42rem' }}>
                  {section.points.map((point) => (
                    <li key={point} style={{ fontSize: '0.88rem', color: 'rgba(200,210,240,0.68)', lineHeight: 1.55 }}>
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
            Need to submit a data request?
          </h2>
          <p style={{ maxWidth: 540, margin: '0.8rem auto 0', fontSize: '0.92rem', color: 'rgba(200,210,240,0.65)' }}>
            Reach our support team for access, deletion, or correction requests.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <Link href="/legal/compliance" className={styles.secondaryButton}>
              Review Compliance
            </Link>
            <Link href="/contact" className={styles.primaryButton}>
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
