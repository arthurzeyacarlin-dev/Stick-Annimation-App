const accountPort = process.env.PORT?.trim() || "3000";

if (accountPort !== "3000" && accountPort !== "58580" && accountPort !== "58584") {
  throw new Error("Local account access is configured only for ports 3000, 58580, and 58584.");
}

export const ACCOUNT_LOCAL_HOST = `127.0.0.1:${accountPort}`;
export const ACCOUNT_LOCAL_ORIGIN = `http://${ACCOUNT_LOCAL_HOST}`;

export const isTrustedAccountRequest = (request: Request) => {
  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site") ?? "";
  return host === ACCOUNT_LOCAL_HOST && (!forwardedHost || forwardedHost === host) &&
    (!forwardedProto || forwardedProto === "http") && (!origin || origin === ACCOUNT_LOCAL_ORIGIN) &&
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
