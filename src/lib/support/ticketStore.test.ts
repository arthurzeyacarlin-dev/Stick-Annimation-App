// SPEC-0027: the ticket conversation, unread replies, status rows and alert memory in the problem-report store.
// It makes its OWN database: run it from an empty folder (never the app folder):
//   cd "$(mktemp -d)" && node --test <path>/src/lib/support/ticketStore.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import { test } from "node:test";

// "server-only" is Next.js's own marker (not an installed package): an empty module stands in for it here.
type Resolve = (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown;
(nodeModule as unknown as { registerHooks(hooks: { resolve: Resolve }): void }).registerHooks({
  resolve: (specifier, context, next) => specifier === "server-only" ? { url: "data:text/javascript,export {}", shortCircuit: true } : next(specifier, context),
});

if (fs.existsSync(path.resolve(process.cwd(), "package.json"))) throw new Error("Run this test from an empty folder, not the app folder.");
const store = await import("../account/problemReportStore.ts");

const NOW = 1_800_000_000_000;
const send = (userId: string, at: number, area?: "animator" | "saving") => {
  const saved = store.saveProblemReport({ userId, userName: "Test Person", userEmail: `${userId}@example.com`, appVersion: null, screen: "home", text: "It broke", screenshot: null, ...(area ? { area } : {}) }, at);
  assert.equal(saved.ok, true);
  return saved.ok ? saved.report : null!;
};

test("a ticket's conversation: owner reply = unread + working; the person's answer = new again; drafts and notes stay private", () => {
  const report = send("u1", NOW, "animator");
  assert.equal(report.area, "animator");
  assert.equal(report.status, "new");
  store.addTicketMessage(report.id, "note", "Claude", "Looks like the engine.", NOW + 1);
  store.addTicketMessage(report.id, "draft", "Claude", "Hi! It is fixed now.", NOW + 2);
  assert.equal(store.readTicket(report.id)!.messages.length, 2);
  assert.equal(store.readTicket(report.id, true)!.messages.length, 0, "the person never sees notes or drafts");
  store.addTicketMessage(report.id, "owner", "Arthur", "Fixed, try again!", NOW + 3);
  const afterReply = store.readTicket(report.id)!;
  assert.equal(afterReply.status, "working");
  assert.equal(afterReply.userUnread, true);
  assert.deepEqual(afterReply.messages.map((m) => m.kind), ["note", "owner"], "sending a reply removes the draft");
  assert.equal(store.countUserUnread("u1"), 1);
  store.markUserTicketsRead("u1");
  assert.equal(store.countUserUnread("u1"), 0);
  store.addTicketMessage(report.id, "user", "Test Person", "Thanks, one more thing", NOW + 4);
  assert.equal(store.readProblemReport(report.id)!.status, "new", "an answer on a working ticket needs Arthur again");
  store.setProblemReportStatus(report.id, "done");
  store.addTicketMessage(report.id, "user", "Test Person", "Still broken", NOW + 5);
  assert.equal(store.readProblemReport(report.id)!.status, "new");
  assert.deepEqual(store.listUserTickets("u1")[0].messages.map((m) => m.kind), ["owner", "user", "user"]);
  assert.equal(store.listUserTickets("someone-else").length, 0);
  assert.equal(store.addTicketMessage("pr_nope", "user", "x", "x", NOW), null);
});

test("menu reports get their area from 'Where were you?'; recent tickets feed the outage rule; status rows and alert memory", () => {
  const menu = send("u2", NOW + 10);
  assert.equal(menu.area, "other");
  send("u3", NOW + 11, "saving");
  assert.ok(store.listRecentTickets(NOW).some((t) => t.userId === "u3" && t.area === "saving"));
  store.setServiceStatus("saving", "fixing", "Back soon", "owner", NOW + 20);
  store.setServiceStatus("saving", "resolved", null, "owner", NOW + 30);
  assert.deepEqual(store.readServiceStatus(), [{ area: "saving", state: "resolved", message: null, changedAt: NOW + 30 }]);
  assert.equal(store.claimSupportAlert("suspect:saving", 1000, NOW), true);
  assert.equal(store.claimSupportAlert("suspect:saving", 1000, NOW + 500), false);
  assert.equal(store.claimSupportAlert("suspect:saving", 1000, NOW + 1500), true);
});
