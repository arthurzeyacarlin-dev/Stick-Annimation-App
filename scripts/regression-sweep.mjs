// Regression sweep (PM4, 2026-10-16): draws with every tool in a headless Chrome and checks where the ink lands.
// Run: start the app on port 58680, then `node scripts/regression-sweep.mjs`. Needs system Google Chrome and playwright-core.
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

// T1 pencil
await newBlank(); let m0 = await measure();
await page.keyboard.press("p"); await drag(200, 150, 500, 300);
let m = await measure(); note("Pencil draws where you draw", bboxNear(m, 200, 150, 500, 300, 30), fmt(m));
// T11 undo
await page.keyboard.press("Meta+z"); await page.waitForTimeout(700); m = await measure();
note("Undo removes the stroke", m.dark <= m0.dark + 5, fmt(m));
await page.keyboard.press("Meta+Shift+z"); await page.waitForTimeout(500);

// T2 eraser
await newBlank(); await page.keyboard.press("p"); await drag(150, 200, 650, 200); let before = await measure();
await page.keyboard.press("e"); await drag(350, 200, 450, 200); await page.waitForTimeout(300); m = await measure();
note("Eraser removes ink under it", m.dark < before.dark * 0.9 && near(m.minX, before.minX, 20), `before ${fmt(before)} after ${fmt(m)}`);

// T3 fill
await newBlank(); await page.keyboard.press("p");
await drag(200, 150, 450, 150); await drag(450, 150, 450, 300); await drag(450, 300, 200, 300); await drag(200, 300, 200, 150);
before = await measure(); await page.keyboard.press("f"); await click(320, 220); m = await measure();
note("Fill fills the closed shape", m.nonWhite > before.nonWhite + 4000, `non-white before ${before.nonWhite} after ${m.nonWhite}`);

// T4 shape
await newBlank(); await page.keyboard.press("s"); await drag(250, 180, 480, 320); await page.keyboard.press("p"); await page.waitForTimeout(400); m = await measure();
note("Shape lands where you drag", m.dark + m.nonWhite > 0 && (m.nonWhite > 300) && near((m.minX + m.maxX) / 2, 365, 60), `nonWhite=${m.nonWhite} ${fmt(m)}`);

// T5 text
await newBlank(); await page.keyboard.press("t"); await click(300, 250); await page.keyboard.type("Hi there"); await page.keyboard.press("Escape"); await page.waitForTimeout(500);
await page.keyboard.press("p"); await page.waitForTimeout(300); m = await measure();
note("Text appears where you click", m.nonWhite > 40 && near(m.minX, 300, 70) && near(m.minY, 250, 70), `nonWhite=${m.nonWhite} ${fmt(m)}`);

// T6 lasso move
await newBlank(); await page.keyboard.press("p"); await drag(200, 200, 400, 260); before = await measure();
await page.keyboard.press("l");
const [lx, ly] = abs(300, 230);
await page.mouse.move(...abs(170, 170)); await page.mouse.down();
for (const [px, py] of [[430, 170], [430, 300], [170, 300], [170, 170]]) await page.mouse.move(...abs(px, py), { steps: 6 });
await page.mouse.up(); await page.waitForTimeout(600);
await drag(300, 230, 450, 330); await page.keyboard.press("p"); await page.waitForTimeout(500); m = await measure();
note("Lasso select + move shifts the drawing", near(m.minX - before.minX, 150, 35) && near(m.minY - before.minY, 100, 35), `before ${fmt(before)} after ${fmt(m)}`);

// T7 box select move
await newBlank(); await page.keyboard.press("p"); await drag(200, 200, 400, 260); before = await measure();
await page.keyboard.press("m"); await drag(170, 170, 430, 300); await drag(300, 230, 450, 330); await page.keyboard.press("p"); await page.waitForTimeout(500); m = await measure();
note("Select box + move shifts the drawing", near(m.minX - before.minX, 150, 35) && near(m.minY - before.minY, 100, 35), `before ${fmt(before)} after ${fmt(m)}`);

// T8 knife
await newBlank(); await page.keyboard.press("p");
for (let k = 0; k < 6; k++) await drag(200, 200 + k * 3, 500, 200 + k * 3, 8);
before = await measure(); await page.keyboard.press("k"); await drag(350, 150, 350, 280, 10); await page.waitForTimeout(700); m = await measure();
note("Knife keeps both pieces visible", m.dark > before.dark * 0.6 && near(m.minX, before.minX, 40) && near(m.maxX, before.maxX, 40), `before ${fmt(before)} after ${fmt(m)}`);

