"use client";

import type {ReactNode} from "react";
import {DiamondLogo} from "@/src/components/chrome/DiamondLogo";
import {TUTORIAL_CARDS, TUTORIAL_STATUS, type TutorialCard} from "@/src/lib/tutorials/tutorialCatalog";
import styles from "./TutorialsScreen.module.css";

type TutorialsScreenProps = {
  onBack: () => void;
};

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const TUTORIAL_ICONS: Record<TutorialCard["id"], ReactNode> = {
  "start-here": (
    <svg {...iconProps}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  ),
  "first-animation": (
    <svg {...iconProps}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  ),
  "create-with-ai": (
    <svg {...iconProps}>
      <path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6L10 4Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </svg>
  ),
  "finalize-animation": (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M7 5l-2 4M12 5l-2 4M17 5l-2 4" />
      <path d="m10.5 12.5 4 2-4 2v-4Z" />
    </svg>
  ),
};

const TutorialPlaceholder = ({card}: {card: TutorialCard}) => (
  <article className={styles.card} data-tutorial-card data-featured={card.featured ? "true" : "false"}>
    <span className={styles.cardIcon}>{TUTORIAL_ICONS[card.id]}</span>
    <div className={styles.cardText}>
      <h2 className={styles.cardTitle}>{card.title}</h2>
      <p className={styles.cardDescription}>{card.description}</p>
    </div>
    <p className={styles.status}>{TUTORIAL_STATUS}</p>
  </article>
);

export function TutorialsScreen({onBack}: TutorialsScreenProps) {

  return (
    <main className={styles.screen} data-tutorials-screen>
      <div className={styles.frame}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back">
          <svg className={styles.backIcon} {...iconProps} width={18} height={18}>
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span>Back</span>
        </button>

        <div className={styles.content}>
          <header className={styles.header}>
            <DiamondLogo className={styles.logo} size={30} />
            <h1 className={styles.heading}>Tutorials</h1>
            <p className={styles.subline}>Step-by-step lessons are on the way.</p>
          </header>

          <section className={styles.grid} aria-label="Tutorials coming later">
            {TUTORIAL_CARDS.map((card) => (
              <TutorialPlaceholder key={card.id} card={card} />
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
