# LIVE CONTACT (Oct 16 night, Arthur's final plan): KIMODO animates each figure ALONE (walk up, guard); ARDY animates ONLY the
# contact moment, continuing from Kimodo's exact last pose (5 full-body keyframes = the handover, Kimodo's own transition trick),
# each piece made AFTER seeing the other figure's real piece. Nothing is re-posed; we only place figures on one stage.
# v2 (PM v4, Oct 16 night — Arthur's review of v1 (live_v1.py): "contact is good", handshake bounced, punch had no wind-up):
#  * HIPS NEVER BOB (ARDY's own code: every hand target ALSO pins the hips — "always include Hips"). v1 slid the hips UP/DOWN a
#    different amount at every target → the body bobbed. Now the hips move only forward/sideways to reach, plus ONE small steady
#    height (≤3 cm, the same for all of that figure's targets). Few targets (start / middle / end).
#  * ANTICIPATION → ACTION → FOLLOW-THROUGH in every sentence (Arthur's animation laws): say() writes all three, in order.
#  * CHOOSE THE BEST TAKE BY MEASUREMENT (never edit a pose): 3–4 takes; strikes = biggest wind-up (the fist moves BACK first) +
#    fastest strike; touches = smallest hand gap + steadiest hips.
# Run: python3 -m modal run live.py::scene --name handshake,highfive,fistbump | punch,combo,push,block    Saves lv-<name>-a/-b.
import io, json
import modal
import numpy as np
from kimodo_modal import app, generate, ardy_gen
from make_clips import aa_of, to_json, hits_of, g_mir, LIB
N = 5  # handover pictures
import os
OFF = int(os.environ.get('SEED_OFF', '0'))  # (fresh takes: shift every ARDY seed)
MIN_SPEED = 3.0  # m/s: slower than this is not a punch/shove
HIP, NECK, HEAD, LH, RH = 0, 4, 6, 14, 42
J_OF = {"RightHand": RH, "LeftHand": LH}
KIND = {RH: "right-hand", LH: "left-hand"}
ld = lambda b: dict(np.load(io.BytesIO(b), allow_pickle=True))
say = lambda *parts: "A person " + ", then ".join(parts) + "."  # (anticipation, action, follow-through — always all three, in order)

def ok(r):
    if not r.get("ok"): raise RuntimeError("ARDY/Kimodo failed: " + r.get("log", "")[-1500:])
    return r

def calls(fn, jobs, wait=900):
    # (NEVER HANG, Oct 16 22:00: two runs sat 15 min with no machine after a lost answer — every call now has a 15-min deadline,
    # then one fresh try; jobs run side by side like starmap)
    for attempt in range(2):
        hs = [fn.spawn(*j) for j in jobs]
        try: return [ok(h.get(timeout=wait)) for h in hs]
        except (TimeoutError, modal.exception.TimeoutError, modal.exception.ConnectionError):
            print("  (a call took over", wait, "s — trying again)", flush=True); [h.cancel() for h in hs]
    raise RuntimeError("Modal calls timed out twice")

def handover(prev):
    # the last N pictures of the previous piece as full-body keyframes, moved so the piece starts at the origin
    rp = prev["root_positions"][-N:].copy(); off = np.array([rp[0, 0], 0.0, rp[0, 2]]); rp -= off
    return [{"type": "fullbody", "frame_indices": list(range(N)), "root_positions": rp.tolist(), "local_joints_rot": aa_of(prev["local_rot_mats"][-N:]).tolist()}], off

def pinned(piece, frames, goals_local, joint, kind, shift=None):
    # this piece's OWN poses at those pictures, slid so the hand reaches the goal. The hips are pinned too (ARDY always adds them), so
    # they slide only forward/sideways; the height gets ONE small steady amount for every target (never a different one each time).
    d = [np.asarray(g) - piece["posed_joints"][f, joint] for f, g in zip(frames, goals_local)] if shift is None else [np.asarray(shift)] * len(frames)
    dy = float(np.clip(np.mean([x[1] for x in d]), -0.03, 0.03))
    rp = [(piece["root_positions"][f] + np.array([x[0], dy, x[2]])).tolist() for f, x in zip(frames, d)]
    return {"type": kind, "frame_indices": list(frames), "root_positions": rp, "local_joints_rot": [aa_of(piece["local_rot_mats"][f]).tolist() for f in frames]}

def join(prev, piece, off):
    return np.concatenate([prev, piece["posed_joints"][N:] + off], 0)

def lf_save(name, A, B, S, extra, extra_a=None):
    from make_clips import lf_json
    for J, side, s in ((A, 1, "a"), (B, -1, "b")):
        d = lf_json(J); d["stage"] = {"S": round(S, 3), "side": side, "floor": 0.07}; d["sentence"] = name; d.update(extra)
        if s == "a" and extra_a: d.update(extra_a)
        json.dump(d, open(f"{LIB}/{name}-{s}.json", "w"))

