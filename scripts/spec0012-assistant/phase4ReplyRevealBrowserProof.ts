import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ASSISTANT_MODEL, type AssistantRequest, type ProviderResult, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { DiamondAssistantJobService, type AssistantProviderOptions } from "../../src/lib/assistant/assistantJobService.ts";

const origin = process.env.SPEC0012_REVEAL_ORIGIN ?? "http://127.0.0.1:58060";
const iterations = Number(process.env.SPEC0012_REVEAL_ITERATIONS ?? 8);
const output = resolve("output/spec-0012/phase-4-reply-reveal/browser");
mkdirSync(output, { recursive: true });

const localAnswer = "Start in Home and choose New Project. Draw on the canvas, then add frames in the timeline to build the motion.\n\nSave before Export so the movie uses the latest saved animation.";
const searchAnswer = "Current YouTube guidance recommends a vertical 9:16 video for Shorts. Check the linked official source for the current publishing details.\n\nIn Diamond Animator, save first, open Export, choose YouTube Shorts, select 1080p, and export the local MP4.";
const sourceUrl = "https://support.google.com/youtube/answer/15424877";
const sourceTitle = "YouTube Shorts guidance";
const assertions: string[] = [];
const errors: string[] = [];
const forbidden: string[] = [];
const captures: Array<Record<string, unknown>> = [];
let providerCalls = 0;

const check = (value: unknown, label: string) => { assert.ok(value, label); assertions.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions.push(label); };
const wait = (ms: number) => new Promise(resolveWait => setTimeout(resolveWait, ms));
const localResult = (request: AssistantRequest): ProviderResult => ({
  reply: { answer: localAnswer, title: "Getting started" },
  usage: { inputTokens: 200, outputTokens: 150, totalTokens: 350, estimatedCostUsd: .0022, priceDate: "2026-09-22", responseId: `local_${request.jobId}`, latencyMs: 30, model: ASSISTANT_MODEL, reasoning: request.reasoningLevel, toolCalls: 0 },
});
const searchResult = (request: AssistantRequest): ProviderResult => ({
  reply: { answer: searchAnswer, title: "YouTube Shorts export", citations: [{ index: 1, title: sourceTitle, url: sourceUrl, startIndex: 0, endIndex: searchAnswer.indexOf(". Check") + 1 }] },
  usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750, estimatedCostUsd: .014, priceDate: "2026-09-23", responseId: `search_${request.jobId}`, latencyMs: 60, model: ASSISTANT_MODEL, reasoning: request.reasoningLevel, toolCalls: 1 },
  search: { topic: "current YouTube Shorts guidance", toolCalls: 1, processedSourceCount: 1, actions: [{ type: "search", queries: ["current YouTube Shorts guidance"] }], sources: [{ title: sourceTitle, url: sourceUrl }] },
});
const provider = async (request: AssistantRequest, options: AssistantProviderOptions) => {
  providerCalls++;
  if (request.message.startsWith("Search")) {
    options.onActivity?.({ type: "search-start", topic: "YouTube Shorts guidance" });
    await wait(35);
    options.onActivity?.({ type: "search-end" });
    await wait(25);
    return searchResult(request);
  }
  await wait(60);
  return localResult(request);
};
const jobs = new DiamondAssistantJobService(provider, 55000, 80);
const terminal = (status: string) => ["done", "failed", "cancelled"].includes(status);

async function readSessions(page: Page): Promise<Session[]> {
  return page.evaluate(() => new Promise((resolveRead, reject) => {
    const open = indexedDB.open("diamond-assistant-session-v1");
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").getAll();
      tx.oncomplete = () => { db.close(); resolveRead(get.result); };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }));
}

