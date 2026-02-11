import styles from '../../landing.module.css';

interface PlanFeature {
  label: string;
  value: string;
}

interface PlanCard {
  code: string;
  name: string;
  price: string;
  period: string;
  bestFor: string;
  cta: string;
  href: string;
  popular?: boolean;
  features: PlanFeature[];
}

const plans: PlanCard[] = [
  {
    code: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    bestFor: 'Students, demos, testing',
    cta: 'Start Free',
    href: '/signup',
    features: [
      { label: 'Projects', value: '2' },
      { label: 'RAM', value: '512 MB' },
      { label: 'vCPU', value: '0.2' },
      { label: 'Storage', value: '2 GB' },
      { label: 'Bandwidth', value: '10 GB / month' },
      { label: 'Sleep Mode', value: 'Yes (after inactivity)' },
      { label: 'Custom Domain', value: 'No' },
      { label: 'SSL (HTTPS)', value: 'No' },
      { label: 'Auto Deploy', value: 'No' },
      { label: 'Preview Environments', value: 'No' },
      { label: 'Backups', value: 'Every 3 days (1 copy)' },
      { label: 'Log Retention', value: '24 hours' },
      { label: 'Analytics', value: 'Basic' },
      { label: 'IDE Integration', value: 'Yes' },
      { label: 'Support', value: 'Community' },
    ],
  },
  {
    code: 'dev',
    name: 'Dev',
    price: '$5',
    period: '/month',
    bestFor: 'Side projects, MVPs',
    cta: 'Choose Dev',
    href: '/signup',
    features: [
      { label: 'Projects', value: '6' },
      { label: 'RAM', value: '1 GB / project' },
      { label: 'vCPU', value: '0.5' },
      { label: 'Storage', value: '10 GB' },
      { label: 'Bandwidth', value: '40 GB / month' },
      { label: 'Sleep Mode', value: 'Optional' },
      { label: 'Custom Domain', value: 'Yes' },
      { label: 'SSL (HTTPS)', value: 'Yes' },
      { label: 'Auto Deploy', value: 'Yes' },
      { label: 'Preview Environments', value: 'No' },
      { label: 'Backups', value: 'Daily (7 days)' },
      { label: 'Log Retention', value: '7 days' },
      { label: 'Analytics', value: 'Standard' },
      { label: 'Usage Alerts', value: 'Yes' },
      { label: 'IDE Integration', value: 'Yes' },
      { label: 'Support', value: 'Email' },
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    price: '$12',
    period: '/month',
    bestFor: 'Production apps, funded startups',
    cta: 'Choose Pro',
    href: '/signup',
    popular: true,
    features: [
      { label: 'Projects', value: '16' },
      { label: 'RAM', value: '2 GB / project' },
      { label: 'vCPU', value: '1.0' },
      { label: 'Storage', value: '30 GB' },
      { label: 'Bandwidth', value: '160 GB / month' },
      { label: 'Sleep Mode', value: 'No' },
      { label: 'Custom Domain', value: 'Yes' },
      { label: 'SSL (HTTPS)', value: 'Yes' },
      { label: 'Auto Deploy', value: 'Yes' },
      { label: 'Preview Environments', value: 'Yes' },
      { label: 'Zero-Downtime Deploy', value: 'Yes' },
      { label: 'Backups', value: 'Daily (14 days)' },
      { label: 'Log Retention', value: '14 days' },
      { label: 'Analytics', value: 'Advanced' },
      { label: 'Cost Predictor', value: 'Yes' },
      { label: 'Auto Scaling', value: 'Basic' },
      { label: 'IDE Integration', value: 'Yes' },
      { label: 'Support', value: 'Priority' },
    ],
  },
  {
    code: 'max',
    name: 'Max',
    price: '$25',
    period: '/month',
    bestFor: 'Agencies, SaaS companies',
    cta: 'Choose Max',
    href: '/signup',
    features: [
      { label: 'Projects', value: '40' },
      { label: 'RAM', value: '4 GB / project' },
      { label: 'vCPU', value: '2.0' },
      { label: 'Storage', value: '100 GB' },
      { label: 'Bandwidth', value: '400 GB / month' },
      { label: 'Sleep Mode', value: 'No' },
      { label: 'Custom Domain', value: 'Yes' },
      { label: 'SSL (HTTPS)', value: 'Yes' },
      { label: 'Auto Deploy', value: 'Yes' },
      { label: 'Preview Environments', value: 'Unlimited' },
      { label: 'Zero-Downtime Deploy', value: 'Yes' },
      { label: 'Backups', value: 'Daily (30 days)' },
      { label: 'Log Retention', value: '30 days' },
      { label: 'Analytics', value: 'Pro + Insights' },
      { label: 'Cost Predictor', value: 'Yes' },
      { label: 'Auto Scaling', value: 'Advanced' },
      { label: 'Team Access', value: 'Yes' },
      { label: 'Role Management', value: 'Yes' },
      { label: 'IDE Integration', value: 'Yes' },
      { label: 'Support', value: '24/7 Priority' },
    ],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: '$100+',
    period: '/month',
    bestFor: 'Large startups, enterprises',
    cta: 'Contact Sales',
    href: '/contact',
    features: [
      { label: 'Projects', value: 'Unlimited' },
      { label: 'RAM / CPU', value: 'Custom' },
      { label: 'Storage', value: 'Custom' },
      { label: 'Bandwidth', value: 'Custom' },
      { label: 'Dedicated Servers', value: 'Optional' },
      { label: 'Private Networking', value: 'Yes' },
      { label: 'Custom Domains', value: 'Unlimited' },
      { label: 'SSL', value: 'Enterprise' },
      { label: 'Backups', value: 'Hourly + Cross-region' },
      { label: 'Disaster Recovery', value: 'Yes' },
      { label: 'SLA', value: '99.9%+' },
      { label: 'Compliance', value: 'Optional' },
      { label: 'Account Manager', value: 'Yes' },
      { label: 'Support', value: 'Dedicated' },
    ],
  },
];

const quickViewRows = [
  { feature: 'Auto Deploy', free: 'No', dev: 'Yes', pro: 'Yes', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Custom Domain', free: 'No', dev: 'Yes', pro: 'Yes', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Backups', free: '3-day', dev: '7d', pro: '14d', max: '30d', enterprise: 'Hourly' },
  { feature: 'Preview URLs', free: 'No', dev: 'No', pro: 'Yes', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Team Access', free: 'No', dev: 'No', pro: 'No', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Analytics', free: 'Basic', dev: 'Standard', pro: 'Advanced', max: 'Pro', enterprise: 'Custom' },
  { feature: 'Support', free: 'Community', dev: 'Email', pro: 'Priority', max: '24/7', enterprise: 'Dedicated' },
];

export default function PricingPage() {
  return (
    <>
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Pricing</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Start free. Upgrade when you grow.
          </h1>
          <p style={{ maxWidth: 720, margin: '1rem auto 0', fontSize: '1.02rem', color: 'rgba(212,221,244,0.72)' }}>
            No hidden charges. Clear plan limits. Predictable scaling.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: '1.2rem',
              alignItems: 'start',
            }}
          >
            {plans.map((plan) => (
              <article
                key={plan.code}
                style={{
                  position: 'relative',
                  borderRadius: 16,
                  border: plan.popular
                    ? '1.5px solid rgba(42,141,255,0.5)'
                    : '1px solid rgba(161,178,216,0.16)',
                  background: 'rgba(8,10,16,0.68)',
                  padding: '1.2rem',
                }}
              >
                {plan.popular ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: -11,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#fff',
                      background: 'linear-gradient(135deg, #2a8dff, #1b6fd1)',
                      borderRadius: 999,
                      padding: '0.24rem 0.72rem',
                    }}
                  >
                    Most Popular
                  </span>
                ) : null}
                <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(202,214,243,0.66)' }}>
                  {plan.name}
                </p>
                <p style={{ margin: '0.6rem 0 0', fontSize: '2.3rem', fontWeight: 700, lineHeight: 1 }}>
                  {plan.price}
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'rgba(200,210,240,0.62)' }}>
                    {plan.period}
                  </span>
                </p>
                <p style={{ margin: '0.56rem 0 0', color: 'rgba(210,222,247,0.78)', fontSize: '0.86rem' }}>
                  Best for: {plan.bestFor}
                </p>
                <a
                  href={plan.href}
                  className={styles.primaryButton}
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    marginTop: '0.9rem',
                    background: plan.popular ? 'linear-gradient(135deg, #2a8dff, #1b6fd1)' : '#000',
                  }}
                >
                  {plan.cta}
                </a>
                <div style={{ marginTop: '0.95rem', borderRadius: 12, border: '1px solid rgba(150,170,220,0.16)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {plan.features.map((row, idx) => (
                        <tr key={`${plan.code}-${row.label}`} style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(150,170,220,0.14)' }}>
                          <td style={{ padding: '0.46rem 0.56rem', fontSize: '0.78rem', color: 'rgba(197,211,244,0.82)' }}>{row.label}</td>
                          <td style={{ padding: '0.46rem 0.56rem', fontSize: '0.78rem', textAlign: 'right', color: 'rgba(237,242,255,0.92)' }}>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <article style={{ borderRadius: 14, border: '1px solid rgba(161,178,216,0.14)', background: 'rgba(8,10,16,0.56)', padding: '1rem' }}>
              <p className={styles.sectionLabel}>Backup Pro Add-on</p>
              <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.2rem' }}>$5 / project / month</h3>
              <ul style={{ margin: '0.85rem 0 0', paddingLeft: '1rem', color: 'rgba(214,224,248,0.84)', lineHeight: 1.55, fontSize: '0.9rem' }}>
                <li>Hourly backups</li>
                <li>60-90 day retention</li>
                <li>One-click restore</li>
                <li>Version history</li>
                <li>Cross-region copy</li>
                <li>Encrypted storage</li>
              </ul>
            </article>

            <article style={{ borderRadius: 14, border: '1px solid rgba(161,178,216,0.14)', background: 'rgba(8,10,16,0.56)', padding: '1rem' }}>
              <p className={styles.sectionLabel}>Bandwidth Overage</p>
              <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.2rem' }}>$0.05 / GB (paid plans)</h3>
              <ul style={{ margin: '0.85rem 0 0', paddingLeft: '1rem', color: 'rgba(214,224,248,0.84)', lineHeight: 1.55, fontSize: '0.9rem' }}>
                <li>Auto-charge cap: $5/month (default)</li>
                <li>Warning level: 80% usage</li>
                <li>Throttle after cap enabled</li>
                <li>Hard suspend only for abuse</li>
                <li>Users can increase limits manually</li>
              </ul>
            </article>

            <article style={{ borderRadius: 14, border: '1px solid rgba(161,178,216,0.14)', background: 'rgba(8,10,16,0.56)', padding: '1rem' }}>
              <p className={styles.sectionLabel}>Managed Dedicated Servers</p>
              <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.2rem' }}>Optional managed infrastructure</h3>
              <ul style={{ margin: '0.85rem 0 0', paddingLeft: '1rem', color: 'rgba(214,224,248,0.84)', lineHeight: 1.55, fontSize: '0.9rem' }}>
                <li>Managed AX41: EUR 52/month</li>
                <li>Managed EX44: EUR 65/month</li>
                <li>Setup fee: EUR 100 (one-time)</li>
                <li>Minimum term: 3 months</li>
                <li>Includes security hardening, monitoring, backups, and priority support</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <p className={styles.sectionLabel}>Quick Comparison</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.5rem, 3vw, 2.3rem)' }}>
            Feature matrix at a glance
          </h2>
          <div style={{ marginTop: '1rem', overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(161,178,216,0.18)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead style={{ background: 'rgba(8,10,16,0.7)' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.78rem', color: 'rgba(199,214,245,0.78)' }}>Feature</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.78rem', color: 'rgba(199,214,245,0.78)' }}>Free</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.78rem', color: 'rgba(199,214,245,0.78)' }}>Dev</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.78rem', color: 'rgba(199,214,245,0.78)' }}>Pro</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.78rem', color: 'rgba(199,214,245,0.78)' }}>Max</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.78rem', color: 'rgba(199,214,245,0.78)' }}>Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {quickViewRows.map((row, idx) => (
                  <tr key={row.feature} style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(161,178,216,0.14)' }}>
                    <td style={{ padding: '0.68rem 0.75rem', color: 'rgba(238,243,255,0.95)', fontSize: '0.86rem' }}>{row.feature}</td>
                    <td style={{ padding: '0.68rem 0.75rem', color: 'rgba(210,223,249,0.86)', fontSize: '0.82rem' }}>{row.free}</td>
                    <td style={{ padding: '0.68rem 0.75rem', color: 'rgba(210,223,249,0.86)', fontSize: '0.82rem' }}>{row.dev}</td>
                    <td style={{ padding: '0.68rem 0.75rem', color: 'rgba(210,223,249,0.86)', fontSize: '0.82rem' }}>{row.pro}</td>
                    <td style={{ padding: '0.68rem 0.75rem', color: 'rgba(210,223,249,0.86)', fontSize: '0.82rem' }}>{row.max}</td>
                    <td style={{ padding: '0.68rem 0.75rem', color: 'rgba(210,223,249,0.86)', fontSize: '0.82rem' }}>{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)' }}>
            Ready to deploy with predictable pricing?
          </h2>
          <p style={{ maxWidth: 620, margin: '0.9rem auto 0', fontSize: '1rem', color: 'rgba(212,221,244,0.7)' }}>
            Start with Free, unlock Pro when your workloads grow, and scale to Max or Enterprise without pricing surprises.
          </p>
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: '1.4rem' }}>
            <a href="/signup" className={styles.primaryButton}>Get Started Free</a>
            <a href="/contact" className={styles.secondaryButton}>Talk to Sales</a>
          </div>
        </div>
      </section>
    </>
  );
}
