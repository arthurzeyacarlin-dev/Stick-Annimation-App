"use client";

import { useState } from "react";
import { FINISH_CHOICES, cleanUpScene, comeTrueScene, readDrawnFigure, type ReadFigure } from "@/src/lib/animator/moves/fromDrawing";
import { improveAnimation } from "@/src/lib/animator/moves/improveAnimation";
import { effectComesTrueScene } from "@/src/lib/animator/moves/drawingComesTrue";
import { readDrawing } from "@/src/lib/animator/vision/drawingKind";
import { findStickFigure } from "@/src/lib/animator/vision/stickFigure";
import { readAnimation, type ReadFrame } from "@/src/lib/animator/vision/readAnimation";
import { finishAnimation } from "@/src/lib/animator/moves/finishAnimation";
import type { DrawnSpan, EngineDrawingBridge, EngineDrawingInfo } from "./engineDrawingBridge";

// SPEC-0017 "50-50" — the engine helping with the user's OWN animation (review copy only). ONE PRESS per tool: the
// engine LOOKS at the drawings on the current layer itself and finds the stick figure (or the explosion, the fire…)
// — the user never clicks joints or spots (Arthur: "no more asking questions"). Everything lands exactly where they
// drew, as ordinary frames, and one Undo brings their drawing back.

type Tool = "come-true" | "finish" | "clean-up" | "make-better";
type FoundKey = { span: DrawnSpan; fig: ReadFigure };

const UNDO_NOTE = "Press Undo once to bring it all back.";
const NOT_READY = "I couldn't do it right now. Stop playback or finish your current line, then try again.";
const NOTHING_FOUND = "I couldn't find a stick figure or an effect (lightning, fire, an explosion…) on this layer, so I didn't change anything. Try drawing a head, a body, two arms and two legs.";
const TOOL_LABEL: Record<Tool, string> = {
  "come-true": "Make my drawing come true",
  finish: "Finish my animation",
  "clean-up": "Clean up my animation",
  "make-better": "Make my animation better",
};
const KEEP_GOING = "keepGoing";

const spanAt = (spans: readonly DrawnSpan[], frame: number) => spans.find((span) => frame >= span.start && frame <= span.end) ?? null;
const frameList = (frames: readonly number[]) => frames.map((frame) => frame + 1).join(", ");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const skippedNote = (skipped: readonly number[]) => skipped.length ? ` I didn't see a stick figure on frame${skipped.length === 1 ? "" : "s"} ${frameList(skipped)}, so I skipped ${skipped.length === 1 ? "it" : "them"}.` : "";

// Every drawn picture of the layer, read by the engine's eyes: the ones with a stick figure, and the ones without.
function readFigures(bridge: EngineDrawingBridge, spans: readonly DrawnSpan[]) {
  const found: FoundKey[] = [], skipped: number[] = [];
  for (const span of spans) {
    const ink = bridge.frameInk(span.start);
    const figure = ink ? findStickFigure(ink) : null;
    if (figure) found.push({ span, fig: readDrawnFigure(figure.joints, figure.look) });
    else skipped.push(span.start);
  }
  return { found, skipped };
}

// EFFECT drawings across several frames (an explosion growing, lightning…) are left as drawn by Clean up and Make
// better: the engine alone misread Arthur's growing explosion as lightning (2026-10-07), so understanding WHAT an
// animation is moves to Phase 3, where the AI (with the user's words) tells the engine (SPEC-0017 route change).
const EFFECTS_LATER = "I saw effect drawings (like an explosion or lightning) but no stick figure, so I left them as you drew them. Making effect animations better will come with the AI.";

// The drawn frames as engine keys: the same poses on the same frames; a held drawing stays held (two keys with the
// same figure: its first and its last cell).
const engineKeys = (found: readonly FoundKey[], from: number) => found.flatMap(({ span, fig }) => span.end > span.start
  ? [{ frame: span.start - from, fig }, { frame: span.end - from, fig }]
  : [{ frame: span.start - from, fig }]);

