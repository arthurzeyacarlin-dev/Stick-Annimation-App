import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputRoot = resolve("output/spec0014/phase4");
mkdirSync(outputRoot, { recursive: true });
const receipts: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); receipts.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); receipts.push(label); };
const source = (path: string) => readFileSync(path, "utf8");
const fixture = JSON.parse(source("scripts/fixtures/spec0014-notifications/phase-4/contract.json")) as {
  schema: string;
  eventType: string;
  copy: { title: string; body: string };
  restoredEventType: string;
  restoredCopy: { title: string; body: string };
  browserSources: string[];
  onlineSources: string[];
  incidentScenarios: string[];
  reliabilityScenarios: string[];
  boundaries: Record<string, boolean | number>;
};

equal(fixture.schema, "spec0014-phase4-fixture/v1", "Phase 4 fixture schema is exact");
equal(fixture.eventType, "system.internet.offline", "offline event type is exact");
equal(fixture.copy.title, "You're offline", "offline title is exact");
equal(fixture.copy.body, "There is no internet, so AI calls are unavailable. Reconnect to use AI.", "offline body is exact");
equal(fixture.restoredEventType, "system.internet.restored", "restored event type is exact");
equal(fixture.restoredCopy.title, "Internet restored", "restored title is exact");
equal(fixture.restoredCopy.body, "Your connection was restored at this time. You can try online and AI features while the browser remains online.", "restored body is historical, time-bound, and provider-neutral");
equal(fixture.browserSources, ["browser-initial-offline", "browser-offline-event"], "only truthful browser-declared offline sources are authorized");
equal(fixture.onlineSources, ["browser-initial-online", "browser-online-event"], "initial and event-driven online observations stay distinct");
for (const scenario of ["first-offline-creates-one", "repeat-offline-dedupes", "two-tab-dedupes", "reload-reuses-active", "read-does-not-dismiss-warning", "online-event-retires-offline-and-creates-one-restored", "restored-persists-until-acknowledged", "initial-online-is-silent", "duplicate-online-is-silent", "stale-online-reconciliation-is-silent", "offline-preserves-unread-restored", "later-cycle-creates-one-new-restored"]) check(fixture.incidentScenarios.includes(scenario), `incident contract: ${scenario}`);
for (const scenario of ["web-lock", "fallback-lease", "compare-and-swap", "broadcast-loss-reread", "corrupt-row-preservation", "quota-recovery", "deleted-target-unavailable"]) check(fixture.reliabilityScenarios.includes(scenario), `reliability contract: ${scenario}`);
equal(fixture.boundaries.homeBellReceivesOffline, true, "Home receives offline events");
equal(fixture.boundaries.assistantBellReceivesConnectivity, true, "Assistant accepts AI replies plus shared connectivity incidents");
equal(fixture.boundaries.onlineRestorationNotification, true, "genuine online transitions publish one restoration item");
for (const boundary of ["automaticAiRetry", "providerFailureMeansOffline", "exportNotificationProducer", "backgroundExport", "aiAnimationProducer", "lowUsageProducer", "updaterProducer"] as const) equal(fixture.boundaries[boundary], false, `forbidden boundary remains false: ${boundary}`);
equal(fixture.boundaries.realProviderCalls, 0, "real providers are forbidden");
equal(fixture.boundaries.paidCalls, 0, "paid calls are forbidden");
equal(fixture.boundaries.deployments, 0, "deployment is forbidden");

