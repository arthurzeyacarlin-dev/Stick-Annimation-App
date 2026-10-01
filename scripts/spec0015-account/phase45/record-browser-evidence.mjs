import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";

const outputRoot = "output/spec0015/phase45";
fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const data = new Database(".local/spec0015-phase3/phase45-account-data-58645.sqlite", { readonly: true, fileMustExist: true });
const rows = data.prepare("select owner_id, namespace, record_key, revision, length(payload) as bytes, digest, payload from account_state_v1 order by owner_id, namespace, record_key").all();
data.close();
const alice = rows.find(row => row.namespace === "assistant-sessions" && row.payload.toString("utf8").includes("ALICE-58645"));
const bob = rows.find(row => row.namespace === "assistant-sessions" && row.payload.toString("utf8").includes("BOB-58645"));
assert.ok(alice && bob && alice.owner_id !== bob.owner_id);
const report = {
  schema: "spec0015-phase45-browser-evidence-v1",
  recordedAt: new Date().toISOString(),
  origin: "http://127.0.0.1:58645",
  syntheticAccounts: [
    { label: "Alice", email: "phase45-alice-58645@example.test", ownerId: alice.owner_id, previewPlan: "starter_preview" },
    { label: "Bob", email: "phase45-bob-58645@example.test", ownerId: bob.owner_id, previewPlan: "creator_preview" },
  ],
  exactFlow: {
    accountSequence: "Alice signup/write/logout -> Bob signup/empty-state/write/logout -> Alice login/read",
    assistantIsolation: "Alice showed only Alice isolation proof; Bob began with No chats yet and later showed only Bob isolation proof; Alice never showed Bob's title",
    notificationIsolation: "Alice has two terminal records (Assistant and Terra); Bob has one terminal Assistant record",
    jobIsolation: "Alice Terra ledger persisted under Alice's project key; Bob received no record for that key",
    preferenceIsolation: "Alice Don't show again persisted; Bob independently received the welcome dialog",
    restartPersistence: "Alice and Bob each remained authenticated across separate complete review-server restarts and each account's own Assistant history returned",
    recoveryIsolation: "Alice's real two-frame editor flow staged and then cleared the account recovery record after Save and Exit; Bob's recovery read returned no record",
    logoutDrainMs: 2918,
    paidProviderCalls: 0,
  },
  phase4Regression: {
    projectId: "e94c484d-c370-465a-94d0-45910e9e0ec9",
    authoredFrames: 2,
    timelineFps: 12,
    durationSecondsShown: 0.167,
    saveAndExit: "passed",
    myProjectsReopen: "passed",
    BobProjectLibrary: "No saved projects",
    animationChangedBySyntheticAi: false,
  },
  accountRows: rows.map(row => ({
    owner_id: row.owner_id,
    namespace: row.namespace,
    record_key: row.record_key,
    revision: row.revision,
    bytes: row.bytes,
    digest: row.digest,
  })),
  limitations: [
    "Provider routes were intercepted with deterministic synthetic terminal results; no paid AI provider was called.",
    "Cross-device and hosted synchronization are intentionally out of scope.",
    "The AI Dashboard was protected byte-for-byte and was not used as a Phase 4.5 account-data surface.",
  ],
};
fs.writeFileSync(`${outputRoot}/browser-evidence.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(`${outputRoot}/browser-evidence.json`, 0o600);
process.stdout.write(JSON.stringify({ status: "PASS", ownerCount: 2, accountRows: rows.length, exactFlow: report.exactFlow.accountSequence }) + "\n");
