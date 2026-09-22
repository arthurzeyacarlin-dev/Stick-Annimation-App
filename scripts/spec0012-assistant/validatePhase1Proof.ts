import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Independent expectations: do not import the recorder or its allowlist.
const expectedPaths = [
  "app/assistant/page.tsx", "app/page.tsx", "scripts/spec0012-assistant/phase1AnimatorRegression.ts",
  "scripts/spec0012-assistant/phase1BrowserProof.ts", "scripts/spec0012-assistant/phase1BuildProof.ts",
  "scripts/spec0012-assistant/phase1Environment.ts", "scripts/spec0012-assistant/phase1Oracle.ts",
  "scripts/spec0012-assistant/recordPhase1Proof.ts", "scripts/spec0012-assistant/validatePhase1Proof.ts",
  "src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css",
].sort();
const output = "output/spec-0012/phase-1-correction";
const manifestPath = `${output}/proof-manifest.json`;
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const manifest = json(manifestPath);
type Binding = { path: string; bytes: number; sha256: string };
const validate = (value: typeof manifest) => {
  assert.equal(value.schema, "spec0012-phase1-correction-proof/v1");
  assert.equal(value.status, "PASS");
  assert.equal(value.base, "f2bda33842a3f5a4b560a7d3aab170a6ca4c2fd0");
  assert.equal(value.head, value.base);
  assert.equal(value.head, git("rev-parse", "HEAD"));
  assert.equal(value.branch, "codex/spec0012-phase-1-correction-registration");
  assert.equal(value.branch, git("branch", "--show-current"));
  assert.equal(value.worktree, "/Users/arthurcarlin/.codex/worktrees/9aa0/stick-animation-app");
  assert.equal(value.worktree, process.cwd());
  assert.equal(value.indexEmpty, true);
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.deepEqual(value.dirtyPathAllowlist, expectedPaths);
  assert.deepEqual(value.actualDirtyPaths, expectedPaths);
  assert.deepEqual([...new Set([...git("ls-files", "-m").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort(), expectedPaths);
  assert.deepEqual(value.sources.map((item: Binding) => item.path), expectedPaths);
  assert.equal(value.spec.path, "docs/specs/0012-diamond-animator-guidance-assistant.md");
  const bindings: Binding[] = [...value.sources, ...value.evidence, value.spec, value.workspaceModelContract];
  assert.equal(new Set(bindings.map(item => item.path)).size, bindings.length);
  for (const item of bindings) {
    assert.ok(!item.path.includes("..") && !item.path.startsWith("/"));
    const bytes = readFileSync(item.path);
    assert.equal(item.bytes, bytes.length, `${item.path} length`);
    assert.equal(item.sha256, hash(bytes), `${item.path} digest`);
  }
  assert.equal(value.sourceDigest, hash(JSON.stringify(value.sources)));
  assert.equal(value.authority.phase, 1);
  assert.equal(value.authority.sourceTask, "01a0b45e-dd0b-73c3-b42d-d5b49dced309");
  assert.match(value.authority.modeLimitation, /PM explicitly authorized/);
  assert.equal(value.correction.referenceSource, "/Users/arthurcarlin/.codex/worktrees/e81a/stick-animation-app");
  assert.equal(value.correction.referenceOutputsReused, false);
  assert.deepEqual(value.correction.iconColorCorrection, {
    acceptedManifestSha256: "69c3d75703ea60913fa16ad88d622860e4c20ca3da8e4ae22f300fea2c3611ca",
    acceptedAssistantCssSha256: "dd74af0a468dcd3690eeac7dd86859e3e4b7c660059094a04c56609a80bbc6b6",
    productTokenChanges: [
      { selector: ".brandMark", from: "#77b3ff", to: "#ffffff", opacity: "1" },
      { selector: ".heroMark", from: "#69aaff", to: "#ffffff", opacity: ".28" },
    ],
    preservedHeroGlow: "drop-shadow(0 14px 30px rgba(64, 142, 255, .12))",
    productSourceChangeCount: 2,
  });
  assert.deepEqual(value.correction.sidebarResizeCorrection, {
    acceptedManifestSha256: "6ce9908fd5b4bf52740755fc9b754a36594f4c85a129986e32494515b288ac03",
    acceptedComponentSha256: "324dfd6b3aca8b6157404a9930fe34a6b6ffbbda10f20d6e4874268316144be1",
    acceptedAssistantCssSha256: "266ba064bb1d5d9cc684a6540782f8840f25316d265abda7cbcc55e6f6a024a4",
    bounds: { minimum: 200, default: 256, maximum: 440, minimumConversation: 560, compactBreakpoint: 760, keyboardStep: 12 },
    behavior: "Desktop-only pointer and keyboard separator; no collapse and no persistence; compact top strip has no handle.",
    productSourceFiles: ["src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css"],
  });
  assert.deepEqual(value.correction.heroHeadingCorrection, {
    acceptedManifestSha256: "c5938ba8dc26538bce7559f311d11e881b013cb63f76df5e4fcb12b9222752e4",
    acceptedComponentSha256: "07429c9fae6b2c22043ce74d009819cd4591c57a0d96df863437106411ccd8ca",
    acceptedAssistantCssSha256: "0837ae1054570f1b57d0bde778cb038388798da14526c290f8b5926f62f43c0d",
    accessibleName: "How can I help you with Diamond Animator today?",
    visualLines: ["How can I help you with", "Diamond Animator today?"],
    productSourceFiles: ["src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css"],
  });
  const evidencePaths = new Set(value.evidence.map((item: Binding) => item.path));
  const browserPath = `${output}/browser/result.json`;
  const iconColorReviewPath = `${output}/browser/icon-color-review.json`;
  const sidebarResizeReviewPath = `${output}/browser/sidebar-resize-review.json`;
  const animatorPath = `${output}/animator/browser-result.json`;
  const buildPath = `${output}/build/result.json`;
  for (const path of [browserPath, iconColorReviewPath, sidebarResizeReviewPath, animatorPath, buildPath, `${output}/lint-baseline.json`, `${output}/lint-final.json`, `${output}/environment/terra-config.json`, `${output}/terra/live-hi.json`, `${output}/terra/live-hi.png`, `${output}/terra/executor-live-attempt.json`]) assert.ok(evidencePaths.has(path));
  const browser = json(browserPath), iconColorReview = json(iconColorReviewPath), sidebarResizeReview = json(sidebarResizeReviewPath), animator = json(animatorPath), build = json(buildPath);
  assert.equal(iconColorReview.status, "PASS");
  assert.deepEqual(iconColorReview.viewport, { width: 1440, height: 814 });
  assert.deepEqual([iconColorReview.presentation.hero.color, iconColorReview.presentation.hero.stroke, iconColorReview.presentation.hero.opacity], ["rgb(255, 255, 255)", "rgb(255, 255, 255)", "0.28"]);
  assert.match(iconColorReview.presentation.hero.filter, /rgba\(64, 142, 255, 0\.12\).*14px 30px/);
  assert.deepEqual([iconColorReview.presentation.brand.color, iconColorReview.presentation.brand.stroke, iconColorReview.presentation.brand.opacity], ["rgb(255, 255, 255)", "rgb(255, 255, 255)", "1"]);
  assert.deepEqual([iconColorReview.presentation.hero.width, iconColorReview.presentation.hero.height, iconColorReview.presentation.brand.width, iconColorReview.presentation.brand.height], [118, 118, 32, 32]);
  assert.deepEqual(iconColorReview.presentation.overflow, { horizontal: false, vertical: false });
  assert.deepEqual(iconColorReview.requestLedger.filter((entry: { disposition: string }) => entry.disposition === "blocked"), []);
  assert.deepEqual(iconColorReview.errors, []);
  assert.equal(iconColorReview.screenshot, "icon-color-review-viewport.png");
  assert.ok(evidencePaths.has(`${output}/browser/icon-color-review-viewport.png`));
  assert.equal(sidebarResizeReview.status, "PASS");
  assert.ok(sidebarResizeReview.assertions.length >= 60);
  assert.deepEqual([sidebarResizeReview.initial.sidebar.width, sidebarResizeReview.initial.main.x, sidebarResizeReview.initial.handle.width], [256, 256, 16]);
  assert.deepEqual(sidebarResizeReview.initial.aria, { min: "200", max: "440", now: "256", orientation: "vertical", controls: "assistant-conversation-main" });
  assert.deepEqual([sidebarResizeReview.minimum.sidebar.width, sidebarResizeReview.maximum.sidebar.width, sidebarResizeReview.middle.sidebar.width], [200, 440, 320]);
  assert.deepEqual([sidebarResizeReview.constrained.sidebar.width, sidebarResizeReview.constrained.aria.max, sidebarResizeReview.constrained.main.width], [240, "240", 560]);
  assert.deepEqual([sidebarResizeReview.mobile.viewport.width, sidebarResizeReview.mobile.sidebar.width, sidebarResizeReview.mobile.handle.display], [390, 390, "none"]);
  assert.deepEqual([sidebarResizeReview.active.handle.active, sidebarResizeReview.active.body.cursor, sidebarResizeReview.active.body.userSelect, sidebarResizeReview.active.screen.userSelect], ["true", "col-resize", "none", "none"]);
  assert.deepEqual([sidebarResizeReview.cancelled.handle.active, sidebarResizeReview.cancelled.body.userSelect], ["false", "auto"]);
  assert.deepEqual([sidebarResizeReview.reloaded.sidebar.width, sidebarResizeReview.reloaded.aria.now], [256, "256"]);
  assert.deepEqual([sidebarResizeReview.initial.hero.width, sidebarResizeReview.initial.hero.height, sidebarResizeReview.initial.hero.color, sidebarResizeReview.initial.hero.opacity], [118, 118, "rgb(255, 255, 255)", "0.28"]);
  assert.deepEqual([sidebarResizeReview.initial.brand.width, sidebarResizeReview.initial.brand.height, sidebarResizeReview.initial.brand.color, sidebarResizeReview.initial.brand.opacity], [32, 32, "rgb(255, 255, 255)", "1"]);
  for (const key of ["initial", "minimum", "middle", "maximum"] as const) {
    const heading = sidebarResizeReview[key].heading;
    assert.equal(heading.accessibleName, "How can I help you with Diamond Animator today?");
    assert.deepEqual(heading.lines.map((line: { text: string }) => line.text), ["How can I help you with", "Diamond Animator today?"]);
    assert.ok(heading.lines.every((line: { height: number }) => line.height <= heading.lineHeight + 1));
    assert.ok(heading.lines[1].y >= heading.lines[0].bottom - 1 && heading.box.height <= heading.lineHeight * 2 + 2);
  }
  assert.equal(sidebarResizeReview.mobile.heading.accessibleName, "How can I help you with Diamond Animator today?");
  assert.deepEqual(sidebarResizeReview.mobile.heading.lines.map((line: { text: string }) => line.text), ["How can I help you with", "Diamond Animator today?"]);
  assert.ok(sidebarResizeReview.mobile.heading.lines.every((line: { height: number; naturalWidth: number; width: number }) => line.height <= sidebarResizeReview.mobile.heading.lineHeight + 1 || line.naturalWidth > line.width));
  assert.ok(sidebarResizeReview.mobile.heading.box.x >= sidebarResizeReview.mobile.main.x && sidebarResizeReview.mobile.heading.box.right <= sidebarResizeReview.mobile.main.right && sidebarResizeReview.mobile.heading.box.bottom <= sidebarResizeReview.mobile.main.bottom);
  assert.deepEqual(sidebarResizeReview.mutationLedger, []);
  assert.deepEqual(sidebarResizeReview.requestLedger.filter((entry: { disposition: string }) => entry.disposition === "blocked"), []);
  assert.deepEqual(sidebarResizeReview.errors, []);
  for (const file of sidebarResizeReview.screenshots) assert.ok(evidencePaths.has(`${output}/browser/${file}`));
  assert.equal(browser.status, "PASS");
  assert.ok(browser.assertions.length >= 202);
  assert.equal(value.summary.browserAssertions, browser.assertions.length);
  assert.deepEqual(value.summary.navigationSamples, browser.timings);
  assert.equal(browser.timings.length, 7);
  assert.ok(browser.timings.every((item: { navigationMs: number }) => Number.isFinite(item.navigationMs) && item.navigationMs > 0));
  assert.deepEqual(browser.errors, []);
  const profiles = ["desktop", "review-viewport", "compact", "narrow", "zoom-200-equivalent", "reduced-motion", "forced-colors"];
  assert.deepEqual(value.summary.profiles, profiles);
  assert.deepEqual(browser.profiles.map((item: { name: string }) => item.name), profiles);
  assert.deepEqual(browser.accessibility.map((item: { profile: string; violations: unknown[] }) => ({ profile: item.profile, violations: item.violations })), profiles.map(profile => ({ profile, violations: [] })));
  assert.equal(value.summary.axeSeriousCritical, 0);
  assert.equal(value.summary.horizontalOverflow, false);
  assert.equal(value.summary.screenshots, browser.screenshots.length);
  assert.deepEqual(value.summary.presentation, browser.presentation);
  assert.equal(browser.presentation.length, 7);
  assert.deepEqual(browser.presentation.map((item: { layout: string }) => item.layout), ["sidebar", "sidebar", "top-strip", "top-strip", "top-strip", "sidebar", "sidebar"]);
  assert.ok(browser.presentation.every((item: { composerHeight: number; textareaOutline: string }) => item.composerHeight >= 102 && item.composerHeight <= 136 && item.textareaOutline === "none"));
  assert.ok(browser.presentation.every((item: { composerBottomGap: number; areaBottomGap: number }) => item.composerBottomGap >= 12 && item.areaBottomGap >= 12));
  for (const profile of profiles) {
    assert.ok(browser.assertions.includes(`${profile}: no vertical page overflow`));
    assert.ok(browser.assertions.includes(`${profile}: rounded composer retains at least 12px viewport breathing room`));
    assert.ok(browser.assertions.includes(`${profile}: composer area and preview notice remain fully above the viewport edge`));
  }
  assert.equal(browser.presentation.find((item: { profile: string }) => item.profile === "desktop")?.heroOpacity, "0.28");
  for (const file of browser.screenshots) assert.ok(evidencePaths.has(`${output}/browser/${file}`));
  for (const profile of profiles) assert.ok(evidencePaths.has(`${output}/browser/${profile}-trace.zip`));
  for (const key of ["assistantApiRequests", "assistantProviderRequests", "automatedProviderRequests", "searchRequests", "transcriptionRequests"]) {
    assert.equal(value.summary[key], 0);
  }
  for (const key of ["assistantApiRequests", "providerRequests", "searchRequests", "transcriptionRequests", "paidCalls", "estimatedCostUsd"]) assert.equal(browser[key], 0);
  assert.deepEqual(browser.requestLedger.filter((entry: { disposition: string }) => entry.disposition === "blocked"), []);
  assert.ok(browser.requestLedger.length > 0);
  assert.deepEqual(browser.requestLedger.filter((entry: { group: string; path: string }) => entry.group.endsWith(":assistant") && new URL(entry.path).pathname.startsWith("/api/")), []);
  assert.deepEqual(browser.mutationLedger.filter((entry: { group: string }) => entry.group.endsWith(":assistant")), []);
  assert.equal(browser.storage.length, 7);
  for (const entry of browser.storage) { assert.equal(entry.before, entry.after); assert.equal(hash(JSON.stringify(entry.inventory)), entry.before); }
  assert.deepEqual(value.summary.storageDigests, browser.storage.map((entry: { profile: string; before: string; after: string }) => ({ profile: entry.profile, before: entry.before, after: entry.after })));
  assert.equal(value.summary.draftCharacterLimit, 12000);
  assert.equal(value.summary.persistedSessions, 0);
  assert.deepEqual(value.summary.reasoningChoices, ["Low", "Medium", "High", "Extra High"]);
  assert.equal(value.summary.reasoningDefault, "Medium");
  assert.equal(value.summary.assistantProviderModel, null);
  const liveTerra = json(`${output}/terra/live-hi.json`);
  const executorLiveAttempt = json(`${output}/terra/executor-live-attempt.json`);
  assert.deepEqual(value.liveTerra, liveTerra);
  assert.deepEqual(value.executorLiveAttempt, executorLiveAttempt);
  assert.deepEqual([liveTerra.status, liveTerra.message, liveTerra.provider.calls, liveTerra.provider.model], ["PASS", "hi", 1, "gpt-5.6-terra"]);
  assert.deepEqual([liveTerra.provider.inputTokens, liveTerra.provider.outputTokens, liveTerra.provider.totalTokens, liveTerra.provider.estimatedCostUsd, liveTerra.provider.usageAvailable], [null, null, null, null, false]);
  assert.deepEqual([liveTerra.reply.intent, liveTerra.reply.naturalGreetingOrHelpOffer, liveTerra.reply.missingKeyMessage], ["conversation", true, false]);
  assert.match(liveTerra.reply.text, /\b(hi|hello|hey|help|what|how)\b/i);
  assert.deepEqual([liveTerra.animationChanged, liveTerra.canvasBlank, liveTerra.timelineFrameCountBefore, liveTerra.timelineFrameCountAfter, liveTerra.projectSaveStateBefore, liveTerra.projectSaveStateAfter], [false, true, 1, 1, "Not saved", "Not saved"]);
  assert.deepEqual([executorLiveAttempt.providerCalls, executorLiveAttempt.providerModel, executorLiveAttempt.intent, executorLiveAttempt.missingKeyMessage, executorLiveAttempt.secondExecutorCallMade], [1, "gpt-5.6-terra", "conversation", false, false]);
  assert.deepEqual([value.summary.liveAnimatorProviderRequests, value.summary.paidCalls, value.summary.estimatedCostUsd, value.summary.liveUsageAvailable], [1, 1, null, false]);
  assert.deepEqual([value.summary.supplementalExecutorLiveAttempts, value.summary.aggregateObservedLiveAnimatorProviderRequests], [1, 2]);
  assert.equal(value.summary.workspaceTerraModel, "gpt-5.6-terra");
  assert.equal(value.workspaceModelContract.path, "src/lib/ai/aiAnimatorContract.ts");
  assert.match(readFileSync(value.workspaceModelContract.path, "utf8"), /AI_ANIMATOR_MODEL = "gpt-5\.6-terra"/);
  const terraConfig = json(`${output}/environment/terra-config.json`);
  assert.deepEqual(value.terraConfig, terraConfig);
  assert.deepEqual([terraConfig.status, terraConfig.canonicalEnvPresent, terraConfig.reviewEnvPresent, terraConfig.reviewEnvIsSymlink, terraConfig.targetMatchesCanonical, terraConfig.tracked, terraConfig.ignored, terraConfig.contentsRead], ["PASS", true, true, true, true, false, true, false]);
  assert.equal(git("ls-files", ".env.local"), "");
  assert.equal(git("check-ignore", ".env.local"), ".env.local");
  assert.equal(animator.status, "PASS");
  assert.ok(animator.assertions >= 200);
  assert.deepEqual(animator.errors, []); assert.deepEqual(animator.externalRequests, []);
  assert.equal(value.summary.animatorAssertions, animator.assertions);
  assert.equal(value.summary.animatorMockedRequests, animator.capturedRequests);
  for (const key of ["primaryRenderedBounds", "followRenderedBounds", "longLabelRenderedBounds"]) assert.equal(animator.presentation[key].length, 3);
  assert.equal(animator.presentation.sweepPattern, "paired-continuous-long-pause");
  assert.deepEqual(animator.presentation.sweepOrder, ["ai-animator-sweep-primary", "ai-animator-sweep-follow"]);
  assert.deepEqual(animator.presentation.timingFunctions, ["linear", "linear"]);
  assert.equal(animator.presentation.broadGradientBandPercent, 57);
  assert.equal(animator.presentation.overlapSamples, 0);
  assert.match(animator.presentation.leadingGradient, /linear-gradient/);
  assert.equal(animator.presentation.coherentAccessibleReply, true);
  assert.equal(animator.presentation.persistedRepliesReplay, false);
  assert.equal(build.status, "PASS");
  assert.equal(build.full.status, "INHERITED_BASELINE_FAILURE");
  assert.equal(build.full.path, "app/dev/ai-costs/lifetime/page.tsx");
  assert.equal(build.focused.status, "PASS");
  assert.deepEqual(build.focused.routes, ["app/page.tsx", "app/assistant/page.tsx", "app/api/ai-animator/route.ts", "app/favicon.ico"]);
  assert.equal(value.summary.fullBuild, build.full.status);
  assert.equal(value.summary.focusedBuild, "PASS");
  const lint = json(`${output}/receipts/lint-nonregression.json`);
  assert.equal(lint.status, "PASS");
  assert.deepEqual(lint.newFindings, []);
  assert.deepEqual(value.summary.fullLint, { errors: lint.errors, warnings: lint.warnings, newFindings: 0 });
  const checks = ["assistant-oracle", "animator-contract", "library-oracle", "player-oracle", "audio-oracle", "management-oracle", "export-1-oracle", "export-2-oracle", "recovery-1-contract", "recovery-2-contract", "recovery-3-contract", "recovery-3-oracle", "manual-editor-oracle", "typescript", "focused-lint", "diff-check"];
  assert.deepEqual(value.checks, checks);
  for (const id of checks) { const path = `${output}/receipts/${id}.json`; assert.ok(evidencePaths.has(path)); assert.equal(json(path).exitCode, 0); }
  for (const kind of ["full", "focused"]) {
    const path = `${output}/environment/build-${kind}-network.jsonl`;
    assert.ok(evidencePaths.has(path));
    assert.ok(readFileSync(path, "utf8").split("\n").filter(Boolean).every(line => JSON.parse(line).result !== "denied"));
  }
  assert.equal(value.summary.protectedSystemsByteUnchanged, true);
  assert.equal(git("diff", "--name-only", value.base, "--", "AGENTS.md", "docs", "project", "src/lib", "src/components/workspace", "src/components/export", "src/components/recovery", "src/components/project-library", "src/components/project-player", "src/components/open-project", "src/components/tutorials", "app/api", "app/globals.css", "app/layout.tsx", "package.json", "package-lock.json"), "");
  assert.equal(value.humanAcceptance, "pending Arthur");
  for (const key of ["controlPlaneUpdated", "gitPublication", "staged", "committed", "pushed", "deployed", "phase2Started"]) assert.equal(value[key], false);
  assert.deepEqual([value.review.url, value.review.port], ["http://127.0.0.1:57950/", 57950]);
  assert.ok(evidencePaths.has(`${output}/review-server.json`));
  assert.ok(evidencePaths.has(`${output}/review-network-snapshot.jsonl`));
  const review = json(`${output}/review-server.json`);
  assert.deepEqual([review.cwd, review.port, review.mode], [process.cwd(), 57950, "production"]);
  assert.ok(Number.isInteger(review.pid) && review.pid > 0);
  assert.ok(readFileSync(`${output}/review-network-snapshot.jsonl`, "utf8").split("\n").filter(Boolean).every(line => JSON.parse(line).result !== "denied"));
  return true;
};
validate(manifest);
const mutations: Array<[string, (candidate: typeof manifest) => void]> = [
  ["base", value => { value.base = "0".repeat(40); }],
  ["worktree", value => { value.worktree = "/tmp/elsewhere"; }],
  ["path set", value => { value.dirtyPathAllowlist.pop(); }],
  ["source binding", value => { value.sources[0].sha256 = "0".repeat(64); }],
  ["evidence binding", value => { value.evidence[0].bytes += 1; }],
  ["spec binding", value => { value.spec.sha256 = "0".repeat(64); }],
  ["request count", value => { value.summary.assistantProviderRequests = 1; }],
  ["cost receipt", value => { value.summary.estimatedCostUsd += 0.01; }],
  ["storage digest", value => { value.summary.storageDigests[0].after = "0".repeat(64); }],
  ["accessibility", value => { value.summary.axeSeriousCritical = 1; }],
  ["performance evidence", value => { value.summary.navigationSamples[0].navigationMs = 0; }],
  ["overflow", value => { value.summary.horizontalOverflow = true; }],
  ["limits", value => { value.summary.draftCharacterLimit = 999999; }],
  ["Assistant model boundary", value => { value.summary.assistantProviderModel = "gpt-5.6-terra"; }],
  ["live Terra count", value => { value.summary.liveAnimatorProviderRequests = 2; }],
  ["Terra config", value => { value.terraConfig.reviewEnvPresent = false; }],
  ["presentation", value => { value.summary.presentation[0].composerHeight = 200; }],
  ["diamond colors", value => { value.correction.iconColorCorrection.productTokenChanges[0].to = "#77b3ff"; }],
  ["sidebar bounds", value => { value.correction.sidebarResizeCorrection.bounds.maximum = 900; }],
  ["hero heading", value => { value.correction.heroHeadingCorrection.visualLines[0] = "How can I help you"; }],
  ["build", value => { value.summary.focusedBuild = "FAIL"; }],
  ["required check", value => { value.checks.pop(); }],
  ["human acceptance", value => { value.humanAcceptance = "accepted"; }],
  ["control plane", value => { value.controlPlaneUpdated = true; }],
  ["publication", value => { value.gitPublication = true; }],
  ["phase 2", value => { value.phase2Started = true; }],
];
for (const [name, mutate] of mutations) {
  const candidate = structuredClone(manifest); mutate(candidate);
  assert.throws(() => validate(candidate), `reject ${name}`);
}
const result = { status: "VALID", manifestSha256: hash(readFileSync(manifestPath)), rejectedMutationClasses: mutations.map(([name]) => name), exactDirtyPaths: expectedPaths, indexEmpty: true, validatedAt: new Date().toISOString() };
writeFileSync(`${output}/validation.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
