"use client";

// Dad, Nov 26 14:54: the after-first-animation guide. Three short steps, ONCE per account, right after its first AI animation
// lands: Watch it (play), Change anything (the AI box), Keep the story going (the frames). The same look as the guided tour
// (LearnMode.tsx: outline, card, bottom bar), so it feels like one app. While it is deciding or showing, the "It's yours" card
// and its testimonial ask wait (aiDock.tsx reads the phase); they come right after it. It never touches the canvas, the AI or
// any price: it only outlines controls and talks. Skip, Esc or Done close it for good (remembered on the server per account).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { firstVisible, LEARN_CSS } from "@/src/components/learn/LearnMode";
import { readAccountJson, writeAccountJson } from "@/src/lib/account/accountDataClient";
import {
  GUIDE_PREF_KEY, GUIDE_STEPS, getGuidePhase, isGuideSeen, placeGuideCard, setGuidePhase, shouldShowGuide,
  type Box, type GuideSeen, type GuideTarget,
} from "./firstAnimationGuideRules";

const onPhone = () => /^(phone|tablet)$/.test(document.documentElement.getAttribute("data-device") ?? "") || window.innerWidth <= 640;
const findTarget = (target: GuideTarget): HTMLElement | null => {
  if (target === "play") return firstVisible(document.querySelectorAll('[data-tour="play"]'));
  if (target === "timeline") return firstVisible(document.querySelectorAll('[data-tour="timeline"]'));
  if (target === "eraser") return firstVisible(document.querySelectorAll('[data-workspace-tool="eraser"]'));
  // the AI box: the top bar's field on a computer, the bottom bar's AI tab on a phone (or the right panel's AI tab)
  return firstVisible(document.querySelectorAll(".ai-top-field")) ?? firstVisible(document.querySelectorAll('[data-pe-tab="ai"]'))
    ?? firstVisible(document.querySelectorAll(".ai-cmd"));
};
/** A check that never got an answer can't hold the "It's yours" card back for long. */
const DECIDE_TIMEOUT_MS = 5000;
let decidedThisPage = false;

