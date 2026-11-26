// SPEC-0027: help bubble / tickets / status page rules. Run: node --test src/lib/support/supportRules.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertRecipients, areaFromScreen, lineWaitStep, LINE_WAIT_ALERT_MS, bannerFor, cleanTicketMessage, computeServiceStatus, RESOLVED_SHOWN_MS, suspectedAreas,
  SUSPECT_WINDOW_MS, TICKET_MESSAGE_MAX, type RecentTicket,
} from "./supportRules.ts";
import { checkSupportApiKey, supportApiKey } from "./supportApiKey.ts";

const NOW = 1_800_000_000_000;
const ticket = (userId: string, minutesAgo: number, area = "animator"): RecentTicket => ({ userId, area, createdAt: NOW - minutesAgo * 60_000 });

test("3 different people about the same area in 30 minutes = suspected; 3 tickets from 1 person is not", () => {
  assert.deepEqual([...suspectedAreas([ticket("a", 1), ticket("b", 5), ticket("c", 29)], NOW)], ["animator"]);
  assert.equal(suspectedAreas([ticket("a", 1), ticket("a", 2), ticket("a", 3)], NOW).size, 0);
  assert.equal(suspectedAreas([ticket("a", 1), ticket("b", 2), ticket("c", 31)], NOW).size, 0, "the third is older than 30 minutes");
  assert.equal(suspectedAreas([ticket("a", 1), ticket("b", 2), ticket("c", 3, "saving")], NOW).size, 0, "different areas");
  assert.equal(suspectedAreas([ticket("a", 1, "other"), ticket("b", 2, "other"), ticket("c", 3, "other")], NOW).size, 0, "'other' is no area");
  assert.equal(suspectedAreas([ticket("system:payments", 1), ticket("b", 2), ticket("c", 3)], NOW).size, 0, "app alerts are not people");
});

test("tickets from before the owner changed the status do not count again", () => {
  const tickets = [ticket("a", 20), ticket("b", 15), ticket("c", 10)];
  assert.equal(suspectedAreas(tickets, NOW, { animator: NOW - 12 * 60_000 }).size, 0);
  assert.equal(suspectedAreas(tickets, NOW, { animator: NOW - 25 * 60_000 }).size, 1);
});

test("status: fixing beats suspected, suspected beats a recent Resolved, Resolved fades after 2 hours", () => {
  const people = [ticket("a", 1), ticket("b", 2), ticket("c", 3)];
  const fixing = computeServiceStatus([{ area: "animator", state: "fixing", message: "Back in 10 minutes.", changedAt: NOW - 3_600_000 }], people, NOW);
  assert.equal(fixing.find((s) => s.area === "animator")!.state, "fixing");
  assert.equal(fixing.find((s) => s.area === "animator")!.message, "Back in 10 minutes.");
  assert.equal(fixing.find((s) => s.area === "saving")!.state, "ok");
  const resolvedThenReports = computeServiceStatus([{ area: "animator", state: "resolved", message: null, changedAt: NOW - 10 * 60_000 }], people, NOW);
  assert.equal(resolvedThenReports.find((s) => s.area === "animator")!.state, "suspected");
  const resolved = computeServiceStatus([{ area: "animator", state: "resolved", message: null, changedAt: NOW - 60_000 }], [], NOW);
  assert.equal(resolved.find((s) => s.area === "animator")!.state, "resolved");
  const old = computeServiceStatus([{ area: "animator", state: "resolved", message: null, changedAt: NOW - RESOLVED_SHOWN_MS - 1 }], [], NOW);
  assert.equal(old.find((s) => s.area === "animator")!.state, "ok");
  assert.equal(computeServiceStatus([], [], NOW).length, 4);
  assert.ok(SUSPECT_WINDOW_MS === 30 * 60_000);
});

