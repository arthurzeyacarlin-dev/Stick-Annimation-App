import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56770/";
assert.match(url, /^http:\/\/127\.0\.0\.1:(?!3000\/)[0-9]+\/$/);
const output = resolve("output/spec-0006/phase-7/browser");
mkdirSync(output, { recursive: true });
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
const matrix = JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v2/phase7-acceptance-cases.json", "utf8"));
const requests: Array<{ method: string; origin: string; path: string; disposition: string }> = [];
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const profiles: unknown[] = [];

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});

const configure = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const request = route.request();
    const parsed = new URL(request.url());
    const sameOrigin = parsed.origin === new URL(url).origin;
    const mockedAvailability = sameOrigin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const mockedFavicon = sameOrigin && parsed.pathname === "/favicon.ico";
    const allowed = sameOrigin && !parsed.pathname.startsWith("/api/");
    const disposition = mockedAvailability ? "fulfilled-disabled-ai" : mockedFavicon ? "fulfilled-empty-icon" : allowed ? "loopback" : "blocked";
    requests.push({ method: request.method(), origin: parsed.origin, path: parsed.pathname, disposition });
    if (mockedAvailability) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"reason":"phase7-proof"}' });
    else if (mockedFavicon) await route.fulfill({ status: 204, body: "" });
    else if (allowed) await route.continue();
    else await route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_seen", "1");
    const record = (entry: string) => {
      const current = JSON.parse(document.documentElement?.dataset.phase7Writes ?? "[]");
      current.push(entry);
      if (document.documentElement) document.documentElement.dataset.phase7Writes = JSON.stringify(current);
    };
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) { record(`localStorage.set:${key}`); return set.call(this, key, value); };
    Storage.prototype.removeItem = function(key) { record(`localStorage.remove:${key}`); return remove.call(this, key); };
    for (const operation of ["put", "add", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[operation];
      Object.defineProperty(IDBObjectStore.prototype, operation, {
        configurable: true,
        value: function(this: IDBObjectStore, ...args: unknown[]) {
          record(`idb.${operation}:${this.transaction.db.name}:${this.name}`);
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
};

const openNew = async (page: Page) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.getByRole("button", { name: "File", exact: true }).waitFor();
};

const audit = async (page: Page) => {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (root: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[]; html: string; failureSummary: string }> }> }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
    return result.violations.filter(violation => violation.impact === "critical" || violation.impact === "serious").map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })) }));
  });
};

try {
  for (const profile of matrix.profiles as Array<{ name: string; width: number; height: number; deviceScaleFactor: number }>) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.deviceScaleFactor, reducedMotion: "reduce", serviceWorkers: "block" });
    await configure(context);
    const page = await context.newPage();
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(`${profile.name}:${message.text()}`); });
    page.on("pageerror", error => pageErrors.push(`${profile.name}:${error.message}`));
    await openNew(page);

    assert.equal(await page.getByText("Untitled Project", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /Drawing Animation|Stick Figure Animation/ }).count(), 0);
    for (const name of ["Stick Figure Tools", "Properties", "Library", "Assets"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
    for (const name of ["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
    const ordinaryText = await page.locator("body").innerText();
    for (const forbidden of ["MIXED-REALISTIC-01", "DRAWING + STICK", "phase7", "fixture picker"]) assert.equal(ordinaryText.includes(forbidden), false);
    const stage = await page.locator('[data-workspace-stage-guide="camera"]').boundingBox();
    assert.ok(stage && stage.width >= 260 && stage.height >= 146, `${profile.name}: usable stage`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${profile.name}: no page overflow`);

    await page.getByRole("button", { name: "Stick Figure Tools", exact: true }).click();
    const creator = page.getByRole("button", { name: "Open Stick Figure Creator", exact: true });
    const before = await page.evaluate(() => ({ title: document.body.innerText.includes("Untitled Project"), status: document.querySelector('[role="status"]')?.textContent, stage: document.querySelector<HTMLElement>('[data-workspace-stage-guide="camera"]')?.getBoundingClientRect().toJSON() }));
    await creator.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Stick Figure Creator", exact: true });
    await dialog.waitFor();
    assert.equal(await page.getByRole("button", { name: "Save Stick Figure", exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Back", `${profile.name}: Creator receives keyboard focus`);
    const creatorAudit = await audit(page);
    assert.deepEqual(creatorAudit, [], `${profile.name}: Creator critical/serious accessibility findings`);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open Stick Figure Creator");
    assert.equal(await creator.evaluate(element => element === document.activeElement), true, `${profile.name}: Back restores visible trigger focus`);
    const after = await page.evaluate(() => ({ title: document.body.innerText.includes("Untitled Project"), status: document.querySelector('[role="status"]')?.textContent, stage: document.querySelector<HTMLElement>('[data-workspace-stage-guide="camera"]')?.getBoundingClientRect().toJSON() }));
    assert.equal(after.title, before.title);
    assert.equal(after.status, before.status);
    assert.ok(before.stage && after.stage && Math.abs(after.stage.width - before.stage.width) < 1 && Math.abs(after.stage.height - before.stage.height) < 1, `${profile.name}: Creator preserves view`);

    await page.evaluate(() => { document.documentElement.dataset.phase7Writes = "[]"; });
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
    const writes = await page.evaluate(() => JSON.parse(document.documentElement.dataset.phase7Writes ?? "[]") as string[]);
    assert.ok(writes.some(entry => entry.includes("diamond-animation-unified-v2")), `${profile.name}: canonical V2 write observed`);
    assert.deepEqual(writes.filter(entry => entry.startsWith("localStorage") || (entry.startsWith("idb.") && !entry.includes("diamond-animation-unified-v2"))), [], `${profile.name}: zero legacy writes`);

    const workspaceAudit = await audit(page);
    assert.deepEqual(workspaceAudit, [], `${profile.name}: workspace critical/serious accessibility findings`);
    const reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    assert.equal(reducedMotion, true);

    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.waitForTimeout(120);
    assert.equal(await page.getByRole("button", { name: "File", exact: true }).isVisible(), true, `${profile.name}: File reachable at 200% zoom`);
    await page.getByRole("button", { name: "Stick Figure Tools", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Open Stick Figure Creator", exact: true }).isVisible(), true, `${profile.name}: Creator reachable at 200% zoom`);
    await page.screenshot({ path: resolve(output, `${profile.name}-200-percent.png`), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    await page.screenshot({ path: resolve(output, `${profile.name}-ordinary.png`), fullPage: true });
    writeFileSync(resolve(output, `${profile.name}.a11y.txt`), await page.locator("body").ariaSnapshot());

    profiles.push({ profile, stage, writes, creatorAudit, workspaceAudit, reducedMotion, zoom: "200%", creatorRoundTrip: "PASS" });
    await context.close();
  }
} finally {
  await browser.close();
}

assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.equal(requests.filter(request => request.disposition === "blocked").length, 0);
const result = { status: "PASS", url, profiles, requests, externalRequests: 0, realApiRequests: 0, consoleErrors, pageErrors, limitations: matrix.limitations };
writeFileSync(resolve(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: "PASS", profiles: profiles.length, requests: requests.length, externalRequests: 0, realApiRequests: 0 }));
