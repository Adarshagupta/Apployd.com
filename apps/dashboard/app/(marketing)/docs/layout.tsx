import type { ReactNode } from 'react';
import Link from 'next/link';

import styles from '../../landing.module.css';
import docsStyles from './docs.module.css';
import { docsAllLinks, docsNavGroups } from './content';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <section className={`${styles.section} ${docsStyles.docsSection}`}>
      <div className={docsStyles.fullWidthWrap}>
        <div className={docsStyles.docsGrid}>
          <aside className={docsStyles.leftRail}>
            <p className={docsStyles.railLabel}>Documentation</p>
            {docsNavGroups.map((group) => (
              <div key={group.heading} className={docsStyles.navGroup}>
                <p className={docsStyles.navHeading}>{group.heading}</p>
                <ul className={docsStyles.navList}>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href as never} className={docsStyles.navLink}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          <main className={docsStyles.mainPane}>{children}</main>

          <aside className={docsStyles.rightRail}>
            <p className={docsStyles.railLabel}>All Topics</p>
            <ul className={docsStyles.onPageList}>
              {docsAllLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href as never} className={docsStyles.onPageLink}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className={docsStyles.sideCard}>
              <p className={docsStyles.sideCardTitle}>Need Help?</p>
              <div className={docsStyles.sideCardLinks}>
                <Link href={'/help' as never}>Help Center</Link>
                <Link href={'/security' as never}>Security Overview</Link>
                <Link href={'/contact' as never}>Contact Team</Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
