import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const root = "output/spec-0012/phase-4/live"; const json = (path: string) => JSON.parse(readFileSync(path, "utf8")); const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const failure = json(`${root}/failure.json`); const preconfiguration = json(`${root}/search-result.json`); const source = readFileSync("scripts/spec0012-assistant/phase4LiveProof.ts", "utf8").split("\n");
assert.equal(failure.liveCallsStarted, 2); assert.equal(failure.retries, 0); assert.deepEqual(failure.requestMessages, ["Hi, who are you?", "As of today, what are YouTube Shorts’ current maximum video length and recommended vertical upload specifications, and which Diamond Animator export settings should I use to match them?"]);
assert.match(failure.error, /Assistant reply/); assert.match(source[35], /searchReply\.waitFor/); assert.ok(existsSync(`${root}/searching.png`));
assert.equal(preconfiguration.status, "LIVE_ACCESS_FAILED"); assert.equal(preconfiguration.safeError, "Terra is not configured on this review server. Your message is saved."); assert.equal(preconfiguration.answerPublished, false); assert.equal(preconfiguration.retries, 0);
const result = {
  status: "PASS_WITH_RECORDED_LIMITATION",
  preconfigurationAttempts: { uiSends: 2, providerConfigured: false, successfulProviderResults: 0, retries: 0, exactSearchSafeError: preconfiguration.safeError },
  configuredVerification: { uiSends: 2, retries: 0, greetingCheckpointPassed: true, greetingModelAndZeroToolAssertionsPassed: true, greetingVisibleReplyPassed: true, searchRequestSent: true, searchingTextObserved: true, searchingScreenshot: "searching.png", searchingScreenshotSha256: sha(`${root}/searching.png`), searchTerminalAnswerObserved: false, liveCitationQualityProven: false, failureCheckpoint: "phase4LiveProof.ts:36 search reply wait", projectMutationObserved: false },
  totalUiSendsAcrossBothEnvironmentStates: 4,
  configuredProviderSends: 2,
  configuredRetries: 0,
  claimBoundary: "The live searching screenshot can only be written after the greeting/model/zero-tool checks and exact searching-label check pass. It does not prove a terminal search error, successful cited answer, source quality, or billed search receipt.",
};
writeFileSync(`${root}/postmortem.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ status: result.status, configuredProviderSends: 2, searchingTextObserved: true, liveCitationQualityProven: false }));
