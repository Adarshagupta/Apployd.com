import styles from '../../landing.module.css';

const categories = ['All', 'Engineering', 'Product', 'Security', 'Community'];

const posts = [
  {
    title: 'Introducing Apployd — Self-Hosted Deployments for Everyone',
    excerpt: 'We built Apployd because developers deserve Render-level DX on their own infrastructure. Here\'s the story.',
    category: 'Product',
    date: 'Jan 28, 2026',
    readTime: '6 min read',
  },
  {
    title: 'How Universal Dockerfiles Eliminated Our Build Matrix',
    excerpt: 'A single Dockerfile that auto-detects Node.js, Python, Go, Rust, and static sites. No configuration needed.',
    category: 'Engineering',
    date: 'Jan 22, 2026',
    readTime: '8 min read',
  },
  {
    title: 'Zero-Downtime Deploys with Rolling Container Swaps',
    excerpt: 'Deep-dive into our health-check-driven rolling deployment strategy that keeps your services online during every push.',
    category: 'Engineering',
    date: 'Jan 15, 2026',
    readTime: '10 min read',
  },
  {
    title: 'Resource Pooling: Bin-Packing Containers Like Tetris',
    excerpt: 'Our placement scheduler fills servers efficiently. Learn how we reduced idle capacity by 38%.',
    category: 'Engineering',
    date: 'Jan 8, 2026',
    readTime: '7 min read',
  },
  {
    title: 'Securing Secrets: AES-256-GCM at Rest, Zero-Knowledge in Transit',
    excerpt: 'How Apployd encrypts every environment variable and injects secrets only at container start.',
    category: 'Security',
    date: 'Dec 30, 2025',
    readTime: '5 min read',
  },
  {
    title: 'Read-Only Containers and Why They Matter',
    excerpt: 'Immutable filesystems block an entire class of runtime attacks. Here\'s how we enforce them by default.',
    category: 'Security',
    date: 'Dec 22, 2025',
    readTime: '4 min read',
  },
];

export default function BlogPage() {
  return (
    <>
      {/* Hero */}
      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Blog</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Engineering &amp; Product updates
          </h1>
          <p style={{ maxWidth: 540, margin: '1rem auto 0', fontSize: '1.05rem', color: 'rgba(212,221,244,0.7)' }}>
            Behind-the-scenes of building a self-hosted deployment platform.
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className={styles.section} style={{ paddingTop: 0, paddingBottom: '1.5rem', borderTop: 'none' }}>
        <div className={styles.container}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {categories.map((c, i) => (
              <button
                key={c}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(161,178,216,0.2)',
                  background: i === 0 ? 'rgba(42,141,255,0.15)' : 'rgba(8,10,16,0.6)',
                  color: i === 0 ? '#6bb4ff' : 'rgba(220,228,248,0.7)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  padding: '0.45rem 0.9rem',
                  cursor: 'pointer',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Posts */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {posts.map((p) => (
              <article
                key={p.title}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(161,178,216,0.14)',
                  background: 'rgba(8,10,16,0.6)',
                  padding: '1.6rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                  transition: 'border-color 0.2s',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: '#6bb4ff',
                      border: '1px solid rgba(42,141,255,0.25)',
                      borderRadius: 999,
                      padding: '0.2rem 0.55rem',
                    }}
                  >
                    {p.category}
                  </span>
                  <span style={{ fontSize: '0.76rem', color: 'rgba(200,210,240,0.45)' }}>
                    {p.date}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 600, lineHeight: 1.35 }}>
                  {p.title}
                </h3>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(200,210,240,0.6)', lineHeight: 1.55, flex: 1 }}>
                  {p.excerpt}
                </p>
                <span style={{ fontSize: '0.76rem', color: 'rgba(200,210,240,0.4)', fontFamily: 'var(--font-mono), monospace' }}>
                  {p.readTime}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 560, textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Stay Updated</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            Subscribe to our newsletter
          </h2>
          <p style={{ margin: '0.6rem 0 1.4rem', fontSize: '0.92rem', color: 'rgba(212,221,244,0.6)' }}>
            Engineering deep-dives and product updates, delivered monthly.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: 420, margin: '0 auto' }}>
            <input
              type="email"
              placeholder="you@company.com"
              style={{
                flex: 1,
                borderRadius: 999,
                border: '1px solid rgba(161,178,216,0.2)',
                background: 'rgba(8,10,16,0.7)',
                color: '#f3f5fa',
                fontSize: '0.88rem',
                padding: '0.7rem 1rem',
                outline: 'none',
              }}
            />
            <button className={styles.primaryButton} style={{ minWidth: 'auto', padding: '0.7rem 1.2rem' }}>
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
