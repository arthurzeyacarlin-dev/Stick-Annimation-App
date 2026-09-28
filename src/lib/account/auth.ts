import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_LOCAL_ORIGIN, ACCOUNT_PREVIEW_PLANS } from "./accountConfig";

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
  trustedOrigins: [ACCOUNT_LOCAL_ORIGIN],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      previewPlan: {
        type: ACCOUNT_PREVIEW_PLANS.map((plan) => plan.id),
        required: true,
        input: true,
        returned: true,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
});
