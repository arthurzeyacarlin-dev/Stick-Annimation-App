// THE MOTION LIBRARY (SPEC-0025): real motions Kimodo made, saved so a repeat is instant and free. Each clip = 24 fps frames of
// 14 joints (meters, y up), as captured from Kimodo's SOMA skeleton. New sentences get a live Kimodo call (Modal) and are saved.
import fall from "./motions/fall.json" with { type: "json" };
import sweep from "./motions/sweep.json" with { type: "json" };
import dig from "./motions/dig.json" with { type: "json" };
import passA from "./motions/passA.json" with { type: "json" };
import fightA from "./motions/fightA.json" with { type: "json" };
import punchA from "./motions/punchA.json" with { type: "json" };
import punchB from "./motions/punchB.json" with { type: "json" };
import dPunch from "./motions/d-punch.json" with { type: "json" };
import dGethit from "./motions/d-gethit.json" with { type: "json" };

import dBlockClip from "./motions/d-block.json" with { type: "json" };
import dBlockhitClip from "./motions/d-blockhit.json" with { type: "json" };
import dComboClip from "./motions/d-combo.json" with { type: "json" };
import dGutpunchedClip from "./motions/d-gutpunched.json" with { type: "json" };
import dKickClip from "./motions/d-kick.json" with { type: "json" };
import dKnockdownClip from "./motions/d-knockdown.json" with { type: "json" };
import dPointClip from "./motions/d-point.json" with { type: "json" };
import dPushClip from "./motions/d-push.json" with { type: "json" };
import dPushedClip from "./motions/d-pushed.json" with { type: "json" };
import dRpsClip from "./motions/d-rps.json" with { type: "json" };
import dRps2Clip from "./motions/d-rps2.json" with { type: "json" };
import dShrugClip from "./motions/d-shrug.json" with { type: "json" };
import dUppercutClip from "./motions/d-uppercut.json" with { type: "json" };
import dWaveClip from "./motions/d-wave.json" with { type: "json" };

import dHighfiveClip from "./motions/d-highfive.json" with { type: "json" };

import dHighfive2Clip from "./motions/d-highfive2.json" with { type: "json" };

import dJabClip from "./motions/d-jab.json" with { type: "json" };
import dRoundhouseClip from "./motions/d-roundhouse.json" with { type: "json" };
import rKickClip from "./motions/r-kick.json" with { type: "json" };
import rKickdownClip from "./motions/r-kickdown.json" with { type: "json" };
import rPunchClip from "./motions/r-punch.json" with { type: "json" };
import rUppercutClip from "./motions/r-uppercut.json" with { type: "json" };

import rComboClip from "./motions/r-combo.json" with { type: "json" };
import rKnockoutClip from "./motions/r-knockout.json" with { type: "json" };
import rPushClip from "./motions/r-push.json" with { type: "json" };
import rPushfallClip from "./motions/r-pushfall.json" with { type: "json" };
import rRoundhouseClip from "./motions/r-roundhouse.json" with { type: "json" };

import rJabClip from "./motions/r-jab.json" with { type: "json" };

import sComboAClip from "./motions/s-combo-a.json" with { type: "json" };
import sComboBClip from "./motions/s-combo-b.json" with { type: "json" };
import sHookKoAClip from "./motions/s-hook-ko-a.json" with { type: "json" };
import sHookKoBClip from "./motions/s-hook-ko-b.json" with { type: "json" };
import sJabAClip from "./motions/s-jab-a.json" with { type: "json" };
import sJabBClip from "./motions/s-jab-b.json" with { type: "json" };
import sJabjabcrossAClip from "./motions/s-jabjabcross-a.json" with { type: "json" };
import sJabjabcrossBClip from "./motions/s-jabjabcross-b.json" with { type: "json" };
import sKickAClip from "./motions/s-kick-a.json" with { type: "json" };
import sKickBClip from "./motions/s-kick-b.json" with { type: "json" };
import sKickKoAClip from "./motions/s-kick-ko-a.json" with { type: "json" };
import sKickKoBClip from "./motions/s-kick-ko-b.json" with { type: "json" };
import sPunchAClip from "./motions/s-punch-a.json" with { type: "json" };
import sPunchBClip from "./motions/s-punch-b.json" with { type: "json" };
import sPunchkickAClip from "./motions/s-punchkick-a.json" with { type: "json" };
import sPunchkickBClip from "./motions/s-punchkick-b.json" with { type: "json" };
import sShoveAClip from "./motions/s-shove-a.json" with { type: "json" };
import sShoveBClip from "./motions/s-shove-b.json" with { type: "json" };
import sUppercutAClip from "./motions/s-uppercut-a.json" with { type: "json" };
import sUppercutBClip from "./motions/s-uppercut-b.json" with { type: "json" };



