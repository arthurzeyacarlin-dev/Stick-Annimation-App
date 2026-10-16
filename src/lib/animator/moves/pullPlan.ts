// PULLING IS THE PULL MOVE (Arthur, Oct 14: the tug of war written as hand-made "custom" keys looked weak — loose feet, hands up by
// the head, nobody really pulling). Free, no AI: in a plan, a figure that holds a rope (a prop with a "string" tied to its hand) and
// does a "custom" move whose name says it pulls (pull, tug, heave, haul, drag, yank) does the library "pull" move instead:
// - a name that says it is being dragged / losing / stumbling forward → role "lose";
// - custom keys that travel backward overall → role "win" (gaining ground); so does the other puller on the same rope of a loser;
// - otherwise "even". `repeat` becomes the number of heaves; the rope's other end low on the ground (a sled, a cart) → hands "low".
type Rec = Record<string, unknown>;
const PULL_WORDS = /\b(pull\w*|tug\w*|heav\w*|haul\w*|drag\w*|yank\w*|tow\w*)\b/i;
const LOSE_WORDS = /\b(fall\w*|fell|dragged|dragging forward|being pulled|pulled forward|los(e|es|ing)|slip\w*|stumbl\w*|giv(e|es|ing) way)\b/i;
type End = { character?: string; joint?: string; x?: number; y?: number };

export function pullsFromCustom(shot: Rec): Rec {
  const chars = shot.characters as Rec[] | undefined;
  const effects = (shot.effects as Rec[] | undefined) ?? [];
  if (!Array.isArray(chars)) return shot;
  const handEnd = (e: unknown): e is End => !!e && typeof e === "object" && typeof (e as End).character === "string" && /hand/i.test(String((e as End).joint ?? ""));
  // Who holds a rope, and what is at the rope's other end.
  const ropes = effects.filter((e) => e.kind === "prop" && (e.params as Rec | undefined)?.string && (e.params as Rec | undefined)?.slack !== true);
  const holds = new Map<string, { other: End | undefined }>();
  for (const r of ropes) {
    const a = r.anchor as End | undefined, t = r.target as End | undefined;
    if (handEnd(t)) holds.set(t.character!, { other: a });
    if (handEnd(a)) holds.set(a.character!, { other: t });
  }
  if (!holds.size) return shot;
  const groundY = Number(shot.groundY ?? 900), H = Number(shot.height ?? 300);
  const roleOf = (a: Rec): "win" | "lose" | "even" => {
    const p = (a.params as Rec | undefined) ?? {};
    if (LOSE_WORDS.test(String(p.name ?? ""))) return "lose";
    const keys = Array.isArray(p.keys) ? (p.keys as Rec[]) : [];
    const dx = keys.reduce((s, k) => s + (typeof k.dx === "number" ? k.dx : 0), 0);
    return dx < -0.05 * H ? "win" : dx > 0.05 * H ? "lose" : "even";
  };
  const mapped = chars.map((c) => {
    const hold = holds.get(String(c.id));
    if (!hold) return c;
    const actions = ((c.actions as Rec[] | undefined) ?? []).map((a) => {
      const p = (a.params as Rec | undefined) ?? {};
      if (a.move !== "custom" || p.seated === true || !PULL_WORDS.test(String(p.name ?? ""))) return a;
      const o = hold.other;
      const low = !!o && !o.character && typeof o.y === "number" && o.y > groundY - 0.35 * H;
      const { params: _p, ...rest } = a; void _p;
      return { ...rest, move: "pull", params: { role: roleOf(a), ...(FALL_WORDS.test(String(p.name ?? "")) ? { fall: true } : {}), heaves: Math.max(1, Math.min(8, Math.round(Number(p.repeat ?? 3)) || 3)), ...(low ? { hands: "low" } : {}) } };
    });
    return { ...c, actions };
  });
  // The other puller on a loser's rope is the winner (when it was left "even").
  const roleById = new Map(mapped.map((c) => [String(c.id), ((c.actions as Rec[] | undefined) ?? []).find((a) => a.move === "pull")]));
  for (const r of ropes) {
    const a = r.anchor as End | undefined, t = r.target as End | undefined;
    if (!handEnd(a) || !handEnd(t)) continue;
    const pa = roleById.get(a.character!), pt = roleById.get(t.character!);
    const ra = (pa?.params as Rec | undefined)?.role, rt = (pt?.params as Rec | undefined)?.role;
    if (pa && pt && ra === "lose" && rt === "even") (pt.params as Rec).role = "win";
    if (pa && pt && rt === "lose" && ra === "even") (pa.params as Rec).role = "win";
  }
  return hauled(pullEndings({ ...shot, characters: mapped }, holds, groundY, H));
}

