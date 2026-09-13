import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const equal = (a: unknown, b: unknown, label: string) => assert.deepEqual(a, b, label);
const profiles = ["desktop", "compact"] as const;
for (const profile of profiles) {
  const result = JSON.parse(readFileSync(`output/spec-0006/phase-5/correction3-${profile}.json`, "utf8"));
  equal(result.status, "PASS", profile);
  const step = (name: string) => {
    const found = result.steps.find((candidate: { name: string }) => candidate.name === name);
    assert.ok(found, name);
    assert.equal(found.result.network.errors.length, 0, name);
    for (const url of found.result.network.requests) assert.ok((url.startsWith("http://127.0.0.1:56555/") && !url.startsWith("http://127.0.0.1:56555/api/")) || url.startsWith("data:") || url.startsWith("blob:"), url);
    return found.result;
  };
  const boot = step("boot");
  equal([boot.width, boot.height, boot.dpr], profile === "desktop" ? [1440, 900, 1] : [390, 844, 2], "exact viewport/DPR");
  equal(boot.overflow, 0, "horizontal overflow");
  equal(boot.timelineNavigation, "pointer", "ordinary timeline navigation");
  for (const entry of result.steps) equal(entry.result.overflow, 0, "per-step horizontal overflow");
  const catalog = step("create-catalog");
  equal(catalog.suggested, "Symbol 1", "dialog default");
  equal(catalog.duplicate, "This symbol already exists.", "duplicate feedback");
  equal([catalog.preservedStick, catalog.restoredStick, catalog.removedStick], [1, 1, 0], "stick conversion history");
  assert.ok(catalog.restoredDrawing.count > 0 && catalog.removedDrawing.count === 0);
  assert.ok(catalog.mixedDrawing.count > 0 && catalog.mixedStick === 1 && catalog.mixedRemoved.count === 0);
  const definitions = catalog.saved.catalogs.symbols;
  equal(definitions.map((d: { sourceCategory: string }) => d.sourceCategory), ["Drawing Symbol", "Stick Figure Symbol", "Drawing and Stick Figure Symbol"], "categories");
  assert.equal(definitions[0].structuredPayload, undefined);
  equal(definitions[1].structuredPayload.drawingPngDataUrl, null, "stick has no raster drawing");
  assert.ok(definitions[2].structuredPayload.drawingPngDataUrl.startsWith("data:image/png;base64,"));
  const transforms = step("instance-transforms");
  equal(transforms.undoWide, transforms.baseline, "width undo");
  equal(transforms.redoWide, transforms.wide, "width redo");
  type Joint = { x: number; y: number; r: number };
  equal(transforms.wide.joints.map((j: Joint) => j.y), transforms.baseline.joints.map((j: Joint) => j.y), "width locks Y");
  equal(transforms.tall.joints.map((j: Joint) => j.x), transforms.baseline.joints.map((j: Joint) => j.x), "height locks X");
  for (const variant of ["baseline", "wide", "tall", "corner", "rotated"]) {
    equal(transforms[variant].images, 0, "rig is not a bitmap");
    for (const joint of transforms[variant].joints) equal(joint.r, 14, "constant joint radius");
    for (const limb of transforms[variant].limbs) equal([limb.width, limb.cap], [14, "round"], "constant round segments");
  }
  transforms.lengthsBefore.forEach((n: number, index: number) => assert.ok(Math.abs(n - transforms.lengthsAfter[index]) < 0.0001));
  equal(transforms.duplicated[0], transforms.independent[0], "second instance cannot mutate first");
  const first = step("onion-layer-1"), second = step("onion-layer-2");
  for (const onion of [first, second]) {
    equal(onion.active, {currentFrameIndex:1,selectedTimelineIndex:1,activeLayerId:onion===first?"layer-1":"layer-2"}, "real active middle frame/layer");
    assert.ok(onion.timelineClicks.some((click: {button:string;index:number})=>click.button==="left"&&click.index===1));
    assert.ok(onion.timelineLayout.laneWidth > 50);
    assert.ok(onion.timelineLayout.panelBottom <= onion.timelineLayout.tabTop, "no timeline/tab overlap");
    equal(onion.samples.length, 12, "six categories, two directions");
    for (const sample of onion.samples) {
      equal(sample.wrong, 0, sample.kind);
      assert.ok((sample.direction === "previous" ? sample.purple : sample.green) > 0, sample.kind);
    }
    equal(onion.disabled.count, 0, "disabled onion empty");
    equal(onion.playing.count, 0, "playback onion empty");
    equal(onion.source.digest, onion.after.digest, "onion never mutates source");
    equal(onion.saved.catalogs.symbols, definitions, "catalog immutable after placement");
  }
  equal(first.saved.documentLayers[0], second.saved.documentLayers[0], "layer 2 authoring leaves layer 1 unchanged");
  const brush = step("brush-commit");
  for (const phase of ["preview", "settled", "redo", "scrubbed"]) equal(brush[phase].digest, brush.commit.digest, `brush ${phase}`);
  equal(brush.undo.digest, brush.before.digest, "brush undo removes only stroke");
  for (const index of [0, 2]) equal(second.saved.documentLayers[1].cells[index], brush.saved.documentLayers[1].cells[index], "brush did not write another frame");
  equal(second.saved.documentLayers[0], brush.saved.documentLayers[0], "brush did not write another layer");
  const reopened = step("reopen");
  equal(reopened.before.digest, reopened.after.digest, "reopened canvas");
  equal(reopened.saved.catalogs.symbols, definitions, "persisted payload immutable");
  equal(reopened.symbols.map((symbol: { images: number; joints: unknown[] }) => [symbol.images, symbol.joints.length]), [[1, 0], [0, 2], [1, 2]], "no missing/doubled mixed rendering");
  const boundaries = step("holds-dedupe-barrier");
  assert.ok(boundaries.deduped.count > 0);
  for (const pixels of [boundaries.deduped, boundaries.barrier]) {
    for (const [color] of pixels.colors) {
      const [r, g, b] = color.split(",").map(Number);
      assert.ok(!(g > b && b > r), "dedupe/barrier emitted next ghost");
    }
  }
  equal(boundaries.held.length, 3, "hold resolves owner symbols");
  const selections = step("selection-regressions");
  equal(selections.results.map((r: { tool: string }) => r.tool), ["Select", "Lasso"], "both selection owners");
  for (const selection of selections.results) {
    equal(selection.duplicated.length, 4, "real duplicate joints");
    equal(selection.deleted, selection.moved, "delete preserves original");
    equal(selection.redo, selection.moved, "delete redo");
    equal(selection.undo.length, 4, "delete undo");
    equal(selection.pixels.count, 0, "no bitmap proxy");
    equal(selection.jointOnly[1], selection.deleted[1], "joint-only edit leaves other joint unchanged");
  }

  const gestures = JSON.parse(readFileSync(`output/spec-0006/phase-5/gesture-${profile}.json`, "utf8"));
  equal(gestures.status, "PASS", "fresh gesture replay");
  equal(gestures.steps.map((entry: {name:string})=>entry.name), ["stick-first-gesture", ...["Select","Lasso"].flatMap(tool=>["Drawing","Stick","Mixed"].map(category=>`selection-${tool}-${category}`)), "symbol-deselection"], "closed gesture flow set");
  const gesture = (name: string) => {
    const entry = gestures.steps.find((candidate: {name:string})=>candidate.name===name).result;
    equal(entry.profileMetrics, profile==="desktop"?{width:1440,height:900,dpr:1}:{width:390,height:844,dpr:2}, "gesture profile");
    equal(entry.overflow,0,"gesture overflow");equal(entry.network.errors,[],"gesture page errors");
    for(const url of entry.network.requests) assert.ok((url.startsWith("http://127.0.0.1:56555/")&&!url.startsWith("http://127.0.0.1:56555/api/"))||url.startsWith("data:")||url.startsWith("blob:"),url);
    return entry;
  };
  type Point = {x:number;y:number};
  const near = (actual:Point,expected:Point) => assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<0.01, "pointer endpoint geometry");
  const stick=gesture("stick-first-gesture");
  equal(stick.postReleaseWaitMs,1400,"settles beyond authoring snapshot idle window");
  equal(stick.attempts.filter((a:{kind:string})=>a.kind==="add").length,50,"50 Add Limb attempts");
  equal(stick.attempts.filter((a:{kind:string})=>a.kind==="move").length,50,"50 Move Joint attempts");
  for(const attempt of stick.attempts){
    equal(attempt.released,attempt.settled,"release/autosave exact rig");
    equal(attempt.steps,[1,2,8][attempt.index%3],"real pointer timing variation");
    if(attempt.kind==="add"){
      equal(attempt.settled.limbs.length,attempt.index+1,"one durable limb");
      equal(attempt.settled.joints.length,attempt.index+2,"connected chain does not duplicate endpoint");
      const limb=attempt.settled.limbs[attempt.index];
      near({x:limb.x1,y:limb.y1},{x:attempt.expectedStart[0],y:attempt.expectedStart[1]});
      near({x:limb.x2,y:limb.y2},{x:attempt.expectedEnd[0],y:attempt.expectedEnd[1]});
    }else{
      equal(attempt.settled.joints.length,attempt.before.joints.length,"no missing joints");
      attempt.settled.joints.forEach((joint:Point,index:number)=>index===attempt.jointIndex?near(joint,attempt.expectedEnd):equal(joint,attempt.before.joints[index],"one joint only"));
    }
  }
  assert.notDeepEqual(stick.final,stick.undone,"one-command Stick undo");equal(stick.final,stick.redone,"one-command Stick redo");
  for(const tool of ["Select","Lasso"])for(const category of ["Drawing","Stick","Mixed"]){
    const selection=gesture(`selection-${tool}-${category}`);
    equal(selection.snapshots.length,8,"four moves plus four resizes per case");
    for(const snapshot of selection.snapshots){
      equal(snapshot.resize,snapshot.index%2===1,"alternating move/resize");
      assert.notDeepEqual(snapshot.before,snapshot.after,"first transform authored a change");
      equal(snapshot.released,snapshot.after,"post-autosave document/pixel hashes");
      equal(snapshot.undo,snapshot.before,"exact selection undo");equal(snapshot.redo,snapshot.after,"exact selection redo");
      equal(snapshot.releasedRig,snapshot.settledRig,"stable geometry");
      if(category!=="Drawing")assert.notDeepEqual(snapshot.beforeRig,snapshot.releasedRig,"structured first transform");
      else equal(snapshot.beforeRig,snapshot.releasedRig,"drawing-only transform leaves all rig geometry");
      if(category==="Stick"){
        const rasterItems=(layers:Array<{cells:Array<{content?:{items:Array<{kind:string}>}}>}> )=>layers.flatMap(layer=>layer.cells.flatMap(cell=>(cell.content?.items??[]).filter(item=>item.kind==="drawing-raster/v1")));
        equal(rasterItems(snapshot.before),rasterItems(snapshot.after),"stick-only transform leaves the whole raster unchanged");
      }
      equal(snapshot.settledRig.slice(-2),snapshot.unrelated,"unselected rig unchanged");
      assert.ok(snapshot.unselectedPixels.count>0,"nonempty unrelated pixel witness");
      equal(snapshot.settledUnselectedPixels,snapshot.unselectedPixels,"unselected bitmap unchanged");
    }
    for(const phase of ["scrubbed","reopened"]){
      equal(selection[`${phase}Pixels`].digest,selection.pixels.digest,`${phase} pixel hash`);
      equal(selection[`${phase}Rig`],selection.finalRig,`${phase} geometry`);
    }
  }
  const deselection=gesture("symbol-deselection");
  equal(deselection.emptyClickHandles,0,"empty click clears handles");
  equal(deselection.symbolsAfter,deselection.symbolsBefore,"deselection cannot mutate symbol");
  equal(deselection.actions.map((a:{action:string})=>a.action),["Brush","Lasso","Add Limb","Select / Move Joint"],"all tool activation boundaries");
  for(const action of deselection.actions){
    equal(action.handles,0,"no stale symbol overlay");
    if(action.action==="Brush")assert.ok(action.afterPixels.count>action.beforePixels.count);
    if(action.action==="Lasso")equal([action.selectionOwner,action.selectionItems],["lasso",1],"Lasso succeeds after deselection");
    if(action.action==="Add Limb")equal(action.afterRig.length,action.beforeRig.length+2,"Add Limb succeeds after deselection");
    if(action.action==="Select / Move Joint"){
      equal(action.afterRig[0],action.beforeRig[0],"deselected-symbol joint action leaves other joint");near(action.afterRig[1],{x:1540,y:740});
    }
  }
}
console.log(JSON.stringify({ status: "PASS", profiles: 2, flowsPerProfile: 17, stickGestures: 200, selectionTransforms: 96, onionCategoryDirectionChecks: 48, evidence: "fresh real-UI measurements with independently checked geometry and pixel hashes" }));
