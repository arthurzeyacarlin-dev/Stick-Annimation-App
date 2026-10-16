# DIRECTOR CLIPS (Phase 2): ask live Kimodo (Modal) for motions and save them in the app's motion library as our 14-joint
# 24-fps JSON. Run:  python3 -m modal run make_clips.py::main --which punch|chase|all
import json, os
import numpy as np
import modal
from kimodo_modal import app, generate

BVH = {"Hips": 1, "Neck1": 5, "Head": 7, "HeadEnd": 8, "LeftForeArm": 14, "LeftHand": 15, "RightForeArm": 42, "RightHand": 43, "LeftLeg": 68, "LeftShin": 69, "LeftFoot": 70, "RightLeg": 73, "RightShin": 74, "RightFoot": 75}
LIB = "/Users/arthurcarlin/Projects/diamond-review/kimodo-app/src/lib/animator/kimodo/motions"

def to_json(npz_bytes, src_fps=30):
    import io
    d = np.load(io.BytesIO(npz_bytes), allow_pickle=True); J = d["posed_joints"]; off = 1 if J.shape[1] == 77 else 0
    n24 = int(len(J) / src_fps * 24); frames = []
    for i in range(n24):
        # (BLENDED, Oct 16: the two Kimodo pictures around this moment, mixed — never the nearest one, which stuttered)
        x = i / 24 * src_fps; a = min(len(J) - 1, int(x)); b2 = min(len(J) - 1, a + 1); u = x - a
        j = J[a] * (1 - u) + J[b2] * u
        frames.append({k: [round(float(v), 3) for v in j[b - off]] for k, b in BVH.items()})
    return {"fps": 24, "srcFps": src_fps, "blended": True, "joints": int(J.shape[1]), "frames": frames}

def save(name, prompt, dur, seed=1):
    r = generate.remote(prompt, dur, seed)
    if not r["ok"]:
        print(name, "FAILED", r["log"][-1500:]); return None
    data = to_json(r["npz"]); data["sentence"] = prompt; data["durations"] = dur
    json.dump(data, open(f"{LIB}/{name}.json", "w")); print(name, "ok", len(data["frames"]), "frames"); return data

@app.local_entrypoint()
def clips(which: str = "all"):
    if which in ("punch", "all"):
        A = save("punchA", "A boxer in guard throws a quick left jab, then a powerful right hook to the head of the opponent in front of him, then returns to guard.", 4.0, 3)
        if A:
            # the STRIKE: the picture where a fist is furthest out in front of the body (side view along the hips' normal)
            F = A["frames"]; P = lambda fr, k: np.array(fr[k]); lr = P(F[0], "RightLeg") - P(F[0], "LeftLeg"); fwd = np.array([-lr[2], 0, lr[0]]); fwd /= np.linalg.norm(fwd) or 1
            reach = [max(float((P(fr, h) - P(fr, "Neck1")) @ fwd) for h in ("LeftHand", "RightHand")) for fr in F]
            if np.mean([float(((P(fr, "LeftHand") + P(fr, "RightHand")) / 2 - P(fr, "Hips")) @ fwd) for fr in F]) < 0: reach = [-r for r in reach]
            # (the biggest reach after the first second = the hook, not the jab)
            k0 = 24; tS = (k0 + int(np.argmax(reach[k0:]))) / 24; print("strike at", round(tS, 2), "s")
            d0 = max(2.0, round(tS, 2)); json.dump({"strike": tS, "defenderDelay": round(d0 - tS, 2)}, open(f"{LIB}/punchA.timing.json", "w"))
            save("punchB", "A boxer stands in guard facing his opponent. A boxer gets punched hard in the face, his head snaps back and he staggers backwards two steps. A boxer recovers and raises his guard again.", [d0, 2.0, 2.0], 4)
    if which in ("chase", "all"):
        save("chaseRun", "A person runs forward fast.", 5.0, 5)

# PHASE 1 DUO CLIPS (Oct 16): each person of a two-person scene is made alone, in parallel; the director lines them up by their
# REAL moments (fastest fist = the hit, head snap = the reaction). Run:  python3 -m modal run make_clips.py::duo
G = "A person stands in a fighting guard."
DUO = {
    "d-punch": (["A person throws one fast straight right punch forward at head height, then pulls back to guard.", G], [1.6, 1.4]),
    "d-gethit": ([G, "A person gets punched hard in the face, the head snaps back and the person staggers backward two steps."], [1.5, 2.5]),
    "d-combo": (["A person throws a straight left punch forward.", "A person throws a straight right punch forward.", "A person throws a straight left punch forward.", G], [0.9, 0.9, 0.9, 1.3]),
    "d-block": (["A person raises both forearms in front of the face to block a punch.", "A person blocks another punch with the forearms.", "A person throws a fast straight right punch forward at head height.", G], [0.9, 0.9, 1.0, 1.2]),
    "d-blockhit": (["A person throws a straight right punch forward.", "A person throws a straight left punch forward.", G, "A person gets punched in the face and stumbles backward."], [0.9, 0.9, 0.8, 1.8]),
    "d-kick": ([G, "A person kicks forward hard with the right leg at stomach height, then puts the foot down.", G], [0.8, 1.4, 1.0]),
    "d-gutpunched": ([G, "A person gets kicked in the stomach, doubles over holding the stomach and steps back."], [1.4, 2.4]),
    "d-uppercut": ([G, "A person throws a powerful right uppercut upward.", G], [0.8, 1.2, 1.2]),
    "d-knockdown": ([G, "A person gets hit hard on the chin, flies backward and falls flat on the back."], [1.4, 2.8]),
    "d-push": (["A person stands facing forward.", "A person pushes forward hard with both hands at chest height.", "A person stands still."], [0.8, 1.0, 1.4]),
    "d-pushed": (["A person stands facing forward.", "A person gets pushed in the chest and stumbles backward three steps, arms waving."], [1.2, 2.2]),
    "d-wave": (["A person stands.", "A person waves hello with the right hand raised high, smiling.", "A person stands."], [0.6, 2.0, 0.8]),
    "d-point": (["A person stands.", "A person points forward with the right arm straight out at someone, then laughs.", "A person stands."], [0.6, 2.0, 1.0]),
    "d-shrug": (["A person stands.", "A person looks surprised, then shrugs with both hands open.", "A person stands."], [1.0, 1.8, 0.8]),
    "d-rps": (["A person plays rock paper scissors: shakes the right fist up and down three times in front of the body, then throws the hand forward.", "A person looks at the result and cheers with both arms up."], [2.2, 1.6]),
    "d-rps2": (["A person plays rock paper scissors: shakes the right fist up and down three times in front of the body, then throws the hand forward.", "A person looks at the result and drops the head, disappointed."], [2.2, 1.6]),
    "d-highfive2": (["A person walks forward two steps.", "A person gives a high five with the right hand raised high in front, slapping it forward.", "A person jumps a little, happy."], [1.2, 1.0, 1.0]),
    "d-highfive": (["A person walks forward two steps.", "A person gives a high five with the right hand raised high in front, slapping it forward.", "A person stands happily."], [1.2, 1.0, 1.0]),
}

