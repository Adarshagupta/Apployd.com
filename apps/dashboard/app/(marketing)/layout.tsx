import type { ReactNode } from 'react';
import Link from 'next/link';

import { LandingThemeToggle } from '../../components/landing-theme-toggle';
import { ThemeLogo } from '../../components/theme-logo';
import styles from '../landing.module.css';

const navLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/security', label: 'Security' },
  { href: '/help', label: 'Help' },
  { href: '/contact', label: 'Contact' },
] as const;

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.pageVignette} />

      {/* Nav */}
      <header className={styles.navWrap}>
        <div className={styles.navShell}>
          <Link href="/" className={styles.brand}>
            <ThemeLogo width={20} height={20} className={styles.brandLogo} />
            Apployd
          </Link>
          <nav className={styles.navLinks}>
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className={styles.navLink}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className={styles.navActions}>
            <LandingThemeToggle className={styles.themeToggle} />
            <Link href="/signup" className={styles.navButton}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.marketingContent}>{children}</div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <p className={styles.footerBrand}>
                <ThemeLogo width={18} height={18} className={styles.footerBrandLogo} />
                <span>Apployd</span>
              </p>
              <p className={styles.footerCopy}>
                Managed deployment platform for modern SaaS teams.
              </p>
            </div>
            <div>
              <p className={styles.footerHeading}>Product</p>
              <ul className={styles.footerList}>
                <li><Link href="/#product" className={styles.footerLink}>Features</Link></li>
                <li><Link href="/pricing" className={styles.footerLink}>Pricing</Link></li>
                <li><Link href="/docs" className={styles.footerLink}>Docs</Link></li>
                <li><Link href="/security" className={styles.footerLink}>Security</Link></li>
              </ul>
            </div>
            <div>
              <p className={styles.footerHeading}>Company</p>
              <ul className={styles.footerList}>
                <li><Link href="/about" className={styles.footerLink}>About</Link></li>
                <li><Link href="/blog" className={styles.footerLink}>Blog</Link></li>
                <li><Link href="/help" className={styles.footerLink}>Help</Link></li>
                <li><Link href="/contact" className={styles.footerLink}>Contact</Link></li>
              </ul>
            </div>
            <div>
              <p className={styles.footerHeading}>Legal</p>
              <ul className={styles.footerList}>
                <li><Link href="/privacy" className={styles.footerLink}>Privacy</Link></li>
                <li><Link href="/terms" className={styles.footerLink}>Terms</Link></li>
                <li><Link href="/legal/compliance" className={styles.footerLink}>Compliance</Link></li>
              </ul>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span>&copy; {new Date().getFullYear()} Apployd. All rights reserved.</span>
            <span>Built for developers, by developers.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
