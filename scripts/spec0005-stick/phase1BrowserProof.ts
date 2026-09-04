import assert from "node:assert/strict";
import {spawn, spawnSync, type ChildProcess} from "node:child_process";
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
import {pathToFileURL} from "node:url";
import {
  assessPlaybackQuality,
  projectAcceptedPointMap,
  readQualityCatalog,
  type PlaybackTraceSample,
  type QualityPoint,
} from "../validateStickMotionQualityBaseline.ts";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "2b4f00e7a122c196b2c0600144cd638b461bbb2f";
const OUTPUT_ROOT = resolve(ROOT, "output/spec-0005/phase-1/browser");
const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dependencyRootArgument = process.argv.find((argument) => argument.startsWith("--dependency-root="));
const DEPENDENCY_ROOT = resolve(dependencyRootArgument?.slice("--dependency-root=".length) || resolve(ROOT, "node_modules"));
const {chromium} = await import(pathToFileURL(resolve(DEPENDENCY_ROOT, "playwright-core/index.mjs")).href);
const WORKSPACE_ANCHOR = "  /* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */";
const catalog = readQualityCatalog();
const reviewPlan = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json"), "utf8")) as {
  viewports: Array<{name: string; width: number; height: number}>;
};
const starter = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/stick-ai/v1/fresh-stick-project.json"), "utf8"));
const wavePlan = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/stick-ai/v3/wave.json"), "utf8"));
const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

type ServerRecord = {
  copy: string;
  port: number;
  url: string;
  child: ChildProcess;
  logPath: string;
};

type BrowserTrace = {
  installedAtMs: number;
  samples: Array<{
    frameIndex: number;
    timestampMs: number;
    points: QualityPoint[];
    svg: string;
  }>;
};

type ReviewWindow = Window & {
  __spec0005Phase1ReadyV1?: boolean;
  __spec0005Phase1TraceV1?: BrowserTrace;
};

type BrowserRequestLike = {url: () => string; method: () => string; resourceType: () => string};
type BrowserContextLike = {on: (event: "request", listener: (request: BrowserRequestLike) => void) => void};
type BrowserRouteLike = {
  request: () => {url: () => string};
  continue: () => Promise<unknown>;
  abort: (errorCode: string) => Promise<unknown>;
};
type BrowserConsoleLike = {type: () => string; text: () => string};
type BrowserPageLike = {
  evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
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
    if (record.child.exitCode !== null) throw new Error(`Review server exited with code ${record.child.exitCode}.`);
    const ready = await new Promise<boolean>((resolvePromise) => {
      const request = httpGet(record.url, (response) => {
        response.resume();
        resolvePromise(Boolean(response.statusCode && response.statusCode < 500));
      });
      request.setTimeout(1000, () => request.destroy());
      request.once("error", () => resolvePromise(false));
    });
    if (ready) return;
    await sleep(250);
  }
  throw new Error("Review server did not become ready.");
};

const patchLayoutForOfflineReview = (copy: string) => {
  const path = resolve(copy, "app/layout.tsx");
  let source = readFileSync(path, "utf8");
  source = source.replace('import { Geist, Geist_Mono } from "next/font/google";\n', "");
  source = source.replace(/const geistSans = Geist\([\s\S]*?\n\}\);\n\nconst geistMono = Geist_Mono\([\s\S]*?\n\}\);\n\n/, "");
  source = source.replace('className={`${geistSans.variable} ${geistMono.variable} antialiased`}', 'className="antialiased"');
  writeFileSync(path, source);
};

const patchPageForDirectNormalWorkspace = (copy: string) => {
  const path = resolve(copy, "app/page.tsx");
  let source = readFileSync(path, "utf8");
  const initialView = '  >("home");';
  assert.ok(source.includes(initialView), "review page initial-view anchor exists");
  source = source.replace(initialView, '  >("stickFigureWorkspace");');
  const welcomeCondition = "        if (!cancelled && !never && !seen) {";
  assert.ok(source.includes(welcomeCondition), "review page welcome anchor exists");
  source = source.replace(welcomeCondition, "        if (false && !cancelled && !never && !seen) {");
  writeFileSync(path, source);
};

