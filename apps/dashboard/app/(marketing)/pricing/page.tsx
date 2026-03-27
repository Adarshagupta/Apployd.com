import type { Metadata } from 'next';

import { buildPageMetadata, SITE_NAME, siteUrl } from '../../../lib/seo';
import styles from '../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing',
  description:
    'Transparent plans for Apployd with project limits, resource pools, and upgrade paths for teams at every stage.',
  path: '/pricing',
  keywords: ['Apployd pricing', 'managed deployment platform pricing', 'vercel alternative pricing'],
});

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

interface DatabaseAddonTier {
  code: string;
  name: string;
  storage: string;
  compute: string;
  ram: string;
  price: string;
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
      { label: 'Auto Deploy', value: 'Yes' },
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

const databaseAddonTiers: DatabaseAddonTier[] = [
  {
    code: 'hobby',
    name: 'Hobby',
    storage: '1 GB',
    compute: '500 mCPU-min',
    ram: '512 MB',
    price: 'Free or $0',
  },
  {
    code: 'starter',
    name: 'Starter',
    storage: '5 GB',
    compute: '2,000 mCPU-min',
    ram: '1 GB',
    price: '$5.00',
  },
  {
    code: 'growth',
    name: 'Growth',
    storage: '20 GB',
    compute: '8,000 mCPU-min',
    ram: '4 GB',
    price: '$19.99',
  },
  {
    code: 'scale',
    name: 'Scale',
    storage: '100 GB',
    compute: '40,000 mCPU-min',
    ram: '16 GB',
    price: '$70.00',
  },
] as const;

const quickViewRows = [
  { feature: 'Auto Deploy', free: 'Yes', dev: 'Yes', pro: 'Yes', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Custom Domain', free: 'No', dev: 'Yes', pro: 'Yes', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Backups', free: '3-day', dev: '7d', pro: '14d', max: '30d', enterprise: 'Hourly' },
  { feature: 'Preview URLs', free: 'No', dev: 'No', pro: 'Yes', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Team Access', free: 'No', dev: 'No', pro: 'No', max: 'Yes', enterprise: 'Yes' },
  { feature: 'Analytics', free: 'Basic', dev: 'Standard', pro: 'Advanced', max: 'Pro', enterprise: 'Custom' },
  { feature: 'Support', free: 'Community', dev: 'Email', pro: 'Priority', max: '24/7', enterprise: 'Dedicated' },
];

const pricingCardBackground = 'rgba(255,255,255,0.94)';
const pricingCardBorder = 'rgba(148,163,184,0.24)';
const pricingMutedText = '#64748b';
const pricingBodyText = '#475569';
const pricingHeadingText = '#0f172a';
const pricingSurfaceBorder = 'rgba(148,163,184,0.18)';
const pricingSurfaceBackground = 'rgba(248,250,252,0.92)';
const pricingTableHeaderBackground = 'rgba(241,245,249,0.96)';
const pricingTableRowBorder = 'rgba(148,163,184,0.16)';

const normalizedPrice = (value: string): string => {
  const numeric = value.replace(/[^0-9.]/g, '');
  return numeric.length > 0 ? numeric : '0';
};

const formatDatabaseAddonOptionLabel = (tier: DatabaseAddonTier): string =>
  `${tier.name} · ${tier.price} · ${tier.storage} · ${tier.ram} RAM · ${tier.compute}`;

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Linux',
  url: `${siteUrl}/pricing`,
  description:
    'Transparent plans for Apployd with project limits, resource pools, and upgrade paths for teams at every stage.',
  offers: plans.map((plan) => ({
    '@type': 'Offer',
    name: `${plan.name} plan`,
    price: normalizedPrice(plan.price),
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: `${siteUrl}${plan.href}`,
    category: 'SoftwareSubscription',
  })),
};

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Pricing</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Start free. Upgrade when you grow.
          </h1>
          <p style={{ maxWidth: 720, margin: '1rem auto 0', fontSize: '1.02rem', color: pricingBodyText }}>
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
            {plans.map((plan) => {
              return (
                <article
                  key={plan.code}
                  style={{
                    position: 'relative',
                    borderRadius: 16,
                    border: plan.popular
                      ? '1.5px solid rgba(42,141,255,0.5)'
                      : `1px solid ${pricingCardBorder}`,
                    background: pricingCardBackground,
                    padding: '1.2rem',
                    boxShadow: '0 18px 44px rgba(15,23,42,0.08)',
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
                  <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: pricingMutedText }}>
                    {plan.name}
                  </p>
                  <p style={{ margin: '0.6rem 0 0', fontSize: '2.3rem', fontWeight: 700, lineHeight: 1, color: pricingHeadingText }}>
                    {plan.price}
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: pricingMutedText }}>
                      {plan.period}
                    </span>
                  </p>
                  <p style={{ margin: '0.56rem 0 0', color: pricingBodyText, fontSize: '0.86rem' }}>
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
                  <div style={{ marginTop: '0.95rem', borderRadius: 12, border: `1px solid ${pricingSurfaceBorder}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {plan.features.map((row, idx) => (
                          <tr key={`${plan.code}-${row.label}`} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${pricingTableRowBorder}` }}>
                            <td style={{ padding: '0.46rem 0.56rem', fontSize: '0.78rem', color: pricingBodyText }}>{row.label}</td>
                            <td style={{ padding: '0.46rem 0.56rem', fontSize: '0.78rem', textAlign: 'right', color: pricingHeadingText }}>{row.value}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: `1px solid ${pricingTableRowBorder}` }}>
                          <td colSpan={2} style={{ padding: '0.62rem 0.56rem 0.72rem' }}>
                            <details>
                              <summary
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.75rem',
                                  cursor: 'pointer',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  color: pricingHeadingText,
                                }}
                              >
                                <span>Database add-on</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 500, color: pricingMutedText }}>
                                  Choose any tier
                                </span>
                              </summary>
                              <div style={{ marginTop: '0.72rem', display: 'grid', gap: '0.72rem' }}>
                                <div style={{ display: 'grid', gap: '0.4rem' }}>
                                  <label
                                    htmlFor={`db-addon-${plan.code}`}
                                    style={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: pricingMutedText }}
                                  >
                                    Select database tier
                                  </label>
                                  <select
                                    id={`db-addon-${plan.code}`}
                                    defaultValue="hobby"
                                    style={{
                                      width: '100%',
                                      borderRadius: 10,
                                      border: `1px solid ${pricingSurfaceBorder}`,
                                      background: pricingSurfaceBackground,
                                      color: pricingHeadingText,
                                      padding: '0.72rem 0.8rem',
                                      fontSize: '0.84rem',
                                      outline: 'none',
                                    }}
                                  >
                                    {databaseAddonTiers.map((tier) => (
                                      <option key={`${plan.code}-${tier.code}`} value={tier.code}>
                                        {formatDatabaseAddonOptionLabel(tier)}
                                      </option>
                                    ))}
                                  </select>
                                  <p style={{ margin: 0, fontSize: '0.74rem', color: pricingMutedText }}>
                                    Any pricing plan can be paired with any database tier. Each option includes price, storage, RAM, and vCPU-min.
                                  </p>
                                </div>
                                <div style={{ borderRadius: 10, border: `1px solid ${pricingSurfaceBorder}`, overflowX: 'auto', overflowY: 'hidden' }}>
                                <table style={{ width: '100%', minWidth: 440, borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ background: pricingTableHeaderBackground }}>
                                      <th style={{ padding: '0.46rem 0.5rem', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', color: pricingMutedText }}>Plan</th>
                                      <th style={{ padding: '0.46rem 0.5rem', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', color: pricingMutedText }}>Storage</th>
                                      <th style={{ padding: '0.46rem 0.5rem', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', color: pricingMutedText }}>vCPU-min</th>
                                      <th style={{ padding: '0.46rem 0.5rem', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', color: pricingMutedText }}>RAM</th>
                                      <th style={{ padding: '0.46rem 0.5rem', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'right', color: pricingMutedText }}>Price/mo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {databaseAddonTiers.map((tier, idx) => {
                                      return (
                                        <tr
                                          key={`${plan.code}-${tier.code}`}
                                          style={{
                                            borderTop: idx === 0 ? 'none' : `1px solid ${pricingTableRowBorder}`,
                                            background: 'transparent',
                                          }}
                                        >
                                          <td style={{ padding: '0.48rem 0.5rem', fontSize: '0.72rem', color: pricingHeadingText }}>
                                            {tier.name}
                                          </td>
                                          <td style={{ padding: '0.48rem 0.5rem', fontSize: '0.72rem', color: pricingBodyText }}>{tier.storage}</td>
                                          <td style={{ padding: '0.48rem 0.5rem', fontSize: '0.72rem', color: pricingBodyText }}>{tier.compute}</td>
                                          <td style={{ padding: '0.48rem 0.5rem', fontSize: '0.72rem', color: pricingBodyText }}>{tier.ram}</td>
                                          <td style={{ padding: '0.48rem 0.5rem', fontSize: '0.72rem', textAlign: 'right', color: pricingHeadingText }}>{tier.price}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              </div>
                            </details>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
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
