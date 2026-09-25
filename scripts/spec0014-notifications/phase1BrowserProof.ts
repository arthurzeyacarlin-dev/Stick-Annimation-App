import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { runPhase1StorageProof } from "./phase1StorageProof.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const outputRoot = resolve(repositoryRoot, "output/spec0014/phase1");
const fixtureRoot = "/private/tmp/spec0014-phase1-fixture-host";
const profileRoot = "/private/tmp/spec0014-phase1-chromium-profile";
const fixturePort = 58421;
const baseUrl = `http://127.0.0.1:${fixturePort}`;
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const nextBinary = resolve(repositoryRoot, "node_modules/next/dist/bin/next");
const axeSource = readFileSync(resolve(repositoryRoot, "node_modules/axe-core/axe.min.js"), "utf8");

const implementationPaths = [
  "app/layout.tsx",
  "src/lib/notifications/notificationContracts.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/notifications/notificationCenter.module.css",
  "src/components/chrome/AIcreditspage.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/diamondAssistant.module.css",
  "scripts/fixtures/spec0014-notifications/phase-1/contract.json",
  "scripts/spec0014-notifications/phase1Oracle.ts",
  "scripts/spec0014-notifications/phase1StorageProof.ts",
  "scripts/spec0014-notifications/phase1BrowserProof.ts",
  "scripts/spec0014-notifications/phase1ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase1BuildProof.ts",
  "scripts/spec0014-notifications/recordPhase1Proof.ts",
  "scripts/spec0014-notifications/validatePhase1Proof.ts",
  "scripts/spec0014-notifications/phase1ReviewSetup.ts",
] as const;

