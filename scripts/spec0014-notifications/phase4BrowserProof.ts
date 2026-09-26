import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page, type Route } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:58480/";
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
const origin = new URL(url).origin;
const outputRoot = resolve("output/spec0014/phase4/browser");
mkdirSync(outputRoot, { recursive: true });
const receipts: string[] = [];
const screenshots: string[] = [];
const errors: string[] = [];
const externalRequests: string[] = [];
let providerRequests = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); receipts.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); receipts.push(label); };
const screenshot = async (page: Page, name: string) => { const path = resolve(outputRoot, `${name}.png`); await page.screenshot({ path }); screenshots.push(`${name}.png`); };

type StoredState = {
  rows: Array<{ recordKey: string; envelope?: { notification?: { eventType?: string; readAt?: number | null; origin?: { offlineIncidentId?: string }; target?: { offlineIncidentId?: string } } } }>;
  connectivity: { incident?: { offlineIncidentId?: string; offlineSince?: number; source?: string; onlineBefore?: boolean } } | null;
};
const readState = (page: Page) => page.evaluate(async (): Promise<StoredState> => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const request = indexedDB.open("diamond-notifications-v1");
    request.onsuccess = () => resolveDatabase(request.result);
    request.onerror = () => rejectDatabase(request.error);
  });
  const transaction = database.transaction(["notifications", "metadata"], "readonly");
  const rows = await new Promise<StoredState["rows"]>((resolveRows, rejectRows) => {
    const request = transaction.objectStore("notifications").getAll();
    request.onsuccess = () => resolveRows(request.result);
    request.onerror = () => rejectRows(request.error);
  });
  const connectivity = await new Promise<StoredState["connectivity"]>((resolveRow, rejectRow) => {
    const request = transaction.objectStore("metadata").get("connectivity");
    request.onsuccess = () => resolveRow(request.result ?? null);
    request.onerror = () => rejectRow(request.error);
  });
  database.close();
  return { rows, connectivity };
});
const waitForStoredState = async (page: Page, matches: (state: StoredState) => boolean, label: string) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = await readState(page);
    if (matches(state)) return state;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for durable notification state: ${label}`);
};
const offlineRows = async (page: Page) => (await readState(page)).rows.filter(row => row.envelope?.notification?.eventType === "system.internet.offline");
const restoredRows = async (page: Page) => (await readState(page)).rows.filter(row => row.envelope?.notification?.eventType === "system.internet.restored");
const trigger = (page: Page, view: "home" | "assistant") => page.locator(`[data-notification-trigger="${view}"]`);
const unread = async (page: Page, view: "home" | "assistant") => Number((await trigger(page, view).getAttribute("aria-label"))?.match(/(\d+) unread/)?.[1] ?? -1);
const isOfflineBell = (page: Page, view: "home" | "assistant") => trigger(page, view).getAttribute("data-notification-offline");

const installContext = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_never_show", "1");
    localStorage.setItem("da_welcome_seen", "1");
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options?: { suggestedName?: string }) => {
        const root = await navigator.storage.getDirectory();
        return root.getFileHandle(options?.suggestedName ?? "Diamond Animation.mp4", { create: true });
      },
    });
  });
  await context.route("**/*", async (route: Route) => {
    const parsed = new URL(route.request().url());
    if (parsed.origin === origin) {
      if (parsed.pathname === "/api/diamond-assistant" || parsed.pathname === "/api/ai-animator") {
        providerRequests += 1;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "deterministic-provider-failure" }) });
        return;
      }
      await route.continue();
      return;
    }
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") { await route.continue(); return; }
    externalRequests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
};

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installContext(context);
  const home = await context.newPage();
  const assistant = await context.newPage();
  const credits = await context.newPage();
  for (const page of [home, assistant, credits]) page.on("pageerror", error => errors.push(error.message));
  await Promise.all([
    home.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 }),
    assistant.goto(`${origin}/assistant`, { waitUntil: "domcontentloaded", timeout: 120_000 }),
    credits.goto(`${origin}/credits`, { waitUntil: "domcontentloaded", timeout: 120_000 }),
  ]);
  await trigger(home, "home").waitFor();
  await trigger(assistant, "assistant").waitFor();
  equal(await isOfflineBell(home, "home"), "false", "online Home bell has no offline state");
  equal(await isOfflineBell(assistant, "assistant"), "false", "online Assistant bell has no offline state");
  equal(await unread(home, "home"), 0, "online Home starts without unread notifications");

  const offlineStartedAt = Date.now();
  await context.setOffline(true);
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "true");
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("data-notification-offline") === "true");
  const offlineBellLatencyMs = Date.now() - offlineStartedAt;
  check(offlineBellLatencyMs < 3_000, "browser offline transition turns both bells red within three seconds");
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await waitForStoredState(home, state => state.connectivity !== null && state.rows.filter(row => row.envelope?.notification?.eventType === "system.internet.offline").length === 1, "first offline incident");
  equal(await home.evaluate(() => navigator.onLine), false, "Chromium declares the profile offline");
  equal(await unread(home, "home"), 1, "Home bell receives one unread offline incident");
  equal(await unread(assistant, "assistant"), 1, "Assistant bell receives the same AI-related offline incident");
  equal(await credits.locator("[data-notification-trigger]").count(), 0, "Credits gains no third bell");
  equal(await home.locator("[data-offline-warning], [data-offline-warning-owner]").count(), 0, "rejected page-wide warning is absent");
  equal((await offlineRows(home)).length, 1, "three mounted routes converge on one durable offline row");
  const firstState = await readState(home);
  check(Boolean(firstState.connectivity?.incident?.offlineIncidentId), "active incident metadata is durable");
  equal(firstState.connectivity?.incident?.source, "browser-offline-event", "real offline event persists transition provenance");
  equal(firstState.connectivity?.incident?.onlineBefore, true, "real offline event truthfully records prior online state");
  equal(firstState.connectivity?.incident?.offlineIncidentId, firstState.rows[0]?.envelope?.notification?.origin?.offlineIncidentId, "metadata and notification bind the same incident identity");
  equal(firstState.rows[0]?.envelope?.notification?.origin?.offlineIncidentId, firstState.rows[0]?.envelope?.notification?.target?.offlineIncidentId, "offline origin and target identities match");

  await trigger(home, "home").focus();
  await home.keyboard.press("Enter");
  equal(await home.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close notifications", "keyboard opens Home notifications and moves focus into the panel");
  const homeRow = home.locator('[data-notification-panel="home"] button[data-unread="true"]');
  equal(await homeRow.getByText("You're offline", { exact: true }).count(), 1, "Home row title is exact");
  equal(await homeRow.getByText("There is no internet, so AI calls are unavailable. Reconnect to use AI.", { exact: true }).count(), 1, "Home row explains reconnection clearly");
  await screenshot(home, "home-red-offline-notification");
  await home.keyboard.press("Escape");
  await home.waitForFunction(() => document.activeElement?.getAttribute("data-notification-trigger") === "home");
  equal(await home.evaluate(() => document.activeElement?.getAttribute("data-notification-trigger")), "home", "Escape closes Home notifications and restores exact trigger focus");
  await trigger(assistant, "assistant").click();
  const assistantRow = assistant.locator('[data-notification-panel="assistant"] button[data-unread="true"]');
  equal(await assistantRow.getByText("You're offline", { exact: true }).count(), 1, "Assistant shows the same shared offline row");
  equal(await assistantRow.getByText("There is no internet, so AI calls are unavailable. Reconnect to use AI.", { exact: true }).count(), 1, "Assistant offline row copy matches Home");
  await screenshot(assistant, "assistant-red-offline-notification");

  await Promise.all([home.evaluate(() => window.dispatchEvent(new Event("offline"))), assistant.evaluate(() => window.dispatchEvent(new Event("offline"))), credits.evaluate(() => window.dispatchEvent(new Event("offline")))]);
  await home.waitForTimeout(400);
  equal((await offlineRows(home)).length, 1, "repeated offline events across tabs do not create spam");
  equal(await unread(home, "home"), 1, "repeat delivery preserves one Home unread item");
  equal(await unread(assistant, "assistant"), 1, "repeat delivery preserves one Assistant unread item");

  await assistantRow.focus();
  await assistant.keyboard.press("Enter");
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("0 unread"));
  await assistant.waitForFunction(() => document.activeElement?.getAttribute("data-notification-trigger") === "assistant");
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await unread(home, "home"), 0, "Assistant acknowledgement clears the shared Home unread state");
  equal(await isOfflineBell(home, "home"), "true", "reading the row does not clear Home red offline state");
  equal(await isOfflineBell(assistant, "assistant"), "true", "reading the row does not clear Assistant red offline state");
  equal((await offlineRows(home))[0]?.envelope?.notification?.readAt === null, false, "shared read state is durable");
  equal(await assistant.evaluate(() => document.activeElement?.getAttribute("data-notification-trigger")), "assistant", "keyboard activation acknowledges the offline row and restores Assistant bell focus");
  await trigger(assistant, "assistant").click();
  equal(await assistant.locator("[data-notification-offline-status]").getByText("Reconnect to use AI.", { exact: false }).count(), 1, "Assistant red bell still explains reconnection after acknowledgement");
  equal(await assistant.getByText("No unread notifications.").count(), 0, "Assistant panel does not contradict its red offline state");
  await assistant.getByRole("button", { name: "Close notifications" }).click();
  await trigger(home, "home").click();
  equal(await home.locator("[data-notification-offline-status]").getByText("Reconnect to use AI.", { exact: false }).count(), 1, "Home red bell still explains reconnection after shared acknowledgement");
  equal(await home.getByText("No unread notifications.").count(), 0, "Home panel does not contradict its red offline state");
  await home.getByRole("button", { name: "Close notifications" }).click();

  await context.setOffline(false);
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "false");
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("data-notification-offline") === "false");
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await waitForStoredState(home, state => state.connectivity === null && state.rows.filter(row => row.envelope?.notification?.eventType === "system.internet.restored").length === 1, "first restoration");
  const onlineState = await readState(home);
  equal(onlineState.connectivity, null, "online observation clears active incident metadata");
  equal(onlineState.rows.length, 2, "genuine online transition stores one restoration beside durable incident history");
  equal((await offlineRows(home)).filter(row => row.envelope?.notification?.readAt === null).length, 0, "online transition retires the old offline alert");
  equal((await restoredRows(home)).filter(row => row.envelope?.notification?.readAt === null).length, 1, "online transition publishes exactly one unread restoration");
  equal((await restoredRows(home))[0]?.envelope?.notification?.origin?.offlineIncidentId, firstState.connectivity?.incident?.offlineIncidentId, "restoration binds the exact completed offline incident");
  equal(await isOfflineBell(home, "home"), "false", "Home bell returns to normal styling for restoration");
  equal(await isOfflineBell(assistant, "assistant"), "false", "Assistant bell returns to normal styling for restoration");

  await trigger(home, "home").click();
  const homeRestoredRow = home.locator('[data-notification-panel="home"] button[data-unread="true"]');
  equal(await homeRestoredRow.getByText("Internet restored", { exact: true }).count(), 1, "Home shows exact restoration title");
  equal(await homeRestoredRow.getByText("Your connection was restored at this time. You can try online and AI features while the browser remains online.", { exact: true }).count(), 1, "Home restoration copy is historical and provider-neutral");
  await screenshot(home, "home-internet-restored-notification");
  await home.getByRole("button", { name: "Close notifications" }).click();
  await trigger(assistant, "assistant").click();
  equal(await assistant.locator('[data-notification-panel="assistant"] button[data-unread="true"]').getByText("Internet restored", { exact: true }).count(), 1, "Assistant shows the same shared restoration");
  await screenshot(assistant, "assistant-internet-restored-notification");
  await assistant.getByRole("button", { name: "Close notifications" }).click();

  await Promise.all([home.evaluate(() => window.dispatchEvent(new Event("online"))), assistant.evaluate(() => window.dispatchEvent(new Event("online"))), credits.evaluate(() => window.dispatchEvent(new Event("online")))]);
  await home.waitForTimeout(400);
  equal((await restoredRows(home)).length, 1, "duplicate online events across tabs do not create restoration spam");
  await home.goto(`${origin}/credits`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await home.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await trigger(home, "home").waitFor();
  equal(await unread(home, "home"), 1, "restoration persists through route changes");
  await home.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await trigger(home, "home").waitFor();
  equal(await unread(home, "home"), 1, "restoration persists through reload without duplication");
  await home.waitForTimeout(1_200);
  equal(await unread(home, "home"), 1, "restoration does not auto-dismiss on a timer");
  await trigger(home, "home").click();
  await home.locator('[data-notification-panel="home"] button[data-unread="true"]').click();
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal((await restoredRows(home))[0]?.envelope?.notification?.readAt === null, false, "Home acknowledgement durably clears the shared restoration in both bells");

  const rowsBeforeFailure = onlineState.rows.length;
  equal(await home.evaluate(async () => (await fetch("/api/diamond-assistant?jobId=phase4-online-failure")).status), 503, "deterministic provider failure occurs while online");
  equal(await home.evaluate(() => navigator.onLine), true, "provider failure leaves browser online");
  equal(await isOfflineBell(home, "home"), "false", "online provider failure does not turn Home bell red");
  equal((await readState(home)).rows.length, rowsBeforeFailure, "online provider failure creates no connectivity row");

  await context.setOffline(true);
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await waitForStoredState(home, state => state.connectivity !== null && state.rows.filter(row => row.envelope?.notification?.eventType === "system.internet.offline").length === 2, "second offline incident");
  equal((await offlineRows(home)).length, 2, "later offline transition creates exactly one new incident");
  check((await readState(home)).connectivity?.incident?.offlineIncidentId !== firstState.connectivity?.incident?.offlineIncidentId, "later incident receives a new identity");
  await trigger(assistant, "assistant").click();
  await assistant.getByRole("button", { name: "Mark all as read" }).click();
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await unread(assistant, "assistant"), 0, "Assistant Mark all clears its AI/offline view");
  equal(await unread(home, "home"), 0, "Assistant Mark all clears the same shared offline row on Home");
  equal(await isOfflineBell(assistant, "assistant"), "true", "Mark all leaves the Assistant red offline state visible");
  equal((await offlineRows(home)).filter(row => row.envelope?.notification?.readAt === null).length, 0, "Mark all seals durable incidents read");
  equal(await assistant.locator("[data-notification-offline-status]").getByText("Reconnect to use AI.", { exact: false }).count(), 1, "Assistant open panel replaces the read row with current offline status");
  await trigger(home, "home").click();
  equal(await home.locator("[data-notification-offline-status]").getByText("Reconnect to use AI.", { exact: false }).count(), 1, "Home open panel also retains current offline status after Mark all");
  await home.getByRole("button", { name: "Close notifications" }).click();
  await context.setOffline(false);
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "false" && document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("data-notification-offline") === "false" && document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await waitForStoredState(home, state => state.connectivity === null && state.rows.filter(row => row.envelope?.notification?.eventType === "system.internet.restored").length === 2, "second restoration");
  equal((await restoredRows(home)).length, 2, "later offline-to-online cycle creates exactly one new restoration");
  equal((await restoredRows(home)).filter(row => row.envelope?.notification?.readAt === null).length, 1, "only the later restoration remains unread");
  equal(await assistant.locator('[data-notification-panel="assistant"] button[data-unread="true"]').getByText("Internet restored", { exact: true }).count(), 1, "open Assistant panel receives the later restoration without reopening");
  await assistant.getByRole("button", { name: "Close notifications" }).click();
  await Promise.all([home.evaluate(() => window.dispatchEvent(new Event("online"))), assistant.evaluate(() => window.dispatchEvent(new Event("online")))]);
  await home.waitForTimeout(400);
  equal((await restoredRows(home)).length, 2, "duplicate online delivery keeps one restoration per incident");

  await context.setOffline(true);
  await home.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "true" && document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("2 unread"));
  await assistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("data-notification-offline") === "true" && document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("2 unread"));
  await waitForStoredState(home, state => state.connectivity !== null && state.rows.filter(row => row.envelope?.notification?.eventType === "system.internet.offline").length === 3, "third offline incident");
  equal((await restoredRows(home)).filter(row => row.envelope?.notification?.readAt === null).length, 1, "offline return preserves the unread historical restoration");
  equal((await offlineRows(home)).filter(row => row.envelope?.notification?.readAt === null).length, 1, "offline return adds one separate truthful unread warning");
  equal(await isOfflineBell(home, "home"), "true", "current offline state remains red while historical restoration is unread");
  await Promise.all([home.close(), assistant.close(), credits.close()]);
  await context.setOffline(false);
  const offlineReloadPage = await context.newPage();
  offlineReloadPage.on("pageerror", error => errors.push(error.message));
  await offlineReloadPage.addInitScript(() => {
    (window as unknown as { __phase4Online: boolean }).__phase4Online = false;
    Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => (window as unknown as { __phase4Online: boolean }).__phase4Online });
  });
  await offlineReloadPage.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await trigger(offlineReloadPage, "home").waitFor();
  equal(await unread(offlineReloadPage, "home"), 2, "offline reopen preserves both unread transition records");
  await offlineReloadPage.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await trigger(offlineReloadPage, "home").waitFor();
  equal(await unread(offlineReloadPage, "home"), 2, "browser-declared offline reload preserves both unread transition records");
  equal((await restoredRows(offlineReloadPage)).filter(row => row.envelope?.notification?.readAt === null).length, 1, "offline reload does not auto-read restoration");
  equal(await isOfflineBell(offlineReloadPage, "home"), "true", "reloaded browser-declared offline state remains red");
  await trigger(offlineReloadPage, "home").click();
  const preservedRestoredRow = offlineReloadPage.locator('[data-notification-panel="home"] button[data-unread="true"]').filter({ hasText: "Internet restored" });
  equal(await preservedRestoredRow.getByText("Your connection was restored at this time. You can try online and AI features while the browser remains online.", { exact: true }).count(), 1, "historical restoration stays truthful beside a current offline warning");
  await screenshot(offlineReloadPage, "offline-with-unread-restoration");
  await preservedRestoredRow.click();
  await offlineReloadPage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal((await restoredRows(offlineReloadPage)).filter(row => row.envelope?.notification?.readAt === null).length, 0, "explicit row acknowledgement clears the shared restoration");
  equal((await offlineRows(offlineReloadPage)).filter(row => row.envelope?.notification?.readAt === null).length, 1, "explicit restoration acknowledgement leaves the current offline warning unread");
  equal(await isOfflineBell(offlineReloadPage, "home"), "true", "acknowledging history does not clear the current red offline state");
  await offlineReloadPage.evaluate(() => {
    (window as unknown as { __phase4Online: boolean }).__phase4Online = true;
    window.dispatchEvent(new Event("online"));
  });
  await offlineReloadPage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "false" && document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await waitForStoredState(offlineReloadPage, state => state.connectivity === null && state.rows.filter(row => row.envelope?.notification?.eventType === "system.internet.restored").length === 3, "third restoration");
  equal((await restoredRows(offlineReloadPage)).length, 3, "third genuine recovery creates one restoration for the third incident");
  const finalAssistant = await context.newPage();
  finalAssistant.on("pageerror", error => errors.push(error.message));
  await finalAssistant.goto(`${origin}/assistant`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await trigger(finalAssistant, "assistant").waitFor();
  await finalAssistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(await unread(finalAssistant, "assistant"), 1, "final restoration is shared with Assistant");
  await trigger(finalAssistant, "assistant").click();
  const finalRestoredRow = finalAssistant.locator('[data-notification-panel="assistant"] button[data-unread="true"]');
  await finalRestoredRow.click();
  await offlineReloadPage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await unread(finalAssistant, "assistant"), 0, "Assistant acknowledgement clears the final shared restoration in both views");
  await context.close();

  const staleContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installContext(staleContext);
  const staleOfflinePage = await staleContext.newPage();
  staleOfflinePage.on("pageerror", error => errors.push(error.message));
  await staleOfflinePage.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await staleContext.setOffline(true);
  await staleOfflinePage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await staleOfflinePage.close();
  await staleContext.setOffline(false);
  const staleOnlinePage = await staleContext.newPage();
  staleOnlinePage.on("pageerror", error => errors.push(error.message));
  await staleOnlinePage.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await trigger(staleOnlinePage, "home").waitFor();
  await staleOnlinePage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal((await restoredRows(staleOnlinePage)).length, 0, "initial online load clears a stale incident without creating restoration");
  equal((await offlineRows(staleOnlinePage)).filter(row => row.envelope?.notification?.readAt === null).length, 0, "initial online load retires the stale offline alert");
  await staleContext.close();

  const startupContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await installContext(startupContext);
  await startupContext.addInitScript(() => { Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }); });
  const startup = await startupContext.newPage();
  startup.on("pageerror", error => errors.push(error.message));
  await startup.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await startup.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "true");
  await startup.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal((await offlineRows(startup)).length, 1, "initial navigator offline creates one incident");
  const startupState = await readState(startup);
  const startupIncident = startupState.connectivity?.incident?.offlineIncidentId;
  equal(startupState.connectivity?.incident?.source, "browser-initial-offline", "startup offline persists initial-observation provenance");
  equal(startupState.connectivity?.incident?.onlineBefore, false, "startup offline does not invent a prior online state");
  await startup.reload();
  await startup.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("data-notification-offline") === "true");
  await startup.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal((await offlineRows(startup)).length, 1, "offline reload reuses the active incident");
  equal((await readState(startup)).connectivity?.incident?.offlineIncidentId, startupIncident, "offline reload preserves exact incident identity");
  const startupAssistant = await startupContext.newPage();
  await startupAssistant.goto(`${origin}/assistant`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await startupAssistant.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("data-notification-offline") === "true");
  equal((await offlineRows(startupAssistant)).length, 1, "startup-offline Assistant tab converges without duplication");
  equal(await unread(startupAssistant, "assistant"), 1, "startup-offline Assistant shows the shared unread row");

  await startup.setViewportSize({ width: 390, height: 844 });
  await startup.emulateMedia({ reducedMotion: "reduce" });
  await trigger(startup, "home").click();
  await startup.keyboard.press("Shift+Tab");
  equal(await startup.evaluate(() => document.activeElement?.textContent?.trim()), "Mark all as read", "compact dialog wraps backward focus from Close to Mark all");
  await startup.keyboard.press("Tab");
  equal(await startup.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close notifications", "compact dialog wraps forward focus back to Close");
  equal(await startup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "compact notification panel creates no horizontal overflow");
  await screenshot(startup, "compact-red-offline-notification");
  await startup.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await screenshot(startup, "compact-forced-colors-offline");
  await startup.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
  await startup.setViewportSize({ width: 720, height: 450 });
  equal(await startup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "200-percent-equivalent viewport has no horizontal overflow");
  await screenshot(startup, "zoom-200-equivalent-offline");
  await startup.addScriptTag({ content: readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8") });
  const axe = await startup.evaluate(async () => {
    const result = await (window as unknown as { axe: { run(root: string): Promise<{ violations: Array<{ impact: string | null; id: string }> }> } }).axe.run('[data-notification-trigger-owner="home"]');
    return result.violations.filter(violation => violation.impact === "serious" || violation.impact === "critical");
  });
  equal(axe, [], "offline bell and notification panel have zero serious or critical Axe violations");
  await startupContext.close();

  const exportContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await installContext(exportContext);
  const exportPage = await exportContext.newPage();
  exportPage.setDefaultTimeout(120_000);
  exportPage.on("pageerror", error => errors.push(error.message));
  await exportPage.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await exportPage.getByRole("button", { name: /New Project/ }).click();
  await exportPage.locator('canvas[data-workspace-canvas="editable"]').waitFor();
  await exportPage.getByRole("button", { name: "File" }).click();
  await exportPage.getByRole("menuitem", { name: "Save As" }).click();
  const saveDialog = exportPage.getByRole("dialog", { name: "Save project as" });
  await saveDialog.getByLabel("Project name").fill("SPEC-0014 Phase 4 Export Control");
  await saveDialog.getByRole("button", { name: "Save copy" }).click();
  await exportPage.getByText("Saved on this browser", { exact: true }).waitFor();
  await exportPage.getByRole("button", { name: "File" }).click();
  await exportPage.getByRole("menuitem", { name: "Export…" }).click();
  await exportPage.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
  await exportPage.getByRole("button", { name: /SPEC-0014 Phase 4 Export Control/ }).click();
  await exportPage.getByRole("button", { name: "Use this animation" }).click();
  await exportPage.getByRole("main", { name: "Watch saved animation" }).waitFor();
  await exportPage.getByLabel("Video file name").fill("spec0014-phase4-export-control");
  await exportPage.getByRole("button", { name: "Export video" }).click();
  await exportPage.getByRole("button", { name: "Choose save location…" }).waitFor();
  await exportPage.getByRole("button", { name: "Choose save location…" }).click();
  await exportPage.getByText(/Saved and validated spec0014-phase4-export-control\.mp4/).waitFor();
  const exportedBytes = await exportPage.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle("spec0014-phase4-export-control.mp4")).getFile()).size;
  });
  check(exportedBytes > 0, "ordinary screen-owned Export completes with a non-empty validated MP4");
  equal((await readState(exportPage)).rows.filter(row => row.envelope?.notification?.eventType?.startsWith("export.")).length, 0, "ordinary Export creates zero Export notifications");
  equal(providerRequests, 1, "ordinary Export adds no provider request");
  await exportContext.close();

  equal(externalRequests, [], "browser proof attempts no external request");
  equal(errors, [], "browser proof records no page exception");
  equal(providerRequests, 1, "only the explicit deterministic online provider-failure probe is observed");
  const result = {
    schema: "spec0014-phase4-browser-proof/v1",
    status: "PASS",
    assertions: receipts.length,
    receipts,
    screenshots,
    offlineBellLatencyMs,
    network: { externalRequests, providerRequests, realProviderCalls: 0, paidCalls: 0 },
    errors,
    browser: { name: "Google Chrome", mode: "HEADED", desktop: "1440x900", compact: "390x844", zoomEquivalent: "720x450", reducedMotion: true, forcedColors: true },
    limitations: { physicalDevices: "UNPROVEN_NOT_REQUESTED", nativeOsFocusAndZoom: "UNPROVEN", nonChromium: "UNPROVEN" },
  };
  writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`SPEC-0014 Phase 4 browser proof PASS (${receipts.length} assertions)\n`);
} finally {
  await browser.close();
}