def bob(J, f0, f1):
    return float(np.ptp(J[f0:f1 + 1, HIP, 1]))  # how much the hips go up/down during the contact (m)

def check(A, B, S):
    T = min(len(A), len(B)); hip = max(float(np.max(np.linalg.norm(np.diff(J[:, 0], axis=0), axis=-1)) * 30) for J in (A, B))
    apart = min(float(np.linalg.norm((A[f, 0] - g_mir(B[f, 0], S))[[0, 2]])) for f in range(T))
    heads = min(float(np.linalg.norm(A[f, HEAD] - g_mir(B[f, HEAD], S))) for f in range(T))
    return {"hipMaxMs": round(hip, 1), "hipsApartMinM": round(apart, 2), "headsApartMinM": round(heads, 2)}

def windup(P, Ls, fh):
    # the wind-up AS YOU SEE IT (22:40 test): how far the striking hand(s) go BACK on the stage from the guard before the strike
    # (a weight shift back counts too), and the strike speed (m/s) in the last pictures before it lands
    z = np.mean([P["posed_joints"][:, L, 2] for L in Ls], 0)
    back = float(z[N] - z[N:fh].min()) if fh > N + 1 else 0.0
    sp = np.linalg.norm(np.diff(np.mean([P["posed_joints"][:, L] for L in Ls], 0), axis=0), axis=-1) * 30
    return max(0.0, back), float(sp[max(N, fh - 8):fh + 1].max())

def _npz(P):
    buf = io.BytesIO(); np.savez(buf, posed_joints=P["posed_joints"]); return buf.getvalue()

def strikes(P, c):
    if c.get("both"):  # a two-hand shove: the moment both hands are furthest out in front
        rel = (P["posed_joints"][:, RH, 2] + P["posed_joints"][:, LH, 2]) / 2 - P["posed_joints"][:, HIP, 2]
        return [(N + 8 + int(np.argmax(rel[N + 8:-15])), "both")]
    hs = [h for h in hits_of(to_json(_npz(P))["frames"], c["n"] + 1) if h[2] in c["limbs"]]
    return [(max(N + 3, int(round(t * 30))), l) for _, t, l in hs][:c["n"]]

def extra_strikes(P, planned_frames):
    # WHOLE-CLIP CHECK (Oct 17, Arthur: "he punches and there's no reaction"): an arm stretched out (hand ≥0.55 m from the hips,
    # across the floor) at any picture that is NOT a planned hit (±0.3 s) before the last hit = an attack on the air → the take fails.
    # (06:05: a speed test vs the neck missed a real jab that went 0.37 → 0.73 m — reach is what a viewer sees)
    J = P["posed_joints"]; last = max(planned_frames)
    out = []
    for L in (RH, LH):
        r = np.linalg.norm((J[:, L] - J[:, HIP])[:, [0, 2]], axis=-1)
        out += [f for f in range(N, min(len(J), last + 6)) if r[f] >= 0.55 and all(abs(f - p) > 9 for p in planned_frames)]
    return [(0, f / 30, "") for f in sorted(set(out))[:1]]

def snap(P, J, f0, f1):
    # (Oct 17 audit: ARDY contact moves were 2-3x softer than Kimodo alone — peak acceleration (m/s²) of the hand vs the hips; pick the snappy take)
    X = P["posed_joints"][max(0, f0):f1, J] - P["posed_joints"][max(0, f0):f1, HIP]
    v = np.linalg.norm(np.diff(X, axis=0), axis=-1) * 30
    return float(np.max(np.abs(np.diff(v))) * 30) if len(v) > 2 else 0.0

def antic(P, J, fc):
    # anticipation: how far the hand first moves AWAY from the spot where it acts (down/back), before going to it (m)
    X = P["posed_joints"][:, J] - P["posed_joints"][:, HIP]; f0 = max(N, fc - 24)
    d = np.linalg.norm(X[f0:fc - 4] - X[fc], axis=-1) if fc - 4 > f0 else np.zeros(1)
    return float(max(0.0, d.max() - d[0]))

def hands(limb):
    return (RH, LH) if limb == "both" else (J_OF[limb],)

TOUCH = {
    "handshake": dict(span=12, text=say("reaches the right hand out toward a friend", "grips the friend's hand and shakes it, pumping it up and down twice", "lets go, steps back a little and smiles")),
    # (round 2, 22:35: the first high five met only at head height and hovered 0.9 s — clearer words + pick the highest, quickest slap)
    "highfive":  dict(span=1, high=True, quick=True, text=say("raises the right hand high above the head", "quickly slaps a high five with a friend, the hands clapping together high above the heads", "pulls the hand down fast and laughs")),
    "fistbump":  dict(span=0, quick=True, text=say("pulls the right fist back to the shoulder", "quickly punches it forward and bumps fists with a friend at chest height", "pulls the fist back and nods")),
}