const routeSource = `"use client";
import { useEffect } from "react";
import { digest, sealSession } from "@/src/lib/assistant/assistantContracts";
import { stableJson } from "@/src/lib/assistant/assistantContracts";
import { NotificationTrigger } from "@/src/components/notifications/NotificationTrigger";
import {
  DIAMOND_NOTIFICATION_DATABASE_V1,
  DIAMOND_NOTIFICATION_STORES_V1,
  __closeNotificationStorageForProofV1,
  __setNotificationBeforeCommitHookForProofV1,
  __setNotificationLockModeForProofV1,
  getValidatedNotificationSnapshotV1,
  markAllNotificationsReadV1,
  markNotificationReadV1,
  publishValidatedNotificationTerminalV1,
  retryNotificationRecoveryV1,
} from "@/src/lib/notifications/notificationStorage";
import {
  confirmNotificationTargetArrivalV1,
  hasVisibleExactNotificationOriginV1,
  registerNotificationNavigationHandlerV1,
  registerNotificationOriginSurfaceV1,
  registerNotificationTargetSurfaceV1,
} from "@/src/lib/notifications/notificationNavigation";

const FIXED_TIME = 1_780_100_000_000;
const handles: Array<{ unregister(): void }> = [];
const targetHandles: Array<ReturnType<typeof registerNotificationTargetSurfaceV1>> = [];
const destinationHandles: Array<{ unregister(): void }> = [];
const requestResult = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error); });
const deleteDatabase = () => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DIAMOND_NOTIFICATION_DATABASE_V1); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("delete-blocked")); });
const openRaw = () => new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(DIAMOND_NOTIFICATION_DATABASE_V1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const offlineTime = (id: string) => FIXED_TIME + Array.from(id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
const publishOffline = (id: string) => { const detectedAt = offlineTime(id); return publishValidatedNotificationTerminalV1({ schema: "offline-notification-terminal/v1", offlineIncidentId: id, offlineSince: detectedAt - 1, detectedAt, source: "browser-offline-event", onlineBefore: true, onlineAfter: false }); };

async function assistantReceipt(id: string, outcome: "done" | "failed" | "interrupted" = "done") {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "_");
  const occurredAt = FIXED_TIME + Array.from(safe).reduce((sum, character) => sum + character.charCodeAt(0), 20_000);
  const turnId = "turn_" + safe + "_0001";
  const jobId = "job_" + safe + "_00001";
  const sessionId = "session_" + safe + "_0001";
  const turn = { id: turnId, jobId, status: outcome, reasoning: "low" as const, at: occurredAt - 500, acceptedAt: occurredAt - 400, endedAt: occurredAt, contextIds: [], error: outcome === "done" ? null : outcome === "interrupted" ? "The server interrupted this reply." : "The reply failed.", usage: outcome === "done" ? { inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: .00014, priceDate: "2026-09-22" as const, responseId: "response_" + safe, latencyMs: 200, model: "gpt-5.6-terra" as const, reasoning: "low" as const, toolCalls: 0 } : null };
  const messages: Array<Record<string, unknown>> = [{ id: "message_" + safe + "_user", turnId, role: "user", text: "How do I animate this?", at: occurredAt - 500 }];
  if (outcome === "done") messages.push({ id: "message_" + safe + "_answer", turnId, role: "assistant", text: "Use clear key poses.", at: occurredAt });
  const session = await sealSession({ schema: "diamond-assistant-session/v1", id: sessionId, title: "Animation help", titleSource: "automatic", manualTitleRevision: 0, createdAt: occurredAt - 1_000, updatedAt: occurredAt, reasoning: "low", revision: 1, digest: "a".repeat(64), messages, turns: [turn] } as Parameters<typeof sealSession>[0]);
  return { schema: "assistant-notification-terminal/v1" as const, session, sessionId, turnId, jobId, outcome, occurredAt };
}

async function rawStats() {
  const database = await openRaw();
  const transaction = database.transaction([DIAMOND_NOTIFICATION_STORES_V1.notifications, DIAMOND_NOTIFICATION_STORES_V1.metadata], "readonly");
  const rows = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.notifications).getAll());
  const metadata = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.metadata).get("state")) as { revision?: number } | undefined;
  await transactionDone(transaction); database.close();
  return { count: rows.length, bytes: new TextEncoder().encode(stableJson(rows)).byteLength, revision: metadata?.revision ?? 0 };
}
async function putRaw(storeName: string, value: unknown) {
  const database = await openRaw(); const transaction = database.transaction(storeName, "readwrite"); transaction.objectStore(storeName).put(value); await transactionDone(transaction); database.close();
}
async function reset() {
  handles.splice(0).forEach(handle => handle.unregister()); targetHandles.splice(0).forEach(handle => handle.unregister()); destinationHandles.splice(0).forEach(handle => handle.unregister());
  __closeNotificationStorageForProofV1(); await new Promise(resolve => setTimeout(resolve, 0));
  const database = await openRaw();
  const transaction = database.transaction(Object.values(DIAMOND_NOTIFICATION_STORES_V1), "readwrite");
  for (const store of Object.values(DIAMOND_NOTIFICATION_STORES_V1)) transaction.objectStore(store).clear();
  await transactionDone(transaction); database.close();
  await retryNotificationRecoveryV1(); setScenario("visible");
}
function elements() {
  const surface = document.getElementById("origin-surface") as HTMLElement;
  let region = document.getElementById("terminal-region") as HTMLElement | null;
  if (!region) {
    region = document.createElement("div");
    region.id = "terminal-region";
    region.textContent = "Terminal region";
    surface.appendChild(region);
  }
  return { surface, region, hiddenWrapper: document.getElementById("hidden-export-wrapper") as HTMLElement };
}
function setScenario(scenario: string) {
  const { surface, region, hiddenWrapper } = elements();
  hiddenWrapper.style.display = "contents"; surface.style.cssText = "display:block;padding:12px"; region.style.cssText = "display:block;width:120px;height:24px"; surface.hidden = false; surface.removeAttribute("inert"); surface.removeAttribute("aria-hidden");
  if (!surface.contains(region)) surface.appendChild(region);
  if (scenario === "display-none") surface.style.display = "none";
  if (scenario === "aria-hidden") surface.setAttribute("aria-hidden", "true");
  if (scenario === "inert") surface.setAttribute("inert", "");
  if (scenario === "visibility-hidden") surface.style.visibility = "hidden";
  if (scenario === "transparent") surface.style.opacity = "0";
  if (scenario === "display-contents") surface.style.display = "contents";
  if (scenario === "hidden-behind-export") hiddenWrapper.style.display = "none";
  if (scenario === "disconnected") region.remove();
}
async function injectExactRawBytes(target: number) {
  const base = [{ recordKey: "corrupt_exact_bytes", envelope: { padding: "" } }];
  const overhead = new TextEncoder().encode(stableJson(base)).byteLength;
  if (target < overhead) throw new Error("target-too-small");
  await putRaw(DIAMOND_NOTIFICATION_STORES_V1.notifications, { recordKey: "corrupt_exact_bytes", envelope: { padding: "x".repeat(target - overhead) } });
  return rawStats();
}
async function createHigherVersion() {
  __closeNotificationStorageForProofV1();
  await new Promise<void>((resolve, reject) => { const request = indexedDB.open(DIAMOND_NOTIFICATION_DATABASE_V1, 2); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
}
async function observeBlockedUpgrade() {
  __closeNotificationStorageForProofV1();
  const heldDatabase = await openRaw();
  return new Promise<boolean>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DIAMOND_NOTIFICATION_DATABASE_V1, 2);
    request.onblocked = () => { blocked = true; heldDatabase.close(); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(blocked); };
  });
}
async function recoverFromHigherVersion() { __closeNotificationStorageForProofV1(); await deleteDatabase(); return retryNotificationRecoveryV1(); }

export default function NotificationProofPage() {
  useEffect(() => {
    const api = {
      reset,
      publishOffline,
      async publishAssistant(id: string, outcome: "done" | "failed" | "interrupted" = "done") { return publishValidatedNotificationTerminalV1(await assistantReceipt(id, outcome)); },
      assistantIdentity(id: string) { const safe = id.replace(/[^A-Za-z0-9_-]/g, "_"); return { kind: "assistant" as const, sessionId: "session_" + safe + "_0001", turnId: "turn_" + safe + "_0001", jobId: "job_" + safe + "_00001" }; },
      assistantTarget(id: string) { const identity = api.assistantIdentity(id); return { kind: "assistant-turn" as const, sessionId: identity.sessionId, turnId: identity.turnId, jobId: identity.jobId }; },
      snapshot: getValidatedNotificationSnapshotV1,
      rawStats,
      mark: markNotificationReadV1,
      markAll: markAllNotificationsReadV1,
      setLockMode: __setNotificationLockModeForProofV1,
      async injectCorrupt(key: string, padding: number) { await putRaw(DIAMOND_NOTIFICATION_STORES_V1.notifications, { recordKey: key, envelope: { padding: "x".repeat(padding) } }); },
      injectExactRawBytes,
      async corruptExists(key: string) { const database = await openRaw(); const transaction = database.transaction(DIAMOND_NOTIFICATION_STORES_V1.notifications, "readonly"); const value = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.notifications).get(key)); await transactionDone(transaction); database.close(); return value !== undefined; },
      async injectLease(owner: string, expiresAt: number) { await putRaw(DIAMOND_NOTIFICATION_STORES_V1.leases, { key: "writer", owner, expiresAt }); },
      createHigherVersion,
      observeBlockedUpgrade,
      recoverFromHigherVersion,
      setScenario,
      visible(origin: unknown) { return hasVisibleExactNotificationOriginV1(origin as Parameters<typeof hasVisibleExactNotificationOriginV1>[0]); },
      registerOrigin(origin: unknown) { const { surface, region } = elements(); const handle = registerNotificationOriginSurfaceV1({ origin: origin as Parameters<typeof registerNotificationOriginSurfaceV1>[0]["origin"], surfaceElement: surface, terminalRegionElement: region }); handles.push(handle); return handles.length - 1; },
      registerTarget(target: unknown) { const { surface, region } = elements(); const handle = registerNotificationTargetSurfaceV1({ target: target as Parameters<typeof registerNotificationTargetSurfaceV1>[0]["target"], surfaceElement: surface, targetRegionElement: region }); targetHandles.push(handle); return targetHandles.length - 1; },
      confirmTarget(index: number) { return confirmNotificationTargetArrivalV1(targetHandles[index]); },
      registerDestination(target: unknown, result: "handled" | "blocked-unsaved") { const handle = registerNotificationNavigationHandlerV1({ target: target as Parameters<typeof registerNotificationNavigationHandlerV1>[0]["target"], handler: () => { if (result === "handled") document.getElementById("destination-focus")?.focus(); return result; } }); destinationHandles.push(handle); },
      hideBeforeCommit() { __setNotificationBeforeCommitHookForProofV1(async () => { setScenario("display-none"); }); },
      holdBeforeCommit(milliseconds: number) { __setNotificationBeforeCommitHookForProofV1(() => new Promise(resolve => setTimeout(resolve, milliseconds))); },
      async casRaceNextCommit() { __setNotificationBeforeCommitHookForProofV1(async () => { const database = await openRaw(); const transaction = database.transaction(DIAMOND_NOTIFICATION_STORES_V1.metadata, "readwrite"); const store = transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.metadata); const current = await requestResult(store.get("state")) as { revision?: number } | undefined; store.put({ key: "state", revision: (current?.revision ?? 0) + 1 }); await transactionDone(transaction); database.close(); }); },
      async rawRow(key: string) { const database = await openRaw(); const transaction = database.transaction(DIAMOND_NOTIFICATION_STORES_V1.notifications, "readonly"); const value = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.notifications).get(key)); await transactionDone(transaction); database.close(); return value; },
    };
    (window as unknown as { spec0014: typeof api }).spec0014 = api;
    document.documentElement.dataset.spec0014Ready = "true";
    return () => { delete document.documentElement.dataset.spec0014Ready; };
  }, []);
  return <main style={{ minHeight: "100vh", padding: 24, background: "#08111b", color: "white" }}>
    <h1>SPEC-0014 isolated proof</h1>
    <section aria-label="Home fixture bell" style={{ display: "flex", justifyContent: "flex-end" }}><NotificationTrigger view="home" /></section>
    <section aria-label="Assistant fixture bell" style={{ display: "flex", justifyContent: "flex-end" }}><NotificationTrigger view="assistant" /></section>
    <div id="hidden-export-wrapper" style={{ display: "contents" }}><section id="origin-surface" style={{ padding: 12 }}><div id="terminal-region" style={{ width: 120, height: 24 }}>Terminal region</div></section></div>
    <button id="destination-focus" type="button">Destination focus</button>
  </main>;
}
`;

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const wait = (milliseconds: number) => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
const waitForHttp = async (url: string, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; lastError = new Error(`HTTP ${response.status}`); }
    catch (error) { lastError = error; }
    await wait(250);
  }
  throw lastError ?? new Error("server-not-ready");
};

