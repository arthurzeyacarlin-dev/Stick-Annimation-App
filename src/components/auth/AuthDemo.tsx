"use client";

import { useEffect, useRef, useState } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import s from "./AuthDemo.module.css";

// (Nov 23, Arthur: "it needs to look like the website ... where you talk to the AI animator at the right"; "you can animate it
// with the AI, you can edit it with AI, or you can edit it yourself"; "a visible mouse that's also fake, and it gets the pencil
// tool, it can draw over"; "there's always text ... terminal-based"; "full screen at the left side"; "everything is fake")
// The sign-up page's left side: the editor in miniature, played like a film. For each of his four stories the AI Animator on the
// right types the request, the animation lands on the canvas and plays; then "then ..." makes it longer; then a fake mouse takes
// the pencil and draws on the last frame. Pure playback of files in /public/showcase: no account, saving or AI is touched.

type Story = {
  video: string;
  split: number;       // seconds: where the "then ..." part begins
  make: string; makeReply: string;
  edit: string; editReply: string;
  drawing: string[];   // pencil strokes on the last frame, in a 1600 x 900 canvas
};

const star = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return `M${pts.join(" L")}`;
};
const wave = (x: number, y0: number, y1: number) => { const h = (y0 - y1) / 4; return `M${x} ${y0} q 14 ${-h / 2} 0 ${-h} q -14 ${-h / 2} 0 ${-h} q 14 ${-h / 2} 0 ${-h} q -14 ${-h / 2} 0 ${-h}`; };

const STORIES: Story[] = [
  {
    video: "/showcase/new-soccer-story.mp4", split: 5.08,
    make: "A stick figure kicks a soccer ball so hard it flies away",
    makeReply: "He winds up and kicks the ball clean out of the picture.",
    edit: "then the ball flies back, hits him in the face and he falls flat on his back",
    editReply: "The ball comes back and floors him.",
    drawing: [star(92, 626, 30), star(186, 576, 36), star(282, 626, 30)],
  },
  {
    video: "/showcase/new-box-robot.mp4", split: 5.4,
    make: "A pile of cardboard boxes jumps up and snaps together into a robot",
    makeReply: "Box by box, the pile builds itself into a robot.",
    edit: "then the robot breakdances, spins on its back and freezes in a cool pose",
    editReply: "It dances, spins on its back and strikes a pose.",
    drawing: ["M712 118 L724 46 L766 92 L800 30 L834 92 L876 46 L888 118 Z"],
  },
  {
    video: "/showcase/new-boulder-car.mp4", split: 6.9,
    make: "A stick figure pulls a lever and the hook carries a giant boulder over a red car",
    makeReply: "The lever slides the boulder along the rail, right over the car.",
    edit: "then he presses the red button and the boulder smashes the car flat",
    editReply: "The rope lets go and the boulder crushes the car.",
    drawing: ["M640 540 L585 495", "M626 640 L556 640", "M640 735 L585 780", "M960 540 L1015 495", "M974 640 L1044 640", "M960 735 L1015 780"],
  },
  {
    video: "/showcase/new-chef-pizza.mp4", split: 7.5,
    make: "A chef tosses pizza dough so high it flies out of sight",
    makeReply: "He spins the dough, and the last toss never comes down.",
    edit: "then it falls back onto his head as a perfect pizza and he takes a bite",
    editReply: "It lands on his head as a pizza. He peels it off and bites.",
    drawing: [wave(900, 520, 380), wave(960, 505, 350), wave(1020, 520, 380)],
  },
];

