import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { MANIFEST_PATH, OUTPUT_ROOT, bind, digest, producerCommands, receiptPath, validationErrors, type Manifest, type RasterMetrics, type BrowserMetrics, type BrowserRunMetrics, type ProducerResult } from "./proofContract.ts";

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
const baselineErrors = validationErrors(manifest);
if (baselineErrors.length) {
  console.error(JSON.stringify({ status: "FAIL", baselineErrors }));
  process.exitCode = 1;
} else {
  const mutations: Array<[string, (value: Manifest) => void, string?]> = [
    ["base", v => { v.baseSha = "0".repeat(40); }],
    ["head", v => { v.headSha = "0".repeat(40); }],
    ["index", v => { v.indexEmpty = false; }],
    ["scope", v => { v.allowedPaths.pop(); }],
    ["dirty-paths", v => { v.exactDirtyPaths.pop(); }],
    ["spec", v => { v.spec.sha256 = "0".repeat(64); }],
    ["source", v => { v.sourceBindings[0].sha256 = "0".repeat(64); }],
    ["fixture", v => { v.receipts[0].fixture.sha256 = "0".repeat(64); }],
    ["producer", v => { v.receipts[0].producer.sha256 = "0".repeat(64); }],
    ["receipt", v => { v.receipts.pop(); }],
    ["raw-log", v => { v.receipts[0].commands[0].stdout.sha256 = "0".repeat(64); }],
    ["exit-code", v => { v.receipts[0].commands[0].exitCode = 17; }],
    ["command-source", v => { v.receipts[0].commands[0].sourceDigest = "0".repeat(64); }],
    ["producer-argv-substitution", v => { v.receipts.find(r => r.id === "no-loss")!.commands[0].argv = ["node", "-e", "process.exit(0)"]; }, "producer_argv"],
    ["producer-browser-run-missing", v => { v.receipts.find(r => r.id === "browser")!.commands.pop(); }, "producer_command_set"],
    ["quality-argv-substitution", v => { v.receipts.find(r => r.id === "quality")!.commands.find(c => c.id === "typescript")!.argv = ["true"]; }, "quality_argv"],
    ["self-selected-expectation", v => { const check = v.receipts.find(r => r.id === "no-loss")!.checks[0]; check.expected = false; check.actual = false; }],
    ["review-port", v => { v.review.port = 3000; }],
    ["review-pid", v => { v.review.listenerPid = 0; }],
    ["review-cwd", v => { v.review.cwd = "/tmp"; }],
    ["human-acceptance", v => { Object.assign(v, { humanAcceptance: "accepted" }); }],
    ["publication", v => { Object.assign(v, { published: true }); }],
    ["coverage-27", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).coverage[0].maximumCoverage = 27; }, "coverage_ceiling"],
    ["coverage-50-missing", v => { const metrics = v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics; metrics.coverage = metrics.coverage.filter(row => row.opacity !== .5); }, "coverage_matrix"],
    ["smoothing-jitter", v => { const row = (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).smoothing[0]; row.jitterEnergy[4] = row.jitterEnergy[0]; }, "smoothing_jitter_ratio"],
    ["smoothing-chord", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).smoothing[0].maxCurveChordFraction = .09; }, "curve_chord"],
    ["texture-missing", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy = []; }, "texture_matrix"],
    ["texture-smooth-pencil", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy[0].rows[1].edgeSd = 0; }, "texture_pencil_roughness"],
    ["texture-reversed-order", v => { const rows = (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy[0].rows; rows[2].edgeSd = rows[1].edgeSd; }, "texture_sketch_roughness"],
    ["texture-internal-only", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy[0].rows[2].detachedFraction = 0; }, "texture_sketch_scatter"],
    ["texture-unstable", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy[0].rows[2].repeatIdentical = false; }, "texture_coherent_deterministic"],
    ["texture-pale-marks", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy[0].rows[2].fractionalInkPixels = 1; }, "texture_opaque_marks"],
    ["texture-invisible-tiny-dot", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).tinyTextureDots[0].paintedPixels = 0; }, "tiny_texture_visible_solid"],
    ["texture-wrong-color", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).textureHierarchy[0].rows[1].wrongPigmentPixels = 1; }, "texture_selected_color"],
    ["texture-partial-opacity", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).coverage.find(row => row.variant === "Pencil")!.partialCoveragePixels = 1; }, "texture_exact_configured_opacity"],
    ["glow-luminance", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).glow.find(row => row.brightness === 100)!.annulusMeanLinearLift = .17; }, "glow_max_luminance"],
    ["glow-fixed-inputs", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).glow[0].radius = 25; }, "glow_fixed_inputs"],
    ["pixelate-gap", v => { (v.receipts.find(r => r.id === "raster")!.metrics as RasterMetrics).pixelate.gaps = 1; }, "pixelate_gaps"],
    ["preview-p95", v => { (v.receipts.find(r => r.id === "browser")!.metrics as BrowserMetrics).profiles[0].previewSamplesMs.Brush.fill(34); }, "preview_p95"],
    ["heap-limit", v => { (v.receipts.find(r => r.id === "browser")!.metrics as BrowserMetrics).profiles[0].settledHeapSamplesBytes = [335544320]; }, "settled-heap_ceiling"],
    ["browser-operation", v => { (v.receipts.find(r => r.id === "browser")!.metrics as BrowserMetrics).profiles[0].operations = []; }, "browser_operation_matrix"],
    ["accessibility", v => { (v.receipts.find(r => r.id === "browser")!.metrics as BrowserMetrics).profiles[0].axeSerious = 1; }, "axeSerious"],
    ["network", v => { (v.receipts.find(r => r.id === "browser")!.metrics as BrowserMetrics).realApiRequests = 1; }, "real_api_requests"],
  ];
  const results: unknown[] = [];
  const rebindBrowserDependencies = (candidate: Manifest) => {
    const browser = candidate.receipts.find(receipt => receipt.id === "browser"); if (!browser) return;
    const bytes = Buffer.from(JSON.stringify(browser, null, 2) + "\n"), binding = { path: receiptPath("browser"), bytes: bytes.length, sha256: digest(bytes) };
    for (const receipt of candidate.receipts) {
      for (const artifact of receipt.artifacts) if (artifact.path === binding.path) Object.assign(artifact, binding);
      for (const command of receipt.commands) if (command.inheritedStructuralFailure?.replacementProof?.path === binding.path) Object.assign(command.inheritedStructuralFailure.replacementProof, binding);
    }
  };
  {
    const alterClipboard = (run: BrowserRunMetrics, kind: "text" | "rig" | "transform" | "old-id") => {
      const operation = run.operations.find(value => value.id === "frame-copy-paste-companion")!;
      for (const key of ["after", "redone", "strokeUndone"]) {
        const snapshot = operation[key] as { normalizedLayers: Array<{ id: string; timelineFrames: Array<{ id: number; textObjects: unknown[] }> }>; normalizedProtected: Array<Record<string, unknown>>; authored: string; protected: string };
        const frame = snapshot.normalizedLayers.find(layer => layer.id === operation.targetLayerId)!.timelineFrames[2], cell = `${operation.targetLayerId}:${frame.id}`;
        const rig = snapshot.normalizedProtected.find(record => record[cell] && typeof record[cell] === "object" && "structureGraph" in (record[cell] as object))!;
        const instances = snapshot.normalizedProtected.find(record => Array.isArray(record[cell]))!;
        if (kind === "text") frame.textObjects = [];
        else if (kind === "rig") delete rig[cell];
        else {
          const target = (instances[cell] as Array<{ itemId: string; x: number }>)[0];
          if (kind === "transform") target.x += 1;
          else {
            const source = operation.source as typeof snapshot, sourceFrame = source.normalizedLayers.find(layer => layer.id === operation.targetLayerId)!.timelineFrames[0];
            const sourceKey = `${operation.targetLayerId}:${sourceFrame.id}`, sourceInstances = source.normalizedProtected.find(record => Array.isArray(record[sourceKey]))!;
            target.itemId = (sourceInstances[sourceKey] as Array<{ itemId: string }>)[0].itemId;
          }
        }
        snapshot.protected = digest(JSON.stringify(snapshot.normalizedProtected)); snapshot.authored = digest(JSON.stringify([snapshot.normalizedLayers, snapshot.normalizedProtected]));
      }
    };
    const browserMutations: Array<[string, string, (raw: ProducerResult, run: BrowserRunMetrics) => void]> = [
      ["browser-missing-case", "matrix", raw => { raw.completedCases.pop(); }],
      ["browser-duplicate-case", "matrix", raw => { raw.completedCases.push(structuredClone(raw.completedCases[1])); }],
      ["browser-renamed-case", "matrix", raw => { raw.completedCases[1].id = "invented-case"; }],
      ["browser-profile-substitution", "matrix", (_raw, run) => { run.profile.id = "compact"; }],
      ["browser-mode-substitution", "matrix", (_raw, run) => { run.mode = "flow"; }],
      ["browser-invalid-evidence-index", "matrix", raw => { raw.completedCases[1].evidenceIndex = 999999; }],
      ["browser-unfinished-case", "matrix", (raw, run) => { run.operations[raw.completedCases[1].evidenceIndex!].completed = false; }],
      ["browser-duplicate-operation", "matrix", (raw, run) => { run.operations.push(structuredClone(run.operations[raw.completedCases[1].evidenceIndex!])); }],
      ["browser-missing-snapshot", "matrix", (_raw, run) => { const op = run.operations.find(value => value.id === "matrix/Brush/100/dot")!; op.before = {}; op.preview = {}; op.after = {}; op.level = 0; }],
      ["browser-metadata-substitution", "matrix", (_raw, run) => { run.operations.find(value => value.id === "matrix/Brush/100/dot")!.level = 0; }],
      ["browser-preview-pixel-mismatch", "matrix", (_raw, run) => { (run.operations.find(value => value.id === "matrix/Brush/100/dot")!.preview as { pixels: string }).pixels = "0".repeat(64); }],
      ["browser-case-without-destructive-evidence", "destructive", (raw, run) => { const complete = raw.completedCases.find(value => value.id === "eraser-target")!; run.operations[complete.evidenceIndex!] = { id: complete.id, completed: true, assertions: complete.assertions }; }],
      ["browser-missing-outside-raster-proof", "destructive", (_raw, run) => { delete (run.operations.find(value => value.id === "eraser-target")!.after as Record<string, unknown>).outsideRaster; }],
      ["browser-eraser-size-substitution", "destructive", (_raw, run) => { for (const key of ["before", "after"]) (run.operations.find(value => value.id === "eraser-target")![key] as { outsideRaster: { eraser: { size: number } } }).outsideRaster.eraser.size = 120; }],
      ["browser-playback-skipped-frame", "retention", (_raw, run) => { const op = run.operations.find(value => value.id === "onion-full-playback-retention")!; (op.playbackObservations as Array<{ key: string }>)[Number(op.playbackStartIndex) + 1].key = (op.traversed as string[])[2]; }],
      ["browser-playback-inactive-observation", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-full-playback-retention")!.playbackObservations as Array<{ playing: boolean }>)[0].playing = false; }],
      ["browser-playback-partial-paint-pass", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-full-playback-retention")!.playbackPaintPasses as Array<{ draws: unknown[] }>)[0].draws.pop(); }],
      ["browser-playback-unknown-source", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-full-playback-retention")!.playbackPaintPasses as Array<{ draws: Array<{ source: unknown }> }>)[0].draws[0].source = null; }],
      ["browser-playback-wrong-source-hash", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-full-playback-retention")!.playbackPaintPasses as Array<{ draws: Array<{ source: { bitmapHash: string } }> }>)[0].draws[0].source.bitmapHash = "0".repeat(64); }],
      ["browser-playback-unbound-observation", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-full-playback-retention")!.playbackObservations as Array<{ paintPassIndex: number }>)[0].paintPassIndex = -1; }],
      ["browser-playback-missing-source-hash", "retention", (_raw, run) => { const op = run.operations.find(value => value.id === "onion-full-playback-retention")!; const source = (op.playbackPaintPasses as Array<{ draws: Array<{ source: { layerId: string; frameIndex: number; bitmapHash?: string } }> }>)[0].draws[0].source; delete source.bitmapHash; const layers = (op.before as { normalizedLayers: Array<{ id: string; timelineFrames: Array<{ bitmap: { pixels?: string } }> }> }).normalizedLayers; delete layers.find(layer => layer.id === source.layerId)!.timelineFrames[source.frameIndex].bitmap.pixels; }],
      ["browser-playback-stale-paint-observation", "retention", (_raw, run) => { const op = run.operations.find(value => value.id === "onion-full-playback-retention")!; const first = (op.playbackObservations as Array<{ at: number; paintPassIndex: number }>)[0]; first.at = (op.playbackPaintPasses as Array<{ at: number }>)[first.paintPassIndex + 1].at + 0.000001; }],
      ...(["text", "rig", "transform", "old-id"] as const).map(kind => [`browser-clipboard-${kind}`, "retention", (_raw: ProducerResult, run: BrowserRunMetrics) => alterClipboard(run, kind)] as [string, string, (raw: ProducerResult, run: BrowserRunMetrics) => void]),
      ["browser-save-fault-without-store-evidence", "persistence", (_raw, run) => { delete run.operations.find(value => value.id === "save-hash-failure")!.beforeStore; }],
      ...(["mismatch", "wrongOpacity", "wrongColor"] as const).map(field => [`browser-knife-${field}`, "destructive", (_raw: ProducerResult, run: BrowserRunMetrics) => { const op = run.operations.find(value => value.id === "knife-texture/Pencil/0")!; ((op.moved as { canvas: Record<string, number> }).canvas)[field] = 1; }] as [string, string, (raw: ProducerResult, run: BrowserRunMetrics) => void]),
      ["browser-knife-source-ghost", "destructive", (_raw, run) => { (run.operations.find(value => value.id === "knife-texture/Sketch/0")!.cut as { originGhostPixels: number }).originGhostPixels = 1; }],
      ["browser-knife-save-mismatch", "destructive", (_raw, run) => { (run.operations.find(value => value.id === "knife-texture/Sketch/50")!.reopenedSnapshot as { centeredCoveragePixels: string }).centeredCoveragePixels = "0".repeat(64); }],
      ["browser-knife-detached-excluded", "destructive", (_raw, run) => { (run.operations.find(value => value.id === "knife-texture/Sketch/0")!.initial as { wholeStroke: boolean }).wholeStroke = false; }],
      ["browser-knife-second-half-unmoved", "destructive", (_raw, run) => { run.operations.find(value => value.id === "knife-texture/Sketch/0")!.moveCount = 1; }],
      ["browser-knife-unrelated-picked-up", "destructive", (_raw, run) => { (run.operations.find(value => value.id === "knife-texture/Sketch/50")!.moved as { unrelatedPainted: number }).unrelatedPainted = 0; }],
      ["browser-onion-source-alpha-leak", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-canonical-mask")!.directions as Array<{ raster: Record<string, number> }>)[0].raster = { "91,64,159,74": 1020 }; }],
      ["browser-onion-rig-hue-leak", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-canonical-mask")!.directions as Array<{ rig: Record<string, number> }>)[1].rig = { "0,255,255,143": 1020 }; }],
      ["browser-onion-source-mutated", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-canonical-mask")!.directions as Array<{ sourceUnchanged: boolean }>)[0].sourceUnchanged = false; }],
      ["browser-onion-mixed-directions", "retention", (_raw, run) => { run.operations.find(value => value.id === "onion-canonical-mask")!.overlapping = { "68,100,124,209": 100 }; }],
      ["browser-onion-playback-ghost", "retention", (_raw, run) => { run.operations.find(value => value.id === "onion-canonical-lifecycle")!.playing = { "91,64,159,148": 1 }; }],
      ["browser-onion-reopen-tint-drift", "retention", (_raw, run) => { run.operations.find(value => value.id === "onion-canonical-lifecycle")!.reopenedOnion = {}; }],
      ["browser-onion-frame-edit-leaked", "retention", (_raw, run) => { (run.operations.find(value => value.id === "onion-canonical-lifecycle")!.undone as { authored: string }).authored = "0".repeat(64); }],
      ["browser-audio-without-target", "audio", (_raw, run) => { delete run.operations.find(value => value.id === "remove-attached-sound-target")!.targetLayerId; }],
      ["browser-missing-measured-stroke", "performance", (_raw, run) => { (run.operations.find(value => value.id === "preview/Glow")!.runs as unknown[]).pop(); }],
      ["browser-altered-served-asset", "matrix", (_raw, run) => { run.servedAssets[0].sha256 = "0".repeat(64); }],
      ["browser-omitted-served-asset", "matrix", (_raw, run) => { run.servedAssets.pop(); }],
      ["browser-missing-screenshot", "matrix", (_raw, run) => { run.screenshots = []; }],
      ["browser-error-omitted-from-aggregate", "matrix", (_raw, run) => { run.errors.push("injected uncaught error"); }],
      ["browser-source-write-omitted-from-aggregate", "matrix", (_raw, run) => { run.sourceStoreWrites.push({ database: "legacy-source", method: "put" }); }],
    ];
    for (const [name, mode, mutate] of browserMutations) {
      const candidate = structuredClone(manifest), receipt = candidate.receipts.find(value => value.id === "browser")!;
      const id = `browser-desktop-${mode}`, path = producerCommands("browser", candidate.review.url)[id].resultPath, raw = JSON.parse(readFileSync(path, "utf8")) as ProducerResult;
      mutate(raw, raw.metrics as BrowserRunMetrics); const bytes = Buffer.from(JSON.stringify(raw, null, 2) + "\n"), binding = { path, bytes: bytes.length, sha256: digest(bytes) }, overlay = new Map<string, Buffer>([[path, bytes]]);
      Object.assign(receipt.artifacts.find(value => value.path === path)!, binding);
      // Rebind the producer's actual stdout result footer as well, so these
      // cases exercise semantic validation rather than a stale result hash.
      const command = receipt.commands.find(value => value.id === id)!;
      const lines = readFileSync(command.stdout.path, "utf8").trimEnd().split("\n"); lines[lines.length - 1] = JSON.stringify({ execution: raw.execution, result: binding });
      const stdout = Buffer.from(lines.join("\n") + "\n"); overlay.set(command.stdout.path, stdout); Object.assign(command.stdout, { bytes: stdout.length, sha256: digest(stdout) });
      rebindBrowserDependencies(candidate);
      for (const changed of candidate.receipts) {
        const file = receiptPath(changed.id), content = Buffer.from(JSON.stringify(changed, null, 2) + "\n"); overlay.set(file, content);
        Object.assign(candidate.receiptBindings.find(value => value.path === file)!, { bytes: content.length, sha256: digest(content) });
      }
      const errors = validationErrors(candidate, { checkLiveReview: false, readBytes: path => overlay.get(path) ?? readFileSync(path) });
      assert.ok(errors.some(error => /browser_raw_semantics|browser_aggregat/.test(error)), `${name}: actual validator must reject browser semantics`);
      assert.ok(!errors.some(error => /receipt_bytes_differ|binding_hash|browser_stdout_result/.test(error)), `${name}: rebinding must reach semantic checks`);
      results.push({ name, errors });
    }
    for (const [name, mutate, expectedError] of [
      ["raw-incomplete", (raw: ProducerResult) => { raw.execution = "INCOMPLETE"; }, "producer_result_incomplete"],
      ["raw-failed", (raw: ProducerResult) => { raw.failures = ["injected failed assertion"]; }, "producer_raw_failures"],
      ["raw-no-completed-cases", (raw: ProducerResult) => { raw.completedCases = []; }, "producer_completed_cases_required"],
      ["raw-duplicate-cases", (raw: ProducerResult) => { raw.completedCases.push(raw.completedCases[0]); }, "producer_duplicate_cases"],
      ["raw-zero-assertions", (raw: ProducerResult) => { raw.completedCases[0].assertions = 0; }, "producer_completed_cases_required"],
      ["raw-stale-source", (raw: ProducerResult) => { raw.sourceDigestBefore = "0".repeat(64); }, "producer_before_stale"],
    ] as const) {
      const candidate = structuredClone(manifest), receipt = candidate.receipts.find(value => value.id === "no-loss")!;
      const path = producerCommands("no-loss", candidate.review.url)["no-loss"].resultPath, raw = JSON.parse(readFileSync(path, "utf8")) as ProducerResult;
      mutate(raw); const rawBytes = Buffer.from(JSON.stringify(raw, null, 2) + "\n"), overlay = new Map<string, Buffer>([[path, rawBytes]]);
      Object.assign(receipt.artifacts.find(value => value.path === path)!, { bytes: rawBytes.length, sha256: digest(rawBytes) });
      for (const changed of candidate.receipts) {
        const receiptFile = receiptPath(changed.id), bytes = Buffer.from(JSON.stringify(changed, null, 2) + "\n"); overlay.set(receiptFile, bytes);
        Object.assign(candidate.receiptBindings.find(value => value.path === receiptFile)!, { bytes: bytes.length, sha256: digest(bytes) });
      }
      const errors = validationErrors(candidate, { checkLiveReview: false, readBytes: path => overlay.get(path) ?? readFileSync(path) });
      assert.ok(errors.some(error => error.includes(expectedError)), `${name}: actual validator must reject ${expectedError}`);
      assert.ok(!errors.some(error => error.startsWith("receipt_bytes_differ") || error.startsWith("binding_hash")), `${name}: content failure cannot be masked by stale bindings`);
      results.push({ name, errors });
    }
    for (const [name, mutate, semanticError] of mutations) {
      const candidate = structuredClone(manifest); mutate(candidate);
      // Rebind mutated receipt bytes, so a semantic mutation cannot pass this
      // negative test merely by disagreeing with its original file/hash.
      const overlay = new Map<string, Buffer>();
      rebindBrowserDependencies(candidate);
      for (const receipt of candidate.receipts) {
        const path = receiptPath(receipt.id), bytes = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
        overlay.set(path, bytes);
        const binding = candidate.receiptBindings.find(value => value.path === path);
        if (binding) { binding.bytes = bytes.length; binding.sha256 = digest(bytes); }
      }
      const errors = validationErrors(candidate, { checkLiveReview: false, readBytes: path => overlay.get(path) ?? readFileSync(path) });
      assert.ok(errors.length, `actual validator accepted mutation ${name}`);
      assert.ok(!errors.some(error => error.startsWith("receipt_bytes_differ")), `mutation ${name} masked by receipt-byte mismatch`);
      if (semanticError) assert.ok(errors.some(error => error.includes(semanticError)), `mutation ${name} did not exercise ${semanticError}: ${errors.join(",")}`);
      results.push({ name, errors });
    }
    const changedRuntime = manifest.sourceBindings.find(binding => binding.path.startsWith("src/"))!;
    const errors = validationErrors(manifest, { checkLiveReview: false, readBytes: path => {
      const bytes = readFileSync(path);
      return path === changedRuntime.path ? Buffer.concat([bytes, Buffer.from("\n// stale evidence\n")]) : bytes;
    } });
    assert.ok(errors.some(error => error.includes("binding_hash")), "actual validator accepted changed runtime bytes");
    results.push({ name: "live-bytes", errors });
  }
  const report = { status: "PASS", manifest: bind(MANIFEST_PATH), negativeMutations: results };
  writeFileSync(`${OUTPUT_ROOT}/validation.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