let server: ChildProcess | null = null;
let serverLogFd: number | null = null;
const startServer = async (label: string) => {
  if (server) throw new Error("fixture-server-already-running");
  const logPath = resolve(outputRoot, `${label}-server.log`);
  serverLogFd = openSync(logPath, "w");
  server = spawn(process.execPath, [nextBinary, "dev", "--webpack", "-p", String(fixturePort)], { cwd: fixtureRoot, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", serverLogFd, serverLogFd] });
  await waitForHttp(baseUrl);
  return { pid: server.pid, logPath };
};
const stopServer = async () => {
  const active = server;
  server = null;
  if (active && active.exitCode === null) {
    active.kill("SIGTERM");
    await Promise.race([new Promise<void>(resolvePromise => active.once("exit", () => resolvePromise())), wait(10_000)]);
    if (active.exitCode === null) active.kill("SIGKILL");
  }
  if (serverLogFd !== null) { closeSync(serverLogFd); serverLogFd = null; }
  let closed = false;
  for (let index = 0; index < 40; index += 1) {
    try { await fetch(baseUrl); await wait(100); }
    catch { closed = true; break; }
  }
  if (!closed) throw new Error("fixture-server-port-remained-open");
};

const launchContext = () => chromium.launchPersistentContext(profileRoot, {
  executablePath: chromeExecutable,
  headless: true,
  viewport: { width: 1440, height: 1000 },
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});

type BrowserRequestEntry = { method: string; url: string; allowed: boolean; provider: boolean };
async function installNetworkGuard(context: BrowserContext, ledger: BrowserRequestEntry[]) {
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const allowed = (url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.port === String(fixturePort);
    const entry = { method: request.method(), url: request.url(), allowed, provider: url.pathname.startsWith("/api/") };
    ledger.push(entry);
    if (allowed) await route.continue(); else await route.abort("blockedbyclient");
  });
}

const triggerCount = (page: Page) => page.locator("[data-notification-trigger]").count();
const waitForProofApi = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.spec0014Ready === "true");

