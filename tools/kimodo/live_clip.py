# LIVE KIMODO FOR THE APP (Oct 17): words → one stick-figure clip (our 14-joint 24-fps JSON). Kimodo itself is never changed —
# this only calls the deployed "diamond-kimodo" app's generate() (modal deploy kimodo_modal.py) and chooses which take we keep.
# The app (kimodo-app src/lib/animator/kimodo/live.ts) runs:
#   python3 live_clip.py '{"steps": [{"text": "A person walks forward.", "seconds": 1.5}, ...], "seed": 11, "takes": 3, "show": ["slip"]}'
#   (old form still works:  python3 live_clip.py "<sentence>" <seconds> <seed>)
# and reads ONE line of JSON back: {"ok": true, "file": "<cache file>", "cached": bool, "sec": s, "take": k, "scores": [...]}.
# R1b (Oct 17, Arthur's review: the slip looked on purpose, the march was just a walk):
#  - STEPS: one short action per step → Kimodo's own multi-step prompt ("A. B. C." + one length each); a long sentence with 4 parts
#    made Kimodo do the first one or two and drop the rest.
#  - BEST OF N TAKES from ONE Kimodo call (num_samples): a checker with no AI measures what the action must SHOW and keeps the take
#    that shows it most; a take with a 1-picture pop (a hand or foot jumping) loses.
#  - NO DEAD START: more than 0.8 s of standing totally still before anything moves is cut to 0.4 s (only the clock).
# Every result is saved in live-cache/, so the same words + seed again is instant and free.
import hashlib, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "live-cache")


TURN_AROUND = re.compile(r"\bturn(s|ing)? (all the way )?(a)?round\b|\babout[- ]face\b|\bturns? back\b", re.I)
TURN = re.compile(r"\bturn(s|ing)?\b|\bspin(s|ning)?\b|\bpivot\w*|\bwhirl\w*", re.I)
def asked_turning(words):
    around = len(TURN_AROUND.findall(words)); other = max(0, len(TURN.findall(words)) - around)
    return 180.0 * around + 90.0 * other + (360.0 if re.search(r"\bspin\w*|\bwhirl\w*|\bpirouette|\bdanc\w*", words, re.I) else 0.0)


AIR_OK = re.compile(r"\b(run|runs|running|jog\w*|sprint\w*|jump\w*|hop\w*|skip\w*|leap\w*|bounc\w*|cartwheel\w*|flips?|somersault\w*)\b", re.I)


def grounded(frames):
    # ONE FOOT ALWAYS ON THE GROUND (R1c, Oct 17 — Arthur: "the march looks like jogging; he should not be airborne"): while the body
    # is upright (hips above 70% of their standing height — a fall, a sit or a crouch is not counted), how often are BOTH feet off
    # the floor? A walk = 0%; the jogging "march" = 36% of the time, up to 0.33 s at once.
    import numpy as np
    P = lambda k: np.array([f[k] for f in frames], dtype=float)
    hips, lf, rf = P("Hips"), P("LeftFoot"), P("RightFoot")
    floor = min(lf[:, 1].min(), rf[:, 1].min())
    upright = (hips[:, 1] - floor) > 0.7 * (hips[0, 1] - floor)
    if not upright.any(): return 0.0, 0.0, False
    # (each foot's OWN contact height = where it usually rests while upright — our joint is the ANKLE, which sits higher on
    # tiptoes and lower when a foot lies flat after a fall; measuring from the clip's lowest point called a sneak "airborne")
    cl, cr = np.percentile(lf[upright, 1], 10), np.percentile(rf[upright, 1], 10)
    air = (lf[:, 1] - cl > 0.06) & (rf[:, 1] - cr > 0.06) & upright
    run = longest = phases = 0
    for x in air:
        if x and run == 1: phases += 1  # (a time off the ground of 2+ pictures)
        run = run + 1 if x else 0; longest = max(longest, run)
    frac = float(air.sum()) / max(1, int(upright.sum()))
    # (JOGGING = leaving the ground AGAIN AND AGAIN — two or more times off the ground, or a lot of the time; ONE little hop — the
    # sneak's startled jump Arthur passed — is not jogging; Oct 17 R1c test: kimodo/test_live_clip.py)
    return frac, longest / 24, bool((phases >= 2 and frac > 0.05) or frac > 0.15)


