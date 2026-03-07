import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildPageMetadata, SITE_NAME, siteUrl } from '../../../../lib/seo';
import styles from '../../../landing.module.css';
import docsStyles from '../docs.module.css';
import { docPageMap, docPages } from '../content';

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const toIsoDate = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = docPageMap[slug];
  if (!page) {
    return buildPageMetadata({
      title: 'Documentation',
      description: 'Apployd platform documentation.',
      path: '/docs',
    });
  }

  return buildPageMetadata({
    title: `${page.title} | Documentation`,
    description: page.summary,
    path: `/docs/${page.slug}`,
    keywords: [
      'Apployd documentation',
      page.title,
      'production deployment docs',
      'platform operations guide',
    ],
  });
}

export default async function DocTopicPage({ params }: PageProps) {
  const { slug } = await params;
  const page = docPageMap[slug];
  if (!page) {
    notFound();
  }

  const docsJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${page.title} | ${SITE_NAME} Documentation`,
    description: page.summary,
    dateModified: toIsoDate(page.updated),
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    mainEntityOfPage: `${siteUrl}/docs/${page.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(docsJsonLd) }}
      />

      <article className={docsStyles.article}>
        <header className={docsStyles.topicHeader}>
          <p className={docsStyles.topicKicker}>{page.label}</p>
          <h1 className={docsStyles.topicTitle}>{page.title}</h1>
          <p className={docsStyles.topicSummary}>{page.summary}</p>
          <div className={docsStyles.topicMetaRow}>
            <Link href={'/help' as never} className={styles.secondaryButton}>Open Help</Link>
          </div>
        </header>

        {page.sections.map((section) => (
          <section key={section.heading} className={docsStyles.articleSection}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets?.length ? (
              <ul className={docsStyles.checkList}>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
            {section.callout ? <div className={docsStyles.callout}>{section.callout}</div> : null}
          </section>
        ))}

        {page.responsibilityMatrix?.length ? (
          <section className={docsStyles.articleSection}>
            <h2>Shared Responsibility Matrix</h2>
            <div className={docsStyles.tableWrap}>
              <table className={docsStyles.matrixTable}>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Apployd handles</th>
                    <th>Your team handles</th>
                  </tr>
                </thead>
                <tbody>
                  {page.responsibilityMatrix.map((row) => (
                    <tr key={row.area}>
                      <td>{row.area}</td>
                      <td>{row.platform}</td>
                      <td>{row.customer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {page.faq?.length ? (
          <section className={docsStyles.articleSection}>
            <h2>FAQ</h2>
            <div className={docsStyles.faqList}>
              {page.faq.map((item) => (
                <details key={item.question} className={docsStyles.faqItem}>
                  <summary className={docsStyles.faqSummary}>{item.question}</summary>
                  <p className={docsStyles.faqBody}>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
