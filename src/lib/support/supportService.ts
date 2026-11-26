import "server-only";

// SPEC-0027 (Nov 26): what happens around a ticket — the owner's instant alert email, Arthur's reply reaching the person
// (in the help bubble + by email), the "3 people in 30 minutes" outage alert, the status page, and the alert when someone
// waits more than 3 minutes in the AI Animator line. Emails go through the existing sender (accountMail.ts: Resend online,
// the test inbox /dev/mail on this computer). Nothing here ever throws into a request: an alert must never break a ticket.
import { sendAccountMail } from "@/src/lib/account/accountMail";
import { ACCOUNT_LOCAL_ORIGIN } from "@/src/lib/account/accountConfig";
import { OWNER_EMAILS } from "@/src/lib/account/owner";
import { problemReportExcerpt, problemReportReporterName, type ProblemReportSummary } from "@/src/lib/account/problemReports";
import {
  addTicketMessage, claimSupportAlert, listRecentTickets, readProblemReport, readServiceStatus,
} from "@/src/lib/account/problemReportStore";
import {
  alertRecipients, computeServiceStatus, LINE_WAIT_ALERT_GAP_MS, lineWaitStep, supportAreaName, SUSPECT_ALERT_GAP_MS,
  SUSPECT_WINDOW_MS, RESOLVED_SHOWN_MS, ticketAreaLabel, type ServiceStatus,
} from "./supportRules";

const appUrl = (path: string) => `${ACCOUNT_LOCAL_ORIGIN}${path}`;

/** One email to the owner(s) + SUPPORT_ALERT_TO. Never throws. */
export function alertOwners(subject: string, text: string) {
  for (const to of alertRecipients(OWNER_EMAILS)) {
    void sendAccountMail({ to, subject, text, link: appUrl("/reports") }).catch(() => console.error(`[support alert] not sent: ${subject}`));
  }
}

const who = (report: ProblemReportSummary) => problemReportReporterName(report.userName, report.userEmail);

/** A new ticket (bubble or menu): the owner hears at once; then the outage rule is checked. */
export function afterNewTicket(report: ProblemReportSummary) {
  try {
    alertOwners(
      `New ticket: ${who(report)} — ${problemReportExcerpt(report.text, 50)}`,
      `${who(report)} (${report.userEmail}) sent a ticket about: ${ticketAreaLabel(report.area)}.\n\n${report.text}\n\n`
        + `${report.hasScreenshot ? "It has a screenshot.\n\n" : ""}Answer it here: ${appUrl("/reports")}`,
    );
    checkForOutage();
  } catch (error) {
    console.error("[support] the new-ticket alert failed", error instanceof Error ? error.message : "");
  }
}

/** The person answered back in their ticket: the owner hears at once. */
export function afterUserFollowUp(report: ProblemReportSummary, text: string) {
  try {
    alertOwners(`Ticket answer: ${who(report)} — ${problemReportExcerpt(text, 50)}`,
      `${who(report)} (${report.userEmail}) answered in their ticket:\n\n${text}\n\nAnswer it here: ${appUrl("/reports")}`);
  } catch { /* the ticket is saved; the bell still shows it */ }
}

/** Arthur's reply: saved in the ticket (the person sees it in the help bubble) and emailed to them. */
export function sendOwnerReply(reportId: string, text: string, author: string) {
  const report = readProblemReport(reportId);
  if (!report) return null;
  const message = addTicketMessage(reportId, "owner", author, text);
  if (!message) return null;
  if (!report.userId.startsWith("system:")) {
    const greeting = report.userName ? `Hi ${report.userName.split(/\s+/)[0]},\n\n` : "";
    void sendAccountMail({
      to: report.userEmail,
      subject: "Diamond Animator answered your message",
      text: `${greeting}${text}\n\n— Arthur, Diamond Animator\n\nYou can answer in the app: open ${appUrl("/")} and press the help bubble in the bottom-right corner.`,
      link: appUrl("/"),
    }).catch(() => console.error("[support] the reply email was not sent"));
  }
  return message;
}

/** Each area's state for the status page and the banner. */
export function currentServiceStatus(now = Date.now()): ServiceStatus[] {
  return computeServiceStatus(readServiceStatus(), listRecentTickets(now - Math.max(SUSPECT_WINDOW_MS, RESOLVED_SHOWN_MS)), now);
}

/** 3+ people reported the same area in 30 minutes: one urgent email per area (at most every 2 hours). */
export function checkForOutage(now = Date.now()) {
  for (const status of currentServiceStatus(now)) {
    if (status.state !== "suspected" || !claimSupportAlert(`suspect:${status.area}`, SUSPECT_ALERT_GAP_MS, now)) continue;
    alertOwners(`URGENT: possible outage — ${status.label}`,
      `3 or more different people reported a problem with ${supportAreaName(status.area)} in the last 30 minutes.\n`
        + `The status page and the banner now say "Checking reports".\n\nOpen the tickets: ${appUrl("/reports")}\n`
        + `When you know: set "We're fixing it" or "Resolved" at the top of that page. Status page: ${appUrl("/status")}`);
  }
}

// ---- the AI Animator line --------------------------------------------------------------------------------------------
type LineWait = { waiting: number; longestMs: number };
const line = globalThis as typeof globalThis & { diamondLineWaitWatch?: ReturnType<typeof setInterval> };

/**
 * Every 30 seconds: does anyone wait more than 3 minutes in the AI Animator line? Then the owner gets ONE email for that
 * wait episode (a long line that stays long sends no more; the next email needs the line to clear first, and never within
 * 30 minutes, even after a restart). It only READS the line (`read`); it never changes what is made or in which order.
 */
export function startLineWaitWatch(read: () => LineWait | null | undefined) {
  if (line.diamondLineWaitWatch) clearInterval(line.diamondLineWaitWatch);
  let inEpisode = false;
  line.diamondLineWaitWatch = setInterval(() => {
    try {
      const now = read();
      const step = lineWaitStep(inEpisode, now);
      inEpisode = step.inEpisode;
      if (!step.alert || !now) return;
      if (!claimSupportAlert("line-wait", LINE_WAIT_ALERT_GAP_MS)) return;
      const minutes = Math.round(now.longestMs / 60_000);
      alertOwners(`AI Animator line: someone has waited ${minutes} min`,
        `${now.waiting} animation${now.waiting === 1 ? " is" : "s are"} waiting in the AI Animator line; the longest has waited ${minutes} minutes.\n`
          + "The server makes DIAMOND_ANIMATIONS_AT_ONCE animations at the same time; more people at once than that wait.\n"
          + "If this happens often, a bigger server (and a higher DIAMOND_ANIMATIONS_AT_ONCE) makes the line shorter.");
    } catch { /* the line is never touched by this check */ }
  }, 30_000);
  line.diamondLineWaitWatch.unref?.();
}
