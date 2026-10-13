"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./appChrome.module.css";
import { NotificationTrigger } from "@/src/components/notifications/NotificationTrigger";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { AccountAvatarContent } from "@/src/components/account/AccountAvatar";
import { runAccountProjectLogout } from "@/src/lib/account/projectPending";
import { CloseButton } from "@/src/components/ui/CloseButton";
import { ReportProblemDialog } from "./ReportProblemDialog";
import { subscribeProblemReportSummaryV1, type ProblemReportSummaryStateV1 } from "@/src/lib/notifications/problemReportObserver";

type AppChromeProps = {
  /** The page hosting the global header. Only the nav link differs: Home links to the AI Dashboard, the Dashboard links Home. */
  page?: "home" | "dashboard";
  /** Legacy alias kept for existing callers: `theme="home"` is the same as `page="home"`. */
  theme?: "default" | "home";
};

// SPEC-0020 Phase 1 (Arthur): the account menu has only Profile and Log out.
const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" stroke="currentColor" strokeWidth="1.8" /><path d="M5 19.5c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function AppChrome({ page, theme }: AppChromeProps) {
  const currentPage = page ?? (theme === "home" ? "home" : "dashboard");
  const account = useAccountSession();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // SPEC-0020 Phase 6: the owner sees a "Problem reports" row (with the count of new ones) under Support.
  const [problemReports, setProblemReports] = useState<ProblemReportSummaryStateV1>({ owner: false, newCount: 0 });
  useEffect(() => subscribeProblemReportSummaryV1(setProblemReports), []);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (menuOpen) menuButtonRef.current?.focus({ preventScroll: true });
        else if (accountPopoverOpen) accountButtonRef.current?.focus({ preventScroll: true });
        setMenuOpen(false);
        setAboutOpen(false);
        setTermsOpen(false);
        setReportOpen(false);
        setAccountPopoverOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, accountPopoverOpen]);

  const closeMenuLayers = () => {
    menuButtonRef.current?.focus({ preventScroll: true });
    setMenuOpen(false);
    setAboutOpen(false);
    setTermsOpen(false);
    setAccountPopoverOpen(false);
  };


  const closeReport = useCallback(() => setReportOpen(false), []);

  const logOut = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      if (!account) throw new Error("account_session_required");
      await runAccountProjectLogout(account.id, async () => {
        const response = await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!response.ok) throw new Error("logout_failed");
      });
      window.location.assign("/");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setLogoutError(code === "account_project_other_tab_dirty"
        ? "Another tab has unsaved project changes. Save or close that editor before logging out."
        : code === "account_project_unsaved_changes" || code === "account_project_pending_failed"
          ? "A project save has not been confirmed. Stay signed in and retry Save before logging out."
          : code === "account_project_logout_check_failed"
            ? "Open project tabs could not be checked safely. Stay signed in and try again."
            : "Log out could not be completed. Try again.");
      setLogoutBusy(false);
    }
  };

  return (
    <>
      <header className={styles.homeBar}>
        <div className={styles.homeBrand}>
          <svg className={styles.brandDiamond} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 9 7 4h10l4 5-9 11L3 9Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
            <path d="M3 9h18M7 4l5 16L17 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <span className={styles.homeBrandText}><strong>Diamond Animator</strong><small>Create. Animate. Dominate.</small></span>
        </div>
        <div className={styles.homeActions}>
          <div className={styles.homeBell}><NotificationTrigger view="home" /></div>
          {currentPage === "home" ? (
            <Link href="/credits" className={styles.navLink} aria-label="Open AI dashboard">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="12" width="4" height="8" rx="1" fill="currentColor" /><rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" /><rect x="17" y="4" width="4" height="16" rx="1" fill="currentColor" />
              </svg>
              AI Dashboard
            </Link>
          ) : (
            <Link href="/" className={styles.navLink} aria-label="Return to main screen">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 11 12 4.5l8 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.5 9.5V19.5h11V9.5M10 19.5v-5h4v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Home
            </Link>
          )}
          <button ref={menuButtonRef} type="button" className={styles.homeMenu} aria-label="Menu" aria-expanded={menuOpen} aria-controls="home-menu-panel" onClick={() => { setMenuOpen(open => !open); setAccountPopoverOpen(false); }}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          {account && (
            <div className={styles.accountShell}>
              <button ref={accountButtonRef} type="button" className={styles.homeAvatar} data-has-image={account.image ? "true" : undefined} aria-label={`Account for ${account.name || account.email}`} aria-expanded={accountPopoverOpen} title={account.email}
                onClick={() => { setAccountPopoverOpen(open => !open); setLogoutError(null); setMenuOpen(false); }}><AccountAvatarContent account={account} imageClassName={styles.avatarImage} /></button>
              {accountPopoverOpen && (
                <div role="dialog" aria-label="Account actions" className={styles.accountPopover}>
                  <div className={styles.accountHead}>
                    <span className={styles.accountHeadAvatar} aria-hidden="true"><AccountAvatarContent account={account} imageClassName={styles.avatarImage} /></span>
                    <span className={styles.accountHeadText}>
                      <strong>{account.name || account.email}</strong>
                      <span className={styles.accountEmail}>{account.email}</span>
                    </span>
                  </div>
                  <nav className={styles.accountLinks} aria-label="Account">
                    <Link href="/account" className={styles.accountLink}><ProfileIcon />Profile</Link>
                  </nav>
                  <button type="button" className={styles.logoutButton} onClick={logOut} disabled={logoutBusy}>{logoutBusy ? "Logging out" : "Log out"}</button>
                  {logoutError && <div role="alert" className={styles.accountError}>{logoutError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div
        aria-hidden={!menuOpen}
        onClick={closeMenuLayers}
        className={`${styles.menuScrim} ${menuOpen ? "" : styles.menuScrimClosed}`}
      />

      <aside
        id="home-menu-panel"
        inert={!menuOpen ? true : undefined}
        aria-label="Menu panel"
        onClick={(event) => event.stopPropagation()}
        className={`${styles.menuPanel} ${menuOpen ? "" : styles.menuPanelClosed}`}
      >
        <div className={styles.menuHead}>
          <div className={styles.menuTitle}>Menu</div>
          <CloseButton label="Close menu" onClick={closeMenuLayers} />
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionLabel}>About Diamond Animator</div>
          <button type="button" className={styles.panelButton} onClick={() => { setMenuOpen(false); setAboutOpen(true); }}>
            Description <ChevronIcon />
          </button>
          <button type="button" className={styles.panelButton} onClick={() => { setMenuOpen(false); setTermsOpen(true); }}>
            Terms of Service <ChevronIcon />
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Workspace</div>
          <Link href="/settings" className={styles.panelButton}>
            Settings <ChevronIcon />
          </Link>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Support</div>
          <button type="button" className={styles.panelButton} onClick={() => { setMenuOpen(false); setReportOpen(true); }}>
            Report a Problem <ChevronIcon />
          </button>
          {problemReports.owner && (
            <Link href="/reports" className={styles.panelButton}>
              <span>Problem reports{problemReports.newCount > 0 ? ` (${problemReports.newCount} new)` : ""}</span> <ChevronIcon />
            </Link>
          )}
        </div>
      </aside>

      {reportOpen && <ReportProblemDialog onClose={closeReport} />}

      {aboutOpen && (
        <div onClick={() => setAboutOpen(false)} className={styles.modalScrim}>
          <div className={`darkScroll ${styles.modal}`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.sectionLabel}>About Diamond Animator</div>
                <h2 className={styles.modalTitle}>Description</h2>
              </div>
              <CloseButton label="Close description" onClick={() => setAboutOpen(false)} />
            </div>

            {/* SPEC-0020 Phase 6: a true description of the app today (the old one promised plugins, packs and
                "overnight processing", which don't exist). Arthur reviews the words. */}
            <div className={styles.modalBody}>
              <h3>Diamond Animator</h3>
              <p>
                Diamond Animator is an animation studio for your computer, made for stick-figure animation. Draw your
                characters, bring them to life frame by frame, and share what you make.
              </p>
              <h4>What you can do</h4>
              <ul>
                <li>Draw with the brush, eraser, fill, shapes, text, lasso and knife</li>
                <li>Animate on a timeline with frames, keyframes, layers and onion skin</li>
                <li>Talk to the AI Animator about your animation in plain words</li>
                <li>Export your animation as a video, a GIF or pictures</li>
                <li>Get answers any time from the Help Assistant</li>
              </ul>
              <p>
                Your projects are saved to your account. The AI Animator uses credits; drawing, exporting and the Help
                Assistant are free.
              </p>
              <p className={styles.modalMuted}>
                Diamond Animator is made by Arthur and gets better with every update. Found a problem? Use Report a Problem
                in this menu — every report is read.
              </p>
            </div>
          </div>
        </div>
      )}

      {termsOpen && (
        <div onClick={() => setTermsOpen(false)} className={styles.modalScrim}>
          <div className={`darkScroll ${styles.modal}`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.sectionLabel}>About Diamond Animator</div>
                <h2 className={styles.modalTitle}>Terms of Service</h2>
              </div>
              <CloseButton label="Close terms" onClick={() => setTermsOpen(false)} />
            </div>

            <div className={styles.modalBody}>
              <h3>Diamond Animator</h3>
              <h4>1. Purpose of the Platform</h4>
              <p>
                Diamond Animator is a creative animation workspace designed for building original animated content using drawing
                tools, character systems, and AI assistance.
              </p>
              <p>
                The platform is built to support a wide range of creative styles, from action and storytelling to education, comedy,
                experimental animation, and beyond. You are not limited to specific genres or formats. Creativity is open-ended, as
                long as it stays within safe and responsible boundaries.
              </p>
              <h4>2. Creative Freedom</h4>
              <p>You are free to create original animated content of many kinds, including but not limited to:</p>
              <ul>
                <li>Action scenes and stylized cartoon fighting (non-graphic)</li>
                <li>Story-driven animations</li>
                <li>Educational content</li>
                <li>Fictional worlds and characters</li>
                <li>Experimental or artistic projects</li>
                <li>Comedy and entertainment</li>
              </ul>
              <p>These are examples, not limits. Diamond Animator is designed to support imagination, not restrict it.</p>
              <h4>3. Not Allowed Content</h4>
              <ul>
                <li>
                  <b>Sexual content of any kind</b> (including nudity, sexual acts, or explicit material). This may result in
                  immediate removal.
                </li>
                <li>
                  <b>Graphic or extreme violence</b> (gore, torture, dismemberment, or disturbing violent detail).
                </li>
                <li>
                  <b>Teaching illegal or harmful activities</b> (content intended to show others how to perform unlawful or dangerous
                  actions).
                </li>
                <li>
                  <b>Encouraging self-harm or harm toward others</b>.
                </li>
              </ul>
              <p>Diamond Animator is not a platform for content that promotes real-world harm.</p>
              <h4>4. Enforcement</h4>
              <ul>
                <li>A warning may appear stating the content may violate policy.</li>
                <li>Some content may be blocked or restricted.</li>
                <li>Severe violations may result in immediate removal.</li>
              </ul>
              <h4>5. Keep It Creative</h4>
              <p>
                Diamond Animator is built to support ambitious creativity within clear safety standards. Users are expected to use the
                platform responsibly and in alignment with these guidelines.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
