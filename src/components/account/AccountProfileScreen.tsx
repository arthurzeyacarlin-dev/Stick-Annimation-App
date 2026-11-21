"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAccountSession } from "./AccountSessionProvider";
import { AccountAvatarContent } from "./AccountAvatar";
import { useAccountPlan } from "./useAccountPlan";
import { ACCOUNT_PROFILE_IMAGE_MAX_CHARS } from "@/src/lib/account/accountConfig";
import styles from "./AccountProfileScreen.module.css";
import { BackButton } from "@/src/components/ui/BackButton";
import { creditsText, dollarsText } from "@/src/lib/account/credits";

// SPEC-0020 Phase 1: Profile (picture, name, email), Your plan, Password and Delete my account.
// Name, picture, password and deletion go through the account system (better-auth). App settings moved to
// their own Settings page (SPEC-0020 Phase 3).

type Status = { kind: "ok" | "error"; text: string } | null;

const PICTURE_SIZE = 256;

async function postAuth(path: string, body: unknown) {
  return (await postAuthWithMessage(path, body))?.code ?? null;
}

/** The account system's answer: null = done, else its code and (when it gave one) its plain-words message. */
async function postAuthWithMessage(path: string, body: unknown): Promise<{ code: string; message: string | null } | null> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const data = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
  return { code: String(data?.code ?? "FAILED"), message: typeof data?.message === "string" ? data.message : null };
}

