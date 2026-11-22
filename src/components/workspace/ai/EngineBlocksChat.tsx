"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ENGINE_CONTEST_UI_ENABLED, type EngineJobSnapshot, type EngineStoryPlan } from "@/src/lib/ai/engineBlocks/engineBlocksContract";
import { decodeEnginePictures, engineBlockScene } from "@/src/lib/ai/engineBlocks/engineBlockScene";
import type { FrameCharacter } from "@/src/lib/animator/engine";
import type { EngineDrawingBridge } from "./engineDrawingBridge";
import { workspaceColors } from "../workspaceTheme";

// AI Animator, BLOCK BY BLOCK (switch NEXT_PUBLIC_DIAMOND_ENGINE_BLOCKS=1, default OFF): the AI says the story plan in
// short blocks -> "Make block 1" -> the engine job -> the block lands on the canvas as normal editable frames ->
// the user edits -> "Next block" continues from the last block's end pose. A block the engine blocks is said
// honestly and never added. Plain UI: only buttons are boxes.

type Line = { id: number; who: "user" | "ai"; text: string; list?: string[]; tone?: "error" };
type Placed = { start: number; count: number; last: FrameCharacter[] | null }; // last = the block's last picture (the next block continues from it)
type Decoded = { under: (HTMLImageElement | null)[]; over: (HTMLImageElement | null)[]; figures?: { name: string; pictures: (HTMLImageElement | null)[] }[] } | null;

const POLL_MS = 2000;

