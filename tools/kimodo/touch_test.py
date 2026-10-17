# KIMODO MAKES THE TOUCH — the 1-hour test (Oct 17, PM v5 + Fable + critic, Arthur OK). Run:
#   python3 touch_test.py <id> "<leader words>" "<follower words>" <seconds> <seed> [kind]
# One Modal job (kimodo_modal.generate_follow): leader + the follower's free drafts, then the follower again from the SAME noise
# with HAND-ONLY targets on the leader's real hand path. Here: every take is checked against ITS OWN free draft (what Arthur's eye
# sees — sudden speed changes, not centimetres), the best passing one is placed in the leader's world (one rigid placement, the
# inverse of the one Kimodo was given) and written as a review run for teach.ts render. No warp, no hold, no hand pull, no IK.
import json, math, os, sys
import numpy as np
import modal

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from make_clips import to_json
RUNS = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/runs"
K = ["Hips", "Neck1", "Head", "HeadEnd", "LeftForeArm", "LeftHand", "RightForeArm", "RightHand", "LeftLeg", "LeftShin", "LeftFoot", "RightLeg", "RightShin", "RightFoot"]


def arr(frames): return np.array([[f[k] for k in K] for f in frames], dtype=float)


def check(con, draft, lead, info, hand, fps_src, kind):
    # all on 24-fps pictures; con + lead in the leader's world, draft in its own space
    J = {k: i for i, k in enumerate(K)}; h = J[hand]
    out = {}
    step = lambda A: np.linalg.norm(np.diff(A, axis=0), axis=2)               # per-picture move of every joint
    acc = lambda A: np.linalg.norm(np.diff(A, n=2, axis=0), axis=2)           # per-picture speed change
    # (TELEPORT = a 1-picture jump: a joint moving >3× more than in the pictures before and after it, and >2 cm — seam_check rule;
    # comparing with the draft's top speed was unfair: the follower now really reaches, so its hand legitimately moves more)
    st = step(con); sp = (st[1:-1] > 3 * np.maximum(st[:-2], st[2:])) & (st[1:-1] > 0.02)
    out["teleport"] = int(sp.sum())                                                              # 0
    # (SNAP = a 1-picture speed change of a hand: its acceleration >3× the pictures around it and >1.5 cm/picture² — what the eye
    # sees as a pop; comparing with the draft was unfair again: a standing draft's hand hardly moves)
    ac = acc(con)[:, [J["LeftHand"], J["RightHand"]]]; spk = (ac[1:-1] > 3 * np.maximum(ac[:-2], ac[2:])) & (ac[1:-1] > 0.015)
    out["snap"] = int(spk.sum())                                                                  # 0
    out["bounce_cm"] = round(float((np.ptp(con[:, J["Hips"], 1]) - np.ptp(draft[:, J["Hips"], 1])) * 100), 1)  # ≤2
    m = info["leader"]
    # (THE HOLD = the run of pictures where the hands are within 6 cm; its middle (3 pictures in from each end — the hands arriving
    # and leaving) must stay ≤4 cm; and once the hands have parted (>10 cm) they must never come back under 8 cm — a second grab)
    full = np.linalg.norm(con[:, h] - lead[:, h], axis=1); near = np.where(full < 0.06)[0]
    if len(near) < 8 and kind == "tap": c0 = c1 = int(np.argmin(full)); out["gap_cm"] = [round(float(full.min() * 100), 1)] * 2; out["gap_spread_cm"] = 0.0  # (a quick tap: closest moment)
    elif len(near) < 8: out["gap_cm"] = [round(float(full.min() * 100), 1), 99.0]; out["gap_spread_cm"] = 99.0; c0 = c1 = int(m["touch"] * 24 / fps_src)
    else:
        c0, c1 = int(near.min()), int(near.max()); mid = full[c0 + 3:c1 - 2]
        out["gap_cm"] = [round(float(mid.min() * 100), 1), round(float(mid.max() * 100), 1)]
        out["gap_spread_cm"] = round(float(np.ptp(mid) * 100), 1)
    parted = np.where(full[c0:] > 0.10)[0]
    out["regrab"] = bool(len(parted) and (full[c0 + parted[0]:] < 0.08).any())
    gap = full[c0:c1 + 1]
    if kind == "hold" and c1 - c0 >= 6:  # (pump over the hold run)
        a, b = lead[c0:c1 + 1, h, 1], con[c0:c1 + 1, h, 1]
        best = max(((float(np.corrcoef(a[max(0, -s):len(a) - max(0, s)], b[max(0, s):len(b) - max(0, -s)])[0, 1]), s) for s in (-2, -1, 0, 1, 2)))
        out["pump_corr"], out["pump_lag"] = round(best[0], 2), best[1]
    ok = out["teleport"] == 0 and out["snap"] == 0 and out["bounce_cm"] <= 2 and out["gap_cm"][1] <= 4 and not out["regrab"]
    if kind == "hold": ok = ok and out["gap_spread_cm"] <= 3 and out.get("pump_corr", 1) >= 0.9 and abs(out.get("pump_lag", 0)) <= 1
    # (BOTH PEOPLE'S OWN MOMENT, beat round: each person's slap / bump measured on its own body must land within 2 pictures of the
    # other's; and no second slap into thin air later — the follower's hand never rises again to 80% of its peak away from the beat)
    act = os.environ.get("ACTION", "")
    sig = (lambda X: X[:, h, 1] - X[:, J["Head"], 1]) if act == "highfive" else (lambda X: ((X[:, h] - X[:, J["Hips"]]) * np.r_[1, 0, 1]).dot(np.r_[1, 0, 1]) * 0 + np.linalg.norm((X[:, h] - X[:, J["Hips"]])[:, [0, 2]], axis=1))
    sa, sb = sig(lead), sig(con); ia, ib = int(np.argmax(sa)), int(np.argmax(sb))
    out["moments_apart"] = abs(ia - ib)
    far = np.r_[0:max(0, ib - 8), min(len(sb), ib + 9):len(sb)]
    out["second_slap"] = bool(act == "highfive" and len(far) and (sb[far] - sb.min()).max() > 0.8 * (sb[ib] - sb.min()))
    if kind == "hold" and c1 > c0:
        y = con[c0:c1 + 1, h, 1]; d = np.sign(np.diff(y)); turns = int((np.abs(np.diff(d[d != 0])) > 0).sum()) if (d != 0).sum() > 1 else 0
        out["pumps"] = turns // 2
        ok = ok and out["pumps"] >= 2
    ok = ok and out["moments_apart"] <= 2 and not out["second_slap"]
    out["PASS"] = bool(ok)
    return out