const CAPTIONS = ["Animate it with AI", "Edit it with AI", "Or draw it yourself"];
const RATE = 1.2;
type Line = { id: number; kind: "you" | "ai" | "done"; text: string };
type Status = { word: string; pct?: number } | null;

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export function AuthDemo() {
  const root = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pencilRef = useRef<HTMLSpanElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const ids = useRef(0);
  const [story, setStory] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [caption, setCaption] = useState(-1);
  const [onCanvas, setOnCanvas] = useState(-1);  // which story is on the canvas
  const [made, setMade] = useState(0);           // how much of the story is on the timeline (0..1)
  const [head, setHead] = useState(-1);          // the playhead (0..1), -1 = hidden
  const [tool, setTool] = useState<"select" | "pencil">("select");
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean; glide: boolean; down: boolean }>({ x: 0, y: 0, on: false, glide: true, down: false });
  const [drawn, setDrawn] = useState<number[]>([]); // how much of each stroke is drawn (0..1)
  const [inkOut, setInkOut] = useState(false);   // the drawing fading out before the next story
  const [cbox, setCbox] = useState<{ x: number; y: number } | null>(null); // the canvas corner, for the floating words

  useEffect(() => {
    const el = canvasRef.current, box = root.current;
    if (!el || !box || typeof ResizeObserver === "undefined") return;
    const measure = () => { const a = box.getBoundingClientRect(), b = el.getBoundingClientRect(); setCbox({ x: b.left - a.left, y: b.top - a.top }); };
    const ro = new ResizeObserver(measure); ro.observe(el); ro.observe(box); measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const live = () => alive;
    // people who turn motion off see the finished first story, still
    let calm = false;
    try { calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* old browser */ }
    if (calm) {
      const st = STORIES[0], v = videos.current[0];
      setLines([{ id: 1, kind: "you", text: st.make }, { id: 2, kind: "done", text: "On your canvas · every frame editable" }, { id: 3, kind: "you", text: st.edit }, { id: 4, kind: "done", text: "Added after part 1 · the rest stays as it is" }]);
      setOnCanvas(0); setMade(1); setCaption(2); setDrawn(st.drawing.map(() => 1));
      if (v) { const end = () => { try { v.currentTime = Math.max(0, v.duration - 0.05); } catch { /* not loaded */ } }; if (v.readyState >= 1) end(); else v.addEventListener("loadedmetadata", end, { once: true }); }
      return () => { alive = false; };
    }
    // a wait that stops counting while the tab is hidden
    const wait = async (ms: number) => { let left = ms; while (left > 0 && alive) { const step = Math.min(left, 100); await sleep(step); if (!document.hidden) left -= step; } };
    const add = (kind: Line["kind"], text: string) => { const id = ++ids.current; setLines((l) => [...l.slice(-5), { id, kind, text }]); return id; };
    const type = async (text: string) => {
      const steps = 24, per = 760 / steps;   // (Nov 23, Arthur: faster) every request types in about 0.8 s
      for (let n = 1; n <= steps && alive; n++) { setDraft(text.slice(0, Math.ceil((text.length * n) / steps))); await wait(per); }
      setDraft(text); await wait(140); setDraft("");
    };
    const reply = async (text: string) => {
      const id = add("ai", ""); const words = text.split(" ");
      for (let w = 1; w <= words.length && alive; w++) { setLines((l) => l.map((x) => (x.id === id ? { ...x, text: words.slice(0, w).join(" ") } : x))); await wait(260 / words.length); }
    };
    const progress = async (word: string, from: number, to: number, ms: number) => {
      for (let p = 0; p <= 100 && alive; p += 4) { setStatus({ word, pct: p }); setMade(from + ((to - from) * p) / 100); await wait(ms / 25); }
      setStatus(null);
    };
    const playTo = async (v: HTMLVideoElement, from: number, to: number) => {
      v.pause();
      try { v.currentTime = from; } catch { /* not loaded yet */ }
      v.playbackRate = RATE;
      const dur = v.duration || to;
      try { await v.play(); } catch { setHead(to / dur); return; }  // (autoplay refused: the picture stays, the film moves on)
      while (alive) {
        if (document.hidden) { v.pause(); await sleep(150); continue; }
        if (v.paused && !v.ended) void v.play().catch(() => {});
        setHead(Math.min(1, v.currentTime / dur));
        if (v.currentTime >= to - 0.05 || v.ended) break;
        await sleep(40);
      }
      v.pause();
    };
    const spot = (el: Element | null, fx = 0.5, fy = 0.5) => {
      const box = root.current?.getBoundingClientRect(); const r = el?.getBoundingClientRect();
      return box && r ? { x: r.left - box.left + r.width * fx, y: r.top - box.top + r.height * fy } : { x: 0, y: 0 };
    };
    const ready = (v: HTMLVideoElement) => new Promise<void>((done) => { if (v.readyState >= 2) return done(); const t = setTimeout(done, 4000); v.addEventListener("loadeddata", () => { clearTimeout(t); done(); }, { once: true }); });

    (async () => {
      let i = 0;
      await wait(150);
      while (alive) {
        const st = STORIES[i];
        const v = videos.current[i];
        // (Nov 23, Arthur: "I never want it to disappear") the next story starts in the same editor: the chat keeps going, the
        // last picture stays on the canvas until the new animation lands and cross-fades over it; only the old drawing fades out
        setStatus(null); setHead(-1); setTool("select"); setMade(0);
        videos.current.forEach((x, k) => { if (x && k !== i) x.pause(); });
        if (v) { v.preload = "auto"; try { v.currentTime = 0; } catch { /* not loaded */ } }
        const nextV = videos.current[(i + 1) % STORIES.length]; if (nextV) nextV.preload = "auto";

        // 1. animate it with AI  (Nov 23, Arthur: faster typing, answers and drawing; the animations play at the same speed)
        setCaption(0); await wait(250);
        await type(st.make); add("you", st.make);
        setStatus({ word: "thinking" }); await wait(320); setStatus(null);
        await reply(st.makeReply);
        if (v) await ready(v);
        await progress("animating", 0, st.split / (v?.duration || st.split * 2), 650);
        add("done", "On your canvas · every frame editable");
        setOnCanvas(i); await wait(120);
        if (v) await playTo(v, 0, st.split);
        await wait(150);

        // 2. edit it with AI
        setCaption(1); await wait(200);
        await type(st.edit); add("you", st.edit);
        setStatus({ word: "thinking" }); await wait(280); setStatus(null);
        await reply(st.editReply);
        await progress("animating", st.split / (v?.duration || st.split * 2), 1, 550);
        add("done", "Added after part 1 · the rest stays as it is");
        await wait(100);
        if (v) await playTo(v, 0, v.duration || st.split * 2);   // (Nov 23, Arthur) after the edit the whole animation plays, start to finish
        await wait(150);

        // 3. or draw it yourself
        setCaption(2); await wait(150);
        const start = spot(canvasRef.current, 0.62, 0.35);
        setCursor({ x: start.x, y: start.y, on: true, glide: false, down: false }); await wait(40);
        const pen = spot(pencilRef.current);
        setCursor((c) => ({ ...c, x: pen.x, y: pen.y, glide: true })); await wait(430);
        setCursor((c) => ({ ...c, down: true })); setTool("pencil"); await wait(110); setCursor((c) => ({ ...c, down: false }));
        await wait(80);
        const box = root.current?.getBoundingClientRect(); const cv = canvasRef.current?.getBoundingClientRect();
        const toRoot = (p: DOMPoint) => (box && cv ? { x: cv.left - box.left + (p.x / 1600) * cv.width, y: cv.top - box.top + (p.y / 900) * cv.height } : { x: 0, y: 0 });
        for (let k = 0; k < st.drawing.length && alive; k++) {
          const path = pathRefs.current[k];
          if (!path) continue;
          const len = path.getTotalLength();
          const a = toRoot(path.getPointAtLength(0));
          setCursor((c) => ({ ...c, x: a.x, y: a.y, glide: true })); await wait(k === 0 ? 420 : 170);
          setCursor((c) => ({ ...c, glide: false, down: true }));
          const ms = Math.max(140, Math.min(320, len * 0.9)); const t0 = performance.now();
          while (alive) {
            const f = Math.min(1, (performance.now() - t0) / ms);
            const p = toRoot(path.getPointAtLength(len * f));
            setCursor((c) => ({ ...c, x: p.x, y: p.y })); setDrawn((d) => { const n = [...d]; n[k] = f; return n; });
            if (f >= 1) break;
            await sleep(16);
          }
          setCursor((c) => ({ ...c, down: false }));
        }
        const rest = spot(canvasRef.current, 0.8, 0.3);
        setCursor((c) => ({ ...c, x: rest.x, y: rest.y, glide: true })); await wait(1300);

        // on to the next story: only the drawing and the mouse fade; everything else stays
        setCursor((c) => ({ ...c, on: false })); setInkOut(true); await wait(350);
        i = (i + 1) % STORIES.length;
        setStory(i); setDrawn([]); setInkOut(false);
      }
    })();
    return () => { alive = false; videos.current.forEach((x) => x?.pause()); void live; };
  }, []);

  const st = STORIES[story];
  return (
    <div ref={root} className={s.demo} aria-hidden="true">
      <div className={s.bar}>
        <span className={s.brand}><DiamondLogo size={16} /><span>File</span><span>Edit</span><span>View</span><span>Window</span></span>
        <span className={s.field}><i>✦</i>{status?.pct !== undefined ? `Animating · ${status.pct}%` : "Say what to change, or make another…"}<kbd>⌘ K</kbd></span>
        <span className={s.right}><span className={s.saved}>Saved</span><span className={s.export}>Export</span></span>
      </div>
      <div className={s.body}>
        <div className={s.rail}>
          <span className={tool === "select" ? s.toolOn : s.tool}><svg viewBox="0 0 24 24"><path d="M5 3l6.5 17 2.4-7.1L21 10.5z" /></svg></span>
          <span ref={pencilRef} className={tool === "pencil" ? s.toolOn : s.tool}><svg viewBox="0 0 24 24"><path d="M4 20l4.2-1L19 8.2 15.8 5 5 15.8z" /><path d="M13.6 7.2l3.2 3.2" /></svg></span>
          <span className={s.tool}><svg viewBox="0 0 24 24"><path d="M8 20h11" /><path d="M5.5 15.5l8-8 5 5-5 5H9z" /></svg></span>
          <span className={s.tool}><svg viewBox="0 0 24 24"><path d="M12 3.5s5.5 6 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z" /></svg></span>
          <span className={s.tool}><svg viewBox="0 0 24 24"><path d="M5 6.5V4.5h14v2" /><path d="M12 4.5v15" /><path d="M9 19.5h6" /></svg></span>
          <span className={s.tool}><svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="4" /><rect x="12.5" y="12.5" width="8" height="8" rx="1.2" /></svg></span>
        </div>
        <div className={s.main}>
          <div className={s.area}>
            <div ref={canvasRef} className={s.canvas}>
              {STORIES.map((x, k) => (
                <video key={x.video} ref={(el) => { videos.current[k] = el; }} src={x.video} muted playsInline preload={k < 2 ? "auto" : "metadata"} tabIndex={-1}
                  className={s.clip} data-on={k === onCanvas ? "true" : undefined} />
              ))}
              <svg className={s.ink} data-out={inkOut ? "true" : undefined} viewBox="0 0 1600 900" preserveAspectRatio="none">
                {st.drawing.map((d, k) => (
                  <path key={`${story}-${k}`} ref={(el) => { pathRefs.current[k] = el; }} d={d} pathLength={1}
                    style={{ strokeDasharray: 1, strokeDashoffset: 1 - (drawn[k] ?? 0) }} />
                ))}
              </svg>
            </div>
          </div>
          <div className={s.timeline}>
            <span className={s.fps}>FPS 24</span>
            <span className={s.track}>
              <span className={s.frames} style={{ width: `${made * 100}%` }} />
              {head >= 0 && <span className={s.head} style={{ left: `${head * made * 100}%` }} />}
            </span>
          </div>
        </div>
        <div className={s.panel}>
          <div className={s.panelTop}>
            <DiamondLogo size={14} />
            <span className={s.state} data-busy={status ? "true" : undefined}>
              {status ? (status.pct !== undefined ? `${status.word} · ${status.pct}%` : `${status.word}…`) : lines.length ? "on your canvas" : "ready"}
            </span>
          </div>
          <div className={s.lines}>
            {lines.map((l) => (
              <p key={l.id} data-new="true" className={l.kind === "you" ? s.you : l.kind === "ai" ? s.ai : s.done}>
                {l.kind === "you" && <span className={s.prompt}>›</span>}{l.kind === "done" && <span className={s.check}>✓</span>}<span>{l.text}</span>
              </p>
            ))}
            {status && status.pct === undefined && <p className={s.thinking}>{status.word}…</p>}
            {status?.pct !== undefined && (
              <div className={s.bar2}><span style={{ width: `${status.pct}%` }} /></div>
            )}
          </div>
          <div className={s.composer}>
            <span className={s.prompt}>›</span>
            <span className={draft ? s.draft : s.placeholder}>{draft || "Say what to change, or what happens next…"}{draft && <i className={s.caret} />}</span>
            <span className={draft ? s.sendOn : s.send}><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg></span>
          </div>
        </div>
      </div>
      {caption >= 0 && cbox && (
        <div key={caption} className={s.caption} style={{ left: cbox.x, top: cbox.y - 46 }}>
          <span className={s.capNum}>0{caption + 1}</span><span>{CAPTIONS[caption]}</span>
        </div>
      )}
      <svg className={s.cursor} data-on={cursor.on ? "true" : undefined} data-glide={cursor.glide ? "true" : undefined} data-down={cursor.down ? "true" : undefined}
        style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }} viewBox="0 0 24 24" width="22" height="22">
        <path d="M3 2.5v16.2l4.1-3.9 2.9 6.6 2.6-1.1-2.8-6.4h5.7z" />
      </svg>
    </div>
  );
}
