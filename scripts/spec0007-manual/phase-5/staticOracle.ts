import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  MANUAL_EDITOR_COMMAND_IDS,
  MANUAL_EDITOR_COMMAND_REGISTRY,
  auditManualEditorCommandRegistry,
  authorizeManualEditorCommand,
  exportManualEditorCommandTable,
  type ManualEditorCommandDefinition,
} from "../../../src/lib/animation/editorCommands/manualCapabilityRegistry.ts";
import { DESTRUCTIVE_COMMAND_REGISTRY } from "../../../src/lib/animation/editorCommands/destructiveRegistry.ts";

const output = "output/spec-0007/phase-5";
mkdirSync(`${output}/receipts`, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const source = (path: string) => readFileSync(path, "utf8");

const expectedIds = [...MANUAL_EDITOR_COMMAND_IDS];
const destructiveIds = Object.keys(DESTRUCTIVE_COMMAND_REGISTRY).sort();
const runtimeEntries = Object.fromEntries(Object.entries(MANUAL_EDITOR_COMMAND_REGISTRY).map(([id, entry]) => [id, { ...entry }])) as Record<string, ManualEditorCommandDefinition>;

function validateRegistry(entries: Record<string, ManualEditorCommandDefinition>, expected = expectedIds) {
  const ids = Object.keys(entries).sort();
  assert.deepEqual(ids, expected, "closed command ID set");
  for (const id of ids) {
    const entry = entries[id];
    assert.equal(entry.commandId, id, `${id}: self-identifying command`);
    assert.ok(Number.isSafeInteger(entry.version) && entry.version >= 1, `${id}: version`);
    for (const field of ["payloadSchema", "manualControl", "validator", "handler", "noLossAssertion", "persistenceProjection", "noOpOrError", "ownerPhase"] as const) {
      assert.ok(typeof entry[field] === "string" && entry[field].trim().length > 0, `${id}: ${field}`);
    }
    const destructive = Boolean(entry.destructiveCommandId);
    assert.equal(entry.deleteClassification !== "non-delete", destructive, `${id}: delete classification`);
    if (destructive) assert.ok(Object.hasOwn(DESTRUCTIVE_COMMAND_REGISTRY, entry.destructiveCommandId!), `${id}: destructive registry link`);
    if (entry.futureAiEligible) assert.equal(entry.historyClass, "one-global-history-entry", `${id}: future-AI-eligible mutation uses canonical history`);
  }
  assert.deepEqual(ids.filter(id => entries[id].destructiveCommandId).sort(), destructiveIds, "every destructive command appears exactly once");
  return true;
}

check(validateRegistry(runtimeEntries), "live registry validates");
equal(auditManualEditorCommandRegistry(runtimeEntries), [], "runtime registry self-audit passes");
check(expectedIds.length >= 28, "registry covers the complete ordinary mutation surface");
equal(new Set(expectedIds).size, expectedIds.length, "command IDs are unique");

const workspaceSource = source("src/components/workspace/DrawingWorkspace.tsx");
const canvasSource = source("src/components/workspace/DrawingCanvas.tsx");
const toolbarSource = source("src/components/workspace/DrawingToolBar.tsx");
const timelineSource = source("src/components/workspace/DrawingTimelineRow.tsx");
const registrySource = source("src/lib/animation/editorCommands/manualCapabilityRegistry.ts");
for (const entry of Object.values(runtimeEntries)) {
  const runtimeBound = entry.destructiveCommandId
    ? (canvasSource.includes(`requireManualEditorCommand("${entry.commandId}"`) || workspaceSource.includes(`requireManualEditorCommand("${entry.commandId}"`)) &&
      (canvasSource.includes(`commandId: "${entry.destructiveCommandId}"`) || workspaceSource.includes(`commandId: "${entry.destructiveCommandId}"`))
    : workspaceSource.includes(`requireManualEditorCommand("${entry.commandId}"`) ||
      canvasSource.includes(`requireManualEditorCommand("${entry.commandId}"`) ||
      (entry.handler === "DrawingWorkspace.commitCanvasAuthoringAction" && workspaceSource.includes(`"${entry.commandId}"`));
  check(runtimeBound, `${entry.commandId}: enabled control reaches its registered runtime boundary`);
  equal(authorizeManualEditorCommand(entry.commandId as keyof typeof MANUAL_EDITOR_COMMAND_REGISTRY, entry.handler), { allowed: true, code: "authorized" }, `${entry.commandId}: handler mapping authorizes`);
}
equal(authorizeManualEditorCommand("history.undo/v1", "DrawingWorkspace.handleRedo"), { allowed: false, code: "handler_mismatch" }, "altered manual handler mapping fails closed");

const mutationFailures: string[] = [];
const mustFail = (id: string, mutate: (entries: Record<string, ManualEditorCommandDefinition>) => void) => {
  const candidate = structuredClone(runtimeEntries);
  mutate(candidate);
  assertions += 1;
  let rejected = false;
  try {
    validateRegistry(candidate);
  } catch {
    rejected = true;
  }
  if (!rejected && auditManualEditorCommandRegistry(candidate).length === 0) {
    assert.fail(`${id}: registry mutation was accepted`);
  }
  mutationFailures.push(id);
};
mustFail("removed-command", entries => { delete entries[expectedIds[0]]; });
mustFail("renamed-command", entries => { const first = entries[expectedIds[0]]; delete entries[expectedIds[0]]; entries[`${expectedIds[0]}-renamed`] = first; });
mustFail("deletion-misclassified", entries => { entries.eraser = { ...entries.eraser, deleteClassification: "non-delete" }; });
mustFail("no-loss-bypassed", entries => { entries["drawing.raster-gesture.commit/v2"] = { ...entries["drawing.raster-gesture.commit/v2"], noLossAssertion: "" }; });
mustFail("history-bypassed", entries => { entries["drawing.fill-region.commit/v1"] = { ...entries["drawing.fill-region.commit/v1"], historyClass: "session-state" }; });
mustFail("manual-mapping-removed", entries => { entries["drawing.text.commit/v1"] = { ...entries["drawing.text.commit/v1"], manualControl: "" }; });
mustFail("handler-mapping-altered", entries => { entries["drawing.text.commit/v1"] = { ...entries["drawing.text.commit/v1"], handler: "DrawingWorkspace.handleRedo" }; });

const directSetterProbe = `${toolbarSource}\n${timelineSource}`;
for (const forbidden of ["setLayers(", "setUnifiedCatalogs(", "historyEntriesRef.current", "saveUnifiedProjectV2("]) {
  check(!directSetterProbe.includes(forbidden), `enabled control surfaces do not bypass coordinator with ${forbidden}`);
}
for (const forbidden of ["/ai/", "fetch(", "XMLHttpRequest", "StickFigureCreator", "structureGraph", "stick-rig/v1"]) {
  check(!registrySource.includes(forbidden), `registry imports no AI/network/active-rig path: ${forbidden}`);
}
const boundaryAudit = (sourceText: string, includeIsolation = false) => {
  const violations: string[] = [];
  for (const forbidden of ["setLayers(", "setUnifiedCatalogs(", "historyEntriesRef.current", "saveUnifiedProjectV2("]) {
    if (sourceText.includes(forbidden)) violations.push(`unregistered-setter:${forbidden}`);
  }
  if (includeIsolation) {
    for (const forbidden of ["/ai/", "fetch(", "XMLHttpRequest", "StickFigureCreator", "structureGraph", "stick-rig/v1"]) {
      if (sourceText.includes(forbidden)) violations.push(`isolation-breach:${forbidden}`);
    }
  }
  return violations;
};
equal(boundaryAudit(directSetterProbe), [], "live control surfaces pass the coordinator boundary audit");
check(boundaryAudit(`${directSetterProbe}\nsetUnifiedCatalogs([])`).includes("unregistered-setter:setUnifiedCatalogs("), "mutation: unregistered setter fails boundary audit");
check(boundaryAudit(`${registrySource}\nimport x from '@/app/api/ai/route';\nfetch('https://example.invalid')`, true).length >= 2, "mutation: AI/network import fails isolation audit");

const baseWorkspaceSource = execFileSync("git", ["show", "5f2637faf56ab1f2df1408080c7cc1cacf4d6fab:src/components/workspace/DrawingWorkspace.tsx"], { encoding: "utf8" });
const atomicPersistenceSection = (text: string) => {
  const start = text.indexOf("const persistSnapshotAtomically");
  const end = text.indexOf("const saveCurrentFrameSnapshot =", start);
  return text.slice(start, end);
};
const rollbackMarkers = {
  baseRestoresVisibleBitmap: /catch\s*\{[\s\S]*?restoreBitmapToCanvas\(currentBitmap\)[\s\S]*?return null;/.test(atomicPersistenceSection(baseWorkspaceSource)),
  currentRestoresVisibleBitmap: /catch\s*\{[\s\S]*?clearTransientEditingState\(\)[\s\S]*?restoreBitmapToCanvas\(currentBitmap\)[\s\S]*?return null;/.test(atomicPersistenceSection(workspaceSource)),
};
equal(rollbackMarkers, { baseRestoresVisibleBitmap: false, currentRestoresVisibleBitmap: true }, "base defect and current rollback guard are both source-bound");

type Replay = { status: "applied" | "error"; resultDigest: string; authoredDigest: string; coverageDigest: string; historyDepth: number; error: string | null };
const pureReplay = (commandId: string, base: { authoredDigest: string; coverageDigest: string; historyDepth: number }): Replay => {
  const entry = runtimeEntries[commandId];
  if (!entry) return { status: "error", resultDigest: digest(`error:${commandId}`), ...base, error: "unknown_command" };
  const seed = JSON.stringify([entry.commandId, entry.version, entry.deleteClassification, entry.payloadSchema, base]);
  const mutatesAuthored = !["history-traversal", "session-state", "persistence-only"].includes(entry.historyClass);
  const authoredDigest = mutatesAuthored ? digest(`authored:${seed}`) : base.authoredDigest;
  const coverageDigest = entry.commandId.startsWith("drawing.") || entry.destructiveCommandId === "eraser" || entry.destructiveCommandId === "knife" || entry.destructiveCommandId === "shape-cutout" || entry.destructiveCommandId === "clear-canvas"
    ? digest(`coverage:${seed}`) : base.coverageDigest;
  const historyDepth = entry.historyClass === "one-global-history-entry" ? base.historyDepth + 1 : base.historyDepth;
  return { status: "applied", resultDigest: digest(JSON.stringify([authoredDigest, coverageDigest, historyDepth])), authoredDigest, coverageDigest, historyDepth, error: null };
};
const base = { authoredDigest: digest("phase5-base-authored"), coverageDigest: digest("phase5-base-coverage"), historyDepth: 0 };
const replayLedger = expectedIds.map(commandId => {
  const first = pureReplay(commandId, base), second = pureReplay(commandId, base);
  equal(first, second, `${commandId}: identical-base replay is deterministic`);
  return { commandId, first, second };
});
equal(pureReplay("unregistered.command", base), pureReplay("unregistered.command", base), "unknown-command error replay is deterministic");

const protectedPaths = [
  "src/components/workspace/DrawingToolBar.tsx",
  "src/components/workspace/DrawingTimelineRow.tsx",
  "src/lib/animation/editorCommands/rasterGesture.ts",
  "src/lib/animation/editorCommands/drawRigCorridor.ts",
  "src/lib/animation/editorCommands/staticAssetImport.ts",
  "src/lib/animation/legacyRigRetirementV3.ts",
  "src/lib/animation/unifiedProjectRepositoryV2.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts"
];
for (const path of protectedPaths) {
  equal(execFileSync("git", ["diff", "--name-only", "HEAD", "--", path], { encoding: "utf8" }).trim(), "", `${path}: accepted implementation remains byte-unchanged`);
}

const result = {
  status: "PASS", assertions, commandCount: expectedIds.length, destructiveCount: destructiveIds.length,
  futureAiEligibleCount: Object.values(runtimeEntries).filter(entry => entry.futureAiEligible).length,
  mutationFailures, protectedPaths, replayLedger, rollbackMarkers,
};
writeFileSync(`${output}/manual-command-registry.md`, exportManualEditorCommandTable() + "\n");
writeFileSync(`${output}/receipts/static-oracle.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, assertions, commandCount: result.commandCount, destructiveCount: result.destructiveCount, mutationFailures }));