def check_strike(con, lead, info, fps_src):
    # A PUNCH, measured the way the eye sees it: a wind-up (the fist goes BACK ≥10 cm in the 0.3 s before the hit), a fast fist
    # (≥3 m/s), the fist ON the face at the hit (≤5 cm from the head's near edge), the head goes back ON that picture or the next —
    # never before — and no 1-picture jumps anywhere.
    J = {k: i for i, k in enumerate(K)}; h = J["RightHand"]; hd = J["Head"]
    i = int(round(info["leader"]["snap"] * 24 / fps_src)); i = min(i, len(con) - 1, len(lead) - 1)
    fist = con[:, h]; face = lead[:, hd]; toward = face[i] - con[i, J["Neck1"]]; toward[1] = 0; toward /= max(1e-6, np.linalg.norm(toward))
    out = {}
    along = fist @ toward
    w0 = max(0, i - 7); out["windup_cm"] = round(float((along[w0:i].max() - along[w0:i].min()) * 100 if i - w0 > 1 else 0), 1)
    sp = np.linalg.norm(np.diff(fist, axis=0), axis=1) * 24; out["fist_mps"] = round(float(sp[max(0, i - 4):i + 1].max()), 1)
    out["hit_cm"] = round(float(max(0.0, np.linalg.norm(fist[i] - face[i]) - 0.1) * 100), 1)
    hb = -np.diff(face, axis=0) @ toward  # (head moving away from the attacker)
    first = next((k for k in range(max(0, i - 6), len(hb)) if hb[k] > 0.02), None)
    out["head_back_at"] = None if first is None else int(first + 1 - i)  # (0 or 1 = right; negative = flinched BEFORE the hit)
    st = np.linalg.norm(np.diff(con, axis=0), axis=2); spk = (st[1:-1] > 3 * np.maximum(st[:-2], st[2:])) & (st[1:-1] > 0.05)
    out["teleport"] = int(spk.sum())
    # (BODIES APART before the hit: hips ≥35 cm on every picture — T7's bodies stood inside each other for 1.3 s)
    hips = np.linalg.norm((con[:i, J["Hips"]] - lead[:i, J["Hips"]])[:, [0, 2]], axis=1) if i > 0 else np.array([1.0])
    out["closest_hips_cm"] = round(float(hips.min() * 100), 1)
    out["PASS"] = bool(out["closest_hips_cm"] >= 35 and out["windup_cm"] >= 10 and out["fist_mps"] >= 3 and out["hit_cm"] <= 5 and out["head_back_at"] in (0, 1) and out["teleport"] == 0)
    return out


def to_leader_world(frames, info):
    # the inverse of the placement Kimodo was given: draft space → leader world (one rigid move: turn about up + shift)
    th = info["theta"]; c, s = math.cos(th), math.sin(th); ax, az = info["anchor"]; dx, dz = info["dTouchHips"]
    out = []
    for f in frames:
        g = {}
        for k, (x, y, z) in f.items():
            qx, qz = x - dx, z - dz
            g[k] = [round(c * qx + s * qz + ax, 3), y, round(-s * qx + c * qz + az, 3)]
        out.append(g)
    return out


