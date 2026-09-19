import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AI_ANIMATOR_MODEL,
  AI_ANIMATOR_REASONING_EFFORT,
  normalizeAiAnimatorJobSnapshot,
  normalizeAiAnimatorRequest,
  type AiAnimatorIntent,
  type AiAnimatorProviderResult,
  type AiAnimatorRequest,
} from "../../src/lib/ai/aiAnimatorContract.ts";
import { AiAnimatorJobService } from "../../src/lib/ai/aiAnimatorJobService.ts";
import {
  createEmptyAiAnimatorLedger,
  readAiAnimatorLedger,
  upsertAiAnimatorJob,
  writeAiAnimatorLedger,
} from "../../src/lib/ai/aiAnimatorStorage.ts";

type SemanticCase = { id: string; prompt: string; intent: AiAnimatorIntent };
const cases = JSON.parse(readFileSync("scripts/fixtures/spec0008-ai-animator/v1/semantic-cases.json", "utf8")) as SemanticCase[];
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (actual: unknown, label: string) => { assertions += 1; assert.ok(actual, label); };
const eventually = async (predicate: () => boolean, label: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) { assertions += 1; return; }
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail(label);
};

const baseRequest = (id: string, message = "hello", reasoningLevel: AiAnimatorRequest["reasoningLevel"] = "medium"): AiAnimatorRequest => ({
  jobId: id,
  turnId: `turn-${id}`,
  message,
  reasoningLevel,
  recentConversation: [],
  workspace: { projectId: "project-a", projectTitle: "Untitled Project", projectGeneration: 7, totalLayers: 1, authoredFrameCount: 1, timelineFps: 12, activeTool: "Brush" },
});
const providerResult = (intent: AiAnimatorIntent): AiAnimatorProviderResult => ({
  reply: {
    intent,
    reply: intent === "conversation" ? "Hello! I’m Terra. What would you like to explore?" : intent === "clarify" ? "Which part do you mean?" : "I can outline that request.",
    focusedQuestion: intent === "clarify" ? "Which exact part should change?" : null,
    planSummary: intent === "create-animation" || intent === "edit-animation" ? "A bounded non-mutating readiness plan." : null,
  },
  requestedModel: AI_ANIMATOR_MODEL,
  providerModel: AI_ANIMATOR_MODEL,
  responseId: "resp_test",
  usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130, estimatedCostUsd: 0.00056 },
  latencyMs: 12,
  promptDigest: "a".repeat(64),
});

equal(AI_ANIMATOR_MODEL, "gpt-5.6-terra", "production model is exact");
equal(AI_ANIMATOR_REASONING_EFFORT, { low: "low", medium: "medium", high: "high", "extra-high": "xhigh" }, "all reasoning mappings are exact");
for (const level of ["low", "medium", "high", "extra-high"] as const) {
  const request = baseRequest(`reasoning-${level}`, "test", level);
  equal(normalizeAiAnimatorRequest(request)?.reasoningLevel, level, `${level} request validates without fallback`);
}
equal(normalizeAiAnimatorRequest({ ...baseRequest("bad"), reasoningLevel: "max" }), null, "unexposed max effort fails closed");
equal(normalizeAiAnimatorRequest({ ...baseRequest("bad"), recentConversation: Array.from({ length: 13 }, () => ({ role: "user", content: "x" })) }), null, "oversized context count fails closed");
equal(normalizeAiAnimatorRequest({ ...baseRequest("bad"), workspace: { ...baseRequest("bad").workspace, projectGeneration: -1 } }), null, "invalid generation fails closed");

