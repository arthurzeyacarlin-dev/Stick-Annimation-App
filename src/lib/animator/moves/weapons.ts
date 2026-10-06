// SPEC-0017 Phase 2C extras (2026-10-06): WEAPONS IN GENERAL (Arthur: "two stick figures fight with swords... it
// should actually look like a sword fight"; later bamboo sticks, wooden sticks, metal bats, baseball bats).
// A HELD WEAPON IS A LIBRARY SYMBOL held in the hand(s) in every picture (effects/weapons.ts draws it along the
// forearm: the grip in the hand, the rest straight on past it). This table is everything the engine needs to know
// about each kind — its look (the symbol), how long it is, one or two hands, metal or wood, and which part of it
// does the hitting — so every weapon move (slash, chop, thrust, spin attack, dash-slash, block/parry) works with
// any weapon in it, and the hitting part is what must really reach.
// (Pure data and geometry: no imports from the moves, so the symbol maker and the effects can use it too.)

export type WeaponKind = "sword" | "bambooStick" | "woodenStick" | "metalBat" | "baseballBat";
export type Weapon = {
  kind: WeaponKind;
  symbol: string; // the Library symbol's name ("Sword")
  recipe: string; // the symbol recipe (symbolMaker.ts SYMBOL_RECIPES)
  length: number; // x the figure's height, butt to tip
  across: number; // x its length: how wide it is (the crossguard, the barrel)
  grip: number; // where the main hand holds it, a fraction of its length from the butt
  hitting: readonly [number, number]; // the hitting part (the blade, the barrel), fractions of its length
  hands: 1 | 2; // held in one hand, or always both
  material: "metal" | "wood";
  edge: boolean; // a blade (cuts) or a club (thuds)
};

export const WEAPONS: Record<WeaponKind, Weapon> = {
  // A real sword sized to a stick figure (0.6 x its height): blade with a highlight, crossguard, grip, pommel.
  sword: { kind: "sword", symbol: "Sword", recipe: "heldsword", length: 0.6, across: 0.12, grip: 0.12, hitting: [0.28, 1], hands: 1, material: "metal", edge: true },
  bambooStick: { kind: "bambooStick", symbol: "Bamboo stick", recipe: "bamboostick", length: 0.7, across: 0.045, grip: 0.14, hitting: [0.35, 1], hands: 2, material: "wood", edge: false },
  woodenStick: { kind: "woodenStick", symbol: "Wooden stick", recipe: "woodenstick", length: 0.65, across: 0.05, grip: 0.14, hitting: [0.35, 1], hands: 2, material: "wood", edge: false },
  metalBat: { kind: "metalBat", symbol: "Metal bat", recipe: "metalbat", length: 0.55, across: 0.11, grip: 0.12, hitting: [0.5, 1], hands: 2, material: "metal", edge: false },
  baseballBat: { kind: "baseballBat", symbol: "Baseball bat", recipe: "baseballbat", length: 0.55, across: 0.11, grip: 0.12, hitting: [0.5, 1], hands: 2, material: "wood", edge: false },
};
export const weaponOf = (kind: unknown): Weapon => WEAPONS[(typeof kind === "string" && kind in WEAPONS ? kind : "sword") as WeaponKind];

// CLASH: what two weapons meeting makes — metal on metal SPARKS (a small yellow spark at the contact point; big on a
// strong hit, almost none on a light one); anything with wood a DULL HIT (a little dust and a chip or two, no sparks).
export const clashKind = (a: Weapon, b: Weapon): "clashSpark" | "dullHit" => (a.material === "metal" && b.material === "metal" ? "clashSpark" : "dullHit");

type P = { x: number; y: number };
// Where the weapon is in a picture, from the holding hand and its elbow (stage px): it lies along the forearm, the
// grip in the hand. `at(f)` = the point a fraction f of its length from the butt.
export function weaponLine(hand: P, elbow: P, height: number, weapon: Weapon) {
  const dx = hand.x - elbow.x, dy = hand.y - elbow.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, L = weapon.length * height;
  const butt = { x: hand.x - ux * weapon.grip * L, y: hand.y - uy * weapon.grip * L };
  const at = (f: number): P => ({ x: butt.x + ux * f * L, y: butt.y + uy * f * L });
  return { butt, tip: at(1), at, ux, uy, L, rotation: (Math.atan2(uy, ux) * 180) / Math.PI, middle: at(0.5) };
}

// The closest points of two segments (and how far apart they are): where two blades meet.
export function segmentsMeet(a0: P, a1: P, b0: P, b1: P) {
  const d1 = { x: a1.x - a0.x, y: a1.y - a0.y }, d2 = { x: b1.x - b0.x, y: b1.y - b0.y }, r = { x: a0.x - b0.x, y: a0.y - b0.y };
  const a = d1.x * d1.x + d1.y * d1.y, e = d2.x * d2.x + d2.y * d2.y, f = d2.x * r.x + d2.y * r.y;
  const c = d1.x * r.x + d1.y * r.y, b = d1.x * d2.x + d1.y * d2.y, den = a * e - b * b;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  let s = den > 1e-9 ? clamp01((b * f - c * e) / den) : 0;
  let t = e > 1e-9 ? (b * s + f) / e : 0;
  if (t < 0) { t = 0; s = a > 1e-9 ? clamp01(-c / a) : 0; } else if (t > 1) { t = 1; s = a > 1e-9 ? clamp01((b - c) / a) : 0; }
  const p = { x: a0.x + d1.x * s, y: a0.y + d1.y * s }, q = { x: b0.x + d2.x * t, y: b0.y + d2.y * t };
  return { p, q, s, t, distance: Math.hypot(p.x - q.x, p.y - q.y), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
}
