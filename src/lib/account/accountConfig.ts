// Where accounts are allowed to work. Two modes, picked by environment variables:
// - Local (no BETTER_AUTH_URL): exactly today's rules — http://127.0.0.1:<port> or http://localhost:<port>
//   on one of the approved review ports, nothing else.
// - Online (BETTER_AUTH_URL set, e.g. https://app.diamondanimator.com): only the configured https
//   addresses (BETTER_AUTH_URL plus the comma list APP_ORIGINS). When it is not running on Vercel,
//   the local review addresses keep working too, so the live settings can be tried on this computer.
// In both modes every request must come from the same address it was sent to (no other site).
// This file is also imported by browser components (for the plan list), so it must stay free of
// Node-only code; the server-only variables simply read as unset in the browser.

const LOCAL_ACCOUNT_PORTS = ["3000", "58580", "58584", "58645", "58666"] as const;

export type AccountSiteEnv = {
  PORT?: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGINS?: string;
  VERCEL?: string;
};

export type AccountSiteConfig = {
  online: boolean;
  baseURL: string;
  trustedOrigins: string[];
  /** Hosts trusted over plain http on this computer (host:port). */
  localHosts: string[];
  /** Hosts trusted over https behind the hosting proxy (x-forwarded-proto https). */
  onlineHosts: string[];
};

const toHttpsOrigin = (value: string, name: string) => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be a full https:// address.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be a plain https:// address with no path (got an invalid value).`);
  }
  return url.origin;
};

const localHostsFor = (port: string) => [`127.0.0.1:${port}`, `localhost:${port}`];

export const resolveAccountSiteConfig = (env: AccountSiteEnv): AccountSiteConfig => {
  const port = env.PORT?.trim() || "3000";
  const authUrl = env.BETTER_AUTH_URL?.trim();
  const appOrigins = (env.APP_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const onVercel = Boolean(env.VERCEL?.trim());

  if (!authUrl) {
    if (onVercel) throw new Error("BETTER_AUTH_URL must be set when the app runs online.");
    if (appOrigins.length) throw new Error("APP_ORIGINS needs BETTER_AUTH_URL to be set too.");
    if (!(LOCAL_ACCOUNT_PORTS as readonly string[]).includes(port)) {
      throw new Error("Local account access is configured only for ports 3000, 58580, 58584, 58645, and 58666.");
    }
    const localHosts = localHostsFor(port);
    return {
      online: false,
      baseURL: `http://${localHosts[0]}`,
      trustedOrigins: localHosts.map((host) => `http://${host}`),
      localHosts,
      onlineHosts: [],
    };
  }

  const baseURL = toHttpsOrigin(authUrl, "BETTER_AUTH_URL");
  const onlineOrigins = [...new Set([baseURL, ...appOrigins.map((origin) => toHttpsOrigin(origin, "APP_ORIGINS"))])];
  const localHosts = !onVercel && (LOCAL_ACCOUNT_PORTS as readonly string[]).includes(port) ? localHostsFor(port) : [];
  return {
    online: true,
    baseURL,
    trustedOrigins: [...onlineOrigins, ...localHosts.map((host) => `http://${host}`)],
    localHosts,
    onlineHosts: onlineOrigins.map((origin) => new URL(origin).host),
  };
};

// Each variable is read by name (not by passing process.env around) so browser bundles stay safe.
export const ACCOUNT_SITE = resolveAccountSiteConfig({
  PORT: process.env.PORT,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  APP_ORIGINS: process.env.APP_ORIGINS,
  VERCEL: process.env.VERCEL,
});
export const ACCOUNT_IS_ONLINE = ACCOUNT_SITE.online;
export const ACCOUNT_BASE_URL = ACCOUNT_SITE.baseURL;
export const ACCOUNT_TRUSTED_ORIGINS = ACCOUNT_SITE.trustedOrigins;

// Local review addresses (kept for the local proof scripts; online on Vercel they are not trusted).
const accountPort = process.env.PORT?.trim() || "3000";
export const ACCOUNT_LOCAL_HOST = `127.0.0.1:${accountPort}`;
export const ACCOUNT_LOCAL_ORIGIN = `http://${ACCOUNT_LOCAL_HOST}`;
// The same app on this computer opens as either address (browsers often use "localhost"), so accounts
// accept both. Each request must still come from the same address it was sent to (no other site).
export const ACCOUNT_LOCAL_HOSTS = localHostsFor(accountPort);
export const ACCOUNT_LOCAL_ORIGINS = ACCOUNT_LOCAL_HOSTS.map((host) => `http://${host}`);

/** The one shared "is this request really from our own app page?" check for every account/AI route. */
export const isTrustedAccountRequest = (request: Request, site: AccountSiteConfig = ACCOUNT_SITE) => {
  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site") ?? "";
  if (["cross-site", "same-site"].includes(fetchSite)) return false;
  if (forwardedHost && forwardedHost !== host) return false;
  if (site.localHosts.includes(host)) {
    return (!forwardedProto || forwardedProto === "http") && (!origin || origin === `http://${host}`);
  }
  if (site.onlineHosts.includes(host)) {
    return forwardedProto === "https" && (!origin || origin === `https://${host}`);
  }
  return false;
};

export const ACCOUNT_PREVIEW_PLANS = [
  { id: "starter_preview", label: "Starter Preview" },
  { id: "creator_preview", label: "Creator Preview" },
  { id: "studio_preview", label: "Studio Preview" },
] as const;

export type AccountPreviewPlan = (typeof ACCOUNT_PREVIEW_PLANS)[number]["id"];

export const isAccountPreviewPlan = (value: unknown): value is AccountPreviewPlan =>
  ACCOUNT_PREVIEW_PLANS.some((plan) => plan.id === value);

export type AccountPublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  previewPlan: AccountPreviewPlan;
};
