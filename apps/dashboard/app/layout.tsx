import type { ReactNode } from 'react';

import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';

import { LandingThemeSync } from '../components/landing-theme-sync';

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

export const metadata = {
  title: 'Apployd Dashboard',
  description: 'Deploy and manage backend apps with pooled resources.',
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
