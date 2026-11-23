// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/accountMail.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

// The test inbox lives under the folder the server runs in, so the tests run in a throwaway folder.
const home = process.cwd();
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "diamond-mail-test-"));
process.chdir(folder);
const { readAccountMailOutbox, realMailSender, sendAccountMail } = await import("./accountMail.ts");
after(() => { process.chdir(home); fs.rmSync(folder, { recursive: true, force: true }); });

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const fakeFetch = (calls: Call[], ok = true) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return { ok, status: ok ? 200 : 500 } as Response;
  }) as typeof fetch;
const mail = (n: number) => ({ to: `kid${n}@gmail.com`, subject: `Reset ${n}`, text: `Open the link ${n}`, link: `http://localhost/reset-password?token=t${n}` });
const outboxFile = path.join(folder, ".local/dev-mail/outbox.ndjson");

beforeEach(() => { delete process.env.RESEND_API_KEY; delete process.env.ACCOUNT_MAIL_FROM; });

test("without the key nothing changes: the email lands in the test inbox and nothing goes over the internet", async () => {
  const calls: Call[] = [];
  await sendAccountMail(mail(1), fakeFetch(calls));
  // only one of the two settings is not enough
  process.env.RESEND_API_KEY = "test-key";
  await sendAccountMail(mail(2), fakeFetch(calls));
  delete process.env.RESEND_API_KEY;
  process.env.ACCOUNT_MAIL_FROM = "Diamond Animator <support@diamondanimator.com>";
  await sendAccountMail(mail(3), fakeFetch(calls));
  assert.equal(realMailSender(), null);
  assert.equal(calls.length, 0);
  const inbox = readAccountMailOutbox();
  assert.deepEqual(inbox.map((item) => item.subject), ["Reset 3", "Reset 2", "Reset 1"]);
  const { at, ...first } = inbox[2];
  assert.deepEqual(first, mail(1));
  assert.ok(!Number.isNaN(Date.parse(at)));
});

test("with the key and the from-address the email goes to the real sender, not the test inbox", async () => {
  const before = fs.readFileSync(outboxFile, "utf8");
  process.env.RESEND_API_KEY = "test-key";
  process.env.ACCOUNT_MAIL_FROM = "Diamond Animator <support@diamondanimator.com>";
  const calls: Call[] = [];
  await sendAccountMail(mail(4), fakeFetch(calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  assert.deepEqual(calls[0].body, { from: "Diamond Animator <support@diamondanimator.com>", to: ["kid4@gmail.com"], subject: "Reset 4", text: "Open the link 4" });
  assert.equal(fs.readFileSync(outboxFile, "utf8"), before);
});

test("a problem at the real sender never throws", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ACCOUNT_MAIL_FROM = "support@diamondanimator.com";
  await sendAccountMail(mail(5), fakeFetch([], false));
  await sendAccountMail(mail(6), (async () => { throw new Error("offline"); }) as typeof fetch);
});