async function productionSurfaceProof(context: BrowserContext) {
  const page = await context.newPage();
  const results: Record<string, number> = {};
  const screenshots: string[] = [];
  const accessibility: Record<string, unknown>[] = [];
  await page.goto(baseUrl); await page.getByRole("button", { name: "New Project" }).waitFor();
  results.home = await triggerCount(page);
  const homeTrigger = page.locator('[data-notification-trigger="home"]');
  await homeTrigger.click(); await page.getByText("No notifications yet.", { exact: true }).waitFor();
  const homeDesktopBox = await page.locator('[data-notification-panel="home"]').boundingBox();
  assert.ok(homeDesktopBox && homeDesktopBox.width > 250 && homeDesktopBox.height > 100, "production Home desktop empty panel is anchored and visible");
  const homeDesktopAxe = await axeSeriousCritical(page); assert.deepEqual(homeDesktopAxe, []); accessibility.push({ surface: "production-home-desktop-empty", violations: homeDesktopAxe });
  await page.screenshot({ path: resolve(outputRoot, "production-home-empty-desktop.png") }); screenshots.push("production-home-empty-desktop.png");
  await page.getByRole("button", { name: "Close notifications" }).click(); await page.waitForFunction(() => document.activeElement === document.querySelector('[data-notification-trigger="home"]'));
  await page.setViewportSize({ width: 390, height: 740 }); await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-haspopup") === "dialog");
  const homeCompactTrigger = await homeTrigger.evaluate(element => { const rect = element.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; const hit = document.elementFromPoint(centerX, centerY); return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }, inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, centerHit: hit === element || element.contains(hit) }; });
  assert.ok(homeCompactTrigger.inViewport && homeCompactTrigger.centerHit && homeCompactTrigger.rect.width >= 42 && homeCompactTrigger.rect.height >= 42, `closed compact Home trigger must be fully visible and center-hit clickable: ${JSON.stringify(homeCompactTrigger)}`);
  await homeTrigger.click();
  const homeCompactBackdrop = await page.locator('[data-notification-backdrop="true"]').boundingBox(); assert.ok(homeCompactBackdrop && homeCompactBackdrop.x <= 1 && homeCompactBackdrop.y <= 1 && homeCompactBackdrop.x + homeCompactBackdrop.width >= 389 && homeCompactBackdrop.y + homeCompactBackdrop.height >= 739, `production Home compact empty sheet covers the viewport: ${JSON.stringify(homeCompactBackdrop)}`);
  assert.equal(await page.locator('[data-notification-panel="home"]').getAttribute("aria-modal"), "true"); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(outputRoot, "production-home-empty-compact.png") }); screenshots.push("production-home-empty-compact.png");
  await page.keyboard.press("Escape"); await page.waitForFunction(() => document.activeElement === document.querySelector('[data-notification-trigger="home"]')); await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${baseUrl}/assistant`); await page.locator("[data-assistant-screen]").waitFor(); results.assistant = await triggerCount(page);
  const assistantTrigger = page.locator('[data-notification-trigger="assistant"]');
  await assistantTrigger.click(); await page.getByText("No notifications yet.", { exact: true }).waitFor();
  const assistantDesktopBox = await page.locator('[data-notification-panel="assistant"]').boundingBox(); assert.ok(assistantDesktopBox && assistantDesktopBox.width > 250 && assistantDesktopBox.height > 100, "production Assistant desktop empty panel is anchored and visible");
  const assistantDesktopAxe = await axeSeriousCritical(page); assert.deepEqual(assistantDesktopAxe, []); accessibility.push({ surface: "production-assistant-desktop-empty", violations: assistantDesktopAxe });
  await page.screenshot({ path: resolve(outputRoot, "production-assistant-empty-desktop.png") }); screenshots.push("production-assistant-empty-desktop.png");
  await page.getByRole("button", { name: "Close notifications" }).click(); await page.waitForFunction(() => document.activeElement === document.querySelector('[data-notification-trigger="assistant"]'));
  await page.setViewportSize({ width: 390, height: 740 }); await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-haspopup") === "dialog"); await assistantTrigger.click();
  const assistantCompactBackdrop = await page.locator('[data-notification-backdrop="true"]').boundingBox(); assert.ok(assistantCompactBackdrop && assistantCompactBackdrop.x <= 1 && assistantCompactBackdrop.y <= 1 && assistantCompactBackdrop.x + assistantCompactBackdrop.width >= 389 && assistantCompactBackdrop.y + assistantCompactBackdrop.height >= 739, `production Assistant compact empty sheet covers the viewport: ${JSON.stringify(assistantCompactBackdrop)}`);
  assert.equal(await page.locator('[data-notification-panel="assistant"]').getAttribute("aria-modal"), "true"); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(outputRoot, "production-assistant-empty-compact.png") }); screenshots.push("production-assistant-empty-compact.png");
  await page.keyboard.press("Escape"); await page.waitForFunction(() => document.activeElement === document.querySelector('[data-notification-trigger="assistant"]')); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/credits`); await page.getByRole("link", { name: "Return to main screen" }).waitFor(); results.credits = await triggerCount(page);
  for (const [name, label] of [["tutorials", "Tutorials"], ["openProject", "Open Project"], ["myProjects", "My Projects"], ["export", "Export"]] as const) {
    await page.goto(baseUrl); await page.getByRole("button", { name: new RegExp(`^${label}`) }).click(); await wait(300); results[name] = await triggerCount(page);
  }
  await page.goto(baseUrl); await page.getByRole("button", { name: /^New Project/ }).click(); await page.locator('[data-unified-workspace-area="true"]').waitFor({ timeout: 30_000 }); results.workspace = await triggerCount(page);
  assert.deepEqual(results, { home: 1, assistant: 1, credits: 0, tutorials: 0, openProject: 0, myProjects: 0, export: 0, workspace: 0 });
  await page.goto(baseUrl); await page.locator('[data-notification-trigger="home"]').click(); await page.getByText("No notifications yet.", { exact: true }).waitFor(); await page.getByRole("button", { name: /^Tutorials/ }).click(); await page.locator("[data-tutorials-screen]").waitFor(); assert.equal(await page.locator("[data-notification-panel], [data-notification-trigger]").count(), 0, "leaving Home unmounts the open panel and its trigger with no orphan");
  await page.close();
  return { triggerCounts: results, screenshots, accessibility, homeDesktopBox, homeCompactTrigger, homeCompactBackdrop, assistantDesktopBox, assistantCompactBackdrop, surfaceDepartureUnmounted: true };
}

async function axeSeriousCritical(page: Page) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: { run(context?: unknown, options?: unknown): Promise<{ violations: Array<{ impact: string | null; id: string }> }> };
    }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter(item => item.impact === "serious" || item.impact === "critical");
  });
}