def touch(name):
    # (05:45 Oct 17, Arthur "high five doesn't look like one": right hand to right hand meets on the centre line, so flattened to 2D
    # the arm crossed the chest/head. B's clip is MIRRORED left-right (a valid human, left-handed) so the nearest arms meet straight
    # ahead. hBm maps B's own stage point to the shared stage with that mirror: (x, y, S - z).)
    hBm = lambda p, S_: np.array([p[0], p[1], S_ - p[2]])
    c = TOUCH[name]; walk = "A person walks forward two steps toward a friend and stops."
    KA, KB = [ld(r["npz"]) for r in calls(generate, [(walk, 2.0, 71), (walk, 2.0, 72)])]  # KIMODO: alone
    (ca, oa), (cb, ob) = handover(KA), handover(KB)
    # (SAME ARDY SEED for both people, round 1b: their shakes then pump in time — different seeds pumped out of step, 17 cm apart)
    PA, PB = [ld(r["npz"]) for r in calls(ardy_gen, [(c["text"], 2.6, 81 + OFF, ca, 1), (c["text"], 2.6, 81 + OFF, cb, 1)])]  # ARDY pass 1
    reach = (PA["posed_joints"][:, RH, 2] - PA["posed_joints"][:, HIP, 2]) + (PB["posed_joints"][:, RH, 2] - PB["posed_joints"][:, HIP, 2])
    fc = N + 8 + int(np.argmax(reach[N + 8:len(reach) - c["span"] - 6]))
    # targets only while BOTH arms are really out (reach ≥ 85% of the most), every 3 pictures, at most `span` each side of the peak
    lo, hi = fc, fc
    while lo > max(N + 4, fc - c["span"]) and reach[lo - 1] >= 0.85 * reach[fc]: lo -= 1
    while hi < min(len(reach) - 4, fc + c["span"]) and reach[hi + 1] >= 0.85 * reach[fc]: hi += 1
    fs = sorted(set(range(lo, hi + 1, 3)) | {fc, hi})
    hA = PA["posed_joints"][fc, RH] + oa; hB = PB["posed_joints"][fc, RH] + ob
    S = float(max(hA[2] + hB[2], PA["posed_joints"][fc, HIP, 2] + oa[2] + PB["posed_joints"][fc, HIP, 2] + ob[2] + 0.75))
    H = float(np.mean([PA["posed_joints"][f, RH, 1] + PB["posed_joints"][f, RH, 1] for f in fs]) / 2)  # ONE steady meeting height
    mids = []
    for f in fs:
        m = (PA["posed_joints"][f, RH] + oa + hBm(PB["posed_joints"][f, RH] + ob, S)) / 2; m[1] = H; mids.append(m)
    cA = ca + [pinned(PA, fs, [m - oa for m in mids], RH, "right-hand")]; cB = cb + [pinned(PB, fs, [hBm(m, S) - ob for m in mids], RH, "right-hand")]
    RA, RB = calls(ardy_gen, [(c["text"], 2.6, 91 + OFF, cA, 3), (c["text"], 2.6, 91 + OFF, cB, 3)])  # ARDY pass 2: 3 takes each
    w0, w1 = fs[0], fs[-1]; best = None
    for a in RA["npzs"]:
        for b in RB["npzs"]:
            A2, B2 = ld(a), ld(b)
            gap = max(float(np.linalg.norm(A2["posed_joints"][f, RH] + oa - hBm(B2["posed_joints"][f, RH] + ob, S))) for f in range(w0, w1 + 1))
            bb = max(bob(A2["posed_joints"], max(N, w0 - 15), w1 + 15), bob(B2["posed_joints"], max(N, w0 - 15), w1 + 15)); sc = gap + 2 * max(0.0, bb - 0.02)
            if c.get("quick"):  # a slap, not a hold: pictures with the hands within 10 cm, beyond 8
                g = [float(np.linalg.norm(A2["posed_joints"][f, RH] + oa - hBm(B2["posed_joints"][f, RH] + ob, S))) for f in range(len(A2["posed_joints"]))]
                sc += 0.01 * max(0, sum(x < 0.10 for x in g) - 8)
            if c.get("high"):  # the hands above the head top at the slap
                sc += max(0.0, float(A2["posed_joints"][fc, 7, 1] - A2["posed_joints"][fc, RH, 1]))
            # (snap + wind-up, Oct 17 audit: the softest/no-wind-up take lost every time — both people must speed up hard and wind up)
            sn = min(snap(A2, RH, fc - 15, fc + 3), snap(B2, RH, fc - 15, fc + 3)); an = min(antic(A2, RH, fc), antic(B2, RH, fc))
            sc -= 0.05 * min(sn, 80) / 40 + 0.3 * min(an, 0.3)
            if best is None or sc < best[0]: best = (sc, gap, bb, A2, B2)
    _, gap, bb, A2, B2 = best; A = join(KA["posed_joints"], A2, oa); B = join(KB["posed_joints"], B2, ob); B = B * np.array([-1.0, 1.0, 1.0])  # (saved mirrored: the app's stage flip then shows it as hBm)
    g0 = len(KA["posed_joints"]) - N; t0 = (g0 + w0) / 30; t1 = (g0 + w1) / 30
    info = dict(check(A, B, S), gapCm=round(gap * 100, 1), hipBobCm=round(bb * 100, 1), switchS=round(g0 / 30, 3),
                snap=[round(snap(A2, RH, fc - 15, fc + 3)), round(snap(B2, RH, fc - 15, fc + 3))], windupCm=[round(antic(A2, RH, fc) * 100), round(antic(B2, RH, fc) * 100)])
    lf_save(f"lv-{name}", A, B, S, {"touch": {"from": round(t0, 3), "to": round(max(t1, t0 + 0.1), 3)}, "check": info})
    print(f"lv-{name} DONE", info, "S", round(S, 2), flush=True)

