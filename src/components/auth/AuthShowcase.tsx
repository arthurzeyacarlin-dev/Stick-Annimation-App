import type { CSSProperties } from "react";
import styles from "./AuthScreen.module.css";

// The moving picture on the first screen: a hand-made sample (two stick figures on a timeline) until a real
// AI Animator clip replaces it. Pure drawing: it touches no account, no saving and no animation engine.
type Pose = { x: number; y: number; lean: number; front: [number, number]; back: [number, number]; legA: [number, number]; legB: [number, number] };
type Key = { at: number; pose: Pose };

const FRAMES = 36;
const LIMB = 31;
const TORSO = 60;
const stance = (x: number): Pose => ({ x, y: 192, lean: 8, front: [60, 122], back: [22, 108], legA: [35, -5], legB: [-5, -38] });

const hero: Key[] = [
  { at: 0, pose: stance(112) },
  { at: 0.18, pose: { x: 205, y: 196, lean: 22, front: [72, 135], back: [-42, 38], legA: [70, 5], legB: [-25, -84] } },
  { at: 0.34, pose: { x: 278, y: 207, lean: 30, front: [14, 100], back: [-30, 42], legA: [50, -20], legB: [-20, -60] } },
  { at: 0.44, pose: { x: 320, y: 178, lean: -8, front: [100, 125], back: [-32, 40], legA: [15, -5], legB: [-25, -40] } },
  { at: 0.58, pose: { x: 326, y: 188, lean: -3, front: [132, 165], back: [-24, 44], legA: [20, -8], legB: [-18, -30] } },
  { at: 1, pose: { x: 332, y: 192, lean: 4, front: [64, 120], back: [18, 104], legA: [32, -6], legB: [-8, -36] } },
];
const rival: Key[] = [
  { at: 0, pose: stance(486) },
  { at: 0.18, pose: stance(452) },
  { at: 0.34, pose: { ...stance(410), lean: 12 } },
  { at: 0.44, pose: { x: 385, y: 192, lean: 15, front: [52, 110], back: [20, 96], legA: [34, -6], legB: [-8, -36] } },
  { at: 0.58, pose: { x: 468, y: 116, lean: -58, front: [-120, -150], back: [-70, -105], legA: [42, 74], legB: [12, 50] } },
  { at: 0.76, pose: { x: 558, y: 158, lean: -96, front: [-145, -165], back: [-105, -130], legA: [70, 92], legB: [38, 78] } },
  { at: 0.88, pose: { x: 592, y: 232, lean: -98, front: [-110, -92], back: [-82, -90], legA: [-82, -88], legB: [-96, -84] } },
  { at: 1, pose: { x: 596, y: 234, lean: -98, front: [-104, -90], back: [-84, -90], legA: [-84, -90], legB: [-94, -86] } },
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const mixPair = (a: [number, number], b: [number, number], t: number): [number, number] => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

function poseAt(keys: Key[], time: number): Pose {
  const next = Math.max(1, keys.findIndex((key) => key.at >= time));
  const from = keys[next - 1], to = keys[next];
  const t = ease((time - from.at) / (to.at - from.at || 1));
  return {
    x: mix(from.pose.x, to.pose.x, t), y: mix(from.pose.y, to.pose.y, t), lean: mix(from.pose.lean, to.pose.lean, t),
    front: mixPair(from.pose.front, to.pose.front, t), back: mixPair(from.pose.back, to.pose.back, t),
    legA: mixPair(from.pose.legA, to.pose.legA, t), legB: mixPair(from.pose.legB, to.pose.legB, t),
  };
}

const n = (value: number) => value.toFixed(1);

function figure(pose: Pose, facing: 1 | -1) {
  const turn = (deg: number) => (deg * facing * Math.PI) / 180;
  const step = (x: number, y: number, deg: number, length: number) => [x + Math.sin(turn(deg)) * length, y + Math.cos(turn(deg)) * length] as const;
  const neck = [pose.x + Math.sin(turn(pose.lean)) * TORSO, pose.y - Math.cos(turn(pose.lean)) * TORSO] as const;
  const head = [neck[0] + Math.sin(turn(pose.lean)) * 19, neck[1] - Math.cos(turn(pose.lean)) * 19] as const;
  const limb = (x: number, y: number, [a, b]: [number, number], length: number) => {
    const joint = step(x, y, a, length), end = step(joint[0], joint[1], b, length);
    return `M${n(x)} ${n(y)}L${n(joint[0])} ${n(joint[1])}L${n(end[0])} ${n(end[1])}`;
  };
  const shoulderY = neck[1] + 5;
  return {
    head,
    path: `M${n(neck[0])} ${n(neck[1])}L${n(pose.x)} ${n(pose.y)}${limb(neck[0], shoulderY, pose.back, 28)}${limb(neck[0], shoulderY, pose.front, 28)}${limb(pose.x, pose.y, pose.legB, LIMB)}${limb(pose.x, pose.y, pose.legA, LIMB)}`,
  };
}

const frames = Array.from({ length: FRAMES }, (_, index) => {
  const time = index / (FRAMES - 1);
  return { index, hero: figure(poseAt(hero, time), 1), rival: figure(poseAt(rival, time), -1) };
});
const KEY_FRAMES = new Set([0, 6, 12, 15, 20, 27, 31, 35]);
const IMPACT = 15;

export function AuthShowcase() {
  return (
    <div className={styles.showcase} aria-hidden="true">
      <svg className={styles.stage} viewBox="0 0 680 290" focusable="false">
        <path className={styles.ground} d="M36 252H644" />
        {frames.map((frame) => (
          <g key={frame.index} className={`${styles.frame} ${frame.index === IMPACT ? styles.frameStill : ""}`} style={{ "--i": frame.index } as CSSProperties}>
            {[frame.hero, frame.rival].map((body, index) => (
              <g key={index}><circle cx={n(body.head[0])} cy={n(body.head[1])} r="16" /><path d={body.path} /></g>
            ))}
          </g>
        ))}
      </svg>
      <div className={styles.timeline}>
        <div className={styles.cells} style={{ "--frames": FRAMES } as CSSProperties}>
          {frames.map((frame) => <span key={frame.index} data-key={KEY_FRAMES.has(frame.index) || undefined} />)}
          <i className={styles.playhead} />
        </div>
      </div>
    </div>
  );
}
