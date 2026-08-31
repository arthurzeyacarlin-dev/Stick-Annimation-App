import {TUTORIAL_CARDS, TUTORIAL_STATUS} from "@/src/lib/tutorials/tutorialCatalog";
import styles from "./TutorialsScreen.module.css";

type TutorialsScreenProps = {
  onBack: () => void;
};

const TutorialPlaceholder = ({title, featured}: {title: string; featured: boolean}) => (
  <article
    className={featured ? styles.featuredCard : styles.secondaryCard}
    data-tutorial-card
    data-featured={featured ? "true" : "false"}
  >
    <h2 className={featured ? styles.featuredTitle : styles.secondaryTitle}>{title}</h2>
    <p className={styles.status}>{TUTORIAL_STATUS}</p>
  </article>
);

export function TutorialsScreen({onBack}: TutorialsScreenProps) {
  const featured = TUTORIAL_CARDS.find((card) => card.featured);
  const secondary = TUTORIAL_CARDS.filter((card) => !card.featured);

  if (!featured) {
    return null;
  }

  return (
    <main className={styles.screen} data-tutorials-screen>
      <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back">
        <span aria-hidden="true" className={styles.backArrow}>←</span>
        <span>Back</span>
      </button>

      <div className={styles.content}>
        <h1 className={styles.heading}>Welcome to Diamond Animator</h1>

        <TutorialPlaceholder title={featured.title} featured />

        <section className={styles.secondaryGrid} aria-label="More tutorials coming later">
          {secondary.map((card) => (
            <TutorialPlaceholder key={card.id} title={card.title} featured={false} />
          ))}
        </section>
      </div>
    </main>
  );
}
