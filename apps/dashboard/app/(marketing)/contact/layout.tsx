import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { buildPageMetadata } from '../../../lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description:
    'Contact Apployd sales, support, or security teams for platform assistance, partnerships, and technical questions.',
  path: '/contact',
  keywords: ['contact Apployd', 'deployment platform support', 'platform sales'],
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
