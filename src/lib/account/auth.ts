import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import fs from "node:fs";
import path from "node:path";
import { postgresPool, postgresConfigured } from "../server/postgres";
import { ACCOUNT_BASE_URL, ACCOUNT_IS_ONLINE, ACCOUNT_PREVIEW_PLANS, ACCOUNT_TRUSTED_ORIGINS } from "./accountConfig";

// Local (no env vars): today's .local secret file + SQLite database, unchanged.
// Online: BETTER_AUTH_SECRET + Postgres on DATABASE_URL (tables from
// supabase/migrations/20261008_online_auth_tables.sql). Nothing under .local is touched online.
const LOCAL_ROOT = path.resolve(process.cwd(), ".local/spec0015-phase3");
const SECRET_PATH = path.join(LOCAL_ROOT, "auth-secret");

if (process.env.VERCEL?.trim() && (!postgresConfigured() || !process.env.BETTER_AUTH_SECRET?.trim())) {
  throw new Error("Online accounts need DATABASE_URL and BETTER_AUTH_SECRET.");
}

const readSecret = () => {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
    return fromEnv;
  }
  const secret = fs.readFileSync(SECRET_PATH, "utf8").trim();
  if (secret.length < 32) throw new Error("The local account secret is missing or invalid.");
  return secret;
};

type AccountDatabaseGlobal = typeof globalThis & {
  diamondAccountDatabase?: { path: string; database: Database.Database };
};

const openLocalDatabase = () => {
  const databaseName = process.env.SPEC0015_ACCOUNT_DB_NAME?.trim() || "auth.sqlite";
  if (!/^[a-z0-9-]+\.sqlite$/.test(databaseName)) {
    throw new Error("SPEC0015_ACCOUNT_DB_NAME must be a simple .sqlite filename.");
  }
  const databasePath = path.join(LOCAL_ROOT, databaseName);
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
  return database;
};

const secret = readSecret();
// The shared pool is a real pg.Pool; better-auth detects it by its connect() method and uses Postgres.
const database = postgresConfigured() ? (postgresPool() as unknown as import("pg").Pool) : openLocalDatabase();

export const auth = betterAuth({
  appName: "Diamond Animator",
  baseURL: ACCOUNT_BASE_URL,
  basePath: "/api/auth",
  secret,
  database,
  trustedOrigins: ACCOUNT_TRUSTED_ORIGINS,
  advanced: {
    // Online the session cookie is Secure (https only, "__Secure-" name); locally it stays as today.
    useSecureCookies: ACCOUNT_IS_ONLINE,
  },
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
