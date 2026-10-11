"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAccountSession } from "./AccountSessionProvider";
import { AccountAvatarContent } from "./AccountAvatar";
import { ACCOUNT_PROFILE_IMAGE_MAX_CHARS } from "@/src/lib/account/accountConfig";
import { readAccountJson, writeAccountJson } from "@/src/lib/account/accountDataClient";
import styles from "./AccountProfileScreen.module.css";

// SPEC-0020 Phase 1: Profile (picture, name, email), Password, Settings and Delete my account.
// Name, picture, password and deletion go through the account system (better-auth); Settings are saved in the
// account's own preferences record (the same one Home's welcome screen reads).

type Status = { kind: "ok" | "error"; text: string } | null;
type HomePreferencesV1 = { schema: "account-home-preferences/v1"; welcomeSeen: boolean; neverShowWelcome: boolean; guidedChoices: string[] };

const PICTURE_SIZE = 256;

async function postAuth(path: string, body: unknown) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  return String(((await response.json().catch(() => null)) as { code?: unknown } | null)?.code ?? "FAILED");
}

/** Center-crops and shrinks a picture to a small square JPEG, so it stays light to save and show. */
async function pictureToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PICTURE_SIZE;
  canvas.height = PICTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("picture_unreadable");
  context.fillStyle = "#0f2a52";
  context.fillRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
  bitmap.close();
  for (const quality of [0.86, 0.72, 0.58]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= ACCOUNT_PROFILE_IMAGE_MAX_CHARS) return url;
  }
  throw new Error("picture_too_large");
}