@app.local_entrypoint()
def duo(only: str = "", seed: int = 7):
    names = [n for n in DUO if not only or n in only.split(",")]
    args = [(DUO[n][0][0] if len(DUO[n][0]) == 1 else " ".join(DUO[n][0]), DUO[n][1], seed) for n in names]
    for n, r in zip(names, generate.starmap(args)):
        if not r["ok"]: print(n, "FAILED", r["log"][-600:]); continue
        data = to_json(r["npz"]); data["sentence"] = " ".join(DUO[n][0]); data["durations"] = DUO[n][1]
        json.dump(data, open(f"{LIB}/{n}.json", "w")); print(n, "ok", len(data["frames"]), "frames", flush=True)

# REACTIONS MADE BECAUSE OF THE HIT (Session A, Oct 16 — Arthur: "it doesn't even look like he got hit"). The attacker is made first;
# its REAL hits are measured (when the fist / foot arrives, how fast). The reaction is then asked for WITH the director's
# instructions: stand in guard until the hit, then the reaction, timed to each hit — and a HIP PATH (Kimodo root2d) that is
# knocked back at each hit, as far as the hit is strong. 3 takes; the one with no flinch before the hit, the head snapping right
# at the hit and the full knock-back wins. Saved with "hits" = the reaction's hit times, for the director (kimodo/director.ts).
def load(name):
    return json.load(open(f"{LIB}/{name}.json"))

def hits_of(frames, n, fps=24):
    # the n strongest strikes: a fist (vs the neck) or a RAISED foot (vs the hips) moving fast, the hit = where its speed halves
    P = lambda fr, k: np.array(fr[k], dtype=float)
    out = []
    for limb, base in (("LeftHand", "Neck1"), ("RightHand", "Neck1"), ("LeftFoot", "Hips"), ("RightFoot", "Hips")):
        rel = np.array([P(fr, limb) - P(fr, base) for fr in frames]); sp = np.r_[0, np.linalg.norm(np.diff(rel, axis=0), axis=1) * fps]
        for i in range(int(0.35 * fps), len(frames) - 1):
            if sp[i] < 1.0 or sp[i] < sp[i - 1] or sp[i] < sp[i + 1]: continue
            if "Foot" in limb and P(frames[i], limb)[1] < 0.25: continue
            h = i
            while h + 1 < len(frames) and sp[h + 1] > 0.5 * sp[i]: h += 1
            out.append((sp[i], h / fps, limb))
    out.sort(reverse=True); pick = []
    for v, t, l in out:
        if len(pick) < n and all(abs(t - q[1]) >= 0.3 for q in pick): pick.append((v, t, l))
    return sorted(pick, key=lambda x: x[1])

def score(J, hit_times, back, fps=30):
    # J = posed joints [T,77,3]; the head (7-1) and hips (1-1): no flinch before the first hit, a snap right after each, full knock-back
    head, hips = J[:, 6, :], J[:, 0, :]
    v = np.r_[0, np.diff(head[:, 2]) * fps]  # (speed along z: backward = negative)
    t0 = int(hit_times[0] * fps)
    flinch = float(np.max(np.abs(v[max(1, t0 - 15):max(2, t0 - 2)]))) if t0 > 4 else 0.0
    snaps = [float(-np.min(v[int(t * fps):int(t * fps) + 9])) for t in hit_times]
    moved = float(hips[0, 2] - hips[-1, 2])
    # (NO POPS: a hand or foot that jumps in one picture far more than in the pictures around it — Kimodo's foot cleanup letting a
    # planted foot go at once — loses the take; Oct 16 A2 reactions)
    L = J[:, [14, 42, 69, 74], :]; vv = np.linalg.norm(np.diff(L, axis=0), axis=-1) * fps
    pop = float(np.max(vv[1:-1] - 3 * np.maximum(np.maximum(vv[:-2], vv[2:]), 0.15))) if len(vv) > 2 else 0.0
    return min(snaps) * 2 - flinch * 3 - abs(moved - back) * 2 - 4 * max(0.0, pop), {"flinch": round(flinch, 2), "snaps": [round(x, 2) for x in snaps], "moved": round(moved, 2), "want": back}

