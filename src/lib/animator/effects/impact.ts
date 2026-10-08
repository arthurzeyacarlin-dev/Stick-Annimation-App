// WHAT HAPPENS ON IMPACT DEPENDS ON WHAT THE THING IS MADE OF (Arthur, 2026-10-07: "a fireball... when it hits the
// ground it would be a fiery explosion — a tiny one, sized by the fire... electricity → an electric explosion... glass
// or a solid thing breaks... not shatter like glass — unless it IS glass"). A thrown thing that lands or hits gets
// the impact its MATERIAL makes — read from the effect ON it (a fireball, a glow, sparks) and its name words — never
// one look for everything. Only fills in what the plan leaves out (and swaps a shatter on a thing that can't break).
import type { EffectParams, EffectTrack } from "./types.ts";

export type Material = "fire" | "electric" | "energy" | "water" | "ice" | "glass" | "soft";

// The effect kinds carried ON a thing that tell what it is made of.
const ON_KIND: Record<string, Material> = { fireball: "fire", fire: "fire", fireStream: "fire", fireBurst: "fire", wildfire: "fire", lightning: "electric", sparks: "electric", glow: "energy", flash: "energy", waterStream: "water", splash: "water", waterShield: "water", bubbles: "water", iceStream: "ice", iceShards: "ice" };
// Name words, in order (the first that matches wins: an "ice ball" is ice, a "fire ball" fire).
const WORDS: [RegExp, Material][] = [
  [/fire|flam|burn|blaz|lava|magma|ember|inferno|torch|meteor/i, "fire"],
  [/electr|lightn|thunder|shock|volt|zap|spark|plasma/i, "electric"],
  [/water|aqua|bubble|wet|rain|slime|splash/i, "water"],
  [/(^|[^a-z])ice|frozen|frost|snowball|icicle/i, "ice"],
  [/glass|bottle|vase|jar|window|mirror|plate|cup|crystal|bulb/i, "glass"],
  [/energy|magic|power|aura|spirit|mana|\bki\b|chi\b|orb|spell|star|cosmic|soul/i, "energy"],
  [/rubber|bouncy|soft|tennis|basket|soccer|foot ?ball|beach ?ball|balloon|pillow|plush/i, "soft"],
];

// What a thing is made of: the effect on it first (it says what it IS), then its name words; unknown → undefined.
export function materialOf(words: string, onKinds: readonly string[] = [], onParams: readonly EffectParams[] = []): Material | undefined {
  for (const k of onKinds) if (ON_KIND[k]) {
    // (sparks drawn as stars on a ball = a magic star ball, not electricity)
    if (k === "sparks" && onParams.some((p) => p?.stars === true)) return "energy";
    return ON_KIND[k];
  }
  for (const [re, m] of WORDS) if (re.test(words)) return m;
  return undefined;
}