export function AccountProfileScreen() {
  const account = useAccountSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(account?.name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState<Status>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);

  const [preferences, setPreferences] = useState<{ revision: number; value: HomePreferencesV1 } | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<Status>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteUnderstood, setDeleteUnderstood] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readAccountJson<HomePreferencesV1>("preferences", "home").then((record) => {
      if (cancelled) return;
      const value = record?.value;
      const valid = value?.schema === "account-home-preferences/v1" && typeof value.welcomeSeen === "boolean" && typeof value.neverShowWelcome === "boolean" && Array.isArray(value.guidedChoices);
      setPreferences({
        revision: record?.revision ?? 0,
        value: valid ? value : { schema: "account-home-preferences/v1", welcomeSeen: false, neverShowWelcome: false, guidedChoices: [] },
      });
    }).catch(() => { if (!cancelled) setSettingsStatus({ kind: "error", text: "Your settings couldn't load. Reload the page to try again." }); });
    return () => { cancelled = true; };
  }, []);

  if (!account) return null;

  const saveProfile = async (body: { name?: string; image?: string | null }, okText: string) => {
    setProfileBusy(true);
    setProfileStatus(null);
    const code = await postAuth("update-user", body).catch(() => "NETWORK");
    setProfileBusy(false);
    if (code) {
      setProfileStatus({ kind: "error", text: code === "NETWORK" ? "We couldn't reach Diamond Animator. Please try again." : "That change couldn't be saved. Please try again." });
      return;
    }
    setProfileStatus({ kind: "ok", text: okText });
    router.refresh();
  };

  const onPicture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setProfileStatus({ kind: "error", text: "Pick a picture file (JPG, PNG or similar)." }); return; }
    try {
      await saveProfile({ image: await pictureToDataUrl(file) }, "Picture saved.");
    } catch {
      setProfileStatus({ kind: "error", text: "That picture couldn't be read. Try a different one." });
    }
  };

  const onName = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setProfileStatus({ kind: "error", text: "Your name can't be empty." }); return; }
    if (trimmed === account.name) { setProfileStatus({ kind: "ok", text: "That's already your name." }); return; }
    await saveProfile({ name: trimmed }, "Name saved.");
  };

  const onPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setPasswordStatus({ kind: "error", text: "The two new passwords don't match." }); return; }
    setPasswordBusy(true);
    setPasswordStatus(null);
    const code = await postAuth("change-password", { currentPassword, newPassword, revokeOtherSessions: true }).catch(() => "NETWORK");
    setPasswordBusy(false);
    if (code) {
      setPasswordStatus({ kind: "error", text: code === "INVALID_PASSWORD" ? "Your current password isn't right."
        : code === "PASSWORD_TOO_SHORT" ? "Use a new password with at least 8 characters."
        : code === "NETWORK" ? "We couldn't reach Diamond Animator. Please try again."
        : "Your password couldn't be changed. Please try again." });
      return;
    }
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setPasswordStatus({ kind: "ok", text: "Password changed. Other devices were logged out." });
  };

  const setShowWelcome = async (show: boolean) => {
    if (!preferences || settingsBusy) return;
    const next: HomePreferencesV1 = { ...preferences.value, neverShowWelcome: !show, welcomeSeen: !show };
    setSettingsBusy(true);
    setSettingsStatus(null);
    try {
      const result = await writeAccountJson("preferences", "home", next, preferences.revision);
      setPreferences({ revision: result.revision, value: next });
      setSettingsStatus({ kind: "ok", text: show ? "Saved. You'll see the welcome screen next time you open Home." : "Saved. The welcome screen won't show." });
    } catch {
      setSettingsStatus({ kind: "error", text: "That setting couldn't be saved. Reload the page and try again." });
    }
    setSettingsBusy(false);
  };

  const onDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleteUnderstood || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const code = await postAuth("delete-user", { password: deletePassword }).catch(() => "NETWORK");
    if (code) {
      setDeleteError(code === "INVALID_PASSWORD" ? "That password isn't right." : code === "NETWORK" ? "We couldn't reach Diamond Animator. Please try again." : "Your account couldn't be deleted. Nothing was removed. Please try again.");
      setDeleteBusy(false);
      return;
    }
    window.location.assign("/");
  };

  const showWelcome = preferences ? !preferences.value.neverShowWelcome && !preferences.value.welcomeSeen : false;

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <header className={styles.pageHead}>
          <p className={styles.eyebrow}>Your account</p>
          <h1 className={styles.title}>Profile</h1>
        </header>

        <section className={styles.card} aria-labelledby="profile-heading">
          <h2 id="profile-heading" className={styles.cardTitle}>Profile</h2>
          <div className={styles.profileRow}>
            <button type="button" className={styles.bigAvatar} onClick={() => fileRef.current?.click()} disabled={profileBusy} aria-label="Change profile picture">
              <AccountAvatarContent account={account} imageClassName={styles.bigAvatarImage} />
            </button>
            <div className={styles.pictureActions}>
              <p className={styles.help}>Your picture shows in the circle at the top of every page.</p>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.button} onClick={() => fileRef.current?.click()} disabled={profileBusy}>{account.image ? "Change picture" : "Add a picture"}</button>
                {account.image && <button type="button" className={styles.button} onClick={() => void saveProfile({ image: null }, "Picture removed.")} disabled={profileBusy}>Remove picture</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void onPicture(event)} />
            </div>
          </div>
          <form className={styles.fieldRow} onSubmit={(event) => void onName(event)}>
            <label className={styles.label} htmlFor="profile-name">Display name
              <input id="profile-name" className={styles.input} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={profileBusy}>Save name</button>
          </form>
          <div className={styles.label}>Email<span className={styles.readOnly}>{account.email}</span></div>
          {profileStatus && <p role={profileStatus.kind === "error" ? "alert" : "status"} className={profileStatus.kind === "error" ? styles.error : styles.ok}>{profileStatus.text}</p>}
        </section>

        <section className={styles.card} aria-labelledby="password-heading">
          <h2 id="password-heading" className={styles.cardTitle}>Password</h2>
          <form className={styles.fields} onSubmit={(event) => void onPassword(event)}>
            <label className={styles.label} htmlFor="password-current">Current password
              <input id="password-current" className={styles.input} type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </label>
            <div className={styles.twoColumns}>
              <label className={styles.label} htmlFor="password-new">New password
                <input id="password-new" className={styles.input} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
              <label className={styles.label} htmlFor="password-confirm">Type it again
                <input id="password-confirm" className={styles.input} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
            </div>
            <div className={styles.buttonRow}>
              <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={passwordBusy}>{passwordBusy ? "Changing…" : "Change password"}</button>
            </div>
          </form>
          {passwordStatus && <p role={passwordStatus.kind === "error" ? "alert" : "status"} className={passwordStatus.kind === "error" ? styles.error : styles.ok}>{passwordStatus.text}</p>}
        </section>

        <section id="settings" className={styles.card} aria-labelledby="settings-heading">
          <h2 id="settings-heading" className={styles.cardTitle}>Settings</h2>
          <label className={styles.toggleRow} htmlFor="setting-welcome">
            <span>
              <strong>Welcome screen</strong>
              <small>Show the welcome screen and guided setup next time you open Home.</small>
            </span>
            <input id="setting-welcome" type="checkbox" role="switch" aria-label="Show the welcome screen" className={styles.switch} checked={showWelcome} disabled={!preferences || settingsBusy}
              onChange={(event) => void setShowWelcome(event.target.checked)} />
          </label>
          {settingsStatus && <p role={settingsStatus.kind === "error" ? "alert" : "status"} className={settingsStatus.kind === "error" ? styles.error : styles.ok}>{settingsStatus.text}</p>}
        </section>

        <section className={`${styles.card} ${styles.danger}`} aria-labelledby="delete-heading">
          <h2 id="delete-heading" className={styles.cardTitle}>Delete my account</h2>
          <p className={styles.help}>This deletes your account, your projects, your AI chats and your settings. It can&apos;t be undone.</p>
          {!deleteOpen ? (
            <div className={styles.buttonRow}>
              <button type="button" className={`${styles.button} ${styles.dangerButton}`} onClick={() => setDeleteOpen(true)}>Delete my account…</button>
            </div>
          ) : (
            <form className={styles.fields} onSubmit={(event) => void onDelete(event)}>
              <label className={styles.label} htmlFor="delete-password">Type your password to confirm
                <input id="delete-password" className={styles.input} type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
              </label>
              <label className={styles.checkRow} htmlFor="delete-understood">
                <input id="delete-understood" type="checkbox" checked={deleteUnderstood} onChange={(event) => setDeleteUnderstood(event.target.checked)} />
                I understand my projects and chats will be gone for good.
              </label>
              {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
              <div className={styles.buttonRow}>
                <button type="submit" className={`${styles.button} ${styles.dangerButton}`} disabled={!deleteUnderstood || deleteBusy}>{deleteBusy ? "Deleting…" : "Delete my account"}</button>
                <button type="button" className={styles.button} disabled={deleteBusy} onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteUnderstood(false); setDeleteError(null); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
