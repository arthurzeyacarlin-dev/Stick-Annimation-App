"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditRingView } from "@/src/components/account/CreditRing";
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
import { creditsText } from "@/src/lib/account/credits";
import { OPEN_ACCOUNT_EVENT, PHONE_TAB_PAGES } from "@/src/components/phone/PhoneTabBar";
import styles from "./AppHeader.module.css";

// Redesign (Arthur 2026-10-26): one header for every screen. Everything the old header had is here — AI Dashboard (or
// Home), notifications, the menu (Description, Terms of Service, Settings, Report a Problem, Problem reports for the
// owner) and the account panel (Profile, Settings, Plans, Log out with the unsaved-work check) — in the new look.
/** Nov 21 (Arthur): opened from the Help Assistant or from inside a project, the AI Dashboard shows "Back" (to where you
 *  were) instead of Home. From Home it still shows Home. */
export type HeaderBack = { label?: string; href?: string; onClick?: () => void };

export function AppHeader({ page, onExport, bellView = "home", back }: { page: "home" | "dashboard" | "other"; onExport?: () => void; bellView?: "home" | "assistant"; back?: HeaderBack }) {
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
  const bellRef = useRef<HTMLSpanElement | null>(null);
  // Phone plan (Arthur, Nov 24, on his iPhone: "the header is just useless"): on a phone, pages with the bottom bar show no
  // header strip. The bell moves to Home's title row, and the bell + the menu's items become rows in the "You" sheet.
  // Pages without the bottom bar (Dashboard over an open project, Problem reports) keep the strip: it is their way back.
  const pathname = usePathname() ?? "/";
  const phoneBare = !back?.onClick && PHONE_TAB_PAGES.has(pathname);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); setAccountOpen(false); setDialog(null); } };
    const onDown = (event: PointerEvent) => { if (accountOpen && !accountRef.current?.contains(event.target as Node)) setAccountOpen(false); };
    window.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [accountOpen]);

  // Phone plan (Nov 24): the phone's bottom bar "You" button opens this same account menu (as a sheet on a phone).
  useEffect(() => {
    const open = (event: Event) => { event.preventDefault(); setMenuOpen(false); setLogoutError(null); setAccountOpen(true); };
    window.addEventListener(OPEN_ACCOUNT_EVENT, open);
    return () => window.removeEventListener(OPEN_ACCOUNT_EVENT, open);
  }, []);

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
      <header className={styles.bar} data-page={page} data-phone-bare={phoneBare ? "" : undefined}>
        <Link href="/" className={styles.brand} aria-label="Diamond Animator, main screen"><span className={styles.brandMark}><DiamondLogo size={30} /></span><span className={styles.brandName}>Diamond Animator</span></Link>
        <div className={styles.actions}>
          {page === "dashboard" && back ? (
            back.onClick
              ? <button type="button" className={styles.ghost} onClick={back.onClick} aria-label={back.label ?? "Back"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>
                  <span className={styles.label}>Back</span>
                </button>
              : <Link href={back.href ?? "/"} className={styles.ghost} aria-label={back.label ?? "Back"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>
                  <span className={styles.label}>Back</span>
                </Link>
          ) : page === "dashboard" ? (
            <Link href="/" className={styles.ghost}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4.5l8 6.5" /><path d="M6.5 9.5V19.5h11V9.5M10 19.5v-5h4v5" /></svg>
              <span className={styles.label}>Home</span>
            </Link>
          ) : (
            <Link href="/credits" className={styles.ghost} aria-label="Open AI Dashboard" data-tour="ai-dashboard">
              <svg viewBox="0 0 24 24" aria-hidden="true" style={{ stroke: "#fff" }}><path d="M3 20h18" /><path d="M5 16l4-5 3 3 6-8" /></svg>
              <span className={styles.label}>AI Dashboard</span>
              {status && <CreditRingView status={status} link={false} showNumber size={18} tip="below" className={styles.ringBadge} />}
            </Link>
          )}
          <div className={styles.group} data-tour="bell-menu">
            <span className={styles.bell} ref={bellRef}><NotificationTrigger view={bellView} /></span>
            <span className={styles.groupLine} aria-hidden="true" />
            <button type="button" className={styles.icon} aria-label="Menu" aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => { setMenuOpen((open) => !open); setAccountOpen(false); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
          {/* Export on every page: Home opens it in place; other pages go to Home's export screen. */}
          {onExport ? (
            <button type="button" className={`${styles.ghost} ${styles.special}`} onClick={onExport} data-tour="export">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
              <span className={styles.label}>Export</span>
            </button>
          ) : (
            <Link href="/#export" className={`${styles.ghost} ${styles.special}`} data-tour="export">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
              <span className={styles.label}>Export</span>
            </Link>
          )}
          {/* phone only: the dim background behind the account sheet (tapping it closes the menu, like any tap outside) */}
          {account && accountOpen && <div className={styles.accountScrim} data-phone-scrim="" aria-hidden="true" />}
          {account && (
            <div className={styles.accountShell} ref={accountRef}>
              <button type="button" className={styles.avatar} data-tour="account" data-has-image={account.image ? "true" : undefined} aria-label={`Account for ${account.name || account.email}`} aria-expanded={accountOpen}
                onClick={() => { setAccountOpen((open) => !open); setLogoutError(null); setMenuOpen(false); }}>
                <AccountAvatarContent account={account} imageClassName={styles.avatarImage} />
              </button>
              {accountOpen && (
                <div role="dialog" aria-label="Account actions" className={styles.popover} data-phone-sheet="">
                  <div className={styles.popHead}>
                    <span className={styles.popAvatar} aria-hidden="true"><AccountAvatarContent account={account} imageClassName={styles.avatarImage} /></span>
                    <span className={styles.popText}><strong>{account.name || account.email}</strong><span>{account.email}</span></span>
                  </div>
                  {status && (
                    <Link href="/plans" className={styles.popPlan}>
                      <span><strong>{status.label}</strong><small>{creditsText(status.creditsLeft)} left</small></span>
                      <span className={styles.popPlanCta}>{status.plan === "trial" ? "Choose a plan" : "Change plan"}</span>
                    </Link>
                  )}
                  <nav className={styles.popLinks} aria-label="Account">
                    <Link href="/account" className={styles.popLink}><ProfileIcon />Profile</Link>
                    <Link href="/settings" className={styles.popLink}><SettingsIcon />Settings</Link>
                    <Link href="/plans" className={styles.popLink}><PlanIcon />Plans</Link>
                  </nav>
                  {/* phone only (no header strip there): the bell and everything the menu had, as rows in this sheet */}
                  <div className={styles.phoneMore}>
                    <button type="button" className={styles.popLink} onClick={() => { setAccountOpen(false); bellRef.current?.querySelector<HTMLButtonElement>("[data-notification-trigger]")?.click(); }}><BellIcon />Notifications</button>
                    <p className={styles.popLabel}>About Diamond Animator</p>
                    <button type="button" className={styles.popLink} onClick={() => { setAccountOpen(false); setDialog("about"); }}><InfoIcon />Description</button>
                    <button type="button" className={styles.popLink} onClick={() => { setAccountOpen(false); setDialog("terms"); }}><TermsIcon />Terms of Service</button>
                    <p className={styles.popLabel}>Support</p>
                    <Link href="/assistant" className={styles.popLink}><HelpIcon />Help · Ask the Assistant</Link>
                    <button type="button" className={styles.popLink} onClick={() => { setAccountOpen(false); setReportOpen(true); }}><FlagIcon />Report a Problem</button>
                    {problemReports.owner && (
                      <Link href="/reports" className={styles.popLink}><ReportsIcon />{`Problem reports${problemReports.newCount > 0 ? ` (${problemReports.newCount} new)` : ""}`}</Link>
                    )}
                    {problemReports.owner && <Link href="/testimonials" className={styles.popLink}><ReportsIcon />Testimonials</Link>}
                  </div>
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
          {/* Help is back on Home (Arthur 2026-10-26): the Assistant answers questions about Diamond Animator. */}
          <Link href="/assistant" className={styles.drawerItem}><span>Help · Ask the Assistant</span><Chevron /></Link>
          <button type="button" className={styles.drawerItem} onClick={() => { setMenuOpen(false); setReportOpen(true); }}>Report a Problem<Chevron /></button>
          {problemReports.owner && (
            <Link href="/reports" className={styles.drawerItem}><span>Problem reports{problemReports.newCount > 0 ? ` (${problemReports.newCount} new)` : ""}</span><Chevron /></Link>
          )}
          {problemReports.owner && <Link href="/testimonials" className={styles.drawerItem}><span>Testimonials</span><Chevron /></Link>}
        </section>
      </aside>

      {reportOpen && <ReportProblemDialog onClose={closeReport} />}
      {dialog && (
        <div className={styles.dialogScrim} data-phone-scrim="" onClick={() => setDialog(null)}>
          <div className={styles.dialog} data-phone-sheet="tall" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title" onClick={(event) => event.stopPropagation()}>
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
const BellIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
const InfoIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.01" /></svg>;
const TermsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7Z" /><path d="M14 3.5v4h4M10 12h5M10 15.5h5" /></svg>;
const HelpIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9Z" /><path d="M10 9.2a2.1 2.1 0 1 1 3 1.9c-.6.3-1 .8-1 1.4" /><path d="M12 14.4h.01" /></svg>;
const FlagIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11" /></svg>;
const ReportsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4Z" /><path d="M4 9.5h16M8 13h8M8 16h5" /></svg>;
const LogoutIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>;
