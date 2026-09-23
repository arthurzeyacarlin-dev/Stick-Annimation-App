import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { ASSISTANT_MODEL, type AssistantRequest, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { youtubePrompt } from "./phase4Fixtures.ts";

const origin = "http://127.0.0.1:58040"; const output = resolve("output/spec-0012/phase-4/live"); mkdirSync(output, { recursive: true });
const prior = JSON.parse(readFileSync(resolve(output, "failure.json"), "utf8")); assert.equal(prior.liveCallsStarted, 1); assert.equal(prior.retries, 0);
const requests: AssistantRequest[] = []; const errors: string[] = []; const external: string[] = []; const screenshots: string[] = [];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } }); const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message)); page.on("request", request => { const url = new URL(request.url()); if (url.origin !== origin) external.push(url.origin); if (url.origin === origin && url.pathname === "/api/diamond-assistant" && request.method() === "POST") requests.push(request.postDataJSON() as AssistantRequest); });
  const readSessions = (): Promise<Session[]> => page.evaluate(() => new Promise((resolveRead, reject) => { const open = indexedDB.open("diamond-assistant-session-v1"); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").getAll(); tx.oncomplete = () => { db.close(); resolveRead(get.result); }; tx.onerror = () => reject(tx.error); }; open.onerror = () => reject(open.error); }));
  await page.goto(`${origin}/assistant`); await page.getByRole("button", { name: "New Chat", exact: true }).waitFor(); await page.evaluate(() => localStorage.setItem("phase4-live-search-project-sentinel", "unchanged"));
  const searching = page.locator('[role="status"]').filter({ hasText: "Searching the web for current YouTube Shorts requirements…" });
  const searchingSeen = searching.waitFor({ timeout: 95000 }).then(async () => { await page.screenshot({ path: resolve(output, "searching-live.png") }); screenshots.push("searching-live.png"); return true; }, () => false);
  const finalizingSeen = page.locator('[role="status"]').filter({ hasText: "Finalizing answer" }).waitFor({ timeout: 95000 }).then(() => true, () => false);
  await page.getByLabel("Message the Assistant").fill(youtubePrompt); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message", exact: true }).waitFor();
  let session: Session | undefined;
  for (let attempt = 0; attempt < 210; attempt++) { session = (await readSessions()).find(value => value.messages.some(message => message.text === youtubePrompt)); if (session?.turns.at(-1)?.status !== "pending") break; await page.waitForTimeout(500); }
  assert.ok(session); const turn = session.turns.at(-1)!; const didSearch = await searchingSeen; const didFinalize = await finalizingSeen;
  assert.equal(requests.length, 1); assert.equal(requests[0].message, youtubePrompt); assert.equal(await page.evaluate(() => localStorage.getItem("phase4-live-search-project-sentinel")), "unchanged"); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  if (turn.status !== "done") {
    const result = { status: "LIVE_ACCESS_FAILED", cumulativeLiveCalls: 2, liveCallsThisRun: 1, retries: 0, requestMessage: youtubePrompt, terminalStatus: turn.status, safeError: turn.error, searchingTextObserved: didSearch, finalizingObserved: didFinalize, answerPublished: false, projectSentinelUnchanged: true, screenshots, errors, external };
    writeFileSync(resolve(output, "search-result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); await context.close();
  } else {
    const reply = page.getByRole("article", { name: "Assistant reply", exact: true }); await reply.waitFor(); await reply.locator('[data-assistant-reveal="complete"]').waitFor({ timeout: 5000 }); const answerText = await reply.innerText();
    assert.equal(didSearch, true); assert.equal(didFinalize, true); assert.equal(turn.usage?.model, ASSISTANT_MODEL); assert.ok((turn.usage?.toolCalls ?? 0) >= 1 && (turn.usage?.toolCalls ?? 0) <= 2); assert.ok((turn.usage?.estimatedCostUsd ?? 1) <= .15); assert.ok(turn.search && turn.search.processedSourceCount >= 1 && turn.search.processedSourceCount <= 8 && turn.search.sources.length >= 1 && turn.search.sources.length <= 6); assert.ok(session.messages.at(-1)?.citations?.length);
    assert.match(answerText, /YouTube Shorts/i); assert.match(answerText, /Diamond Animator/i); assert.doesNotMatch(answerText, /\b(?:I|we)\s+(?:watched|viewed|listened to|downloaded|inspected)\b/i);
    const links = page.locator('[aria-label="Sources"] a'); const count = await links.count(); assert.ok(count >= 1 && count <= 6); const displayedSources: Array<{ title: string; url: string }> = [];
    for (let index = 0; index < count; index++) { const link = links.nth(index); const url = await link.getAttribute("href"); assert.ok(url?.startsWith("https://")); assert.equal(await link.getAttribute("target"), "_blank"); assert.match(await link.getAttribute("rel") ?? "", /noopener/); displayedSources.push({ title: (await link.innerText()).replace(/^\[\d+\]\s*/, ""), url: url! }); }
    await links.first().focus(); assert.equal(await page.evaluate(() => document.activeElement?.tagName), "A"); await page.screenshot({ path: resolve(output, "cited-answer-live.png") }); screenshots.push("cited-answer-live.png");
    const digest = session.digest; await page.reload(); await reply.waitFor(); assert.equal(await page.locator('[aria-label="Sources"] a').count(), count); assert.equal((await readSessions())[0].digest, digest); assert.equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0);
    const result = { status: "PASS", cumulativeLiveCalls: 2, liveCallsThisRun: 1, retries: 0, requestMessage: youtubePrompt, terminalStatus: turn.status, answerSha256: sha(answerText), model: turn.usage?.model, toolCalls: turn.usage?.toolCalls, processedSourceCount: turn.search?.processedSourceCount, displayedSources, estimatedCostUsd: turn.usage?.estimatedCostUsd, searchingTextObserved: didSearch, finalizingObserved: didFinalize, citationsPersistedAcrossReload: true, projectSentinelUnchanged: true, screenshots, errors, external };
    writeFileSync(resolve(output, "search-result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); await context.close();
  }
} catch (error) { writeFileSync(resolve(output, "search-runner-failure.json"), JSON.stringify({ status: "FAIL", cumulativeLiveCallsStarted: 1 + requests.length, retries: 0, requestMessages: requests.map(request => request.message), error: error instanceof Error ? error.message : "Unknown live search proof failure", errors, external }, null, 2)); throw error; }
finally { await browser.close(); }
