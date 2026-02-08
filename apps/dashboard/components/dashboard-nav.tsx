'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/overview', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/usage', label: 'Usage' },
  { href: '/billing', label: 'Billing' },
  { href: '/logs', label: 'Logs' },
  { href: '/team', label: 'Team' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/settings', label: 'Settings' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <div className="nav-shell lg:border-r">
      <div className="mb-3 px-2 lg:mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Apployd</p>
        <p className="title-gradient mt-1 text-lg font-semibold">Control Plane</p>
      </div>
      <nav className="flex gap-1 overflow-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${
                active ? 'nav-link-active' : ''
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