test("the banner says the most important thing in plain words", () => {
  assert.equal(bannerFor(computeServiceStatus([], [], NOW)), null);
  const fixing = bannerFor(computeServiceStatus([{ area: "animator", state: "fixing", message: null, changedAt: NOW }], [], NOW));
  assert.equal(fixing?.text, "We're fixing a problem with the AI Animator. Your work is safe.");
  assert.equal(fixing?.tone, "problem");
  const two = bannerFor(computeServiceStatus([
    { area: "saving", state: "fixing", message: null, changedAt: NOW }, { area: "payments", state: "fixing", message: null, changedAt: NOW },
  ], [], NOW));
  assert.equal(two?.text, "We're fixing a problem with Saving and Payments. Your work is safe.");
  const checking = bannerFor(computeServiceStatus([], [ticket("a", 1, "signin"), ticket("b", 1, "signin"), ticket("c", 1, "signin")], NOW));
  assert.equal(checking?.text, "Some people report a problem with Sign-in. We're checking it now.");
  const resolved = bannerFor(computeServiceStatus([{ area: "animator", state: "resolved", message: null, changedAt: NOW }], [], NOW));
  assert.equal(resolved?.tone, "resolved");
  assert.equal(resolved?.text, "Resolved: the AI Animator works again. Thanks for your patience.");
  assert.notEqual(fixing?.key, resolved?.key, "a closed banner comes back when the state changes");
});

test("the ticket API key: missing, short, wrong or badly written = refused", () => {
  const key = "k".repeat(40);
  assert.equal(supportApiKey(undefined), null);
  assert.equal(supportApiKey("short"), null);
  assert.equal(supportApiKey(` ${key} `), key);
  assert.equal(checkSupportApiKey(`Bearer ${key}`, key), true);
  assert.equal(checkSupportApiKey(`bearer ${key}`, key), false);
  assert.equal(checkSupportApiKey(`Bearer ${key}x`, key), false);
  assert.equal(checkSupportApiKey(key, key), false);
  assert.equal(checkSupportApiKey(null, key), false);
  assert.equal(checkSupportApiKey(`Bearer ${key}`, null), false, "no key on the server = the API is off");
});

test("messages are cleaned and limited; areas come from 'Where were you?' for menu reports", () => {
  assert.deepEqual(cleanTicketMessage("  Thanks!\r\nIt works\u0007 "), { ok: true, text: "Thanks!\nIt works" });
  assert.equal(cleanTicketMessage("   ").ok, false);
  assert.equal(cleanTicketMessage(5).ok, false);
  assert.equal(cleanTicketMessage("a".repeat(TICKET_MESSAGE_MAX + 1)).ok, false);
  assert.equal(areaFromScreen("ai-animator"), "animator");
  assert.equal(areaFromScreen("account-plans"), "payments");
  assert.equal(areaFromScreen("editor"), "other");
});

test("alert addresses: the owner + SUPPORT_ALERT_TO, each once, bad ones dropped", () => {
  assert.deepEqual(alertRecipients(["owner@example.com"], undefined), ["owner@example.com"]);
  assert.deepEqual(alertRecipients(["owner@example.com"], " dad@example.com, OWNER@example.com, nope ,"), ["owner@example.com", "dad@example.com"]);
});

test("the AI Animator line alert: one email per wait episode, never a storm while the line stays long", () => {
  const long = { waiting: 3, longestMs: LINE_WAIT_ALERT_MS + 1 };
  const short = { waiting: 1, longestMs: 60_000 };
  const empty = { waiting: 0, longestMs: 0 };
  let inEpisode = false;
  const run = (samples: (typeof long)[]) => samples.map((sample) => { const step = lineWaitStep(inEpisode, sample); inEpisode = step.inEpisode; return step.alert; });
  // 2 hours of a long line, checked every 30 s = 240 checks: exactly ONE email
  assert.equal(run(Array.from({ length: 240 }, () => long)).filter(Boolean).length, 1);
  // the line clears, then gets long again: a second episode = one more email
  assert.deepEqual(run([short, empty, long, long, long]), [false, false, true, false, false]);
  assert.equal(lineWaitStep(false, null).alert, false);
  assert.equal(lineWaitStep(false, { waiting: 0, longestMs: LINE_WAIT_ALERT_MS * 9 }).alert, false, "nobody waiting = no email");
});
