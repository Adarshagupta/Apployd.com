import type { MetadataRoute } from 'next';

import { fetchPublishedContentPosts, toContentAbsoluteUrl } from '../lib/content';
import { siteUrl } from '../lib/seo';

const publicRoutes = [
  '/',
  '/about',
  '/blog',
  '/contact',
  '/docs',
  '/feed.xml',
  '/help',
  '/legal/compliance',
  '/pricing',
  '/privacy',
  '/security',
  '/terms',
] as const;

const priorityByRoute: Partial<Record<(typeof publicRoutes)[number], number>> = {
  '/': 1,
  '/pricing': 0.9,
  '/docs': 0.9,
  '/blog': 0.85,
  '/feed.xml': 0.5,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const publishedPosts = await fetchPublishedContentPosts({
    kind: 'all',
    limit: 400,
    revalidateSeconds: 300,
  });

  const baseRoutes: MetadataRoute.Sitemap = publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency:
      route === '/'
        ? 'weekly'
        : route === '/blog' || route === '/docs' || route === '/feed.xml'
          ? 'weekly'
          : 'monthly',
    priority: priorityByRoute[route] ?? 0.7,
  }));

  const blogRoutes: MetadataRoute.Sitemap = publishedPosts.map((post) => {
    const modified = new Date(post.updatedAt ?? post.publishedAt ?? post.createdAt ?? Date.now());
    return {
      url: toContentAbsoluteUrl(post.slug),
      lastModified: Number.isFinite(modified.getTime()) ? modified : lastModified,
      changeFrequency: 'weekly',
      priority: 0.75,
    };
  });

  return [...baseRoutes, ...blogRoutes];
}
