// TEST FIXTURES ONLY (helper B2; SAME ENGINE rework helper T1): a throw-away engine root in the temp folder with the REAL books copied in
// (Luna's book + the passed engine's book), a fake process spawner that plays passed_engine.py by the CLI contract, and a fake Luna that
// answers from the labelled fixture file. Nothing here calls an AI or the real engine ($0).
import { EventEmitter } from "node:events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildLike, Spawner, V1LunaCall, V1LunaCallInput } from "../v1AnimatorCore.ts";
import type { V1LunaTurn, V1Plan } from "../v1AnimatorContract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LX_REAL = join(here, "..", "..", "..", "..", "..", "..", "ltx-effects");
export const REAL_LUNA_BOOK = join(LX_REAL, "v1k", "luna-book.json");
export const REAL_ENGINE_BOOK = join(LX_REAL, "v1k", "passed_engine_book.json");
export const ANSWERS = JSON.parse(readFileSync(join(here, "v1-luna-answers.fixture.json"), "utf8")) as Record<string, unknown>;

// (Nov 3 one-take round) the older tests prove the parts / edit-by-move path, which is now behind long_scenes.one_take_always: they run with
// it OFF (exactly the path they were written for); makeTestRoot({ oneTake: true }) = the real book as it ships
export function makeTestRoot(opts: { oneTake?: boolean; h3Free?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "v1-test-root-"));
  const lx = join(root, "ltx-effects");
  mkdirSync(join(lx, "v1k"), { recursive: true });
  copyFileSync(REAL_LUNA_BOOK, join(lx, "v1k", "luna-book.json"));
  const lb = JSON.parse(readFileSync(join(lx, "v1k", "luna-book.json"), "utf8"));
  if (lb.h3_free) lb.h3_free.on = opts.h3Free === true;   // (Nov 18) these tests guard the old road and the edits; v1H3Free.test.ts turns the new road on
  if (!opts.oneTake) lb.long_scenes = { ...lb.long_scenes, one_take_always: false, block_seconds: 10, guide_block_s: 15, max_story_s: 20 };
  writeFileSync(join(lx, "v1k", "luna-book.json"), JSON.stringify(lb, null, 1));
  copyFileSync(REAL_ENGINE_BOOK, join(lx, "v1k", "passed_engine_book.json"));
  return { root, lx, env: { DIAMOND_ENGINE_ROOT: root, DIAMOND_V1_PYTHON: "/fake/python", PATH: "/usr/bin" } as Record<string, string | undefined> };
}

// ---- a fake child process
type Play = { stdout?: string[]; stderr?: string[]; code: number; before?: () => void; hang?: boolean };
export type SpawnCall = { command: string; args: string[]; cwd: string; env: Record<string, string | undefined>; child: FakeChild };
export class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed: NodeJS.Signals | number | null = null;
  kill(signal: NodeJS.Signals | number = "SIGTERM") { this.killed = signal; setImmediate(() => this.emit("close", null)); return true; }
}
export function fakeSpawner(play: (call: Omit<SpawnCall, "child">) => Play) {
  const calls: SpawnCall[] = [];
  const spawn: Spawner = (command, args, options) => {
    const child = new FakeChild();
    const call = { command, args, cwd: options.cwd, env: options.env };
    calls.push({ ...call, child });
    const p = play(call);
    setImmediate(() => {
      p.before?.();
      for (const line of p.stdout ?? []) child.stdout.emit("data", Buffer.from(line + "\n"));
      for (const line of p.stderr ?? []) child.stderr.emit("data", Buffer.from(line + "\n"));
      if (!p.hang) setImmediate(() => child.emit("close", p.code));
    });
    return child as unknown as ChildLike;
  };
  return { spawn, calls };
}