async function collectReply(page: Page, message: string, answer: string, kind: "local" | "search", observerPage = page) {
  const before = await observerPage.getByRole("article", { name: "Assistant reply", exact: true }).count();
  await observerPage.evaluate(({ priorCount, expected }) => {
    type Sample = { at: number; state: string | null; visible: string; leading: string; gradient: string; color: string };
    const root = window as unknown as { __replyRevealProbe?: { done: boolean; samples: Sample[]; sawRevealing: boolean; firstCompleteAt: number | null } };
    root.__replyRevealProbe = { done: false, samples: [], sawRevealing: false, firstCompleteAt: null };
    const started = performance.now(); let priorSignature = "";
    const sample = () => {
      const probe = root.__replyRevealProbe!;
      const articles = document.querySelectorAll('article[aria-label="Assistant reply"]');
      const article = articles.length > priorCount ? articles.item(articles.length - 1) : null;
      const reveal = article?.querySelector<HTMLElement>("[data-assistant-reveal]") ?? null;
      const visible = reveal?.querySelector<HTMLElement>('[aria-hidden="true"]') ?? null;
      const leading = reveal?.querySelector<HTMLElement>("[class*=leadingText]") ?? null;
      const state = reveal?.getAttribute("data-assistant-reveal") ?? null;
      const record = { at: performance.now() - started, state, visible: visible?.textContent ?? "", leading: leading?.textContent ?? "", gradient: leading ? getComputedStyle(leading).backgroundImage : "", color: leading ? getComputedStyle(leading).color : "" };
      const signature = JSON.stringify([record.state, record.visible, record.leading]);
      if (signature !== priorSignature) { probe.samples.push(record); priorSignature = signature; }
      if (state === "revealing") { probe.sawRevealing = true; probe.firstCompleteAt = null; }
      if (state === "complete" && record.visible === expected) {
        probe.firstCompleteAt ??= performance.now();
        if (probe.sawRevealing || performance.now() - probe.firstCompleteAt > 180) probe.done = true;
      }
      if (!probe.done && performance.now() - started < 5000) requestAnimationFrame(sample);
      else probe.done = true;
    };
    requestAnimationFrame(sample);
  }, { priorCount: before, expected: answer });
  await page.getByLabel("Message the Assistant").fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: message }).waitFor();
  await observerPage.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: message }).waitFor();
  await observerPage.evaluate(() => { const root = window as unknown as { __replyRace?: number }; root.__replyRace = window.setInterval(() => window.dispatchEvent(new Event("focus")), 4); });
  await observerPage.waitForFunction(() => (window as unknown as { __replyRevealProbe?: { done: boolean } }).__replyRevealProbe?.done === true, undefined, { timeout: 7000 });
  await observerPage.evaluate(() => { const root = window as unknown as { __replyRace?: number }; if (root.__replyRace) window.clearInterval(root.__replyRace); });
  const samples = await observerPage.evaluate(() => (window as unknown as { __replyRevealProbe: { samples: Array<{ at: number; state: string | null; visible: string; leading: string; gradient: string; color: string }> } }).__replyRevealProbe.samples);
  const revealing = samples.filter(sample => sample.state === "revealing");
  const visibleLengths = [...new Set(revealing.map(sample => sample.visible.length))];
  const gradients = revealing.filter(sample => sample.leading.length > 0 && sample.gradient.includes("linear-gradient") && sample.color === "rgba(0, 0, 0, 0)");
  const articles = observerPage.getByRole("article", { name: "Assistant reply", exact: true });
  equal(await articles.count(), before + 1, `${kind} ${message} publishes exactly one assistant article`);
  const latest = articles.last();
  equal(await latest.locator('[aria-hidden="true"]').textContent(), answer, `${kind} ${message} ends with the exact full answer`);
  equal(await latest.locator('[data-assistant-reveal="complete"]').count(), 1, `${kind} ${message} reaches one complete visual answer`);
  check(revealing.length >= 2 && visibleLengths.length >= 2, `${kind} ${message} has multiple intermediate visible reveal states`);
  check(gradients.length >= 1, `${kind} ${message} uses the existing blue gradient leading edge while revealing`);
  equal(await latest.locator('[class*=messageText]').evaluate(element => getComputedStyle(element).whiteSpace), "pre-wrap", `${kind} ${message} preserves paragraph whitespace`);
  check((await latest.locator('[aria-hidden="true"]').textContent())?.includes("\n\n"), `${kind} ${message} preserves the exact paragraph break`);
  const saved = await readSessions(page); const current = saved.find(session => session.messages.some(item => item.text === message));
  const userMessage = current?.messages.find(item => item.role === "user" && item.text === message);
  equal(current?.messages.filter(item => item.role === "assistant" && item.turnId === userMessage?.turnId && item.text === answer).length, 1, `${kind} ${message} persists one answer with no duplicate`);
  captures.push({ kind, message, samples: samples.length, intermediateStates: visibleLengths.length, firstVisibleLength: visibleLengths[0], finalLength: answer.length, gradientStates: gradients.length });
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 }, reducedMotion: "no-preference" });
  let passivePage: Page | null = null;
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { forbidden.push(url.href); await route.abort(); return; }
    if (url.pathname === "/api/diamond-assistant") {
      let value;
      if (request.method() === "POST") {
        jobs.submit(request.postDataJSON());
        const body = request.postDataJSON() as AssistantRequest;
        for (let index = 0; index < 200; index++) { value = jobs.get(body.jobId, body.sessionId); if (value && terminal(value.status)) break; await wait(5); }
      } else if (request.method() === "DELETE") value = jobs.cancelRequest(request.postDataJSON());
      else if (passivePage && request.frame().page() === passivePage) { await wait(250); value = null; }
      else value = jobs.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!);
      await route.fulfill({ status: value ? request.method() === "POST" ? 202 : 200 : 404, contentType: "application/json", body: JSON.stringify(value ?? { error: "missing" }) });
      return;
    }
    if (url.pathname.startsWith("/api/")) { forbidden.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
    await route.continue();
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/assistant`); await page.getByRole("button", { name: "New Chat", exact: true }).waitFor();
  for (let index = 1; index <= iterations; index++) {
    await collectReply(page, `Local reveal ${index}`, localAnswer, "local");
    await collectReply(page, `Search reveal ${index}`, searchAnswer, "search");
  }
  passivePage = await context.newPage(); await passivePage.goto(page.url());
  await passivePage.getByRole("article", { name: "Assistant reply", exact: true }).last().waitFor();
  await collectReply(page, "Local passive-tab completion", localAnswer, "local", passivePage);
  await passivePage.close(); passivePage = null;
  equal(captures.length, iterations * 2 + 1, "every requested local and searched completion was captured, including storage-first cross-tab publication");
  equal(providerCalls, iterations * 2 + 1, "each explicit Send creates exactly one provider result with no retry");
  const beforeReloadAnswers = await page.getByRole("article", { name: "Assistant reply", exact: true }).count();
  await page.reload(); await page.getByRole("article", { name: "Assistant reply", exact: true }).last().waitFor();
  equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0, "persisted answers are immediately readable after reload and do not replay");
  equal(await page.getByRole("article", { name: "Assistant reply", exact: true }).count(), beforeReloadAnswers, "reload preserves one final article per answer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedBefore = await page.getByRole("article", { name: "Assistant reply", exact: true }).count();
  await page.getByLabel("Message the Assistant").fill("Local reduced motion"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("article", { name: "Assistant reply", exact: true }).nth(reducedBefore).waitFor();
  equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0, "reduced motion keeps the newly completed reply immediately readable");
  equal(await page.getByRole("article", { name: "Assistant reply", exact: true }).last().locator('[aria-hidden="true"]').textContent(), localAnswer, "reduced motion preserves exact answer text");
  equal(errors, [], "real browser records no page errors"); equal(forbidden, [], "browser proof records zero external or unrelated API requests");
  const result = { status: "PASS", iterationsPerPath: iterations, completions: captures.length, localCompletions: captures.filter(item => item.kind === "local").length, searchedCompletions: captures.filter(item => item.kind === "search").length, revealRate: 1, captures, assertions, errors, forbidden, providerCalls, duplicateAnswers: 0, historicalReloadAnimations: 0, reducedMotionAnimations: 0 };
  writeFileSync(resolve(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  await page.screenshot({ path: resolve(output, "final-conversation.png"), fullPage: true });
  console.log(JSON.stringify({ status: result.status, completions: result.completions, assertions: assertions.length }));
} catch (error) {
  const failure = { status: "FAIL", error: error instanceof Error ? error.stack ?? error.message : String(error), assertions, captures, errors, forbidden, providerCalls };
  writeFileSync(resolve(output, "pre-fix-failure.json"), `${JSON.stringify(failure, null, 2)}\n`);
  throw error;
} finally { await browser.close(); }
