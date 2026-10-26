"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import { NotificationTrigger } from "@/src/components/notifications/NotificationTrigger";
import { ReportProblemDialog } from "@/src/components/chrome/ReportProblemDialog";
import { useAccountPlan } from "@/src/components/account/useAccountPlan";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { AccountAvatarContent } from "@/src/components/account/AccountAvatar";
import { runAccountProjectLogout } from "@/src/lib/account/projectPending";
import { subscribeProblemReportSummaryV1, type ProblemReportSummaryStateV1 } from "@/src/lib/notifications/problemReportObserver";
import { AboutBody, TermsBody } from "./InfoBodies";
import styles from "./AppHeader.module.css";

// Redesign (Arthur 2026-10-26): one header for every screen. Everything the old header had is here — AI Dashboard (or
// Home), notifications, the menu (Description, Terms of Service, Settings, Report a Problem, Problem reports for the
// owner) and the account panel (Profile, Settings, Plans, Log out with the unsaved-work check) — in the new look.
export function AppHeader({ page, onExport }: { page: "home" | "dashboard" | "other"; onExport?: () => void }) {
  const account = useAccountSession();
  const { status } = useAccountPlan();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [dialog, setDialog] = useState<"about" | "terms" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [problemReports, setProblemReports] = useState<ProblemReportSummaryStateV1>({ owner: false, newCount: 0 });
  useEffect(() => subscribeProblemReportSummaryV1(setProblemReports), []);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); setAccountOpen(false); setDialog(null); } };
    const onDown = (event: PointerEvent) => { if (accountOpen && !accountRef.current?.contains(event.target as Node)) setAccountOpen(false); };
    window.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [accountOpen]);

  const closeReport = useCallback(() => setReportOpen(false), []);

  // Same as before: refuse to log out while a project save is unconfirmed (another tab or this one).
  const logOut = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true); setLogoutError(null);
    try {
      if (!account) throw new Error("account_session_required");
      await runAccountProjectLogout(account.id, async () => {
        const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
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
      <header className={styles.bar}>
        <Link href="/" className={styles.brand} aria-label="Diamond Animator, main screen"><span className={styles.brandMark}><DiamondLogo size={34} /></span><span className={styles.brandName}>Diamond Animator</span></Link>
        <div className={styles.actions}>
          {page === "dashboard" ? (
            <Link href="/" className={styles.ghost}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4.5l8 6.5" /><path d="M6.5 9.5V19.5h11V9.5M10 19.5v-5h4v5" /></svg>
              <span className={styles.label}>Home</span>
            </Link>
          ) : (
            <Link href="/credits" className={styles.ghost} aria-label="Open AI Dashboard">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
              <span className={styles.label}>AI Dashboard</span>
              {status && <span className={styles.badge} title="AI credits left">{status.creditsLeft}</span>}
            </Link>
          )}
          <div className={styles.group}>
            <span className={styles.bell}><NotificationTrigger view="home" /></span>
            <span className={styles.groupLine} aria-hidden="true" />
            <button type="button" className={styles.icon} aria-label="Menu" aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => { setMenuOpen((open) => !open); setAccountOpen(false); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
          {/* Export on every page: Home opens it in place; other pages go to Home's export screen. */}
          {onExport ? (
            <button type="button" className={`${styles.ghost} ${styles.special}`} onClick={onExport}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
              <span className={styles.label}>Export</span>
            </button>
          ) : (
            <Link href="/#export" className={`${styles.ghost} ${styles.special}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
              <span className={styles.label}>Export</span>
            </Link>
          )}
          {account && (
            <div className={styles.accountShell} ref={accountRef}>
              <button type="button" className={styles.avatar} data-has-image={account.image ? "true" : undefined} aria-label={`Account for ${account.name || account.email}`} aria-expanded={accountOpen}
                onClick={() => { setAccountOpen((open) => !open); setLogoutError(null); setMenuOpen(false); }}>
                <AccountAvatarContent account={account} imageClassName={styles.avatarImage} />
              </button>
              {accountOpen && (
                <div role="dialog" aria-label="Account actions" className={styles.popover}>
                  <div className={styles.popHead}>
                    <span className={styles.popAvatar} aria-hidden="true"><AccountAvatarContent account={account} imageClassName={styles.avatarImage} /></span>
                    <span className={styles.popText}><strong>{account.name || account.email}</strong><span>{account.email}</span></span>
                  </div>
                  {status && (
                    <Link href="/plans" className={styles.popPlan}>
                      <span><strong>{status.label}</strong><small>{status.creditsLeft} AI credits left</small></span>
                      <span className={styles.popPlanCta}>{status.plan === "trial" ? "Choose a plan" : "Change plan"}</span>
                    </Link>
                  )}
                  <nav className={styles.popLinks} aria-label="Account">
                    <Link href="/account" className={styles.popLink}><ProfileIcon />Profile</Link>
                    <Link href="/settings" className={styles.popLink}><SettingsIcon />Settings</Link>
                    <Link href="/plans" className={styles.popLink}><PlanIcon />Plans</Link>
                  </nav>
                  <button type="button" className={styles.logout} onClick={() => void logOut()} disabled={logoutBusy}><LogoutIcon />{logoutBusy ? "Logging out…" : "Log out"}</button>
                  {logoutError && <div role="alert" className={styles.popError}>{logoutError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* The menu slides in from the right with everything it had before. */}
      <div className={styles.scrim} data-open={menuOpen ? "true" : undefined} aria-hidden="true" onClick={() => setMenuOpen(false)} />
      <aside id="app-menu" className={styles.drawer} data-open={menuOpen ? "true" : undefined} aria-label="Menu" inert={!menuOpen ? true : undefined}>
        <div className={styles.drawerHead}>
          <strong>Menu</strong>
          <button type="button" className={styles.icon} aria-label="Close menu" onClick={() => setMenuOpen(false)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <section className={styles.drawerSection}>
          <p className={styles.drawerLabel}>About Diamond Animator</p>
          <button type="button" className={styles.drawerItem} onClick={() => { setMenuOpen(false); setDialog("about"); }}>Description<Chevron /></button>
          <button type="button" className={styles.drawerItem} onClick={() => { setMenuOpen(false); setDialog("terms"); }}>Terms of Service<Chevron /></button>
        </section>
        <section className={styles.drawerSection}>
          <p className={styles.drawerLabel}>Support</p>
          <button type="button" className={styles.drawerItem} onClick={() => { setMenuOpen(false); setReportOpen(true); }}>Report a Problem<Chevron /></button>
          {problemReports.owner && (
            <Link href="/reports" className={styles.drawerItem}><span>Problem reports{problemReports.newCount > 0 ? ` (${problemReports.newCount} new)` : ""}</span><Chevron /></Link>
          )}
        </section>
      </aside>

      {reportOpen && <ReportProblemDialog onClose={closeReport} />}
      {dialog && (
        <div className={styles.dialogScrim} onClick={() => setDialog(null)}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="info-dialog-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.dialogHead}>
              <div><p className={styles.drawerLabel}>About Diamond Animator</p><h2 id="info-dialog-title">{dialog === "about" ? "Description" : "Terms of Service"}</h2></div>
              <button type="button" className={styles.icon} aria-label={dialog === "about" ? "Close description" : "Close terms"} onClick={() => setDialog(null)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
            </div>
            {dialog === "about" ? <AboutBody /> : <TermsBody />}
          </div>
        </div>
      )}
    </>
  );
}

const Chevron = () => <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
const ProfileIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" /><path d="M5 19.5c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" /></svg>;
const SettingsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
const PlanIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9Z" /></svg>;
const LogoutIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>;
