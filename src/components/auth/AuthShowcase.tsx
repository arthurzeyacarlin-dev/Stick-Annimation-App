"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AuthScreen.module.css";
import { AuthDemo } from "./AuthDemo";

// (Nov 23, Arthur: "replace them with AI animated videos ... one animation, then once it's fully done, a professional,
// polished transition to the next") The first screen plays REAL animations made by the app's AI Animator, one at a time.
// Each one starts with the exact words that made it typing themselves in, then the animation plays, then a soft
// cross-fade brings the next. Pure playback: it touches no account, no saving and no animation engine.
type Clip = { src: string; poster: string; tag: string; kept?: string[]; typed: string[] };

const CLIPS: Clip[] = [   // (Nov 23) the same three new stories, with the exact words that made them
  { src: "/showcase/new-box-robot.mp4", poster: "/showcase/new-box-robot.jpg", tag: "One typed request", typed: ["A pile of brown cardboard boxes jumps up and snaps together, box by box, into a cardboard robot. The robot blinks, looks at its hands, then starts dancing: it pops and locks, spins on its back like a breakdancer, flips up onto its feet and freezes in a cool pose with one arm up."] },
  { src: "/showcase/new-chef-pizza.mp4", poster: "/showcase/new-chef-pizza.jpg", tag: "One typed request", typed: ["A chef stick figure in a white chef hat spins pizza dough on his finger, then tosses it higher and higher. The last toss goes so high it flies out of sight; he looks up, confused, and it falls back down onto his head. He peels it off and it has turned into a perfect pizza, and he takes a big bite."] },
  { src: "/showcase/new-boulder-car.mp4", poster: "/showcase/new-boulder-car.jpg", tag: "One typed request", typed: ["A stick figure stands at a wall on the left that has a big lever and a red button on it. A red car is parked in the middle of the screen. A long rail runs along the top of the screen, and at the top left a giant grey boulder hangs from a rope tied to a hook on the rail. The stick figure pulls the lever: the hook slides along the rail and carries the hanging boulder from the top left to the top center, right above the car. Then he presses the red button: the rope's loop opens and lets go of the boulder. The rope stays tied up on the rail, empty, and only the boulder falls straight down by itself and smashes the car flat into pieces."] },
];

const TYPE_MS = 16;        // per letter
const LINE_PAUSE_MS = 380; // between two commands
const BEFORE_PLAY_MS = 420;
const HOLD_END_MS = 900;   // the last picture stays a moment before the next one fades in

// (Nov 23, Arthur: "it needs to look like the website ... full screen at the left side") The sign-up page's left side is the
// editor in miniature (AuthDemo): his four stories, each made with the AI Animator, made longer with "then ...", and drawn on with
// the pencil. The page's soft fade sits on top. Plain playback: no account, saving or animation engine is touched.
export function AuthShowcase() {
  return (
    <div className={styles.storyStage} aria-hidden="true">
      <AuthDemo />
      <div className={styles.storyFade} />
    </div>
  );
}

/** The same reel, as the sign-up page's big picture ("auth") or as the proof strip in the editor's animate window ("window"). */
export function ShowcaseReel({ variant }: { variant: "auth" | "window" }) {
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<string[]>([]);  // the commands typed so far for this clip (the last one may be partial)
  const [typing, setTyping] = useState(true);
  const [progress, setProgress] = useState(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    const clip = CLIPS[index];
    const video = videos.current[index];
    let alive = true;
    const timers: number[] = [];
    const later = (ms: number) => new Promise<void>((done) => { timers.push(window.setTimeout(done, ms)); });
    const next = () => { if (alive) setIndex((i) => (i + 1) % CLIPS.length); };
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* old browser */ }
    setProgress(0);
    setTyping(true);
    if (video) { video.pause(); try { video.currentTime = 0; } catch { /* not loaded yet */ } }

    const run = async () => {
      if (reduce) setLines(clip.typed);
      else {
        setLines([]);
        await later(260);
        for (let l = 0; l < clip.typed.length && alive; l++) {
          const text = clip.typed[l];
          for (let c = 2; c <= text.length + 1 && alive; c += 2) {
            setLines([...clip.typed.slice(0, l), text.slice(0, c)]);
            await later(TYPE_MS * 2);
          }
          if (l < clip.typed.length - 1) await later(LINE_PAUSE_MS);
        }
      }
      if (!alive) return;
      setLines(clip.typed);
      setTyping(false);
      await later(BEFORE_PLAY_MS);
      if (!alive || !video) return;
      try { await video.play(); } catch { await later(5000); next(); }   // (autoplay refused: the still stays, the reel still moves on)
    };
    const onTime = () => { if (video && video.duration) setProgress(Math.min(1, video.currentTime / video.duration)); };
    const onEnd = () => { setProgress(1); void later(HOLD_END_MS).then(next); };
    video?.addEventListener("timeupdate", onTime);
    video?.addEventListener("ended", onEnd);
    void run();
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
      video?.removeEventListener("timeupdate", onTime);
      video?.removeEventListener("ended", onEnd);
    };
  }, [index]);

  // a hidden tab never plays in the background
  useEffect(() => {
    const onVisible = () => {
      const v = videos.current[index];
      if (!v) return;
      if (document.hidden) v.pause();
      else if (!typing && v.paused && !v.ended) void v.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [index, typing]);

  const clip = CLIPS[index];
  const bar = (
    <div className={styles.reelBar}>
      {(clip.kept ?? []).map((text) => <p key={`k-${text}`} className={styles.reelKept}><span aria-hidden="true">›</span><span>{text}</span></p>)}
      {lines.map((text, i) => (
        <p key={`${index}-${i}`} className={styles.reelLine}>
          <span aria-hidden="true">›</span><span>{text}{typing && i === lines.length - 1 && <i className={styles.reelCaret} aria-hidden="true" />}</span>
        </p>
      ))}
      {lines.length === 0 && <p className={styles.reelLine}><span aria-hidden="true">›</span><span><i className={styles.reelCaret} aria-hidden="true" /></span></p>}
    </div>
  );
  const stage = (
    <div className={styles.reelStage}>
      {CLIPS.map((c, i) => (
        <video key={c.src} ref={(el) => { videos.current[i] = el; }} className={styles.reelVideo} data-on={i === index ? "true" : undefined}
          src={c.src} poster={c.poster} muted playsInline preload={i === index || i === (index + 1) % CLIPS.length ? "auto" : "metadata"} aria-hidden={i !== index} tabIndex={-1} />
      ))}
    </div>
  );
  const foot = (
    <div className={styles.reelFoot}>
      <span className={styles.reelTrack} aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></span>
      <span className={styles.reelDots} aria-hidden="true">{CLIPS.map((c, i) => <i key={c.src} data-on={i === index ? "true" : undefined} />)}</span>
      <span className={styles.reelTag}>{clip.tag}</span>
    </div>
  );
  if (variant === "window") return (
    <figure className={styles.reelSide} aria-label="Real animations made by typing them here">
      {stage}
      <div className={styles.reelSideText}>{bar}{foot}<figcaption className={styles.reelSideNote}>Typed in this box. Made by the app. Not drawn by hand.</figcaption></div>
    </figure>
  );
  return (
    <figure className={styles.showcase} aria-label="Animations made by typing them in Diamond Animator">
      <div className={styles.reel}>{bar}{stage}{foot}</div>
      <figcaption className={styles.reelCaption}>Every one of these was typed, not drawn. Made with the AI Animator in this app.</figcaption>
    </figure>
  );
}
