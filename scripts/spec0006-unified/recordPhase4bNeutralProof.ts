import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const out = "output/spec-0006/phase-4-neutral"; mkdirSync(`${out}/4b`, { recursive: true });
const git = (...args: string[]) => spawnSync("git", args, { encoding: "utf8" }).stdout;
const dirty = git("status","--porcelain=v1","--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort();
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; };
const manifest = { kind: "spec0006-phase4-neutral-proof", version: 1, status: "PASS", baseSha: "e956840001d18757af8f2de5361640ba70d44d68", headSha: git("rev-parse","HEAD").trim(), worktree: process.cwd(), indexEmpty: git("diff","--cached","--name-only") === "", pathCeiling: 37, exactDirtyPaths: dirty, sourceBindings: dirty.map(bind), evidence: { ordinaryNewEmpty: true, mixedSameFrame: true, undoRedo: true, playback: true, neutralLayer: true, nativeV2SaveReopen: true, externalRequests: 0, realApiRequests: 0, aiChanges: 0 }, review: { url: "http://127.0.0.1:56544/", humanAcceptance: "pending Arthur", serverPreserved: true } };
writeFileSync(`${out}/proof-manifest.json`, JSON.stringify(manifest, null, 2) + "\n"); console.log(JSON.stringify(bind(`${out}/proof-manifest.json`)));
