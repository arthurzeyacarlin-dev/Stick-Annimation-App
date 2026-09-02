import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {createHash} from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {get as httpGet} from "node:http";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Request,
} from "playwright-core";
import type {StickAnimationPlanV1} from "../../src/lib/ai/stickFigureAiContract.ts";
import {
  canonicalJson,
  digestCanonical,
  type StickProjectDocumentV1,
} from "../../src/lib/stickfigure/stickProjectContract.ts";

const ROOT = process.cwd();
const OUTPUT_ROOT = resolve(ROOT, "output/spec-0004/phase-2.5/browser");
const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ACTIVATION_HEAD = "f131e75aafccec0d1b8ecb717e2d95b518355d39";
const WORKSPACE_ANCHOR = "  /* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */";
const PHASE4_MACHINE_DECLARATION = "  const phase4MachineInput = async (fixture: unknown): Promise<Phase4MachineInput | null> => {";
const PHASE4_CONSTRUCTOR = [
  "    const machine = new StickFigureCommandTransactionV1(",
  "      await createStickCommandWorkspaceRoot(parsed.starter, `${visible.workspaceInstanceId}:phase4`, visible.workspaceGeneration),",
  "    );",
].join("\n");
const FIXTURE_NAMES = ["timed-wave", "detailed-jump", "timed-bow", "timed-dodge"] as const;
type FixtureName = (typeof FIXTURE_NAMES)[number];

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const starter = readJson<StickProjectDocumentV1>(resolve(ROOT, "scripts/fixtures/stick-ai/v1/fresh-stick-project.json"));
const timingCases = readJson<{
  fixtureVersion: 3;
  jointRoleOrder: string[];
  validCases: Array<{
    name: FixtureName;
    sourcePlan: string | null;
    plan: StickAnimationPlanV1 | null;
    sidecar: unknown;
    timedCandidateDigest: string;
    importantFrameIndexes: number[];
    transitions: Array<{profile: string; progressGaps: number[]; probeGaps: number[]}>;
    frames: Array<Array<[number, number]>>;
    readableBeats: string[];
  }>;
}>(resolve(ROOT, "scripts/fixtures/spec0004-stick/v3/phase25-timing-cases.json"));
const reviewCases = Object.fromEntries(FIXTURE_NAMES.map((name) => {
  const testCase = timingCases.validCases.find((entry) => entry.name === name);
  assert.ok(testCase, `${name} timing case must exist`);
  return [name, testCase];
})) as Record<FixtureName, (typeof timingCases.validCases)[number]>;
const plans = Object.fromEntries(FIXTURE_NAMES.map((name) => {
  const testCase = reviewCases[name];
  return [name, testCase.plan ?? readJson<StickAnimationPlanV1>(resolve(ROOT, testCase.sourcePlan!))];
})) as Record<FixtureName, StickAnimationPlanV1>;
const viewportFixture = readJson<{
  fixtureVersion: 2;
  viewports: Array<{name: string; width: number; height: number}>;
}>(resolve(ROOT, "scripts/fixtures/spec0004-stick/v2/browser-viewports.json"));

type PortOutcome = {accepted: boolean; outcomeCode: string; errorCode: string | null};
type ReviewCandidate = StickProjectDocumentV1;
type ReviewPorts = {
  previewFixture: (fixture: unknown) => Promise<PortOutcome>;
  cancelFixture: (fixture: unknown) => Promise<PortOutcome>;
  applyFixture: (fixture: unknown) => Promise<PortOutcome>;
  readPreviewCandidate: () => Promise<ReviewCandidate | null>;
  readCheckpoint: () => Promise<Record<string, unknown>>;
  reopen: () => Promise<PortOutcome>;
};
type ReviewWindow = Window & {
  __spec0004Phase25PortsV1?: ReviewPorts;
  __spec0004Phase25PrePreviewCheckpoint?: Record<string, unknown>;
};

type ServerRecord = {
  fixture: FixtureName;
  copy: string;
  port: number;
  url: string;
  child: ChildProcess;
  logPath: string;
};

const getFreePort = () => new Promise<number>((resolvePromise, rejectPromise) => {
  const server = createServer();
  server.once("error", rejectPromise);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return rejectPromise(new Error("No loopback port was allocated."));
    const port = address.port;
    server.close((error) => error ? rejectPromise(error) : resolvePromise(port));
  });
});

