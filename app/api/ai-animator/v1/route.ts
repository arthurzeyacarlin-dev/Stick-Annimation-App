import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { readJson } from "@/src/lib/account/readJson";
import { accountProjectBelongsToOwner } from "@/src/lib/account/projectServer";
import { normalizeV1Conversation, V1_MAX_MESSAGE } from "@/src/lib/ai/v1Animator/v1AnimatorCore";
import { v1Animator, v1AnimatorServerEnabled, v1ThinkingWords } from "@/src/lib/ai/v1Animator/v1AnimatorServer";
import { isV1LiveKey, readV1Live, withV1Live } from "@/src/lib/ai/v1Animator/v1TurnLive";
import { isV1Effort } from "@/src/lib/ai/v1Animator/v1LunaBook";
import { watchFalBalance } from "@/src/lib/account/falBalanceWatch";

// AI ANIMATOR VERSION 1 (switch DIAMOND_V1_ANIMATOR=1, default OFF -> 404). The same account + project-owner checks as
// /api/ai-animator/engine. The runner (Luna turn, engine jobs, versions, undo / redo / cancel) is v1AnimatorCore.ts.
//   POST { action: "turn", projectId, animationId?, message, recentConversation? } -> { turn, animation, started }
//   POST { action: "undo" | "redo" | "cancel", projectId, animationId, layers? }  -> { animation, result, resultVersion, resultError }
//   POST { action: "layer", projectId, animationId, layerId, count }               -> { animation } (the canvas layer it was put on)
//   GET  ?projectId&animationId[&layers=0][&from=K]                                -> { animation, result, resultVersion, resultError, resultTotal }
//        (Nov 15) the pictures come in PIECES: `result` holds the pictures from picture K on (as many as fit one piece), `resultTotal` = how many there are
//   GET  ?projectId (no animationId)                                                 -> { animation (the latest, or null), lines, canvas (the book's picture limits or null) }
//   (turn) canvas?: { mediaType, data (base64), width, height } = ONE small picture of what the user drew (Nov 2 final round)
//   (turn) liveKey?: random id; GET ?live=<liveKey> -> { live: { say, searching, at } | null, words } while it is answered (Nov 17)
//   (turn) effort?: "auto" | "low" | "medium" | "high" = the chat's Effort button (Nov 2 final round; absent = low, today's call)
export const runtime = "nodejs";
const V1_CANVAS_BODY_MAX = 4_000_000; // (characters) only a coarse wall; the real limit is the book's canvas.max_bytes

const off = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null);

// (Nov 5, live: one message failed with "I couldn't answer just now" - the project store's read failed ONCE, the same message worked a moment
// later) the same ownership check, asked up to 3 times over ~1.5 s when the store has a hiccup; a store that stays down still fails
async function belongsWithRetry(ownerId: string, projectId: string) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await accountProjectBelongsToOwner(ownerId, projectId); }
    catch (error) { if (attempt >= 2) throw error; await new Promise((r) => setTimeout(r, 400 + 600 * attempt)); }
  }
}

async function owner(request: Request, projectId: string | null) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return { response: access.response };
  if (!projectId) return { response: NextResponse.json({ error: "Project identity is required." }, { status: 400 }) };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {   // (Nov 12 security) a made-up id is refused at once, no lookup
    return { response: NextResponse.json({ error: "Project is not available to this account." }, { status: 403 }) };
  }
  if (!await belongsWithRetry(access.session.user.id, projectId)) {
    return { response: NextResponse.json({ error: "Project is not available to this account." }, { status: 403 }) };
  }
  // (Nov 25) while the AI Animator is in use, the fal money watch looks (at most every 10 minutes, in the background) whether
  // the animator's money account is getting low and tells the owner before anyone is stopped. It only reads; see falBalanceWatch.ts.
  void watchFalBalance();
  return { ownerId: access.session.user.id };
}