def signs(frames, show, air_ok=False, asked_turn=360.0):
    # what each look means in Kimodo's real joints (metres, y up), measured on our 24-fps frames
    import numpy as np
    P = lambda k: np.array([f[k] for f in frames], dtype=float)
    hips, lf, rf, lk, rk, lh, rh, head = P("Hips"), P("LeftFoot"), P("RightFoot"), P("LeftShin"), P("RightShin"), P("LeftHand"), P("RightHand"), P("Head")
    floor = min(lf[:, 1].min(), rf[:, 1].min())
    out = {}
    knee = np.maximum(lk[:, 1], rk[:, 1]) - floor
    # (KNEES HIGH = up to about hip level, never above it: R1c — the most-knee take was a high-knees JOG, knee 10 cm over the hip)
    over_hip = float((np.maximum(lk[:, 1], rk[:, 1]) - hips[:, 1]).max())
    out["knees-high"] = min(1.0, float(knee.max() - min(lk[0, 1], rk[0, 1]) + floor) / 0.25) - 10 * max(0.0, over_hip + 0.02)
    out["big-steps"] = float(np.linalg.norm((lf - rf)[:, [0, 2]], axis=1).max()) / 0.8           # (≈1 = feet 80 cm apart)
    drop = -np.diff(hips[:, 1]) * 24
    out["fast-fall"] = float(drop.max()) / 2.0 if len(drop) else 0.0                          # (≈1 = hips dropping 2 m/s)
    if len(drop):
        t = int(drop.argmax()); a = max(0, t - 14)                                              # (the 0.6 s before the fastest drop)
        rel = lambda F: np.linalg.norm(np.diff((F - hips)[a:t + 2][:, [0, 2]], axis=0), axis=1) * 24 if t + 2 - a > 1 else np.zeros(1)
        out["slip"] = float(max(rel(lf).max(), rel(rf).max())) / 3.0 + out["fast-fall"] / 2  # (a foot SHOOTING OUT before the fall)
    out["hands-up"] = float(max((lh[:, 1] - head[:, 1]).max(), (rh[:, 1] - head[:, 1]).max()) + 0.1) / 0.3
    L = np.stack([lh, rh, lf, rf], axis=1); vv = np.linalg.norm(np.diff(L, axis=0), axis=-1) * 24
    pop = float(np.max(vv[1:-1] - 3 * np.maximum(np.maximum(vv[:-2], vv[2:]), 0.15))) if len(vv) > 2 else 0.0
    # (STOMP, R1d — Arthur: "marching is stomping, high steps, not wide steps": each foot comes DOWN fast onto the floor — the
    # downward speed of the foot in the last pictures before it lands, the 3 hardest landings; ≈1 = 1.2 m/s)
    lands = []
    for F in (lf, rf):
        h = F[:, 1] - np.percentile(F[:, 1], 10); vy = np.diff(F[:, 1]) * 24
        for i in range(3, len(h)):
            if h[i] < 0.04 and h[i - 1] >= 0.04: lands.append(float(-vy[max(0, i - 4):i].min()))
    out["stomp"] = float(np.mean(sorted(lands)[-3:])) / 1.2 if lands else 0.0
    # (TURN AROUND = the body really ends up facing the other way, R1e — Kimodo's "turns around" take turned only 80° and walked
    # off sideways: facing in the first half second vs the last half second, ≈1 = a full 180°)
    Lg, Rg = P("LeftLeg"), P("RightLeg"); vg = Rg - Lg; yw = np.unwrap(np.arctan2(vg[:, 2], vg[:, 0]))
    n12 = min(12, max(1, len(yw) // 4)); dyaw = abs(float(np.degrees(yw[-n12:].mean() - yw[:n12].mean())))
    out["turn-around"] = 1.0 - min(1.0, abs(180.0 - dyaw) / 90.0)
    # (NOD = the head really tips down and up, R2b — Kimodo's listener take moved the head only 3°, too small to see; the spread
    # of the head's tilt (neck → top of the head) over the clip, ≈1 = 20°)
    dn = P("HeadEnd") - P("Neck1"); tilt = np.degrees(np.arctan2(np.hypot(dn[:, 0], dn[:, 2]), dn[:, 1]))
    out["nod"] = float(np.percentile(tilt, 95) - np.percentile(tilt, 5)) / 20.0
    # (REACH = how far a hand gets out IN FRONT of the chest, R3 — people made alone bumped fists with a bent arm, so the director
    # had to stand them chest to chest; ≈1 = a hand 0.55 m in front of the neck. Front = the body's real front, R2b.)
    Lr, Rr, Nk = P("LeftLeg"), P("RightLeg"), P("Neck1"); vr = Rr - Lr; fr2 = np.stack([vr[:, 2], -vr[:, 0]], 1); fr2 /= np.maximum(1e-6, np.linalg.norm(fr2, axis=1, keepdims=True))
    out["reach"] = float(max(((lh - Nk)[:, [0, 2]] * fr2).sum(1).max(), ((rh - Nk)[:, [0, 2]] * fr2).sum(1).max())) / 0.55
    frac, longest, airborne = grounded(frames)
    off = airborne and not air_ok
    # (NO EXTRA SPINNING, R1d — Arthur: "the guard looks like he's spinning a lot": he turned 564° for two turn-arounds (360°).
    # The body's facing, smoothed over half a second so the hips' sway in each step is not counted, may turn only what the words
    # ask — "turns around" = 180°, another "turn" = 90° — plus 90° of slack; more spinning than that loses the take)
    L, R = P("LeftLeg"), P("RightLeg"); v = R - L; yaw = np.unwrap(np.arctan2(v[:, 2], v[:, 0]))
    k = 12; sm = np.convolve(np.r_[[yaw[0]] * k, yaw, [yaw[-1]] * k], np.ones(2 * k + 1) / (2 * k + 1), mode="valid")
    turned = float(np.degrees(np.abs(np.diff(sm)).sum()))
    spun = turned > asked_turn + 90
    want = [s for s in show if s in out]
    score = sum(min(1.0, out[s]) for s in want) - 4 * max(0.0, pop) - (3.0 if off else 0.0) - (2.0 if spun else 0.0)
    return score, {**{k: round(v, 2) for k, v in out.items() if k in want}, "pop": round(max(0.0, pop), 2), "air": round(frac, 2), "airS": round(longest, 2), "offGround": off, "turned": round(turned), "spun": spun}


def touch_moments(frames):
    # THE 3 MOMENTS OF A TOUCH (R3b, Oct 17 — Arthur: "one is early, one is late"; Fable: arm starts / touch pose / let go,
    # measured the SAME way on both people, never a strike-speed detector — high fives and fist bumps are slow):
    # reach = how far a hand is out in front of its OWN hips along the body's real front; touch pose = its peak (from 0.35 s);
    # arm starts = the last picture before it with reach under 15% of the way up; let go = the first after it under 85% of the peak.
    import numpy as np
    P = lambda k: np.array([f[k] for f in frames], dtype=float)
    hips, L, R = P("Hips"), P("LeftLeg"), P("RightLeg"); v = R - L
    fr = np.stack([v[:, 2], -v[:, 0]], 1); fr /= np.maximum(1e-6, np.linalg.norm(fr, axis=1, keepdims=True))
    best = None
    for hand in ("RightHand", "LeftHand"):
        rch = ((P(hand) - hips)[:, [0, 2]] * fr).sum(1); rch = np.convolve(rch, np.ones(3) / 3, mode="same")
        i0 = min(len(rch) - 1, int(0.35 * 24)); pk = i0 + int(np.argmax(rch[i0:])); base = float(np.median(rch[: max(2, int(0.3 * 24))]))
        if best is None or rch[pk] - base > best[0]:
            lo = base + 0.15 * (rch[pk] - base); st = next((i for i in range(pk, -1, -1) if rch[i] < lo), 0)
            hi = base + 0.85 * (rch[pk] - base); lg = next((i for i in range(pk, len(rch)) if rch[i] < hi), len(rch) - 1)
            best = (float(rch[pk] - base), st, pk, lg, hand)
    _, st, pk, lg, hand = best
    floor = min(P("LeftFoot")[:, 1].min(), P("RightFoot")[:, 1].min())
    # (+ how high that hand is at the touch pose: two people placed side by side can only slide sideways, so the PAIR must match)
    return {"start": round(st / 24, 3), "touch": round(pk / 24, 3), "letgo": round(lg / 24, 3), "hand": "rHand" if hand == "RightHand" else "lHand", "height": round(float(P(hand)[pk, 1] - floor), 3)}


def no_dead_start(data):
    import numpy as np
    fr = data["frames"]; f0 = fr[0]
    moved = lambda f: max(float(np.linalg.norm(np.array(f[k]) - np.array(f0[k]))) for k in f0)
    first = next((i for i, f in enumerate(fr) if moved(f) > 0.03), 0)
    if first > int(0.8 * 24):
        cut = first - int(0.4 * 24); data["frames"] = fr[cut:]; data["trimmedStart"] = round(cut / 24, 2)
    return data


def prep(req):
    steps = [{"text": s["text"].strip().rstrip(".") + ".", "seconds": round(float(s["seconds"]), 2)} for s in req["steps"] if str(s.get("text", "")).strip()]
    seed, takes, show = int(req.get("seed", 11)), max(1, min(4, int(req.get("takes", 3)))), list(req.get("show") or [])
    tag = {"pairWith": req["partner"]} if req.get("partner") else {}
    key = hashlib.sha1(json.dumps({"steps": steps, "seed": seed, "takes": takes, "show": sorted(show), "v": 2, **tag}, sort_keys=True).encode()).hexdigest()[:16]
    prompt = " ".join(s["text"] for s in steps); durs = [s["seconds"] for s in steps]
    return {"steps": steps, "seed": seed, "takes": takes, "show": show, "path": os.path.join(CACHE, f"{key}.json"), "prompt": prompt, "durs": durs,
            "dur": durs if len(durs) > 1 else durs[0], "air_ok": bool(AIR_OK.search(prompt)), "turn_ok": asked_turning(prompt)}


def run_jobs(reqs):
    # MANY FIGURES, ONE MODAL JOB (R2, Oct 17): every figure of a scene that is not cached yet goes to Kimodo in ONE starmap call
    # (≤5 graphics cards at once, max_containers) — a 3-person scene takes about as long as one person, never 3 jobs at once.
    os.makedirs(CACHE, exist_ok=True)
    jobs = [prep(r) for r in reqs]; out = [None] * len(jobs); t0 = time.time()
    todo = [i for i, j in enumerate(jobs) if not os.path.exists(j["path"])]
    for i, j in enumerate(jobs):
        if i not in todo: out[i] = {"ok": True, "file": j["path"], "cached": True, "sec": 0}
    if not todo: return out
    import modal
    sys.path.insert(0, HERE)
    from make_clips import to_json
    generate = modal.Function.from_name("diamond-kimodo", "generate")
    first = list(generate.starmap([(jobs[i]["prompt"], jobs[i]["dur"], jobs[i]["seed"], None, jobs[i]["takes"]) for i in todo]))
    cands, scored, again = {}, {}, []
    for i, r in zip(todo, first):
        j = jobs[i]
        if not r.get("ok"): out[i] = {"ok": False, "error": "Kimodo failed: " + str(r.get("log", ""))[-400:]}; continue
        cands[i] = [no_dead_start(to_json(b)) for b in (r.get("npzs") or [r["npz"]])]
        scored[i] = [signs(c["frames"], j["show"], j["air_ok"], j["turn_ok"]) for c in cands[i]]
        # (EVERY take left the ground though nobody asked for running or jumping → ONE more try, a new seed, 3 takes)
        if all(sc[1]["offGround"] for sc in scored[i]): again.append(i)
    if again:
        for i, r2 in zip(again, generate.starmap([(jobs[i]["prompt"], jobs[i]["dur"], jobs[i]["seed"] + 100, None, 3) for i in again])):
            if r2.get("ok"):
                more = [no_dead_start(to_json(b)) for b in (r2.get("npzs") or [r2["npz"]])]
                cands[i] += more; scored[i] += [signs(c["frames"], jobs[i]["show"], jobs[i]["air_ok"], jobs[i]["turn_ok"]) for c in more]
    # TAKE PAIRS (R3b): two people who touch ("pair": the partner's job index) — of their 3×3 take pairs keep the one whose
    # moments match best (arm-start→touch and touch→let-go durations), so the director hardly has to change the clock
    # (Fable: pick the pair first, warp only a little — a big warp changes Kimodo's feel).
    chosen = {}
    for i in cands:
        p = reqs[i].get("pair")
        if p is None or p not in cands or i in chosen: continue
        mi = [touch_moments(c["frames"]) for c in cands[i]]; mp = [touch_moments(c["frames"]) for c in cands[p]]
        cost = lambda a, b: abs((mi[a]["touch"] - mi[a]["start"]) - (mp[b]["touch"] - mp[b]["start"])) + abs((mi[a]["letgo"] - mi[a]["touch"]) - (mp[b]["letgo"] - mp[b]["touch"])) + 4.0 * abs(mi[a]["height"] - mp[b]["height"]) - 0.3 * (scored[i][a][0] + scored[p][b][0])
        a, b = min(((a, b) for a in range(len(cands[i])) for b in range(len(cands[p]))), key=lambda ab: cost(*ab))
        chosen[i], chosen[p] = a, b
    for i in cands:
        j = jobs[i]; k = chosen.get(i, max(range(len(cands[i])), key=lambda q: scored[i][q][0]))
        if reqs[i].get("pair") is not None: cands[i][k]["moments"] = touch_moments(cands[i][k]["frames"])
        data = cands[i][k]; data.update({"sentence": j["prompt"], "durations": j["durs"], "seed": j["seed"], "take": k, "show": j["show"], "live": True, "check": scored[i][k][1]})
        tmp = j["path"] + ".tmp"; json.dump(data, open(tmp, "w")); os.replace(tmp, j["path"])
        out[i] = {"ok": True, "file": j["path"], "cached": False, "sec": round(time.time() - t0, 1), "take": k, "retried": i in again, "offGround": scored[i][k][1]["offGround"], "scores": [x[1] for x in scored[i]]}
    return out


def main():
    if len(sys.argv) >= 4:
        req = {"steps": [{"text": sys.argv[1].strip(), "seconds": float(sys.argv[2])}], "seed": int(sys.argv[3]), "takes": 1, "show": []}
    else:
        req = json.loads(sys.argv[1])
    if "jobs" in req:
        print(json.dumps({"ok": True, "results": run_jobs(req["jobs"])})); return
    print(json.dumps(run_jobs([req])[0]))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # (one line back, always — the app falls back to the saved library on any failure)
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"[:400]}))