const waitForServer = async (record: ServerRecord) => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (record.child.exitCode !== null) {
      throw new Error(`${record.fixture} review server exited before readiness with code ${record.child.exitCode}.`);
    }
    const ready = await new Promise<boolean>((resolvePromise) => {
      const request = httpGet(record.url, (response) => {
        response.resume();
        resolvePromise(Boolean(response.statusCode && response.statusCode < 500));
      });
      request.setTimeout(1000, () => request.destroy());
      request.once("error", () => resolvePromise(false));
    });
    if (ready) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${record.fixture} review server did not become ready.`);
};

const patchLayoutForOfflineReview = (copy: string) => {
  const layoutPath = resolve(copy, "app/layout.tsx");
  let source = readFileSync(layoutPath, "utf8");
  source = source.replace('import { Geist, Geist_Mono } from "next/font/google";\n', "");
  source = source.replace(/const geistSans = Geist\([\s\S]*?\n\}\);\n\nconst geistMono = Geist_Mono\([\s\S]*?\n\}\);\n\n/, "");
  source = source.replace('className={`${geistSans.variable} ${geistMono.variable} antialiased`}', 'className="antialiased"');
  writeFileSync(layoutPath, source);
};

const patchPageForDirectNormalWorkspace = (copy: string) => {
  const pagePath = resolve(copy, "app/page.tsx");
  let source = readFileSync(pagePath, "utf8");
  const initialView = '  >("home");';
  assert.ok(source.includes(initialView), "review page initial-view anchor must exist exactly");
  source = source.replace(initialView, '  >("stickFigureWorkspace");');
  const welcomeCondition = "        if (!cancelled && !never && !seen) {";
  assert.ok(source.includes(welcomeCondition), "review page welcome anchor must exist exactly");
  source = source.replace(welcomeCondition, "        if (false && !cancelled && !never && !seen) {");
  writeFileSync(pagePath, source);
};

const patchWorkspaceForSeparatePhase25Port = (copy: string) => {
  const workspacePath = resolve(copy, "src/components/workspace/stickfigure/StickFigureWorkspace.tsx");
  let source = readFileSync(workspacePath, "utf8");
  assert.ok(source.includes(PHASE4_MACHINE_DECLARATION), "Phase 4 machine declaration anchor must exist exactly");
  source = source.replace(
    PHASE4_MACHINE_DECLARATION,
    "  const spec0004Phase25TimingRef = useRef<unknown>(null);\n\n" + PHASE4_MACHINE_DECLARATION,
  );
  assert.ok(source.includes(PHASE4_CONSTRUCTOR), "Phase 4 transaction constructor anchor must exist exactly");
  source = source.replace(PHASE4_CONSTRUCTOR, [
    "    const machine = new StickFigureCommandTransactionV1(",
    "      await createStickCommandWorkspaceRoot(parsed.starter, `${visible.workspaceInstanceId}:phase4`, visible.workspaceGeneration),",
    "      spec0004Phase25TimingRef.current ? {animationPlanMaterializer: \"phase-2.5-timed-motion\", actionTimingSidecar: spec0004Phase25TimingRef.current} : undefined,",
    "    );",
  ].join("\n"));
  assert.ok(source.includes(WORKSPACE_ANCHOR), "review workspace injection anchor must exist exactly");
  const injection = [
    "  const spec0004Phase25PortsV1 = {",
    "    ...spec0004Phase1BrowserPortsV1,",
    "    previewFixture: async (fixture: unknown) => {",
    "      spec0004Phase25TimingRef.current = (fixture as {timingSidecar?: unknown}).timingSidecar ?? null;",
    "      try { return await previewStickCommand(fixture); }",
    "      finally { spec0004Phase25TimingRef.current = null; }",
    "    },",
    "  };",
    "  if (typeof window !== \"undefined\") {",
    "    (window as unknown as {__spec0004Phase25PortsV1?: unknown}).__spec0004Phase25PortsV1 = spec0004Phase25PortsV1;",
    "  }",
    "",
  ].join("\n");
  source = source.replace(WORKSPACE_ANCHOR, injection + WORKSPACE_ANCHOR);
  writeFileSync(workspacePath, source);
};

const patchAiPanelForNormalAutoPreview = (copy: string, fixture: FixtureName) => {
  const panelPath = resolve(copy, "src/components/workspace/stickfigure/StickFigureAiPanel.tsx");
  let source = readFileSync(panelPath, "utf8");
  source = source.replace(
    "type PreviewState = {\n  envelope: StickCommandBatchV1;\n  binding: StickAiWorkspaceBindingV2;\n};",
    "type PreviewState = {\n  envelope: StickCommandBatchV1;\n  binding: StickAiWorkspaceBindingV2;\n  phase25Review?: boolean;\n};",
  );
  const timeout = "const REQUEST_TIMEOUT_MS = 10_000;";
  assert.ok(source.includes(timeout), "review AI panel constant anchor must exist exactly");
  const fixtureValue = {starter, envelope: plans[fixture], timingSidecar: reviewCases[fixture].sidecar};
  const helper = [
    timeout,
    `const SPEC0004_PHASE25_REVIEW_FIXTURE = ${JSON.stringify(fixtureValue)} as unknown as {starter: unknown; envelope: StickCommandBatchV1};`,
    "type Spec0004Phase25ReviewPorts = {",
    "  previewFixture: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;",
    "  cancelFixture: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;",
    "  applyFixture: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;",
    "  readCheckpoint: () => Promise<Record<string, unknown>>;",
    "};",
    "const spec0004Phase25ReviewPorts = () => (window as unknown as {__spec0004Phase25PortsV1?: Spec0004Phase25ReviewPorts}).__spec0004Phase25PortsV1 ?? null;",
  ].join("\n");
  source = source.replace(timeout, helper);
  source = source.replace(
    "  const [availability, setAvailability] = useState<AvailabilityState>({status: \"checking\", reason: null});",
    "  const [availability, setAvailability] = useState<AvailabilityState>({status: \"available\", reason: \"available\"});",
  );
  const availabilityEffectStart = "  useEffect(() => {\n    const controller = new AbortController();\n    setAvailability({status: \"checking\", reason: null});";
  const availabilityEffectEnd = "    return () => controller.abort();\n  }, [availabilityEpoch]);";
  const startIndex = source.indexOf(availabilityEffectStart);
  const endIndex = source.indexOf(availabilityEffectEnd, startIndex);
  assert.ok(startIndex >= 0 && endIndex >= 0, "review availability effect anchors must exist exactly");
  source = source.slice(0, startIndex) + [
    "  useEffect(() => {",
    "    setAvailability({status: \"available\", reason: \"available\"});",
    "  }, [availabilityEpoch]);",
  ].join("\n") + source.slice(endIndex + availabilityEffectEnd.length);
  const cleanupEffect = "  useEffect(() => () => abortRef.current?.abort(), []);";
  assert.ok(source.includes(cleanupEffect), "review AI panel cleanup anchor must exist exactly");
  const autoPreviewEffect = [
    cleanupEffect,
    "",
    "  const phase25ReviewStartedRef = useRef(false);",
    "  useEffect(() => {",
    "    let cancelled = false;",
    "    const prepare = async () => {",
    "      for (let attempt = 0; attempt < 240 && !cancelled && !phase25ReviewStartedRef.current; attempt += 1) {",
    "        const ports = spec0004Phase25ReviewPorts();",
    "        const snapshot = adapter.readSnapshot();",
    "        const binding = snapshot?.ready && snapshot.eligible && !snapshot.playing ? adapter.captureBinding() : null;",
    "        if (ports && binding) {",
    "          phase25ReviewStartedRef.current = true;",
    "          const before = await ports.readCheckpoint();",
    "          (window as unknown as {__spec0004Phase25PrePreviewCheckpoint?: Record<string, unknown>}).__spec0004Phase25PrePreviewCheckpoint = before;",
    "          const outcome = await ports.previewFixture(SPEC0004_PHASE25_REVIEW_FIXTURE);",
    "          if (!cancelled && outcome.accepted && outcome.outcomeCode === \"previewed\") {",
    "            setHasSentAttempt(true);",
    "            setPreview({envelope: SPEC0004_PHASE25_REVIEW_FIXTURE.envelope, binding, phase25Review: true});",
    `            setMessage("A ${fixture} preview is ready. No changes have been made.");`,
    "          }",
    "          return;",
    "        }",
    "        await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 25));",
    "      }",
    "    };",
    "    void prepare();",
    "    return () => { cancelled = true; };",
    "  }, [adapter]);",
  ].join("\n");
  source = source.replace(cleanupEffect, autoPreviewEffect);
  source = source.replace(
    "    const outcome = await adapter.cancel(preview.envelope);",
    "    const outcome = preview.phase25Review\n      ? await spec0004Phase25ReviewPorts()!.cancelFixture(SPEC0004_PHASE25_REVIEW_FIXTURE)\n      : await adapter.cancel(preview.envelope);",
  );
  source = source.replace(
    "    const outcome = await adapter.apply(preview.binding, preview.envelope);",
    "    const outcome = preview.phase25Review\n      ? await spec0004Phase25ReviewPorts()!.applyFixture(SPEC0004_PHASE25_REVIEW_FIXTURE)\n      : await adapter.apply(preview.binding, preview.envelope);",
  );
  source = source.replaceAll(
    '      setMessage("The three-pose wave was applied as one undoable change.");',
    `      setMessage("The ${fixture} was applied as one undoable change.");`,
  );
  writeFileSync(panelPath, source);
};

const makeIsolatedCopy = (fixture: FixtureName) => {
  const copy = mkdtempSync(resolve(tmpdir(), `diamond-spec0004-phase25-${fixture}-review-`));
  cpSync(ROOT, copy, {
    recursive: true,
    filter: (source) => {
      const relativePath = source.slice(ROOT.length).replace(/^\//, "");
      const first = relativePath.split("/")[0];
      return ![".git", ".next", "node_modules", "output"].includes(first);
    },
  });
  symlinkSync(realpathSync(resolve(ROOT, "node_modules")), resolve(copy, "node_modules"), "dir");
  patchLayoutForOfflineReview(copy);
  patchPageForDirectNormalWorkspace(copy);
  patchWorkspaceForSeparatePhase25Port(copy);
  patchAiPanelForNormalAutoPreview(copy, fixture);
  return copy;
};

const startReviewServer = async (fixture: FixtureName): Promise<ServerRecord> => {
  const copy = makeIsolatedCopy(fixture);
  const port = await getFreePort();
  assert.notEqual(port, 3000, "review port must be non-3000");
  const logPath = resolve(OUTPUT_ROOT, `${fixture}-review-server.log`);
  const logFd = openSync(logPath, "w", 0o600);
  const child = spawn(process.execPath, [
    resolve(copy, "node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ], {
    cwd: copy,
    env: {...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development"},
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  const record = {fixture, copy, port, url: `http://127.0.0.1:${port}/`, child, logPath};
  await waitForServer(record);
  return record;
};

