import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { fetchPublishedContentPostBySlug, toContentAbsoluteUrl } from '../../../../lib/content';
import { buildPageMetadata, SITE_NAME, siteUrl } from '../../../../lib/seo';
import styles from '../../../landing.module.css';

export const dynamic = 'force-dynamic';

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return 'Unscheduled';
  }
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return 'Unscheduled';
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPublishedContentPostBySlug(slug, { revalidateSeconds: 120 });

  if (!post) {
    return buildPageMetadata({
      title: 'Blog',
      description:
        'Engineering deep-dives, product updates, and security practices from the Apployd deployment platform team.',
      path: '/blog',
      type: 'article',
    });
  }

  return buildPageMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    type: 'article',
    keywords: [
      post.kind,
      'apployd blog',
      'deployment updates',
      'platform engineering',
    ],
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await fetchPublishedContentPostBySlug(slug, { revalidateSeconds: 120 });

  if (!post) {
    notFound();
  }

  const paragraphs = post.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    articleBody: post.content,
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt ?? post.publishedAt ?? post.createdAt,
    articleSection: post.kind === 'news' ? 'News' : 'Blog',
    mainEntityOfPage: toContentAbsoluteUrl(post.slug),
    url: toContentAbsoluteUrl(post.slug),
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
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <section className={styles.section} style={{ borderTop: 'none', paddingTop: '2rem' }}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <Link
            href="/blog"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'rgba(202,216,245,0.75)',
              fontSize: '0.86rem',
              border: '1px solid rgba(161,178,216,0.18)',
              borderRadius: 999,
              padding: '0.32rem 0.75rem',
            }}
          >
            Back to blog
          </Link>

          <div style={{ marginTop: '1.2rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#6bb4ff',
                border: '1px solid rgba(42,141,255,0.25)',
                borderRadius: 999,
                padding: '0.2rem 0.55rem',
              }}
            >
              {post.kind === 'news' ? 'News' : 'Blog'}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'rgba(200,210,240,0.45)' }}>
              {formatDate(post.publishedAt ?? post.createdAt)}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'rgba(200,210,240,0.45)' }}>
              {post.readTimeMinutes} min read
            </span>
          </div>

          <h1
            style={{
              margin: '1rem 0 0',
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
            }}
          >
            {post.title}
          </h1>
          <p style={{ margin: '0.9rem 0 0', color: 'rgba(212,221,244,0.72)', fontSize: '1rem', lineHeight: 1.65 }}>
            {post.excerpt}
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: '0.5rem' }}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <article
            style={{
              borderRadius: 18,
              border: '1px solid rgba(161,178,216,0.14)',
              background: 'rgba(8,10,16,0.62)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'grid', gap: '1rem' }}>
              {paragraphs.map((paragraph, index) => (
                <p
                  key={`${post.id}-paragraph-${index}`}
                  style={{
                    margin: 0,
                    color: 'rgba(223,231,248,0.82)',
                    fontSize: '0.98rem',
                    lineHeight: 1.75,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

