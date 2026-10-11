// SPEC-0020 Phase 6: "Report a Problem" — the rules, shared by the form (browser) and the server.
// Run the tests: node --test src/lib/account/problemReports.test.ts
// Everything here is plain logic (no database, no browser), so it can be tested on its own.

export const PROBLEM_REPORT_TEXT_MAX = 2000;
/** The picture someone picks: PNG, JPEG or WebP, at most 4 MB (it is shrunk in the browser before sending). */
export const PROBLEM_REPORT_PICK_MAX_BYTES = 4 * 1024 * 1024;
export const PROBLEM_REPORT_PICK_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** The shrunk picture: at most 1600 px on its long side, and at most ~1 MB when it is saved. */
export const PROBLEM_REPORT_SCREENSHOT_MAX_SIDE = 1600;
export const PROBLEM_REPORT_SCREENSHOT_MAX_BYTES = 1_000_000;
/** At most 5 reports per person per hour. */
export const PROBLEM_REPORT_RATE_LIMIT = 5;
export const PROBLEM_REPORT_RATE_WINDOW_MS = 60 * 60 * 1000;
export const PROBLEM_REPORT_EXCERPT_CHARS = 60;

export const PROBLEM_REPORT_SCREENS = [
  { id: "home", label: "Home" },
  { id: "editor", label: "Editor" },
  { id: "ai-animator", label: "AI Animator" },
  { id: "open-project", label: "Open Project" },
  { id: "export", label: "Export" },
  { id: "account-plans", label: "Account/Plans" },
  { id: "other", label: "Other" },
] as const;
export type ProblemReportScreen = (typeof PROBLEM_REPORT_SCREENS)[number]["id"];
export type ProblemReportStatus = "new" | "done";
export const PROBLEM_REPORT_STATUSES: readonly ProblemReportStatus[] = ["new", "done"];

export const isProblemReportScreen = (value: unknown): value is ProblemReportScreen =>
  PROBLEM_REPORT_SCREENS.some((screen) => screen.id === value);
export const isProblemReportStatus = (value: unknown): value is ProblemReportStatus => value === "new" || value === "done";
export const problemReportScreenLabel = (screen: string) =>
  PROBLEM_REPORT_SCREENS.find((option) => option.id === screen)?.label ?? "Other";
/** Report ids look like "pr_" + 32 letters/numbers. */
export const isProblemReportId = (value: unknown): value is string => typeof value === "string" && /^pr_[a-z0-9]{32}$/.test(value);

/** What the inbox shows for one report (the screenshot itself is fetched separately, only when shown). */
export type ProblemReportSummary = {
  id: string;
  createdAt: number;
  userId: string;
  userName: string;
  userEmail: string;
  screen: ProblemReportScreen;
  text: string;
  hasScreenshot: boolean;
  status: ProblemReportStatus;
  appVersion: string | null;
};

export type ProblemReportInput = { screen: ProblemReportScreen; text: string; screenshot: string | null };
export type ProblemReportCheck = { ok: true; value: ProblemReportInput } | { ok: false; message: string };

/** Keeps line breaks and tabs, removes other invisible control characters, trims the ends. */
export function cleanProblemReportText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

const SCREENSHOT_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** How many bytes a base64 text decodes to. */
const base64Bytes = (base64: string) => Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);

/** The first bytes must really be a JPEG, PNG or WebP picture (not just say so). */
function startsLikeImage(type: string, base64: string) {
  let head: string;
  try { head = atob(base64.slice(0, 16)); } catch { return false; }
  const bytes = Array.from(head, (char) => char.charCodeAt(0));
  if (type === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "png") return bytes[0] === 0x89 && head.slice(1, 4) === "PNG";
  return head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP";
}

/** A screenshot is a small picture saved as a data URL: JPEG/PNG/WebP, at most ~1 MB. */
export function checkProblemReportScreenshot(value: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: "The screenshot couldn't be read. Try a different picture, or send the report without one." };
  const match = SCREENSHOT_PATTERN.exec(value);
  if (!match || !startsLikeImage(match[1], match[2])) {
    return { ok: false, message: "The screenshot must be a PNG, JPEG or WebP picture." };
  }
  if (base64Bytes(match[2]) > PROBLEM_REPORT_SCREENSHOT_MAX_BYTES) {
    return { ok: false, message: "The screenshot is too big. Try a smaller picture." };
  }
  return { ok: true, value };
}

/** Checks what the form sent. Messages are plain words (they are shown to the person as they are). */
export function checkProblemReportInput(body: unknown): ProblemReportCheck {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "The report couldn't be read. Try again." };
  const { text, screen, screenshot } = body as Record<string, unknown>;
  if (typeof text !== "string") return { ok: false, message: "Please tell us what happened." };
  const cleaned = cleanProblemReportText(text);
  if (!cleaned) return { ok: false, message: "Please tell us what happened." };
  if (cleaned.length > PROBLEM_REPORT_TEXT_MAX) {
    return { ok: false, message: `Please keep it under ${PROBLEM_REPORT_TEXT_MAX.toLocaleString("en-US")} characters.` };
  }
  if (!isProblemReportScreen(screen)) return { ok: false, message: "Please choose where you were." };
  const picture = checkProblemReportScreenshot(screenshot);
  if (!picture.ok) return picture;
  return { ok: true, value: { screen, text: cleaned, screenshot: picture.value } };
}

export type ProblemReportRateCheck = { ok: true; left: number } | { ok: false; message: string; retryInMinutes: number };

/** At most 5 reports in any hour. `recentCreatedAt` = when this person's earlier reports were sent. */
export function checkProblemReportRateLimit(recentCreatedAt: readonly number[], now = Date.now()): ProblemReportRateCheck {
  const since = now - PROBLEM_REPORT_RATE_WINDOW_MS;
  const inWindow = recentCreatedAt.filter((time) => time > since && time <= now).sort((a, b) => a - b);
  if (inWindow.length < PROBLEM_REPORT_RATE_LIMIT) return { ok: true, left: PROBLEM_REPORT_RATE_LIMIT - inWindow.length - 1 };
  // The oldest report in this hour has to "fall out" before another one fits.
  const freeAt = inWindow[inWindow.length - PROBLEM_REPORT_RATE_LIMIT] + PROBLEM_REPORT_RATE_WINDOW_MS;
  const retryInMinutes = Math.max(1, Math.ceil((freeAt - now) / 60_000));
  return {
    ok: false,
    retryInMinutes,
    message: `You've sent ${PROBLEM_REPORT_RATE_LIMIT} reports in the last hour. Please wait ${retryInMinutes} minute${retryInMinutes === 1 ? "" : "s"} and try again.`,
  };
}

/** The first 60 characters on one line, with "…" when there is more. */
export function problemReportExcerpt(text: string, chars = PROBLEM_REPORT_EXCERPT_CHARS) {
  const oneLine = cleanProblemReportText(text.normalize("NFC")).replace(/\s+/g, " ");
  const letters = Array.from(oneLine);
  return letters.length <= chars ? oneLine : `${letters.slice(0, chars).join("").trimEnd()}…`;
}

/** The name shown for the person who sent a report (their name, else their email). */
export function problemReportReporterName(name: unknown, email: unknown) {
  const clean = (value: unknown) => typeof value === "string" ? value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  const shown = clean(name) || clean(email) || "Someone";
  const letters = Array.from(shown);
  return letters.length <= 60 ? shown : `${letters.slice(0, 59).join("")}…`;
}
