import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { ASSISTANT_LIMITS, stableJson, type AssistantRequest, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { fixtureResult, fixtureSession } from "./phase2Fixtures.ts";

const origin = process.env.SPEC0012_PHASE4_ORIGIN ?? "http://127.0.0.1:58040";
const output = resolve("output/spec-0012/phase-4/corrupt-row");
mkdirSync(output, { recursive: true });

const corruptId = "corrupt_row_preserved_0001";
const corruptRow = { id: corruptId, schema: "unreadable-corrupt/v1", opaque: { order: [3, 1, 2], note: "preserve exactly — ไม่เปลี่ยนแปลง" } };
const assertions: string[] = [];
const errors: string[] = [];
const forbidden: string[] = [];
const screenshots: string[] = [];
const requests: AssistantRequest[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions.push(label); };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const pause = (ms: number) => new Promise(resolvePause => setTimeout(resolvePause, ms));

let deterministicProviderCalls = 0;
const jobs = new DiamondAssistantJobService(async request => {
  deterministicProviderCalls++;
  requests.push(request);
  await pause(40);
  return fixtureResult(request, "This deterministic local proof answer used no hosted provider or search.", "Corrupt-row proof chat");
}, 90000, 0);

type RouteLedger = { assistantApiRequests: number; assistantApiMethods: string[]; unrelatedApiRequests: string[]; externalRequests: string[] };
async function configure(context: BrowserContext, ledger: RouteLedger) {
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      ledger.externalRequests.push(url.href);
      forbidden.push(url.href);
      await route.abort();
      return;
    }
    if (url.pathname === "/api/diamond-assistant") {
      ledger.assistantApiRequests++;
      ledger.assistantApiMethods.push(request.method());
      const value = request.method() === "POST"
        ? jobs.submit(request.postDataJSON())
        : request.method() === "DELETE"
          ? jobs.cancelRequest(request.postDataJSON())
          : jobs.get(url.searchParams.get("jobId")!, url.searchParams.get("sessionId")!);
      await route.fulfill({ status: value ? request.method() === "POST" ? 202 : 200 : 404, contentType: "application/json", body: JSON.stringify(value ?? { error: "missing" }) });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const description = `${request.method()} ${url.pathname}`;
      ledger.unrelatedApiRequests.push(description);
      forbidden.push(description);
      await route.abort();
      return;
    }
    await route.continue();
  });
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
}

