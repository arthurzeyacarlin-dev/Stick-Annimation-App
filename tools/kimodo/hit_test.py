# HITS WITH ZERO GLUE (Oct 17 mixed round, PM v5, Arthur OK): punch, kick, push. Arthur on the hand-target punch: "no speed change,
# no anticipation, no wound-up strong fast strike" — my 2-picture pre-target had forced a slow 2.5 m/s strike. So here BOTH
# people are FREE Kimodo (no targets at all: Kimodo's own wind-up and snap, like the shadow-boxing Arthur loved); this script only
# CHOOSES (3 attacker takes × 3 receiver takes) and LINES UP: one rigid placement (the receiver's struck part on the attacker's
# real fist/foot at the hit) and one whole-clip time shift (its reaction starts on the hit picture). Run:
#   python3 hit_test.py <id> punch|kick|push "<attacker words>" "<receiver words>" <seconds> <seed>
import json, math, os, sys
import numpy as np
import modal

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from make_clips import to_json
from touch_test import K, arr, RUNS
J = {k: i for i, k in enumerate(K)}
LIMB = {"punch": "RightHand", "kick": "RightFoot", "push": "RightHand"}
PART = {"punch": ("Head", 0.10), "kick": ("Hips", 0.14), "push": ("Neck1", 0.14)}
MIN_SPEED = {"punch": 3.0, "kick": 3.0, "push": 2.0}  # (Kimodo's own speed; the timing pass below makes the strike ~1.6x faster)


def front(A):  # (the body's real front: −perp of the hips' left→right line, R2b)
    v = A[:, J["RightLeg"]] - A[:, J["LeftLeg"]]; f = np.stack([v[:, 2], -v[:, 0]], 1)
    return f / np.maximum(1e-6, np.linalg.norm(f, axis=1, keepdims=True))


def strike(A, kind):
    # the attacker's real strike: the limb's fastest moment after 0.5 s; the HIT = the first picture after it under half that speed
    # (arrival); WIND-UP = how far the limb first goes BACK (against its strike direction) in the 0.7 s before the speed peak
    l = A[:, J[LIMB[kind]]]; sp = np.r_[0, np.linalg.norm(np.diff(l, axis=0), axis=1) * 24]
    lo = 12; pk = lo + int(np.argmax(sp[lo:len(sp) - 4])); hit = pk
    while hit < len(sp) - 1 and sp[hit] > 0.5 * sp[pk]: hit += 1
    fr = front(A)[pk]; fwd = ((l - A[:, J["Hips"]])[:, [0, 2]] * fr).sum(1)
    k0 = max(0, pk - 17); back = float(fwd[k0] - fwd[k0:pk + 1].min())
    return {"hit": hit, "peak": pk, "speed": float(sp[pk]), "windup": back, "front": fr.tolist()}


def reaction(B, kind):
    # the receiver's real reaction: the struck part moving backward (against its own front); ONSET = the first picture over half
    # its top backward speed after 0.5 s; FLINCH = how much that part moved in the 0.3 s before the onset (should be ~nothing)
    p = B[:, J[PART[kind][0]]]; fr = front(B)
    bv = np.r_[0, -(np.diff(p[:, [0, 2]], axis=0) * fr[1:]).sum(1) * 24]
    lo = 12; top = lo + int(np.argmax(bv[lo:len(bv) - 4])); on = top
    while on > lo and bv[on - 1] > 0.5 * bv[top]: on -= 1
    f0 = max(0, on - 7); flinch = float(np.linalg.norm(p[on] - p[f0]))
    return {"onset": on, "back_speed": float(bv[top]), "flinch": flinch}


def place(Bf, att, A, rec, kind, frames_B):
    # receiver → attacker world: turn so its front faces the attacker, move so its struck part sits on the limb (+ body radius)
    hit, fa = att["hit"], np.array(att["front"]); tgt = A[hit, J[LIMB[kind]]]
    fb = front(Bf)[rec["onset"]]; th = math.atan2(-fa[1], -fa[0]) - math.atan2(fb[1], fb[0]); c, s = math.cos(th), math.sin(th)
    rot = lambda x, z: (c * x - s * z, s * x + c * z)
    part = Bf[rec["onset"], J[PART[kind][0]]]; px, pz = rot(part[0], part[2])
    goal = tgt + np.array([fa[0], 0, fa[1]]) * PART[kind][1]; dx, dz = goal[0] - px, goal[2] - pz
    out = []
    for f in frames_B:
        g = {}
        for k, (x, y, z) in f.items():
            X, Z = rot(x, z); g[k] = [round(X + dx, 3), y, round(Z + dz, 3)]
        out.append(g)
    return out


def timing(fa, fb, st):
    # THE TIMING PASS ON THE SHARED CLOCK (Arthur: "no speed change, no anticipation, no wound-up strong fast strike"): the 12
    # principles — a slower wind-up, a short hold on the loaded pose, a FAST strike, a tiny impact hold, then normal. The SAME clock
    # for both people (their relation never changes — no glue); only WHEN Kimodo's pictures show changes, blended between pictures.
    pk, hit = st["peak"], st["hit"]; load = max(0, pk - 5); w0 = max(0, pk - 17)
    def rate(c):  # (source pictures per output picture)
        if w0 <= c < load: return 0.8
        if load <= c < load + 1: return 0.45
        if load + 1 <= c < hit: return 1.6
        if hit <= c < hit + 2: return 0.45
        return 1.0
    src, c = [], 0.0
    n = min(len(fa), len(fb))
    while c < n - 1: src.append(c); c += rate(int(c))
    lerp = lambda F, x: {k: [round(F[int(x)][k][j] + (F[min(n - 1, int(x) + 1)][k][j] - F[int(x)][k][j]) * (x - int(x)), 3) for j in range(3)] for k in F[0]}
    newhit = next((i for i, x in enumerate(src) if x >= hit), hit)
    return [lerp(fa, x) for x in src], [lerp(fb, x) for x in src], newhit


