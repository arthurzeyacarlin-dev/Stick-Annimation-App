"use client";
// The bench page itself: the prompt list, Run / Run all (one at a time, stops at the budget), each card's live status
// in the AI Animator style (Thinking → Searching … → Animating % → Animation ready), the preview, cost, time,
// repairs, review, the plan JSON and the ratings. Totals at the top.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AssistantActivity } from "@/src/components/assistant/AssistantText";
import { BENCH_MAIN_COUNT, BENCH_PROMPTS, type BenchPrompt } from "@/src/lib/animator/director/benchPrompts";
import {
  BENCH_MODELS, BENCH_PROMPT_WORST_USD, BENCH_RUN_BUDGET_USD, BENCH_TOTAL_CAP_USD, benchBudgetBlock, MODEL_NAME,
  type BenchLine, type BenchPlan, type BenchProvider, type BenchRating, type BenchResult, type BenchStage, type RatingsFile, type SpendLedger,
} from "./benchTypes";
import { benchColors as c } from "./benchStyle";
import { buildPreview, PreviewPlayer } from "./PreviewPlayer";

const BENCH_FPS = 24;
const STAGE_WIDTH = 1920;
const API = "/api/dev/animator-bench";

type CardState = {
  running: boolean;
  // ("finalizing" is the page's own short step after the animating bar reaches 100%.)
  stage?: BenchStage | "finalizing";
  percent?: number;
  searches: string[];
  note?: string;
  result?: BenchResult;
  error?: string;
  provider?: BenchProvider;
};
const EMPTY: CardState = { running: false, searches: [] };
// One result per prompt AND model: Terra and Luna side by side (the same card, Terra first, Luna below).
const keyOf = (promptId: string, model: BenchProvider) => `${promptId}|${model}`;

