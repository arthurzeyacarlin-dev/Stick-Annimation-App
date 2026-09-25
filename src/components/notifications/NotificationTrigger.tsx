"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { notificationBelongsToViewV1, type DiamondNotificationV1 } from "@/src/lib/notifications/notificationContracts";
import { dispatchNotificationTargetV1 } from "@/src/lib/notifications/notificationNavigation";
import { subscribeNotificationCommitsV1 } from "@/src/lib/notifications/notificationStorage";
import { useNotificationCenterV1 } from "./NotificationCenterProvider";
import styles from "./notificationCenter.module.css";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M18 9.6c0-3.05-1.72-5.1-4.3-5.72a1.75 1.75 0 0 0-3.4 0C7.72 4.5 6 6.55 6 9.6v2.88c0 .66-.22 1.28-.63 1.79l-.74.92c-.35.44-.04 1.09.52 1.09h13.7c.56 0 .87-.65.52-1.09l-.74-.92a2.86 2.86 0 0 1-.63-1.79V9.6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.7 18.25c.46.8 1.26 1.28 2.3 1.28s1.84-.48 2.3-1.28" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const displayTime = (notification: DiamondNotificationV1) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(notification.occurredAt);

export function NotificationTrigger({ view }: { view: "home" | "assistant" }) {
  const { snapshot, markRead, markAll, retryRecovery } = useNotificationCenterV1();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [announcement, setAnnouncement] = useState<{ key: string; text: string } | null>(null);
  const [localStatus, setLocalStatus] = useState("");
  const [compact, setCompact] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rows = useMemo(() => snapshot.rows.filter(row => notificationBelongsToViewV1(row, view)), [snapshot.rows, view]);
  const unreadCount = rows.filter(row => row.readAt === null).length;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => subscribeNotificationCommitsV1(notification => {
    if (notification.readAt !== null || !notificationBelongsToViewV1(notification, view)) return;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    setRinging(false);
    requestAnimationFrame(() => setRinging(true));
    setAnnouncement({ key: notification.notificationId, text: `${notification.title}. ${notification.body}` });
    ringTimerRef.current = setTimeout(() => setRinging(false), 760);
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 4_000);
  }), [view]);

  useEffect(() => () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
  }, []);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (!compact || event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, compact]);

  const activate = async (notification: DiamondNotificationV1) => {
    setLocalStatus("");
    try {
      await markRead(notification.notificationId);
      const result = await dispatchNotificationTargetV1(notification.target);
      if (result === "handled") close(false);
      else if (result === "blocked-unsaved") setLocalStatus("Finish or discard the unsaved work before opening this notification.");
      else setLocalStatus("This notification destination is not connected yet.");
    } catch {
      setLocalStatus("The notification could not be updated. Retry notification recovery and try again.");
    }
  };

  const markCurrentViewRead = async () => {
    setLocalStatus("");
    try { await markAll(view); }
    catch { setLocalStatus("Notifications could not be marked as read. Retry notification recovery and try again."); }
  };

  const recover = async () => {
    setLocalStatus("");
    try { await retryRecovery(); }
    catch { setLocalStatus("Notification recovery is still unavailable."); }
  };

  return (
    <div className={styles.owner} data-notification-trigger-owner={view}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${ringing ? styles.ringing : ""}`}
        aria-label={`Notifications, ${unreadCount} unread, ${open ? "expanded" : "collapsed"}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup={compact ? "dialog" : undefined}
        onClick={() => setOpen(value => !value)}
        data-notification-trigger={view}
      >
        <BellIcon />
        {unreadCount > 0 && <span className={styles.dot} aria-hidden="true" />}
      </button>
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true" data-notification-announcement>
        {announcement && <span key={announcement.key}>{announcement.text}</span>}
      </span>

      {open && (
        <div className={compact ? styles.backdrop : undefined} data-notification-backdrop={compact ? "true" : undefined}>
          <div
            id={panelId}
            ref={panelRef}
            className={styles.panel}
            role={compact ? "dialog" : "region"}
            aria-modal={compact || undefined}
            aria-label={`${view === "assistant" ? "Assistant " : ""}notifications`}
            data-notification-panel={view}
          >
            <div className={styles.panelHeader}>
              <div>
                <h2>Notifications</h2>
                <p>{unreadCount} unread</p>
              </div>
              <button ref={closeRef} type="button" className={styles.close} onClick={() => close()} aria-label="Close notifications">Close</button>
            </div>

            {snapshot.fault && (
              <div className={styles.fault} role="status">
                <p>{snapshot.fault.message}</p>
                <button type="button" onClick={() => void recover()}>Retry notification recovery</button>
              </div>
            )}

            {localStatus && <p className={styles.localStatus} role="status">{localStatus}</p>}
            {rows.length === 0 && <p className={styles.empty}>No notifications yet.</p>}
            {rows.length > 0 && (
              <ul className={styles.list}>
                {rows.map(notification => (
                  <li key={notification.notificationId}>
                    <button type="button" className={styles.row} data-unread={notification.readAt === null ? "true" : "false"} onClick={() => void activate(notification)}>
                      <span className={styles.rowTop}>
                        <strong>{notification.title}</strong>
                        {notification.readAt === null && <span className={styles.unreadText}>Unread</span>}
                      </span>
                      <span className={styles.body}>{notification.body}</span>
                      <time dateTime={new Date(notification.occurredAt).toISOString()}>{displayTime(notification)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {unreadCount > 0 && (
              <button type="button" className={styles.markAll} onClick={() => void markCurrentViewRead()}>Mark all as read</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
