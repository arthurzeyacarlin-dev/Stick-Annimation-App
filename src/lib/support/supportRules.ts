// SPEC-0027 (Nov 26, dad: beta users' problems fixed within 1 hour): the plain rules of the help bubble, tickets and the
// status page. No database and no browser here, so it can be tested on its own:
//   node --test src/lib/support/supportRules.test.ts

/** The four parts of the app the status page and the banner talk about. */
export const SUPPORT_AREAS = [
  { id: "signin", label: "Sign-in & account", name: "Sign-in" },
  { id: "animator", label: "AI Animator", name: "the AI Animator" },
  { id: "saving", label: "Saving & opening projects", name: "Saving" },
  { id: "payments", label: "Payments & credits", name: "Payments" },
] as const;
export type SupportArea = (typeof SUPPORT_AREAS)[number]["id"];
/** What a ticket is about: one of the four areas, or "other". */
export type TicketArea = SupportArea | "other";
export const TICKET_AREAS: readonly { id: TicketArea; label: string }[] = [
  ...SUPPORT_AREAS.map((area) => ({ id: area.id, label: area.label })),
  { id: "other", label: "Something else" },
];

/** Opens the help bubble's panel from anywhere (the editor's Help menu): detail = "ask" | "person" | "messages". */
export const OPEN_HELP_EVENT = "diamond:open-help";

export const isSupportArea = (value: unknown): value is SupportArea => SUPPORT_AREAS.some((area) => area.id === value);
export const isTicketArea = (value: unknown): value is TicketArea => value === "other" || isSupportArea(value);
export const ticketAreaLabel = (area: unknown) => TICKET_AREAS.find((option) => option.id === area)?.label ?? "Something else";
export const supportAreaName = (area: SupportArea) => SUPPORT_AREAS.find((option) => option.id === area)!.name;

/** A report sent from the menu's "Report a Problem" (no area picker) gets its area from "Where were you?". */
export function areaFromScreen(screen: string): TicketArea {
  if (screen === "ai-animator") return "animator";
  if (screen === "account-plans") return "payments";
  if (screen === "open-project") return "saving";
  return "other";
}

// ---- messages in a ticket -------------------------------------------------------------------------------------------
/** user = the person who sent the ticket; owner = Arthur's reply (the person sees it); note = private; draft = Claude's suggestion. */
export type TicketMessageKind = "user" | "owner" | "note" | "draft";
export const TICKET_MESSAGE_MAX = 2000;
export const isTicketMessageKind = (value: unknown): value is TicketMessageKind =>
  value === "user" || value === "owner" || value === "note" || value === "draft";

/** Keeps line breaks, removes other invisible control characters, trims. Null when empty or too long. */
export function cleanTicketMessage(value: unknown): { ok: true; text: string } | { ok: false; message: string } {
  if (typeof value !== "string") return { ok: false, message: "Please write a message." };
  const text = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!text) return { ok: false, message: "Please write a message." };
  if (text.length > TICKET_MESSAGE_MAX) return { ok: false, message: `Please keep it under ${TICKET_MESSAGE_MAX.toLocaleString("en-US")} characters.` };
  return { ok: true, text };
}

// ---- the status page ------------------------------------------------------------------------------------------------
/** What the owner (or the ticket API) sets: fixing = "We're fixing it", resolved = "Resolved", ok = back to normal. */
export type SetServiceState = "fixing" | "resolved" | "ok";
export const isSetServiceState = (value: unknown): value is SetServiceState => value === "fixing" || value === "resolved" || value === "ok";
/** What people see. suspected = "Checking reports" (3+ people reported the same area in 30 minutes). */
export type ServiceState = "ok" | "suspected" | "fixing" | "resolved";
export const SERVICE_STATE_LABEL: Record<ServiceState, string> = {
  ok: "Working", suspected: "Checking reports", fixing: "We're fixing it", resolved: "Resolved",
};
export const SERVICE_MESSAGE_MAX = 300;

export const SUSPECT_PEOPLE = 3;
export const SUSPECT_WINDOW_MS = 30 * 60 * 1000;
/** "Resolved" shows for 2 hours, then the area is back to plain "Working". */
export const RESOLVED_SHOWN_MS = 2 * 60 * 60 * 1000;
/** The urgent "possible outage" email goes out at most once per area in this time. */
export const SUSPECT_ALERT_GAP_MS = 2 * 60 * 60 * 1000;

export type StoredServiceStatus = { area: SupportArea; state: SetServiceState; message: string | null; changedAt: number };
export type RecentTicket = { area: string | null; userId: string; createdAt: number };
export type ServiceStatus = { area: SupportArea; label: string; state: ServiceState; stateLabel: string; message: string | null; since: number | null };

