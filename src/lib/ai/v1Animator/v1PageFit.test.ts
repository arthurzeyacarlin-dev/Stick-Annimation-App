import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createV1Animator, applyV1Ops, planFromCreate, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { lunaInstructions, normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { v1AlphaBox, v1FindGroundLines, v1GroundForDefault, v1InkMask, v1PageRect, v1PickGround, type V1GroundRule } from "./v1PageFit.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// Nov 2 final round (PLAN_NEVER_AGAIN_NOV2 s3-5 + Fable 9-10): ground line, camera "still", "defaults never rules". TEST FIXTURES ONLY:
// hand-drawn (synthetic, labelled) page pictures + labelled AI answers + the REAL books in a temp root. $0: no AI call, no Kimodo.
const books = () => {
  const { lx, env } = makeTestRoot();
  return { env, book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const rule = (): V1GroundRule => books().book.canvas!.ground!;
const PAGE = { w: 1920, h: 1080 }, PIC = { w: 768, h: 432 }; // the page picture at the book's max_px

// FIXTURE drawing: a white page picture (RGBA) with black strokes
type Stroke = { x0: number; y0: number; x1: number; y1: number; pen?: number } | { fill: [number, number, number, number] };
function drawing(strokes: Stroke[]) {
  const data = new Uint8ClampedArray(PIC.w * PIC.h * 4).fill(255);
  const dot = (x: number, y: number) => { if (x < 0 || y < 0 || x >= PIC.w || y >= PIC.h) return; const i = (y * PIC.w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 20; };
  for (const s of strokes) {
    if ("fill" in s) { for (let y = s.fill[1]; y < s.fill[3]; y++) for (let x = s.fill[0]; x < s.fill[2]; x++) dot(x, y); continue; }
    const n = Math.max(Math.abs(s.x1 - s.x0), Math.abs(s.y1 - s.y0)), pen = s.pen ?? 2;
    for (let k = 0; k <= n; k++) { const x = Math.round(s.x0 + ((s.x1 - s.x0) * k) / n), y = Math.round(s.y0 + ((s.y1 - s.y0) * k) / n); for (let p = 0; p < pen; p++) dot(x, y + p); }
  }
  return v1FindGroundLines(v1InkMask(data, PIC.w, PIC.h, rule().inkDiff), PIC.w, PIC.h, rule(), PAGE.w, PAGE.h);
}
const k = PAGE.h / PIC.h;

test("ground FOUND: a long flat line under where he stands -> his feet go on it (page y of the line's top)", () => {
  const lines = drawing([{ x0: 40, y0: 390, x1: 728, y1: 390, pen: 3 }]);
  const got = v1GroundForDefault(lines, rule(), PAGE.w, PAGE.h);
  assert.ok(got, "found");
  assert.ok(Math.abs(got!.y - 390 * k) < 2 * k, `y ${got!.y}`);
  // a gently sloped hand-drawn ground (under the book's slope) and a wobbly one with small breaks still count
  assert.ok(v1GroundForDefault(drawing([{ x0: 40, y0: 370, x1: 728, y1: 400 }]), rule(), PAGE.w, PAGE.h));
  assert.ok(v1GroundForDefault(drawing([{ x0: 40, y0: 380, x1: 300, y1: 380 }, { x0: 304, y0: 381, x1: 728, y1: 381 }]), rule(), PAGE.w, PAGE.h));
});

test("TABLE EDGE rejected (Fable 9): a long flat edge at body height is never the ground; with a ground line under it, the ground wins", () => {
  const table = [{ x0: 250, y0: 250, x1: 520, y1: 250, pen: 3 }, { x0: 260, y0: 250, x1: 260, y1: 330 }, { x0: 510, y0: 250, x1: 510, y1: 330 }];
  assert.ok(drawing(table).length >= 1, "the table edge IS a long flat line ...");
  assert.equal(v1GroundForDefault(drawing(table), rule(), PAGE.w, PAGE.h), null, "... but it is above his feet: not the ground (default)");
  const both = v1GroundForDefault(drawing([...table, { x0: 20, y0: 400, x1: 748, y1: 400, pen: 3 }]), rule(), PAGE.w, PAGE.h);
  assert.ok(both && Math.abs(both.y - 400 * k) < 2 * k, "the lowest line under him = the ground");
});

test("NONE = today's default: empty page, a short line, a steep hill, a line beside him", () => {
  assert.equal(v1GroundForDefault(drawing([]), rule(), PAGE.w, PAGE.h), null);
  assert.equal(v1GroundForDefault(drawing([{ x0: 360, y0: 390, x1: 400, y1: 390 }]), rule(), PAGE.w, PAGE.h), null, "shorter than 1.5 x his width");
  assert.equal(v1GroundForDefault(drawing([{ x0: 100, y0: 420, x1: 700, y1: 200 }]), rule(), PAGE.w, PAGE.h), null, "steeper than the book's degrees");
  assert.equal(v1GroundForDefault(drawing([{ x0: 10, y0: 390, x1: 300, y1: 390 }]), rule(), PAGE.w, PAGE.h), null, "not under his feet");
  // a filled flat ground block: its TOP edge is the ground (open on top); its inside is never a line
  const block = v1GroundForDefault(drawing([{ fill: [0, 380, 768, 432] }]), rule(), PAGE.w, PAGE.h);
  assert.ok(block && Math.abs(block.y - 380 * k) < 2 * k);
});

test("v1PickGround works in any pixels: the lowest qualifying line under the feet; above up_share_h of his height = rejected", () => {
  const r = rule(), feet = { x0: 900, x1: 1000, y: 948 }, fig = { width: 100, height: 800 };
  assert.equal(v1PickGround([{ x0: 0, y0: 600, x1: 1944, y1: 600 }], feet, fig, r), null);
  assert.equal(v1PickGround([{ x0: 0, y0: 1000, x1: 1944, y1: 1000 }], feet, fig, r)!.y, 1000);
  assert.equal(v1PickGround([{ x0: 0, y0: 1000, x1: 1944, y1: 1000 }, { x0: 0, y0: 1050, x1: 1944, y1: 1050 }], feet, fig, r)!.y, 1050);
});

test("page fit: follow (default) = whole motion on the page; ground moves his feet onto the line; STILL = first picture's height + start spot (walks off)", () => {
  const stage: [number, number] = [1944, 1116], base = { x0: 0, y0: 0, scale: 1 }, page = { pageLeftPx: 0, pageWidthPx: 1944, pageTopPx: 0, pageHeightPx: 1116, margin: 0.94 };
  const inkBox: [number, number, number, number] = [200, 148, 1900, 948], firstBox: [number, number, number, number] = [200, 500, 300, 948];
  const follow = v1PageRect(stage, base, { ...page, inkBox });
  assert.ok(follow.x0 + inkBox[0] * (follow.w / stage[0]) >= 0 && follow.x0 + inkBox[2] * (follow.w / stage[0]) <= 1944, "follow: every picture on the page");
  const grounded = v1PageRect(stage, base, { ...page, inkBox, firstBox, ground: { lines: [{ x0: 0, y0: 1000, x1: 1944, y1: 1000 }], rule: rule(), pageW: 1944, pageH: 1116 } });
  const s = grounded.w / stage[0];
  assert.ok(Math.abs(grounded.y0 + firstBox[3] * s - 1000) < 1e-6 && grounded.ground === 1000, "his standing feet on the user's line");
  const table = v1PageRect(stage, base, { ...page, inkBox, firstBox, ground: { lines: [{ x0: 0, y0: 600, x1: 1944, y1: 600 }], rule: rule(), pageW: 1944, pageH: 1116 } });
  assert.equal(table.ground, null); assert.equal(table.y0, v1PageRect(stage, base, { ...page, inkBox, firstBox }).y0, "unsure = the default fit");
  const still = v1PageRect(stage, base, { ...page, inkBox, firstBox, camera: "still", stillHeightShare: 0.6 });
  const ss = still.w / stage[0];
  assert.ok(Math.abs((firstBox[3] - firstBox[1]) * ss - 0.6 * 1116) < 1e-6, "still: first picture at the book's height share");
  assert.ok(Math.abs(still.x0 + 250 * ss - 250) < 1e-6, "still: his start spot keeps its place");
  assert.ok(still.x0 + inkBox[2] * ss > 1944, "still: the motion goes past the page edge - he walks off the canvas (Fable 10)");
  assert.deepEqual(v1AlphaBox(new Uint8ClampedArray(4 * 4 * 4).map((_, i) => (i === (2 * 4 + 1) * 4 + 3 ? 255 : 0)), 4, 4), [1, 2, 2, 3]);
});

test("camera: 'still' is the default of a new animation (Nov 11); 'follow' only when Sonnet says so; the camera op; the result tells the panel", async () => {
  const { book, words, env } = books();
  const create = normalizeV1LunaTurn(ANSWERS.create_camera_still, words, book)!;
  assert.equal(create.camera, "still");
  const plan = planFromCreate(create, book, words)!;
  assert.equal(plan.camera, "still");
  assert.equal(planFromCreate({ ...create, camera: null }, book, words)!.camera, "still", "still = the default of a new animation (Nov 11)");
  assert.equal(planFromCreate({ ...create, camera: "follow" }, book, words)!.camera, undefined, "follow only when Sonnet says so (no key = follow)");
  const op = normalizeV1LunaTurn(ANSWERS.edit_camera_still, words, book)!.ops!;
  const followed = { ...plan }; delete followed.camera;
  const edited = applyV1Ops(followed, op, book, words);
  assert.ok("plan" in edited && edited.plan.camera === "still");
  const back = applyV1Ops(plan, normalizeV1LunaTurn(ANSWERS.edit_camera_follow, words, book)!.ops!, book, words);
  assert.ok("plan" in back && back.plan.camera === undefined);
  // end to end ($0 fake engine): the engine gets plan.camera "still"; the result's figureLayers say still + the book's height share
  const config = v1EngineConfig(env)!;
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "create_camera_still");
  const animator = createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const me = { ownerId: "o", projectId: "p" };
  const a = await animator.turn({ ...me, animationId: null, message: "he walks off the screen, the camera stays still", recentConversation: [] });
  assert.ok(a.ok && a.started && a.animation);
  const id = a.ok ? a.animation!.animationId : "";
  await until(() => animator.get(me.ownerId, me.projectId, id)!.versions[0].status === "done");
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(calls[0].args[1], "utf8")).camera, "still");
  const result = animator.currentResult(me.ownerId, me.projectId, id) as { result?: { figureLayers?: { camera?: string; stillHeightShare?: number } } };
  assert.equal(result.result?.figureLayers?.camera, "still");
  assert.equal(result.result?.figureLayers?.stillHeightShare, book.camera.stillHeightShare);
});

test("ground say: the panel found a ground line -> a create's reply says the book's line; no ground = not said", async () => {
  const { book, words, env } = books();
  const config = v1EngineConfig(env)!;
  const { spawn } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "create_camera_still", "create_camera_still");
  const animator = createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const a = await animator.turn({ ownerId: "o", projectId: "p1", animationId: null, message: "he walks", recentConversation: [], ground: true });
  assert.ok(a.ok && a.turn.say.includes(book.canvas!.groundSay!));
  const b = await animator.turn({ ownerId: "o", projectId: "p2", animationId: null, message: "he walks", recentConversation: [] });
  assert.ok(b.ok && !b.turn.say.includes(book.canvas!.groundSay!));
});