// ALWAYS SHOW "ANIMATING" (Arthur, 2026-10-07 round 2: "whenever it animates it should ALWAYS say Animating with the card
// and the progress bar — reusing, creating or editing"). The engine is so fast the stage flashed by, so after Terra's
// answer the card shows Animating for at least this long, the bar filling left to right with the REAL work (the
// server's checks = the first fifth; building every picture in this browser for the preview = the rest), then
// "Finalizing answer" briefly, then "Animation ready".
const MIN_ANIMATING_MS = 1800;
const FINALIZING_MS = 600;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const newRunId = () => `bench-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const money = (usd: number) => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 4 : 2)}`;
const dollars = (usd: number) => `$${usd.toFixed(2)}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function BenchClient() {
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [ratings, setRatings] = useState<Record<string, BenchRating>>({});
  const [ledger, setLedger] = useState<SpendLedger>({ totalUsd: 0, runs: [] });
  const [runUsd, setRunUsd] = useState(0);
  // REAL AI ALWAYS (Arthur, 2026-10-07: a reset "stub" box once made him review pretend answers): every Run runs real
  // Terra AND real Luna at the same time. Pretend (stub) answers are only offered with ?stub=1, for helpers.
  const [provider, setProvider] = useState<BenchProvider>("terra");
  const models: BenchProvider[] = provider === "stub" ? ["stub"] : [...BENCH_MODELS];
  const [stubAllowed, setStubAllowed] = useState(false);
  useEffect(() => { setStubAllowed(new URLSearchParams(window.location.search).has("stub")); }, []);
  const [allowSearch, setAllowSearch] = useState(false);
  // BLIND TEST (Arthur, 2026-10-07): the two answers are shown as "A" and "B" in a random order per Run, with their
  // names, cost and time hidden until both are rated (or "Show which is which" is pressed).
  const [blind, setBlind] = useState(true);
  const [orders, setOrders] = useState<Record<string, BenchProvider[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [ratedNow, setRatedNow] = useState<Record<string, boolean>>({});
  const shuffle = (prompt: BenchPrompt) => {
    setOrders((o) => ({ ...o, [prompt.id]: Math.random() < 0.5 ? [...models] : [...models].reverse() }));
    setRevealed((r) => ({ ...r, [prompt.id]: false }));
    setRatedNow((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith(`${prompt.id}|`))));
  };
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const runIdRef = useRef(newRunId());
  const stopRef = useRef(false);
  // (The latest spending, read by Run all between prompts: state updates arrive too late inside the loop.)
  const spendRef = useRef({ run: 0, total: 0 });
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { ledger: SpendLedger; ratings: RatingsFile };
      setLedger(data.ledger);
      spendRef.current.total = data.ledger.totalUsd;
      const latest: Record<string, BenchRating> = {};
      for (const r of data.ratings.ratings) latest[keyOf(r.promptId, r.provider ?? "terra")] = r.rating;
      setRatings(latest);
    } catch { /* the totals stay as they are */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, next: Partial<CardState>) => setCards((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...next } }));

  // The Animating card, then Finalizing answer, then Animation ready (see MIN_ANIMATING_MS).
  const showAnimating = async (id: string, result: Extract<BenchResult, { ok: true }>) => {
    const from = Math.min(18, Math.max(0, cardsRef.current[id]?.stage === "animating" ? cardsRef.current[id]?.percent ?? 0 : 0));
    patch(id, { stage: "animating", percent: from });
    const started = Date.now();
    let work = 0, built = false;
    void buildPreview(result.plan as BenchPlan, result.plan.fps ?? BENCH_FPS, (w) => { work = w; }).finally(() => { built = true; });
    for (;;) {
      const time = Math.min(1, (Date.now() - started) / MIN_ANIMATING_MS);
      patch(id, { percent: from + (100 - from) * Math.min(time, work) });
      if (time >= 1 && built) break;
      await wait(40);
    }
    patch(id, { percent: 100 });
    await wait(150);
    patch(id, { stage: "finalizing" });
    await wait(FINALIZING_MS);
    patch(id, { result, stage: "ready", searches: result.searches });
  };

  // Runs one prompt; resolves false when the bench must stop (budget reached or the server refused).
  const runOne = useCallback(async (prompt: BenchPrompt, model: BenchProvider): Promise<boolean> => {
    const id = keyOf(prompt.id, model);
    const previous = prompt.followUpOf ? cardsRef.current[keyOf(prompt.followUpOf, model)]?.result : undefined;
    patch(id, { running: true, stage: "thinking", percent: undefined, searches: [], note: undefined, result: undefined, error: undefined, provider: model });
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: prompt.id, prompt: prompt.text, fps: BENCH_FPS, stageWidth: STAGE_WIDTH, provider: model, runId: runIdRef.current, allowSearch,
          ...(previous?.ok ? { previousPlan: previous.plan } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        patch(id, { running: false, stage: "failed", error: data.error ?? `The bench answered ${res.status}.` });
        return res.status !== 402 && res.status !== 409;
      }
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = "", keepGoing = true;
      let finished: BenchResult | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const text of lines) {
          if (!text.trim()) continue;
          const line = JSON.parse(text) as BenchLine;
          if (line.type === "progress") {
            setCards((all) => {
              const card = all[id] ?? EMPTY;
              const searches = line.stage === "searching" && line.note && !card.searches.includes(line.note) ? [...card.searches, line.note] : card.searches;
              // (The server's checks fill the first fifth of the bar — they come in one burst, so the bar still visibly
              // fills from the left; its "ready" waits for the browser's building, which fills the rest.)
              if (line.stage === "animating" || line.stage === "ready") {
                const percent = Math.max(card.stage === "animating" ? card.percent ?? 0 : 0, Math.min(18, (line.percent ?? 0) / 5));
                return { ...all, [id]: { ...card, stage: "animating", percent, note: line.note, searches } };
              }
              return { ...all, [id]: { ...card, stage: line.stage, percent: line.percent ?? card.percent, note: line.note, searches } };
            });
          } else if (line.type === "result") {
            // (A finished animation is shown only after the Animating card below; a failure at once.)
            if (line.result.ok) finished = line.result;
            else patch(id, { result: line.result, stage: "failed", error: line.result.message });
            // (Two models answer at once: keep the higher total, whichever answer arrives last.)
            spendRef.current = { run: Math.max(spendRef.current.run, line.spend.runUsd), total: Math.max(spendRef.current.total, line.spend.totalUsd) };
            setRunUsd(spendRef.current.run);
            setLedger((l) => ({ ...l, totalUsd: spendRef.current.total }));
            if (model !== "stub" && benchBudgetBlock(line.spend.runUsd, line.spend.totalUsd)) keepGoing = false;
          } else {
            patch(id, { stage: "failed", error: line.message });
          }
        }
        if (done) break;
      }
      if (finished?.ok) await showAnimating(id, finished);
      patch(id, { running: false });
      return keepGoing;
    } catch (error) {
      patch(id, { running: false, stage: "failed", error: error instanceof Error ? error.message : "The run failed." });
      return true;
    }
  }, [allowSearch]);
  // Both models at the same time; false when either must stop.
  const runBoth = async (prompt: BenchPrompt) => (await Promise.all(models.map((m) => runOne(prompt, m)))).every(Boolean);
  // (Worst case of one prompt for every model that runs it.)
  const promptWorst = BENCH_PROMPT_WORST_USD * models.length;
  const blockedFor = (run: number, total: number) => benchBudgetBlock(run + promptWorst - BENCH_PROMPT_WORST_USD, total + promptWorst - BENCH_PROMPT_WORST_USD);

  const runSingle = async (prompt: BenchPrompt) => {
    if (busy) return;
    setBusy(true);
    setBanner(null);
    const blocked = provider !== "stub" ? blockedFor(spendRef.current.run, spendRef.current.total) : null;
    if (blocked) { setBanner(blocked); setBusy(false); return; }
    shuffle(prompt);
    const ok = await runBoth(prompt);
    if (!ok) setBanner("Stopped: the budget is reached, or another prompt is still running.");
    setBusy(false);
  };

  const runAll = async () => {
    if (busy) return;
    setBusy(true);
    setBanner(null);
    stopRef.current = false;
    runIdRef.current = newRunId();
    setRunUsd(0);
    spendRef.current.run = 0;
    for (const prompt of BENCH_PROMPTS) {
      if (stopRef.current) { setBanner("Run all was stopped."); break; }
      // STOP BEFORE THE CAP (real Terra only): the next prompt starts only if its worst case still fits.
      const blocked = provider !== "stub" ? blockedFor(spendRef.current.run, spendRef.current.total) : null;
      if (blocked) { setBanner(`${blocked} Not started: "${prompt.text}"`); break; }
      shuffle(prompt);
      const ok = await runBoth(prompt);
      if (!ok) {
        const why = blockedFor(spendRef.current.run, spendRef.current.total);
        setBanner(why && provider !== "stub" ? `${why} Last prompt run: "${prompt.text}"` : `Run all stopped at "${prompt.text}": the server refused (see that card).`);
        break;
      }
    }
    setBusy(false);
  };

  const rate = async (prompt: BenchPrompt, model: BenchProvider, rating: BenchRating) => {
    setRatings((r) => ({ ...r, [keyOf(prompt.id, model)]: rating }));
    // (Both answers rated in this Run → the names are shown.)
    setRatedNow((r) => {
      const next = { ...r, [keyOf(prompt.id, model)]: true };
      if (models.every((m) => next[keyOf(prompt.id, m)])) setRevealed((v) => ({ ...v, [prompt.id]: true }));
      return next;
    });
    try {
      await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate", promptId: prompt.id, rating, provider: model }) });
    } catch { /* shown locally; the file is updated next time */ }
  };

  // Totals, per model (Terra vs Luna).
  const totalsFor = (model: BenchProvider) => {
    const results = BENCH_PROMPTS.map((p) => ({ p, r: cards[keyOf(p.id, model)]?.result }));
    const okResults = results.flatMap((x) => (x.r?.ok ? [x.r] : []));
    const rated = BENCH_PROMPTS.map((p) => ratings[keyOf(p.id, model)]);
    return {
      ran: results.filter((x) => x.r).length,
      worked: okResults.length,
      repaired: okResults.filter((r) => r.repairs.length > 0).length,
      mainWorked: results.filter((x) => x.p.main && x.r?.ok).length,
      good: rated.filter((r) => r === "good").length,
      ok: rated.filter((r) => r === "ok").length,
      bad: rated.filter((r) => r === "bad").length,
      avgCost: okResults.length ? okResults.reduce((sum, r) => sum + r.costUsd, 0) / okResults.length : 0,
      avgMs: okResults.length ? okResults.reduce((sum, r) => sum + r.ms, 0) / okResults.length : 0,
    };
  };

  return (
    <main style={{ minHeight: "100vh", background: c.page, color: c.text, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", padding: "24px 16px 64px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 16 }}>
        <header style={{ display: "grid", gap: 6 }}>
          <div style={{ color: c.label, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>SPEC-0017 Phase 3 · dev only</div>
          <h1 style={{ margin: 0, fontSize: 24 }}>AI Animator test bench</h1>
          <p style={{ margin: 0, color: c.secondary, fontSize: 14 }}>Press Run, watch each result play, and rate it good / OK / bad. Pass = at least 17 of {BENCH_MAIN_COUNT} usable, and at least 4 of the 5 never-taught moves look natural.</p>
        </header>

        <section style={panel} aria-label="Totals">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 750, fontVariantNumeric: "tabular-nums", color: benchBudgetBlock(0, ledger.totalUsd) ? c.danger : c.text }}>
              Spent {dollars(ledger.totalUsd)} of {dollars(BENCH_TOTAL_CAP_USD)}
            </div>
            <div style={{ color: c.muted, fontSize: 12 }}>Real AI money only. The bench stops before the cap: a prompt starts only if its worst case (2 calls × $0.04 per model) still fits.</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {models.map((m) => {
              const t = totalsFor(m);
              return (
                <div key={m} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 64, fontSize: 16, fontWeight: 800, color: m === "luna" ? c.ok : c.accent }}>{MODEL_NAME[m]}</div>
                  <Stat label="Rated good · OK · bad" value={`${t.good} · ${t.ok} · ${t.bad}`} />
                  <Stat label="Worked" value={`${t.worked} / ${t.ran} run`} />
                  <Stat label="Needed repair" value={String(t.repaired)} />
                  <Stat label="Avg cost · time" value={`${money(t.avgCost)} · ${seconds(t.avgMs)}`} />
                </div>
              );
            })}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Stat label="This run" value={`${dollars(runUsd)} of ${dollars(BENCH_RUN_BUDGET_USD)}`} warn={Boolean(benchBudgetBlock(runUsd, 0))} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 14 }}>
            <button type="button" onClick={() => void runAll()} disabled={busy} style={primaryButton(busy)}>Run all (one prompt at a time)</button>
            {busy && <button type="button" onClick={() => { stopRef.current = true; }} style={button}>Stop after this one</button>}
            {stubAllowed ? (
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: provider === "terra" ? c.ok : c.danger, fontSize: 13 }}>
                <input type="checkbox" checked={provider === "terra"} disabled={busy} onChange={(e) => setProvider(e.target.checked ? "terra" : "stub")} />
                Use real Terra + Luna (paid). Off = PRETEND answers (no AI) — helpers only.
              </label>
            ) : (
              <span style={{ color: c.ok, fontSize: 13, fontWeight: 600 }}>Every Run uses real Luna, the AI Animator&apos;s AI (about a quarter of a cent each).</span>
            )}
            {models.length > 1 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: c.secondary, fontSize: 13 }}>
                <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
                Blind test: show them as A and B (random order) until both are rated
              </label>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: c.secondary, fontSize: 13 }}>
              <input type="checkbox" checked={allowSearch} disabled={busy} onChange={(e) => setAllowSearch(e.target.checked)} />
              Let the AI search the internet (adds a search fee to the $0.04 pre-send check)
            </label>
          </div>
          {banner && <div role="status" style={{ marginTop: 10, color: c.ok, fontSize: 13 }}>{banner}</div>}
        </section>

        {BENCH_PROMPTS.map((prompt, index) => (
          <PromptCard key={prompt.id} index={index} prompt={prompt} busy={busy} onRun={() => void runSingle(prompt)}
            answers={(orders[prompt.id]?.length === models.length ? orders[prompt.id] : models).map((m, i) => {
              const hidden = blind && models.length > 1 && !revealed[prompt.id];
              // (Blind: only a rating given in THIS Run is shown — an older one would give the name away.)
              const rating = hidden && !ratedNow[keyOf(prompt.id, m)] ? undefined : ratings[keyOf(prompt.id, m)];
              return { model: m, label: hidden ? `Answer ${"AB"[i]}` : MODEL_NAME[m], hidden, card: cards[keyOf(prompt.id, m)] ?? EMPTY, rating };
            })}
            onReveal={() => setRevealed((v) => ({ ...v, [prompt.id]: true }))}
            onRate={(m, r) => void rate(prompt, m, r)} />
        ))}
      </div>
    </main>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ minWidth: 150, padding: "8px 12px", border: `1px solid ${c.divider}`, borderRadius: 10, background: c.inset }}>
      <div style={{ color: c.label, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ color: warn ? c.danger : c.text, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
    </div>
  );
}

const GROUP_LABEL: Record<BenchPrompt["group"], string> = {
  single: "Single move", combo: "Combo", characters: "2–3 characters", style: "Style", energy: "Energy", power: "Power",
  story: "Story tests", timing: "Timing words", order: "Story order", tricky: "Tricky", "never-taught": "Never taught", original: "Original",
};

function PromptCard({ index, prompt, answers, busy, onRun, onRate, onReveal }: {
  index: number; prompt: BenchPrompt; answers: { model: BenchProvider; label: string; hidden: boolean; card: CardState; rating?: BenchRating }[]; busy: boolean;
  onRun: () => void; onRate: (model: BenchProvider, r: BenchRating) => void; onReveal: () => void;
}) {
  const running = answers.some((a) => a.card.running);
  const anyResult = answers.some((a) => a.card.result);
  return (
    <article style={panel} aria-label={prompt.text}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, display: "grid", gap: 4 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ color: c.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{index + 1}.</span>
            <span style={tag}>{GROUP_LABEL[prompt.group]}</span>
            {prompt.neverTaught && <span style={{ ...tag, borderColor: c.ok, color: c.ok }}>never taught</span>}
            {!prompt.main && <span style={tag}>extra</span>}
            {prompt.followUpOf && <span style={tag}>follow-up of “{prompt.followUpOf}”</span>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 650 }}>“{prompt.text}”</div>
          <div style={{ color: c.muted, fontSize: 13 }}>Look for: {prompt.lookFor}</div>
        </div>
        <button type="button" onClick={onRun} disabled={busy} style={primaryButton(busy)}>{running ? "Running…" : anyResult ? "Run again" : "Run"}</button>
      </div>
      {answers.map((a) => <ModelAnswer key={a.model} model={a.model} label={a.label} hidden={a.hidden} card={a.card} rating={a.rating} onRate={(r) => onRate(a.model, r)} />)}
      {answers.some((a) => a.hidden) && answers.some((a) => a.card.result) && (
        <button type="button" onClick={onReveal} style={{ ...button, marginTop: 12 }}>Show which is which</button>
      )}
    </article>
  );
}

// One model's answer on a prompt card (Terra first, Luna below it).
function ModelAnswer({ model, label, hidden, card, rating, onRate }: { model: BenchProvider; label: string; hidden: boolean; card: CardState; rating?: BenchRating; onRate: (r: BenchRating) => void }) {
  const result = card.result;
  const name = label;
  // (Blind: an earlier rating would give away which answer is which, so it isn't shown.)
  if (!card.stage && !card.error && !result && (!rating || hidden)) return null;
  return (
    <section aria-label={`${name}'s answer`} style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.divider}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: hidden ? c.text : model === "luna" ? c.ok : c.accent }}>{name}</div>
      {(card.stage || card.error) && (
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <StatusLine card={card} />
          {result && card.provider === "stub" && <div role="alert" style={{ color: "#fff", background: c.danger, borderRadius: 8, padding: "8px 12px", fontSize: 15, fontWeight: 800 }}>PRETEND ANSWER — NOT TERRA OR LUNA. No AI made this; don&apos;t rate it.</div>}
          {result?.ok && result.says && <div style={{ color: c.secondary, fontSize: 14, lineHeight: 1.55 }}><b style={{ color: c.accent }}>{name} says:</b> {result.says}</div>}
        </div>
      )}

      {result?.ok && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <PreviewPlayer plan={result.plan as BenchPlan} fps={result.plan.fps ?? BENCH_FPS} />
          <div style={{ flex: 1, minWidth: 240, display: "grid", gap: 6, fontSize: 13, color: c.secondary }}>
            {hidden ? <div>Cost and time are hidden until you rate both (blind test).</div> : (
              <div>Cost <b style={{ color: c.text }}>{money(result.costUsd)}</b>{card.provider === "stub" && " (stub: estimate only, nothing spent)"} · time <b style={{ color: c.text }}>{seconds(result.ms)}</b> · tokens {result.usage.inputTokens} in ({result.usage.cachedTokens} cached) / {result.usage.outputTokens} out</div>
            )}
            <div>{name} reviewed and fixed it: <b style={{ color: c.text }}>{result.reviewed ? "yes" : "no"}</b></div>
            <div>Engine repairs: {result.repairs.length === 0 ? <b style={{ color: c.text }}>none</b> : (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{result.repairs.map((r, i) => <li key={i}>{r}</li>)}</ul>
            )}</div>
            {result.problems && result.problems.length > 0 && (
              <div style={{ color: c.danger }}>Engine problems still found: <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{result.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }} role="group" aria-label={`Rating for ${name}`}>
              {(["good", "ok", "bad"] as const).map((r) => (
                <button key={r} type="button" onClick={() => onRate(r)} aria-pressed={rating === r} style={rateButton(r, rating === r)}>{r === "ok" ? "OK" : r}</button>
              ))}
            </div>
            <details>
              <summary style={{ cursor: "pointer", color: c.accent }}>Plan JSON</summary>
              <pre style={{ maxHeight: 320, overflow: "auto", background: c.inset, border: `1px solid ${c.divider}`, borderRadius: 8, padding: 10, fontSize: 11, color: c.secondary, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(result.plan, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
      {!result?.ok && rating && !hidden && <div style={{ marginTop: 8, color: c.muted, fontSize: 12 }}>Last rating: {rating}</div>}
    </section>
  );
}

// The status line in the AI Animator style: the Help Assistant's shimmer for Thinking / Searching / Animating / Finalizing answer,
// a progress card while animating, then "Animation ready".
function StatusLine({ card }: { card: CardState }) {
  if (card.stage === "failed" || (card.error && !card.running)) {
    return <div role="status" style={{ color: c.danger, fontSize: 13, fontWeight: 600 }}>Failed: {card.error ?? card.note ?? "no animation was made."}</div>;
  }
  const done = card.stage === "ready" && !card.running;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {card.searches.length > 0 && (card.stage !== "searching") && (
        <div style={{ color: c.muted, fontSize: 12 }}>Searched {card.searches.map((s) => `“${s}”`).join(", ")}</div>
      )}
      {card.stage === "thinking" && <AssistantActivity label="Thinking" />}
      {card.stage === "searching" && <AssistantActivity label={`Searching ${card.note ?? ""}…`} />}
      {card.stage === "animating" && (
        <div style={{ display: "grid", gap: 6 }}>
          <AssistantActivity label="Animating" />
          <div style={{ width: 320, maxWidth: "100%", padding: "10px 12px", border: `1px solid ${c.border}`, borderRadius: 10, background: c.panel }}>
            <div style={{ height: 8, borderRadius: 4, background: c.inset, overflow: "hidden", border: `1px solid ${c.divider}` }}>
              <div style={{ width: `${Math.max(0, Math.min(100, card.percent ?? 0))}%`, height: "100%", background: "linear-gradient(90deg, #2f86ff, #58aaff)", transition: "width 120ms linear" }} />
            </div>
            <div style={{ marginTop: 6, color: c.secondary, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{Math.round(card.percent ?? 0)}% done animating</div>
          </div>
        </div>
      )}
      {card.stage === "finalizing" && <AssistantActivity label="Finalizing answer" />}
      {/* (Arthur: "Animation ready" has NO shimmer — plain soft gray, like the Assistant's finished state.) */}
      {(done || (card.stage === "ready" && card.running)) && <div role="status" style={{ color: c.muted, fontSize: 13, fontWeight: 600 }}>Animation ready</div>}
    </div>
  );
}

const panel: CSSProperties = { padding: 16, border: `1px solid ${c.border}`, borderRadius: 14, background: c.panel };
const tag: CSSProperties = { padding: "1px 8px", border: `1px solid ${c.border}`, borderRadius: 999, color: c.muted, fontSize: 11, fontWeight: 600 };
const button: CSSProperties = { minHeight: 34, padding: "5px 14px", border: `1px solid ${c.border}`, borderRadius: 10, background: c.inset, color: c.secondary, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const primaryButton = (disabled: boolean): CSSProperties => ({ ...button, background: c.selected, borderColor: c.selectedBorder, color: c.text, opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer" });
const rateButton = (r: BenchRating, on: boolean): CSSProperties => {
  const color = r === "good" ? c.good : r === "ok" ? c.ok : c.bad;
  return { ...button, minHeight: 30, padding: "3px 14px", textTransform: r === "ok" ? "none" : "capitalize", borderColor: on ? color : c.border, color: on ? c.page : color, background: on ? color : c.inset };
};
