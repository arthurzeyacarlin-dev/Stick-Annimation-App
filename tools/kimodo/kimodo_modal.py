# KIMODO ON A RENTED GRAPHICS CARD (Oct 15 test): text → real human motion (NVIDIA Kimodo) on Modal.
# Run:  python3 -m modal run kimodo_modal.py            (makes the 3 test clips into ./out/*.npz)
# The Hugging Face token lives ONLY in the Modal secret "huggingface" (HF_TOKEN) — never in this file or the chat.
import modal

app = modal.App("diamond-kimodo")
cache = modal.Volume.from_name("kimodo-cache", create_if_missing=True)  # (model downloads kept between runs)

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "cmake", "build-essential")
    .pip_install("torch==2.4.1", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("git+https://github.com/nv-tlabs/kimodo.git", "huggingface_hub", "numpy")
    .env({"HF_HOME": "/cache/hf", "TORCH_HOME": "/cache/torch"})
)


# (AT MOST 5 GRAPHICS CARDS AT ONCE, Oct 16 — dad got Modal's "10 GPU limit" email: the free Starter plan allows 10 running at the
# same time and we had launched 10+ in parallel. Extra calls now wait in line; nothing fails and nothing extra is paid.)
@app.function(image=image, gpu="L4", timeout=1800, volumes={"/cache": cache}, secrets=[modal.Secret.from_name("huggingface-secret")], max_containers=5)
def generate(prompt: str, duration=5.0, seed: int = 1, constraints=None, num_samples: int = 1) -> dict:
    # (several moves in a row: prompt "A. B. C." + duration "a b c" — Kimodo blends one into the next)
    # (THE DIRECTOR'S PATH, Oct 16: `constraints` = Kimodo's saved constraint list, e.g. [{"type": "root2d", "frame_indices": [...],
    #  "smooth_root_2d": [[x, z], ...]}] at 30 fps — where the hips must be; `num_samples` takes in one call → "npzs")
    import glob, io, json, os, subprocess, numpy as np
    os.makedirs("/tmp/k", exist_ok=True)
    for f in glob.glob("/tmp/k/**/*", recursive=True):
        if os.path.isfile(f): os.remove(f)
    stem = "/tmp/k/out"
    cmd = ["kimodo_gen", prompt, "--duration", (" ".join(str(d) for d in duration) if isinstance(duration, (list, tuple)) else str(duration)), "--seed", str(seed), "--output", stem]
    if constraints:
        json.dump(constraints, open("/tmp/k/constraints.json", "w")); cmd += ["--constraints", "/tmp/k/constraints.json"]
    if num_samples > 1: cmd += ["--num_samples", str(num_samples)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    cache.commit()
    files = sorted(glob.glob("/tmp/k/**/*.npz", recursive=True))
    if r.returncode != 0 or not files:
        return {"ok": False, "log": (r.stdout[-3000:] + "\n" + r.stderr[-3000:])}
    out = []
    for f in files:
        data = dict(np.load(f, allow_pickle=True)); buf = io.BytesIO(); np.savez(buf, **data); out.append(buf.getvalue())
    return {"ok": True, "npz": out[0], "npzs": out, "log": r.stdout[-1500:]}


@app.local_entrypoint()
def main():
    import os
    os.makedirs("out", exist_ok=True)
    tests = [("fall", "A person walking forward trips over something and falls flat on the ground, then lies still.", 5.0),
             ("sweep", "A person sweeps the floor with a broom, pushing it forward and back several times.", 6.0),
             ("dig", "A person digs a hole with a shovel, pushing the shovel into the ground and tossing the dirt to the side, three times.", 7.0)]
    for name, prompt, dur in tests:
        res = generate.remote(prompt, dur)
        if not res["ok"]:
            print(name, "FAILED\n", res["log"]); continue
        open(f"out/{name}.npz", "wb").write(res["npz"])
        print(name, "ok", res["keys"])


@app.function(image=image, timeout=300)
def helpinfo() -> str:
    # (how kimodo_gen takes constraints — read from the installed package, no graphics card needed)
    import subprocess
    out = ""
    out += subprocess.run("d=$(python -c \"import kimodo,os;print(os.path.dirname(kimodo.__file__))\"); sed -n 75,122p $d/model/kimodo_model.py; echo ----; sed -n 255,300p $d/model/kimodo_model.py; echo ----; grep -n 'def ' $d/motion_rep/*.py | grep -i 'condition\\|inverse\\|to_joints\\|decode\\|unnormal\\|forward\\|posed' | head -20", shell=True, capture_output=True, text=True).stdout
    return out
    out += subprocess.run("python -c \"import kimodo,os;print(os.path.dirname(kimodo.__file__))\"; d=$(python -c \"import kimodo,os;print(os.path.dirname(kimodo.__file__))\"); grep -rn -i 'root2d\\|constraint' $d --include=*.py | grep -i 'def \\|json\\|load\\|root2d\\|keys\\|\\[\"' | head -80", shell=True, capture_output=True, text=True).stdout
    return out


@app.local_entrypoint()
def help():
    print(helpinfo.remote())


# G1 (Oct 16): read Kimodo's installed source (no graphics card) — for the group engine loop below.
@app.function(image=image, timeout=300)
def ksrc(files: str = "model/kimodo_model.py") -> str:
    import subprocess
    cmd = 'd=$(python -c "import kimodo,os;print(os.path.dirname(kimodo.__file__))"); echo $d; ls -R $d | head -80; for f in ' + files + '; do echo "=== $f"; cat $d/$f; done'
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


@app.local_entrypoint()
def peek(files: str = "model/kimodo_model.py", out: str = "ksrc.txt"):
    open(out, "w").write(ksrc.remote(files))


# THE GROUP ENGINE (G1, Oct 16 — PM v3; InterControl-style coupled sampling). ALL people of a scene are made in ONE Kimodo batch
# with OUR OWN denoising loop. From `couple_from` (30%) of the steps on, every person's current clean guess is turned into joints
# and each person's conditions for the next step are rebuilt from the contact script — so both sides always aim at the OTHER
# person's CURRENT motion (the old way aimed at a frozen draft). Kimodo = the animator; this loop only says where/when.
#   stage: person A stands at the origin facing +z; person B stands S metres in front facing back: B's (x, y, z) = (-x, y, S - z).
#   touch: both hands pinned to the SAME midpoint over the touch span (span found in the draft: when both reach out most).
#   hit:   the attacker's fist → the midpoint between fist and the receiver's face; the receiver gets a FULL-BODY keyframe at the
#          hit with the head moved there, holds still before it (no flinch) and is pushed back along the punch after it.
# scene = {"people": [promptA, promptB], "seconds", "kind": "touch"|"hit", "takes", "seed", "steps", "couple_from",
#          "touch": {"hand", "span_s"}, "hit": {"limb", "window_s": [a, b], "radius", "back"}}
@app.function(image=image, gpu="L4", timeout=1800, volumes={"/cache": cache}, secrets=[modal.Secret.from_name("huggingface-secret")], max_containers=5)
def generate_group(scene: dict) -> dict:
    import io, time, numpy as np, torch
    from kimodo import DEFAULT_MODEL, load_model
    from kimodo.constraints import FullBodyConstraintSet, Root2DConstraintSet, RightHandConstraintSet, LeftHandConstraintSet
    from kimodo.motion_rep.feature_utils import length_to_mask
    from kimodo.postprocess import post_process_motion
    from kimodo.skeleton import SOMASkeleton30
    from kimodo.tools import seed_everything, to_numpy
    t_start = time.time(); dev = "cuda:0"
    model = load_model(DEFAULT_MODEL, device=dev, default_family="Kimodo"); cache.commit()
    sk = model.skeleton; bi = sk.bone_index; mr = model.motion_rep
    seed_everything(int(scene.get("seed", 1)))
    people = scene["people"]; N = len(people); K = int(scene.get("takes", 2)); B = N * K
    T = int(scene["seconds"] * model.fps); steps = int(scene.get("steps", 100)); k_from = float(scene.get("couple_from", 0.3))
    texts = [people[i % N] for i in range(B)]  # (take j, person i) = batch row j*N + i
    lengths = torch.tensor([T] * B, device=dev); pad = length_to_mask(lengths)
    tf, tl = model.text_encoder(texts); tf = tf.to(dev)
    tpm = torch.arange(tf.shape[1], device=dev).expand(B, tf.shape[1]) < torch.tensor(tl, device=dev)[:, None]
    heading = torch.zeros(B, device=dev)
    use_ts, map_t = model.diffusion.space_timesteps(steps); model.diffusion.calc_diffusion_vars(use_ts)
    cur = torch.randn((B, T, mr.motion_rep_dim), device=dev)
    om = mm = None; cons = [[] for _ in range(B)]; plan = {}; log = []
    H = bi["RightHand"] if scene.get("touch", {}).get("hand", "RightHand") == "RightHand" else bi["LeftHand"]
    HEAD, HIPS, NECK = bi["Head"], bi["Hips"], bi.get("Neck1", bi["Head"])
    mir = lambda p, S: torch.stack([-p[..., 0], p[..., 1], S - p[..., 2]], -1)

    def couple(out):
        # (like Kimodo's own loader: picture numbers on the normal processor, body data on the graphics card — Oct 16 G1 runs 1-2)
        P, R, r2 = out["posed_joints"].float(), out["global_rot_mats"].float(), out["smooth_root_pos"][..., [0, 2]].float()
        new = []
        for j in range(K):
            a, b = j * N, j * N + 1
            if scene["kind"] == "touch":
                if j not in plan:
                    # (the touch moment comes from the draft: when both right hands are furthest out in front, together)
                    reach = (P[a, :, H, 2] - P[a, :, HIPS, 2]) + (P[b, :, H, 2] - P[b, :, HIPS, 2])
                    lo, hi = int(0.25 * T), int(0.8 * T); fc = lo + int(torch.argmax(reach[lo:hi]))
                    half = int(scene["touch"]["span_s"] * model.fps / 2); f0, f1 = max(1, fc - half), min(T - 2, fc + half)
                    S = float(max(P[a, fc, H, 2] + P[b, fc, H, 2], P[a, fc, HIPS, 2] + P[b, fc, HIPS, 2] + 0.7))
                    plan[j] = {"S": S, "f0": f0, "f1": f1}
                S, f0, f1 = plan[j]["S"], plan[j]["f0"], plan[j]["f1"]
                fs = torch.arange(f0, f1 + 1, 2, device="cpu")
                pa = P[a, fs, H]; pbl = P[b, fs, H]; m = (pa + mir(pbl, S)) / 2
                da = m - pa; db = mir(m, S) - pbl
                Cls = RightHandConstraintSet if H == bi["RightHand"] else LeftHandConstraintSet
                new.append([Cls(sk, fs, P[a, fs] + da[:, None], R[a, fs], r2[a, fs] + da[:, [0, 2]])])
                new.append([Cls(sk, fs, P[b, fs] + db[:, None], R[b, fs], r2[b, fs] + db[:, [0, 2]])])
            else:
                hit = scene["hit"]; L = bi[hit.get("limb", "RightHand")]; rad = float(hit.get("radius", 0.09))
                if j not in plan:
                    # (the strike = the attacker's fist furthest out in front of the neck inside the window)
                    reach = P[a, :, L, 2] - P[a, :, NECK, 2]
                    lo, hi = int(hit["window_s"][0] * model.fps), int(hit["window_s"][1] * model.fps); fh = lo + int(torch.argmax(reach[lo:hi]))
                    S = float(max(P[a, fh, L, 2] + P[b, fh, HEAD, 2] + rad, P[a, fh, HIPS, 2] + P[b, fh, HIPS, 2] + 0.7))
                    plan[j] = {"S": S, "fh": fh}
                S, fh = plan[j]["S"], plan[j]["fh"]
                fist = P[a, fh, L]; face = mir(P[b, fh, HEAD], S) - torch.tensor([0, 0, rad], device=dev)
                m = (fist + face) / 2
                fa = torch.tensor([fh, fh + 1], device="cpu")
                da = m - fist
                Cls = RightHandConstraintSet if L == bi["RightHand"] else LeftHandConstraintSet
                ca = [Cls(sk, fa, P[a, fa] + da, R[a, fa], r2[a, fa] + da[[0, 2]])]
                # receiver: whole body at the hit, head moved onto the fist (+ radius); still before; knocked back after
                hb_goal = mir(m + torch.tensor([0, 0, rad], device=dev), S); db = hb_goal - P[b, fh, HEAD]
                fb = torch.tensor([fh], device="cpu")
                cb = [FullBodyConstraintSet(sk, fb, P[b, fb] + db, R[b, fb], r2[b, fb] + db[[0, 2]])]
                base = r2[b, fh] + db[[0, 2]]; back = float(hit.get("back", 0.8)); idx, pts = [], []
                # (still only in the half second before the hit — pinning from picture 0 fought Kimodo's own start: head jumped, Oct 16 G1)
                for f in (list(range(max(6, fh - 15), fh - 2, 3)) if hit.get("hold", False) else []) + list(range(fh + 3, T, 3)):
                    u = 0.0 if f < fh else min(1.0, (f - fh) / (0.6 * model.fps)); push = back * (1 - (1 - u) ** 2)
                    idx.append(f); pts.append(base + torch.tensor([0.0, -push], device=dev))
                cb.append(Root2DConstraintSet(sk, torch.tensor(idx, device="cpu"), torch.stack(pts)))
                new += [ca, cb]
        return new

    for n, i in enumerate(reversed(range(steps))):
        t = torch.tensor([i] * B, device=dev)
        with torch.inference_mode():
            pred = model.denoiser([2.0, 2.0], cur, pad, tf, tpm, map_t[t], heading, mm, om, cfg_type=None)
        if n >= int(k_from * steps) and n < steps - 1:
            with torch.inference_mode():
                out = mr.inverse(pred, is_normalized=True, return_numpy=False)
                cons = couple(out)
                om, mm = mr.create_conditions_from_constraints_batched(cons, lengths, to_normalize=True, device=dev)
                if mm.dtype == torch.bool: mm = 1 * mm
        with torch.inference_mode():
            cur = model.sampler(use_ts, cur, pred, t)
    with torch.inference_mode():
        out = mr.inverse(cur, is_normalized=True, return_numpy=False)
        if scene.get("post", True):
            out.update(post_process_motion(out["local_rot_mats"], out["root_positions"], out["foot_contacts"], sk, cons))
        if isinstance(sk, SOMASkeleton30): out = sk.output_to_SOMASkeleton77(out)
    out = to_numpy(out); npzs = []
    for r in range(B):
        buf = io.BytesIO(); np.savez(buf, **{k: v[r] for k, v in out.items() if hasattr(v, "shape") and len(v.shape) and v.shape[0] == B}); npzs.append(buf.getvalue())
    return {"ok": True, "npzs": npzs, "N": N, "K": K, "plan": plan, "secs": round(time.time() - t_start, 1)}


# INTERACTION LIBRARY TEST (Oct 16, PM v3 + Fable, Arthur OK, $3 cap): a VIDEO AI (Wan 2.2 TI2V-5B, Apache 2.0, open weights — we only
# pay the graphics card) films BOTH people in ONE event, then a ready-made pose reader (rtmlib RTMPose, Apache 2.0) finds every
# person's joints in every picture. Our engine only converts those joints into stick figures (like Kimodo clips) — no motion is
# hand-made. Kimodo stays the animator for single people.
WAN = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
vimage = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("diffusers==0.35.1", "transformers==4.56.1", "accelerate", "ftfy", "imageio", "imageio-ffmpeg", "sentencepiece", "huggingface_hub",
                 "numpy<2.3", "rtmlib==0.0.13", "onnxruntime==1.20.1", "opencv-python-headless")
    .env({"HF_HOME": "/cache/hf"})
)


