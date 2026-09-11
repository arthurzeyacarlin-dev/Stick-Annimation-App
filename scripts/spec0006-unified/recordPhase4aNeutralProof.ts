import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const out = "output/spec-0006/phase-4-neutral/4a"; mkdirSync(out, { recursive: true });
const run = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase4aNeutralFoundation.ts"], { encoding: "utf8" });
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
const paths = ["src/lib/animation/unifiedAnimationContentV2.ts","src/lib/animation/unifiedAnimationContractV2.ts","src/lib/animation/unifiedAnimationMigrationV2.ts","src/lib/animation/unifiedWorkspaceFactoryV2.ts","src/lib/animation/unifiedProjectRepositoryV2.ts","src/lib/animation/unifiedProjectStorageV2.ts","scripts/fixtures/spec0006-unified/v2/phase4a-neutral-storage-cases.json","scripts/spec0006-unified/phase4aNeutralFixtureFactory.ts","scripts/spec0006-unified/phase4aNeutralOracle.ts","scripts/spec0006-unified/validatePhase4aNeutralFoundation.ts","scripts/spec0006-unified/recordPhase4aNeutralProof.ts","scripts/spec0006-unified/validatePhase4aNeutralProof.ts"];
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; };
writeFileSync(`${out}/checkpoint.json`, JSON.stringify({ kind: "spec0006-phase4a-checkpoint", status: "PASS", baseSha: "e956840001d18757af8f2de5361640ba70d44d68", paths: paths.map(bind), result: JSON.parse(run.stdout) }, null, 2) + "\n");
console.log(JSON.stringify(bind(`${out}/checkpoint.json`)));
