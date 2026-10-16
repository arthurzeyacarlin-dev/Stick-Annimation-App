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
