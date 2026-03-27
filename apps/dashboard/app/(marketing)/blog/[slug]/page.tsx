import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { fetchPublishedContentPostBySlug, toContentAbsoluteUrl } from '../../../../lib/content';
import { buildPageMetadata, SITE_NAME, siteUrl } from '../../../../lib/seo';
import styles from '../../../landing.module.css';
import blogStyles from '../blog.module.css';

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
            className={blogStyles.articleBackLink}
          >
            Back to blog
          </Link>

          <div className={blogStyles.articleMeta}>
            <span className={blogStyles.kindBadge}>
              {post.kind === 'news' ? 'News' : 'Blog'}
            </span>
            <span className={blogStyles.metaText}>
              {formatDate(post.publishedAt ?? post.createdAt)}
            </span>
            <span className={blogStyles.metaText}>
              {post.readTimeMinutes} min read
            </span>
          </div>

          <h1 className={blogStyles.articleTitle}>
            {post.title}
          </h1>
          <p className={blogStyles.articleExcerpt}>
            {post.excerpt}
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: '0.5rem' }}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <article>
            <div className={blogStyles.articleBody}>
              {paragraphs.map((paragraph, index) => (
                <p
                  key={`${post.id}-paragraph-${index}`}
                  className={blogStyles.articleParagraph}
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
