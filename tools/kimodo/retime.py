# TIMING PASS (Oct 17, Arthur: "no speed change, no acceleration or deceleration, no real anticipation"). Only WHEN each of ARDY's
# pictures is shown changes — never a pose — and BOTH figures share the same clock, so every contact stays exactly where it was.
# Around the action: slower into the wind-up, a short hold on the loaded pose, a FAST action, a short hold on the impact, ease out.
# Speeds stay between 0.6x and 1.5x (the director's gentle range). Run: retime.py lv-highfive lv-punch ...   (before trim.py)
import json, sys
import numpy as np
import os
LIB = os.environ.get("LIB", "/Users/arthurcarlin/Projects/diamond-review/kimodo-app/src/lib/animator/kimodo/motions")

def rate(c, ta, te, tc):
    if ta <= c < te - 0.05: return 0.85        # into the wind-up
    if te - 0.05 <= c < te + 0.05: return 0.6  # hold the loaded pose
    if te + 0.05 <= c < tc: return 1.5         # the action, fast
    if tc <= c < tc + 0.1: return 0.6          # impact hold
    if tc + 0.1 <= c < tc + 0.4: return 0.85   # ease out
    return 1.0

for name in sys.argv[1:]:
    A, B = [json.load(open(f"{LIB}/{name}-{s}.json")) for s in "ab"]
    if A.get("retimed"): print(name, "already retimed"); continue
    fps = A["fps"]; FA, FB = A["frames"], B["frames"]; n = min(len(FA), len(FB))
    tc = A["hits"][0] if A.get("hits") else A["touch"]["from"]
    limb = (A.get("limbs") or ["RightHand"])[0]
    rel = np.array([np.array(f[limb]) - np.array(f["Hips"]) for f in FA[:n]]); kc = min(n - 1, int(round(tc * fps)))
    w0, w1 = max(0, kc - int(0.8 * fps)), max(1, kc - int(0.1 * fps))
    ke = w0 + int(np.argmax(np.linalg.norm(rel[w0:w1] - rel[kc], axis=1))); te = ke / fps; ta = max(0.0, te - 0.3)
    c = np.arange(n) / fps
    T = np.r_[0, np.cumsum([(1 / fps) / rate(x, ta, te, tc) for x in c[:-1]])]  # scene time of each original picture
    out_T = np.arange(0, T[-1] + 1e-9, 1 / fps); src = np.interp(out_T, T, np.arange(n))
    def sample(F):
        res = []
        for x in src:
            i = int(np.floor(x)); j = min(n - 1, i + 1); u = x - i
            res.append({k: [round(F[i][k][q] * (1 - u) + F[j][k][q] * u, 3) for q in range(3)] for k in F[i]})
        return res
    m = lambda t: round(float(np.interp(t, c, T)), 3)
    for d, s in ((A, "a"), (B, "b")):
        d["frames"] = sample(d["frames"][:n]); d["retimed"] = {"windupS": round(te, 3), "contactS": round(tc, 3)}
        if d.get("hits"): d["hits"] = [m(h) for h in d["hits"]]
        if d.get("touch"): d["touch"] = {"from": m(d["touch"]["from"]), "to": m(d["touch"]["to"])}
        if "check" in d: d["check"] = {**d["check"], **{x: m(d["check"][x]) for x in ("switchS", "reactS") if x in d["check"]}}
        json.dump(d, open(f"{LIB}/{name}-{s}.json", "w"))
    print(name, f"retimed: wind-up peak {te:.2f}s, contact {tc:.2f}s → {m(tc):.2f}s; length {c[-1]:.2f}s → {out_T[-1]:.2f}s")
