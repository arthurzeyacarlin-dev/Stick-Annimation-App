import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_LOCAL_ORIGIN, ACCOUNT_LOCAL_ORIGINS, ACCOUNT_PREVIEW_PLANS, isAccountProfileImage } from "./accountConfig";
// Server-only helpers are imported inside the hooks (not at the top), so the account setup tool
// (`npm exec -- auth migrate --config src/lib/account/auth.ts`) can still load this file.

const LOCAL_ROOT = path.resolve(process.cwd(), ".local/spec0015-phase3");
const SECRET_PATH = path.join(LOCAL_ROOT, "auth-secret");
const databaseName = process.env.SPEC0015_ACCOUNT_DB_NAME?.trim() || "auth.sqlite";

if (!/^[a-z0-9-]+\.sqlite$/.test(databaseName)) {
  throw new Error("SPEC0015_ACCOUNT_DB_NAME must be a simple .sqlite filename.");
}

const databasePath = path.join(LOCAL_ROOT, databaseName);
const secret = fs.readFileSync(SECRET_PATH, "utf8").trim();
if (secret.length < 32) throw new Error("The local account secret is missing or invalid.");

type AccountDatabaseGlobal = typeof globalThis & {
  diamondAccountDatabase?: { path: string; database: Database.Database };
};

const owner = globalThis as AccountDatabaseGlobal;
if (owner.diamondAccountDatabase && owner.diamondAccountDatabase.path !== databasePath) {
  owner.diamondAccountDatabase.database.close();
  owner.diamondAccountDatabase = undefined;
}

const database = owner.diamondAccountDatabase?.database ?? new Database(databasePath);
if (!owner.diamondAccountDatabase) {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  owner.diamondAccountDatabase = { path: databasePath, database };
}

/** (dad, Nov 26) the account database itself, read by the email-confirm rule (emailConfirm.ts: one free trial per real inbox). */
export const accountDatabase = database;

export const auth = betterAuth({
  appName: "Diamond Animator",
  baseURL: ACCOUNT_LOCAL_ORIGIN,
  basePath: "/api/auth",
  secret,
  database,
  trustedOrigins: ACCOUNT_LOCAL_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // SPEC-0020 Phase 1: "Forgot password?" — the link works for 1 hour and logs the account out everywhere.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { sendAccountMail } = await import("./accountMail");
      await sendAccountMail({
        to: user.email,
        subject: "Reset your Diamond Animator password",
        text: `Hi ${user.name || "there"},\n\nSomeone asked to reset the password for your Diamond Animator account. Open this link to choose a new one (it works for 1 hour):\n\n${url}\n\nIf it wasn't you, ignore this email. Your password stays the same.`,
        link: url,
      });
    },
  },
  user: {
    additionalFields: {
      // SPEC-0020 Phase 1: sign-up no longer asks for a test plan. Phase 2 replaces this with the real trial/plan.
      previewPlan: {
        type: ACCOUNT_PREVIEW_PLANS.map((plan) => plan.id),
        required: false,
        defaultValue: "creator_preview",
        input: false,
        returned: true,
      },
      // SPEC-0031 (dad, Nov 26 - COPPA): one word per account, never the birth year: "13plus", "parent" or "under13"
      // (see ageCheck.ts). The browser can't set or change it: a sign-up's answer is checked in databaseHooks below, an old
      // account answers once through /api/account/age. Empty = an account made before the rule (asked on its next visit).
      ageGroup: { type: "string", required: false, input: false, returned: true },
      ageCheckedAt: { type: "date", required: false, input: false, returned: false },
    },
    // SPEC-0020 Phase 1: "Delete my account" (password required). Projects are marked deleted like the library's
    // Delete, and the account's saved chats, notifications, preferences and recovery copies are removed first.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        // SPEC-0029: their testimonial goes too - FIRST, so a failure here stops the deletion before anything is removed
        (await import("./testimonialStore")).deleteTestimonialsForUser(user.id);
        // Nov 20 (the money system): the plan is stopped and the refund made FIRST. If Stripe can't be reached, nothing is
        // deleted, so nobody is ever charged for an account that's gone.
        const { closeBillingForDeletion, BillingError } = await import("./stripeBilling");
        try {
          await closeBillingForDeletion(user.id);
        } catch (error) {
          const { APIError } = await import("better-auth/api");
          throw new APIError("SERVICE_UNAVAILABLE", { message: error instanceof BillingError ? error.message : "Your account wasn't deleted. Try again in a minute." });
        }
        const [{ deleteAllAccountProjects }, { deleteAllAccountDataForOwner }, { deleteAccountPlan }] = await Promise.all([import("./projectServer"), import("./accountDataServer"), import("./aiCredits")]);
        await deleteAllAccountProjects(user.id);
        deleteAllAccountDataForOwner(user.id);
        // (dad, Nov 26) an inbox that used its free trial keeps its fingerprint: deleting and signing up again gets no new trial
        (await import("./emailConfirm")).rememberInboxOnDelete(user);
        deleteAccountPlan(user.id);
      },
      // Nov 23: the account is gone, so the email service is told once and its follow-up emails stop. Best effort: it
      // never waits and never fails, so it can't hold up or undo a deletion.
      afterDelete: async (user) => {
        try {
          const { sendAccountDeletedSignal } = await import("./emailSignals");
          sendAccountDeletedSignal(user.id, user.email);
        } catch { /* the deletion is already done */ }
      },
    },
  },
  // SPEC-0020 Phase 1: a profile picture must be a small image (resized in the browser); anything else is refused.
  databaseHooks: {
    user: {
      // SPEC-0031: a sign-up must say "13plus" or "parent" (an under-13 never signs up with their own email). Anything else
      // is refused before the account exists. Accounts made outside the sign-up page (none today) are simply asked later.
      create: {
        before: async (data, context) => {
          if (context?.path !== "/sign-up/email") return { data };
          const { isSignUpAgeGroup } = await import("./ageCheck");
          // Sent as "ageAnswer" (not the column's name), because the browser may never write the column itself.
          const ageGroup = (context.body as { ageAnswer?: unknown } | undefined)?.ageAnswer;
          if (!isSignUpAgeGroup(ageGroup)) {
            const { APIError } = await import("better-auth/api");
            throw new APIError("BAD_REQUEST", { message: "Please answer the birth year question first.", code: "AGE_CHECK_NEEDED" });
          }
          // (dad, Nov 26) a throwaway email domain can't sign up (the owner's own test addresses can)
          const emailProblem = (await import("./emailConfirm")).signUpEmailProblem(data.email);
          if (emailProblem) {
            const { APIError } = await import("better-auth/api");
            throw new APIError("BAD_REQUEST", { message: emailProblem, code: "DISPOSABLE_EMAIL" });
          }
          return { data: { ...data, ageGroup, ageCheckedAt: new Date() } };
        },
        // (dad, Nov 26) the new account's free trial waits for its email (link + 6-digit code), or it gets none when this inbox
        // already had one. Never stops the sign-up itself: a problem here only means the confirm email is sent again from the app.
        after: async (user, context) => {
          if (context?.path !== "/sign-up/email") return;
          try { await (await import("./emailConfirm")).afterSignUp(user as { id: string; email: string; name?: string | null; ageGroup?: unknown }); }
          catch (error) { console.warn("[email confirm] after sign-up:", error instanceof Error ? error.message : "unknown"); }
        },
      },
      update: {
        before: async (data) => {
          if (data.image != null && !isAccountProfileImage(data.image)) return false;
          if (typeof data.name === "string" && (!data.name.trim() || data.name.length > 80)) return false;
          return { data };
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
});