const stopReviewServer = async (record: ServerRecord) => {
  if (record.child.pid && record.child.exitCode === null) {
    try {
      process.kill(-record.child.pid, "SIGTERM");
    } catch {
      record.child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise((resolvePromise) => record.child.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
    ]);
  }
  if (existsSync(record.copy) && record.copy.startsWith(resolve(tmpdir(), `diamond-spec0004-phase25-${record.fixture}-review-`))) {
    rmSync(record.copy, {recursive: true, force: true});
  }
};

const recordNetwork = (context: BrowserContext, reviewOrigin: string) => {
  const entries: Array<{url: string; method: string; resourceType: string; classification: string}> = [];
  context.on("request", (request: Request) => {
    const url = request.url();
    let classification = "loopback";
    if (url.startsWith("data:") || url.startsWith("blob:")) classification = "local-inline";
    else if (!url.startsWith(reviewOrigin)) classification = "external";
    else if (new URL(url).pathname === "/api/ai") classification = "api";
    entries.push({url, method: request.method(), resourceType: request.resourceType(), classification});
  });
  return entries;
};

const readPorts = (page: Page) => page.evaluate(() => {
  const ports = (window as unknown as ReviewWindow).__spec0004Phase25PortsV1;
  if (!ports) throw new Error("Phase 2.5 review ports are unavailable.");
  return true;
});
const checkpoint = (page: Page) => page.evaluate(async () => {
  const ports = (window as unknown as ReviewWindow).__spec0004Phase25PortsV1;
  if (!ports) throw new Error("Phase 2.5 review ports are unavailable.");
  return ports.readCheckpoint();
});
const prePreviewCheckpoint = (page: Page) => page.evaluate(() => {
  const value = (window as unknown as ReviewWindow).__spec0004Phase25PrePreviewCheckpoint;
  if (!value) throw new Error("Pre-preview checkpoint is unavailable.");
  return value;
});
const previewCandidate = (page: Page) => page.evaluate(async () => {
  const ports = (window as unknown as ReviewWindow).__spec0004Phase25PortsV1;
  if (!ports) throw new Error("Phase 2.5 review ports are unavailable.");
  return ports.readPreviewCandidate();
});

