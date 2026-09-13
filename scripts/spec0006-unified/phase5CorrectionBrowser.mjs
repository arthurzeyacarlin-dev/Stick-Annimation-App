// Real UI replay through the repository's Playwright CLI skill. No React state
// injection, seeded project records, synthetic DOM clicks, or external services.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Invoke the already-installed CLI directly: no npm registry resolution.
const cli = "/Users/arthurcarlin/.npm/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js";
const output = "output/spec-0006/phase-5";
mkdirSync(output, { recursive: true });
const profile = process.argv[2] ?? "desktop";
const session = process.env.SPEC0006_BROWSER_SESSION ?? "p5third";
const stressOnly = process.argv.includes("--gesture-stress");
const replayName = stressOnly ? "gesture" : "correction3";
assert.ok(["desktop", "compact"].includes(profile));
const ledger = { profile, startedAt: new Date().toISOString(), steps: [], status: "RUNNING" };
const saveLedger = () => writeFileSync(`${output}/${replayName}-${profile}.json`, JSON.stringify(ledger, null, 2) + "\n");

async function helpers(page) {
  const network = { requests: [], errors: [] };
  const timelineClicks = [];
  await page.unroute("**/*");
  await page.route("**/*", route => {
    const url = route.request().url(); network.requests.push(url);
    return (url.startsWith("http://127.0.0.1:56555/") && !url.startsWith("http://127.0.0.1:56555/api/")) || url.startsWith("data:") || url.startsWith("blob:") ? route.continue() : route.abort();
  });
  page.on("pageerror", error => network.errors.push(String(error)));
  const button = name => page.getByRole("button", { name, exact: true });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const canvasView = async () => { await button("Select").scrollIntoViewIfNeeded(); await settle(); };
  const menuAction = async name => {
    await button(name).click();
    await settle();
  };
  const panelTab = async name => {
    await button(name).click();
  };
  const point = (x, y) => page.locator('svg[aria-label="Editable stick figure content"]').evaluate((svg, p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y };
  }, { x, y });
  const drag = async (a, b, steps = 16) => {
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up(); await settle();
  };
  const stroke = async (a, b) => { await button("Brush").click(); await canvasView(); await drag(await point(...a), await point(...b)); };
  const limb = async (a, b) => { await panelTab("Stick Figure Tools"); await button("Add Limb").click(); await canvasView(); await drag(await point(...a), await point(...b)); };
  const select = async (a, b, tool = "Select") => {
    await button(tool).click();
    await canvasView();
    if (tool === "Select") await drag(await point(...a), await point(...b));
    else {
      const points = [a, [b[0], a[1]], b, [a[0], b[1]], a];
      const first = await point(...a); await page.mouse.move(first.x, first.y); await page.mouse.down();
      for (const p of points.slice(1)) { const q = await point(...p); await page.mouse.move(q.x, q.y, { steps: 8 }); }
      await page.mouse.up(); await settle();
    }
  };
  const frame = (layer, index) => ({ click: async options => {
    const target=page.locator(`button[data-timeline-cell][data-layer-id="${layer}"][data-frame-index="${index}"]`).last();
    await target.scrollIntoViewIfNeeded();
    await settle();
    const hit = await target.evaluate(cell => {
      const rect = cell.getBoundingClientRect();
      const hitCell = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("[data-timeline-cell]");
      return { layer: hitCell?.getAttribute("data-layer-id"), index: Number(hitCell?.getAttribute("data-frame-index")), width: rect.width, height: rect.height };
    });
    if (hit.layer !== layer || hit.index !== index || hit.width <= 0 || hit.height <= 0) throw new Error("timeline cell does not own its visible hit target: " + JSON.stringify(hit));
    await target.click(options);
    timelineClicks.push({...hit, button: options?.button ?? "left"});
    await settle();
  }});
  const addFrame = async (layer, kind = "Insert Blank Keyframe") => {
    const target=page.locator(`button[data-timeline-cell][data-layer-id="${layer}"]`).last();
    await frame(layer, Number(await target.getAttribute("data-frame-index"))).click({button:"right"});
    await settle(); await menuAction(kind);
  };
  const convert = async name => {
    await page.getByRole("button", { name: /^Convert to Symbol/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill(name);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await dialog.waitFor({ state: "hidden" }); await settle();
  };
  const place = async (name, x, y) => {
    const away = await point(960, 500); await page.mouse.move(away.x, away.y); await settle();
    await panelTab("Library");
    const item = page.getByText(name, { exact: true }); await item.scrollIntoViewIfNeeded();
    await canvasView();
    const box = await item.boundingBox(); const target = await point(x, y);
    await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, target, 25);
    await button("Commit Placement").click(); await settle();
  };
  const readCanvas = role => page.locator(`canvas[data-workspace-canvas="${role}"]`).evaluate(async canvas => {
    const ctx = canvas.getContext("2d"); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0, left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    const colors = {};
    for (let i = 3; i < data.length; i += 4) if (data[i] > 32) {
      count++; const pixel = (i - 3) / 4, x = pixel % canvas.width, y = Math.floor(pixel / canvas.width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      if (data[i] > 100) { const key = [...data.slice(i - 3, i + 1)].join(","); colors[key] = (colors[key] ?? 0) + 1; }
    }
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(n => n.toString(16).padStart(2, "0")).join("");
    const rect = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, count, digest,
      clientBounds: count ? { left: rect.x + left * rect.width / canvas.width, top: rect.y + top * rect.height / canvas.height,
        right: rect.x + right * rect.width / canvas.width, bottom: rect.y + bottom * rect.height / canvas.height } : null,
      colors: Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 12) };
  });
  const readUnselectedPixels = () => page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async canvas => {
    const svg=document.querySelector('svg[aria-label="Editable stick figure content"]'),matrix=svg.getScreenCTM(),rect=canvas.getBoundingClientRect();
    const a=new DOMPoint(1400,750).matrixTransform(matrix),b=new DOMPoint(1650,940).matrixTransform(matrix);
    const x=Math.round((a.x-rect.x)*canvas.width/rect.width),y=Math.round((a.y-rect.y)*canvas.height/rect.height);
    const width=Math.round((b.x-a.x)*canvas.width/rect.width),height=Math.round((b.y-a.y)*canvas.height/rect.height);
    const data=canvas.getContext("2d").getImageData(x,y,width,height).data;
    let count=0;for(let i=3;i<data.length;i+=4)if(data[i]>32)count++;
    const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",data))].map(n=>n.toString(16).padStart(2,"0")).join("");
    return{width,height,count,digest};
  });
  const symbols = () => page.locator("[data-unified-symbol-instance]").evaluateAll(groups => groups.map(g => ({
    id: g.dataset.unifiedSymbolInstance, transform: g.getAttribute("transform"),
    joints: [...g.querySelectorAll("[data-symbol-joint]")].map(c => ({ x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), r: +c.getAttribute("r") })),
    limbs: [...g.querySelectorAll("[data-symbol-segment]")].map(l => ({ x1: +l.getAttribute("x1"), y1: +l.getAttribute("y1"), x2: +l.getAttribute("x2"), y2: +l.getAttribute("y2"), width: +l.getAttribute("stroke-width"), cap: l.getAttribute("stroke-linecap") })),
    images: g.querySelectorAll("image").length,
  })));
  const savedProject = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open("diamond-animation-unified-v2", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const records = await new Promise((resolve, reject) => { const r = db.transaction("projects").objectStore("projects").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); const project = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const clone = structuredClone(project);
    for (const layer of clone.compatibility.drawingData.layers) for (const frame of layer.timelineFrames) {
      if (!frame.bitmap) continue;
      const data = new Uint8Array(frame.bitmap.data);
      frame.bitmap = { width: frame.bitmap.width, height: frame.bitmap.height,
        hash: [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(n => n.toString(16).padStart(2, "0")).join("") };
      delete frame.previewUrl;
    }
    for(const layer of clone.document.layers) for(const cell of layer.cells) for(const item of cell.content?.items ?? []) {
      if(item.bitmap?.data) { const data=new Uint8Array(item.bitmap.data); item.bitmap={...item.bitmap,
        hash:[...new Uint8Array(await crypto.subtle.digest("SHA-256",data))].map(n=>n.toString(16).padStart(2,"0")).join("")};delete item.bitmap.data; }
    }
    const documentLayers=clone.document.layers;delete clone.document;
    return { ...clone, catalogs: project.document.catalogs, documentLayers };
  });
  const save = async () => { await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor(); await settle(); return savedProject(); };
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  return { button, settle, point, drag, stroke, limb, select, frame, addFrame, convert, place, readCanvas, readUnselectedPixels, symbols, save, savedProject, check, network, menuAction, timelineClicks };
}

