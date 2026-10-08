import type { Anchor, BackgroundSpec, EffectTrack } from "../effects/types.ts";
import { ballLook, boxLook } from "../objects.ts";
import type { PlanEdit } from "../moves/editPlan.ts";
import type { Action, CharacterPlan, ObjectPlan, ScenePlan } from "../moves/plan.ts";
import { MOVE_SPEEDS, MOVE_STYLES } from "../moves/styles.ts";

// SPEC-0017 Phase 3: what Terra writes back — a strict JSON schema (every property required, no extra
// properties), and the converters between it and the engine's ScenePlan. Knobs (move params, effect params)
// are a list of { name, value } pairs whose value is JSON text ("300", "\"b\"", "true", "{\"x\":1}"), so any
// move's params fit a strict schema; they are parsed back here.

export const PLAN_HEIGHT = 300;
export const PLAN_GROUND = 900;
export const STAGE_MIDDLE = 960;

const str = { type: "string" } as const;
const num = { type: "number" } as const;
const nullable = (type: "string" | "number" | "integer" | "boolean") => ({ type: [type, "null"] });
const nullableEnum = (values: readonly string[]) => ({ type: ["string", "null"], enum: [...values, null] });
const obj = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const list = (items: object) => ({ type: "array", items });

const PARAMS = list(obj({ name: str, value: { type: "string", description: "JSON text: 300, \"b\", true, {\"x\":1}" } }));
// (`object` = ON a thrown/held object, following it; `landing` = where and when it lands — effects/types.ts ObjectAnchor.)
const SPOT = obj({ character: nullable("string"), joint: nullable("string"), object: nullable("string"), landing: nullable("boolean"), x: nullable("number"), y: nullable("number"), dx: nullable("number"), dy: nullable("number") });
const ACTION = obj({
  move: str, params: PARAMS, style: nullableEnum(MOVE_STYLES), speed: nullableEnum(MOVE_SPEEDS), energy: nullable("number"),
  sync: { anyOf: [obj({ mark: str, at: str, offset: num }), { type: "null" }] },
});
const CHARACTER = obj({
  id: str, name: str, namedByUser: { type: "boolean" }, x: num, facing: { type: "string", enum: ["left", "right", "front"] },
  color: nullable("string"), style: nullableEnum(MOVE_STYLES), speed: nullableEnum(MOVE_SPEEDS), energy: nullable("number"),
  guard: nullableEnum(["loose", "high", "realistic"]), cuffed: { type: "boolean" }, wears: list(str), actions: list(ACTION),
});
const OBJECT = obj({ id: str, kind: { type: "string", enum: ["ball", "basketball", "box"] }, size: num, color: nullable("string"), heldBy: nullable("string") });
const EFFECT = obj({ kind: str, start: num, end: num, anchor: SPOT, target: { anyOf: [SPOT, { type: "null" }] }, params: PARAMS, layer: nullableEnum(["back", "front", "top"]) });
const PIECE = obj({ kind: str, params: PARAMS });
export const TERRA_PLAN_SCHEMA = obj({
  title: str, fps: nullable("integer"), canvasColor: nullable("string"),
  characters: list(CHARACTER), objects: list(OBJECT), effects: list(EFFECT), background: list(PIECE),
});
// A small edit of the previous plan (follow-ups): the edit kinds of moves/editPlan.ts, flattened.
const EDIT = obj({
  kind: { type: "string", enum: ["stronger", "weaker", "faster", "slower", "color", "bigger", "smaller", "effectParams", "replace", "add", "remove", "rename", "fps", "backgroundColor", "skyColor"] },
  character: nullable("string"), move: nullable("string"), nth: nullable("integer"), effect: nullable("string"),
  newMove: nullable("string"), params: PARAMS, action: { anyOf: [ACTION, { type: "null" }] },
  amount: nullable("number"), color: nullable("string"), name: nullable("string"), fps: nullable("integer"),
});

export const DIRECTOR_SCHEMA = obj({
  reply: str,
  says: { type: "string", description: "First I'll …, then I'll …, and finally I'll … — then your animation is ready." },
  plan: { anyOf: [TERRA_PLAN_SCHEMA, { type: "null" }] },
  edits: list(EDIT),
});

// ---- Terra's JSON -> the engine's plan ----

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : undefined);
const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(v: unknown, values: readonly T[]) => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : undefined);
const clean = <T extends Json>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

const parseValue = (raw: unknown): unknown => {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
};
export const paramsFrom = (v: unknown): Record<string, unknown> => Object.fromEntries(arr(v).filter(isObj).filter((p) => typeof p.name === "string" && p.name).map((p) => [p.name as string, parseValue(p.value)]));
export const paramsTo = (params: Record<string, unknown> | undefined) => Object.entries(params ?? {}).map(([name, value]) => ({ name, value: JSON.stringify(value) }));

