"use client";
// The bench's preview player: rebuilds the frames IN THE BROWSER from the returned plan with the same engine code the
// app's Engine test buttons use (plan → scene fitted to the page → buildScene → effects/background → centered),
// then draws picture by picture on a small 16:9 page. Play/Pause and a frame slider.
import { useEffect, useMemo, useRef, useState } from "react";
import { buildScene } from "@/src/lib/animator/engine";
import { drawShapes } from "@/src/lib/animator/effects/draw";
import { makeEffectsTestScene } from "@/src/lib/animator/moves/tests2c";
import { drawFrame } from "@/src/lib/animator/render";
import { centerAnimation, effectFitBounds, visibleStageWidth } from "@/src/lib/animator/stageFit";
import { sceneEffectLayers } from "@/src/lib/animator/toFrames";
import type { BenchPlan } from "./benchTypes";
import { benchColors as c } from "./benchStyle";

const W = 480, H = 270;

type Built =
  | { ok: true; frames: ReturnType<typeof centerAnimation>["frames"]; objects: ReturnType<typeof buildScene>["objects"]; layers: ReturnType<typeof sceneEffectLayers>; count: number; report: ReturnType<typeof buildScene>["report"] }
  | { ok: false; message: string };
// (Built once per plan: the card's "Animating" bar builds it — the real work — and the player then reuses it.)
const BUILT = new WeakMap<object, { fps: number; built: Built }>();
// (A short pause so the bar can paint between the steps; setTimeout, not requestAnimationFrame, so a hidden tab still finishes.)
const nextPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

// Builds the preview step by step (plan -> scene -> every picture -> effects), telling how far the work is (0..1).
export async function buildPreview(plan: BenchPlan, fps: number, onWork?: (done: number) => void): Promise<Built> {
  const cached = BUILT.get(plan);
  if (cached && cached.fps === fps) { onWork?.(1); return cached.built; }
  let built: Built;
  try {
    const stageWidth = visibleStageWidth(W, H);
    onWork?.(0.05); await nextPaint();
    const scene = makeEffectsTestScene(plan, stageWidth);
    onWork?.(0.25); await nextPaint();
    const frames = buildScene(scene, fps);
    onWork?.(0.7); await nextPaint();
    const centered = centerAnimation(frames.frames, stageWidth, frames.objects, effectFitBounds(scene));
    const layers = sceneEffectLayers(scene, frames, centered.shift);
    built = { ok: true, frames: centered.frames, objects: centered.objects ?? frames.objects, layers, count: centered.frames.length, report: frames.report };
  } catch (error) {
    built = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  BUILT.set(plan, { fps, built });
  onWork?.(1);
  return built;
}

function buildNow(plan: BenchPlan, fps: number): Built {
  const cached = BUILT.get(plan);
  if (cached && cached.fps === fps) return cached.built;
  try {
    const stageWidth = visibleStageWidth(W, H);
    const scene = makeEffectsTestScene(plan, stageWidth);
    const built = buildScene(scene, fps);
    const centered = centerAnimation(built.frames, stageWidth, built.objects, effectFitBounds(scene));
    const layers = sceneEffectLayers(scene, built, centered.shift);
    return { ok: true, frames: centered.frames, objects: centered.objects ?? built.objects, layers, count: centered.frames.length, report: built.report };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

// Draws picture i of a built preview (the same layers, in the same order, as the app).
function paint(ctx: CanvasRenderingContext2D, built: Extract<Built, { ok: true }>, i: number, pageColor: string) {
  const scale = H / 1080, map = { scale, offsetX: W / 2 - 960 * scale, offsetY: 0 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = pageColor;
  ctx.fillRect(0, 0, W, H);
  const { layers } = built;
  if (layers.background) drawShapes(ctx, layers.background[i] ?? [], map);
  if (layers.effects) drawShapes(ctx, layers.effects[i]?.back ?? [], map);
  drawFrame(ctx, built.frames[i] ?? [], map, built.objects?.[i] ?? []);
  if (layers.effects) drawShapes(ctx, layers.effects[i]?.front ?? [], map);
  if (layers.top) drawShapes(ctx, layers.top[i] ?? [], map);
}

// (Reviewers only, ?sheet=1: every picture side by side in small, so a whole animation can be checked at a glance.)
function PictureSheet({ built, pageColor }: { built: Extract<Built, { ok: true }>; pageColor: string }) {
  const step = Math.max(1, Math.ceil(built.count / 24));
  const picks = Array.from({ length: Math.ceil(built.count / step) }, (_, k) => k * step);
  return (
    <div data-sheet style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2, width: 960, maxWidth: "100%" }}>
      {picks.map((i) => (
        <div key={i} style={{ position: "relative" }}>
          <canvas width={W} height={H} style={{ width: "100%", height: "auto", border: `1px solid ${c.divider}` }}
            ref={(el) => { const ctx = el?.getContext("2d"); if (el && ctx) paint(ctx, built, i, pageColor); }} />
          <span style={{ position: "absolute", left: 3, top: 1, fontSize: 10, color: "#64748b" }}>{i}</span>
        </div>
      ))}
    </div>
  );
}

function useBuilt(plan: BenchPlan, fps: number) {
  return useMemo(() => buildNow(plan, fps), [plan, fps]);
}

export function PreviewPlayer({ plan, fps }: { plan: BenchPlan; fps: number }) {
  const built = useBuilt(plan, fps);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const count = built.ok ? built.count : 0;
  const pageColor = typeof plan.canvasColor === "string" && plan.canvasColor ? plan.canvasColor : "#ffffff";

  // Playback at the scene's FPS (looping).
  useEffect(() => {
    if (!playing || count <= 1) return;
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % count), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, count, fps]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !built.ok) return;
    paint(ctx, built, Math.min(frame, built.count - 1), pageColor);
  }, [built, frame, pageColor]);
  // (Players only exist after a Run, in the browser — never on the server — so reading the address here is safe.)
  const sheet = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sheet");

  if (!built.ok) return <div style={{ color: c.danger, fontSize: 13 }}>The engine could not build this plan: {built.message}</div>;
  const shown = Math.min(frame, Math.max(0, count - 1));
  return (
    <div style={{ display: "grid", gap: 6, width: sheet ? 960 : W, maxWidth: "100%" }}>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", maxWidth: W, height: "auto", borderRadius: 8, border: `1px solid ${c.border}`, background: pageColor }} aria-label="Animation preview" />
      <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: W }}>
        <button type="button" onClick={() => setPlaying((p) => !p)} style={smallButton}>{playing ? "Pause" : "Play"}</button>
        <input type="range" min={0} max={Math.max(0, count - 1)} value={shown} aria-label="Frame"
          onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} style={{ flex: 1, accentColor: c.accent }} />
        <span style={{ color: c.muted, fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 92, textAlign: "right" }}>
          {shown + 1} / {count} · {fps} FPS
        </span>
      </div>
      {!built.report.ok && <div style={{ color: c.danger, fontSize: 12 }}>Engine report: a body check failed in these frames.</div>}
      {sheet && <PictureSheet built={built} pageColor={pageColor} />}
    </div>
  );
}

const smallButton = { minHeight: 28, padding: "3px 12px", border: `1px solid ${c.border}`, borderRadius: 8, background: c.panel, color: c.text, fontSize: 12, fontWeight: 600, cursor: "pointer" } as const;
