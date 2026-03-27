import type { Metadata } from 'next';

const DEFAULT_SITE_URL = 'https://apployd.com';
export const SITE_NAME = 'Apployd';
export const SITE_DESCRIPTION =
  'Apployd is a managed deployment platform for web apps, APIs, Python services, and static sites with transparent billing, team workspaces, managed databases, real-time observability, and built-in developer tooling.';
export const SITE_PRIMARY_KEYWORDS = [
  'apployd',
  'apployd platform',
  'web app deployment platform',
  'api deployment platform',
  'python app deployment',
  'static site deployment',
  'transparent billing',
  'team workspaces',
  'managed postgres',
  'real-time logs',
  'ai code editor',
  'managed deployment platform',
  'saas deployment platform',
  'preview deployments',
  'custom domain hosting',
  'developer platform',
  'platform as a service',
  'git based deployments',
];

export const SITE_NAVIGATION_LINKS = [
  { name: 'Pricing', path: '/pricing' },
  { name: 'Docs', path: '/docs' },
  { name: 'Blog', path: '/blog' },
  { name: 'Security', path: '/security' },
  { name: 'About', path: '/about' },
  { name: 'Help', path: '/help' },
  { name: 'Contact', path: '/contact' },
] as const;
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
  '@id': `${siteUrl}/#website`,
  name: SITE_NAME,
  alternateName: `${SITE_NAME} Deployment Platform`,
  url: siteUrl,
  description: SITE_DESCRIPTION,
  inLanguage: 'en-US',
};

const organizationSameAs = [
  process.env.NEXT_PUBLIC_LINKEDIN_URL,
  process.env.NEXT_PUBLIC_GITHUB_URL,
  process.env.NEXT_PUBLIC_X_URL,
].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  name: SITE_NAME,
  url: siteUrl,
  logo: `${siteUrl}/icon.png`,
  ...(organizationSameAs.length > 0 ? { sameAs: organizationSameAs } : {}),
};

export const siteNavigationJsonLd = SITE_NAVIGATION_LINKS.map((item) => ({
  '@context': 'https://schema.org',
  '@type': 'SiteNavigationElement',
  name: item.name,
  url: `${siteUrl}${item.path}`,
}));

export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Deployment and operations platform',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    category: 'SoftwareSubscription',
  },
  description: SITE_DESCRIPTION,
  featureList: [
    'Web app, API, Python service, and static site deployments',
    'Git-based deployment workflow with preview environments',
    'Transparent billing with usage visibility, invoices, and spend guardrails',
    'Workspace-based team management and role-based access control',
    'Managed PostgreSQL databases, deployment events, and real-time logs',
    'Dashboard, docs, VS Code extension, and built-in Code Studio with AI assistance',
  ],
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
    metadataBase: siteMetadataBase,
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
