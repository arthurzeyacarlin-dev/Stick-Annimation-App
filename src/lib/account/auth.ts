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
// (Nov 11 security) with real mail (Resend) an account must click its email link before it can be used: a person does it in a minute, a
// script making throwaway accounts gets nothing. Locally (no key) everything works exactly as before.
const realMail = Boolean(process.env.RESEND_API_KEY?.trim());

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

export const auth = betterAuth({
  appName: "Diamond Animator",
  baseURL: ACCOUNT_LOCAL_ORIGIN,
  basePath: "/api/auth",
  secret,
  database,
  trustedOrigins: ACCOUNT_LOCAL_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: realMail,
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
  emailVerification: {
    sendOnSignUp: realMail,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendAccountMail } = await import("./accountMail");
      await sendAccountMail({
        to: user.email,
        subject: "Verify your Diamond Animator email",
        text: `Hi ${user.name || "there"},\n\nOne click and your Diamond Animator account is open:\n\n${url}\n\nIf you didn't create an account, ignore this email.`,
        link: url,
      });
    },
  },
  // (Nov 11 security) explicit limits, so nobody can guess passwords or bomb inboxes; a real person never meets them.
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 3600, max: 3 },
      "/forget-password": { window: 3600, max: 3 },
      "/send-verification-email": { window: 3600, max: 3 },
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
    },
    // SPEC-0020 Phase 1: "Delete my account" (password required). Projects are marked deleted like the library's
    // Delete, and the account's saved chats, notifications, preferences and recovery copies are removed first.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
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
        deleteAccountPlan(user.id);
      },
    },
  },
  // SPEC-0020 Phase 1: a profile picture must be a small image (resized in the browser); anything else is refused.
  databaseHooks: {
    user: {
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
    freshAge: 1, // (Nov 12 security) a session counts as "fresh" for one second only, so deleting the account always needs the password (0 would switch the check OFF)
  },
  // (Nov 12 security) online, the client's address comes from the header the edge writes (ACCOUNT_IP_HEADER=cf-connecting-ip), which a
  // client cannot fake; without the setting (this Mac) better-auth's default stays exactly as before
  ...(process.env.ACCOUNT_IP_HEADER?.trim() ? { advanced: { ipAddress: { ipAddressHeaders: [process.env.ACCOUNT_IP_HEADER.trim()] } } } : {}),
});