async function uiAndVisibilityProof(page: Page) {
  let assertions = 0;
  const screenshots: string[] = [];
  const accessibility: Record<string, unknown>[] = [];
  const expect = (condition: unknown, message: string) => { assertions += 1; assert.ok(condition, message); };
  await page.goto(`${baseUrl}/spec0014-proof`); await waitForProofApi(page);
  await page.evaluate(() => (window as unknown as { spec0014: { reset(): Promise<void> } }).spec0014.reset());
  const homeTrigger = page.locator('[data-notification-trigger="home"]');
  const assistantTrigger = page.locator('[data-notification-trigger="assistant"]');
  await page.evaluate(() => (window as unknown as { spec0014: { publishOffline(id: string): Promise<unknown> } }).spec0014.publishOffline("ui_offline_0001"));
  expect((await homeTrigger.getAttribute("aria-label"))?.includes("1 unread"), "Home counts offline event");
  expect((await assistantTrigger.getAttribute("aria-label"))?.includes("0 unread"), "Assistant excludes offline event");
  expect(await homeTrigger.evaluate(element => element.className.includes("ringing")), "Home rings for eligible local commit");
  expect(!(await assistantTrigger.evaluate(element => element.className.includes("ringing"))), "Assistant does not ring for filtered event");
  await page.evaluate(() => (window as unknown as { spec0014: { publishAssistant(id: string): Promise<unknown> } }).spec0014.publishAssistant("ui_assistant_0001"));
  expect((await homeTrigger.getAttribute("aria-label"))?.includes("2 unread"), "Home counts every active event");
  expect((await assistantTrigger.getAttribute("aria-label"))?.includes("1 unread"), "Assistant counts only Assistant events");
  expect((await page.locator('[aria-label="Assistant fixture bell"] [data-notification-announcement]').textContent())?.includes("AI Assistant replied"), "Assistant announces its mounted local commit");
  await assistantTrigger.click();
  expect(await page.locator('[data-notification-panel="assistant"] li').count() === 1, "Assistant panel filters out non-Assistant rows");
  const populatedAssistantAxe = await axeSeriousCritical(page); expect(populatedAssistantAxe.length === 0, "populated Assistant panel has zero serious/critical Axe findings"); accessibility.push({ surface: "fixture-assistant-populated-desktop", violations: populatedAssistantAxe });
  await page.screenshot({ path: resolve(outputRoot, "fixture-assistant-populated-desktop.png") }); screenshots.push("fixture-assistant-populated-desktop.png");
  const assistantBeforeOpen = await assistantTrigger.getAttribute("aria-label");
  expect(assistantBeforeOpen?.includes("1 unread"), "opening the panel marks nothing read");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("0 unread"));
  expect((await assistantTrigger.getAttribute("aria-label"))?.includes("0 unread"), "Assistant Mark-all clears its view");
  expect((await homeTrigger.getAttribute("aria-label"))?.includes("1 unread"), "Assistant Mark-all leaves Home-only rows unread");
  await page.getByRole("button", { name: "Close notifications" }).click();
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-notification-trigger="assistant"]'));
  expect(await assistantTrigger.evaluate(element => document.activeElement === element), "Close restores trigger focus");

  await page.evaluate(async () => { const api = (window as unknown as { spec0014: { publishAssistant(id: string): Promise<unknown>; assistantTarget(id: string): unknown; registerDestination(target: unknown, result: "blocked-unsaved"): void } }).spec0014; await api.publishAssistant("ui_blocked_0002"); api.registerDestination(api.assistantTarget("ui_blocked_0002"), "blocked-unsaved"); });
  await assistantTrigger.click();
  await page.getByRole("button", { name: /AI Assistant replied/ }).first().click();
  await page.getByText("Finish or discard the unsaved work", { exact: false }).waitFor();
  expect(await page.getByText("Finish or discard the unsaved work", { exact: false }).isVisible(), "blocked-unsaved navigation remains local and explained");
  expect(await page.locator('[data-notification-panel="assistant"]').isVisible(), "blocked-unsaved navigation keeps the panel open");
  await page.getByRole("button", { name: "Close notifications" }).click();

  await page.evaluate(async () => { const api = (window as unknown as { spec0014: { publishAssistant(id: string): Promise<unknown>; assistantTarget(id: string): unknown; registerDestination(target: unknown, result: "handled"): void } }).spec0014; await api.publishAssistant("ui_handled_0003"); api.registerDestination(api.assistantTarget("ui_handled_0003"), "handled"); });
  await assistantTrigger.click();
  await page.getByRole("button", { name: /AI Assistant replied/ }).first().click();
  await page.locator('[data-notification-panel="assistant"]').waitFor({ state: "detached" });
  expect(await page.locator('[data-notification-panel="assistant"]').count() === 0, "handled exact destination closes the panel");
  expect(await page.locator("#destination-focus").evaluate(element => document.activeElement === element), "handled destination owns final focus");

  await page.setViewportSize({ width: 390, height: 740 }); await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-haspopup") === "dialog"); await assistantTrigger.click();
  const backdrop = await page.locator('[data-notification-backdrop="true"]').boundingBox();
  expect(Boolean(backdrop && backdrop.width >= 389 && backdrop.height >= 739), "compact modal backdrop covers the viewport despite header ownership");
  expect(await page.locator('[data-notification-panel="assistant"]').getAttribute("aria-modal") === "true", "compact sheet is modal");
  await page.screenshot({ path: resolve(outputRoot, "fixture-assistant-populated-compact.png") }); screenshots.push("fixture-assistant-populated-compact.png");
  await page.keyboard.press("Escape"); await page.waitForFunction(() => document.activeElement === document.querySelector('[data-notification-trigger="assistant"]')); expect(await assistantTrigger.evaluate(element => document.activeElement === element), "Escape restores trigger focus");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (window as unknown as { spec0014: { publishOffline(id: string): Promise<unknown> } }).spec0014.publishOffline("ui_reduced_motion"));
  expect(await homeTrigger.locator("svg").evaluate(element => getComputedStyle(element).animationName === "none"), "reduced motion disables ringing animation");
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" }); await homeTrigger.click();
  const forcedBackground = await page.locator('[data-notification-panel="home"]').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(forcedBackground !== "rgba(0, 0, 0, 0)", "forced-colors panel has an opaque Canvas background");
  await page.keyboard.press("Escape"); await page.emulateMedia({ forcedColors: "none" });

  const assistantOrigin = await page.evaluate(() => (window as unknown as { spec0014: { assistantIdentity(id: string): unknown } }).spec0014.assistantIdentity("visible_origin_0001"));
  const assistantTarget = await page.evaluate(() => (window as unknown as { spec0014: { assistantTarget(id: string): unknown } }).spec0014.assistantTarget("arrival_target_0001"));
  await page.evaluate(origin => { const api = (window as unknown as { spec0014: { setScenario(value: string): void; registerOrigin(origin: unknown): number } }).spec0014; api.setScenario("visible"); api.registerOrigin(origin); }, assistantOrigin);
  const visibleRead = await page.evaluate(() => (window as unknown as { spec0014: { publishAssistant(id: string): Promise<{ notification: { readAt: number | null; createdAt: number } }> } }).spec0014.publishAssistant("visible_origin_0001"));
  expect(visibleRead.notification.readAt === visibleRead.notification.createdAt, "fully visible exact origin starts read");
  const mismatch = await page.evaluate(() => (window as unknown as { spec0014: { publishAssistant(id: string): Promise<{ notification: { readAt: number | null } }> } }).spec0014.publishAssistant("wrong_chat_0002"));
  expect(mismatch.notification.readAt === null, "another Assistant chat starts unread");
  for (const scenario of ["display-none", "aria-hidden", "inert", "visibility-hidden", "transparent", "hidden-behind-export", "disconnected"]) {
    const visible = await page.evaluate(({ origin, scenario }) => { const api = (window as unknown as { spec0014: { setScenario(value: string): void; visible(origin: unknown): boolean } }).spec0014; api.setScenario(scenario); return api.visible(origin); }, { origin: assistantOrigin, scenario });
    expect(!visible, `${scenario} origin is not visible`);
  }
  const displayContents = await page.evaluate(origin => { const api = (window as unknown as { spec0014: { setScenario(value: string): void; registerOrigin(origin: unknown): number; visible(origin: unknown): boolean } }).spec0014; api.setScenario("display-contents"); api.registerOrigin(origin); return api.visible(origin); }, assistantOrigin);
  expect(displayContents, "display:contents ancestor remains eligible when terminal region renders");
  const terraExact = { kind: "workspace-terra", workspaceIdentity: "workspace_visibility_0001", projectId: "project_visibility_0001", projectGeneration: 3, jobId: "terra_visibility_job_0001", projectTitle: "Same Name" };
  const terraWrong = { ...terraExact, projectId: "project_visibility_0002" };
  const exportExact = { kind: "export", exportJobId: "export_visibility_job_0001", projectId: "project_export_visibility", projectRevision: 2, projectDigest: "b".repeat(64), projectTitle: "Same Name", filename: "Proof.mp4", receiptId: "receipt_visibility_0001" };
  await page.evaluate(({ terraExact, exportExact }) => { const api = (window as unknown as { spec0014: { setScenario(value: string): void; registerOrigin(origin: unknown): number } }).spec0014; api.setScenario("visible"); api.registerOrigin(terraExact); api.registerOrigin(exportExact); }, { terraExact, exportExact });
  expect(await page.evaluate(origin => (window as unknown as { spec0014: { visible(origin: unknown): boolean } }).spec0014.visible(origin), terraExact), "exact Terra identity matches its registered surface");
  expect(!(await page.evaluate(origin => (window as unknown as { spec0014: { visible(origin: unknown): boolean } }).spec0014.visible(origin), terraWrong)), "similarly named Terra project with a different ID does not match");
  expect(await page.evaluate(origin => (window as unknown as { spec0014: { visible(origin: unknown): boolean } }).spec0014.visible(origin), exportExact), "exact Export identity matches every registered field");

  await page.evaluate(async target => { const api = (window as unknown as { spec0014: { setScenario(value: string): void; publishAssistant(id: string): Promise<unknown>; registerTarget(target: unknown): number } }).spec0014; api.setScenario("visible"); await api.publishAssistant("arrival_target_0001"); api.registerTarget(target); }, assistantTarget);
  const arrival = await page.evaluate(() => (window as unknown as { spec0014: { confirmTarget(index: number): Promise<{ markedRead: number; matched: boolean }> } }).spec0014.confirmTarget(0));
  expect(arrival.matched && arrival.markedRead === 1, "fully visible exact target arrival marks the matching row read");
  await page.evaluate(async () => { const api = (window as unknown as { spec0014: { publishAssistant(id: string): Promise<unknown>; assistantTarget(id: string): unknown; registerTarget(target: unknown): number; hideBeforeCommit(): void } }).spec0014; await api.publishAssistant("arrival_race_0002"); api.registerTarget(api.assistantTarget("arrival_race_0002")); api.hideBeforeCommit(); });
  const racedArrival = await page.evaluate(() => (window as unknown as { spec0014: { confirmTarget(index: number): Promise<{ markedRead: number }> } }).spec0014.confirmTarget(1));
  expect(racedArrival.markedRead === 0, "target hidden during storage preparation is rechecked at atomic commit");
  await page.evaluate(async () => { const api = (window as unknown as { spec0014: { setScenario(value: string): void; assistantIdentity(id: string): unknown; registerOrigin(origin: unknown): number; hideBeforeCommit(): void } }).spec0014; api.setScenario("visible"); api.registerOrigin(api.assistantIdentity("origin_race_0003")); api.hideBeforeCommit(); });
  const racedOrigin = await page.evaluate(() => (window as unknown as { spec0014: { publishAssistant(id: string): Promise<{ notification: { readAt: number | null } }> } }).spec0014.publishAssistant("origin_race_0003"));
  expect(racedOrigin.notification.readAt === null, "origin hidden during storage preparation is rechecked at atomic commit");

  await page.evaluate(async () => { const api = (window as unknown as { spec0014: { reset(): Promise<void>; publishOffline(id: string): Promise<unknown>; casRaceNextCommit(): Promise<void> } }).spec0014; await api.reset(); await api.publishOffline("cas_base_0001"); await api.casRaceNextCommit(); });
  const cas = await page.evaluate(async () => { const api = (window as unknown as { spec0014: { publishOffline(id: string): Promise<unknown>; rawStats(): Promise<{ count: number }> } }).spec0014; let error = ""; try { await api.publishOffline("cas_race_0002"); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); } return { error, raw: await api.rawStats() }; });
  expect(cas.error.includes("compare-and-swap") && cas.raw.count === 1, "final CAS rejects an adversarial metadata change without writing a row");

  await homeTrigger.click();
  const populatedHomeAxe = await axeSeriousCritical(page); expect(populatedHomeAxe.length === 0, "populated Home panel has zero serious/critical Axe findings"); accessibility.push({ surface: "fixture-home-populated-desktop", violations: populatedHomeAxe });
  await page.screenshot({ path: resolve(outputRoot, "fixture-home-populated-desktop.png") }); screenshots.push("fixture-home-populated-desktop.png");
  await page.keyboard.press("Escape");
  const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  const scale = await page.evaluate(() => visualViewport?.scale ?? 1); await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  expect(scale >= 1, "CDP page-scale command was exercised as supplemental emulation only");
  return { assertions, accessibility, screenshots, supplementalPageScale: scale, nativeBrowserZoom200: "UNPROVEN", nativeOsWindowFocus: "UNPROVEN" };
}

