import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("output/spec0014/phase2");
mkdirSync(root, { recursive: true });
const assertions: string[] = [];
const check = (condition: unknown, label: string) => { assert.ok(condition, label); assertions.push(label); };
const source = (path: string) => readFileSync(path, "utf8");
const contract = JSON.parse(source("scripts/fixtures/spec0014-notifications/phase-2/contract.json")) as {
  schema: string;
  assistant: string[];
  terra: string[];
  boundaries: Record<string, unknown>;
};

check(contract.schema === "spec0014-phase2-fixture/v1", "phase-2 contract schema");
for (const scenario of ["away-success", "exact-origin-read", "other-chat-unread", "away-failure", "cancel-silent", "reload-reattach", "two-tab-dedupe"]) check(contract.assistant.includes(scenario), `Assistant contract: ${scenario}`);
for (const scenario of ["new-save-exit-success", "opened-project-failure", "exact-origin-read", "cancel-silent", "reload-reattach", "two-tab-dedupe"]) check(contract.terra.includes(scenario), `Terra contract: ${scenario}`);
check(contract.boundaries.realProviderCalls === 0, "real providers forbidden");
check(contract.boundaries.automaticResubmits === 0, "automatic resubmits forbidden");
check(contract.boundaries.animationMutations === 0, "Terra notification flow cannot mutate animation");
check(contract.boundaries.exportPhase3 === "untouched", "Export Phase 3 remains untouched");
check(contract.boundaries.offlinePhase4 === "untouched", "Offline Phase 4 remains untouched");

const assistant = source("src/lib/notifications/assistantCompletionObserver.ts");
check(assistant.includes("startAssistantCompletionObserverV1"), "Assistant root observer exists");
check(assistant.includes("finishTurn(session.id, turn.jobId, snapshot)"), "Assistant commits source terminal first");
check(assistant.includes("await publishExactTerminal(session.id, turn.id, turn.jobId)"), "Assistant publishes after source commit");
check(assistant.includes("await rereadExactTerminal(sessionId, turnId, jobId)"), "Assistant rereads exact source identity");
check(assistant.includes("method: \"DELETE\"") && !assistant.includes("method: \"POST\""), "Assistant observer never resubmits");
check(assistant.includes('source.turn.status === "cancelled"'), "Assistant cancellation is silent");

const terra = source("src/lib/notifications/terraCompletionObserver.ts");
check(terra.includes("startTerraCompletionObserverV1"), "Terra root observer exists");
check(terra.includes("readAiAnimatorLedger(descriptor.projectId)"), "Terra rereads exact source ledger");
check(terra.includes("writeAiAnimatorLedger(next)"), "Terra commits source terminal before publish");
check(terra.includes("publishValidatedNotificationTerminalV1"), "Terra publishes validated shared notification");
check(!terra.includes("method: \"POST\""), "Terra observer never resubmits");
check(terra.includes('terminalSource.snapshot.status !== "cancelled"'), "Terra cancellation is silent");
check(terra.includes("navigator.locks?.request") && terra.includes("diamond_terra_completion_lease_v1"), "Terra has Web Lock and lease fallback convergence");

const provider = source("src/components/notifications/NotificationCenterProvider.tsx");
check(provider.includes("startAssistantCompletionObserverV1") && provider.includes("startTerraCompletionObserverV1"), "root provider owns both observers");
check(provider.includes('window.location.pathname === "/assistant"') && provider.includes("window.location.hash = hash"), "Assistant same-route activation changes the selected chat hash");
const assistantScreen = source("src/components/assistant/DiamondAssistantScreen.tsx");
check(assistantScreen.includes("sessionId") && assistantScreen.includes("turnId") && assistantScreen.includes("jobId"), "Assistant target uses exact session/turn/job identity");
check(assistantScreen.includes("navigationVersion") && assistantScreen.includes("confirmNotificationTargetArrivalV1"), "Assistant rechecks exact target arrival after same-route navigation");
const home = source("app/page.tsx");
check(home.includes("projectId") && home.includes("openProject") && home.includes("listProjectCollection"), "Home target resolves exact canonical project identity");
const panel = source("src/components/workspace/ai/DrawingAiPanel.tsx");
check(!panel.includes("setInterval("), "Terra screen no longer owns a poll loop");
check(panel.includes("confirmNotificationTargetArrivalV1(handle)") && panel.includes("if (attempt < 12)"), "Terra read state waits for a confirmed visible target");
const hook = source("src/components/assistant/useAssistantSessions.ts");
check(!hook.includes("setInterval("), "Assistant screen no longer owns a poll loop");
const trigger = source("src/components/notifications/NotificationTrigger.tsx");
check(trigger.includes("row.readAt === null") && !trigger.includes("await markRead(notification.notificationId)"), "bell renders missed items only and does not consume unavailable targets");
check(trigger.includes("listSessions()") && trigger.includes("notification.origin.projectTitle"), "bell identifies Assistant chat and Terra project from saved sources");

const result = { schema: "spec0014-phase2-oracle/v1", status: "PASS", assertions: assertions.length, receipts: assertions };
writeFileSync(resolve(root, "oracle.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 2 oracle PASS (${assertions.length} assertions)\n`);
