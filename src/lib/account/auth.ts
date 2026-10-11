import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_LOCAL_ORIGIN, ACCOUNT_LOCAL_ORIGINS, ACCOUNT_PREVIEW_PLANS, isAccountProfileImage } from "./accountConfig";
import { deleteAllAccountDataForOwner } from "./accountDataServer";
import { sendAccountMail } from "./accountMail";
import { deleteAllAccountProjects } from "./projectServer";

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
    },
    // SPEC-0020 Phase 1: "Delete my account" (password required). Projects are marked deleted like the library's
    // Delete, and the account's saved chats, notifications, preferences and recovery copies are removed first.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await deleteAllAccountProjects(user.id);
        deleteAllAccountDataForOwner(user.id);
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
  },
});