def main():
    rid, kind, aw, rw, sec, seed = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5]), int(sys.argv[6])
    fn = modal.Function.from_name("diamond-kimodo", "generate_follow")
    r = fn.remote({"leader": aw, "follower": rw, "seconds": sec, "seed": seed, "seeds": 3, "leaders": 3, "freeOnly": True})
    if not r.get("ok") or "leaders" not in r: print("FAILED", {k: v for k, v in r.items() if k not in ("leaders", "drafts")}); return
    atts = [to_json(b) for b in r["leaders"]]; recs = [to_json(b) for b in r["drafts"]]
    best = None
    for ai, a in enumerate(atts):
        A = arr(a["frames"]); st = strike(A, kind)
        for bi, b in enumerate(recs):
            B = arr(b["frames"]); re = reaction(B, kind)
            shift = st["hit"] + 1 - re["onset"]          # (+: the receiver waits that many pictures; −: its start is cut)
            fb = b["frames"][-shift:] if shift < 0 else [b["frames"][0]] * shift + b["frames"]
            n = min(len(a["frames"]), len(fb)); fb = fb[:n]
            rec2 = dict(re, onset=re["onset"] + shift)
            placed = place(arr(fb), st, A, rec2, kind, fb); P = arr(placed)
            hips = np.linalg.norm((P[:st["hit"], J["Hips"]] - A[:st["hit"], J["Hips"]])[:, [0, 2]], axis=1) if st["hit"] > 0 else np.array([1.0])
            stp = lambda X: np.linalg.norm(np.diff(X, axis=0), axis=2)
            tele = sum(int(((s_[1:-1] > 3 * np.maximum(s_[:-2], s_[2:])) & (s_[1:-1] > 0.05)).sum()) for s_ in (stp(A[:n]), stp(P)))
            g = {"windup_cm": round(st["windup"] * 100, 1), "speed_mps": round(st["speed"], 1), "flinch_cm": round(re["flinch"] * 100, 1),
                 "react_mps": round(re["back_speed"], 1), "wait_pictures": max(0, shift), "closest_hips_cm": round(float(hips.min() * 100), 1), "teleport": tele}
            g["PASS"] = bool(g["windup_cm"] >= 8 and g["speed_mps"] >= MIN_SPEED[kind] and g["flinch_cm"] <= 4 and g["wait_pictures"] <= 3 and g["closest_hips_cm"] >= 45 and tele == 0)
            score = (g["PASS"], g["windup_cm"] / 10 + g["speed_mps"] - g["flinch_cm"] / 2 - g["wait_pictures"] / 4)
            if best is None or score > best[0]: best = (score, ai, bi, g, a, placed, st)
    (ok, _), ai, bi, g, a, placed, st = best
    for k_ in ("teleport",): pass
    fa2, fb2, newhit = timing(a["frames"], placed, st)
    sp2 = np.linalg.norm(np.diff(arr(fa2)[:, J[LIMB[kind]]], axis=0), axis=1) * 24; g["speed_after_timing_mps"] = round(float(sp2[max(0, newhit - 4):newhit + 1].max()), 1)
    a = dict(a, frames=fa2); placed = fb2; st = dict(st, hit=newhit)
    hl, hr = np.array(a["frames"][st["hit"]]["Hips"]), np.array(placed[min(st["hit"], len(placed) - 1)]["Hips"])
    th = math.atan2(hr[0] - hl[0], hr[2] - hl[2]) + math.radians(12)
    tall = a["frames"][0]["HeadEnd"][1] - min(a["frames"][0]["LeftFoot"][1], a["frames"][0]["RightFoot"][1]); H = 420; scale = H / max(0.5, tall)
    stage = {"originX": 960 - 0.5 * float(np.linalg.norm(hr[[0, 2]] - hl[[0, 2]])) * scale, "S": 0, "side": 1, "floor": 0, "theta": th, "scale": scale}
    clip = lambda fr: {"id": "t", "sentence": "", "fps": 24, "frames": fr, "times": [i / 24 for i in range(len(fr))]}
    plan = {"id": rid, "title": rid, "height": H, "groundY": 900, "pace": "natural", "effects": [],
            "characters": [{"id": "a", "name": "Red", "x": 700, "facing": "right", "look": {"color": "#dc2626", "headFilled": True}, "actions": [{"move": "realMotion", "params": {"clip": clip(a["frames"]), "stage": stage}}]},
                           {"id": "b", "name": "Blue", "x": 1200, "facing": "left", "look": {"color": "#1d4ed8", "headFilled": True}, "actions": [{"move": "realMotion", "params": {"clip": clip(placed), "stage": stage}}]}]}
    json.dump({"id": f"s50-{rid}", "prompt": f"{aw} / {rw}", "viaChat": False, "result": {"ok": True, "plan": plan, "by": "hit-test", "gate": g, "pick": f"attacker {ai} receiver {bi}"}}, open(f"{RUNS}/s50-{rid}.json", "w"))
    print(json.dumps({"id": rid, "PASS": ok, "pick": f"attacker {ai} receiver {bi}", "gate": g, "secs": r["secs"]}))


if __name__ == "__main__":
    main()