HIT = {
    "punch": dict(n=1, limbs=("RightHand",), dur=4.0, seeds=(83, 183, 283), rdur=2.2, back=0.8, aim="head",
                  att=say("pulls the right fist far back and shifts the weight back", "explodes forward with a hard right cross to the opponent's face", "follows through and returns to a fighting guard"),
                  react="A person gets punched very hard in the face, the head snaps back hard and the body is knocked backward two steps with the arms flying up, then recovers into guard."),
    "combo": dict(n=3, limbs=("LeftHand", "RightHand"), dur=3.6, seeds=(83, 183), stepin=True, rdur=2.8, back=0.7, aim="head",
                  att=say("bounces in a fighting guard and pulls the left fist back", "throws two quick left jabs to the opponent's face", "pulls the right fist far back and throws a hard right cross", "returns to guard"),
                  react="A person gets hit in the face by two quick jabs, the head snapping back a little each time, then a hard punch snaps the head back and knocks the body backward two steps, then recovers into guard."),
    # (00:50 wording test: "pulls both hands back…" made weak shoves (≤2.7 m/s); "steps forward, then shoves" = 3.3–3.9 m/s, hands 0.5 m out)
    "push":  dict(n=1, limbs=("RightHand", "LeftHand"), dur=3.0, seeds=(83, 183, 283, 383), rdur=2.4, back=1.0, aim="chest", both=True, min=2.5, heads=0.19,
                  att=say("steps forward", "shoves the other person hard in the chest with both hands", "steps back"),
                  react="A person gets shoved hard in the chest, stumbles backward three steps with the arms flailing, then catches the balance."),
}

def target_of(P, f, off, aim):
    j = P["posed_joints"][f] + off
    return j[HEAD] if aim == "head" else j[NECK] * 0.75 + j[HIP] * 0.25  # (chest: three quarters up from the hips to the neck)