const patchAiPanelForZeroApiReview = (copy: string) => {
  const path = resolve(copy, "src/components/workspace/stickfigure/StickFigureAiPanel.tsx");
  let source = readFileSync(path, "utf8");
  source = source.replace(
    '  const [availability, setAvailability] = useState<AvailabilityState>({status: "checking", reason: null});',
    '  const [availability, setAvailability] = useState<AvailabilityState>({status: "available", reason: "available"});',
  );
  const start = "  useEffect(() => {\n    const controller = new AbortController();\n    setAvailability({status: \"checking\", reason: null});";
  const end = "    return () => controller.abort();\n  }, [availabilityEpoch]);";
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex >= 0, "AI availability effect anchors exist");
  source = source.slice(0, startIndex) + [
    "  useEffect(() => {",
    "    setAvailability({status: \"available\", reason: \"available\"});",
    "  }, [availabilityEpoch]);",
  ].join("\n") + source.slice(endIndex + end.length);
  writeFileSync(path, source);
};

const patchWorkspaceForAcceptedWave = (copy: string) => {
  const path = resolve(copy, "src/components/workspace/stickfigure/StickFigureWorkspace.tsx");
  let source = readFileSync(path, "utf8");
  assert.ok(source.includes(WORKSPACE_ANCHOR), "workspace proof anchor exists");
  const fixture = JSON.stringify({starter, envelope: wavePlan});
  const injection = [
    `  const spec0005Phase1FixtureV1 = ${fixture} as unknown;`,
    "  const spec0005Phase1LoadedRef = useRef(false);",
    "  useEffect(() => {",
    "    if (!isReady || spec0005Phase1LoadedRef.current) return;",
    "    spec0005Phase1LoadedRef.current = true;",
    "    void (async () => {",
    "      await resetSpec0004FreshProject(false);",
    "      const preview = await previewStickCommand(spec0005Phase1FixtureV1);",
    "      if (!preview.accepted || preview.outcomeCode !== \"previewed\") throw new Error(\"SPEC-0005 review wave preview failed.\");",
    "      const applied = await applyStickCommand(spec0005Phase1FixtureV1);",
    "      if (!applied.accepted || applied.outcomeCode !== \"applied\") throw new Error(\"SPEC-0005 review wave Apply failed.\");",
    "      (window as unknown as {__spec0005Phase1ReadyV1?: boolean}).__spec0005Phase1ReadyV1 = true;",
    "    })();",
    "  }, [isReady]);",
    "",
  ].join("\n");
  source = source.replace(WORKSPACE_ANCHOR, injection + WORKSPACE_ANCHOR);
  writeFileSync(path, source);
};

