import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const bootstrap = read("src/lib/animation/unifiedWorkspaceBootstrap.ts");
const shell = read("src/components/workspace/AnimationWorkspace.tsx");
const workspace = read("src/components/workspace/DrawingWorkspace.tsx");
const canvas = read("src/components/workspace/DrawingCanvas.tsx");
const page = read("app/page.tsx");
const sourceReader = read("src/lib/animation/unifiedProjectSourceReader.ts");
const collection = read("src/lib/animation/unifiedProjectCollection.ts");
const matrix = JSON.parse(read("scripts/fixtures/spec0006-unified/v2/phase7-acceptance-cases.json"));

let assertions = 0;
const check = (condition: unknown, message: string) => { assertions += 1; assert.ok(condition, message); };
const absent = (source: string, pattern: RegExp, message: string) => check(!pattern.test(source), message);

check(matrix.ordinaryFlows.length === 9, "all nine ordinary acceptance flows are frozen");
check(matrix.regressions.length === 12, "REG-01 through REG-12 are frozen");
check(matrix.profiles.length === 2, "desktop and compact profiles are frozen");
check(matrix.accessibility.length === 4, "the complete accessibility matrix is frozen");

check(/editor:\s*\{ kind: "unified"; project: UnifiedAnimationProjectV2 \}/.test(bootstrap), "bootstrap exposes only the V2 editor candidate");
absent(bootstrap, /kind: "drawing"|kind: "stick"/, "bootstrap has no split editor candidate");
check((bootstrap.match(/editor: \{ kind: "unified", project \}/g) ?? []).length === 3, "New, native Open, and compatibility Open publish the V2 editor");
check((shell.match(/<DrawingWorkspace\b/g) ?? []).length === 1, "ordinary shell mounts exactly one coordinator");
absent(shell, /StickFigureWorkspace|UnifiedAnimationStage|data-editor-kind/, "ordinary shell has no retired mount or editor-kind switch");
check(/<DrawingWorkspace initialProject=.* unifiedProject=/.test(shell), "ordinary shell passes the canonical V2 project");
check(/<AnimationWorkspace root=\{workspace\}/.test(page), "ordinary page reaches the unified shell");

for (const forbidden of [
  "saveStoredDrawingProject", "saveStoredStickProject", "persistProject", "drawingProjectAiMemorySync",
  "activeStorageRevisionRef", "legacyRecordDigestRef", "deferInitialMemorySync",
]) absent(workspace, new RegExp(forbidden), `retired write authority is absent: ${forbidden}`);
check(/saveUnifiedProjectV2\(candidate\)/.test(workspace), "Save uses the V2 repository");
check(/saveUnifiedProjectAsV2\(candidate, trimmedProjectName\)/.test(workspace), "Save As uses the V2 repository");
check(/actionPlan\.action === "save-project"[\s\S]{0,100}return saveProject\(\)/.test(workspace), "AI save-project reaches the same V2 Save door");
check(/unifiedProject: UnifiedAnimationProjectV2;/.test(workspace), "workspace requires a V2 project");
check(/useRef<DrawingWorkspaceHistoryEntry\[\]>/.test(workspace), "one mounted workspace owns global history");
check(/onOpenStickFigureCreator=\{openStickFigureCreator\}/.test(workspace), "Creator is routed inside the sole root");
check(/aria-modal="true"/.test(workspace) && /Save Stick Figure/.test(read("src/components/workspace/stickfigure/StickFigureCreatorWorkspace.tsx")), "Creator remains modal with its protected disabled Save surface");
check(/aria-label="Open Stick Figure Creator"/.test(canvas), "Creator has one accessible ordinary trigger");

for (const source of [sourceReader, collection]) {
  absent(source, /saveStoredDrawingProject|saveStoredStickProject|saveUnifiedProjectV2|saveUnifiedProjectAsV2/, "legacy source leaf has no write call");
}
check(/readDrawingProjectV1Storage/.test(sourceReader) && /STICK_PROJECT_STORAGE_KEY/.test(sourceReader), "legacy Drawing and Stick parsers remain reachable as read leaves");
absent(page + shell + workspace + canvas, /MIXED-REALISTIC-01|DRAWING \+ STICK|phase7|fixture picker|pm_review/i, "ordinary product root contains no seeded or proof surface");

console.log(JSON.stringify({ status: "PASS", assertions, ordinaryFlows: matrix.ordinaryFlows.length, regressions: matrix.regressions.length }));