def hit(name):
    c = HIT[name]; guard = "A person stands in a fighting guard facing the opponent." if name != "push" else "A person stands facing another person, annoyed."
    KA, KB = [ld(r["npz"]) for r in calls(generate, [(guard, 1.0, 73), (guard, 1.0, 74)])]  # KIMODO: alone
    (ca, oa), (cb, ob) = handover(KA), handover(KB)
    sd = tuple(x + OFF for x in c.get("seeds", (83,)))
    # (≤2 graphics cards per job at a time — dad's limit is 5 for everything: attacker drafts first, then the receiver's guard)
    R1 = calls(ardy_gen, [(c["att"], c["dur"], s_, ca, 4) for s_ in sd]) + calls(ardy_gen, [(guard, c["dur"], 84, cb, 1)])  # 4 drafts per seed
    PB = ld(R1[-1]["npz"]); best = None
    for sd_, a in [(s_, x) for s_, r_ in zip(sd, R1[:-1]) for x in r_["npzs"]]:
        P = ld(a); hs = strikes(P, c)
        if len(hs) < c["n"]: continue
        wb, sp = windup(P, hands(hs[-1][1]), hs[-1][0]); sc = wb / 0.15 + sp / 6.0 - 0.5 * max(0.0, hs[-1][0] / 30 - 2.0) + min(snap(P, hands(hs[-1][1])[0], hs[-1][0] - 12, hs[-1][0] + 2), 120) / 60
        if sp < c.get('min', MIN_SPEED): print(f"  {name} take: too slow {sp:.1f} m/s", flush=True); continue
        ex = extra_strikes(P, [f for f, _ in hs])
        if ex: print(f"  {name} take: extra strike(s) at {[round(h[1], 2) for h in ex]} s — rejected", flush=True); continue
        if c.get("stepin"):  # (22:55 combo: standing still at arm's length their guards overlapped 1.5 s — prefer a take that steps IN first)
            sc += max(0.0, float(P["posed_joints"][hs[0][0], HIP, 2] - P["posed_joints"][N, HIP, 2])) / 0.3
        if c.get("both") and float(np.mean([P["posed_joints"][hs[0][0], J, 2] for J in (RH, LH)]) - P["posed_joints"][hs[0][0], HIP, 2]) < 0.4: continue  # arms really out  # (a REAL strike only — 22:20 a 1 m/s "punch" with no fist going out won on wind-up alone)
        # (23:10: the stage distance only fixes the depth — prefer a take whose real fist is already level with the real target)
        fz = np.mean([P["posed_joints"][hs[0][0], J] for J in hands(hs[0][1])], 0) + oa; tz = target_of(PB, hs[0][0], ob, c["aim"])
        sc -= float(np.hypot(fz[0] + tz[0], fz[1] - tz[1])) / 0.05
        # (23:50: the best wind-up had a SHORT punch — at a safe distance its fist stopped 43 cm from the face. A take only counts
        # if its real fist reaches the real target with the bodies at least 0.6 m apart (hips))
        f0 = hs[0][0]
        if fz[2] + tz[2] + 0.09 < P["posed_joints"][f0, HIP, 2] + oa[2] + PB["posed_joints"][f0, HIP, 2] + ob[2] + 0.6 - 0.03: continue
        # (01:10 NO BODIES INSIDE EACH OTHER: the first push stepped INTO Red — heads 13 cm apart for 39 pictures before the shove.
        # With the bodies placed where this take's hit lands, the two heads must stay ≥0.4 m apart up to the hit)
        S_ = max(fz[2] + tz[2] + 0.09, P["posed_joints"][f0, HIP, 2] + oa[2] + PB["posed_joints"][f0, HIP, 2] + ob[2] + 0.6)
        hd = min(float(np.linalg.norm(P["posed_joints"][f, HEAD] + oa - g_mir(PB["posed_joints"][f, HEAD] + ob, S_))) for f in range(N, f0 + 1))
        print(f"  {name} take: wind-up {wb * 100:.0f} cm, {sp:.1f} m/s, heads ≥{hd:.2f} m", flush=True)
        if hd < c.get("heads", 0.4): continue  # (a shove is face to face: 0.3 m — head circles touch under ~0.25 m)
        if best is None or sc > best[0]: best = (sc, P, hs, wb, sp, sd_)
    if best is None: print(f"lv-{name} FAILED: no take with {c['n']} strikes", flush=True); return
    _, PA, hs, wb1, sp1, seed1 = best; fh1 = hs[0][0]; fhL = hs[-1][0]
    # STAGE: the first strike reaches the receiver's real target (9 cm in front of its centre: lands, never stops short)
    fist = np.mean([PA["posed_joints"][fh1, J] for J in hands(hs[0][1])], 0) + oa; tg = target_of(PB, fh1, ob, c["aim"])
    S = float(max(fist[2] + tg[2] + 0.09, PA["posed_joints"][fh1, HIP, 2] + oa[2] + PB["posed_joints"][fh1, HIP, 2] + ob[2] + 0.6))
    # RECEIVER: guard up to the first hit, then the reaction piece starts ON that picture (knock-back path after the last hit)
    Bpre = np.concatenate([KB["posed_joints"], PB["posed_joints"][N:fh1 + 1] + ob], 0)
    prevB = {"root_positions": np.concatenate([KB["root_positions"], PB["root_positions"][N:fh1 + 1] + ob]), "local_rot_mats": np.concatenate([KB["local_rot_mats"], PB["local_rot_mats"][N:fh1 + 1]])}
    cr, orr = handover(prevB); r = lambda f: f - fh1 + N - 1  # attacker picture → reaction picture
    rL = r(fhL); end = min(int(c["rdur"] * 30) - 4, rL + 40)
    back = [{"type": "root2d", "frame_indices": list(range(rL + 3, end, 3)), "smooth_root_2d": [[0.0, float(-c["back"] * min(1, (i - rL) / 18) ** 0.6)] for i in range(rL + 3, end, 3)]}]
    RB2 = calls(ardy_gen, [(c["react"], c["rdur"], 94, cr + back, 3)])[0]
    def jolt(P):  # the biggest head jolt right after the last hit
        h = P["posed_joints"][:, HEAD] - P["posed_joints"][:, HIP]; return float(np.max(np.linalg.norm(np.diff(h[rL:rL + 9], axis=0), axis=-1)))
    B2 = max((ld(b) for b in RB2["npzs"]), key=jolt)
    def goal_at(f):  # the receiver's REAL target at attacker picture f (guard piece up to the first hit, reaction piece after), attacker side
        t = target_of(PB, f, ob, c["aim"]) if f <= fh1 else target_of(B2, r(f), orr, c["aim"])
        return g_mir(t, S) - np.array([0, 0, 0.09])
    # ATTACKER pass 2: every strike pinned on the receiver's real target (a shove: both hands, one shared hips slide)
    cons = list(ca)
    for f, limb in hs:
        g = goal_at(f) - oa
        if limb == "both":
            sh = g - (PA["posed_joints"][f, RH] + PA["posed_joints"][f, LH]) / 2
            for J in (RH, LH): cons.append(pinned(PA, [f], [PA["posed_joints"][f, J] + sh], J, KIND[J], shift=sh))
        else:
            J = J_OF[limb]; sh = g - PA["posed_joints"][f, J]; cons.append(pinned(PA, [f, f + 1], [g, g], J, KIND[J]))
            # (00:10: pass 2 kept the landing but lost the wind-up (17.6 → 1.5 cm) — the take's OWN pulled-back pose is pinned too,
            # with the same hips slide, so the re-made punch still winds up)
            z = PA["posed_joints"][:, J, 2]; fb = N + 2 + int(np.argmin(z[N + 2:f])) if f > N + 4 else None
            if fb is not None and z[N] - z[fb] > 0.06: cons.append(pinned(PA, [fb], [PA["posed_joints"][fb, J] + sh], J, KIND[J], shift=sh))
    def miss(P):
        return max(float(np.linalg.norm(np.mean([P["posed_joints"][f, J] for J in hands(l)], 0) + oa - goal_at(f))) for f, l in hs)
    # (23:10: pass 2 with a NEW seed threw the good punch away (34.8 cm miss, no wind-up). The chosen take itself is kept when it
    # already lands (<6 cm); otherwise pass 2 re-makes it from the SAME seed so it stays the same punch, and pass 1 stays if better)
    takes = [(miss(PA), windup(PA, hands(hs[-1][1]), fhL), PA)]
    print(f"  {name} pass 1: miss {takes[0][0] * 100:.1f} cm, wind-up {takes[0][1][0] * 100:.0f} cm, {takes[0][1][1]:.1f} m/s", flush=True)
    if takes[0][0] >= 0.06:
        RA2 = calls(ardy_gen, [(c["att"], c["dur"], seed1, cons, 4)])[0]
        takes += [(miss(P), windup(P, hands(hs[-1][1]), fhL), P) for P in (ld(a) for a in RA2["npzs"])]
    for t in takes[1:]: print(f"  {name} pass 2 take: miss {t[0] * 100:.1f} cm, wind-up {t[1][0] * 100:.0f} cm, {t[1][1]:.1f} m/s, extra {len(extra_strikes(t[2], [f for f, _ in hs]))}", flush=True)
    takes = [t for t in takes if not extra_strikes(t[2], [f for f, _ in hs])] or sorted(takes, key=lambda t: t[0])[:1]
    good = [t for t in takes if t[0] < 0.06 and t[1][1] >= c.get('min', MIN_SPEED)] or [t for t in takes if t[1][1] >= c.get('min', MIN_SPEED)] or takes
    good = [t for t in good if t[0] <= min(x[0] for x in good) + 0.04]
    ms, (wb, sp), A2 = max(good, key=lambda t: t[1][0] / 0.15 + t[1][1] / 6.0 + min(snap(t[2], hands(hs[-1][1])[0], fhL - 12, fhL + 2), 120) / 60)
    print(f"  {name} chosen snap {snap(A2, hands(hs[-1][1])[0], fhL - 12, fhL + 2):.0f} m/s²", flush=True)
    A = join(KA["posed_joints"], A2, oa); B = np.concatenate([Bpre[:-N], B2["posed_joints"] + orr], 0)
    g0 = len(KA["posed_joints"]) - N; th = [round((g0 + f) / 30, 3) for f, _ in hs]
    info = dict(check(A, B, S), missCm=round(ms * 100, 1), windupCm=round(wb * 100, 1), strikeMs=round(sp, 1), windupPass1Cm=round(wb1 * 100, 1), switchS=round(g0 / 30, 3), reactS=round((g0 + fh1) / 30, 3))
    lf_save(f"lv-{name}", A, B, S, {"hits": th, "check": info}, {"limbs": ["RightHand" if l == "both" else l for _, l in hs]})
    print(f"lv-{name} DONE", info, "hits at", th, "S", round(S, 2), flush=True)

