import { applyEdits, describeEdit, EditError } from "../moves/editPlan.ts";
import type { Action, ScenePlan } from "../moves/plan.ts";
import { directorInput, directorInstructions } from "./prompt.ts";
import { checkPlan, keepOnPage, repairPlan, type DirectedPlan } from "./repair.ts";
import { missingThings, missingThingsProblem } from "./namedThings.ts";
import { followStoryWords } from "./storyWords.ts";
import { DIRECTOR_SCHEMA, replyFrom } from "./schema.ts";
import { budgetCall, costUsd, DEFAULT_MAX_USD, LUNA_PRICES, lunaProvider, terraProvider, type Prices, type Usage } from "./terraProvider.ts";

// SPEC-0017 Phase 3: THE DIRECTOR. The user's words -> Terra writes a scene plan -> the engine checks and repairs
// it, builds it and runs its automatic checks -> if the engine finds problems, Terra gets ONE chance to fix them
// ("Terra knows good animation") -> the plan. The page rebuilds the frames from the plan with the engine
// (sceneForPage in repair.ts = the page fit + planToScene; then buildScene + buildEffectFrames).

export type DirectRequest = { prompt: string; fps: number; stageWidth: number; previousPlan?: ScenePlan; allowSearch?: boolean };
export type DirectStage = "thinking" | "searching" | "animating" | "ready" | "failed";
export type DirectProgress = { stage: DirectStage; percent?: number; note?: string };
// (`plan.canvasColor` is the page's background color; `plan.background` stays the engine's BackgroundSpec.)
export type DirectResult =
  | { ok: true; plan: DirectedPlan; says: string; reply: string; searches: string[]; repairs: string[]; reviewed: boolean; costUsd: number; ms: number; usage: Usage; problems?: string[] }
  | { ok: false; message: string; costUsd: number; ms: number };
export type Provider = (input: { instructions: string; input: string; schema: object; maxOutputTokens: number; allowSearch: boolean; signal?: AbortSignal }) =>
  Promise<{ json: unknown; usage: Usage; searches: string[] }>;
// (`prices`: the model's price list — Luna's by default (Arthur, 2026-10-08: Luna replaces Terra); pass Terra's PRICES with terraProvider.)
export type DirectOptions = { provider?: Provider; onProgress?: (p: DirectProgress) => void; signal?: AbortSignal; maxUsd?: number; prices?: Prices };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// What changed between the previous plan and a follow-up's whole new plan, in plain words (FOLLOW-UPS: only what
// was asked may change; the result lists every change so it can be seen).
export function planChanges(before: ScenePlan, after: ScenePlan): string[] {
  const out: string[] = [];
  const name = (id: string) => before.characters.find((c) => c.id === id)?.name ?? after.characters.find((c) => c.id === id)?.name ?? id;
  for (const c of before.characters) if (!after.characters.some((n) => n.id === c.id)) out.push(`${name(c.id)} was taken out.`);
  for (const c of after.characters) {
    const old = before.characters.find((o) => o.id === c.id);
    if (!old) { out.push(`${name(c.id)} was added.`); continue; }
    const { actions: oldActions, ...oldRest } = old, { actions: newActions, ...newRest } = c;
    if (!sameJson(oldRest, newRest)) out.push(`${name(c.id)}'s look or settings changed.`);
    const n = Math.max(oldActions.length, newActions.length);
    for (let i = 0; i < n; i += 1) {
      const a: Action | undefined = oldActions[i], b: Action | undefined = newActions[i];
      if (!sameJson(a, b)) out.push(!a ? `${name(c.id)} got a new ${b!.move}.` : !b ? `${name(c.id)}'s ${a.move} was taken out.` : a.move !== b.move ? `${name(c.id)}'s ${a.move} became a ${b.move}.` : `${name(c.id)}'s ${a.move} changed.`);
    }
  }
  for (const key of ["objects", "effects", "background", "canvasColor"] as const) if (!sameJson(before[key], after[key])) out.push(`The ${key === "canvasColor" ? "page color" : key} changed.`);
  return out;
}