const contracts = source("src/lib/notifications/notificationContracts.ts");
check(contracts.includes('case "system.internet.offline": return { title: "You\'re offline", body: "There is no internet, so AI calls are unavailable. Reconnect to use AI." }'), "closed catalog owns exact offline copy");
check(contracts.includes('case "system.internet.restored": return { title: "Internet restored", body: "Your connection was restored at this time. You can try online and AI features while the browser remains online." }'), "closed catalog owns exact historical provider-neutral restoration copy");
check(contracts.includes('source: "browser-offline-event"') && contracts.includes('source: "browser-initial-offline"'), "offline terminal receipt distinguishes transition from startup provenance");
check(contracts.includes('schema: "online-notification-terminal/v1"') && contracts.includes('source: "browser-online-event"'), "restoration terminal receipt requires a genuine online event");
check(contracts.includes('receipt.source === "browser-offline-event" && receipt.onlineBefore === true') && contracts.includes('receipt.source === "browser-initial-offline" && receipt.onlineBefore === false'), "offline receipt validation rejects false transition claims");
check(contracts.includes('view === "home"') && contracts.includes('notification.eventType === "assistant.reply.completed"') && contracts.includes('notification.eventType === "system.internet.offline"') && contracts.includes('notification.eventType === "system.internet.restored"'), "Home all-event and Assistant AI/connectivity filtering are explicit");
for (const dormant of ["workspace.ai-animation.completed", "ai.usage.low", "app.update.available"]) check(contracts.includes(dormant), `dormant schema retained without producer: ${dormant}`);

const storage = source("src/lib/notifications/notificationStorage.ts");
check(storage.includes('schema: "browser-connectivity-incident/v1"'), "durable active incident schema exists");
check(storage.includes('source: "browser-offline-event" | "browser-initial-offline"') && storage.includes("onlineBefore: boolean"), "active metadata persists truthful incident provenance");
check(storage.includes('offlineIncidentId: `offline-${crypto.randomUUID()}`'), "incident identity is generated inside storage ownership");
check(storage.includes("withSerializedWriter") && storage.includes("navigator.locks") && storage.includes("fallback-lease-final-verification-failed"), "offline writes reuse Web Lock and fallback lease serialization");
check(storage.includes("compare-and-swap-failed") && storage.includes("liveConnectivity"), "connectivity state participates in final CAS");
check(storage.includes("commitGuard") && storage.includes('navigator.onLine !== false') && storage.includes('navigator.onLine === false') && storage.includes('status: "stale-observation"'), "serialized writer rejects observations invalidated before final commit by a later browser transition");
check(storage.includes("fitRowsWithinLimits") && storage.includes("corrupt rows remain immutable capacity occupants"), "capacity and corrupt-row preservation remain enforced");
check(storage.includes("metadataStore.delete(\"connectivity\")"), "online reconciliation clears active metadata");
check(storage.includes("committedNotification: envelope.notification"), "new offline incident publishes one unread commit");
check(storage.includes('source === "browser-initial-online"') && storage.includes('schema: "online-notification-terminal/v1"'), "initial online cleanup is silent while genuine online events publish restoration");
const offlineStorage = storage.slice(storage.indexOf("export async function observeBrowserOfflineV1"), storage.indexOf("export async function observeBrowserOnlineV1"));
check(!offlineStorage.includes('notification.eventType === "system.internet.restored"') && offlineStorage.includes("[...rows, { recordKey: incomingKey, envelope }]"), "a new offline incident preserves unread restoration history while adding a separate warning");

const observer = source("src/lib/notifications/offlineIncidentObserver.ts");
check(observer.includes("navigator.onLine === false") && observer.includes("observeBrowserOfflineV1") && observer.includes("observeBrowserOnlineV1"), "observer reads browser-declared connectivity only");
check(observer.includes('window.addEventListener("offline", observeOfflineEvent)') && observer.includes('window.addEventListener("online", observeOnlineEvent)') && observer.includes('observe("browser-initial-observation")'), "observer distinguishes genuine transitions from initial/reconciliation observations");
check(observer.includes('observe("browser-online-event")') && observer.includes('"browser-initial-online"'), "only genuine online events can publish restoration");
check(!observer.includes("fetch(") && !observer.includes("Assistant") && !observer.includes("Terra"), "observer has no provider or AI failure inference");

const provider = source("src/components/notifications/NotificationCenterProvider.tsx");
check(provider.includes("startBrowserConnectivityObserverV1") && provider.includes("browserOffline"), "root provider owns browser connectivity truth for both bells");
check(provider.includes("startAssistantCompletionObserverV1") && provider.includes("startTerraCompletionObserverV1"), "accepted Assistant and Terra observers remain mounted");

