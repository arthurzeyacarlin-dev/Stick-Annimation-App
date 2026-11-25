import test from "node:test";
import assert from "node:assert/strict";
import { falBalanceAlert, falKeyFrom, readFalBalance, resetFalWatch, watchFalBalance } from "./falBalanceWatch.ts";

const answer = (status: number, body: unknown) => (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;

test("the engine's key line is read, quoted or not, and nothing else", () => {
  assert.equal(falKeyFrom('OTHER=1\nFAL_KEY="abc:def"\nX=2'), "abc:def");
  assert.equal(falKeyFrom("FAL_KEY=abc\n"), "abc");
  assert.equal(falKeyFrom("NOT_FAL_KEY=abc\nFAL_KEY=\n"), null);
  assert.equal(falKeyFrom(""), null);
  assert.equal(falKeyFrom("FAL_KEY=engine\nFAL_ADMIN_KEY=admin\n"), "admin");   // the key that may read the money wins
  assert.equal(falKeyFrom("FAL_ADMIN_KEY=\nFAL_KEY=engine\n"), "engine");
});

test("fal's balance is read as dollars; anything unclear is 'unknown', never a guessed number", async () => {
  assert.deepEqual(await readFalBalance("k", answer(200, { credits: { current_balance: 12.5, currency: "USD" } })), { usd: 12.5 });
  assert.ok("unknown" in await readFalBalance("k", answer(403, {})));
  assert.ok("unknown" in await readFalBalance("k", answer(200, { username: "x" })));
  assert.ok("unknown" in await readFalBalance("k", answer(200, { credits: { current_balance: 5, currency: "EUR" } })));
  assert.ok("unknown" in await readFalBalance("k", (async () => { throw new Error("offline"); }) as unknown as typeof fetch));
});

test("the key goes to fal's billing address only, in the Authorization header", async () => {
  let seen: { url: string; auth: string } | null = null;
  const spy = (async (url: string, init: { headers: Record<string, string> }) => { seen = { url, auth: init.headers.Authorization }; return { ok: true, status: 200, json: async () => ({ credits: { current_balance: 1, currency: "USD" } }) }; }) as unknown as typeof fetch;
  await readFalBalance("secret-key", spy);
  assert.deepEqual(seen, { url: "https://api.fal.ai/v1/account/billing?expand=credits", auth: "Key secret-key" });
});

test("plenty left says nothing; low and almost empty tell the owner how many short animations are left", () => {
  assert.equal(falBalanceAlert(10), null);
  assert.equal(falBalanceAlert(250), null);
  const low = falBalanceAlert(6.7)!;
  assert.equal(low.key, "ai-animator-fal-low");
  assert.match(low.text, /\$6\.70 left, about 10 short animations/);
  const empty = falBalanceAlert(0.7)!;
  assert.equal(empty.key, "ai-animator-fal-almost-empty");
  assert.match(empty.text, /\$0\.70 left, about 1 short animation\./);
  assert.match(falBalanceAlert(0)!.text, /about 0 short animations/);
  for (const say of [low, empty]) assert.doesNotMatch(say.text, /undefined|NaN/);
});

test("the watch looks once per 10 minutes, tells the owner when low, and never throws", async () => {
  resetFalWatch();
  const told: string[] = []; let calls = 0;
  const fetcher = (async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ credits: { current_balance: 4, currency: "USD" } }) }; }) as unknown as typeof fetch;
  const options = { root: "/engine", fetcher, alert: (key: string) => { told.push(key); }, readSettings: () => "FAL_KEY=k\n" };
  assert.deepEqual(await watchFalBalance({ ...options, now: 1_000_000 }), { usd: 4 });
  assert.equal(await watchFalBalance({ ...options, now: 1_000_000 + 60_000 }), null);            // one minute later: not asked again
  assert.deepEqual(await watchFalBalance({ ...options, now: 1_000_000 + 11 * 60_000 }), { usd: 4 });
  assert.equal(calls, 2);
  assert.deepEqual(told, ["ai-animator-fal-low", "ai-animator-fal-low"]);                          // (the inbox itself keeps it to once a day)
  resetFalWatch();
  assert.equal(await watchFalBalance({ root: "/engine", now: 2_000_000, readSettings: () => { throw new Error("no file"); } }), null);
  resetFalWatch();
  assert.equal(await watchFalBalance({ root: "/engine", now: 2_000_000, readSettings: () => "NOTHING=1" }), null);
  resetFalWatch();
  const broken = await watchFalBalance({ ...options, now: 3_000_000, fetcher: (async () => { throw new Error("x"); }) as unknown as typeof fetch });
  assert.ok(broken && "unknown" in broken);
  resetFalWatch();
});

test("a locked (empty) account is known as zero and the owner is told; a key without billing rights is only 'unknown'", async () => {
  resetFalWatch();
  const told: string[] = [];
  const locked = await watchFalBalance({ root: "/engine", now: 4_000_000, readSettings: () => "FAL_KEY=k", alert: (key) => { told.push(key); },
    fetcher: answer(403, { detail: "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing." }) });
  assert.deepEqual(locked, { usd: 0 });
  assert.deepEqual(told, ["ai-animator-fal-balance"]);
  resetFalWatch();
  const noRights = await watchFalBalance({ root: "/engine", now: 5_000_000, readSettings: () => "FAL_KEY=k", alert: (key) => { told.push(key); }, fetcher: answer(403, { detail: "Forbidden" }) });
  assert.deepEqual(noRights, { unknown: "fal answered 403: Forbidden" });
  assert.equal(told.length, 1);
  resetFalWatch();
});
