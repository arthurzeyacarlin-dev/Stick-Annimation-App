import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57120/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const outputRoot = "output/spec-0008/phase-1/live-terra";
mkdirSync(outputRoot, { recursive: true });
const prompts = [
  "hello",
  "Hi, this is a test. Can you respond back?",
  "You're Terra, right?",
  "Brainstorm two playful ideas for a tiny alien who loses its map.",
  "Please create a short animation of a stick figure waving at a UFO.",
  "Edit the current animation so the wave is slower.",
];
const results: Array<{ prompt: string; reply: string; intent: string; model: string; inputTokens: number | null; outputTokens: number | null; costUsd: number | null }> = [];
const terminalSnapshots = new Map<string, Record<string, unknown>>();
const errors: string[] = [];
let postCount = 0;

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem("da_welcome_seen", "1"));
const page = await context.newPage();
page.setDefaultTimeout(100_000);
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
page.on("request", request => {
  if (new URL(request.url()).pathname === "/api/ai-animator" && request.method() === "POST") postCount += 1;
});
page.on("response", response => {
  const responseUrl = new URL(response.url());
  if (responseUrl.pathname !== "/api/ai-animator" || response.request().method() !== "GET" || !response.ok()) return;
  void response.json().then((body: Record<string, unknown>) => {
    if (body.status === "done" && typeof body.jobId === "string") terminalSnapshots.set(body.jobId, body);
  }).catch(() => undefined);
});

await page.goto(url);
await page.getByRole("button", { name: /^New Project/ }).click();
await page.getByLabel("Message AI Animator").waitFor();
for (const prompt of prompts) {
  await page.getByLabel("Message AI Animator").fill(prompt);
  await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
  const status = page.getByRole("status", { name: "AI Animator request status" });
  await status.waitFor();
  assert.equal((await status.textContent())?.trim(), "Thinking", `${prompt}: Thinking is visible while live Terra is active`);
  await status.waitFor({ state: "detached" });
  const assistantMessages = page.locator(".ai-animator-message").filter({ hasText: /./ });
  const reply = (await assistantMessages.last().textContent())?.trim() ?? "";
  assert.ok(reply.length > 0, `${prompt}: live Terra returned a visible reply`);
  assert.ok(!reply.includes("AI Animator could not complete this request"), `${prompt}: rejected generic failure is absent`);
  for (let attempt = 0; attempt < 50 && terminalSnapshots.size <= results.length; attempt += 1) {
    await page.waitForTimeout(20);
  }
  assert.equal(terminalSnapshots.size, results.length + 1, `${prompt}: one terminal provider snapshot was captured`);
  const latest = [...terminalSnapshots.values()].at(-1) as { events?: Array<{ reply?: { intent?: string }; provider?: { providerModel?: string; usage?: { inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number } } }> } | undefined;
  const finalEvent = latest?.events?.at(-1);
  assert.equal(finalEvent?.provider?.providerModel, "gpt-5.6-terra", `${prompt}: provider identity is exact Terra`);
  results.push({
    prompt,
    reply,
    intent: finalEvent?.reply?.intent ?? "unknown",
    model: finalEvent?.provider?.providerModel ?? "unknown",
    inputTokens: finalEvent?.provider?.usage?.inputTokens ?? null,
    outputTokens: finalEvent?.provider?.usage?.outputTokens ?? null,
    costUsd: finalEvent?.provider?.usage?.estimatedCostUsd ?? null,
  });
}

assert.equal(postCount, 6, "exactly six live Terra requests were made");
assert.equal(results[0]?.intent, "conversation", "hello is natural conversation");
assert.equal(results[1]?.intent, "conversation", "test message is natural conversation");
assert.equal(results[2]?.intent, "conversation", "Terra identity follow-up remains conversation");
assert.equal(results[3]?.intent, "conversation", "brainstorm remains non-mutating conversation");
assert.equal(results[4]?.intent, "create-animation", "explicit creation is semantically classified");
assert.equal(results[5]?.intent, "edit-animation", "explicit edit is semantically classified");
assert.match(results[4]?.reply ?? "", /No animation was changed/i, "live create response is truthful");
assert.match(results[5]?.reply ?? "", /No animation was changed/i, "live edit response is truthful");
const aggregateCostUsd = results.reduce((sum, result) => sum + (result.costUsd ?? 0), 0);
assert.ok(aggregateCostUsd <= 0.5, "live Terra aggregate cost stays within the $0.50 ceiling");
assert.deepEqual(errors, [], "live browser has no page/console errors");
await page.screenshot({ path: `${outputRoot}/live-terra-final.png`, fullPage: true });
await browser.close();

const redacted = {
  status: "PASS",
  requestCount: postCount,
  ceilingUsd: 0.5,
  aggregateCostUsd,
  officialPricingCheckedAt: "2026-09-19",
  pricing: { inputPerMillionUsd: 2, outputPerMillionUsd: 12 },
  tools: [],
  search: false,
  payload: "short text turn, bounded recent conversation, project identity/generation, minimal workspace metadata",
  results: results.map(({ prompt, reply, ...result }, index) => ({
    requestIndex: index + 1,
    promptDigest: createHash("sha256").update(prompt).digest("hex"),
    replyDigest: createHash("sha256").update(reply).digest("hex"),
    replyLength: reply.length,
    ...result,
  })),
  errors,
};
writeFileSync(`${outputRoot}/live-terra-result.json`, `${JSON.stringify(redacted, null, 2)}\n`);
console.log(JSON.stringify({ status: redacted.status, requestCount: postCount, aggregateCostUsd, models: results.map(result => result.model), intents: results.map(result => result.intent) }));