// The impact each material makes, sized by the thing (`size` = its size x the figure height) in its own colour.
export function impactFor(material: Material, size: number, color?: string): { kind: string; seconds: number; params: EffectParams }[] {
  const s = Math.max(0.05, Math.min(0.6, size));
  switch (material) {
    // a SMALL fiery explosion sized by the fire: a flash, flames thrown out, a smoke puff (fireBurst draws all three)
    case "fire": return [{ kind: "fireBurst", seconds: 0.8, params: { size: Math.min(0.45, s * 0.85) } }];
    // a crackling electric burst: a flash and a spray of sparks in the electricity's colour
    case "electric": return [{ kind: "flash", seconds: 0.25, params: { size: s * 1.4, color: color ?? "#bfe8ff" } }, { kind: "sparks", seconds: 0.5, params: { burst: true, spread: 300, intensity: 1.3, size: Math.max(0.6, s * 3), color: color ?? "#7fd4ff" } }];
    // a glowing energy burst: a flash in its colour, a ring of glowing motes that fade in the air (not falling shards)
    // (2026-10-08: a flash and a glow centred ON the floor are squashed flat there — the burst of glowing motes thrown
    // up and out is what reads, so it comes along; the landing rule makes it bigger than the thing.)
    case "energy": return [{ kind: "flash", seconds: 0.3, params: { size: s * 1.6, color: color ?? "#d9a8ff" } }, { kind: "glow", seconds: 0.45, params: { size: s * 1.4, color: color ?? "#b266ff", intensity: 1.2 } }, { kind: "sparks", seconds: 0.6, params: { burst: true, spread: 240, intensity: 1.2, size: Math.max(0.6, s * 3), color: color ?? "#d9a8ff" } }];
    case "water": return [{ kind: "splash", seconds: 0.8, params: { size: Math.max(0.15, s * 1.5), ...(color ? { color } : {}) } }];
    // a thing that can break breaks into pieces (glass: clear pale pieces; ice: ice pieces)
    case "ice": return [{ kind: "iceShatter", seconds: 0.9, params: { size: s * 0.8, tall: s, count: 5 } }];
    case "glass": return [{ kind: "iceShatter", seconds: 0.9, params: { size: s * 0.8, tall: s, count: 6, color: "#e8f6ff", color2: "#ffffff" } }];
    case "soft": return []; // (a soft ball just bounces: the object's own landing)
  }
}

// Shatter looks: only for things that can break.
const SHATTERS = new Set(["iceShatter", "crateBreak", "iceShards"]);
const BREAKS = new Set<Material | undefined>(["ice", "glass", undefined]);

type PlanLike = { height: number; characters: { actions: { move: string; params?: Record<string, unknown> }[] }[]; objects?: { id: string; name?: string; look: { size: number; color: string } }[]; effects?: EffectTrack[] };

// A THROWN THING'S IMPACT FROM ITS MATERIAL: every thrown object whose material is known and whose landing the plan
// leaves empty gets its material's impact ({object, landing: true}, so the engine moves it to the landing and the thing
// is gone after a burst); a shatter the plan put on a thing that can't break (a fireball "shattering") becomes the
// material's own impact.
export function impactByMaterial<P extends PlanLike>(plan: P): P {
  const thrown = new Set(plan.characters.flatMap((c) => c.actions.filter((a) => a.move === "throw").map((a) => a.params?.object as string)));
  if (!plan.objects?.some((o) => thrown.has(o.id))) return plan;
  let effects = [...(plan.effects ?? [])];
  let changed = false;
  for (const o of plan.objects) {
    if (!thrown.has(o.id)) continue;
    const on = effects.filter((e) => "object" in e.anchor && e.anchor.object === o.id && !e.anchor.landing);
    const material = materialOf(`${o.id} ${o.name ?? ""}`, on.map((e) => e.kind), on.map((e) => e.params ?? {}));
    if (!material) continue;
    const color = on.find((e) => typeof e.params?.color === "string")?.params?.color as string | undefined;
    // (sized by the thing: the effect on it, else the ball itself)
    const onSize = on.map((e) => e.params?.size).find((v) => typeof v === "number") as number | undefined;
    const size = onSize ?? o.look.size / Math.max(1, plan.height);
    const lands = effects.filter((e) => "object" in e.anchor && e.anchor.object === o.id && e.anchor.landing);
    const wrong = lands.filter((e) => SHATTERS.has(e.kind) && !BREAKS.has(material));
    if (lands.length && !wrong.length) continue;
    const start = Math.min(...(lands.length ? lands.map((e) => e.start) : [0]));
    const made = impactFor(material, size, material === "fire" ? undefined : color).map((m) => ({ kind: m.kind, start, end: start + m.seconds, anchor: { object: o.id, landing: true }, params: m.params }) as EffectTrack);
    if (!made.length && !wrong.length) continue;
    effects = [...effects.filter((e) => !wrong.includes(e)), ...made];
    changed = true;
  }
  return changed ? { ...plan, effects } : plan;
}