const waitForNormalPreview = async (page: Page) => {
  await page.locator('[data-testid="stick-stage"]').waitFor();
  await page.getByLabel("Stick AI preview", {exact: true}).waitFor();
  await readPorts(page);
};

const captureEditableFrames = async (page: Page, frameCount: number) => {
  const frames: Array<Array<[number, number]>> = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    await page.locator(`[data-testid="stick-frame-${frameIndex + 1}"]`).click({force: true});
    await page.waitForFunction((index) => {
      const state = document.querySelector('[data-testid="stick-editable-timeline-state"]')?.textContent ?? "";
      return state.split(":")[2] === String(index);
    }, frameIndex);
    const rendered = await page.locator('[data-testid="stick-stage"]').evaluate((stage) => ({
      width: (stage as HTMLElement).offsetWidth,
      height: (stage as HTMLElement).offsetHeight,
      points: [...stage.querySelectorAll(":scope > svg circle")].map((circle) => [
        Number(circle.getAttribute("cx")),
        Number(circle.getAttribute("cy")),
      ] as [number, number]),
    }));
    const points = rendered.points;
    assert.equal(points.length, timingCases.jointRoleOrder.length, `frame ${frameIndex + 1} exposes every ordinary joint`);
    frames.push(points);
  }
  return frames;
};

