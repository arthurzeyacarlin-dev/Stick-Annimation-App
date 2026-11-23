import type { ReactNode } from "react";
import Link from "next/link";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "./LegalPage.module.css";

// The in-app Privacy Policy and Terms of Service pages (Nov 23). They work signed out: the sign-up screen links here.
export const SUPPORT_EMAIL = "support@diamondanimator.com";
export const SupportEmail = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
export type LegalSection = { id: string; title: string; content: ReactNode };

export function LegalPage({ title, intro, updated, sections, other }: { title: string; intro: string; updated: string; sections: LegalSection[]; other: { href: string; label: string } }) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <div className={styles.top}>
          <span className={styles.mark}><DiamondLogo size={24} />Diamond Animator</span>
          <Link href="/">← Back</Link>
        </div>
        <header className={styles.head}>
          <h1>{title}</h1>
          <p>{intro}</p>
          <p className={styles.updated}>Last updated: {updated}</p>
        </header>
        <article className={styles.card}>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </article>
        <footer className={styles.foot}>
          <Link href="/">← Back</Link>
          <Link href={other.href}>{other.label}</Link>
          <span>© 2026 Diamond Animator</span>
        </footer>
      </div>
    </main>
  );
}