const trigger = source("src/components/notifications/NotificationTrigger.tsx");
check(trigger.includes("browserOffline ? styles.offline") && trigger.includes('data-notification-offline={browserOffline ? "true" : "false"}'), "both existing bells expose the persistent red offline state");
check(trigger.includes('notification.target.kind === "connectivity-warning" || notification.target.kind === "connectivity-restored"') && trigger.includes("await markRead(notification.notificationId)"), "connectivity rows acknowledge one shared record without false navigation");
check(trigger.includes("setAnnouncement") && !trigger.includes('notification.origin.kind !== "connectivity"'), "offline notification receives one polite bell announcement");
check(trigger.includes("data-notification-offline-status") && trigger.includes("browserOffline && !hasUnreadOffline"), "red bell retains truthful live panel status after the unread row is acknowledged");
check(trigger.includes("notificationBelongsToViewV1"), "existing per-view bell filtering remains authoritative");

const styles = source("src/components/notifications/notificationCenter.module.css");
check(styles.includes(".offline, .offline.ringing") && styles.includes("#ff5f6d") && styles.includes(".offline .dot"), "offline bell ring and unread indicator are red, not green");
check(!styles.includes("offlineWarning"), "rejected page-wide warning styling is absent");

const runtimeSearch = [
  source("src/components/notifications/NotificationCenterProvider.tsx"),
  source("src/components/notifications/NotificationTrigger.tsx"),
  source("src/lib/notifications/offlineIncidentObserver.ts"),
].join("\n");
for (const forbidden of ["export.completed", "export.failed", "workspace.ai-animation.completed", "ai.usage.low", "app.update.available", "OPENAI_API_KEY", "/api/ai-animator", "/api/diamond-assistant"]) check(!runtimeSearch.includes(forbidden), `Phase 4 runtime does not produce or call ${forbidden}`);

type Incident = { id: string };
type Row = { incidentId: string; eventType: "offline" | "restored"; read: boolean };
let active: Incident | null = null;
const durable: Row[] = [];
const offline = () => {
  if (active) return active;
  active = { id: `incident-${durable.filter(row => row.eventType === "offline").length + 1}` };
  durable.push({ incidentId: active.id, eventType: "offline", read: false });
  return active;
};
const online = (source: "event" | "initial") => {
  if (!active) return null;
  const incident = active;
  for (const row of durable) if (row.eventType === "offline" && row.incidentId === incident.id) row.read = true;
  active = null;
  if (source === "event") durable.push({ incidentId: incident.id, eventType: "restored", read: false });
  return incident;
};
equal(offline().id, "incident-1", "model creates first incident");
equal(offline().id, "incident-1", "model reuses repeated offline incident");
equal(durable.length, 1, "model stores one row per active incident");
check(active !== null, "model read state does not clear the active browser-offline state");
online("event");
equal(active, null, "model online clears active warning");
equal(durable.filter(row => !row.read).map(row => row.eventType), ["restored"], "model genuine online event retires offline and creates one unread restoration");
equal(offline().id, "incident-2", "model later offline creates a new incident");
equal(durable.filter(row => !row.read).map(row => row.eventType), ["restored", "offline"], "model later offline preserves unread restoration beside the current warning");
online("initial");
equal(durable.filter(row => !row.read).map(row => row.eventType), ["restored"], "model initial-online reconciliation clears only the stale offline incident");
durable.find(row => row.eventType === "restored")!.read = true;
equal(durable.filter(row => !row.read).length, 0, "model restoration clears only through explicit acknowledgement");
equal(durable.length, 3, "model retains durable incident and restoration history");

const result = { schema: "spec0014-phase4-oracle/v1", status: "PASS", assertions: receipts.length, receipts, providerRequests: 0, paidCalls: 0 };
writeFileSync(resolve(outputRoot, "oracle.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 4 oracle PASS (${receipts.length} assertions)\n`);
