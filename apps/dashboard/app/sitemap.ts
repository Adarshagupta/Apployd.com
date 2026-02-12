import type { MetadataRoute } from 'next';

import { siteUrl } from '../lib/seo';

const publicRoutes = [
  '/',
  '/about',
  '/blog',
  '/contact',
  '/docs',
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
  '/docs': 0.8,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: priorityByRoute[route] ?? 0.7,
  }));
}