REACT = {
    # name: (attacker clip, strikes, guard-before-first-hit s, [reaction sentence per hit], seconds after the last hit, knock-back m per hit)
    "r-punch":     ("d-punch", 1, 1.0, ["A person gets punched hard in the face, the head snaps back and the body is knocked backward two steps with the arms flying up, then recovers into guard."], 2.2, [0.8]),
    "r-kick":      ("d-kick", 1, 1.0, ["A person gets kicked hard in the stomach, doubles over forward holding the stomach and is knocked backward two steps."], 2.2, [0.7]),
    "r-uppercut":  ("d-uppercut", 1, 1.0, ["A person gets hit by a powerful uppercut on the chin, the head snaps up and back and the person flies backward and falls flat on the back."], 2.6, [1.2]),
    "r-push":      ("d-push", 1, 1.0, ["A person gets shoved hard in the chest with two hands, the upper body is thrown back and the person stumbles backward three quick steps with the arms waving for balance."], 2.2, [1.3]),
    "r-combo":     ("d-combo", 3, 1.0, ["A person gets punched in the face and the head snaps back.", "A person gets punched in the face again and the head snaps to the side.", "A person gets punched hard in the face a third time and staggers backward two steps."], 2.0, [0.25, 0.25, 0.7]),
    "r-knockout":  ("d-punch", 1, 1.0, ["A person gets punched very hard in the face, the head snaps back, the knees give way and the person falls backward flat on the back and lies still."], 2.8, [0.9]),
    "r-roundhouse":("d-roundhouse", 1, 1.0, ["A person gets kicked hard in the side of the head, the head snaps sideways and the person spins and falls to the ground."], 2.6, [0.8]),
    "r-kickdown":  ("d-kick", 1, 1.0, ["A person gets kicked very hard in the chest, is thrown backward off the feet and falls flat on the back."], 2.6, [1.1]),
    "r-pushfall":  ("d-push", 1, 1.0, ["A person gets shoved very hard in the chest with two hands, stumbles backward and falls down sitting on the bottom."], 2.4, [1.0]),
    "r-jab":       ("d-jab", 1, 1.0, ["A person gets a quick light jab on the nose, the head flinches back a little and the person blinks and stays in guard."], 1.8, [0.15]),
}
ATTACK = {
    "d-roundhouse": (["A person stands in a fighting guard.", "A person throws a powerful roundhouse kick with the right leg to head height, then puts the foot down.", "A person stands in a fighting guard."], [0.8, 1.4, 1.0]),
    "d-jab": (["A person stands in a fighting guard.", "A person throws one quick light left jab forward at head height and pulls it back.", "A person stands in a fighting guard."], [0.8, 1.0, 1.2]),
}

@app.local_entrypoint()
def react(only: str = ""):
    # 1. new attackers (in parallel)
    # (only the attackers THIS run's reactions use, and only if missing — a second run never remakes one another run timed to)
    need = [n for n in ATTACK if not os.path.exists(f"{LIB}/{n}.json") and any(REACT[r][0] == n for r in REACT if not only or r in only.split(","))]
    for n, r in zip(need, generate.starmap([(" ".join(ATTACK[n][0]), ATTACK[n][1], 7) for n in need])):
        if not r["ok"]: print(n, "FAILED", r["log"][-400:]); continue
        d = to_json(r["npz"]); d["sentence"] = " ".join(ATTACK[n][0]); json.dump(d, open(f"{LIB}/{n}.json", "w")); print(n, "ok", flush=True)
    # 2. the reactions, built from each attacker's measured hits (in parallel, 3 takes each)
    names = [n for n in REACT if not only or n in only.split(",")]; jobs = []
    for n in names:
        att, k, guard, lines, after, backs = REACT[n]
        hs = hits_of(load(att)["frames"], k)
        if len(hs) < k: print(n, "attacker has only", len(hs), "hits"); continue
        rel = [guard + (h[1] - hs[0][1]) for h in hs]  # (the reaction's own hit times: same gaps as the attacker's)
        durs = [guard] + [max(0.35, rel[i + 1] - rel[i]) for i in range(len(rel) - 1)] + [after]
        prompt = "A person stands in a fighting guard facing forward. " + " ".join(lines)
        # (the hip path: still until the first hit, then knocked back along -z after each hit, easing out over ~0.5 s)
        T = int(sum(durs) * 30); z = np.zeros(T)
        for t, b in zip(rel, backs):
            i0 = int(t * 30); L = int(0.55 * 30 + b * 12)
            for i in range(i0, T): u = min(1.0, (i - i0) / L); z[i] -= b * (1 - (1 - u) ** 2)
        idx = list(range(0, int(rel[0] * 30), 6)) + list(range(int(rel[0] * 30), T, 3))
        cons = [{"type": "root2d", "frame_indices": idx, "smooth_root_2d": [[0.0, float(z[i])] for i in idx]}]
        jobs.append((n, rel, sum(backs), (prompt, durs, 11, cons, 3)))
    for (n, rel, back, _), r in zip(jobs, generate.starmap([j[3] for j in jobs])):
        if not r["ok"]: print(n, "FAILED", r["log"][-600:]); continue
        import io
        takes = []
        for b in r["npzs"]:
            d = np.load(io.BytesIO(b), allow_pickle=True)
            if "posed_joints" not in d: continue
            s, info = score(d["posed_joints"], rel, back); takes.append((s, info, b))
        takes.sort(key=lambda x: -x[0]); s, info, best = takes[0]
        data = to_json(best); data["sentence"] = n; data["hits"] = [round(t, 3) for t in rel]; data["attacker"] = REACT[n][0]; data["take"] = info
        json.dump(data, open(f"{LIB}/{n}.json", "w")); print(n, "ok", len(takes), "takes; best", info, "others", [t[1] for t in takes[1:]], flush=True)

