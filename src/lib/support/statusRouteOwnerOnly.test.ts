// (Nov 26, dad: "security measures in place") the public status page can only be set by the signed-in owner, never by the
// ticket API key the Claude routine uses: a tricked routine must not be able to show a false outage to everyone.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const route = fs.readFileSync(path.join(import.meta.dirname, "../../../app/api/support/status/route.ts"), "utf8");
const ticketRoutes = ["tickets/route.ts", "tickets/[reportId]/route.ts", "tickets/[reportId]/screenshot/route.ts"]
  .map((file) => fs.readFileSync(path.join(import.meta.dirname, "../../../app/api/support", file), "utf8"));

test("the status route never accepts the ticket API key", () => {
  assert.equal(route.includes("hasSupportApiKey"), false);
  assert.equal(route.includes("checkSupportApiKey"), false);
  assert.match(route, /isOwnerEmail\(session\.user\.email\)/);
});

test("the ticket API key still opens the ticket routes (read, note, draft, ticket status) and nothing that sends", () => {
  for (const source of ticketRoutes) assert.match(source, /hasSupportApiKey\(request\)/);
  const one = ticketRoutes[1];
  assert.match(one, /action must be note, draft or status/);
  assert.equal(/action === "reply"/.test(one), false);
});
