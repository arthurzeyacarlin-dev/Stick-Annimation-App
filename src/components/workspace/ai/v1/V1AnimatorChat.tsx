"use client";

import { smallPosterFrom, writeHomePoster } from "@/src/components/project-library/homePosterStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import { ChatDictateButton, ChatDictationPanel, ChatDictationStatus, ChatEffortPicker, ChatSendButton, ChatToolsRow, chatComposerStyles, type ChatEffort } from "@/src/components/ui/ChatComposerParts";
import type { DictationView } from "@/src/lib/assistant/assistantDictationCapture";
import { decodeEnginePictures } from "@/src/lib/ai/engineBlocks/engineBlockScene";
import { WorkspaceAiPanelShell } from "../WorkspaceAiPanelShell";
import type { EngineDrawingBridge } from "../engineDrawingBridge";
import { V1AnimatorController, emptyV1PanelState, readV1Effort, saveV1Effort, type V1PanelState } from "./v1AnimatorController.ts";
import { createV1CanvasPlacer, V1_LAYER_NAME } from "./v1CanvasPlacer.ts";
import { makeV1CanvasPicture, makeV1ContactSheet, makeV1GroundLines } from "./v1CanvasPicture.ts";
import type { V1GroundRule } from "@/src/lib/ai/v1Animator/v1PageFit";
import type { V1CanvasLimits } from "@/src/lib/ai/v1Animator/v1AnimatorContract";
import { V1AnimatorThread, v1LineIdFromReply, v1ThreadStyles, type V1ReplyComponent } from "./V1AnimatorThread";
import { useAccountPlan } from "@/src/components/account/useAccountPlan";
import { V1OutOfCreditsCard, announceAccountPlanChanged, v1OutOfCreditsView } from "./V1OutOfCreditsCard";
import { SHORT_ANIMATION_CREDITS } from "@/src/lib/account/plans";
import { creditsText } from "@/src/lib/account/credits";
import { sendAiStatus } from "../aiDock";

// AI Animator VERSION 1 panel (switch NEXT_PUBLIC_DIAMOND_V1_ANIMATOR=1, default OFF — off, DrawingAiPanel is exactly
// today's). Chat with Luna; ONE stick figure lands on the canvas as an editable "AI:" layer; edits replace that layer's
// pictures; Undo / Redo swap it back and forth. The composer is the panel's own (same box, same voice typing).

type Props = {
  projectId: string;
  copiedFrom?: string | null; // (Nov 11) the project this one is a copy of: its AI chat and animation come along
  bridge: EngineDrawingBridge;
  readOnly: boolean;
  Reply: V1ReplyComponent;
  // the panel's composer state (shared with its voice typing, so dictated words land here)
  input: string;
  onInputChange: (value: string) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  dictation: DictationView;
  onDictateStart: () => void;
  onDictateStop: () => void;
  onDictateCancel: () => void;
  onSent: () => void; // (clears a running dictation, like today's panel)
  extraTop?: ReactNode; // review-only sections behind their own switches (engine test, story blocks)
};

// (UX Step 1, Nov 11) three examples a stranger can tap: they only fill the message box (the website's own examples).
const V1_EXAMPLES = ["Do a cartwheel", "A punch barrage", "Pound the ground like a gorilla"];

// (the browser's storage for the remembered Effort level; reading it can throw when site data is blocked)
const effortStorage = () => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

