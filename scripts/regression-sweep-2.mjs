// Regression sweep 2 (PM4, 2026-10-16): symbols, assets, zoom, layer eye, onion skin, small window.
// Run: start the app on port 58680, then `node scripts/regression-sweep-2.mjs`. Needs system Google Chrome and playwright-core.
import { chromium } from "playwright-core";
import crypto from "node:crypto";
const email = `sweep${Date.now()}@example.com`;
const pw = crypto.randomBytes(9).toString("base64url") + "aA1";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 140)));
await page.goto("http://localhost:58680/", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(6000);
for (let t = 0; t < 4; t++) { await page.getByRole("button", { name: /Create account/i }).first().click().catch(() => {}); await page.waitForTimeout(2500); if (await page.locator("input").count()) break; }
await page.locator("input").first().waitFor({ timeout: 60000 });
await page.locator("input:not([type=email]):not([type=password])").first().fill("Sweep Tester");
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', pw);
await page.getByRole("button", { name: "Create account", exact: true }).click();
await page.getByRole("button", { name: /New Project/i }).first().waitFor({ timeout: 120000 });
await page.waitForTimeout(3000);
const dont = page.getByRole("button", { name: /Don.?t show again/i });
if (await dont.count()) { await dont.first().click(); await page.waitForTimeout(800); }
await page.getByRole("button", { name: /New Project/i }).first().click({ force: true });
await page.waitForTimeout(8000);

const CLIP = { x: 110, y: 190, width: 800, height: 570 };
const results = [];
const note = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + " — " + detail); };
async function measure() {
  const buf = await page.screenshot({ clip: CLIP });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, dark = 0, nonWhite = 0;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      const i = (yy * c.width + xx) * 4; const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r + g + b < 690) nonWhite++;
      if (r < 90 && g < 90 && b < 90) { dark++; if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
    }
    return { dark, nonWhite, minX, minY, maxX, maxY };
  }, buf.toString("base64"));
}
const abs = (x, y) => [CLIP.x + x, CLIP.y + y];
async function drag(x1, y1, x2, y2, steps = 12) { const [a, b] = abs(x1, y1), [c, d] = abs(x2, y2); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move(c, d, { steps }); await page.mouse.up(); await page.waitForTimeout(250); }
async function click(x, y) { const [a, b] = abs(x, y); await page.mouse.click(a, b); await page.waitForTimeout(300); }
async function newBlank() { await page.keyboard.press("p"); await page.keyboard.press("F7"); await page.waitForTimeout(700); }
const near = (v, e, t) => Math.abs(v - e) <= t;
const bboxNear = (m, x1, y1, x2, y2, t) => m.dark > 0 && near(m.minX, Math.min(x1, x2), t) && near(m.maxX, Math.max(x1, x2), t) && near(m.minY, Math.min(y1, y2), t) && near(m.maxY, Math.max(y1, y2), t);
const fmt = m => `n=${m.dark} bbox=[${m.minX},${m.minY}..${m.maxX},${m.maxY}]`;

let m;
const rightTab = async (name) => { await page.getByRole("button", { name, exact: true }).first().click({ force: true }).catch(() => {}); await page.waitForTimeout(500); };
const symbolCount = () => page.evaluate(() => document.querySelectorAll("[data-unified-symbol-instance]").length);