def main():
    rid, lw, fw, sec, seed = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), int(sys.argv[5])
    kind = sys.argv[6] if len(sys.argv) > 6 else "hold"
    fn = modal.Function.from_name("diamond-kimodo", "generate_follow")
    r = None
    for tryn in range(2):  # (the ENGINE's own retry inside one animation — Arthur's version-1 rule allows it; never shown to him)
      r0 = fn.remote({"leader": lw, "follower": fw, "seconds": sec, "seed": seed, "seeds": 2, "hand": "RightHand", "every": int(os.environ.get("EVERY", "2")), "kind": "strike" if kind == "strike" else ("hold" if kind == "hold" else "touch"), "action": os.environ.get("ACTION", "")} | {"seed": seed + 100 * tryn})
      r = r0
      if not r.get("ok"): continue
      quick = []
      L0 = arr(to_json(r["leader"])["frames"])
      for s_ in range(len(r["drafts"])):
          C0 = arr(to_leader_world(to_json(r["raw"][s_])["frames"], r["info"][s_])); D0 = arr(to_json(r["drafts"][s_])["frames"]); n0 = min(len(C0), len(L0), len(D0))
          quick.append(check(C0[:n0], D0[:n0], L0[:n0], r["info"][s_], "RightHand", r["fps"], kind)["PASS"])
      if any(quick): break
    if not r or not r.get("ok"): print("FAILED", r); return
    retries = tryn
    lead = to_json(r["leader"]); L = arr(lead["frames"])
    results = []
    for s in range(len(r["drafts"])):
        d = to_json(r["drafts"][s]); D = arr(d["frames"])
        for mode in ("raw",):  # (post-processing pulled the hands 20 cm apart in try 1 — off for touches)
            cj = to_json(r[mode][s]); cw = to_leader_world(cj["frames"], r["info"][s]); C = arr(cw)
            n = min(len(C), len(L), len(D))
            g = check_strike(C[:n], L[:n], r["info"][s], r["fps"]) if kind == "strike" else check(C[:n], D[:n], L[:n], r["info"][s], "RightHand", r["fps"], kind)
            results.append((g["PASS"], (-g["hit_cm"] + g["windup_cm"] / 10 - 10 * g["teleport"]) if kind == "strike" else (-g["gap_cm"][1] - 10 * g["teleport"] - 10 * g["snap"] - 20 * g["regrab"]), s, mode, g, cw, d))
    for p, _, s, mode, g, _, _ in results: print(f"  seed {s} {mode}: {json.dumps(g)}")
    results.sort(key=lambda x: (x[0], x[1]), reverse=True)
    ok, _, s, mode, g, cw, d = results[0]
    # (THE CAMERA looks across the pair: the line between their hips runs left↔right, turned 12° like the contact camera)
    info = r["info"][s]; m = info["leader"]; fi = int(m.get("snap", m["touch"]) * 24 / r["fps"])
    hl, hf = np.array(lead["frames"][fi]["Hips"]), np.array(cw[min(fi, len(cw) - 1)]["Hips"])
    th = math.atan2(hf[0] - hl[0], hf[2] - hl[2])  # (0°: straight across the touch — beat round)
    tall = lead["frames"][0]["HeadEnd"][1] - min(lead["frames"][0]["LeftFoot"][1], lead["frames"][0]["RightFoot"][1])
    H = 420; scale = H / max(0.5, tall)
    stage = {"originX": 960 - 0.5 * float(np.linalg.norm(hf[[0, 2]] - hl[[0, 2]])) * scale, "S": 0, "side": 1, "floor": 0, "theta": th, "scale": scale}
    clip = lambda fr: {"id": "t", "sentence": "", "fps": 24, "frames": fr, "times": [i / 24 for i in range(len(fr))]}
    plan = {"id": rid, "title": rid, "height": H, "groundY": 900, "pace": "natural", "effects": [],
            "characters": [{"id": "a", "name": "Blue", "x": 700, "facing": "right", "look": {"color": "#1d4ed8", "headFilled": True}, "actions": [{"move": "realMotion", "params": {"clip": clip(lead["frames"]), "stage": stage}}]},
                           {"id": "b", "name": "Red", "x": 1200, "facing": "left", "look": {"color": "#dc2626", "headFilled": True}, "actions": [{"move": "realMotion", "params": {"clip": clip(cw), "stage": stage}}]}]}
    json.dump({"id": f"s50-{rid}", "prompt": f"{lw} / {fw}", "viaChat": False, "result": {"ok": True, "plan": plan, "by": "touch-test", "gate": g, "pick": f"seed {s} {mode}"}}, open(f"{RUNS}/s50-{rid}.json", "w"))
    print("targets per take:", [len(i["frames"]) for i in r["info"]], "every:", os.environ.get("EVERY", "2"))
    print(json.dumps({"id": rid, "PASS": ok, "engine_retries": retries, "pick": f"seed {s} {mode}", "gate": g, "secs": r["secs"]}))


if __name__ == "__main__":
    main()