def block():
    # the attacker's real punch first; the defender's block piece is made AFTER, his hand pinned just in front of the real fist
    guard = "A person stands in a fighting guard facing the opponent."
    KA, KB = [ld(r["npz"]) for r in calls(generate, [(guard, 1.0, 75), (guard, 1.0, 76)])]
    (ca, oa), (cb, ob) = handover(KA), handover(KB)
    att = HIT["punch"]["att"]
    R1 = calls(ardy_gen, [(att, 4.0, 85, ca, 4), (att, 4.0, 185, ca, 4)]) + calls(ardy_gen, [(guard, 4.0, 86, cb, 1)])  # (same fixes as the punch, 23:00)
    PB = ld(R1[-1]["npz"]); best = None
    for a in R1[0]["npzs"] + R1[1]["npzs"]:
        P = ld(a); hs = strikes(P, HIT["punch"])
        if not hs: continue
        wb, sp = windup(P, (RH,), hs[0][0]); sc = wb / 0.15 + sp / 6.0 - 0.5 * max(0.0, hs[0][0] / 30 - 2.0)
        if sp < MIN_SPEED: continue
        if best is None or sc > best[0]: best = (sc, P, hs[0][0], wb, sp)
    _, PA, fh, wb, sp = best; fist = PA["posed_joints"][fh, RH] + oa; head = PB["posed_joints"][fh, HEAD] + ob
    S = float(max(fist[2] + head[2] + 0.16, PA["posed_joints"][fh, HIP, 2] + oa[2] + PB["posed_joints"][fh, HIP, 2] + ob[2] + 0.7))  # stops 16 cm short of the face
    goal = g_mir(fist, S) + np.array([0, 0, -0.05])  # the defender's hand just in front of the real fist (his side)
    BH = min((LH, RH), key=lambda J: float(np.linalg.norm(PB["posed_joints"][fh, J] + ob - goal)))  # the hand on the fist's side
    side = "left" if BH == LH else "right"
    dfn = say("watches the opponent closely in a tight guard", f"raises the {side} forearm in front of the face and blocks a hard punch, the arm absorbing the hit", "pushes the arm away and returns to a fighting guard")
    cB = cb + [pinned(PB, [fh - 1, fh, fh + 1], [goal - ob] * 3, BH, KIND[BH])]
    RB2 = calls(ardy_gen, [(dfn, 4.0, 96, cB, 3)])[0]
    B2 = min((ld(b) for b in RB2["npzs"]), key=lambda P: float(np.linalg.norm(P["posed_joints"][fh, BH] + ob - goal)))
    ms = float(np.linalg.norm(B2["posed_joints"][fh, BH] + ob - goal))
    A = join(KA["posed_joints"], PA, oa); B = join(KB["posed_joints"], B2, ob); g0 = len(KA["posed_joints"]) - N
    info = dict(check(A, B, S), missCm=round(ms * 100, 1), windupCm=round(wb * 100, 1), strikeMs=round(sp, 1), blockHand=side, switchS=round(g0 / 30, 3))
    lf_save("lv-block", A, B, S, {"hits": [round((g0 + fh) / 30, 3)], "check": info}, {"limbs": ["RightHand"]})
    print("lv-block DONE", info, "hit at", round((g0 + fh) / 30, 2), "S", round(S, 2), flush=True)

