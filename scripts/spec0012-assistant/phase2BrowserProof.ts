import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { type AssistantRequest, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { fixtureResult, fixtureSession, newcomerAnswer } from "./phase2Fixtures.ts";

const origin = "http://127.0.0.1:57970";
const output = resolve("output/spec-0012/phase-2-correction/browser"); mkdirSync(output, { recursive: true });
const assertions: string[] = []; const errors: string[] = []; const requests: Array<{ method: string; path: string; kind: string }> = []; const screenshots: string[] = [];
const foreignMutations: string[] = []; const accessibility: Array<{ profile: string; violations: unknown[] }> = [];
const check = (condition: unknown, name: string) => { assert.ok(condition, name); assertions.push(name); };
const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
const modules = new Map<string, string>();
for (const name of ["assistantContracts", "assistantStorage"]) modules.set(`/__proof/${name}.js`, ts.transpileModule(readFileSync(`src/lib/assistant/${name}.ts`, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll("./assistantContracts.ts", "./assistantContracts.js"));
const dbRead = async (page: Page): Promise<Session[]> => page.evaluate(async () => { const moduleUrl = "/__proof/assistantStorage.js"; const storage = await import(moduleUrl); return (await storage.listSessions()).sessions; });
const rawRead = async (page: Page) => page.evaluate(() => new Promise<unknown[]>((resolve, reject) => { const open = indexedDB.open("diamond-assistant-session-v1", 1); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions", "readonly"); const read = tx.objectStore("sessions").getAll(); tx.oncomplete = () => { resolve(read.result); db.close(); }; tx.onerror = () => reject(tx.error); }; }));
const seed = async (page: Page, sessions: Session[]) => page.evaluate(values => new Promise<void>((resolve, reject) => { const open = indexedDB.open("diamond-assistant-session-v1", 1); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions", "readwrite"); const store = tx.objectStore("sessions"); store.clear(); for (const value of values) store.put(value); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }), sessions);
const snap = async (page: Page, name: string) => { const file = `${name}.png`; await page.screenshot({ path: resolve(output, file) }); screenshots.push(file); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let hold = false; const held: Array<() => void> = []; let providerCalls = 0; const captured: AssistantRequest[] = [];
let delayPost = false; const postReleases: Array<() => void> = [];
let delayMissing = false; const missingReleases: Array<() => void> = [];
const service = new DiamondAssistantJobService(async request => {
  providerCalls++; captured.push(request);
  if (hold) await new Promise<void>(resolve => held.push(resolve)); else await pause(150);
  await pause(120);
  const answer = request.message.includes("remember") ? `You told me: ${request.recentConversation.filter(m => m.role === "user").map(m => m.text).join("; ")}. We can continue from there.` : newcomerAnswer;
  return fixtureResult(request, answer);
});
const setup = async (context: BrowserContext, mock = true) => {
  await context.exposeBinding("reportAssistantForeignMutation", (_, value: string) => { foreignMutations.push(value); });
  await context.addInitScript(() => {
    const report = (value: string) => { void (window as unknown as { reportAssistantForeignMutation: (value: string) => Promise<void> }).reportAssistantForeignMutation(value); };
    for (const method of ["put", "add", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[method]; Object.defineProperty(IDBObjectStore.prototype, method, { value: function (...args: unknown[]) { if (this.transaction.db.name !== "diamond-assistant-session-v1") report(`IndexedDB:${this.transaction.db.name}:${method}`); return Reflect.apply(original, this, args); } });
    }
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      const original = Storage.prototype[method]; Object.defineProperty(Storage.prototype, method, { value: function (...args: unknown[]) { if (args[0] !== "phase2-protected-project-sentinel") report(`Storage:${method}:${String(args[0])}`); return Reflect.apply(original, this, args); } });
    }
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { report("microphone-permission"); throw new Error("No microphone in this phase"); };
  });
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (modules.has(url.pathname)) { await route.fulfill({ contentType: "text/javascript", body: modules.get(url.pathname)! }); return; }
    if (url.origin !== origin) { requests.push({ method: request.method(), path: url.origin, kind: "blocked-external" }); await route.abort(); return; }
    if (url.pathname === "/api/diamond-assistant" && mock) {
      requests.push({ method: request.method(), path: url.pathname, kind: "provider-double" });
      try {
        let value;
        if (request.method() === "POST") {
          const body = request.postDataJSON() as AssistantRequest;
          const saved = (await rawRead(request.frame().page())) as Session[];
          check(saved.some(s => s.id === body.sessionId && s.messages.at(-1)?.text === body.message && s.turns.at(-1)?.status === "pending"), "user message and pending turn committed before request dispatch");
          if (delayPost) await new Promise<void>(resolve => postReleases.push(resolve));
          value = service.submit(body);
        } else if (request.method() === "DELETE") value = service.cancelRequest(request.postDataJSON());
        else { value = service.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!); if (!value && delayMissing) await new Promise<void>(resolve => missingReleases.push(resolve)); }
        await route.fulfill({ status: value ? request.method() === "POST" ? 202 : 200 : 404, contentType: "application/json", body: JSON.stringify(value ?? { error: "Missing job" }) });
      } catch (error) { await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: error instanceof Error ? error.message : "double rejected" }) }); }
      return;
    }
    if (url.pathname.startsWith("/api/") && mock) { requests.push({ method: request.method(), path: url.pathname, kind: "blocked-unrelated-api" }); await route.abort(); return; }
    await route.continue();
  });
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
};
const open = async (context: BrowserContext) => { const page = await context.newPage(); await page.goto(`${origin}/assistant`); await page.getByRole("button", { name: "New Chat", exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector('button[aria-describedby="assistant-sessions-note"]')?.hasAttribute("disabled")); return page; };
const send = async (page: Page, message: string) => { await page.getByLabel("Message the Assistant").fill(message); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message", exact: true }).filter({ hasText: message }).waitFor(); };
const settled = async (page: Page) => { await page.getByRole("button", { name: "Send", exact: true }).waitFor({ timeout: 15000 }); await page.waitForTimeout(800); };

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } }); await setup(context); const page = await open(context);
  await page.evaluate(() => { localStorage.setItem("phase2-protected-project-sentinel", "unchanged"); });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await page.getByLabel("Reasoning level").selectOption("high");
  equal(await dbRead(page), [], "blank New Chat and reasoning never persist a session");
  await snap(page, "desktop-blank");
  const divider = page.getByRole("separator", { name: "Resize chat sessions sidebar" });
  await divider.focus(); await page.keyboard.press("Home"); equal(await divider.getAttribute("aria-valuenow"), "200", "preserved sidebar minimum"); await page.keyboard.press("End"); equal(await divider.getAttribute("aria-valuenow"), "440", "preserved sidebar maximum");
  const greeting = await page.locator("h1 > span").allTextContents(); equal(greeting, ["How can I help you with", "Diamond Animator today?"], "exact two-line Phase 1 greeting preserved");
  await page.keyboard.press("Home");
  await send(page, "I am new. What do the Home buttons do?"); await settled(page);
  let saved = await dbRead(page); equal(saved.length, 1, "first Send creates exactly one saved chat"); equal(saved[0].messages.length, 2, "one user and one answer persisted atomically"); equal(saved[0].reasoning, "high", "selected reasoning persisted"); equal(captured[0].reasoningLevel, "high", "selected reasoning sent unchanged"); equal(saved[0].title, "Getting started with Diamond Animator", "same-answer automatic title persisted");
  const firstId = saved[0].id; await snap(page, "desktop-conversation");
  check(!(await page.locator("body").innerText()).includes("Searching the internet"), "no fake search label");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); equal((await dbRead(page)).length, 1, "New Chat preserves saved list without adding blank"); equal(await page.getByLabel("Reasoning level").inputValue(), "medium", "new blank defaults Medium");
  await page.getByRole("button", { name: "Open chat: Getting started with Diamond Animator", exact: true }).click();
  equal(await page.locator('[data-assistant-reveal="revealing"]').count(), 0, "selecting persisted chat does not replay answer reveal");
  await page.reload(); await page.getByLabel("Message the Assistant").waitFor(); await page.waitForTimeout(600); equal((await dbRead(page))[0], saved[0], "reload restores exact session bytes and digest"); equal(await page.getByLabel("Reasoning level").inputValue(), "high", "reload restores reasoning selection");
  await send(page, "Do you remember what I asked?"); await settled(page); check(captured.at(-1)!.recentConversation.length === 2 && captured.at(-1)!.recentConversation[0].text.includes("I am new"), "continued conversation sends saved memory");
  check((await dbRead(page))[0].messages.at(-1)!.text.includes("I am new"), "deterministic conversational-memory answer saved");
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); hold = true; await send(page, "Help me learn"); await page.getByRole("status").filter({ hasText: /^ThinkingThinkingThinking$/ }).waitFor().catch(() => page.getByText("Thinking", { exact: true }).first().waitFor());
  const thinking = await page.locator('[role="status"]').filter({ hasText: "Thinking" }).first().innerText(); check(thinking.includes("Thinking"), "activity label appears whole immediately");
  await page.getByRole("button", { name: "Rename chat: Untitled chat", exact: true }).click(); await page.getByLabel("Chat name").fill("My permanent learning chat"); await page.getByRole("button", { name: "Save name", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  held.splice(0).forEach(resolve => resolve()); hold = false; await settled(page); saved = await dbRead(page); const manual = saved.find(s => s.title === "My permanent learning chat")!; check(!!manual && manual.titleSource === "manual", "manual rename permanently wins pending automatic title race");
  await snap(page, "manual-title-wins");
  await page.getByRole("button", { name: "Delete chat: My permanent learning chat", exact: true }).click(); await page.getByRole("button", { name: "Cancel", exact: true }).click(); equal((await dbRead(page)).length, 2, "delete cancellation preserves exact chat");
  await page.getByRole("button", { name: "Delete chat: My permanent learning chat", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Delete chat", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" }); equal((await dbRead(page)).map(s => s.id), [firstId], "confirmed delete removes only exact named session");
  equal(await page.evaluate(() => localStorage.getItem("phase2-protected-project-sentinel")), "unchanged", "Assistant never touches protected local storage sentinel");

  await page.getByRole("button", { name: "New Chat", exact: true }).click(); delayPost = true; delayMissing = true; hold = true;
  await send(page, "Cross-tab dispatch window");
  const secondTab = await open(context); await secondTab.getByRole("button", { name: "Open chat: Untitled chat", exact: true }).click(); await secondTab.waitForTimeout(1000);
  check((await dbRead(page)).find(s => s.messages[0].text === "Cross-tab dispatch window")?.turns.at(-1)?.status === "pending", "other-tab 404 cannot interrupt prepared pre-dispatch message");
  delayPost = false; postReleases.splice(0).forEach(resolve => resolve());
  for (let i = 0; i < 50 && !(await dbRead(page)).find(s => s.messages[0].text === "Cross-tab dispatch window")?.turns.at(-1)?.acceptedAt; i++) await pause(100);
  check(!!(await dbRead(page)).find(s => s.messages[0].text === "Cross-tab dispatch window")?.turns.at(-1)?.acceptedAt, "posting tab durably records acceptance while other tab's earlier 404 is held");
  delayMissing = false; missingReleases.splice(0).forEach(resolve => resolve()); await secondTab.waitForTimeout(700);
  equal((await dbRead(page)).find(s => s.messages[0].text === "Cross-tab dispatch window")?.turns.at(-1)?.status, "pending", "late pre-acceptance 404 cannot interrupt newly accepted request");
  hold = false; held.splice(0).forEach(resolve => resolve()); await settled(page); await secondTab.waitForTimeout(500);
  equal((await dbRead(page)).find(s => s.messages[0].text === "Cross-tab dispatch window")?.messages.length, 2, "delayed dispatch still completes once after cross-tab rereads");
  await secondTab.close();
  await page.getByRole("button", { name: "New Chat", exact: true }).click(); delayPost = true; const callsBeforeCancel = providerCalls;
  await send(page, "Cancel before the POST arrives"); await page.getByRole("button", { name: "Cancel answer", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).waitFor(); delayPost = false; postReleases.splice(0).forEach(resolve => resolve()); await page.waitForTimeout(700);
  equal(providerCalls, callsBeforeCancel, "real UI cancel-before-POST starts zero provider-double calls"); equal((await dbRead(page)).find(s => s.messages[0].text === "Cancel before the POST arrives")?.turns.at(-1)?.status, "cancelled", "cancel-before-dispatch persisted exact terminal status");
  await page.getByRole("button", { name: "Open chat: Getting started with Diamond Animator", exact: true }).first().click();

  const longTitle = "A long conversation title that should reveal every word and end without dots";
  await page.getByRole("button", { name: "Rename chat: Getting started with Diamond Animator", exact: true }).first().click(); await page.getByLabel("Chat name").fill(longTitle); await page.getByRole("button", { name: "Save name", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  const title = page.getByRole("button", { name: `Open chat: ${longTitle}`, exact: true }); await page.waitForTimeout(100); await title.focus(); await page.waitForTimeout(500);
  const marquee = await title.evaluate(button => { const window = button.firstElementChild as HTMLElement; const text = window.firstElementChild as HTMLElement; return { overflow: window.dataset.overflow, ellipsis: getComputedStyle(window).textOverflow, animation: getComputedStyle(text).animationName, transform: getComputedStyle(text).transform }; });
  equal(marquee.overflow, "true", "long title measures actual overflow"); equal(marquee.ellipsis, "clip", "keyboard marquee removes ellipsis during motion"); check(marquee.animation !== "none", "keyboard focus starts bounded marquee");
  await page.getByLabel("Message the Assistant").focus(); const reset = await title.evaluate(button => getComputedStyle(button.firstElementChild!.firstElementChild!).transform); equal(reset, "none", "marquee resets on blur");
  await page.emulateMedia({ reducedMotion: "reduce" }); await title.focus(); await page.waitForTimeout(50); const reduced = await title.evaluate(button => ({ animation: getComputedStyle(button.firstElementChild!.firstElementChild!).animationName, wrap: getComputedStyle(button.firstElementChild!).whiteSpace })); equal(reduced, { animation: "none", wrap: "normal" }, "reduced motion reveals full title without marquee"); await snap(page, "reduced-motion-title"); await page.emulateMedia({ reducedMotion: "no-preference" });

  const long = await fixtureSession(100, 60, 350); await seed(page, [long]); await page.reload(); await page.waitForTimeout(500); await page.getByRole("button", { name: `Open chat: ${long.title}`, exact: true }).click();
  const conversation = page.getByRole("region", { name: "Conversation" }); await conversation.evaluate(el => { el.scrollTop = 0; }); await page.getByRole("button", { name: "Jump to latest", exact: true }).waitFor(); await snap(page, "long-chat-away"); await page.getByRole("button", { name: "Jump to latest", exact: true }).click(); check(await conversation.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 5), "Jump to latest reaches newest message");
  const previous = await dbRead(page); await context.close();

  for (const profile of [{ name: "compact", width: 720, height: 814 }, { name: "narrow", width: 390, height: 844 }, { name: "smallest", width: 320, height: 568 }, { name: "zoom200", width: 720, height: 407 }, { name: "forced-colors", width: 1440, height: 814 }, { name: "reduced-motion", width: 1440, height: 814 }]) {
    const ctx = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, forcedColors: profile.name === "forced-colors" ? "active" : "none", reducedMotion: profile.name === "reduced-motion" ? "reduce" : "no-preference" }); await setup(ctx); const p = await open(ctx);
    const layout = await p.evaluate(() => { const composer = document.querySelector('form[aria-label="Message composer"]')!.getBoundingClientRect(); return { horizontal: document.documentElement.scrollWidth > innerWidth, composerVisible: composer.top >= 0 && composer.bottom <= innerHeight, heading: Array.from(document.querySelectorAll("h1 > span")).map(x => x.textContent) }; });
    equal(layout.horizontal, false, `${profile.name}: no horizontal page overflow`); check(layout.composerVisible, `${profile.name}: composer fully visible`); equal(layout.heading, ["How can I help you with", "Diamond Animator today?"], `${profile.name}: greeting preserved`);
    await seed(p, previous); await p.reload(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Open chat: Saved chat 100", exact: true }).click();
    check(await p.getByLabel("Message the Assistant").isVisible(), `${profile.name}: saved-chat composer accessible`);
    await p.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
    const violations = await p.evaluate(async () => { const result = await (window as unknown as { axe: { run: (selector: string) => Promise<{ violations: Array<{ impact: string }> }> } }).axe.run("[data-assistant-screen]"); return result.violations.filter(v => v.impact === "serious" || v.impact === "critical"); });
    accessibility.push({ profile: profile.name, violations }); equal(violations, [], `${profile.name}: no serious or critical Axe findings`);
    await snap(p, profile.name); await ctx.close();
  }

  // Independent real IndexedDB fault, capacity and concurrency proof (no provider calls).
  const storeContext = await browser.newContext(); await setup(storeContext); const storePage = await open(storeContext);
  const storeRun = async (code: string) => storePage.evaluate(`(async()=>{const s=await import('/__proof/assistantStorage.js');const c=await import('/__proof/assistantContracts.js');${code}})()`);
  const fortyNine = await Promise.all(Array.from({ length: 49 }, (_, i) => fixtureSession(i + 200)));
  await seed(storePage, fortyNine);
  await storeRun("await s.beginTurn(crypto.randomUUID(),'The fiftieth chat','medium',null)"); equal((await dbRead(storePage)).length, 50, "49 to 50 accepts exactly final session");
  const before50 = await rawRead(storePage); const blocked50 = await storeRun("try{await s.beginTurn(crypto.randomUUID(),'Over limit','medium',null);return false}catch{return true}"); check(blocked50, "51st session blocked"); equal(await rawRead(storePage), before50, "capacity failure evicts nothing");
  await storePage.reload(); await storePage.waitForTimeout(500); check(await storePage.getByRole("button", { name: "New Chat", exact: true }).isDisabled(), "New Chat visibly blocked at 50"); await snap(storePage, "fifty-chat-limit");
  await seed(storePage, fortyNine); const other = await storeContext.newPage(); await other.goto(`${origin}/assistant`); await other.getByLabel("Message the Assistant").waitFor();
  const races = await Promise.all([storePage, other].map(p => p.evaluate(async () => { const path = "/__proof/assistantStorage.js"; const s = await import(path); try { await s.beginTurn(crypto.randomUUID(), "Concurrent final slot", "medium", null); return true; } catch { return false; } })));
  equal(races.filter(Boolean).length, 1, "two-tab final-slot race has one winner"); equal((await dbRead(storePage)).length, 50, "two-tab race never exceeds 50");
  await seed(storePage, [await fixtureSession(300)]);
  const staleDelete = await storeRun("const a=(await s.listSessions()).sessions[0];await s.renameSession(a.id,'Renamed elsewhere',a);try{await s.deleteSession(a);return false}catch{return true}"); check(staleDelete, "stale delete target is revalidated and rejected");
  const quotaBefore = await rawRead(storePage);
  const quota = await storeRun("const a=(await s.listSessions()).sessions[0];const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('simulated quota','QuotaExceededError')};try{await s.renameSession(a.id,'Cannot save',a);return false}catch{return true}finally{IDBObjectStore.prototype.put=original}"); check(quota, "quota/write failure surfaces"); equal(await rawRead(storePage), quotaBefore, "quota failure retains original revision bytes");
  const readFail = await storeRun("const original=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(){throw new DOMException('read failed','UnknownError')};try{await s.listSessions();return false}catch{return true}finally{IDBObjectStore.prototype.getAll=original}"); check(readFail, "read failure rejects safely");
  const notification = await storeRun("const a=(await s.listSessions()).sessions[0];const original=window.BroadcastChannel;window.BroadcastChannel=class{constructor(){throw new Error('blocked')}};try{return (await s.renameSession(a.id,'Notification survived',a)).title}finally{window.BroadcastChannel=original}"); equal(notification, "Notification survived", "post-commit invalidation failure cannot report failed persistence");
  const subscription = await storeRun("const original=window.BroadcastChannel;window.BroadcastChannel=class{constructor(){throw new Error('blocked')}};try{let calls=0;const close=s.subscribeSessions(()=>calls++);window.dispatchEvent(new Event('focus'));close();return calls}finally{window.BroadcastChannel=original}"); equal(subscription, 1, "blocked BroadcastChannel subscription falls back to authoritative focus rereads without crashing");
  const corrupt = (await rawRead(storePage)) as Session[]; corrupt[0].messages[0].text = "bad digest"; await seed(storePage, corrupt); const corruptBefore = await rawRead(storePage); const corruptResult = await storeRun("const result=await s.listSessions();let blocked=false;try{await s.beginTurn(crypto.randomUUID(),'Do not overwrite','medium',null)}catch{blocked=true}return {issues:result.issues.length,blocked}"); equal(corruptResult, { issues: 1, blocked: true }, "corrupt digest visible and unsafe writes blocked"); equal(await rawRead(storePage), corruptBefore, "corrupt raw bytes preserved");
  await seed(storePage, [await fixtureSession(301, 100)]); check(await storeRun("const a=(await s.listSessions()).sessions[0];try{await s.beginTurn(a.id,'One too many','medium',a);return false}catch{return true}"), "200-message session blocks Send without truncation");
  await seed(storePage, []);
  const fallback = await storeRun("Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});const a=await s.beginTurn(crypto.randomUUID(),'Fallback lease works','medium',null);return a.messages.length"); equal(fallback, 1, "transactional lease fallback works without Web Locks");
  const lease = await storeRun("const db=await new Promise(r=>{const o=indexedDB.open(s.ASSISTANT_DB);o.onsuccess=()=>r(o.result)});await new Promise((r,j)=>{const t=db.transaction('leases','readwrite');t.objectStore('leases').put({owner:'foreign',expires:Date.now()+60000},'diamond-assistant-write-v1');t.oncomplete=r;t.onerror=j});db.close();try{await s.beginTurn(crypto.randomUUID(),'Locked out','medium',null);return false}catch{return true}"); check(lease, "foreign live lease blocks mutation");
  await storeContext.close();

  equal(errors, [], "no browser page errors"); equal(requests.filter(r => r.kind === "blocked-external"), [], "zero attempted external/provider browser requests"); equal(requests.filter(r => r.kind === "blocked-unrelated-api"), [], "zero AI Animator or unrelated API requests from Assistant");
  equal(foreignMutations, [], "zero project/recovery/Animator/other storage writes and zero microphone permission attempts");
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, requests, screenshots, errors, accessibility, foreignMutations, deterministicProviderCalls: providerCalls, realProviderCalls: 0, paidCalls: 0, searchCalls: 0, transcriptionCalls: 0, sourceDigest: createHash("sha256").update([...modules.values()].join("\n")).digest("hex") }, null, 2));
  console.log(JSON.stringify({ status: "PASS", assertions: assertions.length, screenshots: screenshots.length, deterministicProviderCalls: providerCalls, realProviderCalls: 0 }));
} finally { await browser.close(); }
