import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { buildPageMetadata } from '../../../lib/seo';

import { defaultDocSlug } from './content';

export const metadata: Metadata = buildPageMetadata({
  title: 'Documentation',
  description:
    'Production documentation for Apployd: quick start guidance, VS Code extension usage, deployment workflow, security, databases, analytics, team operations, and billing.',
  path: '/docs',
  keywords: [
    'Apployd documentation',
    'VS Code extension guide',
    'deployment workflow docs',
    'application security docs',
    'credentials management docs',
    'database provisioning docs',
    'platform analytics docs',
  ],
});

export default function DocsIndexPage() {
  redirect(`/docs/${defaultDocSlug}`);
}