# SESSION A2 — ONE STAGE, THREE PASSES (Oct 16, Arthur: "black is punching thin air, the power doesn't match, barely a wind-up").
# The director plans each fight beat ONCE (move, target, strength 1-5) and both people are made from that same plan:
#   pass 1  the ATTACKER: strength words + a wind-up for hard hits, a hip path that steps in after each knock-back (stays in range);
#           3 takes, the fastest real strikes win; its REAL hit times and striking limbs are measured;
#   pass 2  the REACTION: told the exact hit times, reaction words and knock-back by the SAME strength (Session A's way);
#   pass 3  REAL CONTACT: the attacker is made again with "this hand / foot exactly HERE at THIS picture" (Kimodo end-effector
#           constraint = the attacker's own strike pose, moved so the fist lands on the target's real head / chest / stomach on
#           the shared stage); 3 takes, the smallest miss wins (a miss over 8 cm keeps pass 1 and says so).
# Saved: <name>-a.json / <name>-b.json, both with "hits" (same times) → kimodo/director.ts lines them up, contact is already real.
J_HIPS, J_NECK, J_HEAD = 0, 4, 6
J_LIMB = {"LeftHand": 14, "RightHand": 42, "LeftFoot": 69, "RightFoot": 74}
EE_TYPE = {"LeftHand": "left-hand", "RightHand": "right-hand", "LeftFoot": "left-foot", "RightFoot": "right-foot"}
WORD = {1: "a quick light", 2: "a fast", 3: "a strong", 4: "a hard powerful", 5: "a full-power"}
BACK = {1: 0.1, 2: 0.25, 3: 0.45, 4: 0.8, 5: 1.1}
REACT_WORDS = {
    "face": {1: "the head flinches back a little and the person stays in guard", 2: "the head snaps back", 3: "the head snaps back hard and the person steps back",
             4: "the head snaps back hard and the body is knocked backward two steps with the arms flying up", 5: "the head snaps back violently, the knees give way and the person falls backward flat on the back"},
    "chin": {5: "the head snaps up and back and the person flies backward and falls flat on the back", 4: "the head snaps up and back and the person staggers backward two steps"},
    "stomach": {3: "doubles over holding the stomach", 4: "doubles over forward holding the stomach and is knocked backward two steps", 5: "is folded in half and thrown backward onto the ground"},
    "chest": {3: "is pushed back a step", 4: "the upper body is thrown back and the person stumbles backward three steps with the arms waving", 5: "is thrown backward off the feet and falls flat on the back"},
}
DUET = {
    # name: [(move words, target, strength)], kind
    "s-punch":     [("right cross", "face", 4)],
    "s-combo":     [("left jab", "face", 2), ("right cross", "face", 3), ("left hook", "face", 5)],
    "s-kick":      [("front kick with the right leg", "stomach", 4)],
    "s-shove":     [("two-handed shove", "chest", 4)],
    "s-jab":       [("left jab", "face", 1)],
    "s-hook-ko":   [("right hook", "face", 5)],
    "s-jabjabcross": [("left jab", "face", 1), ("left jab", "face", 1), ("right cross", "face", 4)],
    "s-kick-ko":   [("front kick with the right leg", "chest", 5)],
    "s-uppercut":  [("right uppercut", "chin", 5)],
    "s-punchkick": [("right cross", "face", 3), ("roundhouse kick with the right leg", "stomach", 4)],
}

def aa_of(R):
    # rotation matrices [..., 3, 3] → axis-angle [..., 3] (through quaternions: safe near 0 and 180 degrees)
    R = np.asarray(R, dtype=np.float64); tr = R[..., 0, 0] + R[..., 1, 1] + R[..., 2, 2]
    w = np.sqrt(np.maximum(0, 1 + tr)) / 2; x = np.sqrt(np.maximum(0, 1 + R[..., 0, 0] - R[..., 1, 1] - R[..., 2, 2])) / 2
    y = np.sqrt(np.maximum(0, 1 - R[..., 0, 0] + R[..., 1, 1] - R[..., 2, 2])) / 2; z = np.sqrt(np.maximum(0, 1 - R[..., 0, 0] - R[..., 1, 1] + R[..., 2, 2])) / 2
    x = np.copysign(x, R[..., 2, 1] - R[..., 1, 2]); y = np.copysign(y, R[..., 0, 2] - R[..., 2, 0]); z = np.copysign(z, R[..., 1, 0] - R[..., 0, 1])
    v = np.stack([x, y, z], -1); s = np.linalg.norm(v, axis=-1, keepdims=True); ang = 2 * np.arctan2(s, w[..., None])
    return np.where(s > 1e-8, v / np.maximum(s, 1e-12) * ang, 2 * v)

def seg_plan(beats):
    durs = [0.8] + [0.9 if s <= 2 else 1.1 if s == 3 else 1.3 for _, _, s in beats] + [1.2]
    starts = np.cumsum([0] + durs[:-1]); planned = [float(starts[i + 1] + 0.7 * durs[i + 1]) for i in range(len(beats))]
    return durs, planned

def attacker_text(beats):
    out = ["A person stands in a fighting guard facing the opponent."]
    for mv, tg, s in beats:
        wind = "winds up and " if s >= 4 else ""
        if "shove" in mv: out.append(f"A person steps in, {wind}gives {WORD[s]} two-handed shove to the opponent's chest.")
        else: out.append(f"A person steps in, {wind}throws {WORD[s]} {mv} to the opponent's {tg}.")
    out.append("A person returns to a fighting guard.")
    return " ".join(out)