const spotFrom = (v: unknown): Anchor | undefined => {
  if (!isObj(v)) return undefined;
  if (typeof v.object === "string" && v.object) return clean({ object: v.object, dx: number(v.dx), dy: number(v.dy), landing: v.landing === true ? true : undefined }) as Anchor;
  if (typeof v.character === "string" && v.character) return clean({ character: v.character, joint: (text(v.joint) ?? "hip") as never, dx: number(v.dx), dy: number(v.dy) }) as Anchor;
  const x = number(v.x), y = number(v.y);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
};
const spotTo = (a: Anchor | undefined) => (!a ? null : "object" in a
  ? { character: null, joint: null, object: a.object, landing: a.landing ?? null, x: null, y: null, dx: a.dx ?? null, dy: a.dy ?? null }
  : "character" in a
  ? { character: a.character, joint: a.joint, object: null, landing: null, x: null, y: null, dx: a.dx ?? null, dy: a.dy ?? null }
  : { character: null, joint: null, object: null, landing: null, x: a.x, y: a.y, dx: null, dy: null });

export const actionFrom = (v: Json): Action => clean({
  move: text(v.move) ?? "",
  params: arr(v.params).length ? paramsFrom(v.params) : undefined,
  style: oneOf(v.style, MOVE_STYLES), speed: oneOf(v.speed, MOVE_SPEEDS), energy: number(v.energy),
  sync: isObj(v.sync) && typeof v.sync.mark === "string" && typeof v.sync.at === "string" ? clean({ mark: v.sync.mark, at: v.sync.at, offset: number(v.sync.offset) || undefined }) : undefined,
}) as Action;

const actionTo = (a: Action) => ({ move: a.move, params: paramsTo(a.params), style: a.style ?? null, speed: a.speed ?? null, energy: a.energy ?? null, sync: a.sync ? { mark: a.sync.mark, at: a.sync.at, offset: a.sync.offset ?? 0 } : null });

export type TerraReply = { reply: string; says: string; plan: (ScenePlan & { fps?: number }) | null; edits: PlanEdit[] };

// Terra's plan JSON -> a ScenePlan (fixed height and ground; nothing repaired yet: repair.ts does that).
export function planFrom(v: unknown, id = "terra"): (ScenePlan & { fps?: number }) | null {
  if (!isObj(v)) return null;
  const characters: CharacterPlan[] = arr(v.characters).filter(isObj).map((c, i) => clean({
    id: text(c.id) || `c${i + 1}`, name: text(c.name) || undefined, namedByUser: c.namedByUser === true ? true : undefined,
    x: number(c.x) ?? STAGE_MIDDLE, facing: oneOf(c.facing, ["left", "right", "front"] as const) ?? "right",
    look: text(c.color) ? { color: text(c.color)! } : undefined,
    style: oneOf(c.style, MOVE_STYLES), speed: oneOf(c.speed, MOVE_SPEEDS), energy: number(c.energy),
    guard: oneOf(c.guard, ["loose", "high", "realistic"] as const), cuffed: c.cuffed === true ? true : undefined,
    wears: arr(c.wears).filter((w): w is string => typeof w === "string").length ? arr(c.wears).filter((w): w is string => typeof w === "string") : undefined,
    actions: arr(c.actions).filter(isObj).map(actionFrom),
  }) as CharacterPlan);
  const objects: ObjectPlan[] = arr(v.objects).filter(isObj).map((o, i) => {
    const kind = oneOf(o.kind, ["ball", "basketball", "box"] as const) ?? "ball";
    const changes = clean({ size: number(o.size), color: text(o.color) });
    return clean({ id: text(o.id) || `object${i + 1}`, look: kind === "box" ? boxLook(changes) : ballLook(kind, changes), heldBy: text(o.heldBy) || undefined }) as ObjectPlan;
  });
  const effects: EffectTrack[] = arr(v.effects).filter(isObj).flatMap((e) => {
    const anchor = spotFrom(e.anchor), kind = text(e.kind);
    if (!anchor || !kind) return [];
    return [clean({ kind, start: number(e.start) ?? 0, end: number(e.end) ?? (number(e.start) ?? 0) + 1, anchor, target: spotFrom(e.target), params: arr(e.params).length ? paramsFrom(e.params) : undefined, layer: oneOf(e.layer, ["back", "front", "top"] as const) }) as EffectTrack];
  });
  const pieces = arr(v.background).filter(isObj).filter((p) => text(p.kind)).map((p) => clean({ kind: text(p.kind)!, params: arr(p.params).length ? paramsFrom(p.params) as BackgroundSpec["pieces"][number]["params"] : undefined }));
  const fps = number(v.fps);
  return clean({
    id, title: text(v.title) || "Animation", height: PLAN_HEIGHT, groundY: PLAN_GROUND, characters,
    objects: objects.length ? objects : undefined, effects: effects.length ? effects : undefined,
    background: pieces.length ? { pieces } : undefined, canvasColor: text(v.canvasColor) || undefined,
    fps: fps !== undefined && fps > 0 ? Math.round(fps) : undefined,
  }) as ScenePlan & { fps?: number };
}

