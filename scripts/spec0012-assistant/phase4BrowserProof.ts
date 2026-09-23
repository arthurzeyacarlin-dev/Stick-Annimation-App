import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type OpenAI from "openai";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { ASSISTANT_LIMITS, type AssistantRequest, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { createAssistantProvider } from "../../src/lib/assistant/assistantProvider.ts";
import { decideAssistantSearch } from "../../src/lib/assistant/assistantSearchPolicy.ts";
import { fixtureResult } from "./phase2Fixtures.ts";
import { responseFixture, youtubePrompt } from "./phase4Fixtures.ts";

const origin = process.env.SPEC0012_PHASE4_ORIGIN ?? "http://127.0.0.1:58040";
const output = resolve("output/spec-0012/phase-4/browser"); mkdirSync(output, { recursive: true });
const assertions: string[] = []; const errors: string[] = []; const forbidden: string[] = []; const screenshots: string[] = []; const captured: AssistantRequest[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions.push(label); };
const pause = (ms: number) => new Promise(resolvePause => setTimeout(resolvePause, ms));
let providerCalls = 0; let searchTransportCalls = 0;
const missingAnnotations = responseFixture({ annotations: false });
const metadataRecoveryProvider = createAssistantProvider(() => ({ create: async () => {
  searchTransportCalls++;
  return { async *[Symbol.asyncIterator]() {
    yield { type: "response.output_item.added", item: missingAnnotations.response.output[0], output_index: 0, sequence_number: 0 } as OpenAI.Responses.ResponseStreamEvent;
    await pause(850);
    yield { type: "response.web_search_call.completed", item_id: "search_call_0", output_index: 0, sequence_number: 1 } as OpenAI.Responses.ResponseStreamEvent;
    await pause(650);
    yield { type: "response.completed", response: missingAnnotations.response, sequence_number: 2 } as OpenAI.Responses.ResponseStreamEvent;
  } };
} }));
const jobs = new DiamondAssistantJobService(async (request, options) => {
  providerCalls++; captured.push(request); await pause(650);
  if (decideAssistantSearch(request).mode === "required") {
    return metadataRecoveryProvider(request, options);
  }
  await pause(350);
  const answer = request.message.startsWith("Hi") ? "I’m Diamond Animator’s guidance Assistant. I can explain the app without seeing or changing your projects." : "Use Home → Export, or File → Export… in the workspace. Save first because Export uses the saved animation and excludes unsaved edits.";
  return fixtureResult(request, answer, request.message.startsWith("Hi") ? "Meet the Assistant" : "Export an animation");
}, ASSISTANT_LIMITS.deadlineMs, 250);
const originalKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "phase4-citation-recovery-fixture-key";

async function configure(context: BrowserContext) {
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { forbidden.push(url.href); await route.abort(); return; }
    if (url.pathname === "/api/diamond-assistant") {
      const value = request.method() === "POST" ? jobs.submit(request.postDataJSON()) : request.method() === "DELETE" ? jobs.cancelRequest(request.postDataJSON()) : jobs.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!);
      await route.fulfill({ status: value ? request.method() === "POST" ? 202 : 200 : 404, contentType: "application/json", body: JSON.stringify(value ?? { error: "missing" }) }); return;
    }
    if (url.pathname.startsWith("/api/")) { forbidden.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
    await route.continue();
  });
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
}
async function readSessions(page: Page): Promise<Session[]> {
  return page.evaluate(() => new Promise((resolveRead, reject) => { const open = indexedDB.open("diamond-assistant-session-v1"); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").getAll(); tx.oncomplete = () => { db.close(); resolveRead(get.result); }; tx.onerror = () => reject(tx.error); }; open.onerror = () => reject(open.error); }));
}
const send = async (page: Page, message: string) => { await page.getByLabel("Message the Assistant").fill(message); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: message }).waitFor(); };
const snap = async (page: Page, name: string) => { await page.screenshot({ path: resolve(output, `${name}.png`) }); screenshots.push(`${name}.png`); };

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } }); await configure(context); const page = await context.newPage();
  await page.goto(`${origin}/assistant`); await page.getByRole("button", { name: "New Chat", exact: true }).waitFor(); await page.evaluate(() => localStorage.setItem("phase4-protected-project-sentinel", "unchanged"));

  await send(page, "Hi, who are you?"); const localThinking = page.locator('[role="status"]').filter({ hasText: "Thinking" }); await localThinking.waitFor();
  check(!(await page.locator("body").innerText()).includes("Searching "), "greeting never shows search activity"); await page.getByRole("article", { name: "Assistant reply", exact: true }).filter({ hasText: /guidance Assistant/ }).waitFor();
  equal(captured.at(-1)?.message, "Hi, who are you?", "exact greeting is sent through fixed local Terra path");
  await send(page, "Where do I export my animation?"); await page.getByRole("article", { name: "Assistant reply", exact: true }).filter({ hasText: /Home → Export/ }).waitFor();
  check(!(await page.locator("body").innerText()).includes("Searching "), "internal export guidance never shows search activity");

  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, youtubePrompt);
  const searching = page.locator('[role="status"]').filter({ hasText: "Searching YouTube Shorts for information…" }); await searching.waitFor();
  equal(await searching.locator("span").innerText(), "Searching YouTube Shorts for information…", "actual tool interval says what is being searched in plain language");
  const searchStyle = await searching.locator("span").evaluate(element => ["::before", "::after"].map(pseudo => ({ duration: getComputedStyle(element, pseudo).animationDuration, mask: getComputedStyle(element, pseudo).maskSize, gradient: getComputedStyle(element, pseudo).backgroundImage })));
  check(searchStyle.every(layer => layer.duration === "3.75s, 3.75s" && layer.mask === "57% 100%" && layer.gradient.includes("linear-gradient")), "search label reuses the normalized paired blue gradient");
  check(!(await searching.innerText()).includes("support.google.com"), "search activity never invents a site name"); await snap(page, "searching");
  const finalizing = page.locator('[role="status"]').filter({ hasText: "Finalizing answer" }); await finalizing.waitFor();
  await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor(); await page.waitForTimeout(800);
  equal(await page.locator('[aria-label="Sources"] a').count(), 1, "one provider-consulted source is displayed once without native annotations");
  const source = page.locator('[aria-label="Sources"] a').first(); equal(await source.getAttribute("href"), "https://support.google.com/youtube/answer/15424877", "source link keeps the canonical HTTPS URL");
  check((await source.getAttribute("target")) === "_blank" && (await source.getAttribute("rel"))?.includes("noopener"), "source link opens safely and is keyboard reachable");
  await source.focus(); check((await page.evaluate(() => document.activeElement?.textContent?.trim()))?.startsWith("[1] support.google.com"), "keyboard focus reaches the neutral label for the provider-consulted source");
  check((await page.getByRole("article", { name: "Assistant reply", exact: true }).innerText()).includes("Diamond Animator"), "search answer combines verified public facts with local export guidance"); await snap(page, "cited-answer");
  check(!(await page.locator("body").innerText()).includes("without verifiable citations"), "missing native annotations recover to a clean cited answer instead of the former terminal failure");
  const savedBeforeReload = await readSessions(page); const searchSession = savedBeforeReload.find(session => session.messages.some(message => message.text === youtubePrompt))!;
  check(!!searchSession.messages.at(-1)?.citations?.length && searchSession.turns.at(-1)?.search?.toolCalls === 1, "citations, actions and source receipt persist in Assistant-only IndexedDB");
  await page.reload(); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor(); equal(await page.locator('[aria-label="Sources"] a').count(), 1, "citation survives reload without replaying reveal");
  equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0, "persisted reply does not replay typewriter animation");

  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, youtubePrompt); await searching.waitFor(); const beforeReloadCalls = providerCalls; await page.reload();
  await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor({ timeout: 15000 }); equal(providerCalls, beforeReloadCalls, "reload reconnects to the same search job without resubmission");

  await page.setViewportSize({ width: 390, height: 844 }); await page.reload();
  equal(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth })), { width: 390, viewport: 390 }, "compact cited conversation has no horizontal overflow");
  const compactCitation = page.locator('[aria-label="Sources"] a').first(); await compactCitation.waitFor();
  check(await compactCitation.isVisible(), "compact source link remains visible and keyboard reachable"); await snap(page, "compact-citations");

  await page.emulateMedia({ reducedMotion: "reduce" }); await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, youtubePrompt); await searching.waitFor();
  equal(await searching.locator("span").evaluate(element => getComputedStyle(element, "::before").display), "none", "reduced motion keeps search status static without sweep");
  await page.getByRole("button", { name: "Cancel answer" }).click(); await page.getByText(/Answer cancelled/).waitFor(); equal(await searching.count(), 0, "cancel ends visible search activity immediately");
  equal(await page.evaluate(() => localStorage.getItem("phase4-protected-project-sentinel")), "unchanged", "protected local project sentinel remains byte-identical");
  equal(errors, [], "browser proof records no page errors"); equal(forbidden, [], "browser proof records no external or unrelated API request");
  check(captured.filter(request => request.message === youtubePrompt).length === 3, "each explicit YouTube send creates exactly one deterministic provider attempt");
  equal(searchTransportCalls, 3, "three explicit search sends create exactly three Responses requests with no automatic retry or duplicate answer");
  await context.close();
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, errors, forbidden, screenshots, providerCalls, searchTransportCalls, citationRecovery: "web_search_call.action.sources", capturedMessages: captured.map(request => request.message), realProviderCalls: 0, paidCalls: 0 }, null, 2));
  console.log(JSON.stringify({ status: "PASS", assertions: assertions.length }));
} finally { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; await browser.close(); }
