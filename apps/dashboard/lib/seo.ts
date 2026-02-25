import type { Metadata } from 'next';

const DEFAULT_SITE_URL = 'https://apployd.com';
export const SITE_NAME = 'Apployd';
export const SITE_DESCRIPTION =
  'Apployd is a deployment platform for backend apps. Deploy APIs on your own infrastructure with Git-based workflows, preview environments, and real-time observability.';
export const SITE_PRIMARY_KEYWORDS = [
  'apployd',
  'apployd platform',
  'backend deployment platform',
  'managed deployment platform',
  'saas deployment platform',
  'hetzner deployment platform',
  'vercel alternative',
  'preview deployments',
  'custom domain hosting',
  'developer platform',
  'platform as a service',
  'git based deployments',
];
const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  DEFAULT_SITE_URL;

const normalizedSiteUrl = rawSiteUrl.startsWith('http://') || rawSiteUrl.startsWith('https://')
  ? rawSiteUrl
  : `https://${rawSiteUrl}`;

export const siteUrl = normalizedSiteUrl.replace(/\/+$/, '');
export const siteMetadataBase = new URL(siteUrl);

const defaultOgImage = '/opengraph-image';
const defaultTwitterImage = '/twitter-image';

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

export const noIndexRobots: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    'max-video-preview': 0,
    'max-image-preview': 'none',
    'max-snippet': 0,
  },
};

export const indexRobots: NonNullable<Metadata['robots']> = {
  index: true,
  follow: true,
  nocache: false,
  googleBot: {
    index: true,
    follow: true,
    noimageindex: false,
    'max-video-preview': -1,
    'max-image-preview': 'large',
    'max-snippet': -1,
  },
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: siteUrl,
  description: SITE_DESCRIPTION,
};

const organizationSameAs = [
  process.env.NEXT_PUBLIC_LINKEDIN_URL,
  process.env.NEXT_PUBLIC_GITHUB_URL,
  process.env.NEXT_PUBLIC_X_URL,
].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: siteUrl,
  logo: `${siteUrl}/icon.png`,
  ...(organizationSameAs.length > 0 ? { sameAs: organizationSameAs } : {}),
};

export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    category: 'SoftwareSubscription',
  },
  description: SITE_DESCRIPTION,
  url: siteUrl,
};

type BuildPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[] | undefined;
  type?: 'website' | 'article' | undefined;
  noIndex?: boolean | undefined;
};

export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  type = 'website',
  noIndex = false,
}: BuildPageMetadataOptions): Metadata {
  const canonicalPath = normalizePath(path);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
      languages: {
        'en-US': canonicalPath,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type,
      siteName: SITE_NAME,
      locale: 'en_US',
      images: [
        {
          url: defaultOgImage,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} social preview`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [defaultTwitterImage],
    },
    robots: noIndex ? noIndexRobots : indexRobots,
  };
}