export function V1AnimatorChat({ projectId, copiedFrom, bridge, readOnly, Reply, input, onInputChange, composerRef, dictation, onDictateStart, onDictateStop, onDictateCancel, onSent, extraTop }: Props) {
  const [state, setState] = useState<V1PanelState>(emptyV1PanelState);
  // (Nov 3) the account's credits: under one chat message's cost (and not locked) = the out-of-credits card above the box
  const { status: plan } = useAccountPlan();
  const outOfCredits = v1OutOfCreditsView(plan);
  // (Nov 2 final round, owner) the SAME Effort picker as the Help assistant; the chosen level is remembered per project
  const [effort, setEffort] = useState<ChatEffort>("auto");
  useEffect(() => { setEffort(readV1Effort(effortStorage(), projectId)); }, [projectId]);
  const chooseEffort = (next: ChatEffort) => { setEffort(next); saveV1Effort(effortStorage(), projectId, next); };
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // (The workspace may hand a new bridge object when it re-renders: the chat must not restart, so the placer always
  // talks to the latest one.)
  const bridgeRef = useRef(bridge);
  useEffect(() => { bridgeRef.current = bridge; }, [bridge]);
  const placer = useMemo(() => createV1CanvasPlacer({
    place: (source, placement) => bridgeRef.current.place(source, placement),
    info: () => bridgeRef.current.info(),
    goToFrame: (frameIndex) => bridgeRef.current.goToFrame(frameIndex),
    pageMap: () => bridgeRef.current.pageMap(),
    pageSize: () => bridgeRef.current.pageSize?.() ?? null,
    frameInk: (frameIndex) => bridgeRef.current.frameInk(frameIndex),
    setFps: (fps: number) => bridgeRef.current.setFps?.(fps),
    isPlaying: () => bridgeRef.current.isPlaying?.() ?? false,
    pausePlayback: () => bridgeRef.current.pausePlayback?.() ?? false,
    resumePlayback: () => bridgeRef.current.resumePlayback?.(),
    clearCanvas: (request) => bridgeRef.current.clearCanvas?.(request) ?? false,
  }, decodeEnginePictures), []);
  // (Nov 2 final round: the AI sees the canvas) ONE small picture of the user's own drawing (the AI's layer left out), at the book's limits
  const picture = useCallback((limits: V1CanvasLimits, aiLayerId: string | null) => {
    const frame = bridgeRef.current.userFrame?.({ layerIds: [placer.layerId(), aiLayerId].filter((id): id is string => Boolean(id)), layerNames: [V1_LAYER_NAME] });
    return frame ? makeV1CanvasPicture(frame.bitmaps, frame.canvas, frame.map, limits) : null;
  }, [placer]);
  // (Nov 2 night) the timeline contact sheet: up to the book's sheetFrames frames where the layers change. (Nov 3 FINAL V2, Arthur: "why does
  // he say he can't watch the animation") EVERY layer, the AI's own animation included, so the AI watches what it made over the user's drawing
  const sheet = useCallback((limits: V1CanvasLimits) => {
    if (!limits.sheetFrames) return null;
    const got = bridgeRef.current.userSheet?.({ layerIds: [], layerNames: [] }, limits.sheetFrames);
    return got ? makeV1ContactSheet(got.frames, got.canvas, got.map, limits) : null;
  }, [placer]);
  // (Nov 2 final round) the user's ground lines ($0): the same page picture of their own layers, measured by the book's ruler
  const ground = useCallback((rule: V1GroundRule, maxPx: number, aiLayerId: string | null) => {
    const frame = bridgeRef.current.userFrame?.({ layerIds: [placer.layerId(), aiLayerId].filter((id): id is string => Boolean(id)), layerNames: [V1_LAYER_NAME] });
    return frame ? makeV1GroundLines(frame.bitmaps, frame.canvas, frame.map, rule, maxPx) : null; // (lines + the user's drawn things)
  }, [placer]);
  const controllerRef = useRef<V1AnimatorController | null>(null);

  // One controller per project (a new project = a new chat; the canvas layer it made stays a normal layer).
  useEffect(() => {
    placer.forget();
    const controller = new V1AnimatorController({ projectId, copiedFrom, canvasFps: () => bridgeRef.current.info()?.fps ?? null, page: () => bridgeRef.current.pageSize?.() ?? null, fetch: (url, init) => fetch(url, init), place: placer, holds: (layerId) => (bridgeRef.current.hasLayer ? bridgeRef.current.hasLayer(layerId) : null), savedAt: () => bridgeRef.current.savedAt?.() ?? null, kept: {
      read: () => { try { const v = JSON.parse(window.localStorage.getItem(`diamond-ai-saved-version:${projectId}`) ?? "null"); return v && Number.isFinite(v.n) && Number.isFinite(v.at) ? { n: Number(v.n), at: Number(v.at) } : null; } catch { return null; } },
      write: (note) => { try { window.localStorage.setItem(`diamond-ai-saved-version:${projectId}`, JSON.stringify(note)); } catch { /* a blocked store: as before */ } },
    }, clear: (scope, layer) => placer.clearCanvas(scope, layer), picture, sheet, ground, onChange: setState, onCreditsRefused: () => announceAccountPlanChanged(),
      live: { everyMs: 600 } });   // (Nov 17, Part 2) his words show as he writes them
    controllerRef.current = controller;
    setState(controller.current);
    void controller.restore(); // (a reload / server restart: the same chat + animation come back)
    const look = setInterval(() => controller.noticeLayer(), 2000); // (Nov 15 night: a layer he took off the canvas himself is never put back)
    return () => { clearInterval(look); controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [ground, picture, placer, projectId, sheet]);

  // (Nov 18: also once a reply has finished typing, so the gate card under it is in view - the card is no longer pinned over the chat)
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [state.lines.length, state.activity, state.busy, state.reveal.length]);
  // (Nov 15 night, Arthur: the home picture "pops up as soon as it can") right after a version is on the canvas, its first picture is kept small for the home card
  useEffect(() => {
    if (state.busy || typeof state.placedVersion !== "number") return;
    const first = controllerRef.current?.firstPicture();
    if (first) void smallPosterFrom(first).then((url) => writeHomePoster(projectId, url));
  }, [projectId, state.busy, state.placedVersion]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || state.busy || readOnly) return;
    onInputChange(""); onSent();
    void controllerRef.current?.send(message, effort);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  };
  const onRevealed = useCallback((messageId: string) => controllerRef.current?.revealed(v1LineIdFromReply(messageId)), []);

  // (Nov 22, layouts) the editor's top bar shows what the AI Animator is doing - a look only; nothing here changes what it does
  const waitingGate = state.lines.some((l) => l.kind === "gate" && l.state === "waiting");
  useEffect(() => {
    sendAiStatus({ busy: state.busy, phase: state.thinking?.phase ?? null, pct: state.progress?.pct ?? null, part: state.progress?.part ?? null, waiting: waitingGate });
  }, [state.busy, state.thinking?.phase, state.progress?.pct, state.progress?.part, waitingGate]);

  const dictationActive = dictation.phase !== "idle";
  const started = state.lines.length > 0 || Boolean(state.busy);

  return (
    <>
      <style>{v1ThreadStyles}</style>
      <WorkspaceAiPanelShell
        bodyRef={bodyRef}
        body={<>
          {extraTop}
          {!started && (
            <div className="drawing-ai-empty">
              <span className="drawing-ai-logo" aria-hidden="true"><DiamondLogo size={48} /></span>
              <strong>AI Animator</strong>
              <span className="drawing-ai-empty-text">Tell him what should happen, in plain words. He puts it on the canvas as its own layer, and you can change any frame after.</span>
              <div className="drawing-ai-examples" role="group" aria-label="Try an example">
                {V1_EXAMPLES.map((text) => (
                  <button key={text} type="button" disabled={readOnly} onClick={() => { onInputChange(text); composerRef.current?.focus(); }}>{text}</button>
                ))}
              </div>
              <span className="drawing-ai-cost">About {creditsText(SHORT_ANIMATION_CREDITS)} for a 10-second animation · the card shows the exact price before anything is made</span>
            </div>
          )}
          {started && <div className="drawing-ai-thread-head" aria-hidden="true"><span className="drawing-ai-logo drawing-ai-logo-small"><DiamondLogo size={26} /></span><span>AI Animator</span></div>}
          <V1AnimatorThread
            state={state}
            Reply={Reply}
            readOnly={readOnly}
            onRevealed={onRevealed}
            onUndo={() => void controllerRef.current?.step("undo")}
            onRedo={() => void controllerRef.current?.step("redo")}
            // (Nov 11, Arthur) no cancel X while animating: the gate card is where the user says no; a cancel left H3 paid for and the user not
            onAnimate={(lineId) => void controllerRef.current?.animate(lineId)}
            onChangePlan={() => composerRef.current?.focus()}
            onAnswer={(answers) => {   // (Nov 11) the question card: an FPS answer sets the project's FPS now; all answers go back as one message
              const fps = answers.map((a) => /(\d{1,2})\s*fps/i.exec(a)).find(Boolean); if (fps) bridgeRef.current.setFps?.(Number(fps[1]));
              void controllerRef.current?.send(answers.join(". "));
            }}
          />
          {/* (Nov 20) a story that stopped half way (no money, no video): its kept parts, made by one press */}
          {!state.busy && !readOnly && Number(state.snapshot?.storyPartsHeld) > 0 && !state.lines.some((l) => l.kind === "gate" && l.state === "waiting") && <div className="v1-card v1-versions v1-gate" data-v1-story-held="" data-workspace-theme-exempt="">
            <div className="v1-gate-head"><span>Your story is not finished</span><span className="v1-gate-cost">{Number(state.snapshot?.storyPartsHeld)} part{Number(state.snapshot?.storyPartsHeld) > 1 ? "s" : ""} left</span></div>
            <div className="v1-actions" role="group" aria-label="Finish your story"><button type="button" title="Make the parts of your story that are still missing" onClick={() => void controllerRef.current?.continueStory()}>Make the rest of my story</button><button type="button" title="Keep the animation as it is now" onClick={() => void controllerRef.current?.dropStory()}>Leave it as it is</button></div>
          </div>}
        </>}
        composer={<>
          {outOfCredits && <V1OutOfCreditsCard view={outOfCredits} />}
          <form onSubmit={submit} className={`${chatComposerStyles.box} ${chatComposerStyles.compact} ${chatComposerStyles.quiet}`} aria-label="AI Animator message composer">
          <textarea ref={composerRef} aria-label="Message AI Animator" value={input} onChange={(event) => onInputChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Tell the AI Animator what happens next…" disabled={Boolean(state.busy) || readOnly} rows={2} />
          {dictationActive
            ? <ChatDictationPanel dictation={dictation} onCancel={onDictateCancel} onStop={onDictateStop} />
            : <ChatToolsRow
              left={<ChatEffortPicker value={effort} onChange={chooseEffort} disabled={Boolean(state.busy) || readOnly} />}
              right={<>
                <ChatDictateButton disabled={dictationActive || Boolean(state.busy) || readOnly} onClick={onDictateStart} />
                {/* (Cancel lives in the Animating card, Nov 1) */}
                <ChatSendButton disabled={!input.trim() || Boolean(state.busy) || readOnly} />
              </>}
            />}
          <ChatDictationStatus dictation={dictation} />
        </form>
        </>}
      />
    </>
  );
}