// S3 make a symbol from a drawing, then place it from the Library
await newBlank(); await page.keyboard.press("p"); await drag(250, 200, 420, 280);
await page.keyboard.press("m"); await drag(220, 170, 450, 310); await page.waitForTimeout(500);
await page.screenshot({ path: "draw-selected.png", clip: { x: 110, y: 190, width: 800, height: 570 } });
const conv = page.getByRole("button", { name: /Convert to Symbol/i }).first();
let made = false;
if (await conv.count()) {
  await conv.click(); await page.waitForTimeout(700);
  const nameInput = page.getByLabel("Symbol name");
  if (await nameInput.count()) { await nameInput.fill("Sweep sym " + Date.now().toString().slice(-4)); await page.keyboard.press("Enter"); await page.waitForTimeout(1800); }
}
await newBlank();
await rightTab("Library");
const libItem = page.locator("[draggable=true]").first();
let placed = false;
if (await libItem.count()) {
  console.log("LIB ITEMS", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[draggable=true]")].map(e => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 40)))));
  const canvasEl = page.locator("canvas[data-workspace-canvas='editable']").first();
  await libItem.dragTo(canvasEl, { targetPosition: { x: 400, y: 300 } }).catch(e => console.log("dragTo error", String(e).slice(0, 100)));
  await page.waitForTimeout(1800);
  const afterDrop = await measure();
  console.log("AFTER DROP", fmt(afterDrop), "nonWhite", afterDrop.nonWhite, "symbols", await symbolCount(), "placeholder", await page.evaluate(() => ({ imgs: document.querySelectorAll("img[src^='data:']").length, svgimgs: document.querySelectorAll("svg image").length })));
  await page.keyboard.press("m"); await click(700, 500); await page.waitForTimeout(700);
  placed = (await symbolCount()) > 0 || afterDrop.nonWhite > 500;
}
note("Create a symbol and place it from the Library", placed, `symbols on frame: ${await symbolCount()}`);

// S4 symbol: select, move, delete
if (placed) {
  await page.keyboard.press("m"); await page.waitForTimeout(300);
  const hit = page.locator("[data-symbol-hit-target]").first();
  const b0 = await hit.boundingBox();
  await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2); await page.waitForTimeout(500);
  await page.screenshot({ path: "symbol-selected.png", clip: { x: 110, y: 190, width: 800, height: 570 } });
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await page.mouse.down(); await page.mouse.move(b0.x + b0.width / 2 + 120, b0.y + b0.height / 2 + 60, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(700);
  const b1 = await page.locator("[data-symbol-hit-target]").first().boundingBox();
  note("Symbol moves with the Select tool", near(b1.x - b0.x, 120, 25) && near(b1.y - b0.y, 60, 25), `moved by ${Math.round(b1.x - b0.x)},${Math.round(b1.y - b0.y)}`);
  const before = await symbolCount();
  await page.keyboard.press("Delete"); await page.waitForTimeout(700);
  const after = await symbolCount();
  note("Symbol deletes with Delete", after === before - 1, `${before} -> ${after}`);
}

// S5 zoom: draw while zoomed in
await newBlank(); await page.keyboard.press("p"); await page.keyboard.press("Meta+="); await page.waitForTimeout(500);
await drag(250, 200, 550, 350); m = await measure();
note("Drawing while zoomed in lands under the pointer", bboxNear(m, 250, 200, 550, 350, 30), fmt(m));
await page.keyboard.press("Meta+0"); await page.waitForTimeout(400);

// S6 layer eye: ink hides when its layer is hidden
await newBlank(); await page.keyboard.press("p"); await drag(200, 200, 450, 260); const inkOn = await measure();
await page.getByRole("button", { name: "Add layer" }).first().click(); await page.waitForTimeout(900);
const eyes = page.locator("button[aria-label^='Hide '], button[aria-label^='Show ']");
const l2 = await page.evaluate(() => { const ids = [...new Set([...document.querySelectorAll("[data-timeline-cell]")].map(c => c.dataset.layerId))]; const c = [...document.querySelectorAll('[data-timeline-cell][data-layer-id="' + ids[ids.length - 1] + '"][data-frame-index="0"]')].filter(x => x.getBoundingClientRect().width > 0).pop(); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.click(l2.x, l2.y); await page.waitForTimeout(800);
const eyeCount = await eyes.count();
let eyeOk = false, eyeDetail = `eye buttons: ${eyeCount}`;
if (eyeCount) { await page.locator("button[aria-label='Hide Layer 1']").last().click({ force: true }); await page.waitForTimeout(700); const off = await measure(); eyeOk = off.dark < inkOn.dark * 0.3; eyeDetail += `, ink ${inkOn.dark} -> ${off.dark}`; }
note("Layer eye hides that layer's drawing", eyeOk, eyeDetail);

// S7 onion skin + play + export dialog
let smokeErr = errors.length;
await page.keyboard.press("F6"); await page.waitForTimeout(500);
await page.getByText("View", { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
await page.getByText("Onion Skin", { exact: false }).first().click().catch(() => {}); await page.waitForTimeout(500);
await page.keyboard.press("Enter"); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
note("Onion skin + play run without errors", errors.length === smokeErr, `new page errors: ${errors.length - smokeErr}`);

// S8 small window (tablet width)
await page.setViewportSize({ width: 880, height: 700 }); await page.waitForTimeout(1500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
note("Small window has no sideways scrolling", !overflow, `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} vs ${880}`);
await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(800);

console.log("PAGE ERRORS", JSON.stringify(errors.slice(0, 5)));
const failed = results.filter(r => !r.ok).length;
console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
await browser.close();
