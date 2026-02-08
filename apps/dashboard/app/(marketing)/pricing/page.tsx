import styles from '../../landing.module.css';

const tiers = [
  {
    name: 'Hobby',
    price: '$0',
    period: '/mo',
    description: 'Perfect for side projects and experimentation.',
    cta: 'Get Started',
    features: [
      '1 server',
      '3 projects',
      '512 MB RAM per container',
      'Community support',
      'Shared build queue',
      'Basic metrics',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo per server',
    description: 'For teams shipping production workloads.',
    cta: 'Start Free Trial',
    popular: true,
    features: [
      'Unlimited servers',
      'Unlimited projects',
      '4 GB RAM per container',
      'Priority support',
      'Parallel builds',
      'Advanced metrics & alerts',
      'Team RBAC',
      'Custom domains',
      'Audit logging',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with advanced security and compliance needs.',
    cta: 'Contact Sales',
    features: [
      'Everything in Pro',
      'Dedicated support engineer',
      'SSO / SAML',
      'SLA guarantees',
      'Custom integrations',
      'On-prem deployment assistance',
      'Compliance reports',
      'Volume discounts',
    ],
  },
];

const faqs = [
  {
    q: 'Is Apployd really self-hosted?',
    a: 'Yes. You run Apployd on your own servers — bare-metal, VPS, or cloud VMs. Your code and data never leave your infrastructure.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Absolutely. Upgrade or downgrade at any time. Changes take effect at the start of your next billing cycle.',
  },
  {
    q: 'What counts as a "server"?',
    a: 'A server is any machine (physical or virtual) running the Apployd deployment agent. Each server can host multiple projects.',
  },
  {
    q: 'Do you offer a free trial for Pro?',
    a: 'Yes — every new account gets a 14-day Pro trial with no credit card required.',
  },
  {
    q: 'How does billing work for teams?',
    a: 'Billing is per-server, not per-seat. Add as many team members as you need at no extra cost on Pro and Enterprise plans.',
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Pricing</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Simple, transparent pricing
          </h1>
          <p style={{ maxWidth: 560, margin: '1rem auto 0', fontSize: '1.05rem', color: 'rgba(212,221,244,0.7)' }}>
            Pay only for the servers you connect. No per-seat fees, no hidden costs.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            {tiers.map((t) => (
              <div
                key={t.name}
                style={{
                  position: 'relative',
                  borderRadius: 16,
                  border: t.popular
                    ? '1.5px solid rgba(42,141,255,0.5)'
                    : '1px solid rgba(161,178,216,0.16)',
                  background: 'rgba(8,10,16,0.7)',
                  padding: '2rem 1.6rem',
                }}
              >
                {t.popular && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -11,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#fff',
                      background: 'linear-gradient(135deg, #2a8dff, #1b6fd1)',
                      borderRadius: 999,
                      padding: '0.25rem 0.8rem',
                    }}
                  >
                    Most Popular
                  </span>
                )}
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>{t.name}</h3>
                <p style={{ margin: '0.8rem 0 0', fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>
                  {t.price}
                  <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'rgba(200,210,240,0.6)' }}>
                    {t.period}
                  </span>
                </p>
                <p style={{ margin: '0.6rem 0 1.4rem', fontSize: '0.88rem', color: 'rgba(200,210,240,0.6)' }}>
                  {t.description}
                </p>
                <a
                  href="/signup"
                  className={styles.primaryButton}
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    background: t.popular ? 'linear-gradient(135deg, #2a8dff, #1b6fd1)' : '#000',
                  }}
                >
                  {t.cta}
                </a>
                <ul style={{ listStyle: 'none', margin: '1.6rem 0 0', padding: 0, display: 'grid', gap: '0.55rem' }}>
                  {t.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: 'rgba(220,228,248,0.8)' }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M3 8.5l3 3 7-7" stroke="#2a8dff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 720 }}>
          <p className={styles.sectionLabel}>FAQ</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)' }}>
            Frequently asked questions
          </h2>
          <div style={{ marginTop: '2.5rem', display: 'grid', gap: '1.2rem' }}>
            {faqs.map((f) => (
              <details
                key={f.q}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.5)',
                  padding: '1rem 1.2rem',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'rgba(240,244,255,0.92)',
                    listStyle: 'none',
                  }}
                >
                  {f.q}
                </summary>
                <p style={{ margin: '0.6rem 0 0', fontSize: '0.88rem', color: 'rgba(200,210,240,0.65)', lineHeight: 1.6 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)' }}>
            Ready to deploy on your terms?
          </h2>
          <p style={{ maxWidth: 480, margin: '0.8rem auto 0', fontSize: '1rem', color: 'rgba(212,221,244,0.7)' }}>
            Start with Hobby free, upgrade when you&apos;re ready.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.6rem' }}>
            <a href="/signup" className={styles.primaryButton}>Get Started Free</a>
            <a href="/contact" className={styles.secondaryButton}>Talk to Sales</a>
          </div>
        </div>
      </section>
    </>
  );
}
