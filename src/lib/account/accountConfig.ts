const accountPort = process.env.PORT?.trim() || "3000";

if (accountPort !== "3000" && accountPort !== "58580" && accountPort !== "58584" && accountPort !== "58645" && accountPort !== "58666") {
  throw new Error("Local account access is configured only for ports 3000, 58580, 58584, 58645, and 58666.");
}

export const ACCOUNT_LOCAL_HOST = `127.0.0.1:${accountPort}`;
export const ACCOUNT_LOCAL_ORIGIN = `http://${ACCOUNT_LOCAL_HOST}`;
// The same app on this computer opens as either address (browsers often use "localhost"), so accounts
// accept both. Each request must still come from the same address it was sent to (no other site).
export const ACCOUNT_LOCAL_HOSTS = [ACCOUNT_LOCAL_HOST, `localhost:${accountPort}`];
export const ACCOUNT_LOCAL_ORIGINS = ACCOUNT_LOCAL_HOSTS.map((host) => `http://${host}`);

export const isTrustedAccountRequest = (request: Request) => {
  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site") ?? "";
  return ACCOUNT_LOCAL_HOSTS.includes(host) && (!forwardedHost || forwardedHost === host) &&
    (!forwardedProto || forwardedProto === "http") && (!origin || origin === `http://${host}`) &&
    !["cross-site", "same-site"].includes(fetchSite);
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