// The current version's pictures (big: data URLs) only when asked and when it is done.
const withResult = (ownerId: string, projectId: string, animationId: string, layers: boolean, from = 0) => {
  const made = layers ? v1Animator().currentResult(ownerId, projectId, animationId, from) : null;
  return {
    result: made && "result" in made ? made.result : null,
    resultTotal: made && "result" in made ? made.total : null,
    resultVersion: made ? made.version : null,
    resultError: made && "error" in made ? made.error : null,
  };
};

export async function POST(request: Request) {
  if (!v1AnimatorServerEnabled()) return off();
  let body: Record<string, unknown>;
  // (Nov 12 security) at most 9 MB is read (the contact sheet is a few MB)
  try { body = await readJson(request, 9 * 1024 * 1024); } catch { return NextResponse.json({ error: "Request JSON is invalid." }, { status: 400 }); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return NextResponse.json({ error: "Request JSON is invalid." }, { status: 400 });
  const projectId = text(body.projectId, 256);
  const who = await owner(request, projectId);
  if ("response" in who) return who.response;
  const animationId = body.animationId === undefined || body.animationId === null ? null : text(body.animationId, 128);
  if (body.animationId !== undefined && body.animationId !== null && !animationId) return NextResponse.json({ error: "The animation identity is invalid." }, { status: 400 });

  if (body.action === "turn") {
    const message = text(body.message, V1_MAX_MESSAGE);
    const recentConversation = normalizeV1Conversation(body.recentConversation);
    if (!message) return NextResponse.json({ error: "Say what he should do." }, { status: 400 });
    if (!recentConversation) return NextResponse.json({ error: "The recent conversation is invalid or too large." }, { status: 400 });
    // (Nov 2 final round) the user's drawing (one small picture, optional): the runner checks it against the book's limits; a body
    // field far over any sane size is refused here before it is kept in memory
    const canvas = body.canvas === undefined || body.canvas === null ? null : body.canvas;
    if (canvas !== null && JSON.stringify(canvas).length > V1_CANVAS_BODY_MAX) return NextResponse.json({ error: "The canvas picture is too large." }, { status: 413 });
    // (Nov 2 night) the timeline contact sheet: the same coarse wall (the book's limits are checked in the core: acceptV1Sheet)
    const sheet = body.sheet === undefined || body.sheet === null ? null : body.sheet;
    if (sheet !== null && JSON.stringify(sheet).length > V1_CANVAS_BODY_MAX) return NextResponse.json({ error: "The canvas picture is too large." }, { status: 413 });
    if (body.effort !== undefined && body.effort !== null && !isV1Effort(body.effort)) return NextResponse.json({ error: "The effort level is invalid." }, { status: 400 });
    const effort = isV1Effort(body.effort) ? body.effort : null;
    // (Nov 17, Part 2) liveKey = the panel watches this turn (GET ?live=<key>): his words show as he writes them
    const out = await withV1Live(isV1LiveKey(body.liveKey) ? body.liveKey : null, who.ownerId, () => v1Animator().turn({ ownerId: who.ownerId, projectId: projectId!, animationId, message, recentConversation, canvas, sheet, ground: body.ground === true, effort, ...(Number(body.projectFps) > 0 && Number(body.projectFps) <= 120 ? { projectFps: Number(body.projectFps) } : {}),
      ...(Array.isArray(body.page) && body.page.length === 2 && body.page.every((v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0) ? { page: [Number(body.page[0]), Number(body.page[1])] as [number, number] } : {}) }));   // (Nov 14) the page's own shape
    return out.ok
      ? NextResponse.json({ turn: out.turn, animation: out.animation, started: out.started, ...(out.gate ? { gate: out.gate } : {}), ...(out.handFix ? { handFix: out.handFix } : {}) }, { status: out.started ? 202 : 200 })
      : NextResponse.json({ error: out.error }, { status: out.status });
  }
  if (body.action === "gatePicture") {   // (Nov 22) the gate card's first picture (the engine's own first step, stopped there)
    const out = await v1Animator().gatePicture(who.ownerId, projectId!);
    return out.ok
      ? NextResponse.json({ picture: out.picture, credits: out.credits, animateCredits: out.animateCredits, why: out.why })
      : NextResponse.json({ error: out.error }, { status: out.status });
  }
  if (body.action === "confirm") {   // (Nov 11) the gate card's Animate: start the plan that is waiting (no second AI call)
    const out = v1Animator().confirm(who.ownerId, projectId!);
    return out.ok
      ? NextResponse.json({ turn: out.turn, animation: out.animation, started: out.started }, { status: 202 })
      : NextResponse.json({ error: out.error }, { status: out.status });
  }
  if (body.action === "undo" || body.action === "redo" || body.action === "cancel" || body.action === "continueStory" || body.action === "dropStory") {
    if (!animationId) return NextResponse.json({ error: "The animation identity is required." }, { status: 400 });
    const runner = v1Animator();
    const out = body.action === "undo" ? runner.undo(who.ownerId, projectId!, animationId)
      : body.action === "redo" ? runner.redo(who.ownerId, projectId!, animationId)
        : body.action === "continueStory" ? runner.continueStory(who.ownerId, projectId!, animationId)   // (Nov 20) "Make the rest of my story"
          : body.action === "dropStory" ? runner.dropStory(who.ownerId, projectId!, animationId)   // (Nov 20) "Leave it as it is"
          : runner.cancel(who.ownerId, projectId!, animationId);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    // undo / redo change the version on the canvas: its pictures come back with the answer (unless { layers: false }: the panel kept them)
    return NextResponse.json({ animation: out.animation, ...withResult(who.ownerId, projectId!, animationId, body.action !== "cancel" && body.action !== "continueStory" && body.action !== "dropStory" && body.layers !== false) });
  }
  if (body.action === "layer") {
    const layerId = text(body.layerId, 256), count = Number(body.count);
    if (!animationId || !layerId) return NextResponse.json({ error: "The animation and layer identities are required." }, { status: 400 });
    const out = v1Animator().setLayer(who.ownerId, projectId!, animationId, layerId, count);
    return out.ok ? NextResponse.json({ animation: out.animation }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function GET(request: Request) {
  if (!v1AnimatorServerEnabled()) return off();
  const url = new URL(request.url);
  // (Nov 17, Part 2) what he is writing right now for the turn this panel sent (null = not started yet, or already answered). Only the
  // signed-in owner of that turn can read it (the entry carries his id), so no project lookup is needed for these quick asks.
  const liveKey = url.searchParams.get("live");
  if (liveKey !== null) {
    const access = await requireAccountRequest(request);
    if ("response" in access) return access.response;
    return isV1LiveKey(liveKey) ? NextResponse.json({ live: readV1Live(liveKey, access.session.user.id), words: v1ThinkingWords() }) : NextResponse.json({ error: "The live key is invalid." }, { status: 400 });
  }
  const projectId = url.searchParams.get("projectId")?.trim() || null;
  const who = await owner(request, projectId);
  if ("response" in who) return who.response;
  const animationId = url.searchParams.get("animationId")?.trim() ?? "";
  if (!animationId) {
    // the panel opening again (reload / server restart): the project's latest animation + its saved chat (no pictures: the canvas has them)
    // (Nov 11, Arthur: "the chat is not saved") a copy of a project (a recovered copy after a crash) opens with its parent's AI chat and animation
    const copiedFrom = url.searchParams.get("copiedFrom")?.trim() || null;
    if (copiedFrom && copiedFrom !== projectId && await belongsWithRetry(who.ownerId, copiedFrom)) v1Animator().adopt?.(projectId!, copiedFrom);
    const { animation, lines } = v1Animator().latest(who.ownerId, projectId!);
    return NextResponse.json({ animation, lines, canvas: v1Animator().canvasLimits?.() ?? null }); // (?.: a runner kept from before a hot reload has no canvasLimits)
  }
  const animation = animationId ? v1Animator().get(who.ownerId, projectId!, animationId) : null;
  if (!animation) return NextResponse.json({ error: v1Animator().say("animation_missing") }, { status: 404 });
  const from = Number(url.searchParams.get("from") ?? 0);
  return NextResponse.json({ animation, ...withResult(who.ownerId, projectId!, animationId, url.searchParams.get("layers") !== "0", Number.isInteger(from) && from > 0 ? from : 0) });
}
