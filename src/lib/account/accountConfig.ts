// THE APP'S OWN ADDRESS (Nov 25, going online at app.diamondanimator.com).
// Online: DIAMOND_PUBLIC_ORIGIN = the one public https address, e.g. "https://app.diamondanimator.com". Accounts, sign-in links
// and every "same site only" check then trust exactly that address over https (the server's front door, Caddy, passes the
// visitor's address on). Nothing else is trusted, not even this server's own 127.0.0.1.
// Unset (this Mac): exactly as before - only 127.0.0.1 / localhost on one of the known review ports, over plain http.
const publicOriginSetting = process.env.DIAMOND_PUBLIC_ORIGIN?.trim() ?? "";
const publicOrigin = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(publicOriginSetting) ? publicOriginSetting : "";
if (publicOriginSetting && !publicOrigin) {
  throw new Error("DIAMOND_PUBLIC_ORIGIN must be one https address with no path or port, for example https://app.diamondanimator.com.");
}
/** Online (a public https address is set) or this Mac. */
export const ACCOUNT_IS_PUBLIC = Boolean(publicOrigin);

const accountPort = process.env.PORT?.trim() || "3000";

if (!ACCOUNT_IS_PUBLIC && accountPort !== "3000" && accountPort !== "58580" && accountPort !== "58584" && accountPort !== "58645" && accountPort !== "58666" && accountPort !== "58671" && accountPort !== "58672" && accountPort !== "58673" && accountPort !== "58674" && accountPort !== "58675" && accountPort !== "58676" && accountPort !== "58677" && accountPort !== "58678" && accountPort !== "58679" && accountPort !== "58680" && accountPort !== "58683" && accountPort !== "58696") {
  throw new Error("Local account access is configured only for ports 3000, 58580, 58584, 58645, 58666, 58671, 58672, 58673, 58674, 58675, 58676, 58677, 58678, 58679, 58680, 58683 and 58696.");
}

const scheme = ACCOUNT_IS_PUBLIC ? "https" : "http";
export const ACCOUNT_LOCAL_HOST = ACCOUNT_IS_PUBLIC ? new URL(publicOrigin).host : `127.0.0.1:${accountPort}`;
export const ACCOUNT_LOCAL_ORIGIN = `${scheme}://${ACCOUNT_LOCAL_HOST}`;
// The same app on this computer opens as either address (browsers often use "localhost"), so accounts
// accept both. Each request must still come from the same address it was sent to (no other site).
export const ACCOUNT_LOCAL_HOSTS = ACCOUNT_IS_PUBLIC ? [ACCOUNT_LOCAL_HOST] : [ACCOUNT_LOCAL_HOST, `localhost:${accountPort}`];
export const ACCOUNT_LOCAL_ORIGINS = ACCOUNT_LOCAL_HOSTS.map((host) => `${scheme}://${host}`);

export const isTrustedAccountRequest = (request: Request) => {
  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site") ?? "";
  return ACCOUNT_LOCAL_HOSTS.includes(host) && (!forwardedHost || forwardedHost === host) &&
    (!forwardedProto || forwardedProto === scheme) && (!origin || origin === `${scheme}://${host}`) &&
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
  /** Profile picture as a small image data URL (SPEC-0020 Phase 1), or null for the letter avatar. */
  image: string | null;
};

/** Profile pictures are resized in the browser to a small square JPEG before saving (~20–60 KB). */
export const ACCOUNT_PROFILE_IMAGE_MAX_CHARS = 200_000;
export const isAccountProfileImage = (value: unknown): value is string =>
  typeof value === "string" && value.length <= ACCOUNT_PROFILE_IMAGE_MAX_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
