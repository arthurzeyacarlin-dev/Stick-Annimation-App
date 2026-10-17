# START LATER (Oct 16 23:35, taste law "idle ≤1.5 s"): a strike clip opens 1.6 s before its first hit — the long guard before the
# wind-up is cut from BOTH figures at the same picture (only where the video starts; no pose is changed). Run: trim.py lv-block ...
import json, sys
LIB = "/Users/arthurcarlin/Projects/diamond-review/kimodo-app/src/lib/animator/kimodo/motions"
for name in sys.argv[1:]:
    A, B = [json.load(open(f"{LIB}/{name}-{s}.json")) for s in "ab"]
    if A.get("trimmedS"): print(name, "already trimmed", A["trimmedS"]); continue
    T = max(0.0, A["hits"][0] - 1.6); k = int(round(T * 24)); T = k / 24
    for d, s in ((A, "a"), (B, "b")):
        d["frames"] = d["frames"][k:]; d["hits"] = [round(h - T, 3) for h in d["hits"]]; d["trimmedS"] = round(T, 3)
        if "check" in d: d["check"] = {**d["check"], **{x: round(d["check"][x] - T, 3) for x in ("switchS", "reactS") if x in d["check"]}}
        json.dump(d, open(f"{LIB}/{name}-{s}.json", "w"))
    print(name, "starts", round(T, 2), "s later; hits now at", A["hits"])