/** Nov 20 (Arthur: "If they delete their account, everything has to be accurate"): what deleting gives back, read from Stripe first. */
type DeletePreview = { hasPlan: boolean; planPaidCents: number; aiCostCents: number; feeCents: number; planRefundCents: number; packRefundCents: number; refundCents: number };
function deletePreviewWords(preview: DeletePreview): string | null {
  if (!preview.hasPlan && preview.refundCents === 0) return null;
  const plan = preview.hasPlan
    // Nov 21 (Arthur: credits everywhere): the AI used is said in credits; dollars only for what was paid and what comes back
    // (aiCostCents is the plan credits used, 1 credit = 1 cent of real AI cost).
    ? `Your plan stops now and you'll never be charged again. You paid ${dollarsText(preview.planPaidCents)} for this period. You used ${creditsText(preview.aiCostCents)} of AI (that's ${dollarsText(preview.aiCostCents)}) and the card fee was ${dollarsText(preview.feeCents)}, so ${dollarsText(preview.planRefundCents)} goes back to your card.`
    : "";
  const packs = preview.packRefundCents > 0 ? ` Your unused pack credits give back ${dollarsText(preview.packRefundCents)} more.` : "";
  return `${plan}${packs} Refunds reach your card in about 5 to 10 days.`.trim();
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
  context.fillStyle = "#232328";
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
  const { status: plan } = useAccountPlan();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(account?.name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState<Status>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);


  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteUnderstood, setDeleteUnderstood] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<{ words: string | null } | { error: string } | null>(null);
  useEffect(() => {
    if (!deleteOpen) return;
    let alive = true;
    fetch("/api/account/billing/delete-preview", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as (DeletePreview & { error?: string }) | null;
        if (!alive) return;
        if (!response.ok || !data) setDeletePreview({ error: data?.error ?? "Your plan couldn't be checked. Please try again in a minute." });
        else setDeletePreview({ words: deletePreviewWords(data) });
      })
      .catch(() => { if (alive) setDeletePreview({ error: "We couldn't reach Diamond Animator. Please try again." }); });
    return () => { alive = false; };
  }, [deleteOpen]);


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


  const onDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleteUnderstood || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const failed = await postAuthWithMessage("delete-user", { password: deletePassword }).catch(() => ({ code: "NETWORK", message: null }));
    if (failed) {
      const code = failed.code;
      setDeleteError(code === "INVALID_PASSWORD" ? "That password isn't right."
        : code === "NETWORK" ? "We couldn't reach Diamond Animator. Please try again."
        : code === "SERVICE_UNAVAILABLE" && failed.message ? failed.message
        : "Your account couldn't be deleted. Nothing was removed. Please try again.");
      setDeleteBusy(false);
      return;
    }
    window.location.assign("/");
  };


  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <header className={styles.pageHead}>
          <BackButton href="/">Back to Home</BackButton>
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
            <button type="submit" className={`${styles.button} da-btn-outline`} disabled={profileBusy}>Save name</button>
          </form>
          <div className={styles.label}>Email<span className={styles.readOnly}>{account.email}</span></div>
          {profileStatus && <p role={profileStatus.kind === "error" ? "alert" : "status"} className={profileStatus.kind === "error" ? styles.error : styles.ok}>{profileStatus.text}</p>}
        </section>

        <section className={styles.card} aria-labelledby="plan-heading">
          <h2 id="plan-heading" className={styles.cardTitle}>Your plan</h2>
          <div className={styles.planRow}>
            {/* Nov 20 (everything in credits): "Pro plan · 1,050 of 1,200 credits left · 250 from packs". */}
            <p className={styles.help}>{!plan ? "Loading your plan"
              : plan.lockReason === "plan_ended" ? "Your plan has ended · you can still watch and export your animations"
              : plan.lockReason === "trial_ended" ? "Your free trial has ended · you can still watch and export your animations"
              : `${plan.plan === "trial" ? "Free trial" : `${plan.label} plan`}${plan.interval === "year" ? " (yearly)" : ""} · ${plan.planCreditsLeft.toLocaleString("en-US")} of ${creditsText(plan.creditsTotal)} left`
                + (plan.topUpCredits > 0 ? ` · ${creditsText(plan.topUpCredits)} from packs` : "")
                + (plan.plan === "trial" ? ` · ${plan.trialDaysLeft === 1 ? "1 day" : `${plan.trialDaysLeft} days`} left` : "")}</p>
            <Link href="/plans" className={`${styles.button} ${styles.primary}`}>{!plan || plan.plan === "trial" || plan.locked ? "Choose a plan" : "Change plan"}</Link>
          </div>
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
              <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={passwordBusy}>{passwordBusy ? "Changing" : "Change password"}</button>
            </div>
          </form>
          {passwordStatus && <p role={passwordStatus.kind === "error" ? "alert" : "status"} className={passwordStatus.kind === "error" ? styles.error : styles.ok}>{passwordStatus.text}</p>}
        </section>

        <section className={`${styles.card} ${styles.danger}`} aria-labelledby="delete-heading">
          <h2 id="delete-heading" className={styles.cardTitle}>Delete my account</h2>
          <p className={styles.help}>This deletes your account, your projects, your AI chats and your settings. It can&apos;t be undone.</p>
          {!deleteOpen ? (
            <div className={styles.buttonRow}>
              <button type="button" className={`${styles.button} ${styles.dangerButton}`} onClick={() => setDeleteOpen(true)}>Delete my account</button>
            </div>
          ) : (
            <form className={styles.fields} onSubmit={(event) => void onDelete(event)}>
              <label className={styles.label} htmlFor="delete-password">Type your password to confirm
                <input id="delete-password" className={styles.input} type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
              </label>
              {deletePreview === null ? <p className={styles.help}>Checking your plan</p>
                : "error" in deletePreview ? <p role="alert" className={styles.error}>{deletePreview.error}</p>
                : deletePreview.words && <p className={styles.help} data-delete-refund="">{deletePreview.words}</p>}
              <label className={styles.checkRow} htmlFor="delete-understood">
                <input id="delete-understood" type="checkbox" checked={deleteUnderstood} onChange={(event) => setDeleteUnderstood(event.target.checked)} />
                I understand my projects and chats will be gone for good.
              </label>
              {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
              <div className={styles.buttonRow}>
                <button type="submit" className={`${styles.button} ${styles.dangerButton}`} disabled={!deleteUnderstood || deleteBusy || deletePreview === null || "error" in deletePreview}>{deleteBusy ? "Deleting" : "Delete my account"}</button>
                <button type="button" className={styles.button} disabled={deleteBusy} onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteUnderstood(false); setDeleteError(null); setDeletePreview(null); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
