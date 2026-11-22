import type { FrameCharacter } from "@/src/lib/animator/engine";

// AI ANIMATOR ENGINE BLOCKS (PM v11 R2b, Oct 27): the story is made BLOCK BY BLOCK.
// The director says the story plan in short blocks (5-10 s each) -> "Make block 1" -> the local engine job
// (ltx-effects/director/story.mjs: Kimodo takes + one world + rulers + OBEY) -> the block lands on the canvas
// as ordinary editable frames -> the user edits -> "Next block" continues from the last block's end pose.
// A block the engine BLOCKS (a ruler or OBEY failed) is said honestly and never put on the canvas.
// Behind a switch, default OFF: without it nothing here is shown or reachable and the app is unchanged.

// Client switch (the panel section). The server has its own switch (DIAMOND_ENGINE_BLOCKS=1) — both must be on.
export const ENGINE_BLOCKS_UI_ENABLED = process.env.NEXT_PUBLIC_DIAMOND_ENGINE_BLOCKS === "1";

// One block of the story plan, as the director says it to the user.
export type EngineStoryBlock = {
  index: number; // 0-based
  say: string; // one short line the user reads ("Red trips, falls and gets back up.")
  sentence: string; // the words this block must OBEY (the engine's OBEY checker reads them)
};

// Where the plan came from. "pm-plan-file" = a PM-written plan (dev switch, no AI); "live" = the live director (Luna);
// "contest" = the blind director contest (dev: "Director A" / "Director B", which AI is which is hidden).
export type EngineDirectorSource = "pm-plan-file" | "live" | "contest";

// Client switch for the blind director contest picker (the server needs DIAMOND_ENGINE_DIRECTOR=contest too).
export const ENGINE_CONTEST_UI_ENABLED = process.env.NEXT_PUBLIC_DIAMOND_ENGINE_CONTEST === "1";

export type EngineStoryPlan = {
  storyId: string;
  label: string; // e.g. "PM-written plan" — always shown to the user
  source: EngineDirectorSource;
  sentence: string; // the whole story in the user's words
  blocks: EngineStoryBlock[];
};

export type EnginePlanResponse =
  | { ok: true; plan: EngineStoryPlan }
  | { ok: false; message: string };

export type EngineJobStatus = "running" | "done" | "blocked" | "failed";

// A made block, ready to be put on the canvas. Frames are the engine's own DRAWN figures (the app's FrameCharacter
// shape, 1920x1080 stage), one list per picture at `fps`.
export type EngineBlockResult = {
  fps: number;
  figures: { id: string; name: string }[];
  frames: FrameCharacter[][];
  // The engine's effect list (fire, water, ...) with scene times (what was cast, by whom, when).
  effects: Record<string, unknown>[];
  // The engine page's OWN effects drawn as transparent pictures (one per engine picture at `fps`; null = nothing there),
  // UNDER and OVER the figures, on the engine's stage (`stage` = its size in page units; the picture covers it all).
  effectLayers?: { fps: number; stage: [number, number]; under: (string | null)[]; over: (string | null)[] };
  effectLayersError?: string; // the block has effects but they could not be drawn (said to the user)
  // (Oct 30, wired V1) the story path's figures: Seedance's / Kimodo's OWN drawn pictures, one editable layer per figure
  // (transparent pictures on the engine's stage, one per engine picture at `fps`). When present, `frames` are empty.
  // (V1, Nov 1) inkBox = [x0, y0, x1, y1] where the figure moves, in stage pixels: the canvas centres THIS on its page (never crops it)
  // (Nov 2 final round) fitExtra = camera "still" + the user's ground lines (engineBlockScene.ts EngineFitExtra; absent = the old fit)
  figureLayers?: { fps: number; stage: [number, number]; inkBox?: [number, number, number, number] | null; fitExtra?: import("./engineBlockScene").EngineFitExtra | null; camera?: "still"; stillHeightShare?: number; layers: { id: string; name: string; pictures: (string | null)[] }[] };
  lengthS: number;
  video: string | null; // the engine's own review video of this block (local path)
  continuedFromLastPose: boolean;
};

export type EngineJobSnapshot = {
  jobId: string;
  projectId: string;
  storyId: string;
  blockIndex: number;
  status: EngineJobStatus;
  startedAt: string;
  finishedAt: string | null;
  progress: string; // last engine log line, for the "working" text
  message: string | null; // plain words for the user (why blocked / failed)
  why: string[]; // the failed rulers / OBEY checks, word for word
  result: EngineBlockResult | null; // only when status === "done"
};