@app.function(image=vimage, timeout=3600, volumes={"/cache": cache}, cpu=2, memory=8192)
def wan_download() -> str:
    from huggingface_hub import snapshot_download
    p = snapshot_download(WAN); cache.commit(); return p


def _poses(path):
    # every person's 17 body points in every picture (COCO order), with confidence
    import cv2, numpy as np
    from rtmlib import Body
    body = Body(mode="balanced", backend="onnxruntime", device="cpu")
    cap = cv2.VideoCapture(path); out = []
    while True:
        ok, img = cap.read()
        if not ok: break
        k, s = body(img); out.append({"k": np.asarray(k).round(1).tolist(), "s": np.asarray(s).round(3).tolist()})
    return out, [int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))]


@app.function(image=vimage, gpu="H100", timeout=1800, volumes={"/cache": cache}, max_containers=3)
def wan_video(prompt: str, seeds: list, steps: int = 40, frames: int = 121) -> list:
    import time, torch
    from diffusers import AutoencoderKLWan, WanPipeline
    from diffusers.utils import export_to_video
    t0 = time.time()
    vae = AutoencoderKLWan.from_pretrained(WAN, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(WAN, vae=vae, torch_dtype=torch.bfloat16).to("cuda")
    neg = "camera moving, zoom, cut, blurry, extra limbs, merged bodies, deformed hands, extra people, text, watermark, cropped body, out of frame"
    res = []
    for sd in seeds:
        t1 = time.time()
        fr = pipe(prompt=prompt, negative_prompt=neg, height=704, width=1280, num_frames=frames, guidance_scale=5.0, num_inference_steps=steps,
                  generator=torch.Generator("cuda").manual_seed(int(sd))).frames[0]
        p = f"/tmp/v{sd}.mp4"; export_to_video(fr, p, fps=24)
        poses, size = _poses(p)
        res.append({"seed": sd, "mp4": open(p, "rb").read(), "poses": poses, "size": size, "secs": round(time.time() - t1, 1)})
    res.append({"total_secs": round(time.time() - t0, 1)})
    return res


@app.function(image=vimage, timeout=300, cpu=2)
def video_tiles(mp4: bytes, every: int = 10) -> bytes:
    # (a picture sheet of a video — every 10th picture — to look at it before converting anything)
    import subprocess
    open("/tmp/v.mp4", "wb").write(mp4)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "/tmp/v.mp4", "-vf", f"select='not(mod(n\\,{every}))',scale=400:-1,tile=4x3", "-frames:v", "1", "/tmp/t.jpg"], check=True)
    return open("/tmp/t.jpg", "rb").read()


