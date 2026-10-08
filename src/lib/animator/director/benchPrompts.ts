// SPEC-0017 Phase 3 bench: the fixed test requests Terra is judged on (dev page /dev/animator-bench).
// 20 main prompts (section 6.9: single moves, combos, 2–3 characters, objects, styles, energy, powers,
// story tests, timing words, story order, 3 tricky ones, 5 never-taught moves) plus the
// "originals" (Arthur, 2026-10-06): an original background, effect, symbol and key pose, a background color
// change and an FPS change. Each has what to look for when rating it good / OK / bad.

export type BenchGroup =
  | "single"
  | "combo"
  | "characters"
  | "style"
  | "energy"
  | "power"
  | "story"
  | "timing"
  | "order"
  | "tricky"
  | "never-taught"
  | "original";

export type BenchPrompt = {
  id: string;
  group: BenchGroup;
  text: string;
  lookFor: string;
  // One of the 5 "never taught" moves (the "3 + 3" test: pass = at least 4 of 5 look natural).
  neverTaught?: boolean;
  // One of the 20 main prompts (pass = at least 17 of 20 usable); the originals are extra.
  main: boolean;
  // The card's short name on the bench page (the id stays the same, ratings use it).
  title?: string;
  // A follow-up edit: it is sent with this other prompt's last plan (`previousPlan`) when there is one.
  followUpOf?: string;
};