/**
 * The areas where at least 3 DIFFERENT people sent a ticket in the last 30 minutes. Tickets from before the owner last
 * changed that area's status are not counted (a fix that was just made is not undone by the reports that led to it).
 */
export function suspectedAreas(tickets: readonly RecentTicket[], now: number, changedAt: Partial<Record<SupportArea, number>> = {}) {
  const people = new Map<SupportArea, Set<string>>();
  for (const ticket of tickets) {
    if (!isSupportArea(ticket.area)) continue;
    if (ticket.createdAt > now || ticket.createdAt <= now - SUSPECT_WINDOW_MS) continue;
    if (ticket.createdAt <= (changedAt[ticket.area] ?? 0)) continue;
    if (ticket.userId.startsWith("system:")) continue;
    const set = people.get(ticket.area) ?? new Set<string>();
    set.add(ticket.userId);
    people.set(ticket.area, set);
  }
  return new Set([...people].filter(([, set]) => set.size >= SUSPECT_PEOPLE).map(([area]) => area));
}

/** Each area's state: fixing beats suspected, suspected beats a recent "Resolved", else Working. */
export function computeServiceStatus(stored: readonly StoredServiceStatus[], tickets: readonly RecentTicket[], now: number): ServiceStatus[] {
  const byArea = new Map(stored.map((row) => [row.area, row]));
  const changedAt = Object.fromEntries(stored.map((row) => [row.area, row.changedAt])) as Partial<Record<SupportArea, number>>;
  const suspected = suspectedAreas(tickets, now, changedAt);
  return SUPPORT_AREAS.map(({ id, label }) => {
    const row = byArea.get(id);
    let state: ServiceState = "ok";
    if (row?.state === "fixing") state = "fixing";
    else if (suspected.has(id)) state = "suspected";
    else if (row?.state === "resolved" && now - row.changedAt < RESOLVED_SHOWN_MS) state = "resolved";
    const own = row && (state === "fixing" || state === "resolved") ? row : null;
    return { area: id, label, state, stateLabel: SERVICE_STATE_LABEL[state], message: own?.message ?? null, since: own?.changedAt ?? null };
  });
}

/** The one banner line (the most important area first), or null when everything works. */
export function bannerFor(statuses: readonly ServiceStatus[]): { tone: "problem" | "resolved"; text: string; key: string } | null {
  const pick = (state: ServiceState) => statuses.filter((status) => status.state === state);
  const names = (list: readonly ServiceStatus[]) => {
    const words = list.map((status) => supportAreaName(status.area));
    return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  };
  const key = (list: readonly ServiceStatus[]) => list.map((status) => `${status.area}:${status.state}:${status.since ?? 0}`).join("|");
  const fixing = pick("fixing");
  if (fixing.length) {
    const own = fixing.length === 1 && fixing[0].message ? ` ${fixing[0].message}` : "";
    return { tone: "problem", key: key(fixing), text: `We're fixing a problem with ${names(fixing)}. Your work is safe.${own}` };
  }
  const suspected = pick("suspected");
  if (suspected.length) return { tone: "problem", key: key(suspected), text: `Some people report a problem with ${names(suspected)}. We're checking it now.` };
  const resolved = pick("resolved");
  if (resolved.length) return { tone: "resolved", key: key(resolved), text: `Resolved: ${names(resolved)} ${resolved.length === 1 ? "works" : "work"} again. Thanks for your patience.` };
  return null;
}

// ---- alerts -----------------------------------------------------------------------------------------------------------
/** The owner gets one "someone waits in the AI Animator line" email when anyone waits more than this. */
export const LINE_WAIT_ALERT_MS = 3 * 60 * 1000;
export const LINE_WAIT_ALERT_GAP_MS = 30 * 60 * 1000;

/**
 * One email per WAIT EPISODE: an episode starts when someone has waited 3+ minutes and ends only when nobody waits that
 * long any more. `inEpisode` = an email was already sent for the episode going on now.
 */
export function lineWaitStep(inEpisode: boolean, sample: { waiting: number; longestMs: number } | null | undefined) {
  const long = !!sample && sample.waiting > 0 && sample.longestMs >= LINE_WAIT_ALERT_MS;
  return { alert: long && !inEpisode, inEpisode: long };
}

/** The addresses that get alerts: the owner(s) + SUPPORT_ALERT_TO (comma separated), each once. */
export function alertRecipients(owners: readonly string[], extra = process.env.SUPPORT_ALERT_TO): string[] {
  const list = [...owners, ...(extra ?? "").split(",")].map((email) => email.trim()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const seen = new Set<string>();
  return list.filter((email) => { const key = email.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}