# ARDY TEST (Oct 16, PM v3 + Fable, Arthur GO): NVIDIA ARDY = the same team's LIVE (streaming) Kimodo — same Bones Rigplay data,
# code Apache-2.0, weights NVIDIA Open Model License. First a blind test of ONE person (body quality vs Kimodo) before any
# two-actor work. Text encoder = gated Llama-3-8B via the same Modal secret (never printed).
aimage = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "cmake", "build-essential")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", index_url="https://download.pytorch.org/whl/cu124")
    .run_commands("git clone --depth 1 https://github.com/nv-tlabs/ardy /ardy", "cd /ardy && pip install -e .")
    .env({"HF_HOME": "/cache/hf", "TORCH_HOME": "/cache/torch"})
)


@app.function(image=aimage, gpu="L4", timeout=2400, volumes={"/cache": cache}, secrets=[modal.Secret.from_name("huggingface-secret")])
def ardy_batch(jobs: list, model: str = "soma-kimodo") -> list:
    # jobs = [(name, prompt, seconds, seed)] — one container, the text encoder served once for all of them
    import glob, io, os, subprocess, time, numpy as np
    log = open("/tmp/enc.log", "w"); srv = subprocess.Popen(["python", "scripts/run_text_encoder_server.py"], cwd="/ardy", stdout=log, stderr=subprocess.STDOUT)
    t0 = time.time()
    while time.time() - t0 < 400:
        s = open("/tmp/enc.log").read()
        if "Uvicorn running" in s or "Running on" in s or "Application startup complete" in s or srv.poll() is not None: break
        time.sleep(3)
    out = []
    for name, prompt, secs, seed in jobs:
        stem = f"/tmp/a/{name}"; os.makedirs("/tmp/a", exist_ok=True)
        r = subprocess.run(["python", "scripts/generate.py", prompt, "--model", model, "--duration", str(secs), "--seed", str(seed), "--output", stem], cwd="/ardy", capture_output=True, text=True)
        fs = sorted(glob.glob(f"{stem}*.npz") + glob.glob(f"{stem}/**/*.npz", recursive=True))
        if r.returncode or not fs: out.append({"name": name, "ok": False, "log": (r.stdout[-1500:] + r.stderr[-2500:])}); continue
        d = dict(np.load(fs[0], allow_pickle=True)); buf = io.BytesIO(); np.savez(buf, **d)
        out.append({"name": name, "ok": True, "npz": buf.getvalue(), "joints": int(d["posed_joints"].shape[1]), "fps": float(d.get("fps", 30))})
    srv.terminate(); cache.commit()
    out.append({"encoder_log": open("/tmp/enc.log").read()[-800:], "secs": round(time.time() - t0, 1)})
    return out