export const BENCH_PROMPTS: readonly BenchPrompt[] = [
  // Single moves
  { id: "wave", group: "single", main: true, text: "A stick figure waves hello.", lookFor: "One figure, a clear friendly wave (the arm swings from the elbow), then settles; no frozen ready pose." },
  { id: "high-jump", group: "single", main: true, text: "A stick figure jumps as high as he can.", lookFor: "A deep crouch first (anticipation), a fast push-off, slow at the top, bent knees on landing (follow-through)." },
  // Combo
  { id: "walk-turn-sit", group: "combo", main: true, text: "A stick figure walks in, turns around and sits down.", lookFor: "The moves flow into each other (no pops); the walk speeds up and slows down; feet don't slide; the sit lowers the hips over the feet." },
  // 2–3 characters (+ objects)
  { id: "two-high-five", group: "characters", main: true, text: "Two stick figures walk up to each other and high-five.", lookFor: "Both arrive at the same time, the hands actually meet at the slap, then they relax." },
  { id: "three-pass", group: "characters", main: true, text: "Three stick figures pass a basketball: the first throws it to the second, who throws it to the third.", lookFor: "Three figures; the ball stays in the hands until each throw, flies in an arc and lands in the catcher's hands, in that order." },
  // Styles
  { id: "robot-then-tired", group: "style", main: true, text: "A stick figure walks like a robot, then does a tired run.", lookFor: "The robot part is stiff with sharp starts and stops; the run is slumped and slow with small arm swings. Body rules still hold." },
  // Energy
  { id: "powerful-punch", group: "energy", main: true, text: "A stick figure throws a powerful punch at a punching bag.", lookFor: "A big wind-up (anticipation), a fast strike, the body follows through; it looks heavier than a normal punch." },
  // Powers
  { id: "fire-vs-water", group: "power", main: true, text: "A fire stick figure blasts fire, the blue one shields with water.", lookFor: "Red/orange figure blasts fire from the hands toward the blue one; the blue one raises a water shield in time and the fire hits the shield." },
  // Story tests
  { id: "dad-block-block-hit", group: "story", main: true, title: "Block, block, hit", text: "The blue stick figure punches three times: the red one blocks the first two, and the third punch almost knocks him over.", lookFor: "Two clean blocks, then a hit that makes red stumble back and catch himself (not fall). Timing reads like a real exchange." },
  { id: "arthur-parkour", group: "story", main: true, text: "A stick figure does parkour over three spikes, then he's tired and rests with a hand on his knee.", lookFor: "Three spikes on the ground; each jump clearly clears a spike; then he slows down, bends over with one hand on his knee and breathes." },
  // Timing words
  { id: "slow-then-sudden", group: "timing", main: true, text: "A stick figure walks slowly, then suddenly starts running.", lookFor: "A clearly slow walk, then a quick, sudden switch into a run (a hard push-off), not a gentle speed-up." },
  // Story order
  { id: "after-punch-ball", group: "order", main: true, text: "A stick figure punches a ball; after he punches, the ball bounces away, and at the end he waves.", lookFor: "Order is right: punch → the ball starts moving at the hit and bounces away → he waves last." },
  // Tricky / vague (fallback)
  { id: "tricky-vague", group: "tricky", main: true, text: "Do something cool.", lookFor: "A sensible short scene anyway (e.g. a jump, a flip-like move or a fight), and Terra says what it chose." },
  { id: "tricky-impossible", group: "tricky", main: true, text: "A stick figure turns into a car and drives to the moon.", lookFor: "No broken bodies; Terra says what it can't do and makes the closest sensible scene (or asks), instead of failing." },
  { id: "tricky-unclear", group: "tricky", main: true, text: "Make him do the thing from before but more.", lookFor: "There is no 'before': Terra asks or makes a safe guess and says so. No crash, no broken body." },
  // 5 never-taught moves (the "3 + 3" test)
  { id: "nt-cartwheel", group: "never-taught", main: true, neverTaught: true, text: "A stick figure does a cartwheel.", lookFor: "Hands go down one after the other, the legs swing over the top, he lands on his feet. Bones never stretch; the whole move looks natural." },
  { id: "nt-robot-dance", group: "never-taught", main: true, neverTaught: true, text: "A stick figure does a robot dance.", lookFor: "Sharp, stiff poses with short holds (arms at right angles, head ticks), with a beat. Not just a robot walk." },
  { id: "nt-tiptoe", group: "never-taught", main: true, neverTaught: true, text: "A stick figure tiptoes across the room.", lookFor: "High heels-up steps, small careful strides, arms lifted for balance, slow and quiet. Feet don't slide." },
  { id: "nt-victory", group: "never-taught", main: true, neverTaught: true, text: "A stick figure does a victory celebration.", lookFor: "Fists up, a jump or a fist pump, big happy energy; anticipation before the jump, settles at the end." },
  { id: "nt-new-power", group: "never-taught", main: true, neverTaught: true, text: "A stick figure throws a spinning ball of purple energy that bursts into stars.", lookFor: "A wind-up and throw; a purple glowing ball travels and spins; it bursts into star shapes. The power is original (not just recolored fire)." },
  // Originals (Arthur, 2026-10-06) — extra, each must come out right from the engine's rules
  { id: "orig-thunderstorm", group: "original", main: false, text: "A stick figure stands in a thunderstorm with rain and lightning.", lookFor: "Dark sky, slanted falling rain with splashes, lightning flashes now and then; the figure is on the ground, maybe shielding his face." },
  { id: "orig-spike", group: "original", main: false, text: "One tall spike on a gray background.", lookFor: "Exactly one tall spike standing on the ground, on a gray background. Nothing else added." },
  { id: "orig-effect", group: "original", main: false, text: "A stick figure is surrounded by floating glowing pink bubbles.", lookFor: "An original effect (bubbles were never taught): round pink glowing bubbles drift up around him and pop; they move smoothly every picture." },
  { id: "orig-symbol", group: "original", main: false, text: "A stick figure walks while holding a red umbrella.", lookFor: "An original object (an umbrella symbol) held in a hand the whole walk, moving with the hand." },
  { id: "orig-key-pose", group: "original", main: false, text: "A stick figure strikes a superhero pose with his fists on his hips.", lookFor: "An original key pose: chest out, feet apart, both fists on the hips; he moves into it naturally and holds it (breathing, not frozen)." },
  { id: "orig-background-color", group: "original", main: false, followUpOf: "wave", text: "Change the background color to light gray.", lookFor: "Only the page color changes (canvasColor light gray); the wave is the same as before." },
  { id: "orig-8fps", group: "original", main: false, followUpOf: "robot-then-tired", text: "Make it 8 FPS.", lookFor: "The same animation remade at 8 frames per second, same timing in seconds, just fewer pictures. Still looks right." },
];

export const BENCH_MAIN_COUNT = BENCH_PROMPTS.filter((p) => p.main).length;
export const findBenchPrompt = (id: string) => BENCH_PROMPTS.find((p) => p.id === id);