export function FirstAnimationGuide({ landedEvent }: { landedEvent: string }) {
  const account = useAccountSession();
  const userId = account?.id ?? null;
  const [step, setStep] = useState<number | null>(null);
  const [rects, setRects] = useState<Box[]>([]);
  const [phone, setPhone] = useState(false);
  // (Nov 26 test) the AI window open (he reopened it to watch the progress): the guide waits until it is closed
  const [aiWindowOpen, setAiWindowOpen] = useState(false);
  const rectsRef = useRef<Box[]>([]);

  // A landing: decide at once (the card waits), then ask the server whether this account has seen the guide.
  useEffect(() => {
    if (!userId) return;
    const onLanded = (event: Event) => {
      if (decidedThisPage || getGuidePhase() !== "idle") return;
      const landedCount = Number((event as CustomEvent<{ count?: number }>).detail?.count) || 1;
      const tourRunning = !!document.querySelector(".da-learn-bar");
      if (!shouldShowGuide({ landedCount, seen: false, tourRunning })) return;
      setGuidePhase("checking");
      let settled = false;
      const giveUp = window.setTimeout(() => { if (!settled) { settled = true; setGuidePhase("idle"); } }, DECIDE_TIMEOUT_MS);
      void (async () => {
        try {
          const record = await readAccountJson<Partial<GuideSeen>>("preferences", GUIDE_PREF_KEY);
          if (settled) return;
          if (isGuideSeen(record?.value)) { decidedThisPage = true; settled = true; setGuidePhase("idle"); return; }
          // remembered BEFORE it shows: a failed save = not shown (never twice), like the trial cards
          await writeAccountJson<GuideSeen>("preferences", GUIDE_PREF_KEY, { schema: "first-animation-guide/v1", seenAt: new Date().toISOString() }, record?.revision ?? 0);
          if (settled) return;
          settled = true;
          decidedThisPage = true;
          setPhone(onPhone());
          setStep(0);
          setGuidePhase("showing");
        } catch {
          if (!settled) { settled = true; setGuidePhase("idle"); }
        } finally {
          window.clearTimeout(giveUp);
        }
      })();
    };
    window.addEventListener(landedEvent, onLanded);
    return () => window.removeEventListener(landedEvent, onLanded);
  }, [userId, landedEvent]);

  const showing = step !== null;
  const close = () => { setStep(null); setRects([]); rectsRef.current = []; setGuidePhase("idle"); };
  useEffect(() => () => { if (getGuidePhase() === "showing") setGuidePhase("idle"); }, []);

  // Keep the outlines on this step's controls (they can move when panels open or the page turns).
  useEffect(() => {
    if (step === null) return;
    const targets = GUIDE_STEPS[step]?.targets;
    if (!targets) return;
    const loop = () => {
      setAiWindowOpen(!!document.querySelector('.ai-spot-scrim[data-open="true"]'));
      const next = targets.flatMap((target) => {
        const box = findTarget(target)?.getBoundingClientRect();
        return box ? [{ left: box.left, top: box.top, width: box.width, height: box.height }] : [];
      });
      const prev = rectsRef.current;
      const same = prev.length === next.length && next.every((b, i) => Math.abs(prev[i].left - b.left) <= 0.5 && Math.abs(prev[i].top - b.top) <= 0.5 && Math.abs(prev[i].width - b.width) <= 0.5 && Math.abs(prev[i].height - b.height) <= 0.5);
      if (!same) { rectsRef.current = next; setRects(next); }
    };
    loop();
    const timer = window.setInterval(loop, 120);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (!showing || aiWindowOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showing, aiWindowOpen]);

  if (step === null || aiWindowOpen || typeof document === "undefined") return null;
  const current = GUIDE_STEPS[step];
  const last = step >= GUIDE_STEPS.length - 1;
  const text = phone ? current.text.phone : current.text.computer;
  const view = { width: window.innerWidth, height: window.innerHeight };
  const spot = rects[0] ? placeGuideCard(rects[0], view) : null;
  const rings = rects.map((box) => placeGuideCard(box, view));
  const barAtTop = rings.some((r) => r.barAtTop);

  return createPortal(
    <div data-first-animation-guide="" data-step={step + 1}>
      <style>{LEARN_CSS}</style>
      {/* like the tour: nothing behind can be clicked while it talks (Skip / Next are on the bar) */}
      <div onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.preventDefault()} style={{ position: "fixed", inset: 0, zIndex: 9000, cursor: "default" }} />
      {rings.map((r, i) => <div key={i} aria-hidden="true" className="da-learn-ring" style={{ left: r.ring.left, top: r.ring.top, width: r.ring.width, height: r.ring.height }} />)}
      <div role="dialog" aria-label={`${current.title}: step ${step + 1} of ${GUIDE_STEPS.length}`} className="da-learn-card"
        style={spot ? { left: spot.cardLeft, top: spot.cardTop, bottom: spot.cardBottom } : { left: "50%", top: 90, transform: "translateX(-50%)" }}>
        {spot && spot.place !== "inside" && <span aria-hidden="true" className="da-learn-tip" data-below={spot.place === "below" ? "true" : undefined} style={{ left: spot.tipLeft }} />}
        <span className="da-learn-count">Step {step + 1} of {GUIDE_STEPS.length}</span>
        <strong>{current.title}</strong>
        <span className="da-learn-text">{text}</span>
      </div>
      <div className="da-learn-bar" style={barAtTop ? { top: 12, bottom: "auto" } : undefined}>
        <div className="da-learn-track" aria-label={`Step ${step + 1} of ${GUIDE_STEPS.length}`}>
          {GUIDE_STEPS.map((_, index) => <span key={index}><span style={{ width: index <= step ? "100%" : "0%" }} /></span>)}
        </div>
        <span className="da-learn-num">{step + 1}/{GUIDE_STEPS.length}</span>
        <button type="button" className="da-learn-quiet da-learn-small" onClick={close}>Skip</button>
        <button type="button" className="da-learn-primary da-learn-small" onClick={() => (last ? close() : setStep(step + 1))}>{last ? "Done" : "Next"}</button>
      </div>
    </div>,
    document.body,
  );
}