@app.local_entrypoint()
def scene(name: str = "handshake"):
    # "a,b|c": groups run side by side inside ONE Modal app (two separate apps at once stalled twice, Oct 16), moves in a group one by one
    import traceback
    from concurrent.futures import ThreadPoolExecutor
    def run(group):
        for n in group.split(","):
            for attempt in range(2):  # (one retry: a Modal network hiccup "Deadline exceeded" lost the punch, Oct 16 21:50)
                try:
                    touch(n) if n in TOUCH else hit(n) if n in HIT else block(); break
                except Exception:
                    print(f"lv-{n} FAILED (try {attempt + 1})", traceback.format_exc()[-1500:], flush=True)
    with ThreadPoolExecutor(max_workers=2) as ex: list(ex.map(run, name.split("|")))

@app.local_entrypoint()
def diag(which: str = "punch"):
    # (wording test, Oct 16 22:20: the long wind-up sentence gave NO punch at all — measure every take of several wordings)
    guard = "A person stands in a fighting guard facing the opponent."
    K = ld(calls(generate, [(guard, 1.0, 73)])[0]["npz"]); ca, _ = handover(K)
    texts = {"punch": [HIT["punch"]["att"],
                       "A person steps in, winds up and throws a hard powerful right cross to the opponent's face, then returns to a fighting guard.",
                       "A person pulls the right arm back, then throws a hard right punch straight forward, then returns to a fighting guard."]}[which]
    for k, t in enumerate(texts):
        for dur in (2.4, 3.0):
            R = calls(ardy_gen, [(t, dur, 83, ca, 4)])[0]
            for i, a in enumerate(R["npzs"]):
                P = ld(a); rel = P["posed_joints"][:, RH, 2] - P["posed_joints"][:, HIP, 2]
                sp = np.r_[0, np.linalg.norm(np.diff(P["posed_joints"][:, RH] - P["posed_joints"][:, HIP], axis=0), axis=-1) * 30]
                f = int(np.argmax(rel)); wb = float(rel[N] - rel[N:max(N + 1, f)].min())
                print(f"DIAG text{k} dur{dur} take{i}: reach {rel.max():.2f} m at {f / 30:.2f}s, top speed {sp.max():.1f} m/s, wind-up {wb * 100:.0f} cm", flush=True)

