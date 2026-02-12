import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import DashboardLayoutClient from './dashboard-layout-client';

import { noIndexRobots } from '../../lib/seo';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage projects, deployments, usage, and billing.',
  robots: noIndexRobots,
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
