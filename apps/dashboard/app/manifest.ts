import type { MetadataRoute } from 'next';

import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '../lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#0f172a',
    categories: ['developer', 'productivity', 'utilities'],
    lang: 'en',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    id: siteUrl,
  };
}
