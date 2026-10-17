# SWITCH CHECK (Oct 16, Arthur: "no change in shape or size, no little teleport when ARDY takes over"): around each switch
# picture, (1) the biggest one-picture jump of any body point vs the same figure's normal motion, (2) every bone length vs before.
import json, sys
import numpy as np
LIB = "/Users/arthurcarlin/Projects/diamond-review/kimodo-app/src/lib/animator/kimodo/motions"
BONES = [("Hips", "Neck1"), ("Neck1", "Head"), ("Neck1", "LeftForeArm"), ("LeftForeArm", "LeftHand"), ("Neck1", "RightForeArm"), ("RightForeArm", "RightHand"),
         ("Hips", "LeftShin"), ("LeftShin", "LeftFoot"), ("Hips", "RightShin"), ("RightShin", "RightFoot")]
def run(name, seams_s):
    fr = json.load(open(f"{LIB}/{name}.json"))["frames"]; K = list(fr[0].keys()); J = np.array([[f[k] for k in K] for f in fr])
    v = np.linalg.norm(np.diff(J, axis=0), axis=-1).max(1) * 24  # fastest body point per picture (m/s)
    L = np.array([[np.linalg.norm(np.array(f[a]) - np.array(f[b])) for a, b in BONES] for f in fr])
    for s in seams_s:
        i = int(round(s * 24)); w = v[max(0, i - 3):i + 3]; normal = np.median(v)
        dl = np.abs(L[min(len(L) - 1, i + 2)] - L[max(0, i - 3)]).max() * 100
        # (Oct 17 00:45: a punch reaction starts ON the switch picture, so the receiver's speed rises fast there on purpose. A TELEPORT
        # is a one-picture spike (≥3x both neighbours); a real reaction builds up over pictures. Big + not a spike = "reaction", OK)
        spike = any(v[k] > 0.5 and v[k] > 3 * max(v[k - 1], v[k + 1]) for k in range(max(1, i - 3), min(len(v) - 1, i + 3)))
        calm = w.max() < max(3.5 * normal, 2.5)
        print(name, f"switch at {s:.2f}s: biggest jump {w.max():.2f} m/s (normal {normal:.2f}, max anywhere {v.max():.2f}); bone change {dl:.1f} cm",
              "OK" if calm and dl < 2.0 and not spike else "OK (reaction builds up, no spike)" if dl < 2.0 and not spike else "PROBLEM")
for arg in sys.argv[1:]:
    n, *s = arg.split(":"); run(n, [float(x) for x in s])
