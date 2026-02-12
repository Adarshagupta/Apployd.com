import type { Metadata } from 'next';

const DEFAULT_SITE_URL = 'https://apployd.com';
const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  DEFAULT_SITE_URL;

const normalizedSiteUrl = rawSiteUrl.startsWith('http://') || rawSiteUrl.startsWith('https://')
  ? rawSiteUrl
  : `https://${rawSiteUrl}`;

export const siteUrl = normalizedSiteUrl.replace(/\/+$/, '');
export const siteMetadataBase = new URL(siteUrl);

const defaultOgImage = '/icon.png';

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

export const noIndexRobots: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
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
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type,
      siteName: 'Apployd',
      locale: 'en_US',
      images: [
        {
          url: defaultOgImage,
          width: 512,
          height: 512,
          alt: 'Apployd',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [defaultOgImage],
    },
    robots: noIndex ? noIndexRobots : { index: true, follow: true },
  };
}