// T9 copy / paste same frame, T10 other frame
await newBlank(); await page.keyboard.press("p"); await drag(200, 200, 400, 260);
const strokeOnly = await measure();
await page.keyboard.press("m"); await drag(170, 170, 430, 300); await page.waitForTimeout(400);
const sel = await measure();
await page.keyboard.press("Meta+c"); await page.keyboard.press("Meta+v"); await page.waitForTimeout(800);
await page.keyboard.press("p"); await page.waitForTimeout(400); m = await measure();
note("Copy + Paste on the same frame makes a visible copy", m.dark > strokeOnly.dark * 1.6 && m.maxX > strokeOnly.maxX + 8, `stroke ${fmt(strokeOnly)} after paste ${fmt(m)}`);
// new frame (clipboard kept), paste there
await page.keyboard.press("F7"); await page.waitForTimeout(800); await page.keyboard.press("m"); await page.waitForTimeout(200);
const blank = await measure();
await page.keyboard.press("Meta+v"); await page.waitForTimeout(900); await page.keyboard.press("p"); await page.waitForTimeout(400); m = await measure();
note("Paste on ANOTHER frame puts the drawing there", blank.dark < 30 && m.dark > 200 && near(m.minX, 200, 40) && near(m.minY, 200, 40), `blank ${fmt(blank)} after paste ${fmt(m)}`);

// T12 timeline smoke
const cellCount = () => page.evaluate(() => new Set([...document.querySelectorAll("[data-timeline-cell]")].filter(c => c.getBoundingClientRect().width > 0).map(c => c.dataset.layerId + ":" + c.dataset.frameIndex)).size);
const c0 = await cellCount(); await page.keyboard.press("F6"); await page.waitForTimeout(400); await page.keyboard.press("F5"); await page.waitForTimeout(400);
const c1 = await cellCount(); await page.keyboard.press("Meta+z"); await page.waitForTimeout(500); await page.keyboard.press("Meta+z"); await page.waitForTimeout(600);
const c2 = await cellCount();
note("Timeline insert + undo", c1 === c0 + 2 && c2 === c0, `cells ${c0} -> ${c1} -> ${c2}`);

// T13 layers
const layersBefore = await page.evaluate(() => new Set([...document.querySelectorAll("[data-timeline-cell]")].map(c => c.dataset.layerId)).size);
await page.getByRole("button", { name: "Add layer" }).first().click(); await page.waitForTimeout(800);
const layersAfter = await page.evaluate(() => new Set([...document.querySelectorAll("[data-timeline-cell]")].map(c => c.dataset.layerId)).size);
note("Add layer", layersAfter === layersBefore + 1, `${layersBefore} -> ${layersAfter}`);

// T14 save + reopen
await page.keyboard.press("Meta+s");
let status = "?";
for (let t = 0; t < 30; t++) { await page.waitForTimeout(1000); status = await page.evaluate(() => document.body.innerText.match(/Saved to your account|Unsaved changes|Saving…?|Save failed[^\n]*/)?.[0] || "?"); if (/Saved to|failed/.test(status)) break; }
note("Save works", /Saved to/.test(status), status);
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Open Project/i }).first().waitFor({ timeout: 90000 });
await page.waitForTimeout(2500);
const dismiss = page.getByRole("button", { name: /Discard Draft/i });
if (await dismiss.count()) { await dismiss.first().click(); await page.waitForTimeout(2500); if (await dismiss.count()) { await dismiss.first().click(); await page.waitForTimeout(2500); } }
await page.getByRole("button", { name: /Open Project/i }).first().click({ force: true });
await page.waitForTimeout(3000);
const card = page.locator("button, a").filter({ hasText: /Untitled Project/ }).first();
await card.click({ force: true }).catch(() => {});
await page.waitForTimeout(9000);
m = await measure();
note("Saved project reopens with the drawing", m.dark > 150, fmt(m));
console.log("PAGE ERRORS", JSON.stringify(errors.slice(0, 5)));
const failed = results.filter(r => !r.ok).length;
console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
await browser.close();
