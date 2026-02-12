'use client';

import Image from 'next/image';

type ThemeLogoProps = {
  className?: string | undefined;
  alt?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  priority?: boolean | undefined;
};

export function ThemeLogo({
  className,
  alt = 'Apployd',
  width = 118,
  height = 26,
  priority = false,
}: ThemeLogoProps) {
  const classNames = ['theme-logo', className].filter(Boolean).join(' ');

  return (
    <span className={classNames}>
      <Image
        src="/assets/dark-logo.png"
        alt={alt}
        width={width}
        height={height}
        className="theme-logo-img theme-logo-light"
        priority={priority}
      />
      <Image
        src="/assets/white-logo.png"
        alt={alt}
        width={width}
        height={height}
        className="theme-logo-img theme-logo-dark"
        priority={priority}
      />
    </span>
  );
}