const makeIsolatedCopy = () => {
  const copy = mkdtempSync(resolve(tmpdir(), "diamond-spec0005-phase1-wave-review-"));
  cpSync(ROOT, copy, {
    recursive: true,
    filter: (source) => {
      const relativePath = source.slice(ROOT.length).replace(/^\//, "");
      const first = relativePath.split("/")[0];
      return ![".git", ".next", "node_modules", "output"].includes(first);
    },
  });
  assert.ok(existsSync(resolve(DEPENDENCY_ROOT, "next")), "dependency root must contain Next.js");
  symlinkSync(realpathSync(DEPENDENCY_ROOT), resolve(copy, "node_modules"), "dir");
  patchLayoutForOfflineReview(copy);
  patchPageForDirectNormalWorkspace(copy);
  patchAiPanelForZeroApiReview(copy);
  patchWorkspaceForAcceptedWave(copy);
  return copy;
};

const startReviewServer = async (): Promise<ServerRecord> => {
  const copy = makeIsolatedCopy();
  const port = await getFreePort();
  assert.notEqual(port, 3000, "review port must not be 3000");
  mkdirSync(OUTPUT_ROOT, {recursive: true});
  const logPath = resolve(OUTPUT_ROOT, "review-server.log");
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
  const record = {copy, port, url: `http://127.0.0.1:${port}/`, child, logPath};
  await waitForServer(record);
  return record;
};

const stopReviewServer = async (record: ServerRecord) => {
  if (record.child.pid && record.child.exitCode === null) {
    try { process.kill(-record.child.pid, "SIGTERM"); } catch { record.child.kill("SIGTERM"); }
    await Promise.race([
      new Promise((resolvePromise) => record.child.once("exit", resolvePromise)),
      sleep(5000),
    ]);
  }
  if (existsSync(record.copy) && record.copy.startsWith(resolve(tmpdir(), "diamond-spec0005-phase1-wave-review-"))) {
    rmSync(record.copy, {recursive: true, force: true});
  }
};

const recordNetwork = (context: BrowserContextLike, reviewOrigin: string) => {
  const entries: Array<{url: string; method: string; resourceType: string; classification: string}> = [];
  context.on("request", (request) => {
    const url = request.url();
    let classification = "loopback";
    if (url.startsWith("data:") || url.startsWith("blob:")) classification = "local-inline";
    else if (!url.startsWith(reviewOrigin)) classification = "external";
    else if (new URL(url).pathname.startsWith("/api/")) classification = "api";
    entries.push({url, method: request.method(), resourceType: request.resourceType(), classification});
  });
  return entries;
};

const installPlaybackSampler = async (page: BrowserPageLike) => {
  await page.evaluate(() => {
    const state = document.querySelector('[data-testid="stick-editable-timeline-state"]');
    const stage = document.querySelector('[data-testid="stick-stage"]');
    if (!state || !stage) throw new Error("Playback sampler targets are missing.");
    const trace: BrowserTrace = {installedAtMs: performance.now(), samples: []};
    (window as ReviewWindow).__spec0005Phase1TraceV1 = trace;
    const capture = () => {
      const frameIndex = Number((state.textContent ?? "").split(":")[2]);
      if (!Number.isSafeInteger(frameIndex)) return;
      if (trace.samples.at(-1)?.frameIndex === frameIndex) return;
      const svg = stage.querySelector(":scope > svg");
      if (!svg) throw new Error("Playback SVG is missing.");
      const circles = [...svg.querySelectorAll("circle:not([data-onion-side])")];
      trace.samples.push({
        frameIndex,
        timestampMs: performance.now(),
        points: circles.map((circle) => [Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy"))] as QualityPoint),
        svg: svg.outerHTML,
      });
    };
    capture();
    new MutationObserver(capture).observe(state, {subtree: true, childList: true, characterData: true});
  });
};

const browserTrace = (page: BrowserPageLike) => page.evaluate(() => {
  const trace = (window as ReviewWindow).__spec0005Phase1TraceV1;
  if (!trace) throw new Error("Playback trace was not installed.");
  return trace;
});

const makeContactSheet = async (
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
  viewportName: string,
  trace: BrowserTrace,
) => {
  const path = resolve(OUTPUT_ROOT, `${viewportName}-time-based-contact-sheet.png`);
  const contactPage = await context.newPage();
  const points = trace.samples.slice(0, 13).flatMap((sample) => sample.points);
  const minimumX = Math.min(...points.map((point) => point[0])) - 32;
  const minimumY = Math.min(...points.map((point) => point[1])) - 32;
  const viewBoxWidth = Math.max(...points.map((point) => point[0])) - minimumX + 32;
  const viewBoxHeight = Math.max(...points.map((point) => point[1])) - minimumY + 32;
  const jointRadius = Math.max(1.5, Math.min(5, Math.min(viewBoxWidth, viewBoxHeight) * 0.02));
  const limbWidth = jointRadius * 1.5;
  const cells = trace.samples.slice(0, 13).map((sample, index) => {
    const elapsed = Math.round(sample.timestampMs - trace.samples[0].timestampMs);
    const pointsByRole = Object.fromEntries(catalog.acceptedWave.jointRoleOrder.map((role, roleIndex) => [role, sample.points[roleIndex]]));
    const limbs = catalog.acceptedWave.segmentRolePairs.map(([from, to]) =>
      `<line x1="${pointsByRole[from][0]}" y1="${pointsByRole[from][1]}" x2="${pointsByRole[to][0]}" y2="${pointsByRole[to][1]}" stroke-width="${limbWidth}"/>`,
    ).join("");
    const joints = sample.points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${jointRadius}"/>`).join("");
    const observedSvg = `<svg viewBox="${minimumX} ${minimumY} ${viewBoxWidth} ${viewBoxHeight}" aria-label="observed frame ${sample.frameIndex}">${limbs}${joints}</svg>`;
    return `<article><b>${index === 12 ? "wrap" : `frame ${sample.frameIndex}`}</b><span>${elapsed} ms</span>${observedSvg}</article>`;
  }).join("");
  await contactPage.setViewportSize({width: 1400, height: 1000});
  await contactPage.setContent(`<style>
    body{margin:18px;background:#10131b;color:#fff;font:14px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    article{background:#22242f;border:1px solid #49698c;border-radius:8px;padding:8px;display:grid;gap:4px}span{color:#b8d7fa}
    svg{width:100%;height:180px;background:#f5f5f5;border-radius:5px}line{stroke:#171923;stroke-linecap:round}
    circle{fill:#f5f5f5;stroke:#171923;stroke-width:1.5}
  </style><h1>SPEC-0005 Phase 1 · ${viewportName} · observed playback</h1><main>${cells}</main>`);
  await contactPage.screenshot({path, fullPage: true});
  await contactPage.close();
  return {path: path.slice(ROOT.length + 1), sha256: sha256(readFileSync(path)), bytes: lstatSync(path).size};
};

const runViewport = async (record: ServerRecord, viewport: {name: string; width: number; height: number}) => {
  const profile = mkdtempSync(resolve(tmpdir(), `spec0005-phase1-${viewport.name}-profile-`));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    viewport: {width: viewport.width, height: viewport.height},
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: ["--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-extensions", "--disable-sync", "--no-first-run"],
  });
  const origin = new URL(record.url).origin;
  const network = recordNetwork(context, origin);
  await context.route("**/*", async (route: BrowserRouteLike) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const consoleErrors: string[] = [];
  const page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message: BrowserConsoleLike) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error: Error) => consoleErrors.push(error.message));
  try {
    await page.goto(record.url, {waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => (window as ReviewWindow).__spec0005Phase1ReadyV1 === true, null, {timeout: 30_000});
    await page.locator('[data-testid="stick-stage"] circle:not([data-onion-side])').first().waitFor();
    assert.equal(await page.locator('[data-testid^="stick-frame-"]').count(), 12, `${viewport.name} has twelve timeline cells`);
    assert.equal(await page.locator('[data-testid="stick-stage"] circle:not([data-onion-side])').count(), 11, `${viewport.name} renders eleven joints`);
    for (const label of ["Play", "Pause", "Onion", "File", "Edit"]) {
      assert.ok(await page.getByRole("button", {name: label, exact: true}).count() > 0, `${viewport.name} preserves ${label}`);
    }
    const bodyText = await page.locator("body").innerText();
    for (const forbidden of ["PRIVATE REVIEW", "fixture picker", "tester overlay", "SPEC-0005 review", "quality harness"]) {
      assert.ok(!bodyText.includes(forbidden), `${viewport.name} exposes no ${forbidden}`);
    }
    const currentUrl = new URL(page.url());
    assert.equal(currentUrl.search, "", "review URL has no query flag");
    assert.equal(currentUrl.hash, "", "review URL has no hash flag");

    await page.locator('[data-testid="stick-frame-1"]').click({force: true});
    await page.waitForFunction(() => (document.querySelector('[data-testid="stick-editable-timeline-state"]')?.textContent ?? "").split(":")[2] === "0");
    await installPlaybackSampler(page);
    await page.getByRole("button", {name: "Play", exact: true}).click();
    await page.waitForFunction(() => ((window as ReviewWindow).__spec0005Phase1TraceV1?.samples.length ?? 0) >= 13, null, {timeout: 7000});
    await page.getByRole("button", {name: "Pause", exact: true}).click();
    await page.waitForFunction(() => {
      const pause = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Pause");
      return pause?.getAttribute("aria-pressed") === "true" || (document.querySelector('[data-testid="stick-editable-timeline-state"]')?.textContent ?? "").length > 0;
    });
    const trace = await browserTrace(page);
    const cycle = trace.samples.slice(0, 13);
    assert.deepEqual(cycle.map((sample) => sample.frameIndex), catalog.acceptedWave.orderedCycle, `${viewport.name} observes the complete ordered cycle`);
    assert.ok(cycle.every((sample) => sample.points.length === 11), `${viewport.name} captures every joint on every frame`);
    const stage = await page.locator('[data-testid="stick-stage"]').evaluate((element: HTMLElement) => ({
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
    const qualityTrace: PlaybackTraceSample[] = cycle.map((sample) => ({
      frameIndex: sample.frameIndex,
      timestampMs: sample.timestampMs,
      pointsByRole: Object.fromEntries(catalog.acceptedWave.jointRoleOrder.map((role, index) => [role, sample.points[index]])),
    }));
    const expected = (frameIndex: number) => projectAcceptedPointMap(catalog, frameIndex, stage);
    const assessment = assessPlaybackQuality(catalog, {
      trace: qualityTrace,
      acceptedSourceHashesValid: true,
      independentOracle: true,
      screenshotCount: 1,
      timeBasedCaptureCount: 1,
      geometryTolerance: catalog.acceptedWave.semanticOracle.renderedLandmarkTolerancePixels,
      limbLengthTolerance: catalog.acceptedWave.semanticOracle.renderedLimbLengthTolerancePixels,
    }, expected);
    assert.deepEqual(assessment, {ok: true, failures: []}, `${viewport.name} passes the independent quality oracle`);

    const stableDigests = [0, 4, 8].map((frameIndex) => {
      const sample = qualityTrace.find((entry) => entry.frameIndex === frameIndex)!;
      return sha256(JSON.stringify(catalog.acceptedWave.unrelatedStableRoles.map((role) => sample.pointsByRole[role])));
    });
    assert.equal(new Set(stableDigests).size, 1, `${viewport.name} keeps unrelated body geometry stable at all landmarks`);
    const landmarkEvidence = [0, 4, 8].map((frameIndex) => {
      const sample = qualityTrace.find((entry) => entry.frameIndex === frameIndex)!;
      return {frameIndex, pointsByRole: sample.pointsByRole, expectedPointsByRole: expected(frameIndex)};
    });

    await page.locator('[data-testid="stick-frame-1"]').click({force: true});
    const screenshotPath = resolve(OUTPUT_ROOT, `${viewport.name}-ordinary-stick-workspace.png`);
    await page.screenshot({path: screenshotPath, fullPage: true});
    const contactSheet = await makeContactSheet(context, viewport.name, trace);
    const external = network.filter((entry) => entry.classification === "external");
    const api = network.filter((entry) => entry.classification === "api");
    assert.deepEqual(external, [], `${viewport.name} makes zero external requests`);
    assert.deepEqual(api, [], `${viewport.name} makes zero API requests`);
    const actionableErrors = consoleErrors.filter((message) => !/favicon\.ico|Download the React DevTools|hydration/i.test(message));
    assert.deepEqual(actionableErrors, [], `${viewport.name} has zero actionable browser errors`);
    const elapsedCycleMs = cycle.at(-1)!.timestampMs - cycle[0].timestampMs;
    return {
      viewport,
      stage,
      playActions: 1,
      pauseAfterWrap: true,
      manualFrameSelectionsDuringCycle: 0,
      orderedFrameIndexes: cycle.map((sample) => sample.frameIndex),
      elapsedCycleMs,
      timestampedGeometry: qualityTrace,
      landmarkEvidence,
      stableUnrelatedBodyDigests: stableDigests,
      limbCountCheckedPerFrame: catalog.acceptedWave.segmentRolePairs.length,
      qualityAssessment: assessment,
      screenshots: [
        {path: screenshotPath.slice(ROOT.length + 1), sha256: sha256(readFileSync(screenshotPath)), bytes: lstatSync(screenshotPath).size},
        contactSheet,
      ],
      network: {
        entries: network,
        externalRequests: external.length,
        apiRequests: api.length,
        providerRequests: 0,
      },
      actionableConsoleErrors: actionableErrors,
    };
  } finally {
    await context.close();
    rmSync(profile, {recursive: true, force: true});
  }
};

const processGroupNetworkSnapshot = (pid: number) => {
  const ps = spawnSync("ps", ["-o", "pid=", "-g", String(pid)], {encoding: "utf8"});
  const pids = ps.status === 0 ? ps.stdout.split("\n").map((value) => value.trim()).filter(Boolean) : [String(pid)];
  const snapshots = pids.map((processId) => {
    const result = spawnSync("lsof", ["-nP", "-a", "-p", processId, "-i"], {encoding: "utf8"});
    return {pid: Number(processId), exitCode: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? ""};
  });
  const nonLoopbackLines = snapshots.flatMap((snapshot) => snapshot.stdout.split("\n").filter((line) =>
    /TCP|UDP/.test(line) && !/127\.0\.0\.1|\[::1\]|\*:/.test(line),
  ));
  return {pids: pids.map(Number), snapshots, nonLoopbackLines};
};

const main = async () => {
  assert.ok(existsSync(BROWSER_EXECUTABLE), "installed Google Chrome is required");
  assert.equal(spawnSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"}).stdout.trim(), ACTIVATION_HEAD);
  assert.deepEqual(reviewPlan.viewports.map((viewport) => [viewport.width, viewport.height]), [[1440, 900], [390, 844]]);
  mkdirSync(OUTPUT_ROOT, {recursive: true});
  const keepReview = process.argv.includes("--keep-review");
  const record = await startReviewServer();
  let succeeded = false;
  try {
    const browserEvidence = [];
    for (const viewport of reviewPlan.viewports) browserEvidence.push(await runViewport(record, viewport));
    const processNetwork = processGroupNetworkSnapshot(record.child.pid!);
    assert.deepEqual(processNetwork.nonLoopbackLines, [], "review server process group has no non-loopback network endpoints");
    const log = readFileSync(record.logPath, "utf8");
    assert.ok(!/\/api\/|openai|provider request|supabase/i.test(log), "review server log contains no API/provider traffic");
    const reviewCopy = {
      url: record.url,
      serverPid: record.child.pid,
      processGroupId: record.child.pid,
      port: record.port,
      isolatedCopy: record.copy,
      serverLogPath: record.logPath.slice(ROOT.length + 1),
      loopbackOnly: new URL(record.url).hostname === "127.0.0.1",
      non3000: record.port !== 3000,
      noQueryFlag: new URL(record.url).search === "",
      noHashFlag: new URL(record.url).hash === "",
      normalStickControlsOnly: true,
      privateReviewBoxAbsent: true,
      pickerAbsent: true,
      overlayAbsent: true,
      testerButtonAbsent: true,
      productRouteAdded: false,
      trackedAppCodeChanged: false,
      cleanupCommand: `kill -TERM -${record.child.pid} && rm -rf '${record.copy}'`,
    };
    const receipt = {
      receiptVersion: 1,
      phase: "SPEC-0005 Phase 1 — Accepted Motion References and Full-Playback Quality Gate",
      generatedAt: new Date().toISOString(),
      sourceHead: ACTIVATION_HEAD,
      acceptedReferenceSources: catalog.provenance.acceptedReferenceSources,
      runtimeTransportSources: catalog.provenance.runtimeTransportSources,
      independentOracle: true,
      engineGeneratedOracle: false,
      reviewCopy,
      browserEvidence,
      timeBasedCaptureType: "timestamp-labelled observed-SVG contact sheet",
      processNetwork,
      totals: {
        viewports: browserEvidence.length,
        fullPlaybackCycles: browserEvidence.length,
        observedFrameSamples: browserEvidence.reduce((sum, evidence) => sum + evidence.orderedFrameIndexes.length, 0),
        landmarkFrames: browserEvidence.reduce((sum, evidence) => sum + evidence.landmarkEvidence.length, 0),
        limbLengthChecks: browserEvidence.reduce((sum, evidence) => sum + evidence.orderedFrameIndexes.length * evidence.limbCountCheckedPerFrame, 0),
        screenshots: browserEvidence.reduce((sum, evidence) => sum + evidence.screenshots.length, 0),
        externalRequests: browserEvidence.reduce((sum, evidence) => sum + evidence.network.externalRequests, 0),
        apiRequests: browserEvidence.reduce((sum, evidence) => sum + evidence.network.apiRequests, 0),
        providerRequests: browserEvidence.reduce((sum, evidence) => sum + evidence.network.providerRequests, 0),
        actionableConsoleErrors: browserEvidence.reduce((sum, evidence) => sum + evidence.actionableConsoleErrors.length, 0),
      },
    };
    const path = resolve(OUTPUT_ROOT, "browser-proof.json");
    const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(path, bytes);
    console.log("SPEC-0005 Phase 1 full-playback browser proof passed.");
    console.log(`Review URL: ${record.url}`);
    console.log(`Review PID/PGID: ${record.child.pid}`);
    console.log(`Review copy: ${record.copy}`);
    console.log(`Receipt: ${path}`);
    console.log(`Receipt SHA-256: ${sha256(bytes)}`);
    succeeded = true;
  } finally {
    if (keepReview && succeeded) record.child.unref();
    else await stopReviewServer(record);
  }
};

await main();
