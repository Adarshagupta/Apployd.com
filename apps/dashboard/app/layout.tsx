import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';

import { LandingThemeSync } from '../components/landing-theme-sync';
import { siteMetadataBase } from '../lib/seo';

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

export const metadata: Metadata = {
  metadataBase: siteMetadataBase,
  title: {
    default: 'Apployd | Self-Hosted Deployment Platform',
    template: '%s | Apployd',
  },
  description:
    'Self-hosted deployment platform for backend teams. Ship faster with pooled resources, secure secrets, and real-time observability.',
  applicationName: 'Apployd',
  keywords: [
    'Apployd',
    'self-hosted deployment platform',
    'backend hosting',
    'docker deployment',
    'devops',
    'platform engineering',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    siteName: 'Apployd',
    locale: 'en_US',
    type: 'website',
    url: '/',
    title: 'Apployd | Self-Hosted Deployment Platform',
    description:
      'Self-hosted deployment platform for backend teams. Ship faster with pooled resources, secure secrets, and real-time observability.',
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'Apployd',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Apployd | Self-Hosted Deployment Platform',
    description:
      'Self-hosted deployment platform for backend teams. Ship faster with pooled resources, secure secrets, and real-time observability.',
    images: ['/icon.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-[var(--font-heading)]" suppressHydrationWarning>
        <LandingThemeSync />
        {children}
      </body>
    </html>
  );
}