// A ScenePlan -> Terra's plan JSON (the previous plan for a follow-up, and the plan sent back for a review).
export function planTo(plan: ScenePlan & { fps?: number }) {
  return {
    title: plan.title, fps: plan.fps ?? null, canvasColor: plan.canvasColor ?? null,
    characters: plan.characters.map((c) => ({
      id: c.id, name: c.name ?? c.id, namedByUser: c.namedByUser === true, x: Math.round(c.x), facing: c.facing,
      color: c.look?.color ?? null, style: c.style ?? null, speed: c.speed ?? null, energy: c.energy ?? null, guard: c.guard ?? null,
      cuffed: Boolean(c.cuffed), wears: c.wears ?? [], actions: c.actions.map(actionTo),
    })),
    objects: (plan.objects ?? []).map((o) => ({ id: o.id, kind: o.look.kind === "box" ? "box" : o.look.detail === "basketball" ? "basketball" : "ball", size: o.look.size, color: o.look.color, heldBy: o.heldBy ?? null })),
    effects: (plan.effects ?? []).map((e) => ({ kind: e.kind, start: e.start, end: e.end, anchor: spotTo(e.anchor), target: spotTo(e.target), params: paramsTo(e.params), layer: e.layer ?? null })),
    background: (plan.background?.pieces ?? []).map((p) => ({ kind: p.kind, params: paramsTo(p.params) })),
  };
}

// Terra's flattened edits -> editPlan.ts edits (unusable ones are dropped).
export function editsFrom(v: unknown): PlanEdit[] {
  return arr(v).filter(isObj).flatMap((e): PlanEdit[] => {
    const ref = clean({ character: text(e.character) || undefined, move: text(e.move) || undefined, nth: number(e.nth) });
    const amount = number(e.amount);
    switch (e.kind) {
      case "stronger": case "weaker": return [clean({ kind: e.kind, action: ref, amount }) as PlanEdit];
      case "faster": case "slower": return [clean({ kind: e.kind, action: ref.move ? ref : undefined, character: !ref.move ? ref.character : undefined, steps: amount }) as PlanEdit];
      case "color": return text(e.color) ? [clean({ kind: "color", character: e.effect ? undefined : ref.character, effect: e.effect ? { kind: text(e.effect) } : undefined, color: text(e.color)! }) as PlanEdit] : [];
      case "bigger": case "smaller": return text(e.effect) ? [clean({ kind: e.kind, effect: { kind: text(e.effect) }, factor: amount }) as PlanEdit] : [];
      case "effectParams": return text(e.effect) && arr(e.params).length ? [{ kind: "effectParams", effect: { kind: text(e.effect) }, params: paramsFrom(e.params) }] : [];
      case "replace": return text(e.newMove) ? [clean({ kind: "replace", action: ref, move: text(e.newMove)!, params: arr(e.params).length ? paramsFrom(e.params) : undefined }) as PlanEdit] : [];
      case "add": return isObj(e.action) ? [{ kind: "add", after: ref, action: actionFrom(e.action) }] : [];
      case "remove": return [{ kind: "remove", action: ref }];
      case "rename": return text(e.name) && ref.character ? [{ kind: "rename", character: ref.character, name: text(e.name)! }] : [];
      case "fps": return number(e.fps) ? [{ kind: "fps", fps: number(e.fps)! }] : [];
      case "backgroundColor": return text(e.color) ? [{ kind: "backgroundColor", color: text(e.color)! }] : [];
      case "skyColor": return text(e.color) ? [{ kind: "skyColor", color: text(e.color)! }] : [];
      default: return [];
    }
  });
}

export function replyFrom(json: unknown, id?: string): TerraReply | null {
  if (!isObj(json)) return null;
  return { reply: text(json.reply) ?? "", says: text(json.says) ?? "", plan: planFrom(json.plan, id), edits: editsFrom(json.edits) };
}
