import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BASE_SHA = "740eb70d2c713bf6bf8bd08123a0ed5eef3bc34d";
const outputDirectory = "output/spec-0006/phase-5";
const acceptedManifestPath = `${outputDirectory}/accepted-before-gesture-manifest.json`;
const acceptedManifest = JSON.parse(readFileSync(acceptedManifestPath, "utf8"));
const blockedCloseout = process.argv.includes("--blocked");
const exactAllowlist = [
  "scripts/fixtures/spec0006-unified/v2/phase5-tools-library-cases.json",
  "scripts/spec0006-unified/phase4aNeutralFixtureFactory.ts",
  "scripts/spec0006-unified/phase5BrowserProof.ts",
  "scripts/spec0006-unified/phase5CatalogOracle.ts",
  "scripts/spec0006-unified/phase5CorrectionBrowser.mjs",
  "scripts/spec0006-unified/recordPhase5Proof.ts",
  "scripts/spec0006-unified/validatePhase5Proof.ts",
  "scripts/spec0006-unified/validatePhase5ToolsLibrary.ts",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingTimelineRow.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/unifiedAnimationContentV2.ts",
  "src/lib/animation/unifiedAnimationContractV2.ts",
  "src/lib/animation/unifiedProjectCatalogV2.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts",
  "src/lib/animation/unifiedStageGeometry.ts",
].sort();

mkdirSync(outputDirectory, { recursive: true });
const git = (...args: string[]) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout;
};
const bind = (path: string) => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
const dirty = git("status", "--porcelain=v1", "--untracked-files=all")
  .split("\n").filter(Boolean).map(line => line.slice(3)).sort();
if (JSON.stringify(dirty) !== JSON.stringify(exactAllowlist)) {
  throw new Error(`dirty_path_mismatch:${JSON.stringify(dirty)}`);
}

