import type { Metadata } from 'next';

import { buildPageMetadata, SITE_NAME, siteUrl } from '../../../lib/seo';
import { fetchPublishedContentPosts, toContentCanonicalPath } from '../../../lib/content';
import styles from '../../landing.module.css';
import blogStyles from './blog.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'Blog',
  description:
    'Engineering deep-dives, product updates, and security practices from the Apployd deployment platform team.',
  path: '/blog',
  type: 'article',
  keywords: ['devops blog', 'deployment engineering', 'platform security updates'],
});

export const dynamic = 'force-dynamic';

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return 'Unscheduled';
  }
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return 'Unscheduled';
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const toReadTimeLabel = (minutes: number): string => `${Math.max(1, minutes)} min read`;

export default async function BlogPage() {
  const posts = await fetchPublishedContentPosts({ kind: 'all', limit: 96, revalidateSeconds: 120 });
  const categories = ['All', 'Blog', 'News'];
  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${SITE_NAME} Blog`,
    url: `${siteUrl}/blog`,
    description:
      'Engineering deep-dives, product updates, and security practices from the Apployd deployment platform team.',
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.publishedAt ?? post.createdAt,
      dateModified: post.updatedAt ?? post.publishedAt ?? post.createdAt,
      url: `${siteUrl}${toContentCanonicalPath(post.slug)}`,
      inLanguage: 'en-US',
      articleSection: post.kind === 'news' ? 'News' : 'Blog',
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
          <p className={blogStyles.heroIntro}>
            Behind the scenes of building a managed SaaS deployment platform.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0, paddingBottom: '1.5rem', borderTop: 'none' }}>
        <div className={styles.container}>
          <div className={blogStyles.filters}>
            {categories.map((category, index) => (
              <button
                key={category}
                className={`${blogStyles.filterChip} ${index === 0 ? blogStyles.filterChipActive : ''}`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          {posts.length ? (
            <div className={blogStyles.postGrid}>
              {posts.map((post) => (
                <a
                  key={post.id}
                  href={toContentCanonicalPath(post.slug)}
                  className={blogStyles.postCard}
                >
                  <div className={blogStyles.postMeta}>
                    <span className={blogStyles.kindBadge}>
                      {post.kind === 'news' ? 'News' : 'Blog'}
                    </span>
                    <span className={blogStyles.metaText}>
                      {formatDate(post.publishedAt ?? post.createdAt)}
                    </span>
                  </div>
                  <h2 className={blogStyles.postTitle}>
                    {post.title}
                  </h2>
                  <p className={blogStyles.postExcerpt}>
                    {post.excerpt}
                  </p>
                  <span className={blogStyles.readTime}>
                    {toReadTimeLabel(post.readTimeMinutes)}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <article className={blogStyles.emptyCard}>
              <p>
                No published posts yet. Publish your first blog or news update from the dashboard content studio.
              </p>
            </article>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container} style={{ maxWidth: 560, textAlign: 'center' }}>
          <p className={styles.sectionLabel}>Stay Updated</p>
          <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            Subscribe to our newsletter
          </h2>
          <p className={blogStyles.newsletterIntro}>
            Engineering deep-dives and product updates, delivered monthly.
          </p>
          <div className={blogStyles.newsletterForm}>
            <input
              type="email"
              placeholder="you@company.com"
              className={blogStyles.newsletterInput}
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