const projectGoldenFramesToVisibleStage = async (page: Page, frames: Array<Array<[number, number]>>) => {
  const size = await page.locator('[data-testid="stick-stage"]').evaluate((stage) => ({
    width: (stage as HTMLElement).offsetWidth,
    height: (stage as HTMLElement).offsetHeight,
  }));
  const editorWidth = starter.coordinateSpace.width * 0.5;
  const editorHeight = starter.coordinateSpace.height * 0.55;
  const scale = Math.min(size.width / editorWidth, size.height / editorHeight);
  const offsetX = (size.width - editorWidth * scale) / 2;
  const offsetY = (size.height - editorHeight * scale) / 2;
  const stable = (value: number) => Math.round(value * 1000) / 1000;
  return frames.map((points) => points.map(([x, y]) => [
    stable(offsetX + Math.round(x * 0.5) * scale),
    stable(offsetY + Math.round(y * 0.55) * scale),
  ] as [number, number]));
};

const dragHeadOnCurrentFrame = async (page: Page, documentDeltaX: number) => {
  const geometry = await page.locator('[data-testid="stick-stage"]').evaluate((stage, deltaX) => {
    const head = stage.querySelector(":scope > svg circle");
    if (!head) throw new Error("Head joint is not rendered.");
    const box = stage.getBoundingClientRect();
    return {
      clientX: box.left + Number(head.getAttribute("cx")) / (stage as HTMLElement).offsetWidth * box.width,
      clientY: box.top + Number(head.getAttribute("cy")) / (stage as HTMLElement).offsetHeight * box.height,
      clientDeltaX: deltaX / (stage as HTMLElement).offsetWidth * box.width,
    };
  }, documentDeltaX);
  await page.mouse.move(geometry.clientX, geometry.clientY);
  await page.mouse.down();
  await page.mouse.move(geometry.clientX + geometry.clientDeltaX, geometry.clientY, {steps: 4});
  await page.mouse.up();
};