import tDoublefiveAClip from "./motions/t-doublefive-a.json" with { type: "json" };
import tDoublefiveBClip from "./motions/t-doublefive-b.json" with { type: "json" };
import tFistbumpAClip from "./motions/t-fistbump-a.json" with { type: "json" };
import tFistbumpBClip from "./motions/t-fistbump-b.json" with { type: "json" };
import tHandshakeAClip from "./motions/t-handshake-a.json" with { type: "json" };
import tHandshakeBClip from "./motions/t-handshake-b.json" with { type: "json" };
import tHighfiveAClip from "./motions/t-highfive-a.json" with { type: "json" };
import tHighfiveBClip from "./motions/t-highfive-b.json" with { type: "json" };

import tFistbump2AClip from "./motions/t-fistbump2-a.json" with { type: "json" };
import tFistbump2BClip from "./motions/t-fistbump2-b.json" with { type: "json" };
import tJumpfiveAClip from "./motions/t-jumpfive-a.json" with { type: "json" };
import tJumpfiveBClip from "./motions/t-jumpfive-b.json" with { type: "json" };

export type KimodoFrame = Record<string, number[]>;
export type KimodoClip = { id: string; sentence: string; fps: number; frames: KimodoFrame[]; times: number[]; hits?: number[]; limbs?: string[]; stage?: { S: number; side: number; floor: number }; touch?: { from: number; to: number } };

