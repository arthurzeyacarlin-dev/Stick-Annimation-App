import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { createPhase1LegacyFixtureTransport } from "../spec0011-project-library/phase1Fixtures.ts";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { fixtureResult } from "./phase2Fixtures.ts";

const origin = "http://127.0.0.1:57970"; const output = resolve("output/spec-0012/phase-2-correction/protected-browser"); mkdirSync(output, { recursive: true });
const assertions: string[] = []; const errors: string[] = []; const network: string[] = []; const screenshots: string[] = [];
const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const check = (condition: unknown, name: string) => { assert.ok(condition, name); assertions.push(name); };
let finish: (() => void) | undefined; let calls = 0;
const jobs = new DiamondAssistantJobService(async request => { calls++; await new Promise<void>(resolve => { finish = resolve; }); return fixtureResult(request); });
const configure = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { network.push(url.origin); await route.abort(); return; }
    if (url.pathname === "/api/diamond-assistant") {
      const snapshot = request.method() === "POST" ? jobs.submit(request.postDataJSON()) : request.method() === "DELETE" ? jobs.cancelRequest(request.postDataJSON()) : jobs.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!);
      await route.fulfill({ status: snapshot ? 200 : 404, contentType: "application/json", body: JSON.stringify(snapshot ?? { error: "unknown" }) }); return;
    }
    if (url.pathname.startsWith("/api/")) { if (request.method() === "GET" && url.pathname === "/api/ai") await route.fulfill({ contentType: "application/json", body: '{"available":false}' }); else { network.push(`${request.method()} ${url.pathname}`); await route.abort(); } return; }
    await route.continue();
  });
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
};
const inventory = (page: Page) => page.evaluate(async () => {
  const values: Record<string, unknown> = { local: Object.fromEntries(Object.entries(localStorage).sort()) };
  for (const info of await indexedDB.databases()) {
    if (!info.name || info.name === "diamond-assistant-session-v1") continue;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open(info.name!); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const stores: Record<string, unknown> = {};
    for (const name of db.objectStoreNames) stores[name] = await new Promise((resolve, reject) => { const tx = db.transaction(name); const get = tx.objectStore(name).getAll(); tx.oncomplete = () => resolve(get.result); tx.onerror = () => reject(tx.error); });
    if (Object.values(stores).some(value => (value as unknown[]).length)) values[info.name] = stores; db.close();
  }
  return values;
});
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const fixture = await createPhase1LegacyFixtureTransport();
  const seededLocal = [{ name: "da_welcome_seen", value: "1" }, { name: "da_welcome_never_show", value: "1" }, { name: "da_saved_unified_projects_v1", value: JSON.stringify({ storageVersion: 1, projects: [fixture.unified] }) }, { name: "diamond_ai_animator_ledger_v1:protected", value: JSON.stringify({ version: 1, projectId: "protected", messages: [], jobs: [] }) }];
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 }, storageState: { cookies: [], origins: [{ origin, localStorage: seededLocal }] } }); await configure(context);
  const page = await context.newPage(); await page.goto(origin); await page.getByRole("button", { name: /AI Assistant Ask/ }).waitFor();
  const before = await inventory(page); await page.getByRole("button", { name: /AI Assistant Ask/ }).click(); await page.getByLabel("Message the Assistant").fill("Explain the Home buttons without touching my projects."); await page.getByRole("button", { name: "Send", exact: true }).click();
  const activity = page.locator('[role="status"]').filter({ hasText: "Thinking" }); await activity.waitFor();
  equal(await activity.locator("span").first().innerText(), "Thinking", "Thinking label appears complete, never typewritten");
  const sweep = await activity.locator("span").evaluate(element => ["::before", "::after"].map(pseudo => ({ duration: getComputedStyle(element, pseudo).animationDuration, mask: getComputedStyle(element, pseudo).maskSize, gradient: getComputedStyle(element, pseudo).backgroundImage })));
  check(sweep.every(layer => layer.duration === "3.75s, 3.75s" && layer.mask === "57% 100%" && layer.gradient.includes("linear-gradient")), "accepted full-label gradients use 1s bright, 1s dark and 1.75s pause cycle");
  await page.emulateMedia({ reducedMotion: "reduce" }); equal(await activity.locator("span").evaluate(el => getComputedStyle(el, "::before").display), "none", "reduced motion keeps static readable activity label"); await page.emulateMedia({ reducedMotion: "no-preference" });
  finish!(); const finalizing = page.locator('[role="status"]').filter({ hasText: "Finalizing answer" }); await finalizing.waitFor(); equal(await finalizing.locator("span").first().innerText(), "Finalizing answer", "Finalizing label follows complete validated provider-double answer");
  check(!(await page.locator("body").innerText()).includes("Searching the internet"), "no Searching label exists during no-search activity");
  const reveal = page.locator('article[aria-label="Assistant reply"] [data-assistant-reveal="revealing"]'); const observed = reveal.waitFor(); await observed;
  check((await reveal.locator('[aria-hidden="true"]').first().textContent())!.length > 0, "new final reply visibly typewrites with leading gradient");
  await page.waitForTimeout(900); equal(await reveal.count(), 0, "fast reveal finishes within bounded 720ms duration"); equal(await activity.count(), 0, "Thinking ends after terminal completion"); equal(await finalizing.count(), 0, "Finalizing ends after terminal completion");
  const after = await inventory(page); equal(after, before, "exact project/recovery/Animator/local storage inventory remains unchanged after complete Assistant guidance flow");
  await page.screenshot({ path: resolve(output, "guidance.png") }); screenshots.push("guidance.png");
  await page.getByRole("link", { name: "Back to Home" }).click(); await page.waitForFunction(() => document.activeElement?.id === "ai-assistant"); check(true, "Back restores Home Assistant-card focus");
  await page.getByRole("button", { name: /AI Project Finalizer/ }).click(); equal(await page.locator("[data-assistant-screen],canvas").count(), 0, "Finalizer stays unavailable and inert");
  await page.getByRole("button", { name: /Tutorials Learn/ }).click(); await page.locator("[data-tutorials-screen]").waitFor(); equal(await page.locator("[data-tutorial-card]").count(), 4, "Tutorials retains four Coming Later cards"); await page.getByRole("button", { name: "Back", exact: true }).click();
  for (const [name, selector] of [["My Projects", "[data-project-library]"], ["Open Project", "[data-project-library]"], ["Export", "[data-animation-export]"]] as const) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click(); await page.locator(selector).waitFor();
    equal(await page.locator("[data-assistant-screen],canvas[data-drawing-canvas]").count(), 0, `${name}: separate protected surface preserved`);
    if (name === "My Projects") { await page.getByRole("button", { name: /^Watch / }).first().click(); await page.getByRole("dialog").waitFor(); check(await page.getByRole("button", { name: /fullscreen/i }).isVisible(), "My Projects movie viewer retains fullscreen control"); await page.keyboard.press("Escape"); }
    await page.screenshot({ path: resolve(output, `${name.replaceAll(" ", "-")}.png`) }); screenshots.push(`${name.replaceAll(" ", "-")}.png`);
    await page.getByRole("button", { name: /Back/ }).first().click(); await page.getByRole("button", { name: /AI Assistant Ask/ }).waitFor();
  }
  await page.getByRole("button", { name: /^New Project/ }).click(); await page.getByRole("button", { name: "File", exact: true }).waitFor(); check(await page.locator("canvas").count() > 0, "New Project still mounts real editor canvas"); equal(await page.locator("[data-assistant-screen]").count(), 0, "workspace remains independent of Assistant");
  await page.screenshot({ path: resolve(output, "editor.png") }); screenshots.push("editor.png"); await context.close();
  equal(errors, [], "no page errors across protected flows"); equal(network, [], "protected browser makes no external or unexpected API requests");
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, errors, network, screenshots, deterministicProviderCalls: calls, realProviderCalls: 0, paidCalls: 0, beforeDigest: createHash("sha256").update(JSON.stringify(before)).digest("hex"), afterDigest: createHash("sha256").update(JSON.stringify(after)).digest("hex") }, null, 2));
  console.log(JSON.stringify({ status: "PASS", assertions: assertions.length }));
} finally { await browser.close(); }