const intents = new Map(cases.map(testCase => [testCase.id, testCase.intent]));
const calls: AiAnimatorRequest[] = [];
const service = new AiAnimatorJobService(async request => {
  calls.push(request);
  const intent = intents.get(request.jobId);
  if (!intent) throw new Error("unknown deterministic case");
  return providerResult(intent);
});
for (const testCase of cases) {
  const initial = service.submit(baseRequest(testCase.id, testCase.prompt));
  equal(initial.status, "thinking", `${testCase.id} starts in truthful Thinking`);
  await eventually(() => service.get(testCase.id, "project-a")?.status === "done", `${testCase.id} reaches Done`);
  const terminal = service.get(testCase.id, "project-a")!;
  equal(terminal.events.at(-1)?.reply?.intent, testCase.intent, `${testCase.id} intent comes from structured provider output`);
  equal(terminal.events.map(event => event.sequence), terminal.events.map((_, index) => index + 1), `${testCase.id} event sequence is monotonic`);
  equal(terminal.telemetry.outcome, "succeeded", `${testCase.id} records a successful terminal outcome`);
  equal(terminal.telemetry.latencyMs, 12, `${testCase.id} records provider latency`);
  check(/^[0-9a-f]{64}$/.test(terminal.telemetry.promptDigest), `${testCase.id} records only a prompt digest in telemetry`);
  if (testCase.intent === "create-animation" || testCase.intent === "edit-animation") {
    check(terminal.events.at(-1)?.reply?.reply.includes("No animation was changed."), `${testCase.id} is explicitly non-mutating`);
    equal(terminal.events.map(event => event.status), ["thinking", "planning", "done"], `${testCase.id} uses truthful phase statuses`);
  } else {
    equal(terminal.events.map(event => event.status), ["thinking", "done"], `${testCase.id} skips unexecuted phases`);
  }
}
equal(calls.length, cases.length, "one provider request per turn with no retry");
check(calls.every(call => call.recentConversation.length <= 12), "every provider call has bounded context");

let releaseCancelled!: () => void;
const cancelService = new AiAnimatorJobService(async (_request, { signal }) => new Promise((resolve, reject) => {
  releaseCancelled = () => resolve(providerResult("conversation"));
  signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
}));
cancelService.submit(baseRequest("cancel-job"));
equal(cancelService.cancel("cancel-job", "project-a")?.status, "cancelled", "cancel is terminal");
equal(cancelService.get("cancel-job", "project-a")?.telemetry.outcome, "cancelled", "cancel records terminal telemetry");
releaseCancelled();
await new Promise(resolve => setTimeout(resolve, 5));
equal(cancelService.get("cancel-job", "project-a")?.status, "cancelled", "late completion cannot overwrite Cancelled");
equal(cancelService.get("cancel-job", "project-b"), null, "cross-project job lookup is denied");

const wrongModelService = new AiAnimatorJobService(async () => ({ ...providerResult("conversation"), providerModel: "gpt-5.4" }));
wrongModelService.submit(baseRequest("wrong-model"));
await eventually(() => wrongModelService.get("wrong-model", "project-a")?.status === "failed", "alternate model fails closed");
equal(wrongModelService.get("wrong-model", "project-a")?.events.at(-1)?.errorCode, "provider_failed", "model mismatch is an honest failure");

const validSnapshot = service.get("greeting", "project-a")!;
check(normalizeAiAnimatorJobSnapshot(validSnapshot), "valid monotonic job snapshot is accepted");
equal(normalizeAiAnimatorJobSnapshot({ ...validSnapshot, lastSequence: 99 }), null, "missing event sequences are rejected");
equal(normalizeAiAnimatorJobSnapshot({ ...validSnapshot, events: validSnapshot.events.map((event, index) => ({ ...event, sequence: index ? 4 : 1 })) }), null, "out-of-order events are rejected");
equal(normalizeAiAnimatorJobSnapshot({ ...validSnapshot, projectGeneration: -2 }), null, "stale invalid generation is rejected");

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const storage = new MemoryStorage();
const projectALedger = upsertAiAnimatorJob({ ...createEmptyAiAnimatorLedger("project-a"), messages: [{ id: "m1", role: "user", content: "private A", createdAt: new Date().toISOString() }] }, validSnapshot);
writeAiAnimatorLedger(projectALedger, storage);
writeAiAnimatorLedger({ ...createEmptyAiAnimatorLedger("project-b"), messages: [{ id: "m2", role: "user", content: "private B", createdAt: new Date().toISOString() }] }, storage);
equal(readAiAnimatorLedger("project-a", storage).messages[0]?.content, "private A", "project A transcript persists");
equal(readAiAnimatorLedger("project-b", storage).messages[0]?.content, "private B", "project B transcript remains isolated");
check(JSON.stringify(readAiAnimatorLedger("project-b", storage)).includes("private A") === false, "project B cannot see project A transcript");