test("DEFAULTS NEVER RULES: the AI's instructions offer the still camera; the capabilities call follow a default; no 'always follows'", () => {
  const { book, words } = books();
  const text = lunaInstructions(book, words);
  assert.match(text, /always null or 'still', never 'follow'/);
  assert.match(text, /camera \(the page placement only, always still/);   // (Nov 17, Arthur: "H3 is the camera" - the page placement stays still)
  assert.match(text, /set cameraMoves true\. A camera MOVE \(follow, pan, zoom\) is written plainly INSIDE the step's own sentence/);   // (Nov 20) a cut is its own step: 'The camera cuts to ...'
  assert.match(text, /its OWN step that begins 'The camera cuts to'/);
  assert.ok(book.capabilities.can.some((c) => /Camera moves, cuts, scene changes, transitions and teleports/.test(c)));
  assert.doesNotMatch(text, /camera that follows him\./);
  assert.match(text, /ANY LENGTH/); // (Nov 13, Arthur: zero roadblocks) no "longer than N seconds" rule any more
});

// (Nov 2 night) line him up with the user's drawn things
import { v1AlignMoments as alignM, v1FindThings as findT } from "./v1PageFit.ts";
test("align: one moment -> slid onto the nearest thing; two -> slide + size (book range); none -> null", () => {
  assert.deepEqual(alignM([500], [420, 900], 0.8, 1.25), { a: 1, b: -80, pairs: 1 });
  const two = alignM([400, 800], [420, 845], 0.8, 1.25)!;
  assert.ok(Math.abs(two.a * 400 + two.b - 420) < 1e-6 && Math.abs(two.a * 800 + two.b - 845) < 1e-6, "both moments land exactly");
  const clamped = alignM([400, 410], [100, 900], 0.8, 1.25)!;
  assert.equal(clamped.a, 1.25, "never sized past the book's range");
  const leftward = alignM([800, 400], [420, 845], 0.8, 1.25)!;
  assert.ok(Math.abs(leftward.a * 800 + leftward.b - 845) < 1e-6, "walking left: the first moment meets the rightmost thing");
  assert.equal(alignM([], [1], 0.8, 1.25), null);
});
test("things: two short vertical strokes are two things; a long ground line is not a thing", () => {
  const w = 200, h = 100, m = new Uint8Array(w * h);
  for (let y = 60; y < 80; y += 1) { m[y * w + 50] = 1; m[y * w + 120] = 1; }
  for (let x = 0; x < 190; x += 1) m[90 * w + x] = 1;
  const rule = { align: { minScale: 0.8, maxScale: 1.25, thingMinShare: 0.0005, thingMaxWidthShare: 0.5 } } as never;
  const t = findT(m, w, h, rule, 1920, 1080);
  assert.equal(t.length, 2);
  assert.ok(t[0].x0 < t[1].x0);
});