// passed_engine.py by the CLI contract: STAGE + PROGRESS lines, D/plan.json, D/layers/*.png, D/report.json (blocks + frames), RESULT line.
// A block whose (sentence, seed_bump) is in --prev's report is "same" (like the real engine); 3 pictures per block.
export const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
export function playEngineOk(args: string[], extra: { refused?: string } = {}): Play {
  const planPath = args[1], outDir = args[args.indexOf("--out-dir") + 1];
  const prev = args.includes("--prev") ? args[args.indexOf("--prev") + 1] : null;
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as V1Plan;
  const prevBlocks: { sentence: string; seedBump: number }[] = prev && existsSync(join(prev, "report.json")) ? JSON.parse(readFileSync(join(prev, "report.json"), "utf8")).blocks : [];
  // (Nov 20) like the real engine: a changed size, colour, look, mirror or style redraws every picture (frames edited), a changed part its own
  const prevPlan = prev && existsSync(join(prev, "plan.json")) ? (JSON.parse(readFileSync(join(prev, "plan.json"), "utf8")) as Record<string, unknown>) : null;
  const lookChanged = Boolean(prevPlan) && ["size", "colour", "look", "mirror", "style", "partColours"].some((k) => JSON.stringify(prevPlan![k] ?? null) !== JSON.stringify((plan as unknown as Record<string, unknown>)[k] ?? null));
  return {
    code: 0,
    before: () => {
      mkdirSync(join(outDir, "layers"), { recursive: true });
      writeFileSync(join(outDir, "plan.json"), JSON.stringify(plan));
      const blocks = plan.blocks.map((b, i) => ({
        id: b.id, sentence: b.sentence, seedBump: b.seed_bump, made: prevBlocks.some((p) => p.sentence === b.sentence && p.seedBump === b.seed_bump) ? "same" : "new",
        firstFrame: 3 * i, frames: 3, lengthS: 0.125, moves: [b.sentence], labels: [], redrawn: false, kimodoCalls: 0,
      }));
      for (let i = 0; i < 3 * blocks.length; i++) writeFileSync(join(outDir, "layers", `${String(i).padStart(4, "0")}.png`), PNG);
      writeFileSync(join(outDir, "report.json"), JSON.stringify(extra.refused
        ? { ok: false, refused: extra.refused, blocks: [], labels: [], frames: { edited: 0, added: 0, deleted: 0 }, lengthS: 0, kimodoCalls: 0, fps: null, stage: null, layersDir: join(outDir, "layers"), video: null }
        : { ok: true, refused: null, blocks, labels: [], frames: { edited: prev ? 3 * (lookChanged ? blocks.length : blocks.filter((b) => b.made !== "same").length) : 0, added: prev ? 0 : 3 * blocks.length, deleted: 0 }, lengthS: 0.125 * blocks.length, kimodoCalls: blocks.filter((b) => b.made === "new").length, fps: 24, stage: [1944, 1116], layersDir: join(outDir, "layers"), video: null }));
    },
    stdout: ["STAGE planning Planning the moves", "PROGRESS 0 121", "STAGE animating Animating", "PROGRESS 40 72", "some engine log line", "STAGE drawing Drawing your stick figure", "PROGRESS 100 0", `RESULT ${join(outDir, "report.json")}`],
  };
}
export const playEngineError = (words: string): Play => ({ code: 2, stdout: [`ERROR ${words}`] });
export const playEngineHang = (): Play => ({ code: 0, stdout: ["STAGE planning Planning the moves", "PROGRESS 12 100"], hang: true });

// ---- a fake Luna: answers in order from the labelled fixture file, through the REAL normaliser; records every input
export function fakeLuna(normalize: (raw: unknown) => V1LunaTurn | null, ...keys: (string | { fail: string })[]) {
  const inputs: V1LunaCallInput[] = [];
  const luna: V1LunaCall = async (input) => {
    inputs.push(input);
    const key = keys.shift();
    if (key === undefined) throw new Error("fake Luna: no more fixture answers");
    if (typeof key !== "string") return { ok: false, failure: key.fail, detail: "fixture failure" };
    const turn = normalize(ANSWERS[key]);
    return turn ? { ok: true, turn } : { ok: false, failure: "bad_answer", detail: `fixture ${key} is outside the contract` };
  };
  return { luna, inputs };
}

export const until = async (check: () => boolean, tries = 200) => {
  for (let i = 0; i < tries && !check(); i++) await new Promise((r) => setImmediate(r));
  if (!check()) throw new Error("condition never became true");
};