def path(T, times, backs, sign, start_delay=0.15, ease=0.6, skip=()):
    # hips along z: the reaction is knocked back (sign -1) at each hit; the attacker steps in (sign +1) after each hit but the last
    z = np.zeros(T)
    for t, b in zip(times, backs):
        i0 = int((t + start_delay) * 30); L = max(6, int((ease + b * 0.4) * 30))
        # (a 3-picture ramp, then easing out — a body taking a hit speeds up fast but never jumps: Oct 16 foot pops)
        for i in range(max(0, i0), T):
            u = min(1.0, (i - i0) / L); ramp = min(1.0, (i - i0) / 3.0); z[i] += sign * b * (1 - (1 - u) ** 2) * (0.5 + 0.5 * ramp) if u < 1 else sign * b
    idx = [i for i in range(0, T, 3) if all(abs(i - k) > 6 for k in skip)]
    return {"type": "root2d", "frame_indices": idx, "smooth_root_2d": [[0.0, float(z[i])] for i in idx]}

def target_point(J, f, tg):
    hips, neck, head = J[f, J_HIPS], J[f, J_NECK], J[f, J_HEAD]
    if tg in ("face", "chin"): return head + (np.array([0, -0.05, 0]) if tg == "chin" else 0), 0.09
    if tg == "chest": return neck + (hips - neck) * 0.2, 0.11
    return hips + (neck - hips) * 0.35, 0.12