@app.local_entrypoint()
def diag2():
    # (wind-up as you SEE it: the fist going back on the stage, plus when the wind-up starts and when the strike lands; 4-s clips)
    guard = "A person stands in a fighting guard facing the opponent."
    K = ld(calls(generate, [(guard, 1.0, 73)])[0]["npz"]); ca, _ = handover(K)
    for k, t in enumerate([HIT["punch"]["att"], "A person steps in, winds up and throws a hard powerful right cross to the opponent's face, then returns to a fighting guard."]):
        for seed in (83, 183):
            for i, a in enumerate(calls(ardy_gen, [(t, 4.0, seed, ca, 4)])[0]["npzs"]):
                P = ld(a); z = P["posed_joints"][:, RH, 2]; sp = np.r_[0, np.linalg.norm(np.diff(P["posed_joints"][:, RH], axis=0), axis=-1) * 30]
                f = N + int(np.argmax(sp[N:])); fb = N + int(np.argmin(z[N:f])) if f > N + 1 else N
                print(f"DIAG2 text{k} seed{seed} take{i}: strike {sp[f]:.1f} m/s at {f / 30:.2f}s, fist back {100 * (z[N] - z[fb]):.0f} cm (lowest at {fb / 30:.2f}s), reach {z.max() - z[N]:.2f} m", flush=True)

@app.local_entrypoint()
def diag3():
    # (00:15: no push take passed — measure every take: when, how fast, how far the hands go out in front of the hips)
    guard = "A person stands facing another person, annoyed."
    K = ld(calls(generate, [(guard, 1.0, 73)])[0]["npz"]); ca, _ = handover(K)
    texts = [HIT["push"]["att"], "A person steps forward and shoves the other person hard in the chest with both hands, then steps back."]
    R = calls(ardy_gen, [(t, 3.0, 83, ca, 4) for t in texts])
    for k, r_ in enumerate(R):
        for i, a in enumerate(r_["npzs"]):
            P = ld(a); f = strikes(P, HIT["push"])[0][0]; wb, sp = windup(P, (RH, LH), f)
            out = float(np.mean([P["posed_joints"][f, J, 2] for J in (RH, LH)]) - P["posed_joints"][f, HIP, 2])
            print(f"DIAG3 text{k} take{i}: shove at {f / 30:.2f}s, hands out {out:.2f} m, speed {sp:.1f} m/s, pull-back {wb * 100:.0f} cm", flush=True)

SOLO = {  # (Oct 17, Arthur: more single-figure videos + 3-figure scenes) — KIMODO alone, as it is; only the sentence and the seed are ours
    "k-walk1": ("A person walks forward at a relaxed pace, swinging the arms.", 4.0, 11),
    "k-walk2": ("A person walks forward at a relaxed pace, swinging the arms.", 4.0, 12),
    "k-walk3": ("A person walks forward at a relaxed pace, swinging the arms.", 4.0, 13),
    "k-wave1": ("A person stands, then raises the right hand high and waves hello, then lowers it.", 3.0, 21),
    "k-wave2": ("A person stands, then raises the right hand high and waves hello, then lowers it.", 3.0, 22),
    "k-wave3": ("A person stands, then raises the right hand high and waves hello, then lowers it.", 3.0, 23),
    "k-cheer": ("A person crouches down, then jumps up high and cheers with both arms up, then lands.", 3.0, 31),
}

@app.local_entrypoint()
def solo(only: str = ""):
    from make_clips import to_json
    names = [n for n in SOLO if not only or n in only.split(",")]
    for n, r in zip(names, calls(generate, [SOLO[n] for n in names])):
        d = to_json(r["npz"]); d["sentence"] = SOLO[n][0]; json.dump(d, open(f"{LIB}/{n}.json", "w")); print(n, "ok", len(d["frames"]), flush=True)