const commands = [
  { name: "typescript", command: "./node_modules/.bin/tsc", args: ["--noEmit"] },
  { name: "eslint", command: "./node_modules/.bin/eslint", args: [
    "src/lib/animation/unifiedAnimationContentV2.ts",
    "src/lib/animation/unifiedAnimationContractV2.ts",
    "src/lib/animation/unifiedProjectCatalogV2.ts",
    "src/lib/animation/unifiedProjectStorageV2.ts",
    "src/lib/animation/unifiedStageGeometry.ts",
    "src/components/workspace/AnimationWorkspace.tsx",
    "src/components/workspace/DrawingWorkspace.tsx",
    "src/components/workspace/DrawingCanvas.tsx",
    "src/components/workspace/DrawingTimelineRow.tsx",
    "scripts/spec0006-unified/phase4aNeutralFixtureFactory.ts",
    "scripts/spec0006-unified/phase5CatalogOracle.ts",
    "scripts/spec0006-unified/validatePhase5ToolsLibrary.ts",
    "scripts/spec0006-unified/phase5BrowserProof.ts",
    "scripts/spec0006-unified/phase5CorrectionBrowser.mjs",
    "scripts/spec0006-unified/recordPhase5Proof.ts",
    "scripts/spec0006-unified/validatePhase5Proof.ts",
  ] },
  { name: "diff-check", command: "git", args: ["diff", "--check"] },
  { name: "phase1-migration", command: "node", args: ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase1Migration.ts"] },
  { name: "phase5-tools-library", command: "node", args: ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase5ToolsLibrary.ts"] },
  { name: "phase5-browser", command: "node", args: ["--experimental-strip-types", "scripts/spec0006-unified/phase5BrowserProof.ts"] },
  { name: "phase4a-foundation", command: "node", args: ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase4aNeutralFoundation.ts"] },
  { name: "phase4b-workspace", command: "node", args: ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase4bNeutralWorkspace.ts"] },
  { name: "application-build", command: "./node_modules/.bin/next", args: ["build", "--webpack", "--debug-build-paths", "app/page.tsx"] },
] as const;
const commandResults = commands.map(({ name, command, args }) => {
  const result = spawnSync(command, args, { encoding: "utf8", env: { ...process.env, NEXT_FONT_GOOGLE_MOCKED_RESPONSES: "/tmp/spec0006_phase5_font_mock.js" } });
  return { name, command: [command, ...args].join(" "), exitCode: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
});
writeFileSync(`${outputDirectory}/command-results.json`, JSON.stringify(commandResults, null, 2) + "\n");
if (commandResults.some(result => result.exitCode !== 0 && (!blockedCloseout || result.name !== "phase5-browser"))) throw new Error("proof_command_failed");

const evidencePaths = [
  acceptedManifestPath,
  ...acceptedManifest.evidenceBindings.map((binding: {path:string}) => `${outputDirectory}/accepted-before-gesture-evidence/${binding.path.split("/").at(-1)}`),
  `${outputDirectory}/command-results.json`,
  ...["desktop", "compact"].flatMap(profile => {
    const ledger = JSON.parse(readFileSync(`${outputDirectory}/correction3-${profile}.json`, "utf8"));
    if (ledger.status !== "PASS" && !blockedCloseout) throw new Error("browser_proof_failed");
    const gestures = JSON.parse(readFileSync(`${outputDirectory}/gesture-${profile}.json`, "utf8"));
    if (gestures.status !== "PASS" && !blockedCloseout) throw new Error("gesture_proof_failed");
    return [
      `${outputDirectory}/gesture-${profile}.json`,
      ...gestures.steps.map((step: {name: string}) => `${outputDirectory}/gesture-${profile}-${step.name}.log`),
      `${outputDirectory}/correction3-${profile}.json`,
      `${outputDirectory}/correction3-${profile}-layer-1-onion.png`,
      `${outputDirectory}/correction3-${profile}-layer-2-onion.png`,
      `${outputDirectory}/correction3-${profile}-reopened.png`,
      `${outputDirectory}/${profile}-browser-config.json`,
      ...ledger.steps.map((step: {name: string}) => `${outputDirectory}/correction3-${profile}-${step.name}.log`),
    ].filter(path => !blockedCloseout || existsSync(path));
  }),
];
const manifest = {
  kind: "spec0006-phase5-tools-library-proof",
  version: 3,
  status: blockedCloseout ? "INCOMPLETE" : "PASS",
  technicalAcceptance: blockedCloseout ? "BLOCKED" : "PASS",
  blocker: blockedCloseout ? {
    system: "Existing compact timeline layout and navigation",
    observed: "At 390x844 DPR2 the timeline right-panel grid column is 0px wide; its bordered overlay is 2px wide and clips pointer targets. ContextMenu targets selectedTimelineIndex, not currentFrameIndex, and therefore is not an equivalent scrub flow.",
    requiredAuthority: "A separately authorized narrow compact timeline layout correction; no timeline layout code was changed here.",
    desktop: "Full correction replay",
    compact: "Only boot, catalog creation/conversion, and instance transforms are valid complete flows. Timeline-dependent compact evidence is not acceptance proof.",
  } : null,
  baseSha: BASE_SHA,
  headSha: git("rev-parse", "HEAD").trim(),
  worktree: process.cwd(),
  indexEmpty: git("diff", "--cached", "--name-only") === "",
  pathCeiling: 20,
  exactDirtyPaths: dirty,
  sourceBindings: dirty.map(bind),
  acceptedBaseline: {
    manifestSha256: "4d67fc4350929624c04474d3d4475595fd01ff1b29e8e07755d73aeab9430f6c",
    evidenceArchive: `${outputDirectory}/accepted-before-gesture-evidence`,
    changedSinceAcceptance: dirty.filter(path => bind(path).sha256 !== acceptedManifest.sourceBindings.find((binding: {path:string}) => binding.path === path)?.sha256),
  },
  evidenceBindings: evidencePaths.map(bind),
  commands: commandResults,
  evidence: {
    authority: "Separately Arthur/PM-authorized final gesture durability and symbol deselection correction, same accepted Phase 5 worktree; Spec Executor only",
    browserProfiles: ["1440x900 DPR1", "390x844 DPR2"],
    freshBrowserSteps: ["create-catalog", "instance-transforms", "onion-layer-1", "onion-layer-2", "brush-commit", "reopen", "holds-dedupe-barrier", "selection-regressions"],
    gestureBrowserSteps: ["stick-first-gesture", ...["Select", "Lasso"].flatMap(tool => ["Drawing", "Stick", "Mixed"].map(category => `selection-${tool}-${category}`)), "symbol-deselection"],
    gestureDurability: "Per profile: 50 Add Limb and 50 Move Joint first gestures with 1/2/8 pointer samples, 0/8/35ms timing variations and 1400ms post-release observation; exact connected geometry and one-joint-only checks.",
    selectionDurability: "Per profile: all six Select/Lasso x Drawing/Stick/Mixed cases, four moves and four resizes each; release/settle/Undo/Redo document hashes, unrelated raster/rig invariance, scrub and save/reload/Open equality.",
    symbolDeselection: "Empty canvas click and Brush/Lasso/Add Limb/Move Joint activation clear handles; subsequent actions succeed and the placed symbol remains unchanged.",
    payload: "New stick-only/mixed definitions contain validated, hash-bound structured geometry; legacy raster definitions remain raster.",
    onion: "One whole-owner purple/green mask for raster, text, editable rig, and all three symbol categories.",
    brush: "Preview/commit/settle/scrub/undo/redo/reopen pixel hashes; other-layer and other-frame record equality.",
    bitmapAlignment: "Shared integer-center resize/restore/onion offsets; 125 odd/even composition and round-trip assertions, plus real reopen/expanded-timeline pixel equality.",
    timelineLayout: "Unified compact controls stack above full-width lanes; both profiles reserve actual expanded height. Legacy layout and frame activation semantics unchanged.",
    boundaries: "Copied-owner dedupe, hold ownership, blank barriers, onion disabled during playback, catalog immutability.",
    compactTimelineNavigation: blockedCloseout ? "BLOCKED: required ordinary pointer flow is incomplete." : "Ordinary pointer clicks; measured visible cell hit ownership, active frame/layer persistence, non-overlapping compact lanes and zero page overflow.",
    historicalEvidence: "Previous browser-result.json, the earlier INCOMPLETE manifest, and failed fresh replays are superseded. Only bound PASS replays establish fresh proof.",
    externalRequests: 0,
    realApiRequests: 0,
    aiChanges: 0,
  },
  review: { url: "http://127.0.0.1:56555/", serverPreserved: true, humanAcceptance: "pending Arthur" },
};
writeFileSync(`${outputDirectory}/proof-manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: manifest.status, ...bind(`${outputDirectory}/proof-manifest.json`), bindings: manifest.sourceBindings.length }));
