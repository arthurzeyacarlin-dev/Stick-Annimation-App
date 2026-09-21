import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { createPhase1LegacyFixtureTransport } from "./phase1Fixtures.ts";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57840/";
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
const origin = new URL(url).origin;
const outputRoot = resolve("output/spec-0011/phase-3/browser");
mkdirSync(outputRoot, { recursive: true });
const axePath = resolve("node_modules/axe-core/axe.min.js");
const fixtures = await createPhase1LegacyFixtureTransport();

let assertions = 0;
const operations: string[] = [];
const screenshots: string[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const requests: Array<{ method: string; url: string; disposition: string }> = [];
const performanceReceipts: Array<Record<string, unknown>> = [];
const storageReceipts: Array<{ label: string; snapshot: unknown }> = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions += 1; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions += 1; };
const step = async (label: string, run: () => Promise<void>) => { await run(); operations.push(label); console.log(`PASS ${label}`); };
const screenshot = async (page: Page, name: string) => { const file = `${name}.png`; await page.screenshot({ path: resolve(outputRoot, file), fullPage: true }); screenshots.push(file); };

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});

const configure = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const request = route.request();
    const parsed = new URL(request.url());
    const sameOrigin = parsed.origin === origin;
    const favicon = sameOrigin && parsed.pathname === "/favicon.ico";
    const aiAvailability = sameOrigin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const allowed = sameOrigin && !parsed.pathname.startsWith("/api/");
    const disposition = favicon ? "fulfilled-empty-favicon" : aiAvailability ? "fulfilled-disabled-ai" : allowed ? "loopback" : "blocked";
    requests.push({ method: request.method(), url: `${parsed.origin}${parsed.pathname}`, disposition });
    if (favicon) await route.fulfill({ status: 200, contentType: "image/x-icon", body: "" });
    else if (aiAvailability) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"reason":"spec0011-phase3-proof"}' });
    else if (allowed) await route.continue();
    else await route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_seen", "1");
    localStorage.setItem("da_welcome_never_show", "1");
  });
};

const attachErrors = (page: Page) => {
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
};

const seedLegacy = (page: Page) => page.evaluate(async ({ values, unified }) => {
  const drawings = values.filter(value => value.sourceKind === "drawing-v1").map(value => "project" in value ? value.project : null);
  drawings.push({ id: "invalid-phase3-drawing", name: "Damaged alpha project", data: { version: 99 }, updated_at: "not-a-date" } as never);
  localStorage.setItem("da_saved_drawing_projects", JSON.stringify(drawings));
  const sticks = values.filter(value => value.sourceKind.startsWith("stick")).map(value => "project" in value ? value.project : null);
  localStorage.setItem("da_saved_stick_projects_v1", JSON.stringify({ storageVersion: 1, projects: sticks }));
  localStorage.setItem("da_saved_unified_projects_v1", JSON.stringify({ storageVersion: 1, projects: [unified] }));
  const source = values.find(value => value.sourceKind === "drawing-v2");
  if (!source || source.sourceKind !== "drawing-v2") throw new Error("drawing_v2_fixture_missing");
  const record = { ...source.record, assets: source.record.assets.map(asset => ({ ...asset, bytes: new Blob([Uint8Array.from(atob(asset.bytes), character => character.charCodeAt(0))], { type: asset.kind === "raster-png" ? "image/png" : "audio/wav" }) })) };
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animator-local", 1);
    open.onupgradeneeded = () => {
      for (const [name, keyPath] of [["drawingProjectHeadsV2", "projectId"], ["drawingProjectVersionsV2", ["projectId", "storageRevision"]], ["drawingProjectPreviewsV1", "projectId"], ["drawingProjectAuxiliaryV1", "projectId"], ["drawingProjectLegacyDeleteTombstonesV1", "projectId"]] as const) {
        if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath: typeof keyPath === "string" ? keyPath : [...keyPath] });
      }
    };
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  await new Promise<void>((resolveTransaction, rejectTransaction) => {
    const transaction = database.transaction(["drawingProjectHeadsV2", "drawingProjectVersionsV2"], "readwrite");
    transaction.objectStore("drawingProjectHeadsV2").put(source.head);
    transaction.objectStore("drawingProjectVersionsV2").put(record);
    transaction.oncomplete = () => resolveTransaction();
    transaction.onerror = () => rejectTransaction(transaction.error);
  });
  database.close();
}, { values: fixtures.transport, unified: fixtures.unified });

