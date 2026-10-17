# HITS MADE TO A DECIDED BEAT (Oct 17, PM v5 + Fable, Arthur OK — "decide WHEN first, like a director with a stopwatch").
# Arthur's main problem was TIMING (a reaction before the punch, a kick with no reaction): the receiver used to be made WITHOUT
# knowing when it would be hit and the engine guessed the moment afterwards. Now:
#  1. the ATTACKER is made with Kimodo's timed steps (guard → strike → back to guard); its real hit is measured (limb arrival)
#     and must fall inside the strike step — that hit time IS the beat;
#  2. the RECEIVER is made TO that beat: Kimodo's timed steps ("stands still in guard" for exactly t_hit, then the reaction) + a
#     hips path that stays still until the hit and then knocks back only as far as the move is strong (push ≤1.5 steps);
#  3. CHECK, never stretch: the receiver's real reaction must start within 2 pictures of the hit, no flinch before, knock-back
#     ≤ its cap; else the engine makes new takes (≤2 tries) — if still off, the video is marked FAIL, never hidden.
# Then ONE placement (struck part on the real fist/foot), the shared-clock timing pass, camera straight across (0°).
#   python3 beat_hits.py <id> punch|kick|push "<strike sentence>" "<reaction sentence>" <seed>
import json, math, os, sys
import numpy as np
import modal

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from make_clips import to_json
from touch_test import K, arr, RUNS
from hit_test import J, LIMB, PART, front, strike, place, timing

BACK_CAP = {"punch": 0.45, "kick": 0.7, "push": 0.75}     # (metres of knock-back: punch ≤1 step, kick ≤2 small, push ≤1.5)
GUARD = {"punch": "A person stands in a fighting guard.", "kick": "A person stands in a fighting guard.", "push": "A person stands facing forward."}
AFTER = {"punch": "A person returns to a fighting guard.", "kick": "A person puts the foot down and returns to a fighting guard.", "push": "A person stands still."}


def onset_near(B, kind, hit):
    # the receiver's real reaction: its struck part moving backward; ONSET = first picture over 40% of the top backward speed,
    # searched only around the planned hit (−6…+10 pictures) — a guard bob far from the beat can no longer be picked
    p = B[:, J[PART[kind][0]]]; fr = front(B)
    bv = np.r_[0, -(np.diff(p[:, [0, 2]], axis=0) * fr[1:]).sum(1) * 24]
    lo, hi = max(1, hit - 6), min(len(bv) - 1, hit + 10)
    top = lo + int(np.argmax(bv[lo:hi])); on = top
    while on > lo and bv[on - 1] > 0.4 * bv[top]: on -= 1
    f0 = max(0, hit - 7); flinch = float(np.linalg.norm(p[min(hit, len(p) - 1)] - p[f0]))
    moved = float(np.linalg.norm((B[-1, J["Hips"]] - B[0, J["Hips"]])[[0, 2]]))
    return {"onset": on, "back_speed": float(bv[top]), "flinch": flinch, "moved": moved}


