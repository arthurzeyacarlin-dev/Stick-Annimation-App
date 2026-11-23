// (Nov 23, Arthur: "any person that uses my app ... will still get guided") the small memory that leads a new user to the
// AI Animator: Home's typing line hands its words to the editor, and the app remembers how many animations have landed in
// this browser (the window opens by itself and the "It's yours" card shows only for the first ones).
// A look and a hand-off only: nothing here talks to the AI or changes what it makes.
const START_KEY = "diamond.animateStart.v1";
const LANDED_KEY = "diamond.animationsLanded.v1";
const START_FRESH_MS = 2 * 60 * 1000;

const box = (kind: "local" | "session"): Storage | null => {
  try { return typeof window === "undefined" ? null : kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
};

/** Home -> editor: open the animate window in the next project, with these words already typed (nothing is sent). */
export function queueAnimateStart(text = ""): void {
  try { box("session")?.setItem(START_KEY, JSON.stringify({ text: text.slice(0, 2000), at: Date.now() })); } catch { /* storage blocked: the editor just opens normally */ }
}

/** The editor takes the hand-off once (a reload later never opens it again). */
export function takeAnimateStart(): { text: string } | null {
  const store = box("session");
  try {
    const raw = store?.getItem(START_KEY);
    if (!raw) return null;
    store?.removeItem(START_KEY);
    const value = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (!(Date.now() - Number(value.at) < START_FRESH_MS)) return null;
    return { text: typeof value.text === "string" ? value.text : "" };
  } catch { return null; }
}

/** How many AI animations have landed on a canvas in this browser. */
export function landedCount(): number {
  try { return Math.max(0, Number(box("local")?.getItem(LANDED_KEY) ?? 0) || 0); } catch { return 0; }
}

export function noteLanded(): number {
  const next = landedCount() + 1;
  try { box("local")?.setItem(LANDED_KEY, String(next)); } catch { /* storage blocked */ }
  return next;
}

/** (Nov 23, Arthur: "it needs to feel endless ... 15 or 20 ... no repetition, all random") ideas that show the range: vehicles,
 *  animals, sports, stunts, whole stories. One main character each, no backgrounds and no effects (what the AI Animator can't do). */
export const ANIMATION_IDEAS = [
  "a stick figure drives off a hill, the car crashes and rolls down, falling apart, until he tumbles out badly hurt",
  "a robot does a funny dance, then takes a bow",
  "a knight pulls out his sword, swings it three times and puts it back",
  "a cat sneaks up on a ball of yarn and pounces on it",
  "a skateboarder rolls in, does a kickflip and rides away",
  "a lumberjack chops a tree until it falls, then sits on the stump",
  "a ninja jumps over a crate and throws three stars at a target",
  "a basketball player dribbles, spins around and dunks",
  "a dog chases a frisbee and catches it in mid-air",
  "a boxer throws a fast punch combo at a punching bag",
  "a chef flips a pancake so high it lands on his head",
  "a goalkeeper dives and saves a penalty kick",
  "a man slips on a banana peel and lands flat on his back",
  "a dragon flaps its wings and takes off into the sky",
  "a robot stacks a tower of blocks that wobbles and falls over",
  "a stick figure runs up a wall and does a backflip off it",
  "a pirate walks the plank, looks down and jumps",
  "a monkey swings across three hanging vines",
  "a samurai slices a falling apple in half",
  "a soccer player juggles the ball, then volleys it",
  "a delivery guy drops a stack of boxes on his foot",
  "a gorilla pounds its chest, then pounds the ground",
  "a superhero lands from the sky in a hero pose",
  "a cowboy spins his lasso and catches a running cow",
];

/** The ideas in a fresh random order (each one once before any repeats). */
export function shuffledIdeas(): string[] {
  const list = [...ANIMATION_IDEAS];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A few short ideas as clickable chips (the longest ones are left for the typing line). */
export function pickIdeaChips(count = 3): string[] {
  return shuffledIdeas().filter((idea) => idea.length <= 52).slice(0, count).map(capital);
}

/** Real examples that type themselves into an empty field, in a random order per visit (a look only). */
export const TYPED_EXAMPLES = shuffledIdeas();
