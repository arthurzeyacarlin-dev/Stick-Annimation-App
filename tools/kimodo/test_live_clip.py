# TEST (R1c, Oct 17): the "one foot always on the ground" checker on clips we already have — no Kimodo call, free.
#   python3 test_live_clip.py      → the jogging march must be caught; real walks, falls, sits and the passed videos must not be.
import json, glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_clip import grounded, signs, AIR_OK
RUNS = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/runs"
LIB = "/Users/arthurcarlin/Projects/diamond-review/kimodo-app/src/lib/animator/kimodo/motions"
fails = 0
def check(name, frames, words, want_off):
    global fails
    air_ok = bool(AIR_OK.search(words)); frac, longest, airborne = grounded(frames); off = airborne and not air_ok
    ok = off == want_off; fails += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} {name:22s} air {frac:4.0%} longest {longest:.2f}s airOK={air_ok!s:5s} → {'OFF THE GROUND' if off else 'grounded'}")
# (the 12 R1 videos: the jogging march (Arthur: "looks like jogging") and the drum major (two real hops) are off the ground; the
# sneak's ONE startled hop is not jogging — Arthur passed it)
for id in ["R1-1-jacks", "R1-2-sneak", "R1-3-slip", "R1-4-march", "R1-5-victory", "R1-6-yawn", "R1-7-shadowbox", "R1-8-sitdown", "R1-9-trip", "R1-10-drummajor", "R1-11-faint", "R1-12-pond"]:
    p = json.load(open(f"{RUNS}/s50-{id}.json"))["result"]["plan"]["characters"][0]["actions"][0]["params"]
    check(id, p["clip"]["frames"], p.get("motion", ""), False)
# (the R1b takes Arthur rejected, kept in the cache: the jogging march and the hopping drum major MUST be caught)
for name, f in {'jog-march': 'e6e470bad8e2b5be.json', 'hop-drummajor': 'c5f2e9f651efa43e.json'}.items():
    d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "live-cache", f))); check(name, d["frames"], d.get("sentence", ""), True)
# (saved library walks / falls / fights must stay grounded)
for n in ["bt-walk-kimodo", "fall", "sweep", "dig", "d-punch", "d-wave"]:
    f = f"{LIB}/{n}.json"
    if os.path.exists(f): check(n, json.load(open(f))["frames"], json.load(open(f)).get("sentence", ""), False)
# (R1d: NO EXTRA SPINNING — only the guard who turned 564° for two turn-arounds spun too much)
from live_clip import signs, asked_turning
for id in ["R1-1-jacks", "R1-2-sneak", "R1-4-march", "R1-5-victory", "R1-6-yawn", "R1-7-shadowbox", "R1-8-sitdown", "R1-10-drummajor", "R1-12-pond", "R1-13-guard", "R1-14-skip"]:
    p = json.load(open(f"{RUNS}/s50-{id}.json"))["result"]["plan"]["characters"][0]["actions"][0]["params"]
    spun = signs(p["clip"]["frames"], [], False, asked_turning(p.get("motion", "")))[1]["spun"]
    ok = spun is False; fails += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} {id:22s} spun={spun}")
d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "live-cache", 'd11d34a4b27be5e0.json')))  # (the R1c guard Arthur saw spinning)
spun = signs(d["frames"], [], False, asked_turning(d.get("sentence", "")))[1]["spun"]; fails += 0 if spun else 1
print(f"{'ok ' if spun else 'FAIL'} spinning-guard(R1c)       spun={spun}")
print("ALL PASS" if not fails else f"{fails} FAILED"); sys.exit(1 if fails else 0)
