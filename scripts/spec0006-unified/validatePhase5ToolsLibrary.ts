import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { runPhase5CatalogOracle } from "./phase5CatalogOracle.ts";

const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v2/phase5-tools-library-cases.json", "utf8"));
const canvas = readFileSync("src/components/workspace/DrawingCanvas.tsx", "utf8");
const workspace = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");
const root = readFileSync("src/components/workspace/AnimationWorkspace.tsx", "utf8");
const contract = readFileSync("src/lib/animation/unifiedAnimationContractV2.ts", "utf8");
const catalog = readFileSync("src/lib/animation/unifiedProjectCatalogV2.ts", "utf8");
const rightPanel = readFileSync("src/components/workspace/DrawingRightPanel.tsx", "utf8");
const toolbar = readFileSync("src/components/workspace/DrawingToolBar.tsx", "utf8");

const oracle = await runPhase5CatalogOracle();
for (const tab of fixture.requiredTabs) assert.match(rightPanel, new RegExp(tab));
for (const tool of fixture.requiredDrawingTools) assert.match(toolbar, new RegExp(`"${tool}"`));
for (const category of fixture.symbolSourceCategories) {
  assert.match(readFileSync("src/lib/animation/unifiedAnimationContentV2.ts", "utf8"), new RegExp(category.replace("+", "\\+")));
}

assert.match(canvas, /data-unified-symbol-instance/);
assert.match(canvas, /data-unified-symbol-properties/);
assert.match(canvas, /onPointerCancel=\{cancelCanvasStroke\}/);
assert.match(canvas, /onLostPointerCapture=\{cancelCanvasStroke\}/);
assert.doesNotMatch(canvas, /strokeCancelBaseImageRef|getImageData\(0, 0, ctx\.canvas\.width, ctx\.canvas\.height\)/);
assert.match(canvas, /drawBufferedBrushStroke\(ctx, !brushDidMoveRef\.current, "final-commit"\)/);
assert.match(canvas, /ctx\.lineCap = "round"/);
assert.match(canvas, /ctx\.lineJoin = "round"/);
assert.match(canvas, /commitBitmapSelectionSessionToCanvas\("select", \{ clearSelection: true, commitHistory: false \}\)/);
assert.match(canvas, /commitBitmapSelectionSessionToCanvas\("lasso", \{ clearSelection: true, commitHistory: false \}\)/);
assert.match(canvas, /type StructuredStickSelection = \{/);
assert.match(canvas, /resolveStructuredStickSelection/);
assert.match(canvas, /materializeStructuredStickSelection/);
assert.match(canvas, /complete connected rig component/);
assert.match(canvas, /sourceCanvas: null/);
assert.match(canvas, /drawingBounds, structuredStick\.originBounds/);
assert.match(canvas, /onUnifiedSelectionActionCommitted/);
assert.match(canvas, /commitUnifiedSelectionMutation/);
assert.match(canvas, /jointIdMap = new Map<string, string>\(\)/);
assert.match(canvas, /id: crypto\.randomUUID\(\), startJointId, endJointId/);
assert.match(canvas, /selectedLimbIds\.has\(limb\.id\)/);
assert.match(canvas, /role="dialog"/);
assert.match(canvas, /aria-modal="true"/);
assert.match(canvas, />Name this symbol<\/h2>/);
assert.match(canvas, /role="alert"/);
assert.match(canvas, /error: "This symbol already exists\."/);
assert.match(canvas, /symbolDialog\.name\.trim\(\) \|\| symbolDialog\.suggestedName/);
assert.doesNotMatch(canvas, /window\.prompt\("Name this symbol"/);
assert.doesNotMatch(canvas, /window\.alert\("This symbol already exists\."\)/);
assert.doesNotMatch(canvas, /createStickOnlyBitmapSelection/);
assert.match(canvas, /tabs\.style\.overflowX = "auto"/);
assert.match(canvas, /tabs\.setAttribute\("aria-label", "Workspace panels"\)/);
assert.match(canvas, /flushSync\(\(\) => \{/);
assert.match(canvas, /onToolSelect\?\.\("Select"\)/);
assert.match(canvas, /drawingToolActivationId/);
assert.match(canvas, /setCanvasInteractionOwner\("drawing"\)/);
assert.match(workspace, /unifiedCatalogs/);
assert.match(workspace, /symbolInstancesByCell/);
assert.match(workspace, /removeSymbolDefinitionV2/);
assert.match(workspace, /recordUndoSnapshot/);
assert.match(workspace, /const commitUnifiedSelectionAction = useCallback/);
assert.match(workspace, /deferHistory: true/);
assert.match(workspace, /commitCurrentHistoryState\(\{ assumeChanged: true \}\)/);
assert.match(workspace, /onUnifiedSelectionActionCommitted=\{commitUnifiedSelectionAction\}/);
assert.match(workspace, /const createUnifiedSymbolDefinition = useCallback/);
assert.match(workspace, /sourceRemoval\?\.drawingChanged/);
assert.match(workspace, /sourceRemoval\?\.stickContent/);
assert.match(workspace, /setDrawingToolActivationId\(\(current\) => current \+ 1\)/);
assert.match(root, /symbolInstancesByCell/);
assert.match(contract, /definition\.definitionDigest !== item\.definitionDigest/);
assert.match(catalog, /symbol_definition_referenced/);
assert.match(catalog, /duplicate_symbol_content/);

const dirty = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).stdout
  .split("\n").filter(Boolean).map(line => line.slice(3));
assert.equal(dirty.some(path => /(^|\/)(ai|api)(\/|$)|AIAnimator|motion|provider|prompt|video|tracking/i.test(path)), false);
assert.doesNotMatch(readFileSync("app/page.tsx", "utf8"), /phase5-tools-library-cases|spec0006p5/);

console.log(JSON.stringify({
  status: "PASS",
  assertions: 63 + oracle.assertions,
  tabs: fixture.requiredTabs.length,
  drawingTools: fixture.requiredDrawingTools.length,
  catalogCases: fixture.catalogCases.length,
}));
