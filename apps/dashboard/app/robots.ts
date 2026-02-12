import type { MetadataRoute } from 'next';

import { siteUrl } from '../lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
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
        ],
        disallow: [
          '/overview',
          '/projects',
          '/usage',
          '/billing',
          '/logs',
          '/team',
          '/profile',
          '/settings',
          '/integrations',
          '/support',
          '/login',
          '/signup',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
