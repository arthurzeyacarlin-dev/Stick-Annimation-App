import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import type { Session } from "../../src/lib/assistant/assistantContracts.ts";
import { fixtureResult } from "./phase2Fixtures.ts";

const origin = "http://127.0.0.1:57970"; const output = resolve("output/spec-0012/phase-2-correction/restart"); mkdirSync(output, { recursive: true });
const profile = resolve(output, `profile-${Date.now()}`); const assertions: string[] = []; const network: string[] = [];
const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
let hold = false; let calls = 0; let posts = 0;
let service = new DiamondAssistantJobService(async request => { calls++; if (hold) await new Promise(() => {}); return fixtureResult(request); });
const launch = async () => {
  const context = await chromium.launchPersistentContext(profile, { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { network.push(url.origin); await route.abort(); return; }
    if (url.pathname === "/api/diamond-assistant") {
      let value;
      if (request.method() === "POST") { posts++; value = service.submit(request.postDataJSON()); }
      else if (request.method() === "DELETE") value = service.cancelRequest(request.postDataJSON());
      else value = service.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!);
      await route.fulfill({ status: value ? 200 : 404, contentType: "application/json", body: JSON.stringify(value ?? { error: "Server restarted" }) }); return;
    }
    if (url.pathname.startsWith("/api/")) { network.push(url.pathname); await route.abort(); return; }
    await route.continue();
  }); return context;
};
const read = (page: Page): Promise<Session[]> => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open("diamond-assistant-session-v1"); request.onsuccess = () => { const db = request.result; const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").getAll(); tx.oncomplete = () => { resolve(get.result); db.close(); }; tx.onerror = () => reject(tx.error); };
}));
const send = async (page: Page, text: string) => { await page.getByLabel("Message the Assistant").fill(text); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: text }).waitFor(); };
let context: BrowserContext | undefined;
try {
  context = await launch(); let page = context.pages()[0]; await page.goto(`${origin}/assistant`); await page.getByLabel("Reasoning level").selectOption("xhigh");
  await send(page, "Keep this chat across a full browser restart"); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Rename chat:/ }).click(); await page.getByLabel("Chat name").fill("Restart continuity"); await page.getByRole("button", { name: "Save name", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  const complete = (await read(page))[0];
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); hold = true; await send(page, "Pending when server restarts");
  let pending: Session | undefined;
  for (let n = 0; n < 40; n++) { pending = (await read(page)).find(s => s.id !== complete.id); if (pending?.turns[0].acceptedAt) break; await page.waitForTimeout(100); }
  assert.ok(pending?.turns[0].acceptedAt); await context.close(); context = undefined;
  // A new service instance is the exact in-memory job-loss condition of a server restart.
  service.cancel(pending.turns[0].jobId, pending.id); service = new DiamondAssistantJobService(async request => { calls++; return fixtureResult(request); }); hold = false;
  context = await launch(); page = context.pages()[0]; await page.goto(`${origin}/assistant#chat=${complete.id}`); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor();
  equal((await read(page)).find(s => s.id === complete.id), complete, "real Chrome close/relaunch preserves exact history, title, reasoning, revision and digest");
  equal(await page.getByLabel("Reasoning level").inputValue(), "xhigh", "browser restart restores Extra High");
  equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0, "restart never replays persisted reply animation");
  await page.getByRole("button", { name: "Open chat: Untitled chat", exact: true }).click(); await page.getByText("This answer was interrupted or the server restarted.", { exact: false }).waitFor();
  equal((await read(page)).find(s => s.id === pending!.id)?.turns[0].status, "interrupted", "accepted job lost by server restart settles Interrupted"); equal(posts, 2, "restart never automatically resubmits a paid request");
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await page.evaluate(() => {
    const root = window as unknown as { failTerminalSave: boolean }; root.failTerminalSave = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { const value = args[0] as { turns?: Array<{ status: string }> }; if (root.failTerminalSave && this.name === "sessions" && value.turns?.at(-1)?.status === "done") throw new DOMException("Proof quota", "QuotaExceededError"); return Reflect.apply(original, this, args); };
  });
  await send(page, "Save the same completed answer after storage recovers"); await page.getByRole("button", { name: "Reconnect / retry saving", exact: true }).waitFor();
  equal((await read(page)).find(s => s.messages[0].text.startsWith("Save the same"))?.turns[0].status, "pending", "failed terminal transaction preserves saved user message and pending identity");
  await page.evaluate(() => { (window as unknown as { failTerminalSave: boolean }).failTerminalSave = false; });
  await page.getByRole("button", { name: "Reconnect / retry saving", exact: true }).click(); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor();
  equal((await read(page)).find(s => s.messages[0].text.startsWith("Save the same"))?.turns[0].status, "done", "explicit reconnect saves same existing terminal answer after storage recovers");
  equal(posts, 3, "terminal-save reconnect makes zero repeat POSTs"); equal(calls, 3, "only three explicitly requested provider-double invocations"); equal(network, [], "restart proof makes zero external/unrelated requests");
  await page.screenshot({ path: resolve(output, "recovered.png") });
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, posts, deterministicProviderCalls: calls, realProviderCalls: 0, paidCalls: 0, network, actualBrowserRelaunch: true }, null, 2)); console.log(JSON.stringify({ status: "PASS", assertions: assertions.length }));
} finally { await context?.close(); }