export function EngineDrawingTools({ bridge, readOnly }: { bridge: EngineDrawingBridge; readOnly?: boolean }) {
  // "Keep going (what I started)" is the first choice: the engine carries on what the drawings were doing.
  const choices = [...FINISH_CHOICES].sort((a, b) => Number(b.id === KEEP_GOING) - Number(a.id === KEEP_GOING));
  const [picked, setChoice] = useState<string | null>(null);
  const choice = picked && choices.some((entry) => entry.id === picked) ? picked : choices[0]?.id ?? "";
  const [working, setWorking] = useState<Tool | null>(null);
  const [status, setStatus] = useState("");

  const comeTrue = (info: EngineDrawingInfo) => {
    const span = spanAt(info.spans, info.frameIndex);
    if (!span) return `Frame ${info.frameIndex + 1} on layer "${info.layerName}" has no drawing. Go to the frame with your drawing first.`;
    const ink = bridge.frameInk(span.start);
    if (!ink) return NOT_READY;
    const drawing = readDrawing(ink);
    const replace = { mode: "replace", layerId: info.layerId, frameIndex: span.start, count: span.end - span.start + 1 } as const;
    if (drawing.kind === "stickFigure" && drawing.figure) {
      const ok = bridge.place(comeTrueScene(readDrawnFigure(drawing.figure.joints, drawing.figure.look)), replace);
      return ok ? `Your drawing came true! Frame ${span.start + 1} is now an animation: your stick figure moves into the pose you drew, in the same spot. Press Play to watch. ${UNDO_NOTE}` : NOT_READY;
    }
    if (drawing.kind === "unknown" || drawing.kind === "stickFigure") return "I couldn't tell what your drawing is, so I didn't change anything. Try drawing a stick figure, or an explosion, fire, water, lightning, ice or smoke.";
    const ok = bridge.place(effectComesTrueScene(drawing, { fps: info.fps }), replace);
    const what = drawing.kind === "airExplosion" ? "explosion" : drawing.kind;
    return ok ? `Your drawing came true! I saw ${what === "ice" || what === "smoke" || what === "fire" || what === "water" || what === "lightning" ? what : `an ${what}`}, so frame ${span.start + 1} is now a real ${what} animation, in the same place and the same size you drew it. Press Play to watch. ${UNDO_NOTE}` : NOT_READY;
  };

  // Finish and Make better first READ THE WHOLE LAYER (every drawn picture, oldest first): where the floor is, how big
  // the figure is, its limbs matched picture to picture, what it is doing (standing → crouch → take-off…) and whether a
  // picture is an effect (lightning, an explosion) instead of — or as well as — a stick figure.
  const readLayer = (info: EngineDrawingInfo) => {
    const frames: ReadFrame[] = [];
    for (const span of info.spans) {
      const img = bridge.frameInk(span.start);
      if (img) frames.push({ frame: span.start, img });
    }
    return frames.length ? readAnimation(frames, { fps: info.fps }) : null;
  };

  const finish = (info: EngineDrawingInfo) => {
    const last = info.spans[info.spans.length - 1];
    if (!last) return `Layer "${info.layerName}" has no drawing yet. Draw something first — a stick figure, lightning, an explosion…`;
    const read = readLayer(info);
    if (!read) return NOT_READY;
    if (!read.figures.length && !read.effects.length) return NOTHING_FOUND;
    let says = "";
    const ok = bridge.place((page) => {
      const scene = finishAnimation(read, choice, { stageWidth: page.stageWidth, fps: info.fps });
      says = scene.says;
      return scene;
    }, { mode: "new-layer", frameIndex: last.end + 1, skipFirstPicture: true });
    return ok ? `Finished! ${says ? `${says} ` : ""}It starts right after your last drawing (frame ${last.end + 2}), on a new layer. Your own frames didn't change. Press Play to watch. ${UNDO_NOTE}` : NOT_READY;
  };

  // Clean up (Arthur passed it — unchanged): exactly the same frames (count and holds), every drawing redrawn neat.
  const cleanUp = (info: EngineDrawingInfo) => {
    if (!info.spans.length) return `Layer "${info.layerName}" has no drawing yet. Draw your stick figure first.`;
    const { found, skipped } = readFigures(bridge, info.spans);
    if (!found.length) {
      // No stick figure: an explosion, lightning, fire… gets the engine's own effect.
      const read = readLayer(info);
      if (!read) return NOT_READY;
      return read.effects.length ? EFFECTS_LATER : NOTHING_FOUND;
    }
    const from = found[0].span.start, to = found[found.length - 1].span.end, frameCount = to - from + 1;
    const keys = engineKeys(found, from);
    const scene = cleanUpScene(keys, { fps: info.fps, frameCount });
    const ok = bridge.place(scene, { mode: "replace", layerId: info.layerId, frameIndex: from, count: frameCount });
    if (!ok) return NOT_READY;
    return `Cleaned up! I redrew ${plural(found.length, "drawing")} (frames ${from + 1}–${to + 1}) with neat lines — same poses, same timing, same number of frames.${skippedNote(skipped)} Press Play to watch. ${UNDO_NOTE}`;
  };

  // Make better: the whole layer read first (floor, size, limbs matched so an arm never swaps with the other), then the
  // engine fixes the ANIMATION (a hop gets a gravity arc and lands on the floor; planted feet; no crossing arms).
  const makeBetter = (info: EngineDrawingInfo) => {
    if (!info.spans.length) return `Layer "${info.layerName}" has no drawing yet. Draw your stick figure first.`;
    const read = readLayer(info);
    if (!read) return NOT_READY;
    if (!read.figures.length) return read.effects.length ? EFFECTS_LATER : NOTHING_FOUND;
    // Each read figure with the span it belongs to (a held drawing = two keys: its first and its last cell).
    const found: FoundKey[] = [];
    for (const entry of read.figures) {
      const span = info.spans.find((candidate) => candidate.start === entry.frame);
      if (span) found.push({ span, fig: entry.fig });
    }
    if (!found.length) return NOTHING_FOUND;
    const skipped = info.spans.filter((span) => !found.some((key) => key.span === span)).map((span) => span.start);
    const from = found[0].span.start, to = found[found.length - 1].span.end, frameCount = to - from + 1;
    const keys = engineKeys(found, from);
    const improved = improveAnimation(keys, { fps: info.fps, frameCount, floor: read.floor, height: read.height, read });
    const ok = bridge.place(improved.scene, { mode: "replace", layerId: info.layerId, frameIndex: from, count: frameCount });
    if (!ok) return NOT_READY;
    return `Made your animation better! I read your ${plural(found.length, "drawing")} (frames ${from + 1}–${to + 1})${read.going ? ` — ${read.going}` : ""}, then ${improved.fixes.length ? `fixed: ${improved.fixes.join("; ")}.` : "checked the motion and found nothing more to fix."}${skippedNote(skipped)} Press Play to watch. ${UNDO_NOTE}`;
  };

  const run = (tool: Tool) => {
    if (working) return;
    if (!bridge.info()) { setStatus("Pick a layer first."); return; }
    setWorking(tool);
    setStatus("Looking at your drawing…");
    // (Let the message show before the engine looks — reading many frames takes a moment.)
    window.setTimeout(() => {
      try {
        const info = bridge.info();
        if (!info) { setStatus("Pick a layer first."); return; }
        setStatus(tool === "come-true" ? comeTrue(info) : tool === "finish" ? finish(info) : tool === "clean-up" ? cleanUp(info) : makeBetter(info));
      } catch (error) {
        console.warn("[animator] engine drawing tool failed", tool, error);
        setStatus(`Sorry — "${TOOL_LABEL[tool]}" didn't work on this drawing. Nothing was changed.`);
      } finally {
        setWorking(null);
      }
    }, 30);
  };

  const disabled = readOnly || Boolean(working);
  return (
    <>
      <h3>Engine tools (50-50)</h3>
      <p>The engine helps with YOUR drawing on the current layer. Just press a button — it looks at your drawing by itself. One Undo brings everything back.</p>
      <div className="animator-engine-test-list">
        <button type="button" disabled={disabled} onClick={() => run("come-true")} title="Turns the drawing on this frame into an animation: a stick figure moves into your pose; an explosion, fire or water really happens.">{TOOL_LABEL["come-true"]}</button>
      </div>
      <div className="animator-moves"><label>What happens next<select aria-label="What happens next" value={choice} disabled={disabled} onChange={(event) => setChoice(event.target.value)}>{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></div>
      <div className="animator-engine-test-list">
        <button type="button" disabled={disabled} onClick={() => run("finish")} title="Carries on from your last drawing, on a new layer right after it.">{TOOL_LABEL.finish}</button>
        <button type="button" disabled={disabled} onClick={() => run("clean-up")} title="Redraws every drawing on this layer with neat lines. Same frames, same timing.">{TOOL_LABEL["clean-up"]}</button>
        <button type="button" disabled={disabled} onClick={() => run("make-better")} title="Neat drawings AND smoother motion for the whole layer.">{TOOL_LABEL["make-better"]}</button>
      </div>
      {status && <p role="status">{status}</p>}
    </>
  );
}
