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
];

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
              <a key={l.href} href={l.href} className={styles.navLink}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className={styles.navActions}>
            <LandingThemeToggle className={styles.themeToggle} />
            <a href="/signup" className={styles.navButton}>
              Get Started
            </a>
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
                Self-hosted deployment platform for backend teams.
              </p>
            </div>
            <div>
              <p className={styles.footerHeading}>Product</p>
              <ul className={styles.footerList}>
                <li><Link href="/#product" className={styles.footerLink}>Features</Link></li>
                <li><a href="/pricing" className={styles.footerLink}>Pricing</a></li>
                <li><a href="/docs" className={styles.footerLink}>Docs</a></li>
                <li><a href="/security" className={styles.footerLink}>Security</a></li>
              </ul>
            </div>
            <div>
              <p className={styles.footerHeading}>Company</p>
              <ul className={styles.footerList}>
                <li><a href="/about" className={styles.footerLink}>About</a></li>
                <li><a href="/blog" className={styles.footerLink}>Blog</a></li>
                <li><a href="/help" className={styles.footerLink}>Help</a></li>
                <li><a href="/contact" className={styles.footerLink}>Contact</a></li>
              </ul>
            </div>
            <div>
              <p className={styles.footerHeading}>Legal</p>
              <ul className={styles.footerList}>
                <li><a href="/privacy" className={styles.footerLink}>Privacy</a></li>
                <li><a href="/terms" className={styles.footerLink}>Terms</a></li>
                <li><a href="/legal/compliance" className={styles.footerLink}>Compliance</a></li>
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