async function replaceRows(page: Page, rows: unknown[]) {
  await page.evaluate(async values => {
    const db = await new Promise<IDBDatabase>((resolveOpen, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("sessions", { keyPath: "id" }); request.result.createObjectStore("leases"); };
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolveWrite, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");
      store.clear();
      for (const value of values) store.put(value);
      tx.oncomplete = () => resolveWrite();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, rows);
}

async function readRows(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolveOpen, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<unknown[]>((resolveRead, reject) => {
      const tx = db.transaction("sessions", "readonly");
      const request = tx.objectStore("sessions").getAll();
      tx.oncomplete = () => resolveRead(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
    return rows;
  });
}

async function rawSummary(page: Page) {
  return page.evaluate(async () => {
    const stable = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
      if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
      return JSON.stringify(value);
    };
    const db = await new Promise<IDBDatabase>((resolveOpen, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<unknown[]>((resolveRead, reject) => {
      const tx = db.transaction("sessions", "readonly");
      const request = tx.objectStore("sessions").getAll();
      tx.oncomplete = () => resolveRead(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
    const summaries = [];
    for (const row of rows) {
      const canonical = stable(row);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
      summaries.push({ id: (row as { id?: unknown }).id, bytes: new TextEncoder().encode(canonical).byteLength, sha256: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("") });
    }
    return summaries.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  });
}

async function openIsolated(label: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } });
  const ledger: RouteLedger = { assistantApiRequests: 0, assistantApiMethods: [], unrelatedApiRequests: [], externalRequests: [] };
  await configure(context, ledger);
  const page = await context.newPage();
  await page.goto(`${origin}/assistant`);
  await page.getByRole("button", { name: "New Chat", exact: true }).waitFor();
  return { label, context, page, ledger };
}

async function waitForNotice(page: Page, pattern: RegExp) {
  await page.locator('[role="status"]').filter({ hasText: pattern }).waitFor({ timeout: 10000 });
}
async function waitForNewChatEnabled(page: Page) {
  const button = page.getByRole("button", { name: "New Chat", exact: true });
  await button.waitFor();
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-describedby="assistant-sessions-note"]')?.disabled, undefined, { timeout: 15000 });
  return button;
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed"), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
try {
  const primary = await openIsolated("preservation-and-healthy-mutation");
  await replaceRows(primary.page, [corruptRow]);
  const corruptCanonicalBefore = stableJson((await readRows(primary.page))[0]);
  const corruptShaBefore = sha(corruptCanonicalBefore);
  await primary.page.reload();
  const newChat = primary.page.getByRole("button", { name: "New Chat", exact: true });
  await newChat.waitFor();
  check(await newChat.isEnabled(), "New Chat remains enabled with one unreadable row");
  await newChat.click();
  const reasoning = primary.page.getByLabel("Reasoning level");
  check(await reasoning.isEnabled(), "reasoning control remains enabled with one unreadable row");
  await reasoning.selectOption("xhigh");
  equal(await reasoning.inputValue(), "xhigh", "blank-chat reasoning changes to Extra High");
  const composer = primary.page.getByLabel("Message the Assistant");
  await composer.fill("Create a healthy chat without changing the unreadable saved row.");
  const send = primary.page.getByRole("button", { name: "Send", exact: true });
  check(await send.isEnabled(), "Send is enabled when message text exists");
  const bodyBeforeSend = await primary.page.locator("body").innerText();
  check(!/saved chat could not be verified|changes are blocked|Reconnect \/ retry saving/i.test(bodyBeforeSend), "no blocking, corrupt-row, or reconnect warning is shown");
  await send.click();
  await primary.page.getByRole("article", { name: "Assistant reply", exact: true }).filter({ hasText: /deterministic local proof answer/ }).waitFor({ timeout: 15000 });
  const afterCreation = await readRows(primary.page);
  const healthy = afterCreation.find(row => (row as { schema?: unknown }).schema === "diamond-assistant-session/v1") as Session | undefined;
  check(!!healthy, "healthy chat row is created beside the unreadable row");
  equal(healthy?.reasoning, "xhigh", "healthy chat is created with the selected reasoning level");
  const corruptAfterCreation = afterCreation.find(row => (row as { id?: unknown }).id === corruptId);
  equal(stableJson(corruptAfterCreation), corruptCanonicalBefore, "unreadable row is byte-for-byte unchanged after healthy chat creation");
  await reasoning.selectOption("high");
  await primary.page.waitForFunction(async id => {
    const request = indexedDB.open("diamond-assistant-session-v1", 1);
    const db = await new Promise<IDBDatabase>((resolveOpen, reject) => { request.onsuccess = () => resolveOpen(request.result); request.onerror = () => reject(request.error); });
    const value = await new Promise<unknown>((resolveRead, reject) => { const tx = db.transaction("sessions"); const get = tx.objectStore("sessions").get(id); tx.oncomplete = () => resolveRead(get.result); tx.onerror = () => reject(tx.error); });
    db.close();
    return (value as { reasoning?: unknown } | undefined)?.reasoning === "high";
  }, healthy!.id);
  const afterReasoning = await readRows(primary.page);
  const healthyAfterReasoning = afterReasoning.find(row => (row as { id?: unknown }).id === healthy!.id) as Session;
  equal(healthyAfterReasoning.reasoning, "high", "healthy row persists the changed reasoning level");
  equal(stableJson(afterReasoning.find(row => (row as { id?: unknown }).id === corruptId)), corruptCanonicalBefore, "unreadable row is byte-for-byte unchanged after reasoning mutation");
  const corruptShaAfter = sha(stableJson(afterReasoning.find(row => (row as { id?: unknown }).id === corruptId)));
  equal(corruptShaAfter, corruptShaBefore, "unreadable row SHA-256 remains identical across both healthy mutations");
  await primary.page.screenshot({ path: resolve(output, "usable-with-corrupt-row.png") });
  screenshots.push("usable-with-corrupt-row.png");
  equal(primary.ledger.externalRequests, [], "primary flow makes no external browser request");
  equal(primary.ledger.unrelatedApiRequests, [], "primary flow makes no unrelated API request");
  equal(primary.ledger.assistantApiMethods.filter(method => method === "POST").length, 1, "primary flow uses exactly one deterministic submit");
  check(primary.ledger.assistantApiRequests >= 2 && primary.ledger.assistantApiMethods.slice(1).every(method => method === "GET"), "primary flow uses only bounded deterministic completion polls after submit");
  await primary.context.close();

  const collision = await openIsolated("corrupt-key-collision");
  await replaceRows(collision.page, [corruptRow]);
  const collisionBefore = await rawSummary(collision.page);
  await collision.page.reload();
  await collision.page.getByLabel("Message the Assistant").fill("This send must not overwrite the corrupt key.");
  await collision.page.evaluate(id => {
    const original = crypto.randomUUID.bind(crypto);
    let first = true;
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => { if (first) { first = false; return id; } return original(); } });
  }, corruptId);
  await collision.page.getByRole("button", { name: "Send", exact: true }).click();
  await waitForNotice(collision.page, /identifier belongs to an unreadable saved record/i);
  equal(await rawSummary(collision.page), collisionBefore, "unreadable row key collision preserves the exact raw row set");
  equal(collision.ledger.assistantApiRequests, 0, "corrupt-key collision is rejected before any Assistant API request");
  await collision.context.close();

  const countCapacity = await openIsolated("raw-row-count-capacity");
  const healthyCapacityRows = await Promise.all(Array.from({ length: ASSISTANT_LIMITS.sessions - 1 }, (_, index) => fixtureSession(2000 + index)));
  await replaceRows(countCapacity.page, [corruptRow, ...healthyCapacityRows]);
  const countBefore = await rawSummary(countCapacity.page);
  await countCapacity.page.reload();
  check(await (await waitForNewChatEnabled(countCapacity.page)).isEnabled(), "New Chat remains usable when 49 readable plus one unreadable row fill raw capacity");
  await countCapacity.page.getByLabel("Message the Assistant").fill("Raw row count must include the unreadable row.");
  await countCapacity.page.getByRole("button", { name: "Send", exact: true }).click();
  await waitForNotice(countCapacity.page, /50 saved chats/i);
  equal(await rawSummary(countCapacity.page), countBefore, "raw-row count capacity rejection changes no IndexedDB row");
  equal(countCapacity.ledger.assistantApiRequests, 0, "raw-row count capacity is enforced before any Assistant API request");
  await countCapacity.context.close();

  const byteCapacity = await openIsolated("raw-row-byte-capacity");
  const oversizedCorrupt = { id: "corrupt_row_bytes_0001", schema: "unreadable-corrupt/v1", payload: "x".repeat(ASSISTANT_LIMITS.databaseBytes + 1024) };
  await replaceRows(byteCapacity.page, [oversizedCorrupt]);
  const byteBefore = await rawSummary(byteCapacity.page);
  await byteCapacity.page.reload();
  check(await (await waitForNewChatEnabled(byteCapacity.page)).isEnabled(), "New Chat remains usable before a raw-byte capacity mutation is attempted");
  await byteCapacity.page.getByLabel("Message the Assistant").fill("Raw byte capacity must include this unreadable row.");
  await byteCapacity.page.getByRole("button", { name: "Send", exact: true }).click();
  await waitForNotice(byteCapacity.page, /32 MiB limit/i);
  equal(await rawSummary(byteCapacity.page), byteBefore, "raw-byte capacity rejection changes no IndexedDB row");
  equal(byteCapacity.ledger.assistantApiRequests, 0, "raw-byte capacity is enforced before any Assistant API request");
  await byteCapacity.context.close();

  equal(errors, [], "all isolated corrupt-row browser profiles record no page errors");
  equal(forbidden, [], "all isolated corrupt-row browser profiles record no external or unrelated API requests");
  equal(deterministicProviderCalls, 1, "exactly one deterministic local provider fixture completes the healthy chat");
  equal(requests.length, 1, "exactly one deterministic Assistant request is captured");
  const result = {
    status: "PASS",
    database: "diamond-assistant-session-v1",
    isolation: "Four independent Chromium BrowserContexts, each with isolated IndexedDB state; no accepted user profile or database was opened",
    corruptRow: { id: corruptId, canonicalBytes: Buffer.byteLength(corruptCanonicalBefore), sha256Before: corruptShaBefore, sha256After: corruptShaAfter, exactCanonicalEquality: true },
    healthyRow: { id: healthyAfterReasoning.id, createdReasoning: "xhigh", finalReasoning: healthyAfterReasoning.reasoning },
    capacity: { rawRowCount: { readable: 49, unreadable: 1, total: 50, mutationRejected: true }, rawBytes: { unreadablePayloadChars: oversizedCorrupt.payload.length, limit: ASSISTANT_LIMITS.databaseBytes, mutationRejected: true } },
    assertions,
    assertionCount: assertions.length,
    screenshots,
    requestLedger: { deterministicAssistantRequests: requests.length, deterministicProviderCalls, realProviderCalls: 0, paidCalls: 0, liveSearchCalls: 0, externalRequests: 0, unrelatedApiRequests: 0 },
    errors,
    forbidden,
  };
  writeFileSync(resolve(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, assertions: result.assertionCount, corruptSha256: corruptShaAfter, realProviderCalls: 0, paidCalls: 0 }));
} finally {
  await browser.close();
}