// HOW A PULL ENDS (Arthur, Oct 14): a loser whose pull is followed by a fall (or whose name says it falls) is YANKED OFF BALANCE
// and falls forward — `fall: true`, and a forward fall is added after the pull when the sheet forgot it; then every winner in that
// shot gets the huge last heave (`final: true`). The rope's slope (from the puller's hands down/up to its other end) is set so
// the second fist sits on the rope's line.
const FALL_WORDS = /\b(fall\w*|fell|trip\w*|faceplant\w*|tumbl\w*|wip(e|es|ing) out)\b/i;
function pullEndings(shot: Rec, holds: Map<string, { other: End | undefined }>, groundY: number, H: number): Rec {
  const chars = shot.characters as Rec[];
  let anyFall = false;
  const withFalls = chars.map((c) => {
    const actions = [...(((c.actions as Rec[] | undefined) ?? []))];
    for (let i = 0; i < actions.length; i += 1) {
      const a = actions[i], p = (a.params as Rec | undefined) ?? {};
      if (a.move !== "pull") continue;
      const next = actions[i + 1];
      const nextFalls = !!next && /^fall/i.test(String(next.move)) && (next.params as Rec | undefined)?.direction !== "back";
      const params: Rec = { ...p };
      const o = holds.get(String(c.id))?.other;
      if (params.slope === undefined && o && !o.character && typeof o.y === "number" && typeof o.x === "number" && typeof c.x === "number") {
        const handY = groundY - (params.hands === "low" ? 0.42 : 0.52) * H;
        params.slope = Math.round(Math.max(-35, Math.min(45, (Math.atan2(o.y - handY, Math.abs(o.x - Number(c.x))) * 180) / Math.PI)));
      }
      if (params.role === "lose" && (params.fall === true || nextFalls || FALL_WORDS.test(String(p.name ?? "")))) {
        params.fall = true; anyFall = true;
        // (the loser STAYS DOWN: a "fall" (fall AND get up) after the pull becomes "fallDown" unless it says getUp: true)
        if (!nextFalls) actions.splice(i + 1, 0, { move: "fallDown", params: { direction: "forward" } });
        else if (next.move === "fall" && (next.params as Rec | undefined)?.getUp !== true) actions[i + 1] = { ...next, move: "fallDown" };
      }
      actions[i] = { ...a, params };
    }
    return { ...c, actions };
  });
  const out = anyFall ? withFalls.map((c) => ({ ...c, actions: (c.actions as Rec[]).map((a) => (a.move === "pull" && (a.params as Rec | undefined)?.role === "win" && (a.params as Rec).final === undefined ? { ...a, params: { ...(a.params as Rec), final: true } } : a)) })) : withFalls;
  return { ...shot, characters: out };
}

// A HAULED THING COMES ALONG (Arthur's sailor sheet, Oct 14: the boat never moved while he hauled it in): a thing at the far end of
// a rope (the prop's fixed end — a boat, a sled, a cart, a bucket) that a WINNING puller (role "win": gains ground each heave)
// hauls comes toward them by the rope they gain, on the same beat (`haul` on the prop: drawProp moves it along its own surface —
// its height never changes, so a boat stays on the water line). Things fixed in the ground (a stump, a tree, a post, a rock, a
// wall) stay unless the prop says "comesOut": true. Works for a pull that is the figure's first move (its beat is known here).
const FIXED_THINGS = /stump|tree|post|pole|wall|rock|boulder|anchor|pillar|house|fence/i;
function hauled(shot: Rec): Rec {
  const chars = (shot.characters as Rec[] | undefined) ?? [], effects = (shot.effects as Rec[] | undefined) ?? [];
  let changed = false;
  const out = effects.map((e) => {
    const p = (e.params as Rec | undefined) ?? {};
    if (e.kind !== "prop" || !p.string || p.slack === true || p.haul) return e;
    const a = e.anchor as End | undefined, t = e.target as End | undefined;
    const fixedEnd = a && !a.character && typeof a.x === "number" ? a : undefined;
    if (!fixedEnd || !t?.character) return e;
    if (FIXED_THINGS.test(String(p.symbol ?? p.name ?? "")) && p.comesOut !== true) return e;
    const c = chars.find((ch) => String(ch.id) === t.character);
    const first = ((c?.actions as Rec[] | undefined) ?? [])[0], pp = (first?.params as Rec | undefined) ?? {};
    if (!c || first?.move !== "pull" || pp.role !== "win" || typeof c.x !== "number") return e;
    const H = Number(shot.height ?? 300), period = Math.min(1.6, Math.max(0.7, Number(pp.period ?? 1)));
    const heaves = Math.min(12, Math.max(1, Math.round(Number(pp.heaves ?? 3)))), step = Math.min(0.25, Math.max(0, Number(pp.step ?? 0.12))) * H;
    changed = true; // (t0: the scene's start in the track's own time — the pull opens the scene, already in its stance)
    return { ...e, params: { ...p, haul: { t0: -Number(e.start ?? 0), period, heaves, step: Math.round(step), dir: Math.sign(Number(c.x) - fixedEnd.x!) || 1 } } };
  });
  return changed ? { ...shot, effects: out } : shot;
}
// How far (px) a hauled thing has come at `t` (seconds since its track started): each heave's two steps back (0.56–1.0 of the beat).
export function haulGain(t: number, h: { t0: number; period: number; heaves: number; step: number }): number {
  let g = 0;
  for (let k = 0; k < h.heaves; k += 1) { const u = Math.min(1, Math.max(0, (t - h.t0 - (k + 0.56) * h.period) / (0.44 * h.period))); g += h.step * u * u * (3 - 2 * u); }
  return g;
}