const seedLargeCollection = async (page: Page) => {
  const source = fixtures.transport.find(value => value.sourceKind === "drawing-v1");
  if (!source || source.sourceKind !== "drawing-v1") throw new Error("drawing_v1_fixture_missing");
  await page.evaluate((base: Record<string, unknown>) => {
    const projects = Array.from({ length: 64 }, (_value, index) => ({
      ...structuredClone(base),
      id: `71000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      name: `Project ${index.toString().padStart(3, "0")}`,
      updated_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }));
    localStorage.setItem("da_saved_drawing_projects", JSON.stringify(projects));
    localStorage.setItem("da_saved_stick_projects_v1", JSON.stringify({ storageVersion: 1, projects: [] }));
    localStorage.setItem("da_saved_unified_projects_v1", JSON.stringify({ storageVersion: 1, projects: [] }));
  }, source.project as Record<string, unknown>);
};

const percentile95 = (values: number[]) => [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];

const createNativeProject = async (page: Page) => {
  await page.getByRole("button", { name: /^New Project/ }).click();
  const editable = page.locator('canvas[data-workspace-canvas="editable"]');
  await editable.waitFor();
  await page.getByRole("button", { name: "Brush", exact: true }).last().click();
  const canvas = await editable.boundingBox();
  assert.ok(canvas);
  await page.mouse.move(canvas.x + canvas.width * 0.44, canvas.y + canvas.height * 0.43);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.58, canvas.y + canvas.height * 0.57, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => !(document.querySelector('button[aria-label="Undo"]') as HTMLButtonElement | null)?.disabled);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save As" }).click();
  const dialog = page.getByRole("dialog", { name: "Save project as" });
  await dialog.getByLabel("Project name").fill("Zeta Project");
  await dialog.getByRole("button", { name: "Save copy" }).click();
  await page.getByText("Saved on this browser", { exact: true }).waitFor();
  const reboundLease = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
      const open = indexedDB.open("diamond-animation-unified-v2");
      open.onsuccess = () => resolveDatabase(open.result);
      open.onerror = () => rejectDatabase(open.error);
    });
    const heads = await new Promise<Array<{ projectId: string; title: string }>>((resolveHeads, rejectHeads) => {
      const request = database.transaction("heads", "readonly").objectStore("heads").getAll();
      request.onsuccess = () => resolveHeads(request.result);
      request.onerror = () => rejectHeads(request.error);
    });
    database.close();
    const projectId = heads.find(head => head.title === "Zeta Project")?.projectId ?? null;
    const leasedProjectIds: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("diamond-animation-project-open-v1:")) continue;
      const lease = JSON.parse(localStorage.getItem(key) ?? "null") as { projectId?: unknown; kind?: unknown } | null;
      if (lease?.kind === "editor" && typeof lease.projectId === "string") leasedProjectIds.push(lease.projectId);
    }
    return { projectId, leasedProjectIds };
  });
  check(Boolean(reboundLease.projectId && reboundLease.leasedProjectIds.includes(reboundLease.projectId)), "Save As rebinds the active editor lease to the new native project identity");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save and Exit", exact: true }).click();
  await page.getByRole("button", { name: /^My Projects/ }).waitFor();
  equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("diamond-animation-project-open-v1:")).length), 0, "Save and Exit releases the rebound editor lease");
};

const openLibrary = async (page: Page, surface: "My Projects" | "Open Project") => {
  await page.getByRole("button", { name: new RegExp(`^${surface}`) }).click();
  await page.getByRole("heading", { name: surface }).waitFor();
  await page.locator("[data-project-library-entry]").first().waitFor();
};

const waitForAction = async (page: Page, action: "Watch" | "Edit", title: string) => {
  const button = page.getByRole("button", { name: `${action} ${title}`, exact: true });
  await button.waitFor({ timeout: 30_000 });
  return button;
};

const menuCommand = async (page: Page, title: string, command: "Rename" | "Duplicate" | "Delete") => {
  await page.getByRole("button", { name: `Manage ${title}`, exact: true }).click();
  await page.getByRole("menuitem", { name: command, exact: true }).click();
};

const runNameDialog = async (page: Page, heading: "Rename project" | "Duplicate project", value: string) => {
  const dialog = page.getByRole("dialog", { name: heading });
  await dialog.getByLabel("Project name").fill(value);
  await dialog.getByRole("button", { name: heading.startsWith("Rename") ? "Rename" : "Duplicate", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
};

const noOverflow = async (page: Page, label: string) => {
  const result = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(result.scroll <= result.client, `${label} has no horizontal page overflow`);
};

const axeSerious = async (page: Page) => {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (target: string) => Promise<{ violations: Array<{ impact: string | null; id: string }> }> } }).axe.run("[data-project-library]");
    return result.violations.filter(violation => violation.impact === "critical" || violation.impact === "serious");
  });
};

const legacyBytes = (page: Page) => page.evaluate(() => ({
  drawing: localStorage.getItem("da_saved_drawing_projects"),
  stick: localStorage.getItem("da_saved_stick_projects_v1"),
  unified: localStorage.getItem("da_saved_unified_projects_v1"),
}));

const storageInventory = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animation-unified-v2");
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  const transaction = db.transaction(["heads", "versions", "assets"], "readonly");
  const getAll = (name: string) => new Promise<unknown[]>((resolveRows, rejectRows) => {
    const request = transaction.objectStore(name).getAll();
    request.onsuccess = () => resolveRows(request.result);
    request.onerror = () => rejectRows(request.error);
  });
  const [heads, versions, assets] = await Promise.all([getAll("heads"), getAll("versions"), getAll("assets")]);
  db.close();
  return { heads: heads.length, versions: versions.length, assets: assets.length };
});

const storageSnapshot = (page: Page) => page.evaluate(async () => {
  const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
  const local: Record<string, { byteLength: number; digest: string }> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)!;
    if (key.startsWith("da_welcome") || key.startsWith("diamond-animation-project-open-v1:") || key === "diamond-animation-projects-v2:invalidation") continue;
    const value = localStorage.getItem(key) ?? "";
    local[key] = { byteLength: new TextEncoder().encode(value).byteLength, digest: await hash(value) };
  }
  const indexed: Record<string, Record<string, { count: number; digest: string }>> = {};
  for (const info of (await indexedDB.databases()).filter(database => database.name)) {
    const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
      const open = indexedDB.open(info.name!);
      open.onsuccess = () => resolveDatabase(open.result);
      open.onerror = () => rejectDatabase(open.error);
    });
    const stores: Record<string, { count: number; digest: string }> = {};
    for (const storeName of Array.from(database.objectStoreNames).sort()) {
      const rows = await new Promise<unknown[]>((resolveRows, rejectRows) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolveRows(request.result);
        request.onerror = () => rejectRows(request.error);
      });
      const scrubbed = JSON.stringify(rows, (_key, value) => value instanceof Blob
        ? { blobByteLength: value.size, blobType: value.type }
        : ArrayBuffer.isView(value) ? { byteLength: value.byteLength } : value);
      stores[storeName] = { count: rows.length, digest: await hash(scrubbed) };
    }
    database.close();
    indexed[info.name!] = stores;
  }
  return { local, indexed };
});

const installRecoveryConflict = (page: Page, projectTitle: string) => page.evaluate(async title => {
  const official = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animation-unified-v2");
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  const head = await new Promise<Record<string, unknown>>((resolveHead, rejectHead) => {
    const request = official.transaction("heads", "readonly").objectStore("heads").getAll();
    request.onsuccess = () => resolveHead((request.result as Array<Record<string, unknown>>).find(value => value.title === title)!);
    request.onerror = () => rejectHead(request.error);
  });
  official.close();
  const now = new Date().toISOString();
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animation-project-recovery-v1", 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains("heads")) open.result.createObjectStore("heads", { keyPath: "draftId" });
      if (!open.result.objectStoreNames.contains("owners")) open.result.createObjectStore("owners", { keyPath: "draftId" });
      if (!open.result.objectStoreNames.contains("candidates")) open.result.createObjectStore("candidates", { keyPath: ["draftId", "draftSequence", "candidateDigest"] });
      if (!open.result.objectStoreNames.contains("assets")) open.result.createObjectStore("assets", { keyPath: "assetId" });
      if (!open.result.objectStoreNames.contains("assetMetadata")) open.result.createObjectStore("assetMetadata", { keyPath: "assetId" });
    };
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  await new Promise<void>((resolveTransaction, rejectTransaction) => {
    const transaction = database.transaction("heads", "readwrite");
    transaction.objectStore("heads").put({
      schemaVersion: "project-recovery-envelope/v1", draftId: "latest", draftSequence: 1,
      ownerSessionId: "phase3-proof", workspaceInstanceId: "phase3-proof-workspace",
      sourceProjectId: head.projectId, sourceRevision: head.activeRevision, sourceProjectDigest: head.projectDigest,
      sourceTitle: head.title, workspaceGeneration: 1, candidateDigest: head.projectDigest,
      candidateEncodingVersion: "unified-project-storage-v2", assetBindings: [],
      createdAt: now, updatedAt: now, lastMeaningfulEditAt: now, storedByteLength: 1, status: "current",
    });
    transaction.oncomplete = () => resolveTransaction();
    transaction.onerror = () => rejectTransaction(transaction.error);
  });
  database.close();
}, projectTitle);

const clearRecoveryConflict = (page: Page) => page.evaluate(async () => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animation-project-recovery-v1");
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  await new Promise<void>((resolveTransaction, rejectTransaction) => {
    const transaction = database.transaction("heads", "readwrite");
    transaction.objectStore("heads").clear();
    transaction.oncomplete = () => resolveTransaction();
    transaction.onerror = () => rejectTransaction(transaction.error);
  });
  database.close();
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "no-preference" });
  await configure(context);
  const first = await context.newPage();
  attachErrors(first);
  await first.goto(url, { waitUntil: "networkidle" });
  await seedLegacy(first);
  await createNativeProject(first);
  await openLibrary(first, "My Projects");
  await waitForAction(first, "Watch", "Zeta Project");
  storageReceipts.push({ label: "before-management", snapshot: await storageSnapshot(first) });

  await step("shared-shell:search-sort-keyboard-and-context-routes", async () => {
    const searchMs = await first.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>('[data-project-library] input[type="search"]')!;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      const started = performance.now();
      setValue.call(input, "zeta");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      for (let frame = 0; frame < 12; frame += 1) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (document.querySelectorAll("[data-project-library-entry]").length === 1) return performance.now() - started;
      }
      throw new Error("search_did_not_settle");
    });
    equal(await first.locator("[data-project-library-entry]").count(), 1, "search filters title locally");
    check(searchMs <= 100, `search feedback stays within 100ms (${searchMs.toFixed(1)}ms)`);
    await first.getByRole("searchbox", { name: "Search" }).fill("");
    const sortMs = await first.evaluate(async () => {
      const select = document.querySelector<HTMLSelectElement>("[data-project-library] select")!;
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      const started = performance.now();
      setValue.call(select, "name-asc");
      select.dispatchEvent(new Event("change", { bubbles: true }));
      for (let frame = 0; frame < 12; frame += 1) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (document.querySelector('[data-project-library-entry] [class*="projectTitle"]')?.textContent?.toLowerCase().includes("damaged alpha")) {
          return performance.now() - started;
        }
      }
      throw new Error("sort_did_not_settle");
    });
    check(sortMs <= 100, `sort feedback stays within 100ms (${sortMs.toFixed(1)}ms)`);
    performanceReceipts.push({ searchMs, sortMs });
    const manage = first.getByRole("button", { name: "Manage Zeta Project" });
    await manage.focus();
    await first.keyboard.press("Shift+F10");
    await first.getByRole("menu", { name: "Manage Zeta Project" }).waitFor();
    await first.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem");
    await first.keyboard.press("End");
    equal(await first.getByRole("menuitem", { name: "Delete" }).evaluate(element => element === document.activeElement), true, "End moves to final enabled menu command");
    await first.keyboard.press("Escape");
    equal(await manage.evaluate(element => element === document.activeElement), true, "Escape restores overflow focus");
    const card = first.locator("article").filter({ hasText: "Zeta Project" });
    await card.click({ button: "right" });
    await first.getByRole("menu", { name: "Manage Zeta Project" }).waitFor();
    await first.keyboard.press("Escape");
    equal(await first.getByRole("button", { name: "Watch Zeta Project" }).evaluate(element => element === document.activeElement), true, "right-click menu restores card focus");
    const invalidManage = first.getByRole("button", { name: "Manage Damaged alpha project" });
    await invalidManage.click();
    await first.getByRole("menu", { name: "Manage Damaged alpha project" }).waitFor();
    await first.waitForFunction(() => document.activeElement?.getAttribute("role") === "menu");
    equal(await first.getByRole("menu", { name: "Manage Damaged alpha project" }).evaluate(element => element === document.activeElement), true, "all-disabled invalid-entry menu itself receives keyboard focus");
    await first.keyboard.press("Escape");
    equal(await invalidManage.evaluate(element => element === document.activeElement), true, "invalid-entry menu Escape restores overflow focus");
  });

  await step("rename:validation-and-metadata-only-command", async () => {
    await menuCommand(first, "Zeta Project", "Rename");
    const dialog = first.getByRole("dialog", { name: "Rename project" });
    await dialog.getByLabel("Project name").fill("hidden\u202Ename");
    await dialog.getByRole("button", { name: "Rename", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    check((await dialog.getByRole("alert").textContent())?.includes("hidden direction controls"), "unsafe rename is rejected truthfully");
    await dialog.getByLabel("Project name").fill("Alpha Project");
    await dialog.getByRole("button", { name: "Rename", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await waitForAction(first, "Watch", "Alpha Project");
    await first.getByText("Project renamed.", { exact: true }).waitFor();
  });

  const second = await context.newPage();
  attachErrors(second);
  await second.goto(url, { waitUntil: "networkidle" });
  await openLibrary(second, "My Projects");
  await waitForAction(second, "Watch", "Alpha Project");

  let winningTitle = "";
  await step("two-tab:one-rename-winner-and-authoritative-refresh", async () => {
    await menuCommand(first, "Alpha Project", "Rename");
    await menuCommand(second, "Alpha Project", "Rename");
    await first.getByRole("dialog", { name: "Rename project" }).getByLabel("Project name").fill("Beta One");
    await second.getByRole("dialog", { name: "Rename project" }).getByLabel("Project name").fill("Beta Two");
    await Promise.all([
      first.getByRole("dialog", { name: "Rename project" }).getByRole("button", { name: "Rename", exact: true }).click(),
      second.getByRole("dialog", { name: "Rename project" }).getByRole("button", { name: "Rename", exact: true }).click(),
    ]);
    await first.waitForTimeout(700);
    const one = await first.getByRole("button", { name: "Watch Beta One", exact: true }).count();
    const two = await first.getByRole("button", { name: "Watch Beta Two", exact: true }).count();
    equal(one + two, 1, "exactly one concurrent rename wins");
    winningTitle = one ? "Beta One" : "Beta Two";
    await waitForAction(second, "Watch", winningTitle);
    equal(await second.getByRole("button", { name: `Watch ${winningTitle}`, exact: true }).count(), 1, "second tab converges by authoritative re-read");
  });

  await step("legacy-duplicate:read-only-source-and-independent-native-copy", async () => {
    const before = await legacyBytes(first);
    await menuCommand(first, "Drawing study (V1)", "Duplicate");
    await runNameDialog(first, "Duplicate project", "Legacy Native Copy");
    await waitForAction(first, "Watch", "Legacy Native Copy");
    equal(await legacyBytes(first), before, "duplicating legacy leaves every legacy source byte unchanged");
    await first.getByText("Project duplicated as an independent native copy.", { exact: true }).waitFor();
  });

  await step("native-duplicate:shared-assets-and-independent-management", async () => {
    const before = await storageInventory(first);
    await menuCommand(first, winningTitle, "Duplicate");
    await runNameDialog(first, "Duplicate project", "Shared Asset Copy");
    await waitForAction(first, "Watch", "Shared Asset Copy");
    const after = await storageInventory(first);
    equal(after.heads, before.heads + 1, "native copy owns an independent head");
    equal(after.versions, before.versions + 1, "native copy owns an independent initial history revision");
    equal(after.assets, before.assets, "native copy reuses content-addressed assets without copying bytes");
  });

  await step("delete:cancel-default-open-lease-recovery-conflict-and-safe-success", async () => {
    const viewerButton = await waitForAction(first, "Watch", winningTitle);
    await viewerButton.click();
    const viewer = first.getByRole("dialog", { name: winningTitle });
    await viewer.waitFor();

    await waitForAction(second, "Watch", winningTitle);
    await menuCommand(second, winningTitle, "Delete");
    const firstDelete = second.getByRole("dialog", { name: "Delete project?" });
    equal(await firstDelete.getByRole("button", { name: "Cancel" }).evaluate(element => element === document.activeElement), true, "Delete confirmation defaults focus to Cancel");
    check((await firstDelete.textContent())?.includes(winningTitle), "Delete confirmation names the exact full title");
    await firstDelete.getByRole("button", { name: "Cancel" }).click();
    await firstDelete.waitFor({ state: "detached" });
    await second.waitForFunction(title => document.activeElement?.getAttribute("aria-label") === `Manage ${title}`, winningTitle);
    equal(await second.getByRole("button", { name: `Manage ${winningTitle}` }).evaluate(element => element === document.activeElement), true, "Cancel restores focus to the invoking overflow button");
    await menuCommand(second, winningTitle, "Delete");
    const openConflictDelete = second.getByRole("dialog", { name: "Delete project?" });
    await openConflictDelete.getByRole("button", { name: "Delete project" }).click();
    await openConflictDelete.waitFor({ state: "detached" });
    await second.getByText("Close this project in every editor or viewer, then try Delete again.", { exact: true }).waitFor();
    equal(await second.getByRole("button", { name: `Watch ${winningTitle}` }).count(), 1, "open-view conflict preserves project");
    await second.waitForFunction(title => document.activeElement?.getAttribute("aria-label") === `Manage ${title}`, winningTitle);

    await viewer.getByRole("button", { name: "Close" }).click();
    await viewer.waitFor({ state: "detached" });
    storageReceipts.push({ label: "before-recovery-conflict", snapshot: await storageSnapshot(second) });
    await installRecoveryConflict(second, winningTitle);
    storageReceipts.push({ label: "recovery-conflict-injected", snapshot: await storageSnapshot(second) });
    await menuCommand(second, winningTitle, "Delete");
    await second.getByRole("dialog", { name: "Delete project?" }).getByRole("button", { name: "Delete project" }).click();
    await second.getByText("Unsaved recovery work belongs to this project. Recover, discard, or save that work before deleting.", { exact: true }).waitFor();
    equal(await second.getByRole("button", { name: `Watch ${winningTitle}` }).count(), 1, "matching recovery conflict preserves project");
    await second.waitForFunction(title => document.activeElement?.getAttribute("aria-label") === `Manage ${title}`, winningTitle);
    await clearRecoveryConflict(second);
    storageReceipts.push({ label: "recovery-conflict-cleared", snapshot: await storageSnapshot(second) });

    await menuCommand(second, winningTitle, "Delete");
    await second.getByRole("dialog", { name: "Delete project?" }).getByRole("button", { name: "Delete project" }).click();
    await second.getByText("Project deleted from this browser.", { exact: true }).waitFor();
    equal(await second.getByRole("button", { name: `Watch ${winningTitle}` }).count(), 0, "exact project disappears after verified delete");
    await second.waitForFunction(title => document.activeElement instanceof HTMLButtonElement && document.activeElement.getAttribute("aria-label")?.startsWith("Watch ") && !document.activeElement.getAttribute("aria-label")?.includes(title), winningTitle);
    check((await second.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")).startsWith("Watch "), "successful Delete moves focus to the next logical project action");
    await waitForAction(second, "Watch", "Shared Asset Copy");
    await second.getByRole("button", { name: "Watch Shared Asset Copy" }).click();
    await second.getByRole("dialog", { name: "Shared Asset Copy" }).waitFor();
    await second.getByRole("dialog", { name: "Shared Asset Copy" }).getByRole("button", { name: "Close" }).click();
    storageReceipts.push({ label: "after-verified-delete", snapshot: await storageSnapshot(second) });
  });

  await step("open-project:shared-shell-preserves-edit-route", async () => {
    await second.getByRole("button", { name: "← Back" }).click();
    await openLibrary(second, "Open Project");
    await waitForAction(second, "Edit", "Shared Asset Copy");
    await second.getByRole("searchbox", { name: "Search" }).fill("shared asset");
    equal(await second.locator("[data-project-library-entry]").count(), 1, "Open Project consumes the same local Search behavior");
    await second.getByRole("searchbox", { name: "Search" }).fill("");
    await second.getByRole("combobox", { name: "Sort" }).selectOption("name-asc");
    equal(await second.getByRole("button", { name: "Watch Shared Asset Copy" }).count(), 0, "Open Project labels the primary action Edit, not Watch");
    equal(await second.getByRole("button", { name: "Manage Shared Asset Copy" }).count(), 1, "Open Project exposes the same management route");
    equal(await axeSerious(second), [], "Open Project shared shell has zero serious/critical axe violations");
    await screenshot(second, "desktop-open-project-shared-shell");
    await second.getByRole("button", { name: "Edit Shared Asset Copy" }).click();
    const editable = second.locator('canvas[data-workspace-canvas="editable"]');
    await editable.waitFor();
    equal(await second.locator('[data-project-movie-viewer="true"]').count(), 0, "Edit continues into the sole editor without mounting the viewer");
    await first.bringToFront();
    await first.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForAction(first, "Watch", "Shared Asset Copy");
    await menuCommand(first, "Shared Asset Copy", "Delete");
    await first.getByRole("dialog", { name: "Delete project?" }).getByRole("button", { name: "Delete project" }).click();
    await first.getByText("Close this project in every editor or viewer, then try Delete again.", { exact: true }).waitFor();
    equal(await first.getByRole("button", { name: "Watch Shared Asset Copy" }).count(), 1, "active editor lease blocks deletion in another tab");
    await second.bringToFront();
    await second.getByRole("button", { name: "Brush", exact: true }).last().click();
    const canvas = await editable.boundingBox();
    assert.ok(canvas);
    await second.mouse.move(canvas.x + canvas.width * 0.35, canvas.y + canvas.height * 0.35);
    await second.mouse.down();
    await second.mouse.move(canvas.x + canvas.width * 0.41, canvas.y + canvas.height * 0.41, { steps: 6 });
    await second.mouse.up();
    await second.getByRole("button", { name: "File" }).click();
    await second.getByRole("menuitem", { name: "Save and Exit", exact: true }).click();
    await second.getByRole("button", { name: /^My Projects/ }).waitFor();
  });

  await step("protected-export-and-player-route", async () => {
    await second.getByRole("button", { name: /^Export/ }).click();
    await second.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
    const exportCard = second.getByRole("button", { name: /Shared Asset Copy/ });
    await exportCard.waitFor();
    await exportCard.click();
    await second.getByRole("button", { name: "Use this animation" }).click();
    await second.locator('[data-canonical-project-player="export"]').waitFor();
    equal(await second.locator('[data-canonical-project-player="export"]').count(), 1, "Export keeps the canonical shared project player");
    check(await second.getByRole("button", { name: "Export video" }).isVisible(), "Export video action remains available without changing export behavior");
    await second.getByRole("button", { name: "Change animation" }).click();
    await second.getByRole("button", { name: "← Back" }).click();
    await second.getByRole("button", { name: /^My Projects/ }).waitFor();
  });

  await step("responsive-zoom-reduced-motion-and-accessibility", async () => {
    if (!(await first.getByRole("heading", { name: "My Projects" }).count())) {
      await openLibrary(first, "My Projects");
    }
    for (const profile of [
      { name: "compact-390x844", width: 390, height: 844, reduced: true },
      { name: "narrow-320x568", width: 320, height: 568, reduced: false },
      { name: "zoom-200-percent-equivalent", width: 720, height: 450, reduced: false },
    ]) {
      await first.setViewportSize({ width: profile.width, height: profile.height });
      await first.emulateMedia({ reducedMotion: profile.reduced ? "reduce" : "no-preference", forcedColors: profile.name === "narrow-320x568" ? "active" : "none" });
      await first.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
        const library = document.querySelector<HTMLElement>("[data-project-library]");
        if (library) library.scrollTop = 0;
      });
      await noOverflow(first, profile.name);
      if (profile.reduced) equal(await first.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, "reduced-motion preference reaches shared library");
      const manage = first.getByRole("button", { name: "Manage Shared Asset Copy" });
      const box = await manage.boundingBox();
      check(Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= profile.width), `${profile.name} keeps visible overflow action in viewport`);
      await screenshot(first, `${profile.name}-my-projects`);
    }
    await first.setViewportSize({ width: 1440, height: 900 });
    await first.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
    equal(await axeSerious(first), [], "My Projects shared shell has zero serious/critical axe violations");
  });

  storageReceipts.push({ label: "final-after-independent-edit-save-export", snapshot: await storageSnapshot(second) });
  await context.close();

  const largeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
  await configure(largeContext);
  const largePage = await largeContext.newPage();
  attachErrors(largePage);
  await largePage.goto(url, { waitUntil: "networkidle" });
  await seedLargeCollection(largePage);
  const listStarted = performance.now();
  await largePage.getByRole("button", { name: /^My Projects/ }).click();
  await largePage.getByRole("heading", { name: "My Projects" }).waitFor();
  await largePage.waitForFunction(() => document.querySelectorAll("[data-project-library-entry]").length === 64);
  const firstUsableListMs = performance.now() - listStarted;
  check(firstUsableListMs <= 2_000, `compact 64-project metadata shell is usable within 2 seconds (${firstUsableListMs.toFixed(1)}ms)`);
  equal(await largePage.locator("[data-project-library-entry]").count(), 64, "accepted 64-project bound renders without waiting for all posters");
  const feedback = await largePage.evaluate(async () => {
    const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const waitFor = async (predicate: () => boolean) => {
      for (let frame = 0; frame < 12; frame += 1) { await nextFrame(); if (predicate()) return; }
      throw new Error("feedback_did_not_settle");
    };
    const input = document.querySelector<HTMLInputElement>('[data-project-library] input[type="search"]')!;
    const select = document.querySelector<HTMLSelectElement>("[data-project-library] select")!;
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const setSelect = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    const search: number[] = [];
    const sort: number[] = [];
    const menu: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      for (const [value, count] of [["project 063", 1], ["", 64]] as const) {
        const started = performance.now();
        setInput.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await waitFor(() => document.querySelectorAll("[data-project-library-entry]").length === count);
        search.push(performance.now() - started);
      }
      for (const [value, title] of [["name-asc", "Project 000"], ["name-desc", "Project 063"]] as const) {
        const started = performance.now();
        setSelect.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await waitFor(() => document.querySelector('[data-project-library-entry] [class*="projectTitle"]')?.textContent === title);
        sort.push(performance.now() - started);
      }
      const manage = document.querySelector<HTMLButtonElement>('button[aria-label="Manage Project 063"]')!;
      const started = performance.now();
      manage.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
      await waitFor(() => Boolean(document.querySelector('[role="menu"][aria-label="Manage Project 063"]')));
      menu.push(performance.now() - started);
      document.querySelector<HTMLElement>('[role="menu"][aria-label="Manage Project 063"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await waitFor(() => !document.querySelector('[role="menu"][aria-label="Manage Project 063"]'));
    }
    return { search, sort, menu };
  });
  const p95 = { searchMs: percentile95(feedback.search), sortMs: percentile95(feedback.sort), menuMs: percentile95(feedback.menu) };
  check(p95.searchMs <= 100 && p95.sortMs <= 100 && p95.menuMs <= 100, `64-project search/sort/menu p95 stays within 100ms (${JSON.stringify(p95)})`);
  performanceReceipts.push({ profile: "compact-64-projects", firstUsableListMs, searchSamples: 20, sortSamples: 20, menuSamples: 10, p95, reducedMotion: true });
  await noOverflow(largePage, "compact 64-project library");
  await largeContext.close();

  equal(pageErrors, [], "real browser produced zero page errors");
  equal(consoleErrors, [], "real browser produced zero console errors");
  equal(requests.filter(request => request.disposition === "blocked"), [], "all flows produced zero external/provider/AI requests");

  const result = {
    kind: "spec0011-phase3-browser-proof",
    version: 1,
    status: "PASS",
    url,
    assertions,
    operations,
    screenshots,
    profiles: ["1440x900", "390x844 reduced-motion", "320x568 forced-colors", "720x450 200%-zoom equivalent"],
    performanceReceipts,
    storageReceipts,
    requestLedger: requests,
    externalRequests: 0,
    providerRequests: 0,
    aiRequests: 0,
    paidRequests: 0,
    pageErrors,
    consoleErrors,
    physicalDeviceProof: false,
    nonChromiumProof: false,
    createdAt: new Date().toISOString(),
  };
  const resultPath = resolve(outputRoot, "result.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", assertions, operations: operations.length, screenshots: screenshots.length, resultPath, sha256: createHash("sha256").update(JSON.stringify(result)).digest("hex") }));
} finally {
  await browser.close();
}