@app.function(image=aimage, timeout=300)
def asrc(files: str) -> str:
    # (read ARDY's installed source — no graphics card — for the two-actor loop)
    import subprocess
    return subprocess.run(f"cd /ardy && ls -R ardy | head -60; for f in {files}; do echo \"=== $f\"; cat $f; done", shell=True, capture_output=True, text=True).stdout


@app.function(image=aimage, gpu="L4", timeout=1800, volumes={"/cache": cache}, secrets=[modal.Secret.from_name("huggingface-secret")], max_containers=4)
def ardy_gen(prompt: str, duration=5.0, seed: int = 1, constraints=None, num_samples: int = 1) -> dict:
    # (same call shape as generate() above, so make_clips.py can switch animator — Oct 16 two-person comparison)
    import glob, io, json, os, subprocess, numpy as np
    secs = sum(duration) if isinstance(duration, (list, tuple)) else float(duration)
    os.makedirs("/tmp/a", exist_ok=True); [os.remove(f) for f in glob.glob("/tmp/a/**/*", recursive=True) if os.path.isfile(f)]
    cmd = ["python", "scripts/generate.py", prompt, "--model", "soma-kimodo", "--duration", str(round(secs + 0.05, 2)), "--seed", str(seed), "--output", "/tmp/a/out"]
    if constraints: json.dump(constraints, open("/tmp/a/c.json", "w")); cmd += ["--constraints", "/tmp/a/c.json"]
    if num_samples > 1: cmd += ["--num_samples", str(num_samples)]
    r = subprocess.run(cmd, cwd="/ardy", capture_output=True, text=True); cache.commit()
    fs = sorted(glob.glob("/tmp/a/**/*.npz", recursive=True))
    if r.returncode or not fs: return {"ok": False, "log": r.stdout[-1000:] + r.stderr[-2000:]}
    out = []
    for f in fs:
        d = dict(np.load(f, allow_pickle=True)); buf = io.BytesIO(); np.savez(buf, **d); out.append(buf.getvalue())
    return {"ok": True, "npz": out[0], "npzs": out}