const friendlyError = (error: unknown) => {
  if (error instanceof Error && error.name === "AbortError") return "Stopped.";
  // (A setup message — a missing key — is shown as it is; anything else stays friendly. Messages say "the AI", never a
  // model's name: the same director runs Terra, Luna or Claude, and the blind test must not give the name away.)
  if (error instanceof Error && /no [A-Z_]+_API_KEY/.test(error.message)) return error.message;
  return "The AI couldn't make that animation right now. Please try again in a moment.";
};

export async function direct(req: DirectRequest, o: DirectOptions = {}): Promise<DirectResult> {
  const started = Date.now();
  const provider = o.provider ?? lunaProvider;
  const prices = o.prices ?? LUNA_PRICES;
  const maxUsd = o.maxUsd ?? DEFAULT_MAX_USD;
  const progress = (p: DirectProgress) => { try { o.onProgress?.(p); } catch { /* the page's own problem */ } };
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  let spent = 0;
  const searches: string[] = [];
  const ms = () => Date.now() - started;
  const fail = (message: string): DirectResult => { progress({ stage: "failed", note: message }); return { ok: false, message, costUsd: spent, ms: ms() }; };

  const instructions = directorInstructions();
  // One Terra call, with the pre-send money check.
  let searchSkipped = false;
  const ask = async (input: string) => {
    let search = Boolean(req.allowSearch);
    let budget = budgetCall(instructions, input, maxUsd, undefined, search, prices);
    // (A web search has its own fee: if it doesn't fit the cap, Terra answers without searching.)
    if (!budget.ok && search) { const plain = budgetCall(instructions, input, maxUsd, undefined, false, prices); if (plain.ok) { budget = plain; search = false; searchSkipped = true; } }
    if (!budget.ok) return { refused: `That request is too big for one try (it could cost more than $${maxUsd.toFixed(2)}). Try a shorter request.` } as const;
    try {
      const answer = await provider({ instructions, input, schema: DIRECTOR_SCHEMA, maxOutputTokens: budget.maxOutputTokens, allowSearch: search, signal: o.signal });
      return { answer } as const;
    } catch (error) {
      const partial = (error as { usage?: Usage; searches?: string[] }).usage;
      if (partial) { spent += costUsd(partial, (error as { searches?: string[] }).searches?.length ?? 0, prices); add(partial); }
      return { error } as const;
    }
  };
  const add = (u: Usage) => { usage.inputTokens += u.inputTokens; usage.outputTokens += u.outputTokens; usage.cachedTokens += u.cachedTokens; };

  progress({ stage: "thinking" });
  if (!req.prompt.trim()) return fail("Tell me what to animate first.");
  const first = await ask(directorInput(req));
  if ("refused" in first) return fail(first.refused!);
  if ("error" in first) return fail(friendlyError(first.error));
  add(first.answer.usage);
  spent += costUsd(first.answer.usage, first.answer.searches.length, prices);
  if (first.answer.searches.length) { searches.push(...first.answer.searches); progress({ stage: "searching", note: first.answer.searches.join("; ") }); }

  const planId = req.previousPlan?.id ?? `terra-${started}`;
  const reply = replyFrom(first.answer.json, planId);
  if (!reply) return fail("The AI's answer didn't make sense. Please try again.");
  progress({ stage: "animating", percent: 10, note: "plan received" });

  // FOLLOW-UPS: the previous plan with only the asked change (edits), or Terra's whole new plan.
  const repairs: string[] = [];
  let plan: DirectedPlan | null = reply.plan;
  if (req.previousPlan && reply.edits.length) {
    try {
      plan = applyEdits(req.previousPlan, reply.edits);
      repairs.push(...reply.edits.map((e) => `Changed: ${describeEdit(e)}`));
    } catch (error) {
      if (!plan) return fail(error instanceof EditError ? `I couldn't make that change: ${error.message}` : "I couldn't make that change.");
    }
  }
  if (!plan) return fail(reply.reply || "I couldn't turn that into an animation. Try telling me who is in it and what they do.");
  // (Edits applied: everything else IS the previous plan. A whole new plan keeps the previous id and sizes, and
  // every change it makes is listed.)
  if (req.previousPlan && plan === reply.plan) {
    plan = { ...plan, id: req.previousPlan.id, height: req.previousPlan.height, groundY: req.previousPlan.groundY };
    repairs.push(...planChanges(req.previousPlan, plan).map((c) => `Changed: ${c}`));
  }

  // CHECK AND REPAIR, then build and check.
  // FIGHT LOOK (Arthur): no guard stance unless the user asked for realistic / boxing / MMA fighting or higher hands.
  // (A follow-up keeps a guard the previous plan already had: "make it slower" must not drop it.)
  if (!/realistic|boxing|boxer|\bbox\b(?! of| up| the| it)|mma|martial|(?<!security |prison |life)guard\b(?! dog)|hands up|higher hands/i.test(req.prompt)) {
    const had = (id: string) => req.previousPlan?.characters.find((p) => p.id === id)?.guard;
    for (const c of plan.characters) if ((c.guard === "realistic" || c.guard === "high") && c.guard !== had(c.id)) { c.guard = undefined; }
  }
  let fixed = repairPlan(plan, req.stageWidth);
  if (fixed.failure) return fail(fixed.failure);
  repairs.push(...fixed.repairs, ...followStoryWords(fixed.plan, req.prompt, req.previousPlan));
  progress({ stage: "animating", percent: 40, note: "plan checked" });
  const fps = fixed.plan.fps ?? req.fps;
  // (EVERY THING THE STORY NAMES IS IN THE SCENE, namedThings.ts: a named thing the plan never shows is a problem too.)
  const named = (c: ReturnType<typeof checkPlan>, plan: typeof fixed.plan) => {
    const missing = missingThings(req.prompt, plan);
    return missing.length ? { ...c, problems: [...c.problems, missingThingsProblem(missing)] } : c;
  };
  let check = named(checkPlan(fixed.plan, fps, req.stageWidth), fixed.plan);
  progress({ stage: "animating", percent: 70, note: "animation built" });

  // ONE review: Terra fixes what the engine found.
  let reviewed = false;
  let says = reply.says, text = reply.reply;
  if (check.problems.length) {
    progress({ stage: "animating", percent: 75, note: "The AI is fixing what the engine found" });
    const second = await ask(directorInput(req, { plan: fixed.plan, problems: check.problems }));
    if ("refused" in second) repairs.push("The engine found problems, but asking the AI to fix them would cost too much, so I kept the plan.");
    else if ("error" in second) repairs.push("The engine found problems, but the AI couldn't fix them this time, so I kept the plan.");
    else {
      reviewed = true;
      add(second.answer.usage);
      spent += costUsd(second.answer.usage, second.answer.searches.length, prices);
      searches.push(...second.answer.searches);
      const again = replyFrom(second.answer.json, planId);
      const next = again?.plan ? repairPlan(req.previousPlan ? { ...again.plan, id: req.previousPlan.id, height: req.previousPlan.height, groundY: req.previousPlan.groundY } : again.plan, req.stageWidth) : null;
      if (next && !next.failure) next.repairs.push(...followStoryWords(next.plan, req.prompt, req.previousPlan)); // (WHAT THE WORDS MEAN, storyWords.ts)
      if (next && !next.failure) {
        const nextCheck = named(checkPlan(next.plan, next.plan.fps ?? req.fps, req.stageWidth), next.plan);
        // Keep the better of the two (fewer problems).
        if (nextCheck.problems.length <= check.problems.length) {
          repairs.push(`The AI fixed: ${check.problems.join(" ")}`, ...next.repairs);
          fixed = next; check = nextCheck;
          if (again?.says) says = again.says;
          if (again?.reply) text = again.reply;
        } else repairs.push("The AI's fix made it worse, so I kept the first plan.");
      } else repairs.push("The AI's fix couldn't be used, so I kept the first plan.");
    }
  }
  // KEEP THEM ON THE PAGE: a figure still lost after the review is brought back by the engine, not accepted.
  if (check.lost?.length) {
    const kept = keepOnPage(fixed.plan, check, fixed.plan.fps ?? req.fps, req.stageWidth);
    repairs.push(...kept.repairs);
    check = kept.check;
  }
  if (searchSkipped) repairs.push("I skipped searching the web to stay under the money cap.");
  progress({ stage: "animating", percent: 90, note: "checked" });
  progress({ stage: "ready", percent: 100 });
  return {
    ok: true, plan: check.plan, says, reply: text, searches, repairs, reviewed, costUsd: spent, ms: ms(), usage,
    ...(check.problems.length ? { problems: check.problems } : {}),
  };
}

// The real Terra and Luna (the lead tests them).
export { lunaProvider, terraProvider };
