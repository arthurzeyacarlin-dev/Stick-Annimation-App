"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NEW_PROJECT_FPS_CHOICES, saveAppSettings, useAppSettings, type AppSettingsV1, type NotificationVolume } from "@/src/lib/account/appSettings";
import { playNotificationDing } from "@/src/lib/notifications/notificationSound";
import { startLearnMode } from "@/src/components/learn/LearnMode";
import { BackButton } from "@/src/components/ui/BackButton";
import styles from "./SettingsScreen.module.css";

// SPEC-0020 Phase 3: settings for Diamond Animator itself (Profile and the plan have their own pages).
// Every control saves to the account right away and changes the app (Arthur: no layout-only settings).
const VOLUMES: { value: NotificationVolume; label: string }[] = [{ value: "quiet", label: "Quiet" }, { value: "normal", label: "Normal" }, { value: "loud", label: "Loud" }];
const FPS_HINT: Record<number, string> = { 12: "the classic hand-drawn look", 24: "smooth, like movies", 30: "extra smooth, like videos" };

export function SettingsScreen() {
  const router = useRouter();
  const { settings, ready } = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const save = async (patch: Partial<Omit<AppSettingsV1, "schema">>, after?: (next: AppSettingsV1) => void) => {
    setBusy(true);
    setStatus(null);
    try {
      await saveAppSettings(patch);
      setStatus({ kind: "ok", text: "Saved." });
      after?.({ ...settings, ...patch });
    } catch {
      setStatus({ kind: "error", text: "That setting couldn't be saved. Reload the page and try again." });
    }
    setBusy(false);
  };
  const disabled = !ready || busy;

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <BackButton href="/">Back to Home</BackButton>
        <p className={styles.eyebrow}>Diamond Animator</p>
        <h1 className={styles.title}>Settings</h1>

        <section className={styles.section} aria-labelledby="settings-notifications">
          <h2 id="settings-notifications" className={styles.sectionTitle}>Notifications</h2>
          <div className={styles.row}>
            <label htmlFor="setting-sound" className={styles.text}><strong>Notification sound</strong><small>A &ldquo;ding ding&rdquo; when something new arrives, on every page (the editor too).</small></label>
            <input id="setting-sound" type="checkbox" role="switch" aria-label="Notification sound" className={styles.switch} checked={settings.notificationSound} disabled={disabled}
              onChange={(event) => void save({ notificationSound: event.target.checked }, (next) => { if (next.notificationSound) playNotificationDing(next.notificationVolume); })} />
          </div>
          <div className={`${styles.row} ${styles.choiceRow}`}>
            <span className={styles.text}><strong>Volume</strong><small>How loud the &ldquo;ding ding&rdquo; is. Choosing one plays it.</small></span>
            <div className={styles.segmented} role="group" aria-label="Notification volume">
              {VOLUMES.map((option) => (
                <button key={option.value} type="button" aria-pressed={settings.notificationVolume === option.value} disabled={disabled || !settings.notificationSound}
                  onClick={() => void save({ notificationVolume: option.value }, () => playNotificationDing(option.value))}>{option.label}</button>
              ))}
            </div>
          </div>
          <div className={styles.row}>
            <label htmlFor="setting-ring" className={styles.text}><strong>Ring the bell</strong><small>The bell swings left and right when something new arrives.</small></label>
            <input id="setting-ring" type="checkbox" role="switch" aria-label="Ring the bell" className={styles.switch} checked={settings.bellRing} disabled={disabled}
              onChange={(event) => void save({ bellRing: event.target.checked })} />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="settings-projects">
          <h2 id="settings-projects" className={styles.sectionTitle}>New projects</h2>
          <div className={`${styles.row} ${styles.choiceRow}`}>
            <span className={styles.text}><strong>Frames per second</strong><small>New projects start at {settings.newProjectFps} frames per second: {FPS_HINT[settings.newProjectFps]}. You can still change it in the editor.</small></span>
            <div className={styles.segmented} role="group" aria-label="Frames per second for new projects">
              {NEW_PROJECT_FPS_CHOICES.map((fps) => (
                <button key={fps} type="button" aria-pressed={settings.newProjectFps === fps} disabled={disabled} onClick={() => void save({ newProjectFps: fps })}>{fps} fps</button>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="settings-learn">
          <h2 id="settings-learn" className={styles.sectionTitle}>Guided tour</h2>
          <div className={`${styles.row} ${styles.choiceRow}`}>
            <span className={styles.text}><strong>Guided tour</strong><small>A short walk through the main controls on Home.</small></span>
            <button type="button" className="da-plain-button" onClick={() => { startLearnMode(); router.push("/"); }}>Start guided tour</button>
          </div>
        </section>

        {status && <p role={status.kind === "error" ? "alert" : "status"} className={status.kind === "error" ? styles.error : styles.ok}>{status.text}</p>}
      </div>
    </main>
  );
}