@app.local_entrypoint()
def duet(only: str = ""):
    import io
    names = [n for n in DUET if not only or n in only.split(",")]
    P = {n: {"beats": DUET[n]} for n in names}
    # PASS 1 — the attackers (all scenes at once, 3 takes each)
    jobs = []
    for n in names:
        beats = DUET[n]; durs, planned = seg_plan(beats); T = int(sum(durs) * 30)
        steps = [BACK[s] for _, _, s in beats[:-1]]
        cons = [path(T, planned[:-1], steps, +1)] if steps else [path(T, [], [], +1)]
        P[n].update(durs=durs, planned=planned, T=T); jobs.append((attacker_text(beats), durs, 21, cons, 3))
    for n, r in zip(names, generate.starmap(jobs)):
        if not r["ok"]: print(n, "PASS 1 FAILED", r["log"][-400:]); P[n]["bad"] = 1; continue
        best = None
        for b in r["npzs"]:
            d = np.load(io.BytesIO(b), allow_pickle=True)
            if "posed_joints" not in d: continue
            fr = to_json(b)["frames"]; hs = hits_of(fr, len(DUET[n]))
            if len(hs) < len(DUET[n]): continue
            sc = sum(h[0] for h in hs) - 2 * sum(abs(h[1] - p) for h, p in zip(hs, P[n]["planned"]))
            if best is None or sc > best[0]: best = (sc, b, hs, d)
        if not best: print(n, "PASS 1: no take had every strike"); P[n]["bad"] = 1; continue
        P[n].update(a1=best[1], hits=[h[1] for h in best[2]], limbs=[h[2] for h in best[2]], speeds=[round(h[0], 1) for h in best[2]], A=best[3])
        print(n, "pass 1 ok: hits", [round(h, 2) for h in P[n]["hits"]], "limbs", P[n]["limbs"], "speeds", P[n]["speeds"], flush=True)
    names = [n for n in names if not P[n].get("bad")]
    # PASS 2 — the reactions, told the real hit times and the same strengths
    jobs = []
    for n in names:
        beats, hits = DUET[n], P[n]["hits"]
        durs = [hits[0]] + [max(0.35, hits[i + 1] - hits[i]) for i in range(len(hits) - 1)] + [2.4 if beats[-1][2] >= 5 else 2.0]
        lines = []
        for k, (mv, tg, s) in enumerate(beats):
            w = REACT_WORDS[tg].get(s) or REACT_WORDS[tg][min(REACT_WORDS[tg], key=lambda q: abs(q - s))]
            lines.append(f"A person gets hit {'very hard ' if s >= 4 else 'lightly ' if s == 1 else ''}in the {tg if tg != 'chin' else 'chin'} and {w}.")
        T = int(sum(durs) * 30); backs = [BACK[s] for _, _, s in beats]
        P[n].update(bdurs=durs, backs=backs)
        full = path(T, hits, backs, -1, start_delay=0.0, ease=0.45); zz = dict(zip(full["frame_indices"], full["smooth_root_2d"]))
        keep = [i for i in full["frame_indices"] if i < int(hits[0] * 30)] + [min(T - 1, int((h + 1.0) * 30)) // 3 * 3 for h in hits]
        margin = {"type": "root2d", "frame_indices": sorted(set(k for k in keep if k in zz)), "smooth_root_2d": [zz[k] for k in sorted(set(k for k in keep if k in zz))]}
        jobs.append(("A person stands in a fighting guard facing the opponent. " + " ".join(lines), durs, int(os.environ.get("REACT_SEED", "31")), [margin], 3))
    for n, r in zip(names, generate.starmap(jobs)):
        if not r["ok"]: print(n, "PASS 2 FAILED", r["log"][-400:]); P[n]["bad"] = 1; continue
        takes = []
        for b in r["npzs"]:
            d = np.load(io.BytesIO(b), allow_pickle=True)
            if "posed_joints" in d: s, info = score(d["posed_joints"], P[n]["hits"], sum(P[n]["backs"])); takes.append((s, info, b, d))
        r2 = generate.remote(jobs[names.index(n)][0], jobs[names.index(n)][1], 77, jobs[names.index(n)][3], 3) if os.environ.get("REACT_MORE") else None
        for b in (r2 or {}).get("npzs", []):
            d = np.load(io.BytesIO(b), allow_pickle=True)
            if "posed_joints" in d: s, info = score(d["posed_joints"], P[n]["hits"], sum(P[n]["backs"])); takes.append((s, info, b, d))
        takes.sort(key=lambda x: -x[0]); P[n].update(b2=takes[0][2], B=takes[0][3], binfo=takes[0][1])
        print(n, "pass 2 ok", takes[0][1], flush=True)
    names = [n for n in names if not P[n].get("bad")]
    # PASS 3 — real contact: the attacker again, its own strike poses moved onto the target's real body on the shared stage
    jobs = []
    for n in names:
        A, B, beats = P[n]["A"], P[n]["B"], DUET[n]
        fa = [min(len(A["posed_joints"]) - 1, int(round(t * 30))) for t in P[n]["hits"]]; fb = [min(len(B["posed_joints"]) - 1, int(round(t * 30))) for t in P[n]["hits"]]
        # (the stage: the reaction stands S metres in front, facing back — its point (x, y, z) is (-x, y, S - z) for the attacker)
        j0 = J_LIMB[P[n]["limbs"][0]]; tp0, r0 = target_point(B["posed_joints"], fb[0], beats[0][1])
        S = float(A["posed_joints"][fa[0], j0, 2] + tp0[2] + r0)
        groups = {}
        for k, (f, g) in enumerate(zip(fa, fb)):
            limb = P[n]["limbs"][k]; tp, rr = target_point(B["posed_joints"], g, beats[k][1])
            fist = A["posed_joints"][f, J_LIMB[limb]]
            # (THE FIGHT STAYS ON ONE LINE, Oct 16: the shove's goal followed a sideways drift 1.1 m — sideways it stays where the fist is)
            goal = np.array([fist[0], tp[1], S - tp[2] - rr])
            # (the contact is HELD for 2 pictures — a real impact stops for a moment; one forced picture snapped in and out)
            for ff in (f, f + 1):
                if ff < len(A["posed_joints"]): groups.setdefault(limb, []).append((ff, A["root_positions"][f] + (goal - fist), aa_of(A["local_rot_mats"][f]), goal))
        cons = []
        for limb, items in groups.items():
            cons.append({"type": EE_TYPE[limb], "frame_indices": [it[0] for it in items], "root_positions": [it[1].tolist() for it in items], "local_joints_rot": [it[2].tolist() for it in items]})
        steps = [BACK[s] for _, _, s in beats[:-1]]
        cons.append(path(P[n]["T"], P[n]["planned"][:-1], steps, +1, skip=fa))
        P[n].update(S=S, goals=[(it[0], it[3]) for items in groups.values() for it in items], glimbs=[(limb, it[0]) for limb, items in groups.items() for it in items])
        jobs.append((attacker_text(beats), P[n]["durs"], int(os.environ.get("CONTACT_SEED", "41")), cons, 3))  # (pass 3)
    for n, r in zip(names, generate.starmap(jobs)):
        miss1 = max(float(np.linalg.norm(P[n]["A"]["posed_joints"][f, J_LIMB[l]] - g)) for (l, f), (_, g) in zip(P[n]["glimbs"], P[n]["goals"]))
        best = (miss1, P[n]["a1"], "pass 1")
        if r["ok"]:
            for b in r["npzs"]:
                d = np.load(io.BytesIO(b), allow_pickle=True)
                if "posed_joints" not in d: continue
                miss = max(float(np.linalg.norm(d["posed_joints"][f, J_LIMB[l]] - g)) for (l, f), (_, g) in zip(P[n]["glimbs"], P[n]["goals"]))
                # (smoothest take wins among the ones that touch: the biggest one-picture jump of any limb, vs its neighbours)
                Jp = d["posed_joints"][:, [J_LIMB[k] for k in J_LIMB]]; v = np.linalg.norm(np.diff(Jp, axis=0), axis=-1)
                pop = float(np.max(v[1:-1] - np.maximum(v[:-2], v[2:]))) if len(v) > 2 else 0.0
                if miss + 3.0 * max(0.0, pop) < best[0]: best = (miss + 3.0 * max(0.0, pop), b, "pass 3")  # (a pop costs a lot: Oct 16 A2/A10)
        else: print(n, "PASS 3 FAILED", r["log"][-300:])
        a = to_json(best[1]); a["sentence"] = attacker_text(DUET[n]); a["hits"] = [round(t, 3) for t in P[n]["hits"]]; a["limbs"] = P[n]["limbs"]
        a["contactMissM"] = round(best[0], 3); a["from"] = best[2]
        bj = to_json(P[n]["b2"]); bj["sentence"] = n + " reaction"; bj["hits"] = [round(t, 3) for t in P[n]["hits"]]; bj["take"] = P[n]["binfo"]
        fl = float(min(P[n]["A"]["posed_joints"][:5, [69, 74], 1].min(), P[n]["B"]["posed_joints"][:5, [69, 74], 1].min()))
        a["stage"] = {"S": round(P[n]["S"], 3), "side": 1, "floor": round(fl, 3)}; bj["stage"] = {"S": round(P[n]["S"], 3), "side": -1, "floor": round(fl, 3)}
        json.dump(a, open(f"{LIB}/{n}-a.json", "w")); json.dump(bj, open(f"{LIB}/{n}-b.json", "w"))
        print(n, "DONE: contact miss", round(best[0] * 100, 1), "cm from", best[2], "(pass 1 missed by", round(miss1 * 100, 1), "cm)", flush=True)

# SAFETY TEST (Fable, Oct 16): feed one of Kimodo's own poses back as a hand constraint at the same picture — it must come back
# where it was (proves the rotation order / parent convention of end-effector constraints). Run:  ... make_clips.py::roundtrip
@app.local_entrypoint()
def roundtrip():
    import io
    r = generate.remote("A person throws a fast straight right punch forward.", 2.0, 5)
    d = np.load(io.BytesIO(r["npz"]), allow_pickle=True); f = 30
    cons = [{"type": "right-hand", "frame_indices": [f], "root_positions": [d["root_positions"][f].tolist()], "local_joints_rot": [aa_of(d["local_rot_mats"][f]).tolist()]}]
    r2 = generate.remote("A person throws a fast straight right punch forward.", 2.0, 9, cons, 1)
    d2 = np.load(io.BytesIO(r2["npz"]), allow_pickle=True)
    a, b = d["posed_joints"][f], d2["posed_joints"][f]
    print("ROUNDTRIP right hand miss cm", round(float(np.linalg.norm(a[42] - b[42])) * 100, 2), "| whole-body max cm", round(float(np.max(np.linalg.norm(a - b, axis=-1))) * 100, 1), "| other seed far away?", round(float(np.linalg.norm(d["posed_joints"][f][42] - d2["posed_joints"][0][42])) * 100, 1))

# SESSION A4 — TOUCHES MADE TOGETHER (Oct 16, interaction layer). A touch is a contact script: which hands meet, when (sparse
# keyframes over the touch). Pass 1: each person acts it out alone (natural poses). The stage distance S is chosen so their reaches
# meet; the MEETING POINTS are halfway between the two hands at each keyframe. Pass 2: BOTH are made again with their hands
# pinned to those same 3D points (Kimodo end-effector constraints, their own pass-1 poses moved there). The best pair of takes =
# the hands stay together over the whole touch. Saved t-<name>-a/-b with "stage" (both) — kimodo/director.ts puts them on the stage.
TOUCH = {
    # name: (sentences, durations, touch span (s, s), keyframes, hands)
    "t-handshake": (["A person walks forward two steps toward a friend.", "A person reaches out the right hand and shakes hands with the friend, pumping it up and down twice.", "A person lets go and smiles."], [1.4, 1.6, 1.0], (1.6, 2.9), 5, ["RightHand"]),
    "t-highfive":  (["A person walks forward two steps toward a friend.", "A person raises the right hand high and gives the friend a high five.", "A person lowers the hand and laughs."], [1.4, 0.9, 1.0], (1.75, 2.0), 2, ["RightHand"]),
    "t-fistbump":  (["A person walks forward two steps toward a friend.", "A person makes a fist and bumps fists with the friend at chest height.", "A person pulls the fist back and nods."], [1.4, 0.9, 1.0], (1.75, 2.0), 2, ["RightHand"]),
    "t-fistbump2": (["A person stands facing a friend.", "A person makes a fist and bumps fists with the friend in front at chest height.", "A person pulls the fist back and nods."], [0.8, 0.9, 1.0], (1.15, 1.4), 2, ["RightHand"]),
    "t-jumpfive":  (["A person runs two steps toward a friend.", "A person jumps and gives the friend a big high five above the head.", "A person lands and cheers."], [1.2, 0.9, 1.1], (1.55, 1.8), 2, ["RightHand"]),
    "t-doublefive":(["A person walks forward two steps toward a friend.", "A person raises both hands high and gives the friend a double high five.", "A person lowers both hands and cheers."], [1.4, 0.9, 1.0], (1.75, 2.0), 2, ["RightHand", "LeftHand"]),
}
OTHER = {"RightHand": "LeftHand", "LeftHand": "RightHand"}  # (facing each other, my right hand meets your... right hand for a handshake)

@app.local_entrypoint()
def touch(only: str = ""):
    import io
    names = [n for n in TOUCH if not only or n in only.split(",")]
    # pass 1: both people act it out, alone (two seeds so they are not copies)
    jobs = [(" ".join(TOUCH[n][0]), TOUCH[n][1], seed, None, 1) for n in names for seed in (51, 52)]
    res = list(generate.starmap(jobs)); P = {}
    for k, n in enumerate(names):
        ra, rb = res[2 * k], res[2 * k + 1]
        if not (ra["ok"] and rb["ok"]): print(n, "PASS 1 FAILED"); continue
        A = np.load(io.BytesIO(ra["npz"]), allow_pickle=True); B = np.load(io.BytesIO(rb["npz"]), allow_pickle=True)
        t0, t1 = TOUCH[n][2]; nk = TOUCH[n][3]; frames = sorted(set(int(round((t0 + (t1 - t0) * i / max(1, nk - 1)) * 30)) for i in range(nk)))
        frames = [min(f, len(A["posed_joints"]) - 1, len(B["posed_joints"]) - 1) for f in frames]
        hands = TOUCH[n][4]
        # (the stage: B stands S metres in front facing back; B's point (x, y, z) is (-x, y, S - z) for A. S = their reaches meet.)
        hA = A["posed_joints"][frames[0], J_LIMB[hands[0]]]; hB = B["posed_joints"][frames[0], J_LIMB[hands[0]]]
        S = float(hA[2] + hB[2])
        # (BODIES APART, Oct 16: a raised high-five hand is close to the body — meeting there tangled the two kids. Hips at least 0.7 m
        # apart at the touch; the hands reach out to meet in the middle.)
        S = max(S, float(A["posed_joints"][frames[0], J_HIPS, 2] + B["posed_joints"][frames[0], J_HIPS, 2] + 0.7))
        cons_a, cons_b, goals = {}, {}, []
        for f in frames:
            for h in hands:
                pa = A["posed_joints"][f, J_LIMB[h]]; hb = OTHER[h] if len(hands) > 1 else h; pbl = B["posed_joints"][f, J_LIMB[hb]]
                pb = np.array([-pbl[0], pbl[1], S - pbl[2]])
                m = (pa + pb) / 2  # (they meet in the middle)
                ma = m; mbl = np.array([-m[0], m[1], S - m[2]])
                cons_a.setdefault(h, []).append((f, A["root_positions"][f] + (ma - pa), aa_of(A["local_rot_mats"][f])))
                cons_b.setdefault(hb, []).append((f, B["root_positions"][f] + (mbl - pbl), aa_of(B["local_rot_mats"][f])))
                goals.append((f, h, hb, m))
        mk0 = lambda groups: [{"type": EE_TYPE[h], "frame_indices": [it[0] for it in items], "root_positions": [it[1].tolist() for it in items], "local_joints_rot": [it[2].tolist() for it in items]} for h, items in groups.items()]
        # (THE WALK-UP KNOWS WHERE THE TOUCH IS, Oct 16: Blue overshot into Orange and backed up — the hips get a smooth path from the
        # start to their spot at the first touch picture, eased, and stay there during the touch)
        def walkup(groups):
            items = sorted(it for v in groups.values() for it in v)[:1]; f = items[0][0]; goal = items[0][1]
            idx = list(range(0, f, 3)) + [f]
            pts = [[float(goal[0] * (lambda u: u * u * (3 - 2 * u))(i / f)), float(goal[2] * (lambda u: u * u * (3 - 2 * u))(i / f))] for i in idx]
            return [{"type": "root2d", "frame_indices": idx, "smooth_root_2d": pts}]
        mk = lambda groups: mk0(groups) + walkup(groups)
        P[n] = {"S": S, "frames": frames, "goals": goals, "ca": mk(cons_a), "cb": mk(cons_b), "A1": ra["npz"], "B1": rb["npz"],
                "miss1": max(float(np.linalg.norm(A["posed_joints"][f, J_LIMB[h]] - np.array([-B["posed_joints"][f, J_LIMB[hb]][0], B["posed_joints"][f, J_LIMB[hb]][1], S - B["posed_joints"][f, J_LIMB[hb]][2]]))) for f, h, hb, _ in goals)}
        print(n, "pass 1 ok: S", round(S, 2), "m, hands apart before pinning (max)", round(P[n]["miss1"] * 100, 1), "cm", flush=True)
    names = [n for n in names if n in P]
    # pass 2: both again, hands pinned to the same meeting points (3 takes each, in parallel)
    jobs = [j for n in names for j in ((" ".join(TOUCH[n][0]), TOUCH[n][1], 61, P[n]["ca"], 3), (" ".join(TOUCH[n][0]), TOUCH[n][1], 62, P[n]["cb"], 3))]
    res = list(generate.starmap(jobs))
    for k, n in enumerate(names):
        ra, rb = res[2 * k], res[2 * k + 1]
        if not (ra["ok"] and rb["ok"]): print(n, "PASS 2 FAILED", (ra.get("log") or rb.get("log") or "")[-300:]); continue
        As = [np.load(io.BytesIO(b), allow_pickle=True) for b in ra["npzs"]]; Bs = [np.load(io.BytesIO(b), allow_pickle=True) for b in rb["npzs"]]
        S = P[n]["S"]; f0, f1 = P[n]["frames"][0], P[n]["frames"][-1]; best = None
        for ia, A in enumerate(As):
            for ib, B in enumerate(Bs):
                if "posed_joints" not in A or "posed_joints" not in B: continue
                # (the hands must stay together over the WHOLE touch, not only at the keyframes; and no pops)
                gap = 0.0
                for f in range(f0, min(f1, len(A["posed_joints"]) - 1, len(B["posed_joints"]) - 1) + 1):
                    for _, h, hb, _m in P[n]["goals"][:len(TOUCH[n][4])]:
                        pa = A["posed_joints"][f, J_LIMB[h]]; q = B["posed_joints"][f, J_LIMB[hb]]; gap = max(gap, float(np.linalg.norm(pa - np.array([-q[0], q[1], S - q[2]]))))
                pops = 0.0
                for J in (A["posed_joints"], B["posed_joints"]):
                    L = J[:, [14, 42, 69, 74], :]; vv = np.linalg.norm(np.diff(L, axis=0), axis=-1) * 30
                    pops = max(pops, float(np.max(vv[1:-1] - 3 * np.maximum(np.maximum(vv[:-2], vv[2:]), 0.15))) if len(vv) > 2 else 0.0)
                sc = gap + 0.1 * max(0.0, pops)
                if best is None or sc < best[0]: best = (sc, gap, pops, ra["npzs"][ia], rb["npzs"][ib])
        if not best: print(n, "PASS 2: no usable takes"); continue
        fl = 0.07
        a = to_json(best[3]); b = to_json(best[4])
        for d, side in ((a, 1), (b, -1)): d["stage"] = {"S": round(S, 3), "side": side, "floor": fl}; d["sentence"] = n; d["touch"] = {"from": f0 / 30, "to": f1 / 30, "gapCm": round(best[1] * 100, 1)}
        json.dump(a, open(f"{LIB}/{n}-a.json", "w")); json.dump(b, open(f"{LIB}/{n}-b.json", "w"))
        print(n, "DONE: hands apart during the touch (max)", round(best[1] * 100, 1), "cm (before pinning", round(P[n]["miss1"] * 100, 1), "cm), pops", round(best[2], 2), flush=True)
