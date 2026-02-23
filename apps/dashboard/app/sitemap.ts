import type { MetadataRoute } from 'next';

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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicRoutes.map((route) => ({
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
}
