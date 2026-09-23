import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { ASSISTANT_MODEL, type AssistantRequest, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { youtubePrompt } from "./phase4Fixtures.ts";

const origin = process.env.SPEC0012_PHASE4_ORIGIN ?? "http://127.0.0.1:58040";
const output = resolve("output/spec-0012/phase-4/live"); mkdirSync(output, { recursive: true });
const requests: AssistantRequest[] = []; const errors: string[] = []; const external: string[] = []; const screenshots: string[] = [];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } }); const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url()); if (url.origin !== origin) external.push(url.origin);
    if (url.origin === origin && url.pathname === "/api/diamond-assistant" && request.method() === "POST") requests.push(request.postDataJSON() as AssistantRequest);
  });
  const readSessions = (): Promise<Session[]> => page.evaluate(() => new Promise((resolveRead, reject) => { const open = indexedDB.open("diamond-assistant-session-v1"); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").getAll(); tx.oncomplete = () => { db.close(); resolveRead(get.result); }; tx.onerror = () => reject(tx.error); }; open.onerror = () => reject(open.error); }));
  const send = async (message: string) => { await page.getByLabel("Message the Assistant").fill(message); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: message }).waitFor(); };
  await page.goto(`${origin}/assistant`); await page.getByRole("button", { name: "New Chat", exact: true }).waitFor(); await page.evaluate(() => localStorage.setItem("phase4-live-project-sentinel", "unchanged"));

  const greeting = "Hi, who are you?"; await send(greeting);
  const greetingReply = page.getByRole("article", { name: "Assistant reply", exact: true }); await greetingReply.waitFor({ timeout: 100000 }); await greetingReply.locator('[data-assistant-reveal="complete"]').waitFor({ timeout: 5000 });
  const greetingText = await greetingReply.innerText(); assert.match(greetingText, /Diamond Animator/i); assert.equal((await page.locator("body").innerText()).includes("Searching the web"), false);
  const localSession = (await readSessions()).find(session => session.messages.some(message => message.text === greeting)); assert.ok(localSession); assert.equal(localSession.turns[0].usage?.model, ASSISTANT_MODEL); assert.equal(localSession.turns[0].usage?.toolCalls, 0); assert.equal(localSession.turns[0].search, undefined); assert.equal(localSession.messages.at(-1)?.citations, undefined);

  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  const searching = page.locator('[role="status"]').filter({ hasText: "Searching the web for current YouTube Shorts requirements…" });
  const finalizingSeen = page.locator('[role="status"]').filter({ hasText: "Finalizing answer" }).waitFor({ timeout: 100000 }).then(() => true, () => false);
  await send(youtubePrompt); await searching.waitFor({ timeout: 100000 });
  assert.equal(await searching.locator("span").innerText(), "Searching the web for current YouTube Shorts requirements…"); await page.screenshot({ path: resolve(output, "searching.png") }); screenshots.push("searching.png");
  const searchReply = page.getByRole("article", { name: "Assistant reply", exact: true }); await searchReply.waitFor({ timeout: 100000 }); assert.equal(await finalizingSeen, true); await searchReply.locator('[data-assistant-reveal="complete"]').waitFor({ timeout: 5000 });
  const answerText = await searchReply.innerText(); assert.match(answerText, /YouTube Shorts/i); assert.match(answerText, /Diamond Animator/i); assert.doesNotMatch(answerText, /\b(?:I|we)\s+(?:watched|viewed|listened to|downloaded|inspected)\b/i);
  const links = page.locator('[aria-label="Sources"] a'); const linkCount = await links.count(); assert.ok(linkCount >= 1 && linkCount <= 6);
  const displayedSources = [] as Array<{ title: string; url: string }>;
  for (let index = 0; index < linkCount; index++) { const link = links.nth(index); const url = await link.getAttribute("href"); assert.ok(url?.startsWith("https://")); assert.equal(await link.getAttribute("target"), "_blank"); assert.match(await link.getAttribute("rel") ?? "", /noopener/); displayedSources.push({ title: (await link.innerText()).replace(/^\[\d+\]\s*/, ""), url: url! }); }
  await links.first().focus(); assert.equal(await page.evaluate(() => document.activeElement?.tagName), "A"); await page.screenshot({ path: resolve(output, "cited-answer.png") }); screenshots.push("cited-answer.png");

  const searchSession = (await readSessions()).find(session => session.messages.some(message => message.text === youtubePrompt)); assert.ok(searchSession); const searchTurn = searchSession.turns.at(-1)!;
  assert.equal(searchTurn.status, "done"); assert.equal(searchTurn.usage?.model, ASSISTANT_MODEL); assert.ok((searchTurn.usage?.toolCalls ?? 0) >= 1 && (searchTurn.usage?.toolCalls ?? 0) <= 2); assert.ok((searchTurn.usage?.estimatedCostUsd ?? 1) <= .15);
  assert.ok(searchTurn.search && searchTurn.search.processedSourceCount >= 1 && searchTurn.search.processedSourceCount <= 8 && searchTurn.search.sources.length >= 1 && searchTurn.search.sources.length <= 6); assert.ok(searchSession.messages.at(-1)?.citations?.length);
  const searchDigest = searchSession.digest; await page.reload(); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor(); assert.equal(await page.locator('[aria-label="Sources"] a').count(), linkCount); assert.equal((await readSessions()).find(session => session.id === searchSession.id)?.digest, searchDigest); assert.equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0);

  assert.equal(requests.length, 2); assert.deepEqual(requests.map(request => request.message), [greeting, youtubePrompt]); assert.equal(await page.evaluate(() => localStorage.getItem("phase4-live-project-sentinel")), "unchanged"); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const totalCostUsd = [localSession, searchSession].reduce((sum, session) => sum + (session.turns.at(-1)?.usage?.estimatedCostUsd ?? 0), 0);
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", origin, liveCalls: 2, retries: 0, requestMessages: requests.map(request => request.message), greeting: { answerSha256: sha(greetingText), model: localSession.turns[0].usage?.model, toolCalls: 0 }, search: { answerSha256: sha(answerText), model: searchTurn.usage?.model, toolCalls: searchTurn.usage?.toolCalls, processedSourceCount: searchTurn.search?.processedSourceCount, displayedSources, estimatedCostUsd: searchTurn.usage?.estimatedCostUsd }, totalEstimatedCostUsd: totalCostUsd, searchingTextObserved: true, finalizingObserved: true, citationsPersistedAcrossReload: true, projectSentinelUnchanged: true, screenshots, errors, external }, null, 2));
  console.log(JSON.stringify({ status: "PASS", liveCalls: 2, searchToolCalls: searchTurn.usage?.toolCalls, sources: linkCount, totalEstimatedCostUsd: totalCostUsd })); await context.close();
} catch (error) {
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ status: "FAIL", liveCallsStarted: requests.length, retries: 0, requestMessages: requests.map(request => request.message), error: error instanceof Error ? error.message : "Unknown live proof failure", errors, external }, null, 2));
  throw error;
} finally { await browser.close(); }
