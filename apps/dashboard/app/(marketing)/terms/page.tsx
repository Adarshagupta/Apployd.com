import Link from 'next/link';

import styles from '../../landing.module.css';

const effectiveDate = 'February 9, 2026';

const termsSections = [
  {
    title: '1. Service Scope',
    body: [
      'Apployd provides a self-hosted deployment platform and supporting control plane features for software teams.',
      'Service availability may vary based on customer infrastructure, network conditions, and third-party dependencies.',
    ],
  },
  {
    title: '2. Account Responsibilities',
    body: [
      'You are responsible for account credentials, project configuration, deployment artifacts, and server access control.',
      'You must ensure lawful use of the platform and compliance with all applicable regulations in your jurisdiction.',
    ],
  },
  {
    title: '3. Billing and Subscription',
    body: [
      'Paid features are billed according to your active plan, renewal cycle, and usage-based limits where applicable.',
      'Failure to pay invoices may result in restricted access until account standing is restored.',
    ],
  },
  {
    title: '4. Security and Acceptable Use',
    body: [
      'You may not use the platform to distribute malicious code, perform unauthorized access attempts, or violate third-party rights.',
      'We reserve the right to suspend workloads that threaten platform integrity or customer safety.',
    ],
  },
  {
    title: '5. Data and Confidentiality',
    body: [
      'Customer data remains under customer control; Apployd processes data only as required to provide and secure the service.',
      'Both parties agree to protect confidential information using commercially reasonable safeguards.',
    ],
  },
  {
    title: '6. Limitation of Liability',
    body: [
      'To the fullest extent permitted by law, Apployd is not liable for indirect, consequential, or punitive damages.',
      'Total liability is limited to fees paid for the service during the 12 months preceding the claim.',
    ],
  },
  {
    title: '7. Changes and Termination',
    body: [
      'We may update these terms from time to time. Material changes will be communicated through product or email notices.',
      'Either party may terminate the agreement according to cancellation terms and any negotiated enterprise addendum.',
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Legal</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Terms and Conditions
          </h1>
          <p style={{ margin: '0.9rem 0 0', fontSize: '0.9rem', color: 'rgba(200,210,240,0.6)' }}>
            Effective date: {effectiveDate}
          </p>
          <p style={{ maxWidth: 620, margin: '1rem auto 0', fontSize: '1.02rem', color: 'rgba(212,221,244,0.7)' }}>
            These terms govern access to and use of Apployd platform services, including the dashboard, API, and deployment engine.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, borderTop: 'none' }}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {termsSections.map((section) => (
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
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  {section.body.map((line) => (
                    <p key={line} style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(200,210,240,0.68)', lineHeight: 1.55 }}>
                      {line}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.3rem, 2.6vw, 1.8rem)' }}>
            Questions about legal terms?
          </h2>
          <p style={{ maxWidth: 540, margin: '0.8rem auto 0', fontSize: '0.92rem', color: 'rgba(200,210,240,0.65)' }}>
            Reach out to our team for contract, enterprise, or compliance-related clarifications.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <Link href="/privacy" className={styles.secondaryButton}>
              View Privacy Policy
            </Link>
            <Link href="/contact" className={styles.primaryButton}>
              Contact Legal
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