const runFixtureBrowserFlow = async (record: ServerRecord, viewport: {name: string; width: number; height: number}) => {
  const profile = mkdtempSync(resolve(tmpdir(), `spec0004-phase25-${record.fixture}-profile-`));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    viewport: {width: viewport.width, height: viewport.height},
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
    ],
  });
  const reviewOrigin = new URL(record.url).origin;
  const network = recordNetwork(context, reviewOrigin);
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith(reviewOrigin) || requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  const consoleErrors: string[] = [];
  const page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const expected = reviewCases[record.fixture];
  const frameCount = expected.frames.length;
  const screenshots: string[] = [];
  try {
    await page.goto(record.url, {waitUntil: "domcontentloaded"});
    await waitForNormalPreview(page);
    const bodyText = await page.locator("body").innerText();
    for (const forbidden of ["PRIVATE REVIEW", "fixture picker", "tester overlay", "Preview wavePreview jump"]) {
      assert.ok(!bodyText.includes(forbidden), `normal review UI must not expose ${forbidden}`);
    }
    assert.equal(new URL(page.url()).search, "", "review URL has no query flag");

    const before = await prePreviewCheckpoint(page);
    const previewCheckpoint = await checkpoint(page);
    for (const field of ["documentDigest", "historyRootDigest", "storageDigest", "aiCreationLatchDigest", "undoDepth", "redoDepth"]) {
      assert.equal(previewCheckpoint[field], before[field], `${record.fixture} Preview preserves ${field}`);
    }
    const candidate = await previewCandidate(page);
    assert.ok(candidate, `${record.fixture} Preview exposes a temporary candidate`);
    assert.equal(await digestCanonical(candidate), expected.timedCandidateDigest, `${record.fixture} Preview candidate matches frozen Phase 2.5 bytes`);
    assert.equal(candidate.layers.length, 1, `${record.fixture} candidate has one layer`);
    assert.equal(candidate.layers[0].cells.length, frameCount, `${record.fixture} candidate has the exact baked slot count`);
    assert.ok(candidate.layers[0].cells.every((cell) => cell.cellType === "keyframe"), `${record.fixture} candidate is fully baked`);
    assert.equal(new Set(candidate.layers[0].cells.map((cell) => cell.frameId)).size, frameCount, `${record.fixture} candidate cells have unique IDs`);
    const candidateText = canonicalJson(candidate);
    for (const forbidden of ["tween", "ownerFrame", "contentOwner", "motionController", "generatedHold", "locked", "regeneration"]) {
      assert.ok(!candidateText.toLowerCase().includes(forbidden.toLowerCase()), `${record.fixture} candidate omits ${forbidden}`);
    }
    const previewShot = resolve(OUTPUT_ROOT, `${viewport.name}-${record.fixture}-normal-preview.png`);
    await page.screenshot({path: previewShot, fullPage: true});
    screenshots.push(previewShot);

    await page.getByRole("button", {name: "Cancel", exact: true}).click();
    await page.getByRole("status").filter({hasText: "Preview cancelled"}).waitFor();
    const cancelled = await checkpoint(page);
    for (const field of ["documentDigest", "historyRootDigest", "storageDigest", "aiCreationLatchDigest", "undoDepth", "redoDepth"]) {
      assert.equal(cancelled[field], before[field], `${record.fixture} Cancel preserves ${field}`);
    }

    await page.reload({waitUntil: "domcontentloaded"});
    await waitForNormalPreview(page);
    const applyBase = await prePreviewCheckpoint(page);
    await page.getByRole("button", {name: "Apply", exact: true}).click();
    await page.getByRole("status").filter({hasText: "one undoable change"}).waitFor();
    const applied = await checkpoint(page);
    assert.equal(applied.undoDepth, 1, `${record.fixture} Apply creates exactly one history action`);
    assert.equal(applied.redoDepth, 0, `${record.fixture} Apply clears redo`);
    assert.equal(applied.aiCreationLatchStatus, "consumed", `${record.fixture} Apply consumes the one-shot latch`);
    assert.notEqual(applied.documentDigest, applyBase.documentDigest, `${record.fixture} Apply changes the authoritative document`);

    const timelineCells = page.locator('[data-testid^="stick-frame-"]');
    assert.equal(await timelineCells.count(), frameCount, `${record.fixture} timeline visibly contains the exact slot count`);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      assert.equal(
        await page.locator(`[data-testid="stick-frame-${frameIndex + 1}"]`).getAttribute("aria-label"),
        `Frame ${frameIndex + 1}, keyframe`,
        `${record.fixture} frame ${frameIndex + 1} is an ordinary keyframe`,
      );
    }
    assert.ok(!(await page.locator("body").innerText()).includes("Tween"), `${record.fixture} has no visible tween range`);
    const visibleGoldenFrames = await projectGoldenFramesToVisibleStage(page, expected.frames);
    const appliedFrames = await captureEditableFrames(page, frameCount);
    assert.deepEqual(appliedFrames, visibleGoldenFrames, `${record.fixture} editable timeline matches every projected frozen baked frame`);
    const appliedShot = resolve(OUTPUT_ROOT, `${viewport.name}-${record.fixture}-applied-keyframes.png`);
    await page.screenshot({path: appliedShot, fullPage: true});
    screenshots.push(appliedShot);

    await page.getByRole("button", {name: "Undo", exact: true}).click();
    await page.waitForFunction(async (digest) => {
      const ports = (window as unknown as ReviewWindow).__spec0004Phase25PortsV1;
      return (await ports!.readCheckpoint()).documentDigest === digest;
    }, applyBase.documentDigest);
    const undone = await checkpoint(page);
    assert.equal(undone.redoDepth, 1, `${record.fixture} Undo creates one redo entry`);
    assert.equal(undone.aiCreationLatchStatus, "consumed", `${record.fixture} Undo does not reopen AI creation`);
    await page.getByRole("button", {name: "Redo", exact: true}).click();
    await page.waitForFunction(async (digest) => {
      const ports = (window as unknown as ReviewWindow).__spec0004Phase25PortsV1;
      return (await ports!.readCheckpoint()).documentDigest === digest;
    }, applied.documentDigest);
    const redoneFrames = await captureEditableFrames(page, frameCount);
    assert.deepEqual(redoneFrames, visibleGoldenFrames, `${record.fixture} Redo restores every baked frame exactly`);

    await page.getByRole("button", {name: "Onion", exact: true}).click();
    await page.waitForFunction(async () => (await (window as unknown as ReviewWindow).__spec0004Phase25PortsV1!.readCheckpoint()).onionEnabled === true);
    assert.ok(await page.locator("[data-onion-side]").count() > 0, `${record.fixture} onion rendering remains active`);
    await page.getByRole("button", {name: "Onion", exact: true}).click();
    await page.getByRole("button", {name: "Play", exact: true}).click();
    await page.waitForFunction(async () => (await (window as unknown as ReviewWindow).__spec0004Phase25PortsV1!.readCheckpoint()).playbackState === "playing");
    await page.getByRole("button", {name: "Pause", exact: true}).click();
    await page.waitForFunction(async () => (await (window as unknown as ReviewWindow).__spec0004Phase25PortsV1!.readCheckpoint()).playbackState === "paused");

    const editFrameIndex = 2;
    await page.locator(`[data-testid="stick-frame-${editFrameIndex + 1}"]`).click({force: true});
    const beforeManual = await checkpoint(page);
    await dragHeadOnCurrentFrame(page, 24);
    await page.waitForFunction(async (digest) => (await (window as unknown as ReviewWindow).__spec0004Phase25PortsV1!.readCheckpoint()).documentDigest !== digest, beforeManual.documentDigest);
    const afterManualFrames = await captureEditableFrames(page, frameCount);
    const differences: Array<{frameIndex: number; jointIndex: number}> = [];
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      for (let jointIndex = 0; jointIndex < timingCases.jointRoleOrder.length; jointIndex += 1) {
        if (canonicalJson(afterManualFrames[frameIndex][jointIndex]) !== canonicalJson(visibleGoldenFrames[frameIndex][jointIndex])) {
          differences.push({frameIndex, jointIndex});
        }
      }
    }
    assert.deepEqual(differences, [{frameIndex: editFrameIndex, jointIndex: 0}], `${record.fixture} manual edit changes only one selected in-between joint`);
    assert.equal(afterManualFrames[editFrameIndex][0][1], visibleGoldenFrames[editFrameIndex][0][1], `${record.fixture} manual horizontal edit preserves the selected joint y`);

    await page.getByRole("button", {name: "File", exact: true}).click();
    await page.getByRole("menuitem", {name: "Save", exact: true}).click();
    await page.getByText("Saved on this browser", {exact: true}).waitFor();
    const saved = await checkpoint(page);
    const reopenOutcome = await page.evaluate(async () => {
      const ports = (window as unknown as ReviewWindow).__spec0004Phase25PortsV1;
      return ports!.reopen();
    });
    assert.equal(reopenOutcome.outcomeCode, "opened", `${record.fixture} saved project reopens`);
    const reopened = await checkpoint(page);
    assert.equal(reopened.documentDigest, saved.documentDigest, `${record.fixture} Save/Open preserves exact edited document bytes`);
    assert.equal(reopened.aiCreationLatchStatus, "consumed", `${record.fixture} Save/Open preserves consumed latch`);
    const reopenedFrames = await captureEditableFrames(page, frameCount);
    assert.deepEqual(reopenedFrames, afterManualFrames, `${record.fixture} manual in-between edit persists through Save/Open`);

    const creatorBase = await checkpoint(page);
    await page.getByRole("button", {name: "Stick Figure Tools", exact: true}).click({force: true});
    await page.getByRole("button", {name: "Create New Stick Figure", exact: true}).click({force: true});
    await page.getByRole("button", {name: "Back", exact: true}).waitFor();
    await page.getByRole("button", {name: "Back", exact: true}).click({force: true});
    await page.locator('[data-testid="stick-stage"]').waitFor();
    const creatorReturn = await checkpoint(page);
    assert.equal(creatorReturn.documentDigest, creatorBase.documentDigest, `${record.fixture} Creator round trip preserves document bytes`);

    const externalRequests = network.filter((entry) => entry.classification === "external");
    const apiRequests = network.filter((entry) => entry.classification === "api");
    assert.deepEqual(externalRequests, [], `${record.fixture} makes zero external requests`);
    assert.deepEqual(apiRequests, [], `${record.fixture} makes zero API requests`);
    const actionableConsoleErrors = consoleErrors.filter((message) => !/favicon\.ico|Download the React DevTools|hydration/i.test(message));
    assert.deepEqual(actionableConsoleErrors, [], `${record.fixture} browser flow has no actionable console errors`);

    return {
      fixture: record.fixture,
      viewport,
      previewCandidateDigest: expected.timedCandidateDigest,
      importantFrameIndexes: expected.importantFrameIndexes,
      timingProfiles: expected.transitions.map((transition) => transition.profile),
      timingGapEvidence: expected.transitions.map((transition) => ({
        progressGaps: transition.progressGaps,
        probeGaps: transition.probeGaps,
      })),
      readableBeats: expected.readableBeats,
      appliedDocumentDigest: applied.documentDigest,
      manuallyEditedDocumentDigest: saved.documentDigest,
      manualDifference: differences[0],
      frameCount: appliedFrames.length,
      keyframeCount: await timelineCells.count(),
      screenshots: screenshots.map((path) => ({
        path: path.slice(ROOT.length + 1),
        sha256: sha256(readFileSync(path)),
        bytes: lstatSync(path).size,
      })),
      network: {
        totalRequests: network.length,
        loopbackRequests: network.filter((entry) => entry.classification === "loopback").length,
        externalRequests: externalRequests.length,
        apiRequests: apiRequests.length,
        providerRequests: 0,
      },
      consoleErrors: actionableConsoleErrors,
      flows: [
        "normal-preview", "cancel-noop", "apply-one-history", "all-baked-keyframes", "undo-redo-exact",
        "play-pause", "onion", "manual-in-between-edit", "save-open-exact", "creator-round-trip",
      ],
    };
  } finally {
    await context.close();
    rmSync(profile, {recursive: true, force: true});
  }
};

