'use client';

import type { ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  IconBilling,
  IconHelp,
  IconIntegrations,
  IconLogs,
  IconOverview,
  IconProfile,
  IconProjects,
  IconShield,
  IconSettings,
  IconTeam,
  IconUsage,
} from './dashboard-icons';
import { WorkspaceSwitcher } from './workspace-switcher';

const mainItems = [
  {
    href: '/overview',
    label: 'Overview',
    icon: <IconOverview title="Overview" />,
  },
  {
    href: '/projects',
    label: 'Projects',
    icon: <IconProjects title="Projects" />,
  },
  {
    href: '/logs',
    label: 'Logs',
    icon: <IconLogs title="Logs" />,
  },
  {
    href: '/integrations',
    label: 'Integrations',
    icon: <IconIntegrations title="Integrations" />,
  },
];

const accountItems = [
  {
    href: '/usage',
    label: 'Usage',
    icon: <IconUsage title="Usage" />,
  },
  {
    href: '/security-center',
    label: 'Security',
    icon: <IconShield title="Security" />,
  },
  {
    href: '/billing',
    label: 'Billing',
    icon: <IconBilling title="Billing" />,
  },
  {
    href: '/team',
    label: 'Team',
    icon: <IconTeam title="Team" />,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: <IconProfile title="Profile" />,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: <IconSettings title="Settings" />,
  },
];

const supportItems = [
  {
    href: '/support',
    label: 'Help',
    icon: <IconHelp title="Help" />,
  },
];

export function DashboardNav() {
  const pathname = usePathname() ?? '';

  const renderNavItem = (item: { href: string; label: string; icon: ReactNode }) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        href={item.href as any}
        className={`nav-link ${
          active ? 'nav-link-active' : ''
        }`}
      >
        <span className="nav-link-icon">{item.icon}</span>
        <span className="nav-link-label">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="nav-shell">
      <div className="nav-header">
        <WorkspaceSwitcher />
      </div>

      <nav className="nav-content">
        <div className="nav-section">
          {mainItems.map(renderNavItem)}
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Account</div>
          {accountItems.map(renderNavItem)}
        </div>
      </nav>

      <div className="nav-footer">
        <div className="nav-section">
          {supportItems.map(renderNavItem)}
        </div>
      </div>
    </div>
  );
}

