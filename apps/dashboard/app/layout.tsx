import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';

import { LandingThemeSync } from '../components/landing-theme-sync';
import {
  indexRobots,
  organizationJsonLd,
  siteMetadataBase,
  siteUrl,
  SITE_PRIMARY_KEYWORDS,
  softwareApplicationJsonLd,
  SITE_DESCRIPTION,
  SITE_NAME,
  websiteJsonLd,
} from '../lib/seo';

import './globals.css';

const heading = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

const metadataVerification: Metadata['verification'] = {
  google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
  yahoo: process.env.NEXT_PUBLIC_YAHOO_SITE_VERIFICATION,
  other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
    : undefined,
};

export const metadata: Metadata = {
  metadataBase: siteMetadataBase,
  title: {
    default: `${SITE_NAME} | Managed Deployment Platform`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: siteUrl }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  referrer: 'origin-when-cross-origin',
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  category: 'technology',
  verification: metadataVerification,
  keywords: [
    SITE_NAME,
    ...SITE_PRIMARY_KEYWORDS,
    'application hosting',
    'backend hosting',
    'devops platform',
  ],
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': `${siteUrl}/feed.xml`,
    },
  },
  openGraph: {
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
    url: '/',
    title: `${SITE_NAME} | Managed Deployment Platform`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} social preview`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | Managed Deployment Platform`,
    description: SITE_DESCRIPTION,
    images: ['/twitter-image'],
  },
  robots: indexRobots,
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.webmanifest',
};

const GOOGLE_TAG_ID = 'AW-17976896275';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_TAG_ID}');`,
          }}
        />
      </head>
      <body className="font-[var(--font-heading)]" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
        />
        <LandingThemeSync />
        {children}
      </body>
    </html>
  );
}
