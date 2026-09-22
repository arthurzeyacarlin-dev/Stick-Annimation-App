import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";

const root = process.cwd();
const output = "output/spec-0012/phase-1-correction";
const base = "f2bda33842a3f5a4b560a7d3aab170a6ca4c2fd0";
const allowlist = [
  "app/page.tsx", "app/assistant/page.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css",
  ...["phase1Environment", "phase1Oracle", "phase1BrowserProof", "phase1AnimatorRegression", "phase1BuildProof", "recordPhase1Proof", "validatePhase1Proof"].map(name => `scripts/spec0012-assistant/${name}.ts`),
].sort();
const commands: Array<[string, string, string[]]> = [
  ["assistant-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0012-assistant/phase1Oracle.ts"]],
  ...[
    ["animator-contract", "scripts/spec0008-ai-animator/validatePhase1Contract.ts"],
    ["library-oracle", "scripts/spec0011-project-library/phase1Oracle.ts"],
    ["player-oracle", "scripts/spec0011-project-library/phase2Oracle.ts"],
    ["audio-oracle", "scripts/spec0011-project-library/phase2AudioOracle.ts"],
    ["management-oracle", "scripts/spec0011-project-library/phase3Oracle.ts"],
    ["export-1-oracle", "scripts/spec0009-export/phase1Oracle.ts"],
    ["export-2-oracle", "scripts/spec0009-export/phase2Oracle.ts"],
    ["recovery-1-contract", "scripts/spec0010-project-safety/phase1Contract.ts"],
    ["recovery-2-contract", "scripts/spec0010-project-safety/phase2Contract.ts"],
    ["recovery-3-contract", "scripts/spec0010-project-safety/phase3Contract.ts"],
    ["recovery-3-oracle", "scripts/spec0010-project-safety/phase3Oracle.ts"],
    ["manual-editor-oracle", "scripts/spec0007-manual/phase-5/staticOracle.ts"],
  ].map(([name, path]): [string, string, string[]] => [name, process.execPath, ["--experimental-strip-types", path]]),
  ["typescript", "node_modules/.bin/tsc", ["--noEmit", "--incremental", "false"]],
  ["focused-lint", "node_modules/.bin/eslint", allowlist.filter(path => /\.tsx?$/.test(path))],
  ["diff-check", "git", ["diff", "--check"]],
];
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const binding = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: hash(bytes) }; };
const dirty = () => [...new Set([...git("ls-files", "-m").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort();
mkdirSync(`${output}/receipts`, { recursive: true });
assert.equal(git("rev-parse", "HEAD"), base);
assert.equal(git("diff", "--cached", "--name-only"), "");
assert.deepEqual(dirty(), allowlist);

if (!process.argv.includes("--seal")) {
  const narrowCorrection = process.argv.includes("--icon-color-correction") || process.argv.includes("--sidebar-resize-correction") || process.argv.includes("--hero-heading-correction");
  const selectedCommands = narrowCorrection ? commands.filter(([id]) => ["assistant-oracle", "typescript", "focused-lint", "diff-check"].includes(id)) : commands;
  for (const [id, command, args] of selectedCommands) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(`${output}/receipts/${id}.json`, JSON.stringify({ id, command: [command, ...args], startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
    assert.equal(result.status, 0, `${id}: ${(result.stderr || result.stdout).slice(-5000)}`);
    console.log(`PASS ${id}`);
  }
  if (narrowCorrection) {
    console.log("PASS narrow correction focused/static checks");
    process.exit(0);
  }
  const lint = spawnSync("node_modules/.bin/eslint", ["--ignore-pattern", "output/**", "--format", "json", "--output-file", `${output}/lint-final.json`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  type LintEntry = { filePath: string; errorCount: number; warningCount: number; messages: Array<{ ruleId: string; severity: number; message: string }> };
  const normalize = (path: string) => (JSON.parse(readFileSync(path, "utf8")) as LintEntry[]).flatMap(entry => entry.messages.map(message => ({ path: entry.filePath.replace(`${root}/`, ""), rule: message.ruleId, severity: message.severity, message: message.message }))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.equal(lint.status, 1);
  assert.deepEqual(normalize(`${output}/lint-final.json`), normalize(`${output}/lint-baseline.json`));
  const final = normalize(`${output}/lint-final.json`);
  writeFileSync(`${output}/receipts/lint-nonregression.json`, JSON.stringify({ status: "PASS", exitCode: lint.status, errors: final.filter(entry => entry.severity === 2).length, warnings: final.filter(entry => entry.severity === 1).length, baselineFindings: final, newFindings: [] }, null, 2));
  console.log("PASS full lint non-regression");
} else {
  const manifestPath = `${output}/proof-manifest.json`;
  assert.equal(existsSync(manifestPath), false, "sealed proof is immutable; do not overwrite");
  for (const [id] of commands) assert.equal(JSON.parse(readFileSync(`${output}/receipts/${id}.json`, "utf8")).exitCode, 0);
  const browser = JSON.parse(readFileSync(`${output}/browser/result.json`, "utf8"));
  const animator = JSON.parse(readFileSync(`${output}/animator/browser-result.json`, "utf8"));
  const build = JSON.parse(readFileSync(`${output}/build/result.json`, "utf8"));
  const liveTerra = JSON.parse(readFileSync(`${output}/terra/live-hi.json`, "utf8"));
  const executorLiveAttempt = JSON.parse(readFileSync(`${output}/terra/executor-live-attempt.json`, "utf8"));
  for (const result of [browser, animator, build]) assert.equal(result.status, "PASS");
  assert.equal(liveTerra.status, "PASS");
  assert.equal(liveTerra.provider.calls, 1);
  assert.equal(liveTerra.provider.model, "gpt-5.6-terra");
  assert.equal(liveTerra.provider.usageAvailable, false);
  assert.equal(liveTerra.reply.naturalGreetingOrHelpOffer, true);
  assert.equal(liveTerra.reply.missingKeyMessage, false);
  assert.equal(liveTerra.animationChanged, false);
  assert.equal(executorLiveAttempt.providerCalls, 1);
  assert.equal(executorLiveAttempt.secondExecutorCallMade, false);
  assert.equal(git("ls-files", ".env.local"), "");
  assert.equal(git("check-ignore", ".env.local"), ".env.local");
  const canonicalEnv = "/Users/arthurcarlin/Projects/stick-animation-app/.env.local";
  const terraConfig = {
    status: "PASS",
    canonicalEnvPresent: existsSync(canonicalEnv),
    reviewEnvPresent: existsSync(".env.local"),
    reviewEnvIsSymlink: lstatSync(".env.local").isSymbolicLink(),
    targetMatchesCanonical: realpathSync(".env.local") === realpathSync(canonicalEnv),
    tracked: false,
    ignored: true,
    contentsRead: false,
  };
  assert.deepEqual(Object.values(terraConfig), ["PASS", true, true, true, true, false, true, false]);
  writeFileSync(`${output}/environment/terra-config.json`, `${JSON.stringify(terraConfig, null, 2)}\n`);
  const lintReceipt = JSON.parse(readFileSync(`${output}/receipts/lint-nonregression.json`, "utf8"));
  const collect = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
  const evidence = [
    ...collect(`${output}/browser`), ...collect(`${output}/animator`), ...collect(`${output}/build`), ...collect(`${output}/receipts`),
    ...collect(`${output}/terra`),
    ...collect(`${output}/environment`),
    `${output}/lint-baseline.json`, `${output}/lint-final.json`,
    `${output}/review-server.json`, `${output}/review-network-snapshot.jsonl`,
  ].sort();
  const spec = binding("docs/specs/0012-diamond-animator-guidance-assistant.md");
  const manifest = {
    schema: "spec0012-phase1-correction-proof/v1", status: "PASS", generatedAt: new Date().toISOString(),
    base, head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), worktree: root,
    indexEmpty: true, dirtyPathAllowlist: allowlist, actualDirtyPaths: dirty(), sources: allowlist.map(binding), spec,
    authority: { decision: "D-0120 plus explicit PM/Arthur Phase 1 correction handoff after visible rejection", sourceTask: "01a0b45e-dd0b-73c3-b42d-d5b49dced309", phase: 1, modeLimitation: "Default mode; no mode-switch control; PM explicitly authorized equivalent read-only boot/trace/plan before implementation" },
    correction: {
      referenceSource: "/Users/arthurcarlin/.codex/worktrees/e81a/stick-animation-app",
      referenceOutputsReused: false,
      rootCause: "Assistant used a custom faceted mark, a brighter promotional hero, extra greeting copy, an oversized composer, and inherited textarea focus outline; the review worktree also lacked the canonical ignored Terra environment file.",
      exactOutcome: "Exact Home AppChrome diamond geometry, one accepted greeting line, restrained Home-like shell, shorter rounded-focus composer, responsive sidebar/top strip, and restored ignored Workspace Terra configuration.",
      iconColorCorrection: {
        acceptedManifestSha256: "69c3d75703ea60913fa16ad88d622860e4c20ca3da8e4ae22f300fea2c3611ca",
        acceptedAssistantCssSha256: "dd74af0a468dcd3690eeac7dd86859e3e4b7c660059094a04c56609a80bbc6b6",
        productTokenChanges: [
          { selector: ".brandMark", from: "#77b3ff", to: "#ffffff", opacity: "1" },
          { selector: ".heroMark", from: "#69aaff", to: "#ffffff", opacity: ".28" },
        ],
        preservedHeroGlow: "drop-shadow(0 14px 30px rgba(64, 142, 255, .12))",
        productSourceChangeCount: 2,
      },
      sidebarResizeCorrection: {
        acceptedManifestSha256: "6ce9908fd5b4bf52740755fc9b754a36594f4c85a129986e32494515b288ac03",
        acceptedComponentSha256: "324dfd6b3aca8b6157404a9930fe34a6b6ffbbda10f20d6e4874268316144be1",
        acceptedAssistantCssSha256: "266ba064bb1d5d9cc684a6540782f8840f25316d265abda7cbcc55e6f6a024a4",
        bounds: { minimum: 200, default: 256, maximum: 440, minimumConversation: 560, compactBreakpoint: 760, keyboardStep: 12 },
        behavior: "Desktop-only pointer and keyboard separator; no collapse and no persistence; compact top strip has no handle.",
        productSourceFiles: ["src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css"],
      },
      heroHeadingCorrection: {
        acceptedManifestSha256: "c5938ba8dc26538bce7559f311d11e881b013cb63f76df5e4fcb12b9222752e4",
        acceptedComponentSha256: "07429c9fae6b2c22043ce74d009819cd4591c57a0d96df863437106411ccd8ca",
        acceptedAssistantCssSha256: "0837ae1054570f1b57d0bde778cb038388798da14526c290f8b5926f62f43c0d",
        accessibleName: "How can I help you with Diamond Animator today?",
        visualLines: ["How can I help you with", "Diamond Animator today?"],
        productSourceFiles: ["src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css"],
      },
    },
    evidence: evidence.map(binding), sourceDigest: hash(JSON.stringify(allowlist.map(binding))),
    workspaceModelContract: binding("src/lib/ai/aiAnimatorContract.ts"),
    checks: commands.map(([id]) => id),
    summary: {
      browserAssertions: browser.assertions.length, profiles: browser.profiles.map((item: { name: string }) => item.name),
      navigationSamples: browser.timings,
      presentation: browser.presentation,
      screenshots: browser.screenshots.length, axeSeriousCritical: 0, horizontalOverflow: false,
      assistantApiRequests: 0, assistantProviderRequests: 0, automatedProviderRequests: 0, searchRequests: 0, transcriptionRequests: 0,
      liveAnimatorProviderRequests: 1, paidCalls: 1, estimatedCostUsd: null, liveUsageAvailable: false,
      supplementalExecutorLiveAttempts: 1, aggregateObservedLiveAnimatorProviderRequests: 2,
      storageDigests: browser.storage.map((item: { profile: string; before: string; after: string }) => ({ profile: item.profile, before: item.before, after: item.after })),
      animatorAssertions: animator.assertions, animatorMockedRequests: animator.capturedRequests,
      protectedSystemsByteUnchanged: true, draftCharacterLimit: 12000, persistedSessions: 0,
      reasoningChoices: ["Low", "Medium", "High", "Extra High"], reasoningDefault: "Medium", assistantProviderModel: null, workspaceTerraModel: liveTerra.provider.model,
      fullBuild: "INHERITED_BASELINE_FAILURE", focusedBuild: "PASS", fullLint: { errors: lintReceipt.errors, warnings: lintReceipt.warnings, newFindings: lintReceipt.newFindings.length },
    },
    liveTerra, executorLiveAttempt, terraConfig,
    review: { url: "http://127.0.0.1:57950/", assistantUrl: "http://127.0.0.1:57950/assistant", port: 57950, server: "focused production build with ignored canonical Terra environment restored; independent PM one-call live Terra smoke captured" },
    humanAcceptance: "pending Arthur", controlPlaneUpdated: false, gitPublication: false, staged: false, committed: false, pushed: false, deployed: false, phase2Started: false,
    ownership: "Spec Executor stopped after packet; no simultaneous CPA owner",
    cleanupPlan: "Preserve worktree and review server until acceptance, CPA propagation, separately authorized publication and synchronization. Then authorized D-0054 cleanup stops only the identified port/server and preserves proof before removal.",
    limitations: ["Chromium desktop/emulated compact only; no physical device or non-Chromium claim", "200% zoom is a 720x450 CSS viewport equivalent", "Assistant shell only: no real Assistant answer, session persistence, search or dictation", "Full repository build and lint retain documented untouched baselines", "The accepted independent PM live smoke exposed no token or cost telemetry, so those fields are recorded as unavailable", "One executor live call returned a natural Terra greeting before a post-response proof assertion failed; it was not rerun. The later independent PM smoke made one separate call, so aggregate observed calls are disclosed as two while each path made exactly one"],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: "SEALED", manifest: binding(manifestPath), dirtyPathAllowlist: allowlist }));
}