export function EngineBlocksChat({ projectId, bridge, readOnly }: { projectId: string; bridge: EngineDrawingBridge; readOnly: boolean }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<EngineStoryPlan | null>(null);
  const [job, setJob] = useState<EngineJobSnapshot | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]); // per made block: where it sits on the timeline
  const [pending, setPending] = useState<{ made: EngineJobSnapshot; fx: Decoded } | null>(null); // made, but not on the canvas yet
  const [busy, setBusy] = useState(false);
  const [director, setDirector] = useState<"A" | "B">("A"); // (dev) blind director contest: which director plans (hidden which AI it is)
  const nextId = useRef(1);
  const say = useCallback((line: Omit<Line, "id">) => setLines((all) => [...all, { ...line, id: nextId.current++ }]), []);

  // A new project = a new story.
  useEffect(() => { setLines([]); setPlan(null); setJob(null); setPlaced([]); setPending(null); }, [projectId]);

  const askPlan = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy || readOnly) return;
    setBusy(true); setInput(""); say({ who: "user", text: message });
    try {
      const response = await fetch("/api/ai-animator/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", projectId, message, ...(ENGINE_CONTEST_UI_ENABLED ? { director } : {}) }) });
      const body = await response.json().catch(() => null) as { ok?: boolean; plan?: EngineStoryPlan; message?: string; error?: string } | null;
      if (body?.ok && body.plan) {
        setPlan(body.plan); setPlaced([]); setPending(null); setJob(null);
        say({ who: "ai", text: `Here is the story in ${body.plan.blocks.length} block${body.plan.blocks.length === 1 ? "" : "s"} (${body.plan.label}). I make one block at a time; you can edit each one before the next.`, list: body.plan.blocks.map((block) => `Block ${block.index + 1}: ${block.say}`) });
      } else {
        setPlan(null); setPending(null); // (an earlier plan is not continued under a new request it doesn't match)
        say({ who: "ai", text: body?.message ?? body?.error ?? "I couldn't make a plan.", tone: "error" });
      }
    } catch {
      say({ who: "ai", text: "I couldn't reach the engine. Nothing changed.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  // Put a made block on the canvas: a new layer, starting right after the previous block.
  const place = useCallback((made: EngineJobSnapshot, fx: Decoded) => {
    if (!plan || !made.result) return false;
    const info = bridge.info();
    const fps = info?.fps ?? made.result.fps;
    const block = plan.blocks[made.blockIndex];
    const before = placed.slice(0, made.blockIndex);
    const previous = before.length ? before[before.length - 1] : null;
    // (the next block continues from the last picture of the block before it)
    const scene = engineBlockScene(made.result, `Block ${made.blockIndex + 1} - ${block?.say ?? ""}`.slice(0, 80), `engine-${made.jobId}`, fps, made.result.continuedFromLastPose ? previous?.last ?? null : null, fx && made.result.effectLayers ? fx : null, fx?.figures ?? null);
    const start = previous ? previous.start + previous.count : 0;
    const ok = bridge.place(scene, { mode: "new-layer", frameIndex: start });
    if (!ok) return false;
    const count = scene.prebuiltFrames.frames.length;
    setPlaced((all) => [...all.slice(0, made.blockIndex), { start, count, last: scene.prebuiltFrames.frames.at(-1) ?? null }]);
    setPending(null);
    const kinds = made.result.effects.map((e) => String(e.kind ?? "effect")).join(", ");
    const fxSaid = !made.result.effects.length ? ""
      : scene.prebuiltEffectLayers ? ` The effects (${kinds}) are on their own layers: "effects behind" under the figures and "effects in front" over them.`
      : ` This block has effects (${kinds}) but they could not be drawn on the canvas${made.result.effectLayersError ? ` (${made.result.effectLayersError})` : ""}, so they are not shown.`;
    say({
      who: "ai",
      text: `Block ${made.blockIndex + 1} is on the canvas: frames ${start + 1} to ${start + count}, on its own layer${made.result.continuedFromLastPose ? ", starting from where block " + made.blockIndex + " ended" : ""}. Every frame is a normal drawing — edit anything, then press Next block.` + fxSaid,
    });
    return true;
  }, [bridge, placed, plan, say]);

  // A finished job: a made block goes on the canvas; a blocked / failed one is said honestly (never added).
  const settle = useCallback((next: EngineJobSnapshot) => {
    if (next.status === "done") {
      void (async () => {
        const layers = next.result?.effectLayers, figs = next.result?.figureLayers;
        const fx: Decoded = layers || figs ? {
          under: layers ? await decodeEnginePictures(layers.under) : [], over: layers ? await decodeEnginePictures(layers.over) : [],
          // (wired V1) the story path's figures: each figure's own pictures on its own layer
          ...(figs ? { figures: await Promise.all(figs.layers.map(async (layer) => ({ name: layer.name, pictures: await decodeEnginePictures(layer.pictures) }))) } : {}),
        } : null;
        if (!place(next, fx)) { setPending({ made: next, fx }); say({ who: "ai", text: `Block ${next.blockIndex + 1} is made. Stop playback and finish your current stroke, then press "Put block on canvas".` }); }
      })();
    } else {
      say({ who: "ai", text: next.message ?? "The engine could not make this block. Nothing was added.", list: next.why.slice(0, 8), tone: "error" });
    }
  }, [place, say]);

  // Poll the running job.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ai-animator/engine?jobId=${encodeURIComponent(job.jobId)}&projectId=${encodeURIComponent(projectId)}`);
        const next = await response.json().catch(() => null) as EngineJobSnapshot | null;
        if (!response.ok || !next?.jobId) { setJob(null); say({ who: "ai", text: "I lost track of the engine job. Nothing was added.", tone: "error" }); return; }
        if (next.status === "running") { setJob(next); return; }
        setJob(next);
        settle(next);
      } catch {
        // try again on the next tick
        setJob({ ...job });
      }
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [job, projectId, say, settle]);

  const make = async (blockIndex: number) => {
    if (!plan || busy || readOnly) return;
    setBusy(true);
    say({ who: "user", text: blockIndex === 0 ? "Make block 1" : `Next block (block ${blockIndex + 1})` });
    try {
      const response = await fetch("/api/ai-animator/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make", projectId, storyId: plan.storyId, blockIndex }) });
      const body = await response.json().catch(() => null) as (EngineJobSnapshot & { error?: string }) | null;
      if (!response.ok || !body?.jobId) { say({ who: "ai", text: body?.error ?? "The engine could not start.", tone: "error" }); return; }
      setJob(body);
      if (body.status !== "running") settle(body);
    } catch {
      say({ who: "ai", text: "I couldn't reach the engine. Nothing changed.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!job) return;
    await fetch("/api/ai-animator/engine", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.jobId, projectId }) }).catch(() => null);
    setJob(null);
    say({ who: "ai", text: "Stopped. Nothing was added." });
  };

  const running = job?.status === "running";
  const nextBlock = plan ? placed.length : 0;
  const canMake = Boolean(plan) && !running && !pending && !busy && !readOnly && nextBlock < (plan?.blocks.length ?? 0);

  return (
    <section className="engine-blocks" aria-label="AI Animator story blocks">
      <style>{`
        .engine-blocks { display: grid; gap: 10px; padding: 0 0 12px; border-bottom: 1px solid ${workspaceColors.border}; }
        .engine-blocks h3 { margin: 0; font-size: 12px; font-weight: 700; color: #f6f9ff; }
        .engine-blocks p, .engine-blocks li { margin: 0; font-size: 12px; line-height: 1.48; color: #c9d6ea; overflow-wrap: anywhere; }
        .engine-blocks .eb-user { align-self: flex-end; justify-self: end; max-width: 88%; color: #eaf3ff; }
        .engine-blocks .eb-error { color: ${workspaceColors.danger}; }
        .engine-blocks ul { margin: 4px 0 0; padding-left: 18px; display: grid; gap: 2px; }
        .engine-blocks .eb-note { font-size: 11px; color: #8fabd0; }
        .engine-blocks .eb-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .engine-blocks button { min-height: 32px; padding: 4px 12px; border-radius: 10px; border: 1px solid #3a6aa3; background: #0f2a52; color: #f6f9ff; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
        .engine-blocks button:hover:enabled { border-color: #0066ff; background: #0066ff; }
        .engine-blocks button:disabled { opacity: .45; cursor: not-allowed; }
        .engine-blocks button[aria-pressed="true"] { border-color: #0066ff; background: #0066ff; }
        .engine-blocks form { display: flex; gap: 6px; }
        .engine-blocks input { flex: 1; min-width: 0; min-height: 32px; border: 1px solid #244267; border-radius: 10px; padding: 4px 10px; color: #eaf3ff; background: #030914; font: inherit; font-size: 12px; }
      `}</style>
      <h3>Story, block by block</h3>
      <p className="eb-note">Test copy: each block is made by the animation engine on this computer. The plan&apos;s label says who wrote it (Luna or the contest&apos;s Director A/B, checked against your words, or a PM-written plan).</p>
      {ENGINE_CONTEST_UI_ENABLED && (
        <div className="eb-row" role="group" aria-label="Director contest: who plans">
          {(["A", "B"] as const).map((letter) => (
            <button key={letter} type="button" aria-pressed={director === letter} disabled={busy || running} onClick={() => setDirector(letter)}>Director {letter}</button>
          ))}
        </div>
      )}
      {lines.map((line) => (
        <div key={line.id} className={line.who === "user" ? "eb-user" : undefined}>
          <p className={line.tone === "error" ? "eb-error" : undefined} role={line.tone === "error" ? "alert" : undefined}>{line.text}</p>
          {line.list && line.list.length > 0 && <ul>{line.list.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        </div>
      ))}
      {running && <p role="status">Making block {(job?.blockIndex ?? 0) + 1}: {job?.progress || "working"}… (this can take a few minutes)</p>}
      <div className="eb-row">
        {plan && nextBlock < plan.blocks.length && (
          <button type="button" disabled={!canMake} onClick={() => void make(nextBlock)}>{nextBlock === 0 ? "Make block 1" : `Next block (${nextBlock + 1})`}</button>
        )}
        {pending && <button type="button" disabled={readOnly} onClick={() => { if (!place(pending.made, pending.fx)) say({ who: "ai", text: "Still can't put it on the canvas. Stop playback and finish your current stroke first.", tone: "error" }); }}>Put block on canvas</button>}
        {running && <button type="button" onClick={() => void stop()}>Stop</button>}
      </div>
      <form onSubmit={askPlan} aria-label="Story for the engine">
        <input aria-label="Story for the engine" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Say the story (e.g. who does what)" disabled={busy || running || readOnly} />
        <button type="submit" disabled={!input.trim() || busy || running || readOnly}>Plan</button>
      </form>
    </section>
  );
}