// TRUE TIMES (Oct 16: a hand "popped" in rock-paper-scissors): Kimodo makes 30 pictures a second; the converter kept the NEAREST
// one for each of our 24, so every 4th step skipped ahead (Python rounding: 0, 1, 2, 4, 5, 6, 8…) — a tiny stutter in every clip.
// Each saved picture keeps its REAL time (its Kimodo picture / 30), so the motion plays at Kimodo's own even speed.
const pyRound = (x: number) => { const f = Math.floor(x), d = x - f; return d > 0.5 + 1e-9 ? f + 1 : d < 0.5 - 1e-9 ? f : f % 2 === 0 ? f : f + 1; };
const clip = (id: string, sentence: string, data: { fps: number; srcFps?: number; blended?: boolean; hits?: number[]; limbs?: string[]; stage?: { S: number; side: number; floor: number }; touch?: { from: number; to: number }; frames: KimodoFrame[] }): KimodoClip => ({
  id, sentence, fps: data.fps, frames: data.frames, ...(data.hits ? { hits: data.hits } : {}), ...(data.limbs ? { limbs: data.limbs } : {}), ...(data.stage ? { stage: data.stage } : {}), ...(data.touch ? { touch: data.touch } : {}),
  times: data.frames.map((_, i) => (data.srcFps && data.srcFps !== data.fps && !data.blended ? pyRound((i * data.srcFps) / data.fps) / data.srcFps : i / data.fps)),
});
export const MOTIONS: KimodoClip[] = [
  clip("fall", "walks forward, trips over something, stumbles and falls flat on the ground", fall as never),
  clip("sweep", "sweeps the floor with a broom held in both hands", sweep as never),
  clip("dig", "digs a hole with a shovel, tossing the dirt to the side", dig as never),
  clip("throw-catch", "throws a ball and catches it with both hands", passA as never),
  clip("box", "boxes an opponent: jabs, hooks, blocks, dodges, uppercut", fightA as never),
  // (a PAIR made by the director with live Kimodo, Oct 16: the hook lands at 1.33 s; the defender's "gets punched" starts at 2.0 s,
  // so the attacker starts 0.67 s later — the director lines them up and moves the defender so the fist meets the head)
  clip("punch-attack", "a boxer throws a quick left jab, then a powerful right hook to the opponent's head", punchA as never),
  // (Phase 1 duo clips, Oct 16: each person made alone by live Kimodo; kimodo/director.ts directBeats lines their real moments up)
  clip("d-punch", "one fast straight right punch at head height, back to guard", dPunch as never),
  clip("d-gethit", "in guard, gets punched hard in the face, head snaps back, staggers back two steps", dGethit as never),
  clip("d-block", "A person raises both forearms in front of the face to block a punch. A person blocks another punch with the forearms. A ", dBlockClip as never),
  clip("d-blockhit", "A person throws a straight right punch forward. A person throws a straight left punch forward. A person stands in a figh", dBlockhitClip as never),
  clip("d-combo", "A person throws a straight left punch forward. A person throws a straight right punch forward. A person throws a straigh", dComboClip as never),
  clip("d-gutpunched", "A person stands in a fighting guard. A person gets kicked in the stomach, doubles over holding the stomach and steps bac", dGutpunchedClip as never),
  clip("d-kick", "A person stands in a fighting guard. A person kicks forward hard with the right leg at stomach height, then puts the foo", dKickClip as never),
  clip("d-knockdown", "A person stands in a fighting guard. A person gets hit hard on the chin, flies backward and falls flat on the back.", dKnockdownClip as never),
  clip("d-point", "A person stands. A person points forward with the right arm straight out at someone, then laughs. A person stands.", dPointClip as never),
  clip("d-push", "A person stands facing forward. A person pushes forward hard with both hands at chest height. A person stands still.", dPushClip as never),
  clip("d-pushed", "A person stands facing forward. A person gets pushed in the chest and stumbles backward three steps, arms waving.", dPushedClip as never),
  clip("d-rps", "A person plays rock paper scissors: shakes the right fist up and down three times in front of the body, then throws the ", dRpsClip as never),
  clip("d-rps2", "A person plays rock paper scissors: shakes the right fist up and down three times in front of the body, then throws the ", dRps2Clip as never),
  clip("d-shrug", "A person stands. A person looks surprised, then shrugs with both hands open. A person stands.", dShrugClip as never),
  clip("d-uppercut", "A person stands in a fighting guard. A person throws a powerful right uppercut upward. A person stands in a fighting gua", dUppercutClip as never),
  clip("d-wave", "A person stands. A person waves hello with the right hand raised high, smiling. A person stands.", dWaveClip as never),
  clip("d-highfive", "A person walks forward two steps. A person gives a high five with the right hand raised high in front, slapping it forwa", dHighfiveClip as never),
  clip("d-highfive2", "A person walks forward two steps. A person gives a high five with the right hand raised high in front, slapping it forwa", dHighfive2Clip as never),
  clip("d-jab", "A person stands in a fighting guard. A person throws one quick light left jab forward at head height and pulls it back. ", dJabClip as never),
  clip("d-roundhouse", "A person stands in a fighting guard. A person throws a powerful roundhouse kick with the right leg to head height, then ", dRoundhouseClip as never),
  clip("r-kick", "r-kick", rKickClip as never),
  clip("r-kickdown", "r-kickdown", rKickdownClip as never),
  clip("r-punch", "r-punch", rPunchClip as never),
  clip("r-uppercut", "r-uppercut", rUppercutClip as never),
  clip("r-combo", "r-combo", rComboClip as never),
  clip("r-knockout", "r-knockout", rKnockoutClip as never),
  clip("r-push", "r-push", rPushClip as never),
  clip("r-pushfall", "r-pushfall", rPushfallClip as never),
  clip("r-roundhouse", "r-roundhouse", rRoundhouseClip as never),
  clip("r-jab", "r-jab", rJabClip as never),
  clip("s-combo-a", "A person stands in a fighting guard facing the opponent. A person steps in, throws a fast left jab to the opponent's fac", sComboAClip as never),
  clip("s-combo-b", "s-combo reaction", sComboBClip as never),
  clip("s-hook-ko-a", "A person stands in a fighting guard facing the opponent. A person steps in, winds up and throws a full-power right hook ", sHookKoAClip as never),
  clip("s-hook-ko-b", "s-hook-ko reaction", sHookKoBClip as never),
  clip("s-jab-a", "A person stands in a fighting guard facing the opponent. A person steps in, throws a quick light left jab to the opponen", sJabAClip as never),
  clip("s-jab-b", "s-jab reaction", sJabBClip as never),
  clip("s-jabjabcross-a", "A person stands in a fighting guard facing the opponent. A person steps in, throws a quick light left jab to the opponen", sJabjabcrossAClip as never),
  clip("s-jabjabcross-b", "s-jabjabcross reaction", sJabjabcrossBClip as never),
  clip("s-kick-a", "A person stands in a fighting guard facing the opponent. A person steps in, winds up and throws a hard powerful front ki", sKickAClip as never),
  clip("s-kick-b", "s-kick reaction", sKickBClip as never),
  clip("s-kick-ko-a", "A person stands in a fighting guard facing the opponent. A person steps in, winds up and throws a full-power front kick ", sKickKoAClip as never),
  clip("s-kick-ko-b", "s-kick-ko reaction", sKickKoBClip as never),
  clip("s-punch-a", "A person stands in a fighting guard facing the opponent. A person steps in, winds up and throws a hard powerful right cr", sPunchAClip as never),
  clip("s-punch-b", "s-punch reaction", sPunchBClip as never),
  clip("s-punchkick-a", "A person stands in a fighting guard facing the opponent. A person steps in, throws a strong right cross to the opponent'", sPunchkickAClip as never),
  clip("s-punchkick-b", "s-punchkick reaction", sPunchkickBClip as never),
  clip("s-shove-a", "A person stands in a fighting guard facing the opponent. A person steps in, winds up and gives a hard powerful two-hande", sShoveAClip as never),
  clip("s-shove-b", "s-shove reaction", sShoveBClip as never),
  clip("s-uppercut-a", "A person stands in a fighting guard facing the opponent. A person steps in, winds up and throws a full-power right upper", sUppercutAClip as never),
  clip("s-uppercut-b", "s-uppercut reaction", sUppercutBClip as never),

  clip("t-doublefive-a", "t-doublefive", tDoublefiveAClip as never),
  clip("t-doublefive-b", "t-doublefive", tDoublefiveBClip as never),
  clip("t-fistbump-a", "t-fistbump", tFistbumpAClip as never),
  clip("t-fistbump-b", "t-fistbump", tFistbumpBClip as never),
  clip("t-handshake-a", "t-handshake", tHandshakeAClip as never),
  clip("t-handshake-b", "t-handshake", tHandshakeBClip as never),
  clip("t-highfive-a", "t-highfive", tHighfiveAClip as never),
  clip("t-highfive-b", "t-highfive", tHighfiveBClip as never),
  clip("t-fistbump2-a", "t-fistbump2", tFistbump2AClip as never),
  clip("t-fistbump2-b", "t-fistbump2", tFistbump2BClip as never),
  clip("t-jumpfive-a", "t-jumpfive", tJumpfiveAClip as never),
  clip("t-jumpfive-b", "t-jumpfive", tJumpfiveBClip as never),
  clip("punch-hit", "a boxer in guard gets punched hard in the face, head snaps back, staggers back two steps, recovers", punchB as never),
];

// Until live Kimodo is on (dad: Modal card + Meta's yes), a sentence is matched to the closest saved motion by its words.
const WORDS: [string, RegExp][] = [
  ["fall", /\b(fall|falls|fell|trip|trips|stumbl\w*|knocked down|collaps\w*)\b/i],
  ["sweep", /\b(sweep\w*|broom|mop\w*|rake\w*)\b/i],
  ["dig", /\b(dig\w*|shovel\w*|spade)\b/i],
  ["throw-catch", /\b(throw\w*|catch\w*|toss\w*|pass\w*|ball)\b/i],
  ["box", /\b(box\w*|punch\w*|fight\w*|jab\w*|hook\w*|kick\w*|brawl\w*)\b/i],
];
export function findMotion(sentence: string): KimodoClip {
  const exact = MOTIONS.find((m) => m.id === sentence.trim()); // (the director names a saved clip by its id)
  if (exact) return exact;
  const hit = WORDS.find(([, re]) => re.test(sentence));
  return MOTIONS.find((m) => m.id === (hit ? hit[0] : "fall")) ?? MOTIONS[0];
}