def main():
    rid, kind, strike_words, react_words, seed = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
    gen = modal.Function.from_name("diamond-kimodo", "generate")
    # 1. ATTACKER to the plan: guard 1.0 s → strike 1.0 s → back to guard 1.6 s (the hit must land inside the strike step)
    a_prompt = " ".join([GUARD[kind], strike_words.rstrip(".") + ".", AFTER[kind]]); a_durs = [1.0, 1.0, 1.6]
    att = None
    for tryn in range(2):
        r = gen.remote(a_prompt, a_durs, seed + 100 * tryn, None, 3)
        if not r.get("ok"): continue
        for b in r.get("npzs") or [r["npz"]]:
            a = to_json(b); A = arr(a["frames"]); st = strike(A, kind)
            inside = 0.9 * 24 <= st["hit"] <= 2.2 * 24
            score = (inside, st["windup"] * 10 + st["speed"])
            if att is None or score > att[0]: att = (score, a, A, st)
        if att and att[0][0]: break
    (inside, _), a, A, st = att
    t_hit = st["hit"] / 24
    # 2. RECEIVER to the beat: still until t_hit, then the reaction; hips path still, then knocked back ≤ cap (Kimodo 30 fps)
    total = sum(a_durs); fps = 30; fh = int(round(t_hit * fps)); cap = BACK_CAP[kind]
    idx = list(range(0, fh - 1, 3)) + list(range(fh + 3, int(total * fps) - 2, 3))
    pts = [[0.0, 0.0] if f < fh else [0.0, float(-cap * min(1.0, ((f - fh) / (0.6 * fps))) ** 0.6)] for f in idx]
    cons = [{"type": "root2d", "frame_indices": idx, "smooth_root_2d": pts}]
    r_prompt = " ".join([GUARD[kind].replace("stands", "stands still"), react_words.rstrip(".") + "."]); r_durs = [round(t_hit, 2), round(total - t_hit, 2)]
    best = None; tries = 0
    for tryn in range(2):
        tries += 1
        r = gen.remote(r_prompt, r_durs, seed + 1 + 100 * tryn, cons, 3)
        if not r.get("ok"): continue
        for bi, b in enumerate(r.get("npzs") or [r["npz"]]):
            rc = to_json(b); B = arr(rc["frames"]); re = onset_near(B, kind, st["hit"])
            off = re["onset"] - (st["hit"] + 1)
            ok = abs(off) <= 2 and re["flinch"] <= 0.05 and re["moved"] <= cap + 0.25 and re["back_speed"] > 0.5
            score = (ok, -abs(off) - re["flinch"] * 10 + re["back_speed"])
            if best is None or score > best[0]: best = (score, rc, B, re, off)
        if best and best[0][0]: break
    (ok_r, _), rc, B, re, off = best
    n = min(len(a["frames"]), len(rc["frames"])); fb = rc["frames"][:n]; fa = a["frames"][:n]
    placed = place(arr(fb), st, A[:n], dict(re, onset=st["hit"]), kind, fb); P = arr(placed)
    hips = np.linalg.norm((P[:st["hit"], J["Hips"]] - A[:st["hit"], J["Hips"]])[:, [0, 2]], axis=1)
    stp = lambda X: np.linalg.norm(np.diff(X, axis=0), axis=2)
    tele = sum(int(((s_[1:-1] > 3 * np.maximum(s_[:-2], s_[2:])) & (s_[1:-1] > 0.05)).sum()) for s_ in (stp(A[:n]), stp(P)))
    g = {"hit_s": round(t_hit, 2), "hit_in_strike_step": bool(inside), "windup_cm": round(st["windup"] * 100, 1), "speed_mps": round(st["speed"], 1),
         "reaction_off_pictures": int(off), "flinch_cm": round(re["flinch"] * 100, 1), "knockback_m": round(re["moved"], 2), "closest_hips_cm": round(float(hips.min() * 100), 1) if len(hips) else None,
         "teleport": tele, "receiver_tries": tries}
    g["TIMING_OK"] = bool(abs(off) <= 2)
    g["CLEARLY_BROKEN"] = bool(abs(off) > 2 or tele > 0 or (g["closest_hips_cm"] is not None and g["closest_hips_cm"] < 40))
    fa2, fb2, newhit = timing(fa, placed, st)
    hl, hr = np.array(fa2[newhit]["Hips"]), np.array(fb2[min(newhit, len(fb2) - 1)]["Hips"])
    th = math.atan2(hr[0] - hl[0], hr[2] - hl[2])  # (camera straight across the contact line, 0° — Fable: kneeling / contact read in 2D)
    tall = fa[0]["HeadEnd"][1] - min(fa[0]["LeftFoot"][1], fa[0]["RightFoot"][1]); H = 420; scale = H / max(0.5, tall)
    stage = {"originX": 960 - 0.5 * float(np.linalg.norm(hr[[0, 2]] - hl[[0, 2]])) * scale, "S": 0, "side": 1, "floor": 0, "theta": th, "scale": scale}
    clip = lambda fr: {"id": "t", "sentence": "", "fps": 24, "frames": fr, "times": [i / 24 for i in range(len(fr))]}
    plan = {"id": rid, "title": rid, "height": H, "groundY": 900, "pace": "natural", "effects": [],
            "characters": [{"id": "a", "name": "Red", "x": 700, "facing": "right", "look": {"color": "#dc2626", "headFilled": True}, "actions": [{"move": "realMotion", "params": {"clip": clip(fa2), "stage": stage}}]},
                           {"id": "b", "name": "Blue", "x": 1200, "facing": "left", "look": {"color": "#1d4ed8", "headFilled": True}, "actions": [{"move": "realMotion", "params": {"clip": clip(fb2), "stage": stage}}]}]}
    json.dump({"id": f"s50-{rid}", "prompt": f"{a_prompt} / {r_prompt}", "viaChat": False, "result": {"ok": True, "plan": plan, "by": "beat-hits", "gate": g}}, open(f"{RUNS}/s50-{rid}.json", "w"))
    print(json.dumps({"id": rid, **g}))


if __name__ == "__main__":
    main()
