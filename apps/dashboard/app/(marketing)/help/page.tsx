import type { Metadata } from 'next';
import Link from 'next/link';

import { buildPageMetadata } from '../../../lib/seo';
import styles from '../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Help',
  description:
    'Support channels, FAQs, and escalation paths for deployment, security, billing, and compliance questions.',
  path: '/help',
  keywords: ['Apployd help', 'deployment support', 'platform FAQ'],
});

const supportOptions = [
  {
    title: 'Technical Support',
    description: 'Deployment failures, runtime errors, DNS routing, and infrastructure troubleshooting.',
    contact: 'support@apployd.dev',
  },
  {
    title: 'Security Reports',
    description: 'Vulnerability disclosure, incident communication, and hardening-related questions.',
    contact: 'security@apployd.dev',
  },
  {
    title: 'Billing and Plans',
    description: 'Subscriptions, invoices, usage pools, and enterprise contract requests.',
    contact: 'sales@apployd.dev',
  },
];

const faq = [
  {
    question: 'How long does support response take?',
    answer: 'Standard requests receive a response within one business day.',
  },
  {
    question: 'Where can I find setup docs?',
    answer: 'Start with the Docs page for architecture, networking, and deployment runbooks.',
  },
  {
    question: 'Can you help with self-hosted deployment issues?',
    answer: 'Yes. Include your deployment logs, runtime details, and reproduction steps in the request.',
  },
  {
    question: 'How do I request legal and compliance documentation?',
    answer: 'Use the contact channel and mention your organization, required framework, and deadline.',
  },
];

export default function HelpPage() {
  return (
    <>
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Help</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Help Center
          </h1>
          <p style={{ maxWidth: 620, margin: '1rem auto 0', fontSize: '1.02rem', color: 'rgba(212,221,244,0.7)' }}>
            Support channels, frequently asked questions, and guidance for operating Apployd in production.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, borderTop: 'none' }}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>Support Channels</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '1.6rem' }}>
            Reach the right team faster
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {supportOptions.map((option) => (
              <article
                key={option.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.3rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{option.title}</h3>
                <p style={{ margin: '0.55rem 0 0', fontSize: '0.86rem', color: 'rgba(200,210,240,0.64)', lineHeight: 1.55 }}>
                  {option.description}
                </p>
                <p style={{ margin: '0.7rem 0 0', fontFamily: 'var(--font-mono), monospace', fontSize: '0.76rem', color: 'rgba(164,184,224,0.82)' }}>
                  {option.contact}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <p className={styles.sectionLabel}>FAQ</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '1.4rem' }}>
            Common questions
          </h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {faq.map((entry) => (
              <article
                key={entry.question}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.55)',
                  padding: '1.2rem 1.3rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>{entry.question}</h3>
                <p style={{ margin: '0.55rem 0 0', fontSize: '0.88rem', color: 'rgba(200,210,240,0.66)', lineHeight: 1.55 }}>
                  {entry.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            Need deeper guidance?
          </h2>
          <p style={{ maxWidth: 560, margin: '0.8rem auto 0', fontSize: '0.92rem', color: 'rgba(200,210,240,0.65)' }}>
            Use documentation for implementation details, or contact us for direct support.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <Link href="/docs" className={styles.secondaryButton}>
              Open Docs
            </Link>
            <Link href="/contact" className={styles.primaryButton}>
              Contact Team
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
