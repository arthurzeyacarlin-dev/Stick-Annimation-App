"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { AccountAvatarContent } from "@/src/components/account/AccountAvatar";
import styles from "./PhoneTabBar.module.css";

// Phone plan (Arthur, Nov 24): on phones and tablets the main places sit in one bar at the bottom, where the thumb is, like
// a phone app. A computer never shows it (its CSS only turns on under html[data-device="phone"|"tablet"]).
// It only moves between places that already exist (Home, Open project, AI Dashboard, Help, the account menu); it never
// shows inside the editor or Export, so it can never leave unsaved work.

export const PHONE_NAV_EVENT = "diamond:phone-nav"; // detail: "home" | "projects" (Home listens; it owns those views)
export const OPEN_ACCOUNT_EVENT = "diamond:open-account"; // the header's account menu listens

const TAB_PAGES = new Set(["/", "/credits", "/assistant", "/account", "/settings", "/plans"]);
/** The pages that show the bottom bar on phones (the header strip steps aside there; AppHeader reads this). */
export const PHONE_TAB_PAGES: ReadonlySet<string> = TAB_PAGES;

function useHomeView() {
  const [view, setView] = useState<string | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setView(root.getAttribute("data-home-view"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-home-view"] });
    return () => observer.disconnect();
  }, []);
  return view;
}

export function PhoneTabBar() {
  const account = useAccountSession();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const homeView = useHomeView();
  const onHomeRoute = pathname === "/";
  // On "/" the bar shows only on Home itself and Open project (never in the editor, Export or the dashboard over a project).
  const visible = !!account && TAB_PAGES.has(pathname) && (!onHomeRoute || homeView === "home" || homeView === "openProject");

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute("data-tabbar", "on"); else root.removeAttribute("data-tabbar");
    return () => root.removeAttribute("data-tabbar");
  }, [visible]);

  // The on-screen keyboard: hide the bar while typing so the typing box gets the room (phones only, CSS decides).
  useEffect(() => {
    const root = document.documentElement;
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && (el.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, [contenteditable=true]"));
    const onIn = (event: FocusEvent) => { if (isField(event.target)) root.setAttribute("data-typing", "on"); };
    const onOut = () => { window.setTimeout(() => { if (!isField(document.activeElement)) root.removeAttribute("data-typing"); }, 60); };
    document.addEventListener("focusin", onIn); document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); };
  }, []);

  if (!account) return null;

  const active = onHomeRoute ? (homeView === "openProject" ? "projects" : "home")
    : pathname === "/credits" ? "dashboard"
      : pathname === "/assistant" ? "help"
        : "you";

  const goHome = (to: "home" | "projects") => {
    if (onHomeRoute) window.dispatchEvent(new CustomEvent(PHONE_NAV_EVENT, { detail: to }));
    else router.push(to === "projects" ? "/#projects" : "/");
  };
  const openYou = () => {
    // the header's account menu (Profile, Settings, Plans, Log out) opens as a sheet; with no header, go to Profile
    const event = new CustomEvent(OPEN_ACCOUNT_EVENT, { cancelable: true });
    if (window.dispatchEvent(event)) router.push("/account");
  };

  return (
    <nav className={styles.bar} data-visible={visible ? "true" : undefined} aria-label="Main places" aria-hidden={visible ? undefined : true}>
      <button type="button" className={styles.tab} data-active={active === "home" || undefined} aria-current={active === "home" ? "page" : undefined} onClick={() => goHome("home")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4.5l8 6.5" /><path d="M6.5 9.5V19.5h11V9.5M10 19.5v-5h4v5" /></svg>
        <span>Home</span>
      </button>
      <button type="button" className={styles.tab} data-active={active === "projects" || undefined} aria-current={active === "projects" ? "page" : undefined} onClick={() => goHome("projects")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
        <span>Projects</span>
      </button>
      <button type="button" className={styles.tab} data-active={active === "dashboard" || undefined} aria-current={active === "dashboard" ? "page" : undefined} onClick={() => router.push("/credits")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18" /><path d="M5 16l4-5 3 3 6-8" /></svg>
        <span>Dashboard</span>
      </button>
      <button type="button" className={styles.tab} data-active={active === "help" || undefined} aria-current={active === "help" ? "page" : undefined} onClick={() => router.push("/assistant")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9Z" /><path d="M10 9.2a2.1 2.1 0 1 1 3 1.9c-.6.3-1 .8-1 1.4" /><path d="M12 14.4h.01" /></svg>
        <span>Help</span>
      </button>
      <button type="button" className={styles.tab} data-active={active === "you" || undefined} aria-current={active === "you" ? "page" : undefined} onClick={openYou}>
        <span className={styles.face} aria-hidden="true"><AccountAvatarContent account={account} imageClassName={styles.faceImage} /></span>
        <span>You</span>
      </button>
    </nav>
  );
}