# KIMODO MAKES THE TOUCH (Oct 17 PM v5 + Fable + critic, Arthur OK — "the touch is never inside the generated motion; every glue
# step is a visible cheat"). ONE job: (1) the LEADER and the FOLLOWER's free DRAFTS (2 noise seeds) with no constraints;
# (2) the follower is placed facing the leader (the hands meet when both reach out furthest) and the leader's REAL hand path
# during the touch is turned into the follower's own space; (3) the follower is made AGAIN from the SAME noise with HAND-ONLY
# targets (only the hand's own joints are moved onto the leader's hand; hips, rotations and everything else = its own draft), set
# ONCE before denoising — Kimodo sees them ahead and plans its own wind-up, timing and pump. Raw and post-processed returned.
@app.function(image=image, gpu="L4", timeout=1800, volumes={"/cache": cache}, secrets=[modal.Secret.from_name("huggingface-secret")], max_containers=5)
def generate_follow(spec: dict) -> dict:
    import io, math, time, numpy as np, torch
    from kimodo import DEFAULT_MODEL, load_model
    from kimodo.constraints import RightHandConstraintSet, LeftHandConstraintSet
    from kimodo.motion_rep.feature_utils import length_to_mask
    from kimodo.postprocess import post_process_motion
    from kimodo.skeleton import SOMASkeleton30
    from kimodo.tools import seed_everything, to_numpy
    t_start = time.time(); dev = "cuda:0"
    model = load_model(DEFAULT_MODEL, device=dev, default_family="Kimodo"); cache.commit()
    sk = model.skeleton; bi = sk.bone_index; mr = model.motion_rep
    T = int(spec["seconds"] * model.fps); steps = int(spec.get("steps", 100)); S = int(spec.get("seeds", 2))
    hand = spec.get("hand", "RightHand"); H = bi[hand]; HIPS = bi["Hips"]
    chain = [i for n, i in bi.items() if n.startswith(hand)]  # (the hand's own joints: wrist, fingers, hand end)
    legs = sorted([(i, n) for n, i in bi.items() if "Leg" in n or "Thigh" in n])
    LL = next(i for i, n in legs if n.startswith("Left")); RL = next(i for i, n in legs if n.startswith("Right"))

    def run(texts, noise, cons):
        B = len(texts); lengths = torch.tensor([T] * B, device=dev); pad = length_to_mask(lengths)
        tf, tl = model.text_encoder(texts); tf = tf.to(dev)
        tpm = torch.arange(tf.shape[1], device=dev).expand(B, tf.shape[1]) < torch.tensor(tl, device=dev)[:, None]
        heading = torch.zeros(B, device=dev); use_ts, map_t = model.diffusion.space_timesteps(steps); model.diffusion.calc_diffusion_vars(use_ts)
        cur = noise.clone(); om = mm = None
        if any(len(c) for c in cons):
            with torch.inference_mode():
                om, mm = mr.create_conditions_from_constraints_batched(cons, lengths, to_normalize=True, device=dev)
            if mm.dtype == torch.bool: mm = 1 * mm
        for i in reversed(range(steps)):
            t = torch.tensor([i] * B, device=dev)
            with torch.inference_mode():
                pred = model.denoiser([2.0, 2.0], cur, pad, tf, tpm, map_t[t], heading, mm, om, cfg_type=None)
                cur = model.sampler(use_ts, cur, pred, t)
        with torch.inference_mode():
            out = mr.inverse(cur, is_normalized=True, return_numpy=False)
        return out

    def pack(out, rows, post_cons=None):
        res = []
        for r in rows:
            o = {k: v[r:r + 1] for k, v in out.items() if hasattr(v, "shape") and len(v.shape) and v.shape[0] == len(out["posed_joints"])}
            if post_cons is not None:
                with torch.inference_mode():
                    o.update(post_process_motion(o["local_rot_mats"], o["root_positions"], o["foot_contacts"], sk, [post_cons[r]]))
            if isinstance(sk, SOMASkeleton30): o = sk.output_to_SOMASkeleton77(o)
            o = to_numpy(o); buf = io.BytesIO(); np.savez(buf, **{k: v[0] for k, v in o.items() if hasattr(v, "shape") and len(v.shape)}); res.append(buf.getvalue())
        return res

    def front(P):  # (the body's real front from the hips' left→right line — R2b: front = −perp)
        v = P[:, RL] - P[:, LL]; f = np.stack([v[:, 2], -v[:, 0]], 1); return f / np.maximum(1e-6, np.linalg.norm(f, axis=1, keepdims=True))

    HEADJ = bi["Head"]
    def moments(P):
        # (THE RIGHT MOMENT PER ACTION, beat round — Arthur's 2nd high five slapped 26 pictures apart: "furthest forward" is a fist
        # bump's moment, a HIGH FIVE's slap is the hand at its HIGHEST while reaching forward)
        fr = front(P); rch = ((P[:, H, [0, 2]] - P[:, HIPS, [0, 2]]) * fr).sum(1)
        if spec.get("action") == "highfive": rch = (P[:, H, 1] - P[:, HEADJ, 1]) + 0.5 * np.maximum(rch, 0)
        lo, hi = int(0.2 * T), int(0.9 * T); pk = lo + int(np.argmax(rch[lo:hi])); base = float(np.median(rch[:int(0.3 * model.fps)]))
        top = base + 0.85 * (rch[pk] - base); c0 = pk
        while c0 > 0 and rch[c0 - 1] >= top: c0 -= 1
        c1 = pk
        while c1 < T - 1 and rch[c1 + 1] >= top: c1 += 1
        st = pk
        while st > 0 and rch[st] > base + 0.15 * (rch[pk] - base): st -= 1
        # (THE REAL LET GO = the arm back under half its reach; try 4: targets that stopped at 85% let the hands loosen to 7–17 cm
        # while both arms were still out)
        rel = c1
        while rel < T - 1 and rch[rel + 1] >= base + 0.5 * (rch[pk] - base): rel += 1
        return {"start": st, "c0": c0, "touch": pk, "c1": c1, "rel": rel, "reach": float(rch[pk]), "rest": base}

    seed_everything(int(spec.get("seed", 11)))
    D = model.motion_rep.motion_rep_dim; NL = int(spec.get("leaders", 3))
    noise = torch.randn((NL + S, T, D), device=dev)
    o1 = run([spec["leader"]] * NL + [spec["follower"]] * S, noise, [[] for _ in range(NL + S)])
    Pall = o1["posed_joints"].float().cpu().numpy()
    # (ONE CONTINUOUS TOUCH, try 4 — the leader take of try 3 let go and grabbed AGAIN: keep the leader take whose reach has ONE
    # plateau — after the let go it never comes back above 70% of the peak — and the longest hold)
    def one_touch(Pq):
        m = moments(Pq); fr = front(Pq); rch = ((Pq[:, H, [0, 2]] - Pq[:, HIPS, [0, 2]]) * fr).sum(1)
        after = rch[min(T - 1, m["c1"] + 6):]; before = rch[:max(1, m["c0"] - 6)]
        again = (after.max() if len(after) else -9) > m["rest"] + 0.7 * (m["reach"] - m["rest"]) or (before.max() if len(before) else -9) > m["rest"] + 0.7 * (m["reach"] - m["rest"])
        # (+ a CLEAN let go, try 6: a leader that droops its arm out for 1.5 s made the follower chase the hand or loosen 7–17 cm)
        # (+ a BIG VISIBLE PUMP for holds, mixed round — Arthur: "not a handshake": the hand's up-down range during the hold, ≥10 cm)
        pump = float(np.ptp(Pq[m["c0"]:m["c1"] + 1, H, 1])) if spec.get("kind") == "hold" and m["c1"] > m["c0"] else 0.0
        return (0 if again else 1, min(pump, 0.12), -max(0, m["rel"] - m["c1"] - 8), m["c1"] - m["c0"])
    if spec.get("freeOnly"):
        # (HITS, mixed round: both people FREE — no targets at all, so Kimodo's own wind-up and snap stay; the client picks takes)
        return {"ok": True, "fps": model.fps, "leaders": pack(o1, list(range(NL))), "drafts": pack(o1, list(range(NL, NL + S))), "ver": "beat-1", "secs": round(time.time() - t_start, 1)}
    li = max(range(NL), key=lambda q: one_touch(Pall[q]))
    keep = [li] + list(range(NL, NL + S))
    P = Pall[keep]; R = o1["global_rot_mats"].float()[keep]; r2 = o1["smooth_root_pos"][..., [0, 2]].float()[keep]
    noise = torch.cat([noise[li:li + 1], noise[NL:]]); o1 = {k: (v[keep] if hasattr(v, "shape") and len(v.shape) and v.shape[0] == NL + S else v) for k, v in o1.items()}
    mL = moments(P[0]); fL = front(P[0])
    cons, info = [], []
    HEAD = bi["Head"]
    if spec.get("kind") == "strike":
        # (A PUNCH: the RECEIVER leads — the critic + Fable. Its head SNAP = the head moving backward fastest after 0.8 s; the
        # attacker's fist must arrive on the face exactly then)
        fr0 = front(P[0]); hv = -((np.diff(P[0][:, HEAD, [0, 2]] - 0 * P[0][:, HIPS, [0, 2]], axis=0)) * fr0[1:]).sum(1)
        # (THE HIT = the FIRST moment the head starts snapping back (over half its top backward speed), not the fastest — T7: the
        # fastest was mid-stagger, the receiver had already moved back and the attacker was placed inside where it started)
        lo = int(0.8 * model.fps); top = lo + int(np.argmax(hv[lo:int(0.9 * T)])); snap = top
        while snap > lo and hv[snap - 1] > 0.5 * hv[top]: snap -= 1
        mL["snap"] = snap; mL["headFwd"] = float(((P[0][snap, HEAD, [0, 2]] - P[0][snap, HIPS, [0, 2]]) * fr0[snap]).sum())
    for s in range(S):
        Pd = P[1 + s]; md = moments(Pd); fD = front(Pd)
        if spec.get("kind") == "strike":
            # attacker placed facing the receiver, its fist's best reach landing on the face (head radius ≈ 0.1 m in front of it)
            # (≥0.8 m hip to hip at the hit, like real people — T7/T8: reach + a head already snapping back put them 35 cm apart and
            # the bodies stood inside each other; further away, Kimodo itself makes the attacker step in to land the fist)
            sn_ = mL["snap"]; dist = max(float(spec.get("minDist", 0.8)), md["reach"] + mL["headFwd"] - 0.1)
            anchor = P[0, sn_, HIPS, [0, 2]] + fL[sn_] * dist
            a_from = math.atan2(-fL[sn_][1], -fL[sn_][0]); a_to = math.atan2(fD[md["touch"]][1], fD[md["touch"]][0]); th = a_to - a_from
            c, sn = math.cos(th), math.sin(th); Rz = np.array([[c, -sn], [sn, c]])
            to_d = lambda p: np.array([(Rz @ (p[[0, 2]] - anchor))[0] + Pd[md["touch"], HIPS, 0], p[1], (Rz @ (p[[0, 2]] - anchor))[1] + Pd[md["touch"], HIPS, 2]])
            face = to_d(P[0, sn_, HEAD]) - np.array([fD[md["touch"]][0], 0, fD[md["touch"]][1]]) * 0.1
            back = face - np.array([fD[md["touch"]][0], 0, fD[md["touch"]][1]]) * 0.25  # (2 pictures earlier, on the strike line)
            frames = [f for f in (sn_ - 3, sn_) if 2 <= f <= T - 3]; goals = [back, face][-len(frames):]
            pos = Pd[frames].copy()
            for n, f in enumerate(frames): pos[n, chain] += goals[n] - Pd[f, H]
            fs = torch.tensor(frames, device="cpu"); Cls = RightHandConstraintSet if hand == "RightHand" else LeftHandConstraintSet
            cons.append([Cls(sk, fs, torch.tensor(pos, device=dev), R[1 + s, fs], r2[1 + s, fs])])
            info.append({"theta": th, "anchor": anchor.tolist(), "dTouchHips": Pd[md["touch"], HIPS, [0, 2]].tolist(), "frames": frames, "leader": mL, "draft": md})
            continue
        # (PLACEMENT: the follower stands facing the leader, as far away as both arms reach at the touch — hands meet, bodies apart)
        dist = mL["reach"] + md["reach"] + float(spec.get("gap", 0.0))
        anchor = P[0, mL["touch"], HIPS, [0, 2]] + fL[mL["touch"]] * dist
        a_from = math.atan2(-fL[mL["touch"]][1], -fL[mL["touch"]][0]); a_to = math.atan2(fD[md["touch"]][1], fD[md["touch"]][0]); th = a_to - a_from
        c, sn = math.cos(th), math.sin(th); Rz = np.array([[c, -sn], [sn, c]])
        to_d = lambda p: np.concatenate([[(Rz @ (p[[0, 2]] - anchor))[0] + Pd[md["touch"], HIPS, 0]], [p[1]], [(Rz @ (p[[0, 2]] - anchor))[1] + Pd[md["touch"], HIPS, 2]]])[[0, 1, 2]]
        # (TARGETS: one at the leader's "arm starts" = the follower's own resting hand; then every 3 pictures (~4 Kimodo frames) of
        # the touch, the follower's hand ON the leader's real hand, a little toward the follower so they meet palm to palm)
        k = int(spec.get("every", max(2, int(round(model.fps / 8)))))  # (try 1: every 4 frames drifted 3–10 cm; try 2: every 2)
        # (targets through the hold and a few pictures into the let go — never chasing the leader's hand back to its body: try 5's lean)
        end = min(mL["rel"], mL["c1"] + 6)
        frames = sorted(set([mL["start"]] + list(range(mL["c0"], end + 1, k)) + [end]))
        frames = [f for f in frames if 2 <= f <= T - 3]
        pos = Pd[frames].copy()
        for n, f in enumerate(frames):
            goal = Pd[md["start"], H] if f == mL["start"] else to_d(P[0, f, H]) - np.array([fD[md["touch"]][0], 0, fD[md["touch"]][1]]) * float(spec.get("palm", 0.04))
            pos[n, chain] += goal - Pd[f, H]
        fs = torch.tensor(frames, device="cpu")
        Cls = RightHandConstraintSet if hand == "RightHand" else LeftHandConstraintSet
        cons.append([Cls(sk, fs, torch.tensor(pos, device=dev), R[1 + s, fs], r2[1 + s, fs])])
        info.append({"theta": th, "anchor": anchor.tolist(), "dTouchHips": Pd[md["touch"], HIPS, [0, 2]].tolist(), "frames": frames, "leader": mL, "draft": md})
    o2 = run([spec["follower"]] * S, noise[1:], cons)
    return {"ok": True, "fps": model.fps, "leader": pack(o1, [0])[0], "drafts": pack(o1, list(range(1, 1 + S))),
            "raw": pack(o2, list(range(S))), "post": pack(o2, list(range(S)), post_cons=cons), "info": info, "leaderTake": li, "ver": "mixed-1", "secs": round(time.time() - t_start, 1)}
