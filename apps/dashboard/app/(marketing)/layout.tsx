import type { ReactNode } from 'react';
import Link from 'next/link';

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
            <span className={styles.brandMark} />
            APployd
          </Link>
          <nav className={styles.navLinks}>
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className={styles.navLink}>
                {l.label}
              </a>
            ))}
          </nav>
          <a href="/signup" className={styles.navButton}>
            Get Started
          </a>
        </div>
      </header>

      {children}

      {/* Footer */}
      <footer
        style={{
          position: 'relative',
          zIndex: 4,
          borderTop: '1px solid rgba(161,178,216,0.14)',
          padding: '3rem 0 2rem',
        }}
      >
        <div className={styles.container}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '2rem 3rem',
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>APployd</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'rgba(200,210,240,0.6)' }}>
                Self-hosted deployment platform for backend teams.
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,210,240,0.5)' }}>Product</p>
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                <li><Link href="/#product" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Features</Link></li>
                <li><a href="/pricing" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Pricing</a></li>
                <li><a href="/docs" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Docs</a></li>
                <li><a href="/security" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Security</a></li>
              </ul>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,210,240,0.5)' }}>Company</p>
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                <li><a href="/about" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>About</a></li>
                <li><a href="/blog" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Blog</a></li>
                <li><a href="/help" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Help</a></li>
                <li><a href="/contact" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Contact</a></li>
              </ul>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,210,240,0.5)' }}>Legal</p>
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                <li><a href="/privacy" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Privacy</a></li>
                <li><a href="/terms" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Terms</a></li>
                <li><a href="/legal/compliance" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Compliance</a></li>
              </ul>
            </div>
          </div>
          <div
            style={{
              marginTop: '2.5rem',
              paddingTop: '1.2rem',
              borderTop: '1px solid rgba(161,178,216,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem',
              color: 'rgba(200,210,240,0.4)',
            }}
          >
            <span>&copy; {new Date().getFullYear()} Apployd. All rights reserved.</span>
            <span>Built for developers, by developers.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
