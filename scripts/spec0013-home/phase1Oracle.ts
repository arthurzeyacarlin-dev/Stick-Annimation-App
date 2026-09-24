import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CATALOG_VERSION, sealSession, validateSession, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { KNOWLEDGE_CATALOG } from "../../src/lib/assistant/assistantKnowledge.ts";

const output = "output/spec-0013/phase-1/oracle";
mkdirSync(output, { recursive: true });
const checks: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); checks.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks.push(label); };
const page = readFileSync("app/page.tsx", "utf8");
const knowledge = readFileSync("src/lib/assistant/assistantKnowledge.ts", "utf8");
const globals = readFileSync("app/globals.css");
const baseGlobals = execFileSync("git", ["show", "HEAD:app/globals.css"]);

check(!page.includes('"aiProject"'), "obsolete Finalizer hover identity is absent");
check(!page.includes("AI Project Finalizer") && !page.includes("Apply final AI touches to your project."), "Finalizer card copy is absent from Home source");
check(page.includes('onClick={() => { setExportOrigin("home"); setView("animationExport"); }}'), "Export keeps its accepted Home handler");
check(page.includes('padding: "30px 20px 60px 20px"') && page.includes('overflowY: "auto"'), "Home keeps intrinsic scrolling and 60px bottom padding");
equal(createHash("sha256").update(globals).digest("hex"), createHash("sha256").update(baseGlobals).digest("hex"), "Home/global scrollbar CSS is byte-identical to the base");
equal(CATALOG_VERSION, "diamond-animator-knowledge/v1:2026-09-24", "catalog identity advances with the corrected fact set");
equal(KNOWLEDGE_CATALOG.verifiedAt, "2026-09-24", "knowledge verification date advances");
const finalizer = KNOWLEDGE_CATALOG.entries.find(entry => entry.id === "finalizer");
check(!!finalizer && finalizer.status === "unavailable", "Finalizer remains explicitly unavailable");
check(!!finalizer && /not included on the Version 1 Home screen/.test(finalizer.guidance), "guidance states the Version 1 Home result");
check(!!finalizer && !/Home card does not open/.test(finalizer.guidance), "guidance no longer directs users to the removed card");
check(!knowledge.includes("app/page.tsx:1322"), "stale Finalizer source line is absent");

const at = 1_790_208_000_000;
const session = await sealSession({
  schema: "diamond-assistant-session/v1",
  id: "session_0013",
  title: "Saved guidance",
  titleSource: "automatic",
  manualTitleRevision: 0,
  createdAt: at,
  updatedAt: at + 1,
  reasoning: "medium",
  revision: 1,
  digest: "",
  messages: [{ id: "message_0013", turnId: "turn_0013", role: "user", text: "Where is Export?", at }],
  turns: [{ id: "turn_0013", jobId: "job_0013", status: "failed", reasoning: "medium", at, acceptedAt: at, endedAt: at + 1, contextIds: [], error: "Connection unavailable.", usage: null }],
} satisfies Session);
equal((await validateSession(session)).id, session.id, "existing saved-session schema remains valid after the catalog fact update");

const result = { status: "PASS", checks, checkCount: checks.length, realProviderCalls: 0, externalCalls: 0 };
writeFileSync(`${output}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
