import type { Metadata } from 'next';

import { buildPageMetadata, SITE_NAME, siteUrl } from '../../../lib/seo';
import { blogPosts } from './posts';
import styles from '../../landing.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Blog',
  description:
    'Engineering deep-dives, product updates, and security practices from the Apployd deployment platform team.',
  path: '/blog',
  type: 'article',
  keywords: ['devops blog', 'deployment engineering', 'platform security updates'],
});

const categories = ['All', ...Array.from(new Set(blogPosts.map((post) => post.category))), 'Community'];

const blogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: `${SITE_NAME} Blog`,
  url: `${siteUrl}/blog`,
  description:
    'Engineering deep-dives, product updates, and security practices from the Apployd deployment platform team.',
  blogPost: blogPosts.map((post) => ({
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    url: `${siteUrl}/blog#${post.slug}`,
    inLanguage: 'en-US',
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icon.png`,
      },
    },
  })),
};

export default function BlogPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />

      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Blog</p>
          <h1 className={styles.sectionTitle} style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Engineering and product updates
          </h1>
          <p style={{ maxWidth: 540, margin: '1rem auto 0', fontSize: '1.05rem', color: 'rgba(212,221,244,0.7)' }}>
            Behind the scenes of building a managed SaaS deployment platform.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, paddingBottom: '1.5rem', borderTop: 'none' }}>
        <div className={styles.container}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {categories.map((category, index) => (
              <button
                key={category}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(161,178,216,0.2)',
                  background: index === 0 ? 'rgba(42,141,255,0.15)' : 'rgba(8,10,16,0.6)',
                  color: index === 0 ? '#6bb4ff' : 'rgba(220,228,248,0.7)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  padding: '0.45rem 0.9rem',
                  cursor: 'pointer',
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {blogPosts.map((post) => (
              <article
                key={post.slug}
                id={post.slug}
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
                    {post.category}
                  </span>
                  <span style={{ fontSize: '0.76rem', color: 'rgba(200,210,240,0.45)' }}>
                    {post.dateLabel}
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 600, lineHeight: 1.35 }}>
                  {post.title}
                </h2>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(200,210,240,0.6)', lineHeight: 1.55, flex: 1 }}>
                  {post.excerpt}
                </p>
                <span style={{ fontSize: '0.76rem', color: 'rgba(200,210,240,0.4)', fontFamily: 'var(--font-mono), monospace' }}>
                  {post.readTime}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

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