function step(name, action, argument = profile) {
  const code = `async page => { const h = await (${helpers.toString()})(page); const result = await (${action.toString()})(page, h, ${JSON.stringify(argument)}); h.check(h.network.errors.length === 0 && h.network.requests.every(url => (url.startsWith("http://127.0.0.1:56555/") && !url.startsWith("http://127.0.0.1:56555/api/")) || url.startsWith("data:") || url.startsWith("blob:")), "external/API request or page error"); const profileMetrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})); const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth); h.check(overflow===0,"horizontal page overflow"); return {...result, profileMetrics, overflow, timelineClicks:h.timelineClicks, network: h.network}; }`;
  const result = spawnSync(process.execPath, [cli, `-s=${session}`, "run-code", code], { encoding: "utf8", timeout: 600000, maxBuffer: 12 * 1024 * 1024 });
  const text = result.stdout ?? "";
  writeFileSync(`${output}/${replayName}-${profile}-${name}.log`, text + (result.stderr ?? ""));
  if (result.status !== 0 || !text.includes("### Result\n")) throw new Error(`${name}: ${text.slice(-2500)}`);
  const payload = JSON.parse(text.split("### Result\n")[1].split("\n###")[0].trim());
  assert.deepEqual(payload.profileMetrics, profile === "compact" ? {width:390,height:844,dpr:2} : {width:1440,height:900,dpr:1});
  ledger.steps.push({ name, at: new Date().toISOString(), result: payload }); saveLedger();
  console.log(`${profile}: ${name} PASS`);
  return payload;
}