const panelSource = readFileSync("src/components/workspace/ai/DrawingAiPanel.tsx", "utf8");
const canvasSource = readFileSync("src/components/workspace/DrawingCanvas.tsx", "utf8");
const rightPanelSource = readFileSync("src/components/workspace/DrawingRightPanel.tsx", "utf8");
const timelineSource = readFileSync("src/components/workspace/DrawingTimelineRow.tsx", "utf8");
const toolBarSource = readFileSync("src/components/workspace/DrawingToolBar.tsx", "utf8");
const workspaceSource = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");
const providerSource = readFileSync("src/lib/openai/generateAiAnimatorReply.ts", "utf8");
const routeSource = readFileSync("app/api/ai-animator/route.ts", "utf8");
for (const forbidden of ["Generate Plans", "Generate Frames", "Generate Sounds", "Task:", "gpt-5.4", "gpt-5.3", "gpt-5.2", "shouldSearch", "web_search"]) {
  check(!`${panelSource}\n${providerSource}\n${routeSource}`.includes(forbidden), `ordinary Phase 1 path excludes ${forbidden}`);
}
check(!panelSource.includes("AI Animator could not complete this request"), "rejected generic failure sentence is absent");
check(panelSource.includes('data-text="Thinking"') && !panelSource.includes('data-text="Planning"'), "Phase 1 active presentation exposes Thinking only");
check(panelSource.includes("ai-animator-sweep-primary 3.75s linear") && panelSource.includes("ai-animator-sweep-follow 3.75s linear"), "Thinking uses two distinct steady linear sweeps on one 3.75-second cycle");
check(panelSource.includes("ai-animator-sweep-primary-visibility 3.75s steps(1, end)") && panelSource.includes("ai-animator-sweep-follow-visibility 3.75s steps(1, end)") && panelSource.includes("26.6667%, 100% { opacity: 0") && panelSource.includes("26.6667% { opacity: 1") && panelSource.includes("53.3333%, 100% { opacity: 0"), "paired sweep timeline uses a discrete no-overlap handoff after one second and a 1.75-second final pause");
check(panelSource.includes("mask-size: 57% 100%") && panelSource.includes("#000 18%") && panelSource.includes("#000 82%"), "both Thinking highlights use a broad fifty-seven-percent mask with soft edges");
check(panelSource.includes("-webkit-mask-position: -132.5581% 50%; mask-position: -132.5581% 50%") && panelSource.includes("-webkit-mask-position: 232.5581% 50%; mask-position: 232.5581% 50%"), "both sweeps use mathematically derived endpoints that place a fifty-seven-percent mask fully outside each label edge");
check(Math.abs((1 - 0.57) * -132.5581 / 100 + 0.57) < 0.000_01 && Math.abs((1 - 0.57) * 232.5581 / 100 - 1) < 0.000_01, "full-travel endpoint math resolves to mask right edge zero at entry and mask left edge one at exit");
check(panelSource.includes("#2f86ff") && panelSource.includes("#a9eeff") && panelSource.includes("#103f82") && panelSource.includes("#48cee7"), "paired sweep palette contains distinct bold bright-blue and darker cyan/blue fills");
check(panelSource.includes("MINIMUM_THINKING_PRESENTATION_MS = 2_000") && panelSource.includes("submittedThinkingStartedAtRef"), "newly submitted jobs own an exact client-only two-second Thinking presentation clock");
check(panelSource.includes("remainingMs = MINIMUM_THINKING_PRESENTATION_MS") && panelSource.includes("pendingTerminalPresentationRef"), "fast terminal snapshots are presentation-gated only for the remaining minimum duration");
check(panelSource.includes('incoming.status === "cancelled"') && panelSource.includes("applySnapshot(snapshot, true)"), "cancellation explicitly bypasses the minimum presentation gate");
check(panelSource.includes("startedAt === undefined") && panelSource.includes("clearPendingPresentation();"), "reconnected jobs bypass the new-submit gate and pending timers clean up on project change or unmount");
check(panelSource.includes("requestAnimationFrame(reveal)") && panelSource.includes("TYPEWRITER_MAX_MS = 720"), "assistant reveal is frame-driven and fast-bounded");
check(panelSource.includes("ai-animator-typewriter-edge") && panelSource.includes("#71e7ff"), "assistant reveal has a cool gradient leading edge");
check(canvasSource.includes("RIGHT_PANEL_MIN_WIDTH = 280") && canvasSource.includes("RIGHT_PANEL_DEFAULT_WIDTH = 420") && canvasSource.includes("RIGHT_PANEL_MAX_WIDTH = 520") && canvasSource.includes("RIGHT_PANEL_MIN_WORKSPACE_WIDTH = 360") && canvasSource.includes("RIGHT_PANEL_SNAP_THRESHOLD = 16") && canvasSource.includes("rightPanelBounds.defaultWidth"), "desktop sidebar resizing owns exact default, snap, minimum, maximum, protected-workspace bounds, and fixed effective-default canvas reservation");
check(canvasSource.includes("(rightPanelBounds.defaultWidth - rightPanelWidth) / 2") && canvasSource.includes("onRightPanelWidthChange?.(rightPanelWidth)"), "the unchanged stage is translated by half the sidebar-width delta and publishes the live width to sibling chrome");
check(canvasSource.includes("resize.startWidth - (event.clientX - resize.startX)") && canvasSource.includes("setPointerCapture(event.pointerId)"), "sidebar drag direction and pointer capture match the left-widens/right-narrows contract");
check(canvasSource.includes("!event.isPrimary || event.button !== 0") && canvasSource.includes("onPanelResizePointerEnd={endRightPanelResize}"), "sidebar resizing rejects non-primary buttons and shares one safe pointer completion path");
check(rightPanelSource.includes('role="separator"') && rightPanelSource.includes('aria-orientation="vertical"') && rightPanelSource.includes("aria-valuemin") && rightPanelSource.includes("onPointerCancel={onPanelResizePointerEnd}") && rightPanelSource.includes("onLostPointerCapture={onPanelResizePointerEnd}"), "resize separator exposes accessible range semantics plus pointer cancel and lost-capture recovery");
check(rightPanelSource.includes("onPanelResizeKeyDown") && rightPanelSource.includes("onDoubleClick={onPanelResizeReset}") && rightPanelSource.includes('cursor: "col-resize"'), "resize separator supports keyboard operation, default reset, and the correct cursor");
check(rightPanelSource.includes('@media (max-width: 640px)') && rightPanelSource.includes('.drawing-right-panel-resizer') && rightPanelSource.includes('display: none !important') && rightPanelSource.includes('position: relative !important') && rightPanelSource.includes('inset: auto !important'), "compact CSS restores the existing stacked panel position and hides the desktop resizer");
check(rightPanelSource.includes('position: "absolute"') && rightPanelSource.includes('inset: "0 0 0 auto"'), "desktop sidebar is a right-anchored overlay");
check(toolBarSource.includes("rightPanelWidth: number") && toolBarSource.includes('data-workspace-tool-bar="true"') && toolBarSource.includes("calc(100% - ${rightPanelWidth}px)") && toolBarSource.includes('gridTemplateColumns: "repeat(8, minmax(42px, 1fr))"') && toolBarSource.includes('boxSizing: "border-box"'), "the eight-tool bar ends at the live sidebar edge while redistributing fixed clickable tools across the visible pane");
check(workspaceSource.includes("const [rightPanelWidth, setRightPanelWidth] = useState(420)") && workspaceSource.includes("onRightPanelWidthChange={setRightPanelWidth}") && workspaceSource.includes("rightPanelWidth={rightPanelWidth}") && workspaceSource.includes('position: "relative", zIndex: 10'), "workspace coordinates live sidebar width across stage and toolbar under the timeline stack boundary");
check(timelineSource.includes("const collapsedRightPanelHeight = TIMELINE_RULER_HEIGHT + collapsedRowsHeight + scrollbarHeight") && timelineSource.includes('data-timeline-panel={isOverlay ? "overlay" : "baseline"}') && timelineSource.includes('data-timeline-panel-resizer="true"') && timelineSource.includes('data-timeline-layer-active={isActiveLayer ? "true" : "false"}') && timelineSource.includes("zIndex: 12"), "desktop timeline reserves only the collapsed strip, stays above the complete sidebar, and exposes verifiable interactive overlay controls");
check(panelSource.includes("ai-animator-assistant-message { padding: 0; border: 0; border-radius: 0; background: transparent"), "assistant presentation is explicitly bubble-free");
check(panelSource.includes("ai-animator-sr-only") && panelSource.includes("Terra: {message.content}"), "assistant accessibility exposes one coherent full reply");
check(panelSource.includes("prefers-reduced-motion: reduce") && panelSource.includes(".ai-animator-assistant-visual { display: none; }") && panelSource.includes(".ai-animator-reduced-copy { display: inline; }"), "reduced motion disables sweeps/typewriter and exposes full text");
check(!providerSource.includes("maxAttempts") && !providerSource.includes("retry"), "provider wrapper has no automatic retry");
check(!/\b(hello|shuriken|alien|ufo)\b/i.test(providerSource.replace(instructionsPattern(), "")), "provider code has no acceptance-story branch tokens");

function instructionsPattern() { return /const instructions = `[\s\S]*?`;/; }

console.log(JSON.stringify({ status: "PASS", assertions, semanticCases: cases.length, providerCalls: calls.length, model: AI_ANIMATOR_MODEL }));