async function main() {
  mkdirSync(outputRoot, { recursive: true });
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(profileRoot, { recursive: true, force: true });
  mkdirSync(fixtureRoot, { recursive: true });
  for (const name of readdirSync(repositoryRoot)) {
    if ([".git", ".next", "node_modules", "output"].includes(name) || name.startsWith(".env")) continue;
    cpSync(resolve(repositoryRoot, name), resolve(fixtureRoot, name), { recursive: true });
  }
  symlinkSync(resolve(repositoryRoot, "node_modules"), resolve(fixtureRoot, "node_modules"), "dir");
  const sourceHashes: Record<string, string> = {};
  const networkLedger: BrowserRequestEntry[] = [];
  for (const relative of implementationPaths) {
    if (!existsSync(resolve(repositoryRoot, relative))) throw new Error(`missing-implementation-path:${relative}`);
    sourceHashes[relative] = sha256(resolve(repositoryRoot, relative));
    assert.equal(sha256(resolve(fixtureRoot, relative)), sourceHashes[relative], `fixture copy drift: ${relative}`);
  }

  await startServer("unmodified-production");
  let context = await launchContext();
  await installNetworkGuard(context, networkLedger);
  await context.addInitScript(() => { localStorage.setItem("da_welcome_never_show", "1"); localStorage.setItem("da_welcome_seen", "1"); });
  const productionUi = await productionSurfaceProof(context);
  const productionTriggers = productionUi.triggerCounts;
  await context.close(); await stopServer();

  const routePath = resolve(fixtureRoot, "app/spec0014-proof/page.tsx");
  mkdirSync(dirname(routePath), { recursive: true }); writeFileSync(routePath, routeSource);
  await startServer("fixture-proof");
  context = await launchContext();
  await installNetworkGuard(context, networkLedger);
  await context.addInitScript(() => { localStorage.setItem("da_welcome_never_show", "1"); localStorage.setItem("da_welcome_seen", "1"); });
  let page = await context.newPage();
  await page.goto(`${baseUrl}/spec0014-proof`); await waitForProofApi(page);
  const storage = await runPhase1StorageProof(page);
  const ui = await uiAndVisibilityProof(page);

  await page.evaluate(async () => { const api = (window as unknown as { spec0014: { reset(): Promise<void>; publishOffline(id: string): Promise<unknown> } }).spec0014; await api.reset(); await api.publishOffline("restart_persistent_0001"); });
  await page.reload(); await waitForProofApi(page);
  const reloadCount = await page.evaluate(() => (window as unknown as { spec0014: { snapshot(): Promise<{ rows: unknown[] }> } }).spec0014.snapshot()).then(value => value.rows.length);
  assert.equal(reloadCount, 1, "reload preserves IndexedDB notification");
  await context.close();
  context = await launchContext(); await installNetworkGuard(context, networkLedger); page = await context.newPage(); await page.goto(`${baseUrl}/spec0014-proof`); await waitForProofApi(page);
  const restartCount = await page.evaluate(() => (window as unknown as { spec0014: { snapshot(): Promise<{ rows: unknown[] }> } }).spec0014.snapshot()).then(value => value.rows.length);
  assert.equal(restartCount, 1, "full Chromium restart preserves notification in disposable profile");
  assert.equal(await page.locator("[data-notification-announcement]").allTextContents().then(values => values.join("")), "", "full restart does not replay an announcement");
  assert.equal(await page.locator("[data-notification-trigger]").evaluateAll(elements => elements.filter(element => element.className.includes("ringing")).length), 0, "full restart does not replay a ring");

  await context.addInitScript(() => { Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined }); });
  const secondPage = await context.newPage(); await secondPage.goto(`${baseUrl}/spec0014-proof`); await waitForProofApi(secondPage);
  const webLockStatuses = await Promise.all([
    page.evaluate(() => (window as unknown as { spec0014: { setLockMode(mode: "auto"): void; publishOffline(id: string): Promise<{ status: string }> } }).spec0014.setLockMode("auto")).then(() => page.evaluate(() => (window as unknown as { spec0014: { publishOffline(id: string): Promise<{ status: string }> } }).spec0014.publishOffline("two_tab_web_lock_0002"))),
    secondPage.evaluate(() => (window as unknown as { spec0014: { setLockMode(mode: "auto"): void; publishOffline(id: string): Promise<{ status: string }> } }).spec0014.setLockMode("auto")).then(() => secondPage.evaluate(() => (window as unknown as { spec0014: { publishOffline(id: string): Promise<{ status: string }> } }).spec0014.publishOffline("two_tab_web_lock_0002"))),
  ]).then(results => results.map(result => result.status).sort());
  assert.deepEqual(webLockStatuses, ["committed", "duplicate"], "two-tab Web Locks converge the same terminal on one row");

  await page.evaluate(() => { const api = (window as unknown as { spec0014: { setLockMode(mode: "lease"): void; holdBeforeCommit(milliseconds: number): void } }).spec0014; api.setLockMode("lease"); api.holdBeforeCommit(250); });
  await secondPage.evaluate(() => (window as unknown as { spec0014: { setLockMode(mode: "lease"): void } }).spec0014.setLockMode("lease"));
  const firstLeasePublish = page.evaluate(() => (window as unknown as { spec0014: { publishOffline(id: string): Promise<{ status: string }> } }).spec0014.publishOffline("two_tab_fallback_0003"));
  await wait(40);
  const contendedLeasePublish = await secondPage.evaluate(async () => { try { return { result: await (window as unknown as { spec0014: { publishOffline(id: string): Promise<{ status: string }> } }).spec0014.publishOffline("two_tab_fallback_0003"), error: "" }; } catch (error) { return { result: null, error: error instanceof Error ? error.message : String(error) }; } });
  const firstLeaseResult = await firstLeasePublish;
  assert.equal(firstLeaseResult.status, "committed", "the fallback lease owner commits the terminal");
  assert.match(contendedLeasePublish.error, /lease/, "the concurrent fallback writer cannot steal an active lease");
  const fallbackRetry = await secondPage.evaluate(() => (window as unknown as { spec0014: { publishOffline(id: string): Promise<{ status: string }> } }).spec0014.publishOffline("two_tab_fallback_0003"));
  assert.equal(fallbackRetry.status, "duplicate", "the contended fallback writer retries to deterministic duplicate convergence");

  const secondSnapshot = await secondPage.evaluate(() => (window as unknown as { spec0014: { snapshot(): Promise<{ rows: Array<{ notificationId: string; source: { attemptId: string }; readAt: number | null }> }> } }).spec0014.snapshot());
  const markId = secondSnapshot.rows.find(row => row.source.attemptId === "two_tab_web_lock_0002")?.notificationId;
  assert.ok(markId, "two-tab Web Lock terminal is present");
  await secondPage.evaluate(id => (window as unknown as { spec0014: { mark(id: string): Promise<number> } }).spec0014.mark(id), markId);
  const propagatedRead = await page.evaluate(async id => { const api = (window as unknown as { spec0014: { snapshot(): Promise<{ rows: Array<{ notificationId: string; readAt: number | null }> }> } }).spec0014; const snapshot = await api.snapshot(); return snapshot.rows.find(row => row.notificationId === id)?.readAt ?? null; }, markId);
  assert.ok(propagatedRead !== null, "mark-read propagates by authoritative reread even when BroadcastChannel is absent in one tab");
  const twoTabCount = secondSnapshot.rows.length;
  assert.equal(twoTabCount, 3, "both tabs converge on exactly one row per terminal");
  for (const observedPage of [page, secondPage]) {
    await observedPage.reload(); await waitForProofApi(observedPage);
    assert.equal(await observedPage.locator("[data-notification-announcement]").allTextContents().then(values => values.join("")), "", "reload in either tab does not replay a historical announcement");
    assert.equal(await observedPage.locator("[data-notification-trigger]").evaluateAll(elements => elements.filter(element => element.className.includes("ringing")).length), 0, "reload in either tab does not replay a historical ring");
  }

  await context.close(); await stopServer();
  rmSync(resolve(fixtureRoot, "app/spec0014-proof"), { recursive: true, force: true });
  const proof = {
    schema: "spec0014-phase1-browser-proof/v1",
    status: "PASS",
    fixture: { sourceHashes, implementationPathCount: implementationPaths.length, credentialsCopied: false, routeRemoved: !existsSync(routePath), serverClosed: true, port: fixturePort },
    productionTriggers,
    productionUi,
    storage,
    ui,
    persistence: { reloadCount, restartCount, twoTabCount, webLockStatuses, fallbackContention: contendedLeasePublish.error, fallbackRetry: fallbackRetry.status, markReadPropagated: propagatedRead !== null, broadcastChannelDisabledInSecondTab: true },
    providerRequests: networkLedger.filter(entry => entry.provider).length,
    networkRequests: { total: networkLedger.length, external: networkLedger.filter(entry => !entry.allowed).length, ledger: networkLedger },
    limitations: { nativeBrowserZoom200: "UNPROVEN", nativeOsWindowFocus: "UNPROVEN", physicalDeviceAndNonChromium: "UNPROVEN" },
  };
  writeFileSync(resolve(outputRoot, "browser-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  writeFileSync(resolve(outputRoot, "storage-proof.json"), `${JSON.stringify(storage, null, 2)}\n`);
  assert.equal(networkLedger.filter(entry => entry.provider).length, 0, "browser proof makes no provider/API requests");
  assert.equal(networkLedger.filter(entry => !entry.allowed).length, 0, "browser proof makes no external requests");
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(profileRoot, { recursive: true, force: true });
  process.stdout.write(`SPEC-0014 Phase 1 browser proof PASS (${storage.assertions + ui.assertions} assertions)\n`);
}

try { await main(); }
finally {
  if (server) await stopServer().catch(() => undefined);
}