try {
  if (!stressOnly) {
  step("boot", async (page, h, profile) => {
    const compact = profile === "compact";
    await page.setViewportSize({ width: compact ? 390 : 1440, height: compact ? 844 : 900 });
    await page.reload();
    const welcome = page.getByRole("dialog", { name: "Welcome to Diamond Animator" });
    const welcomeOpen = await welcome.count() && await welcome.evaluate(el => {
      for (let node=el; node; node=node.parentElement) { const style=getComputedStyle(node); if(style.display==="none"||style.visibility==="hidden"||Number(style.opacity)===0||style.pointerEvents==="none") return false; }
      return true;
    });
    if (welcomeOpen) await welcome.getByRole("button", { name: /show again/ }).click();
    await page.getByRole("button", { name: /^New Project/ }).click(); await h.settle();
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth - innerWidth }));
    h.check(metrics.width === (compact ? 390 : 1440) && metrics.height === (compact ? 844 : 900) && metrics.dpr === (compact ? 2 : 1), "profile mismatch");
    return {...metrics,timelineNavigation:"pointer"};
  });
  step("create-catalog", async (page, h) => {
    await h.stroke([220, 180], [440, 240]); await h.select([160, 120], [500, 300]);
    await page.getByRole("button", { name: /^Convert to Symbol/ }).click();
    const suggested = await page.getByRole("dialog").getByRole("textbox").inputValue();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await h.convert("");
    await h.button("Undo").click(); const restoredDrawing = await h.readCanvas("editable");
    await h.button("Redo").click(); const removedDrawing = await h.readCanvas("editable");
    h.check(restoredDrawing.count > 0 && removedDrawing.count === 0, "drawing conversion history");
    await h.limb([660, 180], [820, 320]); await h.select([600, 120], [880, 380]);
    await page.getByRole("button", { name: /^Convert to Symbol/ }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Symbol 1");
    await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
    const duplicate = await page.getByRole("dialog").getByRole("alert").innerText();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    const preservedStick = await page.locator('svg[aria-label="Editable stick figure content"] line').count();
    await h.convert("Rig"); await h.button("Undo").click();
    const restoredStick = await page.locator('svg[aria-label="Editable stick figure content"] line').count();
    await h.button("Redo").click();
    const removedStick = await page.locator('svg[aria-label="Editable stick figure content"] line').count();
    await h.stroke([1110, 160], [1290, 230]); await h.limb([1160, 200], [1320, 360]);
    await h.select([1050, 100], [1380, 420], "Lasso"); await h.convert("Mixed");
    await h.button("Undo").click(); const mixedDrawing = await h.readCanvas("editable");
    const mixedStick = await page.locator('svg[aria-label="Editable stick figure content"] line').count();
    await h.button("Redo").click(); const mixedRemoved = await h.readCanvas("editable");
    const saved = await h.save();
    h.check(suggested === "Symbol 1" && duplicate === "This symbol already exists." && preservedStick === 1 && restoredStick === 1 && removedStick === 0, "stick/dialog regression");
    h.check(mixedDrawing.count > 0 && mixedStick === 1 && mixedRemoved.count === 0, "mixed atomic history");
    h.check(saved.catalogs.symbols.length === 3 && !saved.catalogs.symbols[0].structuredPayload && saved.catalogs.symbols[1].structuredPayload?.drawingPngDataUrl === null && saved.catalogs.symbols[2].structuredPayload?.drawingPngDataUrl?.startsWith("data:image/png"), "structured categories");
    return { suggested, duplicate, preservedStick, restoredStick, removedStick, restoredDrawing, removedDrawing, mixedDrawing, mixedStick, mixedRemoved, saved };
  });
  step("instance-transforms", async (page, h, profile) => {
    await h.place("Rig", 800, 580); const baseline = (await h.symbols())[0];
    const resize = async (handle, dx, dy) => {
      const c = page.locator(`[data-symbol-resize-handle="${handle}"]`); const box = await c.boundingBox();
      await h.drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy });
      return (await h.symbols())[0];
    };
    const delta = profile === "compact" ? 16 : 65;
    const wide = await resize("e", delta, 0); await h.button("Undo").click(); const undoWide = (await h.symbols())[0]; await h.button("Redo").click(); const redoWide = (await h.symbols())[0];
    h.check(JSON.stringify(baseline) === JSON.stringify(undoWide) && JSON.stringify(wide) === JSON.stringify(redoWide), "width history");
    h.check(wide.joints.every((j, i) => j.y === baseline.joints[i].y) && wide.joints.some((j, i) => j.x !== baseline.joints[i].x), "width-only geometry");
    await h.button("Undo").click();
    const hit = page.locator("[data-symbol-hit-target]"); await hit.click();
    const tall = await resize("s", 0, delta);
    h.check(tall.joints.every((j, i) => j.x === baseline.joints[i].x) && tall.joints.some((j, i) => j.y !== baseline.joints[i].y), "height-only geometry");
    await h.button("Undo").click(); await hit.click(); const corner = await resize("se", delta, delta);
    h.check(corner.joints.some((j, i) => j.x !== baseline.joints[i].x) && corner.joints.some((j, i) => j.y !== baseline.joints[i].y), "corner geometry");
    h.check([baseline, wide, tall, corner].every(s => s.images === 0 && s.joints.every(j => j.r === 14) && s.limbs.every(l => l.width === 14 && l.cap === "round")), "constant rig styling");
    const screenLengths = () => page.locator("[data-symbol-segment]").evaluateAll(lines => lines.map(l => {
      const matrix=l.getScreenCTM(), a=new DOMPoint(+l.getAttribute("x1"),+l.getAttribute("y1")).matrixTransform(matrix), b=new DOMPoint(+l.getAttribute("x2"),+l.getAttribute("y2")).matrixTransform(matrix);
      return Math.hypot(b.x-a.x,b.y-a.y);
    }));
    const lengthsBefore=await screenLengths();
    await page.locator("[data-unified-symbol-properties]").getByRole("textbox",{name:"Rotation",exact:true}).fill("37");
    await h.settle();const rotated=(await h.symbols())[0], lengthsAfter=await screenLengths();
    h.check(lengthsBefore.every((n,i)=>Math.abs(n-lengthsAfter[i])<0.0001),"rotation changed segment length");
    await h.button("Undo").click();await h.button("Redo").click();
    await h.button("Flip X").click(); const flipped = (await h.symbols())[0]; await h.button("Undo").click(); await h.button("Redo").click();
    await h.button("Duplicate Instance").click(); const duplicated = await h.symbols();
    h.check(duplicated.length === 2 && duplicated[0].id !== duplicated[1].id, "instance independence");
    await h.button("Flip Y").click(); const independent = await h.symbols();
    h.check(JSON.stringify(independent[0]) === JSON.stringify(duplicated[0]), "second instance wrote first");
    await h.button("Delete Instance").click(); await h.button("Undo").click(); await h.button("Redo").click();
    // Remove the remaining test placement; the catalog remains immutable.
    await page.locator("[data-symbol-hit-target]").click(); await h.button("Delete Instance").click();
    return { baseline, wide, tall, corner, undoWide, redoWide, rotated, lengthsBefore, lengthsAfter, flipped, duplicated, independent };
  });
  for (const layer of ["layer-1", "layer-2"]) {
    step(`onion-${layer}`, async (page, h, {layer, profile}) => {
      if (layer === "layer-2") { await h.button("+ Layer").click(); await h.frame(layer, 0).click(); }
      const populate = async next => {
        const dy = next ? 150 : 0;
        await h.place("Symbol 1", 320, 560 + dy); await h.place("Rig", 840, 560 + dy); await h.place("Mixed", 1390, 560 + dy);
        await h.stroke([200, 160 + dy], [430, 190 + dy]); await h.limb([660, 140 + dy], [830, 220 + dy]);
        await h.button("Text").click(); const p = await h.point(1100, 130 + dy); await page.mouse.click(p.x, p.y); await h.button("Brush").click();
      };
      await populate(false); await h.addFrame(layer); await h.stroke([350, 900], [500, 930]); await h.addFrame(layer); await populate(true);
      await h.frame(layer, 1).click();
      const active = (await h.save()).compatibility.drawingData;
      h.check(active.currentFrameIndex === 1 && active.selectedTimelineIndex === 1 && active.activeLayerId === layer, "pointer click did not activate the middle frame/layer");
      const timelineLayout = await page.locator(".drawing-timeline").evaluate(timeline => {
        const panel=timeline.querySelector(".drawing-timeline-frames").getBoundingClientRect();
        const tabs=[...document.querySelectorAll("button")].filter(b=>["Stick Figure Tools","Properties","Library","Assets"].includes(b.textContent.trim()));
        return {laneWidth:panel.width,panelBottom:panel.bottom,tabTop:Math.min(...tabs.map(b=>b.getBoundingClientRect().top)),height:timeline.getBoundingClientRect().height};
      });
      h.check(timelineLayout.laneWidth > 50 && timelineLayout.panelBottom <= timelineLayout.tabTop, "timeline overlaps tabs or has no usable lane");
      const onionButton = h.button("Onion");
      const initiallyOn = await onionButton.evaluate(b => getComputedStyle(b).backgroundColor);
      // New projects start off; adding a layer retains the enabled state.
      if (layer === "layer-1") await onionButton.click();
      await h.settle(); const onion = await h.readCanvas("onion"); const source = await h.readCanvas("editable");
      h.check(onion.colors.some(([c]) => { const [r,g,b] = c.split(",").map(Number); return b > r && r > g; }) && onion.colors.some(([c]) => { const [r,g,b] = c.split(",").map(Number); return g > b && b > r; }), "missing unified purple/green");
      const samples = await page.evaluate(() => {
        const svg = document.querySelector('svg[aria-label="Editable stick figure content"]'); const matrix = svg.getScreenCTM();
        const c = document.querySelector('canvas[data-workspace-canvas="onion"]'), r = c.getBoundingClientRect(), ctx = c.getContext("2d");
        return ["previous", "next"].flatMap((direction, i) => [["drawing",315,175], ["stick",745,180], ["text",1180,155], ["drawing-symbol",320,560], ["stick-symbol",840,560], ["mixed-symbol",1390,560]].map(([kind,x,y]) => {
          const p = new DOMPoint(x,y+i*150).matrixTransform(matrix);
          const px=(p.x-r.x)*c.width/r.width, py=(p.y-r.y)*c.height/r.height;
          const size=Math.ceil(100*matrix.a*c.width/r.width); const left=Math.max(0,Math.floor(px-size)), top=Math.max(0,Math.floor(py-size));
          const d=ctx.getImageData(left,top,size*2,size*2).data; let purple=0,green=0,wrong=0;
          for(let a=3;a<d.length;a+=4)if(d[a]>100){
            const [red,g,b]=[d[a-3],d[a-2],d[a-1]];
            if(b>red&&red>g)purple++;else if(g>b&&b>red)green++;
            // Where previous and next overlap, source-over produces a blend
            // on the same purple/green line, not a third authoring palette.
            const t=Math.max(0,Math.min(1,(48*(red-44)-59*(g-122)+67*(b-91))/(48*48+59*59+67*67)));
            if(Math.abs(red-(44+48*t))>3||Math.abs(g-(122-59*t))>3||Math.abs(b-(91+67*t))>3)wrong++;
          }
          return {direction,kind,purple,green,wrong};
        }));
      });
      h.check(samples.every(s => s.wrong === 0 && (s.direction === "previous" ? s.purple : s.green) > 0), "a content category did not use unified tint: "+JSON.stringify(samples));
      await page.getByText("Project saved", {exact:true}).waitFor({state:"hidden"});
      await page.screenshot({ path: `output/spec-0006/phase-5/correction3-${profile}-${layer}-onion.png`, scale: "device" });
      await onionButton.click(); const disabled = await h.readCanvas("onion"); await onionButton.click();
      await h.button("Play").click(); await h.settle(); const playing = await h.readCanvas("onion"); await h.button("Pause").click(); await h.frame(layer,1).click();
      const after = await h.readCanvas("editable");
      h.check(disabled.count === 0 && playing.count === 0 && source.digest === after.digest, "onion toggle/playback source mutation");
      const saved = await h.save(); return { initiallyOn, onion, samples, source, disabled, playing, after, saved, active: {currentFrameIndex:active.currentFrameIndex,selectedTimelineIndex:active.selectedTimelineIndex,activeLayerId:active.activeLayerId}, timelineLayout };
    }, {layer, profile});
  }
  step("brush-commit", async (page,h) => {
    await h.frame("layer-2", 0).click(); await h.frame("layer-2", 1).click();
    const active = (await h.save()).compatibility.drawingData;
    h.check(active.currentFrameIndex === 1 && active.selectedTimelineIndex === 1 && active.activeLayerId === "layer-2", "brush preflight is not the active middle frame on layer 2");
    await h.button("Brush").click(); const before = await h.readCanvas("editable");
    const a=await h.point(140,360), b=await h.point(1760,820);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:40});await h.settle();
    const preview=await h.readCanvas("editable");await page.mouse.up();await h.settle();const commit=await h.readCanvas("editable");
    await h.button("Select").click();const settled=await h.readCanvas("editable");
    await h.button("Undo").click();const undo=await h.readCanvas("editable");await h.button("Redo").click();const redo=await h.readCanvas("editable");
    h.check(preview.digest===commit.digest&&commit.digest===settled.digest&&settled.digest===redo.digest&&undo.digest===before.digest,"brush commit/history pixels changed");
    await h.frame("layer-2",0).click();await h.frame("layer-2",1).click();const scrubbed=await h.readCanvas("editable");
    h.check(scrubbed.digest===commit.digest,"brush scrub pixels changed");
    const saved=await h.save();return{a,b,before,preview,commit,settled,undo,redo,scrubbed,saved};
  });
  step("reopen",async(page,h,profile)=>{
    const before=await h.readCanvas("editable"); const saved=await h.savedProject();
    await page.reload();await page.getByRole("button",{name:/^Open Project/}).click();
    await page.getByRole("button",{name:/Untitled Project/}).first().click();
    // Reopen starts with the normal collapsed timeline. Restore the reviewed
    // two-layer layout through its real resize handle before pixel comparison.
    const handle=page.locator('.drawing-timeline-frames div[style*="ns-resize"]').last();
    const handleBox=await handle.boundingBox(), rowBox=await page.locator("[data-timeline-cell]").last().boundingBox();
    await h.drag({x:handleBox.x+handleBox.width/2,y:handleBox.y+handleBox.height/2},{x:handleBox.x+handleBox.width/2,y:handleBox.y+handleBox.height/2+rowBox.height*2});
    await h.frame("layer-2",1).click();const after=await h.readCanvas("editable");
    h.check(before.digest===after.digest,"reopened brush mismatch");
    await h.frame("layer-2",0).click();const symbols=await h.symbols();
    h.check(symbols.length===3&&symbols[0].images===1&&symbols[1].images===0&&symbols[1].joints.length===2&&symbols[2].images===1&&symbols[2].joints.length===2,"reopened symbols mismatch");
    await h.frame("layer-2",1).click();await page.screenshot({path:`output/spec-0006/phase-5/correction3-${profile}-reopened.png`,scale:"device"});
    return{before,after,saved,symbols};
  });
  step("holds-dedupe-barrier",async(page,h)=>{
    const menu = async (index, name) => { await h.frame("layer-2",index).click({button:"right"});await h.menuAction(name);await h.settle(); };
    await menu(0,"Copy Frame");await menu(2,"Paste Frame");await h.frame("layer-2",1).click();await h.settle();
    const deduped=await h.readCanvas("onion");
    const green = c => c.colors.some(([key])=>{const[r,g,b]=key.split(",").map(Number);return g>b&&b>r;});
    h.check(deduped.count>0&&!green(deduped),"identical neighbor owners were not collapsed");
    await h.addFrame("layer-2","Insert Frame");await h.frame("layer-2",3).click();await h.settle();const held=await h.symbols();
    h.check(held.length===3,"hold lost owner symbols");
    const before=await h.save();await h.addFrame("layer-2");await h.addFrame("layer-2");await h.stroke([300,500],[500,600]);
    await h.frame("layer-2",3).click();await h.settle();const barrier=await h.readCanvas("onion");
    h.check(!green(barrier),"onion crossed explicit blank boundary");
    const saved=await h.save();return{deduped,held,before,barrier,saved};
  });
  step("selection-regressions",async(page,h,profile)=>{
    const results=[];
    const rig=()=>page.locator('svg[aria-label="Editable stick figure content"] circle').evaluateAll(cs=>cs.map(c=>({x:+c.getAttribute("cx"),y:+c.getAttribute("cy")})));
    for(const tool of ["Select","Lasso"]){
      await page.reload();await page.getByRole("button",{name:/^New Project/}).click();
      await h.limb([500,300],[850,600]);await h.select([430,230],[920,670],tool);const before=await rig();
      const selection=await page.evaluate(()=>window.__codexBitmapSelectionDebug);
      h.check(selection?.owner===(tool==="Select"?"select":"lasso"),"selection owner");
      const rect=selection.items[0].clientDisplayRect,dx=profile==="compact"?10:35,dy=profile==="compact"?6:20;
      await h.drag({x:rect.x+rect.width/2,y:rect.y+rect.height/2},{x:rect.x+rect.width/2+dx,y:rect.y+rect.height/2+dy});const moved=await rig();
      h.check(moved.length===2&&moved.every((j,i)=>j.x!==before[i].x&&j.y!==before[i].y),"ordinary selection did not move entire rig");
      await page.getByRole("button",{name:/^Duplicate/}).click();const duplicated=await rig();
      h.check(duplicated.length===4,"structured duplicate missing");
      await page.getByRole("button",{name:/^Flip X/}).click();const flipX=await rig();
      await page.getByRole("button",{name:/^Flip Y/}).click();const flipY=await rig();
      h.check(JSON.stringify(flipX.slice(0,2))===JSON.stringify(moved)&&JSON.stringify(flipY.slice(0,2))===JSON.stringify(moved),"flipping duplicate changed original");
      await page.getByRole("button",{name:/^Delete/}).click();const deleted=await rig();
      await h.button("Undo").click();const undo=await rig();await h.button("Redo").click();const redo=await rig();
      h.check(JSON.stringify(deleted)===JSON.stringify(moved)&&JSON.stringify(redo)===JSON.stringify(moved)&&undo.length===4,"structured delete history");
      const pixels=await h.readCanvas("editable");h.check(pixels.count===0,"stick selection leaked a raster proxy");
      await h.button("Stick Figure Tools").click();await h.button("Select / Move Joint").click();
      const p=await h.point(deleted[0].x,deleted[0].y);await h.drag(p,{x:p.x+dx,y:p.y-dy});const jointOnly=await rig();
      h.check(JSON.stringify(jointOnly[1])===JSON.stringify(deleted[1])&&JSON.stringify(jointOnly[0])!==JSON.stringify(deleted[0]),"joint tool stopped being joint-only");
      results.push({tool,before,moved,duplicated,flipX,flipY,deleted,undo,redo,pixels,jointOnly});
    }
    return{results};
  });
  } else {
    step("stick-first-gesture", async (page,h) => {
      await page.reload();
      const welcome=page.getByRole("dialog",{name:"Welcome to Diamond Animator"});
      if(await welcome.count() && await welcome.evaluate(el=>getComputedStyle(el).pointerEvents!=="none"&&getComputedStyle(el).opacity!=="0")) await welcome.getByRole("button",{name:/show again/}).click();
      await page.getByRole("button",{name:/^New Project/}).click();
      await h.button("Stick Figure Tools").click();await h.button("Add Limb").click();
      await h.button("Select").scrollIntoViewIfNeeded();await h.settle();
      const rig=()=>page.locator('svg[aria-label="Editable stick figure content"]').evaluate(svg=>({
        joints:[...svg.querySelectorAll("circle")].map(c=>({x:+c.getAttribute("cx"),y:+c.getAttribute("cy")})),
        limbs:[...svg.querySelectorAll("line")].map(l=>({x1:+l.getAttribute("x1"),y1:+l.getAttribute("y1"),x2:+l.getAttribute("x2"),y2:+l.getAttribute("y2")}))
      }));
      const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      const attempts=[];
      const gesture=async(a,b,i)=>{
        await page.mouse.move(a.x,a.y);await page.mouse.down();
        if(i%3===1)await page.waitForTimeout(8);
        await page.mouse.move(b.x,b.y,{steps:[1,2,8][i%3]});
        if(i%3===2)await page.waitForTimeout(35);
        await page.mouse.up();
        const released=await rig();await page.waitForTimeout(1400);const settled=await rig();
        return {released,settled};
      };
      let previous=[240,180];
      for(let i=0;i<50;i++){
        const row=Math.floor((i+1)/9), col=(i+1)%9;
        const next=[240+(row%2?8-col:col)*150,180+row*130];
        const result=await gesture(await h.point(...previous),await h.point(...next),i);
        h.check(result.settled.limbs.length===i+1&&result.settled.joints.length===i+2&&equal(result.released,result.settled),"first Add Limb reverted/missing at "+i+": "+JSON.stringify(result));
        const limb=result.settled.limbs[i];
        h.check(Math.hypot(limb.x1-previous[0],limb.y1-previous[1])<0.01&&Math.hypot(limb.x2-next[0],limb.y2-next[1])<0.01,"disconnected endpoint at "+i);
        attempts.push({kind:"add",index:i,steps:[1,2,8][i%3],pauseMs:i%3===1?8:i%3===2?35:0,expectedStart:previous,expectedEnd:next,...result});
        previous=next;
      }
      await h.button("Select / Move Joint").click();await h.button("Select").scrollIntoViewIfNeeded();
      for(let i=0;i<50;i++){
        const before=await rig(), index=before.joints.length-1, joint=before.joints[index];
        const next={x:joint.x+(i%2?-35:35),y:joint.y+(i%2?-25:25)};
        const result=await gesture(await h.point(joint.x,joint.y),await h.point(next.x,next.y),i);
        h.check(equal(result.released,result.settled)&&result.settled.joints.length===before.joints.length,"Move Joint reverted at "+i);
        h.check(result.settled.joints.every((j,n)=>n===index?Math.hypot(j.x-next.x,j.y-next.y)<0.01:equal(j,before.joints[n])),"first Move Joint missing/wrong target at "+i);
        attempts.push({kind:"move",index:i,steps:[1,2,8][i%3],pauseMs:i%3===1?8:i%3===2?35:0,jointIndex:index,expectedEnd:next,before,...result});
      }
      const final=await rig();await h.button("Undo").click();await h.settle();const undone=await rig();await h.button("Redo").click();await h.settle();
      h.check(!equal(final,undone)&&equal(final,await rig()),"Stick one-command history");
      const saved=await h.save();return {attempts,final,undone,redone:await rig(),postReleaseWaitMs:1400,projectId:saved.projectId};
    });
    for (const tool of ["Select","Lasso"]) for (const category of ["Drawing","Stick","Mixed"]) {
      step(`selection-${tool}-${category}`, async(page,h,{tool,category,profile})=>{
        await page.reload();await page.getByRole("button",{name:/^New Project/}).click();
        if(category!=="Stick")await h.stroke([500,380],[900,460]);
        if(category!=="Drawing")await h.limb([560,330],[830,530]);
        // Separate, unselected geometry/pixels must survive every transform.
        await h.stroke([1450,800],[1580,870]);await h.limb([1450,250],[1580,330]);
        const rig=()=>page.locator('svg[aria-label="Editable stick figure content"] circle').evaluateAll(cs=>cs.map(c=>({x:+c.getAttribute("cx"),y:+c.getAttribute("cy")})));
        const initialRig=await rig(), unrelated=initialRig.slice(-2),unselectedPixels=await h.readUnselectedPixels();
        h.check(unselectedPixels.count>0,"unselected pixel witness is empty");
        const snapshots=[];
        await h.select([430,260],[970,600],tool);
        for(let i=0;i<8;i++){
          if(i>0){
            // Undo/Redo intentionally clears transient selection. Re-select
            // the current authored content through a normal marquee/lasso.
            await h.select([400,220],[1250,730],tool);
          }
          const debug=await page.evaluate(()=>window.__codexBitmapSelectionDebug);
          h.check(debug?.items.length===1,"missing selected content");
          const selection=debug.items[0],resize=i%2===1;
          const box=resize?selection.clientHandleBounds.e:selection.clientDisplayRect;
          const a={x:box.x+box.width/2,y:box.y+box.height/2};
          const delta=profile==="compact"?4:16;
          const before=await h.save(),beforeRig=await rig();
          await page.mouse.move(a.x,a.y);await page.mouse.down();
          await page.mouse.move(a.x+delta,a.y+(resize?0:delta/2),{steps:[1,2,8][i%3]});
          await page.mouse.up();await h.settle();
          const releasedRig=await rig();const released=await h.save();
          await page.waitForTimeout(1400);const settled=await h.save();
          h.check(JSON.stringify(released.documentLayers)===JSON.stringify(settled.documentLayers),"selection reverted after autosave "+i);
          h.check(JSON.stringify(before.documentLayers)!==JSON.stringify(settled.documentLayers),"selection first transform was missing "+i);
          if(category!=="Drawing") h.check(JSON.stringify(beforeRig)!==JSON.stringify(releasedRig),"structured transform missing");
          h.check(JSON.stringify((await rig()).slice(-2))===JSON.stringify(unrelated),"unselected rig changed");
          const settledUnselectedPixels=await h.readUnselectedPixels();
          h.check(settledUnselectedPixels.digest===unselectedPixels.digest,"unselected pixels changed");
          await h.button("Undo").click();await h.settle();const undo=await h.save();
          await h.button("Redo").click();await h.settle();const redo=await h.save();
          h.check(JSON.stringify(undo.documentLayers)===JSON.stringify(before.documentLayers),"selection Undo not exact "+i);
          h.check(JSON.stringify(redo.documentLayers)===JSON.stringify(settled.documentLayers),"selection Redo not exact "+i);
          snapshots.push({index:i,resize,before:before.documentLayers,released:released.documentLayers,after:settled.documentLayers,undo:undo.documentLayers,redo:redo.documentLayers,beforeRig,releasedRig,settledRig:await rig(),unrelated,unselectedPixels,settledUnselectedPixels});
        }
        const final=await h.save(),pixels=await h.readCanvas("editable"),finalRig=await rig();
        await h.addFrame("layer-1");await h.frame("layer-1",0).click();
        const scrubbedPixels=await h.readCanvas("editable"),scrubbedRig=await rig();
        h.check(scrubbedPixels.digest===pixels.digest&&JSON.stringify(scrubbedRig)===JSON.stringify(finalRig),"selection scrub changed content");
        await h.save();await page.reload();await page.getByRole("button",{name:/^Open Project/}).click();await page.getByRole("button",{name:/Untitled Project/}).first().click();
        await h.frame("layer-1",0).click();
        const reopenedPixels=await h.readCanvas("editable"),reopenedRig=await rig();
        h.check(reopenedPixels.digest===pixels.digest&&JSON.stringify(reopenedRig)===JSON.stringify(finalRig),"selection reopen changed content");
        return{tool,category,snapshots,pixels,finalRig,scrubbedPixels,scrubbedRig,reopenedPixels,reopenedRig,projectId:final.projectId};
      },{tool,category,profile});
    }
    step("symbol-deselection",async(page,h)=>{
      await page.reload();await page.getByRole("button",{name:/^New Project/}).click();
      await h.limb([450,320],[720,510]);await h.select([380,250],[800,590]);await h.convert("Gesture rig");await h.place("Gesture rig",850,480);
      const handles=()=>page.locator("[data-symbol-resize-handle]").count();
      const rig=()=>page.locator('svg[aria-label="Editable stick figure content"] circle').evaluateAll(cs=>cs.map(c=>({x:+c.getAttribute("cx"),y:+c.getAttribute("cy")})));
      const selectSymbol=async()=>{await h.button("Select").click();await page.locator("[data-symbol-hit-target]").click();h.check(await handles()===8,"symbol not selected");};
      await selectSymbol();const box=await page.locator('[data-symbol-resize-handle="e"]').boundingBox();
      await h.drag({x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+box.width/2+8,y:box.y+box.height/2});
      const symbolsBefore=await h.symbols();
      const empty=await h.point(160,850);await page.mouse.click(empty.x,empty.y);h.check(await handles()===0,"empty click left stale symbol handles");
      const actions=[];
      for(const action of ["Brush","Lasso","Add Limb","Select / Move Joint"]){
        await selectSymbol();
        if(action==="Add Limb"||action==="Select / Move Joint")await h.button("Stick Figure Tools").click();
        await h.button(action).click();h.check(await handles()===0,"tool left stale symbol handles: "+action);
        await h.button("Select").scrollIntoViewIfNeeded();await h.settle();
        const beforeRig=await rig(),beforePixels=await h.readCanvas("editable");
        if(action==="Brush")await h.stroke([200,650],[430,740]);
        if(action==="Lasso")await h.select([140,590],[490,800],"Lasso");
        if(action==="Add Limb")await h.limb([1200,650],[1480,800]);
        if(action==="Select / Move Joint")await h.drag(await h.point(1480,800),await h.point(1540,740));
        h.check(await handles()===0,"action resurrected stale handles: "+action);
        const afterRig=await rig(),afterPixels=await h.readCanvas("editable"),selection=await page.evaluate(()=>window.__codexBitmapSelectionDebug);
        if(action==="Brush")h.check(afterPixels.count>beforePixels.count,"Brush did not author after symbol deselection");
        if(action==="Lasso")h.check(selection?.owner==="lasso"&&selection.items.length===1,"Lasso did not select after symbol deselection");
        if(action==="Add Limb")h.check(afterRig.length===beforeRig.length+2,"Add Limb did not author after symbol deselection");
        if(action==="Select / Move Joint")h.check(afterRig.length===beforeRig.length&&JSON.stringify(afterRig[0])===JSON.stringify(beforeRig[0])&&Math.hypot(afterRig[1].x-1540,afterRig[1].y-740)<0.01,"Move Joint did not author after symbol deselection");
        h.check(JSON.stringify(await h.symbols())===JSON.stringify(symbolsBefore),"deselection mutated symbol");
        actions.push({action,handles:await handles(),beforeRig,afterRig,beforePixels,afterPixels,selectionOwner:selection?.owner,selectionItems:selection?.items.length});
      }
      const saved=await h.save();return{actions,symbolsBefore,symbolsAfter:await h.symbols(),emptyClickHandles:0,projectId:saved.projectId};
    });
  }
  ledger.status="PASS";ledger.completedAt=new Date().toISOString();saveLedger();
} catch(error) { ledger.status="FAIL";ledger.error=String(error);saveLedger();throw error; }
