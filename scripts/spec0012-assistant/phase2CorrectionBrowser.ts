import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { type AssistantRequest, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { fixtureResult, fixtureSession } from "./phase2Fixtures.ts";

const origin = "http://127.0.0.1:57970"; const output = resolve("output/spec-0012/phase-2-correction/presentation"); mkdirSync(output, { recursive: true });
const assertions: string[] = []; const errors: string[] = []; const forbidden: string[] = []; const screenshots: string[] = [];
const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const check = (condition: unknown, name: string) => { assert.ok(condition, name); assertions.push(name); };
// Production CSS minification omits the first 0% and last 100% gradient stops.
// Only those semantically identical endpoints are normalized; all colors/interior stops remain exact.
const normalizeGradientEndpoints = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll(") 0%,", "),").replaceAll(") 100%)", "))"));
const gates = new Map<string, () => void>(); const captured: AssistantRequest[] = []; let calls = 0; let posts = 0; let offline = false;
const makeService = () => new DiamondAssistantJobService(async request => { calls++; captured.push(request); if (!request.message.startsWith("Quick")) await new Promise<void>(resolve => gates.set(request.message, resolve)); return fixtureResult(request); });
let service = makeService();
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
const read = (page: Page): Promise<Session[]> => page.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open("diamond-assistant-session-v1"); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").getAll(); tx.oncomplete = () => { db.close(); resolve(get.result); }; tx.onerror = () => reject(tx.error); }; }));
const send = async (page: Page, text: string) => { await page.getByLabel("Message the Assistant").fill(text); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: text }).waitFor(); };
const thinking = (page: Page) => page.locator('[data-sweep-pattern][data-text="Thinking"]');
const finalizing = (page: Page) => page.locator('[data-sweep-pattern][data-text="Finalizing answer"]');
const progress = (page: Page) => page.locator("[data-assistant-progress]");
const snap = async (page: Page, name: string) => { await page.screenshot({ path: resolve(output, name) }); screenshots.push(name); };
const style = (page: Page, text: string) => page.locator(`[data-sweep-pattern][data-text="${text}"]`).evaluate(element => {
  const style = getComputedStyle(element); const layer = (pseudo: string) => { const s = getComputedStyle(element, pseudo); return { gradient: s.backgroundImage, mask: s.maskImage, maskSize: s.maskSize, backgroundSize: s.backgroundSize, backgroundPosition: s.backgroundPosition, backgroundRepeat: s.backgroundRepeat, duration: s.animationDuration, timing: s.animationTimingFunction, textFill: s.webkitTextFillColor }; };
  return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, lineHeight: style.lineHeight, before: layer("::before"), after: layer("::after") };
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } });
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { forbidden.push(url.origin); await route.abort(); return; }
    if (url.pathname === "/api/diamond-assistant") {
      if (offline && request.method() === "GET") { await route.abort(); return; }
      let value;
      if (request.method() === "POST") { posts++; value = service.submit(request.postDataJSON()); }
      else if (request.method() === "DELETE") value = service.cancelRequest(request.postDataJSON());
      else value = service.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!);
      await route.fulfill({ status: value ? 200 : 404, contentType: "application/json", body: JSON.stringify(value ?? { error: "Server restarted" }) }); return;
    }
    if (url.pathname.startsWith("/api/")) { forbidden.push(url.pathname); await route.abort(); return; }
    await route.continue();
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); await page.goto(`${origin}/assistant`); await page.getByRole("button", { name: "New Chat", exact: true }).waitFor();
  const fixture = await fixtureSession(905, 60, 350);
  await page.evaluate(value => new Promise<void>((resolve, reject) => { const open = indexedDB.open("diamond-assistant-session-v1"); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").put(value); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }), fixture);
  await page.reload(); await page.getByRole("button", { name: "Open chat: Saved chat 905", exact: true }).click();
  const pane = page.getByRole("region", { name: "Conversation" });
  const scrolling = await pane.evaluate(el => {
    const ancestors: Element[] = []; for (let node: Element | null = el; node; node = node.parentElement) ancestors.push(node);
    return { owners: ancestors.filter(x => /(auto|scroll)/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 1).length, color: getComputedStyle(el).scrollbarColor, width: getComputedStyle(el).scrollbarWidth };
  });
  equal(scrolling, { owners: 1, color: "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)", width: "thin" }, "long chat has one scrolling owner and no painted native scrollbar");
  const documentScroll = await page.evaluate(() => { window.scrollTo(0, 100); return { scrollY, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, rootWidth: document.documentElement.clientWidth, viewportWidth: innerWidth }; });
  equal(documentScroll.scrollY, 0, "long chat cannot scroll the document as a second conversation surface"); equal(documentScroll.scrollHeight, documentScroll.clientHeight, "offscreen accessibility text stays inside the conversation clipping boundary"); equal(documentScroll.rootWidth, documentScroll.viewportWidth, "long chat leaves no permanent document scrollbar gutter");
  equal(await page.locator(".app-scrollbar-overlay").count(), 1, "exactly one approved app scrollbar overlay");
  await pane.evaluate(el => { el.scrollTop = el.scrollHeight * .3; }); await page.mouse.move(100, 50); await page.waitForTimeout(700);
  equal(await page.locator(".app-scrollbar-overlay").evaluate(el => getComputedStyle(el).opacity), "0", "scrollbar fades completely at idle"); await snap(page, "long-chat-idle.png");
  await pane.hover(); await page.mouse.wheel(0, 250); await page.waitForTimeout(90);
  const active = await page.locator(".app-scrollbar-overlay").evaluate(el => ({ opacity: getComputedStyle(el).opacity, width: getComputedStyle(el).width, color: getComputedStyle(el).backgroundColor }));
  equal(active, { opacity: "1", width: "5px", color: "rgba(34, 47, 65, 0.92)" }, "scrolling uses exact approved translucent blue app overlay"); await snap(page, "long-chat-scrolling.png");
  await page.waitForTimeout(700); equal(await page.locator(".app-scrollbar-overlay").evaluate(el => getComputedStyle(el).opacity), "0", "hovering content does not leave a permanent second scrollbar");
  const drag = await pane.evaluate(el => { const r = el.getBoundingClientRect(); const thumb = Math.max(36, el.clientHeight / el.scrollHeight * r.height); return { x: r.right - 3, y: r.top + el.scrollTop / (el.scrollHeight - el.clientHeight) * (r.height - thumb) + thumb / 2, before: el.scrollTop }; });
  await page.mouse.move(drag.x, drag.y); await page.mouse.down(); await page.mouse.move(drag.x, drag.y + 90, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(100);
  equal(await page.locator(".app-scrollbar-overlay").evaluate(el => getComputedStyle(el).opacity), "1", "pointer interaction at the scroll edge uses the single approved app activity indicator");
  await page.getByRole("button", { name: "Jump to latest", exact: true }).click(); check(await pane.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 5), "Jump to latest restores bottom after scrolling and pointer activity");
  equal(await page.getByRole("complementary", { name: "Chat sessions" }).getByText(/\d+\/50/).count(), 0, "routine chat counter is absent");
  await send(page, "Hold long-chat reply"); await thinking(page).waitFor();
  const composerBefore = await page.getByRole("form", { name: "Message composer" }).boundingBox();
  await pane.evaluate(el => { el.scrollTop -= 900; }); const awayTop = await pane.evaluate(el => el.scrollTop); gates.get("Hold long-chat reply")!(); await finalizing(page).waitFor();
  await page.getByRole("button", { name: "Send", exact: true }).waitFor(); await page.waitForTimeout(800); check(Math.abs(await pane.evaluate(el => el.scrollTop) - awayTop) < 3, "long-chat new answer does not force-scroll a reader away from bottom");
  equal(await page.getByRole("form", { name: "Message composer" }).boundingBox(), composerBefore, "composer remains fixed while long history updates");
  await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await page.evaluate(() => {
    const root = window as unknown as { correctionEvents: Array<{ kind: string; at: number; text: string }> }; root.correctionEvents = [];
    const seen = new WeakSet<Element>(); const observer = new MutationObserver(() => { for (const el of document.querySelectorAll('[data-assistant-progress], [data-sweep-pattern], article[aria-label="Assistant reply"]')) if (!seen.has(el)) { seen.add(el); root.correctionEvents.push({ kind: el.hasAttribute("data-assistant-progress") ? (el.querySelector('[data-assistant-reveal="revealing"]') ? "progress-revealing" : "progress") : el.hasAttribute("data-sweep-pattern") ? "status" : "reply", at: Date.now(), text: el.textContent ?? "" }); } }); observer.observe(document.body, { childList: true, subtree: true });
  });
  await send(page, "Long wait narration"); await thinking(page).waitFor(); const slow = captured.at(-1)!;
  equal(await progress(page).count(), 0, "short initial wait has no progress sentence");
  const rawAcceptedStyle = JSON.parse(readFileSync("output/spec-0012/phase-2-correction/animator-smoke/result.json", "utf8")).statusStyle;
  const rawThinkingStyle = await style(page, "Thinking"); const acceptedStyle = normalizeGradientEndpoints(rawAcceptedStyle), thinkingStyle = normalizeGradientEndpoints(rawThinkingStyle); equal(thinkingStyle, acceptedStyle, "Thinking exactly matches live Animator typography, color, masks and gradients");
  const samples = await thinking(page).evaluate(element => {
    const animations = element.getAnimations({ subtree: true }); const samples = [];
    for (const time of [0, 500, 1001, 1500, 2000, 3000, 3749]) { animations.forEach(a => { a.pause(); a.currentTime = time; }); samples.push({ time, bright: getComputedStyle(element, "::before").opacity, dark: getComputedStyle(element, "::after").opacity, brightPosition: getComputedStyle(element, "::before").maskPosition, darkPosition: getComputedStyle(element, "::after").maskPosition }); }
    animations.forEach(a => a.play()); return samples;
  });
  equal(samples.map(s => [s.time, s.bright, s.dark]), [[0,"1","0"],[500,"1","0"],[1001,"0","1"],[1500,"0","1"],[2000,"0","0"],[3000,"0","0"],[3749,"0","0"]], "paired 1s bright/1s dark sweeps retain exact 1.75s long pause");
  await page.emulateMedia({ reducedMotion: "reduce" }); equal(await thinking(page).evaluate(el => getComputedStyle(el, "::before").display), "none", "reduced motion hides sweeps but keeps full immediate label"); equal(await thinking(page).textContent(), "Thinking", "Thinking is immediate complete text"); await page.emulateMedia({ reducedMotion: "no-preference" });
  await progress(page).waitFor({ timeout: 10000 }); await page.waitForTimeout(300); equal(await progress(page).locator('[aria-hidden="true"]').textContent(), "I’m putting together a clear, simple explanation…", "long wait shows one natural local sentence");
  const events = await page.evaluate(() => (window as unknown as { correctionEvents: Array<{ kind: string; at: number; text: string }> }).correctionEvents);
  const progressAt = events.find(e => e.kind === "progress-revealing")!.at; const thinkingAt = service.get(slow.jobId, slow.sessionId)!.events[0].at;
  equal(events.filter(e => e.kind.startsWith("progress")).length, 1, "progress enters once through the existing fast typewriter path"); equal(await progress(page).locator('[data-assistant-reveal="complete"]').count(), 1, "short local sentence finishes its fast reveal within 300ms");
  check(progressAt - thinkingAt >= 7900 && progressAt - thinkingAt < 10000, "narration starts only after a genuine eight-second Thinking wait");
  const positions = await page.evaluate(() => ({ progress: document.querySelector("[data-assistant-progress]")!.getBoundingClientRect().bottom, thinking: document.querySelector('[data-text="Thinking"]')!.getBoundingClientRect().top })); check(positions.progress <= positions.thinking, "progress sentence is above Thinking");
  check(!(await read(page)).some(s => s.messages.some(m => m.text.includes("putting together a clear"))), "progress is never persisted as an assistant message"); await snap(page, "long-wait-progress.png");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await page.getByRole("button", { name: "Open chat: Untitled chat", exact: true }).click(); await page.waitForTimeout(700);
  equal(await progress(page).count(), 0, "switching away/back does not repeat progress or its typewriter");
  const beforeReleaseCalls = calls; gates.get("Long wait narration")!(); await finalizing(page).waitFor(); const visibleFinalizingAt = Date.now();
  equal(await progress(page).count(), 0, "progress clears before Finalizing"); equal(normalizeGradientEndpoints(await style(page, "Finalizing answer")), acceptedStyle, "Finalizing uses exact same accepted Animator visual mechanics");
  equal(await finalizing(page).textContent(), "Finalizing answer", "Finalizing label is immediate and not typewritten");
  equal((await read(page)).find(s => s.id === slow.sessionId)?.messages.length, 1, "validated answer is not persisted at start of final hold");
  await page.getByRole("button", { name: "Rename chat: Untitled chat", exact: true }).click(); await page.getByLabel("Chat name").fill("Renamed during Finalizing"); await page.getByRole("button", { name: "Save name", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForTimeout(Math.max(0, 2100 - (Date.now() - visibleFinalizingAt))); check(await finalizing(page).isVisible(), "Finalizing remains visibly present through the final hold"); equal((await read(page)).find(s => s.id === slow.sessionId)?.messages.length, 1, "no answer leaks into storage during final hold"); await snap(page, "finalizing.png");
  await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor(); const visibleHoldMs = Date.now() - visibleFinalizingAt;
  check(visibleHoldMs >= 2500 && visibleHoldMs < 3800, "visible Finalizing lasts approximately three seconds before reply reveal"); equal(calls, beforeReleaseCalls, "progress and final hold make no extra provider calls");
  equal((await read(page)).find(s => s.id === slow.sessionId)?.title, "Renamed during Finalizing", "manual rename during final hold wins over the returned automatic title");
  await page.waitForTimeout(800); equal(await finalizing(page).count(), 0, "terminal reply clears activity");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, "Cancel final hold"); await thinking(page).waitFor(); const cancel = captured.at(-1)!; gates.get("Cancel final hold")!(); await finalizing(page).waitFor();
  await page.getByRole("button", { name: "Cancel answer", exact: true }).click(); await page.getByRole("button", { name: "Send", exact: true }).waitFor(); await page.waitForTimeout(3200);
  equal((await read(page)).find(s => s.id === cancel.sessionId)?.turns[0].status, "cancelled", "UI cancellation wins throughout final hold"); equal((await read(page)).find(s => s.id === cancel.sessionId)?.messages.length, 1, "cancelled hold never publishes late answer");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, "Cancel narrated wait"); await thinking(page).waitFor(); const cancelNarrated = captured.at(-1)!; await progress(page).waitFor({ timeout: 10000 }); await page.getByRole("button", { name: "Cancel answer", exact: true }).click(); await page.getByRole("button", { name: "Send", exact: true }).waitFor(); equal(await progress(page).count(), 0, "cancelling a narrated Thinking wait clears the sentence"); gates.get("Cancel narrated wait")!(); await page.waitForTimeout(500); equal((await read(page)).find(s => s.id === cancelNarrated.sessionId)?.messages.length, 1, "late provider result after narrated cancellation cannot publish");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, "Restart final hold"); await thinking(page).waitFor(); const restart = captured.at(-1)!; gates.get("Restart final hold")!(); await finalizing(page).waitFor();
  service.cancelRequest(restart); service = makeService(); await page.getByText("This answer was interrupted or the server restarted.", { exact: false }).waitFor();
  equal((await read(page)).find(s => s.id === restart.sessionId)?.turns[0].status, "interrupted", "lost finalizing job becomes Interrupted after server restart"); equal(await progress(page).count(), 0, "restart clears local progress");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, "Disconnect long wait"); await thinking(page).waitFor(); const reconnect = captured.at(-1)!; await progress(page).waitFor({ timeout: 10000 }); offline = true;
  await page.getByRole("button", { name: "Reconnect / retry saving", exact: true }).waitFor(); equal(await progress(page).count(), 0, "disconnection clears visible progress immediately"); const postsBefore = posts; offline = false;
  await page.getByRole("button", { name: "Reconnect / retry saving", exact: true }).click(); await thinking(page).waitFor(); await page.waitForTimeout(800); equal(await progress(page).count(), 0, "reconnect does not replay narration"); equal(posts, postsBefore, "reconnect checks existing request without resending");
  gates.get("Disconnect long wait")!(); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor(); equal((await read(page)).find(s => s.id === reconnect.sessionId)?.turns[0].status, "done", "same existing answer completes after reconnect");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); await send(page, "Recover local storage wait"); await thinking(page).waitFor(); await progress(page).waitFor({ timeout: 10000 });
  await page.evaluate(() => { const original = indexedDB.open; indexedDB.open = function() { indexedDB.open = original; throw new DOMException("Proof transient read failure", "UnknownError"); }; window.dispatchEvent(new Event("focus")); });
  await page.getByText("Local chat storage is unavailable.", { exact: false }).waitFor(); equal(await progress(page).count(), 0, "a transient storage read failure clears visible narration"); await page.waitForTimeout(3600);
  check(await thinking(page).isVisible(), "automatic storage reread restores the existing Thinking job"); equal(await page.getByRole("button", { name: "New Chat", exact: true }).isEnabled(), true, "automatic storage reread restores normal controls without Reconnect"); equal(await progress(page).count(), 0, "automatic storage recovery never replays the one-shot narration");
  gates.get("Recover local storage wait")!(); await page.getByRole("article", { name: "Assistant reply", exact: true }).waitFor();
  for (const viewport of [{ width: 390, height: 844 }, { width: 720, height: 407 }]) {
    await page.setViewportSize(viewport); await page.getByRole("button", { name: "Open chat: Saved chat 905", exact: true }).click(); await pane.evaluate(el => { el.scrollTop = 500; });
    check(await page.getByLabel("Message the Assistant").isVisible(), `${viewport.width} compact composer remains visible`); equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${viewport.width} no horizontal document overflow`); equal(await page.getByRole("separator", { name: "Resize chat sessions sidebar" }).isVisible(), false, `${viewport.width} compact top strip retains no resize handle`); await snap(page, `compact-${viewport.width}.png`);
    equal(await page.evaluate(() => { window.scrollTo(0, 100); return { scrollY, height: document.documentElement.scrollHeight, width: document.documentElement.clientWidth }; }), { scrollY: 0, height: viewport.height, width: viewport.width }, `${viewport.width} compact long chat has no second document scrollbar`);
  }
  equal(errors, [], "zero page errors"); equal(forbidden, [], "zero external or unrelated requests"); equal(posts, calls, "one deterministic provider call for each explicit Send only");
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, nativeScrollbarPaintingEnabled: true, scrolling, documentScroll, activeScrollbar: active, rawThinkingStyle, rawAcceptedStyle, thinkingStyle, acceptedStyle, styleNormalization: "Only equivalent omitted first 0% and last 100% gradient stops", sweepSamples: samples, narrationDelayMs: progressAt - thinkingAt, visibleFinalizingMs: visibleHoldMs, serverFinalizingMs: 3000, screenshots, errors, forbidden, posts, deterministicProviderCalls: calls, realProviderCalls: 0, paidCalls: 0 }, null, 2)); console.log(JSON.stringify({ status: "PASS", assertions: assertions.length, visibleFinalizingMs: visibleHoldMs }));
} finally { await browser.close(); }
