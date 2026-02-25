import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { noIndexRobots } from '../../lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Onboarding',
  description: 'Complete first-time workspace setup.',
  robots: noIndexRobots,
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return children;
}
