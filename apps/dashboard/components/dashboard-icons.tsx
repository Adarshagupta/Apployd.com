'use client';

import type { ReactNode } from 'react';

type IconProps = {
  size?: number | undefined;
  className?: string | undefined;
  title?: string | undefined;
};

function Glyph({
  children,
  size = 17,
  className,
  title,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconOverview(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="5" cy="5" r="1.3" />
      <circle cx="15" cy="5" r="1.3" />
      <circle cx="5" cy="15" r="1.3" />
      <circle cx="15" cy="15" r="1.3" />
      <circle cx="10" cy="10" r="1.5" />
      <path d="M6.2 6.2 8.9 8.9M13.8 6.2 11.1 8.9M6.2 13.8l2.7-2.7M13.8 13.8l-2.7-2.7" />
    </Glyph>
  );
}

export function IconProjects(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3.5" width="10.5" height="8.5" rx="2" />
      <path d="M6.5 12v4.5h10.5V8h-3.5" />
      <path d="M5.8 6.4h4.8" />
    </Glyph>
  );
}

export function IconLogs(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="2.7" y="3.2" width="14.6" height="13.6" rx="2.3" />
      <path d="m6 8 2.2 2-2.2 2" />
      <path d="M10.2 12h4.2" />
    </Glyph>
  );
}

export function IconIntegrations(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="4.8" cy="10" r="1.6" />
      <circle cx="10" cy="5" r="1.6" />
      <circle cx="15.2" cy="10" r="1.6" />
      <circle cx="10" cy="15" r="1.6" />
      <path d="M6.3 9.1 8.6 6.3m2.8 0 2.3 2.8m0 1.8-2.3 2.8m-2.8 0-2.3-2.8" />
    </Glyph>
  );
}

export function IconUsage(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.3 13.4a6.7 6.7 0 1 1 13.4 0" />
      <path d="m10 10-3 3.4" />
      <circle cx="10" cy="10" r="1.2" />
      <path d="M4 16.7h12" />
    </Glyph>
  );
}

export function IconBilling(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="2.8" y="4.2" width="14.4" height="11.6" rx="2.2" />
      <path d="M2.8 8.6h14.4" />
      <circle cx="6" cy="12.2" r="1.1" />
      <path d="M9 12.2h5" />
    </Glyph>
  );
}

export function IconTeam(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="7" cy="7" r="2.1" />
      <circle cx="13.2" cy="8" r="1.7" />
      <path d="M3.8 15.6c.7-2.2 2.1-3.3 4.2-3.3s3.5 1.1 4.2 3.3" />
      <path d="M11.8 15.6c.4-1.5 1.4-2.3 3-2.3 1.1 0 2 .3 2.8 1" />
    </Glyph>
  );
}

export function IconProfile(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="7.1" r="2.3" />
      <path d="M4.6 15.7c.8-2.4 2.6-3.6 5.4-3.6s4.6 1.2 5.4 3.6" />
      <circle cx="10" cy="10" r="7.2" />
    </Glyph>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="10" r="2.2" />
      <path d="M10 4.1v1.8M10 14.1v1.8M4.1 10h1.8M14.1 10h1.8M5.9 5.9l1.3 1.3M12.8 12.8l1.3 1.3M14.1 5.9l-1.3 1.3M7.2 12.8l-1.3 1.3" />
      <circle cx="10" cy="10" r="5.7" />
    </Glyph>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M7.7 8a2.3 2.3 0 1 1 3.8 1.8c-.8.6-1.3 1-1.3 1.9" />
      <circle cx="10" cy="14.2" r=".7" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function IconChevronSwap(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m6 12 4 4 4-4" />
      <path d="m6 8 4-4 4 4" />
    </Glyph>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m4.8 10.5 3.1 3.1L15.2 6.4" />
    </Glyph>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M10 4.4v11.2M4.4 10h11.2" />
    </Glyph>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 8.2v4.4" />
      <circle cx="10" cy="5.8" r=".8" fill="currentColor" stroke="none" />
    </Glyph>
  );
}