const main = async () => {
  assert.ok(existsSync(BROWSER_EXECUTABLE), "installed Google Chrome is required for real-browser proof");
  assert.equal(timingCases.fixtureVersion, 3, "timing fixture version is exact");
  assert.equal(viewportFixture.fixtureVersion, 2, "viewport fixture version is exact");
  assert.deepEqual(FIXTURE_NAMES.map((name) => reviewCases[name].name), FIXTURE_NAMES, "exact four timed review plans are covered");
  assert.ok(viewportFixture.viewports.length >= 2, "desktop and compact viewports are required");
  mkdirSync(OUTPUT_ROOT, {recursive: true});
  const keepReview = process.argv.includes("--keep-review");
  const records: ServerRecord[] = [];
  let succeeded = false;
  try {
    for (const fixture of FIXTURE_NAMES) records.push(await startReviewServer(fixture));
    const evidence = [];
    for (let index = 0; index < records.length; index += 1) {
      evidence.push(await runFixtureBrowserFlow(records[index], viewportFixture.viewports[index % viewportFixture.viewports.length]));
    }
    const reviewCopies = records.map((record) => ({
      fixture: record.fixture,
      url: record.url,
      serverPid: record.child.pid,
      serverMode: "unpublished-isolated-development-copy",
      isolatedCopy: record.copy,
      non3000: record.port !== 3000,
      loopbackOnly: new URL(record.url).hostname === "127.0.0.1",
      noQueryFlag: new URL(record.url).search === "",
      permanentProductRouteAdded: false,
      permanentProductImportAdded: false,
      publicReviewAssetAdded: false,
      visibleTesterUiAdded: false,
    }));
    const receipt = {
      receiptVersion: 2,
      phase: "SPEC-0004 Phase 2.5 — Action Timing and Spacing Engine",
      generatedAt: new Date().toISOString(),
      sourceHead: ACTIVATION_HEAD,
      reviewCopies,
      browserEvidence: evidence,
      totals: {
        fixtures: evidence.length,
        viewports: new Set(evidence.map((entry) => entry.viewport.name)).size,
        flows: evidence.reduce((sum, entry) => sum + entry.flows.length, 0),
        screenshots: evidence.reduce((sum, entry) => sum + entry.screenshots.length, 0),
        externalRequests: evidence.reduce((sum, entry) => sum + entry.network.externalRequests, 0),
        apiRequests: evidence.reduce((sum, entry) => sum + entry.network.apiRequests, 0),
        providerRequests: evidence.reduce((sum, entry) => sum + entry.network.providerRequests, 0),
      },
      visibleReviewContract: {
        normalStickControlsOnly: true,
        privateReviewBoxAbsent: true,
        fixturePickerAbsent: true,
        specialButtonAbsent: true,
        queryFlagAbsent: true,
        productRouteAbsent: true,
        publicAssetAbsent: true,
      },
    };
    const receiptPath = resolve(OUTPUT_ROOT, "browser-proof.json");
    const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(receiptPath, bytes);
    console.log("SPEC-0004 Phase 2.5 real-browser proof passed.");
    for (const review of reviewCopies) console.log(`${review.fixture}: ${review.url} (PID ${review.serverPid})`);
    console.log(`Receipt: ${receiptPath}`);
    console.log(`Receipt SHA-256: ${sha256(bytes)}`);
    succeeded = true;
  } finally {
    if (keepReview && succeeded) {
      for (const record of records) record.child.unref();
    } else {
      for (const record of records.reverse()) await stopReviewServer(record);
    }
  }
};

await main();
